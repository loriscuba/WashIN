-- migrations_v45: numero ai contratti importati dall'elenco condomini
--
-- I contratti creati dalla v44 non avevano numero_contratto, quindi in Anagrafica
-- clienti comparivano con il titolo vuoto ("—"). Questa migrazione assegna
-- C-001, C-002, ... in ordine alfabetico di nome condominio, solo ai contratti
-- importati ancora senza numero. Idempotente; i numeri si possono cambiare a mano.

WITH da_numerare AS (
  SELECT k.id,
         row_number() OVER (ORDER BY lower(coalesce(c.nome_breve, c.ragione_sociale))) AS n
  FROM public.contratti k
  JOIN public.clienti c ON c.id = k.cliente_id
  WHERE k.fonte_import = 'elenco-condomini-2026-11'
    AND (k.numero_contratto IS NULL OR trim(k.numero_contratto) = '')
),
base AS (
  -- riparte dal numero più alto già usato con questo formato
  SELECT coalesce(max(substring(numero_contratto FROM '^C-(\d+)$')::int), 0) AS ultimo
  FROM public.contratti
)
UPDATE public.contratti k
SET numero_contratto = 'C-' || lpad((base.ultimo + d.n)::text, 3, '0')
FROM da_numerare d, base
WHERE k.id = d.id;

SELECT count(*) FILTER (WHERE numero_contratto IS NOT NULL) AS con_numero,
       count(*) AS importati
FROM public.contratti WHERE fonte_import = 'elenco-condomini-2026-11';
