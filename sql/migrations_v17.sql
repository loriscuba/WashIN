-- migrations_v17.sql
-- Permetti profili senza account auth (HR-only records)

-- 1. Rendi id auto-generato (era obbligatorio passarlo uguale a auth.users.id)
ALTER TABLE profili ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Rimuovi FK verso auth.users per consentire record solo-HR
--    (gli utenti con login continuano a funzionare: il trigger di signup
--     li inserisce normalmente, ma ora si può creare anche senza auth)
ALTER TABLE profili DROP CONSTRAINT IF EXISTS profili_id_fkey;
ALTER TABLE profili DROP CONSTRAINT IF EXISTS profili_pkey CASCADE;
ALTER TABLE profili ADD PRIMARY KEY (id);
