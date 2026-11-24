-- migrations_v19b.sql
-- Aggiungi livello CCNL ai profili operatori (usato per auto-compilare il preventivo)
ALTER TABLE profili ADD COLUMN IF NOT EXISTS livello_ccnl text;
