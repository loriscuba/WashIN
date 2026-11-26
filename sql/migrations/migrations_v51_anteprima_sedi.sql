-- migrations_v51_anteprima_sedi: ANTEPRIMA (sola lettura, non modifica nulla)
--
-- Da lanciare PRIMA della v51. Mostra, contratto per contratto, cosa farebbe la v51:
--   crea            -> verrà creata la sede con nome = nome del condominio
--   collega         -> esiste già una sede con quel nome per il cliente, senza contratto: viene collegata
--   già presente    -> il contratto ha già una sede: non si tocca
--   DUBBIO ...      -> NON viene creata nulla: controllare a mano
-- I contratti dei clienti non condominio senza civico nel nome non compaiono (esclusi).
--
-- Regola "condominio": cliente di tipo 'condominio' e nome che contiene un numero civico
-- (es. "Aurelia 58", "Corosu 15-17"), senza punti di domanda.

WITH k AS (
  SELECT k.id AS contratto_id, k.numero_contratto, k.stato, c.id AS cliente_id, c.tipo,
         trim(coalesce(nullif(trim(c.nome_breve), ''), c.ragione_sociale)) AS nome
  FROM public.contratti k
  JOIN public.clienti c ON c.id = k.cliente_id
),
v AS (
  SELECT k.*,
         (k.tipo = 'condominio') AS is_cond,
         (k.nome ~ '[0-9]' AND k.nome !~ '\?') AS ha_civico,
         EXISTS (SELECT 1 FROM public.sedi_cliente s WHERE s.contratto_id = k.contratto_id) AS ha_sede,
         EXISTS (SELECT 1 FROM public.sedi_cliente s
                 WHERE s.contratto_id IS NULL AND s.cliente_id = k.cliente_id
                   AND public.normalizza_nome(s.nome_sede) = public.normalizza_nome(k.nome)) AS sede_libera
  FROM k
)
SELECT CASE
         WHEN is_cond AND ha_civico AND ha_sede      THEN 'già presente'
         WHEN is_cond AND ha_civico AND sede_libera  THEN 'collega'
         WHEN is_cond AND ha_civico                  THEN 'crea'
         WHEN is_cond                                THEN 'DUBBIO: condominio senza civico o con ? (non creata)'
         ELSE                                             'DUBBIO: civico ma cliente non condominio (non creata)'
       END AS esito,
       nome, numero_contratto, stato, coalesce(tipo, '(vuoto)') AS tipo_cliente
FROM v
WHERE is_cond OR ha_civico
ORDER BY 1, lower(nome);
