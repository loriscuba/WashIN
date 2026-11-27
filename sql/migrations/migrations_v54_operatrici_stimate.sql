-- v54: numero di operatrici stimate sul contratto (idempotente, si può rieseguire)
--
--   * contratti.operatrici_stimate: quante operatrici sono previste per ogni intervento.
--     I minuti delle righe servizio restano "a testa": 45' con 2 operatrici = 1h30 di lavoro.
--     Vuoto = non indicato: ogni X vale i minuti della riga per chi l'ha fatta (come prima).
--   * All'import dei fogli ore il lavoro dell'intervento (minuti x operatrici stimate)
--     si divide tra le persone che quel giorno l'hanno davvero fatto, anche su fogli diversi:
--     45' x 2 fatto da una sola = 1h30 sul suo cartellino; fatto in due = 45' a testa.
--   * v_rendiconto_contratti_mese: le ore previste al mese contano le operatrici stimate.

ALTER TABLE public.contratti ADD COLUMN IF NOT EXISTS operatrici_stimate smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratti_operatrici_stimate_chk') THEN
    ALTER TABLE public.contratti ADD CONSTRAINT contratti_operatrici_stimate_chk
      CHECK (operatrici_stimate IS NULL OR operatrici_stimate BETWEEN 1 AND 9);
  END IF;
END $$;

COMMENT ON COLUMN public.contratti.operatrici_stimate IS
  'Operatrici previste per intervento; i minuti delle righe servizio sono a testa. NULL = non indicato (1).';

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
  SELECT s.contratto_id, round(sum(s.ore_mensili) * coalesce(max(k.operatrici_stimate), 1), 2) AS ore_previste_mese
  FROM public.contratti_servizi s
  JOIN public.contratti k ON k.id = s.contratto_id
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

SELECT 'v54 ok' AS esito;
