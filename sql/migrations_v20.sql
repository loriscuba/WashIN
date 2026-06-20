-- migrations_v20.sql
-- Colonne mancanti su profili (data_nascita + colonne v19/v19b in caso non eseguite)

ALTER TABLE profili ADD COLUMN IF NOT EXISTS data_nascita          date;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS voce_tariffa_inail    text DEFAULT '0411';
ALTER TABLE profili ADD COLUMN IF NOT EXISTS livello_ccnl          text;

-- Ricarica schema cache PostgREST (eseguire dopo le ALTER TABLE)
-- In alternativa: Supabase Dashboard → Settings → API → Reload schema
NOTIFY pgrst, 'reload schema';
