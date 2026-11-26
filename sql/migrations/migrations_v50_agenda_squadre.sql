-- migrations_v50: agenda settimanale delle squadre
--
-- Da incollare nel SQL Editor DOPO v42 e v48. Idempotente.
--
--   * interventi.servizio_id: l'intervento generato dall'agenda sa a quale servizio
--     del contratto si riferisce (scale, vetri…)
--   * l'operatore vede anche gli interventi assegnati alla SUA squadra (oltre a quelli
--     in cui è operatore 1 o 2), così compaiono nell'app

ALTER TABLE public.interventi ADD COLUMN IF NOT EXISTS servizio_id uuid REFERENCES public.contratti_servizi(id) ON DELETE SET NULL;

-- Squadra dell'operatore loggato (un operatore sta in una sola squadra, v49)
CREATE OR REPLACE FUNCTION public.mia_squadra_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT squadra_id FROM squadre_operatori WHERE operatore_id = public.current_profilo_id() LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.mia_squadra_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mia_squadra_id() TO authenticated;

-- Interventi dell'operatore: propri o della sua squadra (usata dalle policy di sedi,
-- contratti, clienti, checklist e materiali, v42)
CREATE OR REPLACE FUNCTION public.miei_interventi_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM interventi
  WHERE operatore_id  = public.current_profilo_id()
     OR operatore2_id = public.current_profilo_id()
     OR (squadra_id IS NOT NULL AND squadra_id = public.mia_squadra_id());
$$;

DROP POLICY IF EXISTS op_select ON public.interventi;
CREATE POLICY op_select ON public.interventi
  FOR SELECT TO authenticated
  USING (operatore_id = public.current_profilo_id() OR operatore2_id = public.current_profilo_id()
         OR (squadra_id IS NOT NULL AND squadra_id = public.mia_squadra_id()));

-- La modifica (avvio/stop, ore) resta a operatore 1 e 2 dell'intervento:
-- l'agenda li compila con i primi due componenti della squadra (capo squadra per primo).

NOTIFY pgrst, 'reload schema';

SELECT 'v50 ok' AS esito;
