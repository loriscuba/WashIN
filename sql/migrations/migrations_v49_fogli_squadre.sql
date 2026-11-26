-- migrations_v49: fogli ore di squadra
--
-- Da incollare nel SQL Editor DOPO v47 (fogli ore) e v48 (squadre). Idempotente.
--
--   * un operatore sta in una sola squadra (indice unico su squadre_operatori.operatore_id)
--   * fogli_ore può essere di una squadra: squadra_id valorizzato, operatore_id vuoto
--     (foglio unico) oppure valorizzato (foglio del singolo componente)
--   * fogli_ore.componenti: i componenti della squadra al momento della stampa
--   * ore_rendicontate: dal foglio unico di squadra nasce una riga per ogni componente
--     presente (una X da 45' con 2 persone = 45' a testa), quindi l'indice unico
--     del foglio comprende anche l'operatore
--   * v_rendiconto_contratti_mese: "interventi" conta le X, non le persone

-- ── 1. Un operatore in una sola squadra ─────────────────────────────────────
DO $$
DECLARE doppi text;
BEGIN
  SELECT string_agg(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, ''), ', ')
    INTO doppi
  FROM (SELECT operatore_id FROM public.squadre_operatori GROUP BY 1 HAVING count(*) > 1) d
  JOIN public.profili p ON p.id = d.operatore_id;
  IF doppi IS NOT NULL THEN
    RAISE EXCEPTION 'Questi operatori sono in più squadre, lasciali in una sola e rilancia: %', doppi;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS squadre_operatori_una_squadra_uq ON public.squadre_operatori (operatore_id);

-- ── 2. Fogli di squadra ─────────────────────────────────────────────────────
ALTER TABLE public.fogli_ore ADD COLUMN IF NOT EXISTS squadra_id uuid REFERENCES public.squadre(id) ON DELETE SET NULL;
ALTER TABLE public.fogli_ore ADD COLUMN IF NOT EXISTS componenti uuid[];
ALTER TABLE public.fogli_ore ALTER COLUMN operatore_id DROP NOT NULL;
ALTER TABLE public.fogli_ore DROP CONSTRAINT IF EXISTS fogli_ore_operatore_o_squadra;
ALTER TABLE public.fogli_ore ADD CONSTRAINT fogli_ore_operatore_o_squadra
  CHECK (operatore_id IS NOT NULL OR squadra_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS fogli_ore_squadra_idx ON public.fogli_ore (settimana_inizio, squadra_id);

-- ── 3. Ore: una riga per persona anche dal foglio di squadra ────────────────
DROP INDEX IF EXISTS public.ore_rendicontate_foglio_uq;
CREATE UNIQUE INDEX IF NOT EXISTS ore_rendicontate_foglio_op_uq
  ON public.ore_rendicontate (foglio_id, riga, data, coalesce(operatore_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE foglio_id IS NOT NULL;

-- ── 4. Riepilogo: gli interventi sono le X, le ore sono quelle delle persone ─
DROP VIEW IF EXISTS public.v_rendiconto_contratti_mese;
CREATE VIEW public.v_rendiconto_contratti_mese
WITH (security_invoker = true) AS
WITH ore AS (
  SELECT contratto_id,
         date_trunc('month', data)::date                AS mese,
         count(DISTINCT coalesce(foglio_id::text || '|' || riga || '|' || data, id::text)) AS interventi,
         sum(minuti)                                    AS minuti,
         sum(minuti_previsti)                           AS minuti_previsti_interventi,
         sum(minuti - minuti_previsti) FILTER (WHERE minuti_previsti IS NOT NULL) AS minuti_extra,
         count(DISTINCT coalesce(foglio_id::text || '|' || riga || '|' || data, id::text)) FILTER (WHERE variazione) AS variazioni
  FROM public.ore_rendicontate
  GROUP BY 1, 2
),
previste AS (
  SELECT contratto_id, round(sum(ore_mensili), 2) AS ore_previste_mese
  FROM public.contratti_servizi
  GROUP BY 1
)
SELECT o.contratto_id,
       o.mese,
       k.numero_contratto,
       coalesce(c.nome_breve, c.ragione_sociale)         AS condominio,
       o.interventi,
       o.variazioni,
       round(o.minuti / 60.0, 2)                         AS ore_rendicontate,
       round(o.minuti_previsti_interventi / 60.0, 2)     AS ore_previste_interventi,
       round(o.minuti_extra / 60.0, 2)                   AS ore_extra,
       p.ore_previste_mese,
       round(o.minuti / 60.0 - coalesce(p.ore_previste_mese, 0), 2) AS scostamento_ore
FROM ore o
JOIN public.contratti k ON k.id = o.contratto_id
LEFT JOIN public.clienti c ON c.id = k.cliente_id
LEFT JOIN previste p ON p.contratto_id = o.contratto_id;

REVOKE ALL ON public.v_rendiconto_contratti_mese FROM anon;
GRANT SELECT ON public.v_rendiconto_contratti_mese TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'v49 ok' AS esito;
