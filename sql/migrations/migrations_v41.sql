-- migrations_v41: controllo admin corretto e permessi più stretti
--
-- ⚠️  Da applicare in produzione SOLO dopo l'ok esplicito di Loris.
-- Idempotente: si può rilanciare senza rischi.
--
-- Problemi corretti
--   1. Le funzioni admin e due policy riconoscevano l'admin con
--      profili.id = auth.uid(). Dalla v24 il collegamento all'account è
--      profili.user_id, quindi un admin con id ≠ user_id riceveva "Accesso negato".
--   2. Le policy "operatori_interventi_*" confrontavano operatore_id (profili.id)
--      con auth.uid(), per lo stesso motivo non trovavano mai l'operatore.
--   3. get_auth_user_ids() restituiva gli id di tutti gli account anche a chi non
--      ha fatto login. Ora risponde solo agli admin.
--   4. Tutte le funzioni erano eseguibili dal ruolo anon (chi non ha fatto login).
--   5. magazzino, veicoli e veicoli_documenti avevano policy "allow_all" per il
--      ruolo public: chiunque con la chiave pubblica poteva leggere, modificare e
--      cancellare. Gli utenti loggati restano coperti da "auth_users_all".
--   6. search_path non fissato su calcola_costo_operatore e set_aggiornato_a.

-- ── 1. Helper ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profili
    WHERE user_id = auth.uid() AND ruolo = 'admin'
  );
$$;

-- profili.id dell'utente loggato (NULL se non ha un profilo)
CREATE OR REPLACE FUNCTION public.current_profilo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profili WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── 2. Funzioni admin ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_confirm_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
  END IF;
  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'La password deve essere di almeno 6 caratteri';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun account di accesso trovato per questo utente. Crea prima l''account dalla sezione Utenti → Nuovo utente.';
  END IF;
END;
$$;

-- Usata solo da admin/utenti.js: ai non admin restituisce un elenco vuoto
CREATE OR REPLACE FUNCTION public.get_auth_user_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM auth.users u WHERE public.is_admin();
$$;

-- ── 3. search_path fisso ────────────────────────────────────────────────────
ALTER FUNCTION public.calcola_costo_operatore(text, text, numeric, numeric, numeric, numeric, numeric, boolean, date, integer, numeric)
  SET search_path = public;
ALTER FUNCTION public.set_aggiornato_a() SET search_path = public;

-- ── 4. Permessi di esecuzione ───────────────────────────────────────────────
-- Funzioni chiamate dall'app: solo utenti loggati
REVOKE EXECUTE ON FUNCTION public.is_admin()                                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_profilo_id()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_user(uuid)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_ids()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calcola_costo_operatore(text, text, numeric, numeric, numeric, numeric, numeric, boolean, date, integer, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin()                                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_profilo_id()                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_confirm_user(uuid)                  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_auth_user_ids()                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.calcola_costo_operatore(text, text, numeric, numeric, numeric, numeric, numeric, boolean, date, integer, numeric) TO authenticated;

-- Funzioni trigger: nessuno deve poterle chiamare via API (i trigger funzionano lo stesso)
REVOKE EXECUTE ON FUNCTION public.handle_new_user()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_profile_after_signup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_aggiornato_a()            FROM PUBLIC, anon, authenticated;

-- ── 5. Policy che usavano profili.id = auth.uid() ───────────────────────────
DROP POLICY IF EXISTS admin_interventi_all ON interventi;
CREATE POLICY admin_interventi_all ON interventi
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS operatori_interventi_select ON interventi;
CREATE POLICY operatori_interventi_select ON interventi
  FOR SELECT TO authenticated
  USING (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id());

DROP POLICY IF EXISTS operatori_interventi_update ON interventi;
CREATE POLICY operatori_interventi_update ON interventi
  FOR UPDATE TO authenticated
  USING (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id())
  WITH CHECK (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id());

DROP POLICY IF EXISTS "Admin full access on modelli_contratto" ON modelli_contratto;
CREATE POLICY "Admin full access on modelli_contratto" ON modelli_contratto
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 6. Niente accesso anonimo a magazzino e veicoli ─────────────────────────
DROP POLICY IF EXISTS allow_all_magazzino         ON magazzino;
DROP POLICY IF EXISTS allow_all_veicoli           ON veicoli;
DROP POLICY IF EXISTS allow_all_veicoli_documenti ON veicoli_documenti;

-- Nota: quasi tutte le altre tabelle hanno ancora "auth_users_all" (USING true):
-- ogni utente loggato, anche un operatore, può leggere e modificare tutto
-- (buste paga, IBAN, codici fiscali). Restringerle è un lavoro a parte perché
-- va verificato schermata per schermata cosa serve all'area operatore.
