-- migrations_v52: GIRI delle squadre (settimanali o mensili)
--
-- Da incollare nel SQL Editor DOPO v48 e v50. Idempotente, non tocca dati esistenti.
--
--   giri            un giro appartiene a una squadra e si ripete:
--                     cadenza 'settimana': nei giorni scelti, ogni N settimane (contate da "dal")
--                     cadenza 'mese':      nei giorni scelti, solo nelle settimane del mese scelte
--                                          (1 = giorni 1-7, 2 = 8-14, 3 = 15-21, 4 = 22-28, 5 = ultima)
--   giri_contratti  contratti (ed eventualmente il servizio) che fanno parte del giro, in ordine
--   interventi.giro_id  l'intervento creato da "Genera settimana" ricorda il suo giro

-- ── 1. Giri ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.giri (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  squadra_id       uuid REFERENCES public.squadre(id) ON DELETE SET NULL,
  cadenza          text NOT NULL DEFAULT 'settimana' CHECK (cadenza IN ('settimana', 'mese')),
  giorni           smallint[] NOT NULL DEFAULT '{}',   -- 1 = lunedì … 6 = sabato
  ogni_settimane   smallint NOT NULL DEFAULT 1 CHECK (ogni_settimane BETWEEN 1 AND 8),
  settimane_mese   smallint[] NOT NULL DEFAULT '{}',   -- solo cadenza 'mese': 1-4, 5 = ultima
  dal              date NOT NULL DEFAULT current_date,
  al               date,
  attivo           boolean NOT NULL DEFAULT true,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (al IS NULL OR al >= dal)
);
CREATE UNIQUE INDEX IF NOT EXISTS giri_nome_uq ON public.giri (lower(trim(nome)));
CREATE INDEX IF NOT EXISTS giri_squadra_idx ON public.giri (squadra_id);

-- ── 2. Contratti del giro ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.giri_contratti (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giro_id          uuid NOT NULL REFERENCES public.giri(id)               ON DELETE CASCADE,
  contratto_id     uuid NOT NULL REFERENCES public.contratti(id)          ON DELETE CASCADE,
  servizio_id      uuid          REFERENCES public.contratti_servizi(id)  ON DELETE SET NULL,  -- NULL = contratto intero
  ordine           integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS giri_contratti_uq
  ON public.giri_contratti (giro_id, contratto_id, coalesce(servizio_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS giri_contratti_contratto_idx ON public.giri_contratti (contratto_id);

-- ── 3. Interventi generati dal giro ─────────────────────────────────────────
ALTER TABLE public.interventi ADD COLUMN IF NOT EXISTS giro_id uuid REFERENCES public.giri(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS interventi_giro_idx ON public.interventi (giro_id, data_pianificata);

-- ── 4. Permessi: admin tutto, l'operatore vede i giri della sua squadra ─────
ALTER TABLE public.giri           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giri_contratti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all ON public.giri;
CREATE POLICY admin_all ON public.giri
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS admin_all ON public.giri_contratti;
CREATE POLICY admin_all ON public.giri_contratti
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS op_select ON public.giri;
CREATE POLICY op_select ON public.giri
  FOR SELECT TO authenticated
  USING (squadra_id IS NOT NULL AND squadra_id = public.mia_squadra_id());
DROP POLICY IF EXISTS op_select ON public.giri_contratti;
CREATE POLICY op_select ON public.giri_contratti
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.giri g
                 WHERE g.id = giri_contratti.giro_id
                   AND g.squadra_id IS NOT NULL AND g.squadra_id = public.mia_squadra_id()));

REVOKE ALL ON public.giri, public.giri_contratti FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giri, public.giri_contratti TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'v52 ok' AS esito;
