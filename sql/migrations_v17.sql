-- migrations_v17.sql
-- Permetti profili senza account auth (HR-only records)

-- 1. Rendi id auto-generato (era obbligatorio passarlo uguale a auth.users.id)
ALTER TABLE profili ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Rimuovi solo il FK verso auth.users (NON toccare la PK per non cascadare le FK da interventi)
ALTER TABLE profili DROP CONSTRAINT IF EXISTS profili_id_fkey;
