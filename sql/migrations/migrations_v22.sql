-- migrations_v22.sql
-- Aggiunge colonna operatori_json a preventivi per gestione multi-operatore

ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS operatori_json jsonb DEFAULT '[]';

-- Ricarica schema cache PostgREST
NOTIFY pgrst, 'reload schema';
