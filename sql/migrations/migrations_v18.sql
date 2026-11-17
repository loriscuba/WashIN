-- migrations_v18.sql
-- Aggiunge costo_mensile e ore_mensili_contratto a profili
-- Ripristina FK da interventi → profili se eliminate dal DROP CASCADE di v17

ALTER TABLE profili ADD COLUMN IF NOT EXISTS costo_mensile          numeric(10,2) DEFAULT 0;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS ore_mensili_contratto  numeric(5,1)  DEFAULT 160;

-- Ripristina FK nel caso il vecchio migrations_v17 (DROP CASCADE) le avesse eliminate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interventi_operatore_id_fkey' AND conrelid = 'interventi'::regclass
  ) THEN
    ALTER TABLE interventi ADD CONSTRAINT interventi_operatore_id_fkey
      FOREIGN KEY (operatore_id) REFERENCES profili(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interventi_operatore2_id_fkey' AND conrelid = 'interventi'::regclass
  ) THEN
    ALTER TABLE interventi ADD CONSTRAINT interventi_operatore2_id_fkey
      FOREIGN KEY (operatore2_id) REFERENCES profili(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'buste_paga_operatore_id_fkey' AND conrelid = 'buste_paga'::regclass
  ) THEN
    ALTER TABLE buste_paga ADD CONSTRAINT buste_paga_operatore_id_fkey
      FOREIGN KEY (operatore_id) REFERENCES profili(id) ON DELETE CASCADE;
  END IF;
END $$;
