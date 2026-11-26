-- migrations_v51_sedi_condomini: una sede per ogni contratto di condominio
--
-- Per questo cliente ogni contratto ha una sola sede: per i soli condomini crea la sede
-- con nome_sede = nome del condominio (clienti.nome_breve, es. "Aurelia 58"), collegata
-- a cliente e contratto. Agli altri contratti non viene creata nessuna sede.
-- Prima lanciare migrations_v51_anteprima_sedi.sql per vedere cosa succede.
--
-- Regola "condominio": cliente di tipo 'condominio' e nome con un numero civico,
-- senza punti di domanda. I nomi dubbi (es. "Le azalee", "Consorzio") restano senza
-- sede: si aggiungono a mano dalla sezione Sedi.
-- Idempotente: un contratto che ha già una sede non viene toccato; se esiste già una
-- sede con lo stesso nome per il cliente ma senza contratto, viene collegata invece di
-- crearne una doppia. L'indirizzo resta vuoto (via e città vanno completate a mano).

DO $sedi$
BEGIN
  CREATE TEMP TABLE _v51 ON COMMIT DROP AS
  SELECT k.id AS contratto_id, c.id AS cliente_id,
         trim(coalesce(nullif(trim(c.nome_breve), ''), c.ragione_sociale)) AS nome
  FROM public.contratti k
  JOIN public.clienti c ON c.id = k.cliente_id
  WHERE c.tipo = 'condominio'
    AND trim(coalesce(nullif(trim(c.nome_breve), ''), c.ragione_sociale)) ~ '[0-9]'
    AND trim(coalesce(nullif(trim(c.nome_breve), ''), c.ragione_sociale)) !~ '\?'
    AND NOT EXISTS (SELECT 1 FROM public.sedi_cliente s WHERE s.contratto_id = k.id);

  -- 1. Collega le sedi già esistenti con lo stesso nome e senza contratto
  --    (una sola sede per contratto, anche se ce ne fossero più omonime)
  UPDATE public.sedi_cliente s
  SET contratto_id = x.contratto_id
  FROM (
    SELECT DISTINCT ON (v.contratto_id) v.contratto_id, s2.id AS sede_id
    FROM _v51 v
    JOIN public.sedi_cliente s2
      ON s2.contratto_id IS NULL AND s2.cliente_id = v.cliente_id
     AND public.normalizza_nome(s2.nome_sede) = public.normalizza_nome(v.nome)
    ORDER BY v.contratto_id, s2.created_at
  ) x
  WHERE s.id = x.sede_id
    AND s.contratto_id IS NULL;

  -- 2. Crea le sedi mancanti
  INSERT INTO public.sedi_cliente (cliente_id, contratto_id, nome_sede)
  SELECT v.cliente_id, v.contratto_id, v.nome
  FROM _v51 v
  WHERE NOT EXISTS (SELECT 1 FROM public.sedi_cliente s WHERE s.contratto_id = v.contratto_id);
END
$sedi$;

SELECT 'ok' AS esito,
       (SELECT count(*) FROM public.sedi_cliente s
          JOIN public.contratti k ON k.id = s.contratto_id
          JOIN public.clienti c ON c.id = k.cliente_id
         WHERE c.tipo = 'condominio') AS sedi_condomini_totali;
