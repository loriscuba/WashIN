-- migrations_v42: permessi per ruolo (admin vede tutto, operatore solo il suo)
--
-- ⚠️  Da applicare in produzione SOLO dopo l'ok esplicito di Loris, e DOPO la v41
--     (usa is_admin() e current_profilo_id()). Idempotente.
--
-- Prima: quasi ogni tabella aveva "auth_users_all" (USING true), quindi qualunque
-- operatore loggato poteva leggere e modificare buste paga, IBAN, codici fiscali,
-- fatture e perfino la password SMTP in impostazioni.
--
-- Dopo: ogni tabella ha "admin_all" (solo admin). L'operatore riceve soltanto
-- quello che usa l'area operatore (washin/js/operatore/*), verificato file per file:
--
--   tabella                lettura                         scrittura
--   ─────────────────────  ──────────────────────────────  ─────────────────────────
--   profili                il proprio                      — (avatar via RPC)
--   interventi             i propri (op1 o op2)            i propri
--   sedi_cliente           quelle dei propri interventi    —
--   contratti              quelli dei propri interventi    —
--   clienti                quelli dei propri interventi    —
--   checklist_template     tutte                           —
--   checklist_compilate    dei propri interventi           dei propri interventi
--   materiali_intervento   dei propri interventi           dei propri interventi
--   magazzino              tutto (catalogo materiali)      —
--   presenze_giornaliere   le proprie                      le proprie
--   buste_paga             le proprie                      —
--   notifiche              le proprie                      segnare come lette
--   sezioni_operatore      tutte                           —
--   impostazioni           solo "modalita_intervento"      —
--   storage buste-paga     i PDF delle proprie buste       —
--
-- Tutto il resto è solo per gli admin.

-- ── 0. Helper ───────────────────────────────────────────────────────────────
-- Interventi dell'operatore loggato. SECURITY DEFINER: evita di rivalutare le
-- policy di interventi dentro le policy delle altre tabelle.
CREATE OR REPLACE FUNCTION public.miei_interventi_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM interventi
  WHERE operatore_id  = public.current_profilo_id()
     OR operatore2_id = public.current_profilo_id();
$$;

-- Nome e cognome dei colleghi con cui l'operatore condivide un intervento
-- (l'agenda li mostra, ma l'operatore non può più leggere i loro profili).
CREATE OR REPLACE FUNCTION public.nomi_colleghi(ids uuid[])
RETURNS TABLE(id uuid, nome text, cognome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.cognome
  FROM profili p
  WHERE p.id = ANY(ids)
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM interventi i
        WHERE i.id IN (SELECT public.miei_interventi_ids())
          AND p.id IN (i.operatore_id, i.operatore2_id)
      )
    );
$$;

-- Aggiorna l'avatar del proprio profilo (sostituisce l'update diretto su profili,
-- che usava profili.id = id account e non trovava la riga degli operatori).
CREATE OR REPLACE FUNCTION public.aggiorna_mio_avatar(url text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profili SET avatar_url = url WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.miei_interventi_ids()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nomi_colleghi(uuid[])     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.aggiorna_mio_avatar(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.miei_interventi_ids()     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.nomi_colleghi(uuid[])     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.aggiorna_mio_avatar(text) TO authenticated;

-- ── 1. Via tutte le policy esistenti sulle tabelle public ──────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── 2. Admin: accesso completo a ogni tabella public (RLS sempre attivo) ────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;

-- ── 3. Operatore ────────────────────────────────────────────────────────────
CREATE POLICY op_select_self ON profili
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY op_select ON interventi
  FOR SELECT TO authenticated
  USING (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id());
CREATE POLICY op_update ON interventi
  FOR UPDATE TO authenticated
  USING      (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id())
  WITH CHECK (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id());

CREATE POLICY op_select ON sedi_cliente
  FOR SELECT TO authenticated
  USING (id IN (SELECT sede_id FROM interventi WHERE id IN (SELECT public.miei_interventi_ids())));

CREATE POLICY op_select ON contratti
  FOR SELECT TO authenticated
  USING (id IN (SELECT contratto_id FROM interventi WHERE id IN (SELECT public.miei_interventi_ids())));

CREATE POLICY op_select ON clienti
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT s.cliente_id FROM interventi i JOIN sedi_cliente s ON s.id = i.sede_id
           WHERE i.id IN (SELECT public.miei_interventi_ids()))
    OR
    id IN (SELECT c.cliente_id FROM interventi i JOIN contratti c ON c.id = i.contratto_id
           WHERE i.id IN (SELECT public.miei_interventi_ids()))
  );

CREATE POLICY op_select ON checklist_template
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY op_all ON checklist_compilate
  FOR ALL TO authenticated
  USING      (intervento_id IN (SELECT public.miei_interventi_ids()))
  WITH CHECK (intervento_id IN (SELECT public.miei_interventi_ids()));

CREATE POLICY op_all ON materiali_intervento
  FOR ALL TO authenticated
  USING      (intervento_id IN (SELECT public.miei_interventi_ids()))
  WITH CHECK (intervento_id IN (SELECT public.miei_interventi_ids()));

CREATE POLICY op_select ON magazzino
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY op_all ON presenze_giornaliere
  FOR ALL TO authenticated
  USING      (profilo_id = public.current_profilo_id())
  WITH CHECK (profilo_id = public.current_profilo_id());

CREATE POLICY op_select ON buste_paga
  FOR SELECT TO authenticated
  USING (operatore_id = public.current_profilo_id());

CREATE POLICY op_select ON notifiche
  FOR SELECT TO authenticated
  USING (utente_id = auth.uid());
CREATE POLICY op_update ON notifiche
  FOR UPDATE TO authenticated
  USING (utente_id = auth.uid())
  WITH CHECK (utente_id = auth.uid());

CREATE POLICY op_select ON sezioni_operatore
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY op_select ON impostazioni
  FOR SELECT TO authenticated
  USING (chiave = 'modalita_intervento');

-- ── 4. Storage ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth read buste-paga"           ON storage.objects;
DROP POLICY IF EXISTS "auth insert buste-paga"         ON storage.objects;
DROP POLICY IF EXISTS "auth delete buste-paga"         ON storage.objects;
DROP POLICY IF EXISTS buste_paga_select                ON storage.objects;
DROP POLICY IF EXISTS buste_paga_insert                ON storage.objects;
DROP POLICY IF EXISTS buste_paga_update                ON storage.objects;
DROP POLICY IF EXISTS buste_paga_delete                ON storage.objects;
DROP POLICY IF EXISTS allow_all_veicoli_docs_storage   ON storage.objects;
DROP POLICY IF EXISTS buste_paga_admin_all             ON storage.objects;
DROP POLICY IF EXISTS buste_paga_op_select             ON storage.objects;
DROP POLICY IF EXISTS veicoli_docs_admin_all           ON storage.objects;

CREATE POLICY buste_paga_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'buste-paga' AND public.is_admin())
  WITH CHECK (bucket_id = 'buste-paga' AND public.is_admin());

CREATE POLICY buste_paga_op_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'buste-paga'
    AND name IN (SELECT file_path FROM public.buste_paga
                 WHERE operatore_id = public.current_profilo_id() AND file_path IS NOT NULL)
  );

CREATE POLICY veicoli_docs_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'veicoli-docs' AND public.is_admin())
  WITH CHECK (bucket_id = 'veicoli-docs' AND public.is_admin());
