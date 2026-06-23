-- migrations_v25.sql
-- Aggiunge tipologia, reparto, tipo_retribuzione, posizione_inail a profili
-- per supportare il modello dati reale dei cedolini (operai, impiegati, amm.)

ALTER TABLE profili
  ADD COLUMN IF NOT EXISTS tipologia text
    CHECK (tipologia IN ('addetto_pulizie','operaio','impiegato','amministratore')),
  ADD COLUMN IF NOT EXISTS reparto text,
  ADD COLUMN IF NOT EXISTS tipo_retribuzione text
    CHECK (tipo_retribuzione IN ('oraria','giornaliera','mensile_fisso')),
  ADD COLUMN IF NOT EXISTS posizione_inail text;

-- Ricarica schema cache PostgREST
NOTIFY pgrst, 'reload schema';
