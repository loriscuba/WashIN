-- migrations_v46: più operatori per contratto
--
-- Da incollare nel SQL Editor dopo la v43. Idempotente.
-- Nuova tabella contratti_operatori (contratto ↔ operatore, molti a molti).
-- Gli operatori già assegnati in contratti.operatore_id vengono copiati qui.
-- contratti.operatore_id resta per compatibilità ma l'app non lo usa più.

CREATE TABLE IF NOT EXISTS public.contratti_operatori (
  contratto_id  uuid NOT NULL REFERENCES public.contratti(id) ON DELETE CASCADE,
  operatore_id  uuid NOT NULL REFERENCES public.profili(id)   ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contratto_id, operatore_id)
);
CREATE INDEX IF NOT EXISTS contratti_operatori_operatore_idx ON public.contratti_operatori (operatore_id);

INSERT INTO public.contratti_operatori (contratto_id, operatore_id)
SELECT id, operatore_id FROM public.contratti WHERE operatore_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.contratti_operatori ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all ON public.contratti_operatori;
CREATE POLICY admin_all ON public.contratti_operatori
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- L'operatore vede i contratti a cui è assegnato (solo la riga di collegamento)
DROP POLICY IF EXISTS op_select ON public.contratti_operatori;
CREATE POLICY op_select ON public.contratti_operatori
  FOR SELECT TO authenticated
  USING (operatore_id = public.current_profilo_id());

REVOKE ALL ON public.contratti_operatori FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratti_operatori TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT count(*) AS assegnazioni FROM public.contratti_operatori;
