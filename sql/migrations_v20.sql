-- migrations_v20.sql
-- Colonne mancanti su profili (data_nascita + colonne v19/v19b in caso non eseguite)

ALTER TABLE profili ADD COLUMN IF NOT EXISTS data_nascita          date;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS voce_tariffa_inail    text DEFAULT '0411';
ALTER TABLE profili ADD COLUMN IF NOT EXISTS livello_ccnl          text;

-- Vincolo UNIQUE su codice_fiscale (necessario per upsert onConflict)
-- Se fallisce ci sono CF duplicati: risolvere manualmente poi rieseguire
ALTER TABLE profili ADD CONSTRAINT profili_codice_fiscale_unique UNIQUE (codice_fiscale);

-- Ricarica schema cache PostgREST
NOTIFY pgrst, 'reload schema';
