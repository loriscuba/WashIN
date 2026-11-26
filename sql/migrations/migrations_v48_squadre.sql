-- migrations_v48: squadre di operatori e assegnazione (anche temporanea) ai contratti
--
-- Da incollare nel SQL Editor DOPO v41 (is_admin, current_profilo_id) e v46.
-- Idempotente, non tocca dati esistenti.
--
--   squadre               anagrafica: nome, colore (per l'agenda), capo squadra
--   squadre_operatori     componenti di ogni squadra
--   squadre_contratti     squadra assegnata a un contratto dal … al … (al vuoto = senza scadenza)
--   interventi.squadra_id per l'agenda settimanale: intervento assegnato a una squadra

-- ── 1. Squadre ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.squadre (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               text NOT NULL,
  colore             text NOT NULL DEFAULT '#0d9488',
  capo_squadra_id    uuid REFERENCES public.profili(id) ON DELETE SET NULL,
  attiva             boolean NOT NULL DEFAULT true,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS squadre_nome_uq ON public.squadre (lower(trim(nome)));

CREATE TABLE IF NOT EXISTS public.squadre_operatori (
  squadra_id         uuid NOT NULL REFERENCES public.squadre(id)  ON DELETE CASCADE,
  operatore_id       uuid NOT NULL REFERENCES public.profili(id)  ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (squadra_id, operatore_id)
);
CREATE INDEX IF NOT EXISTS squadre_operatori_operatore_idx ON public.squadre_operatori (operatore_id);

-- ── 2. Squadra ↔ contratto per un periodo ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.squadre_contratti (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squadra_id         uuid NOT NULL REFERENCES public.squadre(id)   ON DELETE CASCADE,
  contratto_id       uuid NOT NULL REFERENCES public.contratti(id)  ON DELETE CASCADE,
  dal                date NOT NULL DEFAULT current_date,
  al                 date,                         -- NULL = finché non viene tolta
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (al IS NULL OR al >= dal)
);
CREATE INDEX IF NOT EXISTS squadre_contratti_contratto_idx ON public.squadre_contratti (contratto_id, dal);
CREATE INDEX IF NOT EXISTS squadre_contratti_squadra_idx   ON public.squadre_contratti (squadra_id, dal);

-- ── 3. Interventi assegnati a una squadra (agenda) ──────────────────────────
ALTER TABLE public.interventi ADD COLUMN IF NOT EXISTS squadra_id uuid REFERENCES public.squadre(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS interventi_squadra_idx ON public.interventi (squadra_id, data_pianificata);

-- ── 4. Permessi: admin tutto, l'operatore vede le proprie squadre ───────────
ALTER TABLE public.squadre           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squadre_operatori ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squadre_contratti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all ON public.squadre;
CREATE POLICY admin_all ON public.squadre
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS admin_all ON public.squadre_operatori;
CREATE POLICY admin_all ON public.squadre_operatori
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS admin_all ON public.squadre_contratti;
CREATE POLICY admin_all ON public.squadre_contratti
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS op_select ON public.squadre_operatori;
CREATE POLICY op_select ON public.squadre_operatori
  FOR SELECT TO authenticated
  USING (operatore_id = public.current_profilo_id());

DROP POLICY IF EXISTS op_select ON public.squadre;
CREATE POLICY op_select ON public.squadre
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.squadre_operatori so
                 WHERE so.squadra_id = squadre.id
                   AND so.operatore_id = public.current_profilo_id()));

REVOKE ALL ON public.squadre, public.squadre_operatori, public.squadre_contratti FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squadre, public.squadre_operatori,
              public.squadre_contratti TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'v48 ok' AS esito;
