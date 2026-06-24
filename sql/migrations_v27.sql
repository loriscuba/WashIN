-- FIR individuale per operatore
ALTER TABLE profili ADD COLUMN IF NOT EXISTS fir_personale numeric(5,2);

NOTIFY pgrst, 'reload schema';
