-- migrations_v30: fonte costo preventivi per dipendente
-- Valori: 'consuntivo' | 'busta' | NULL (non configurato)
ALTER TABLE profili ADD COLUMN IF NOT EXISTS fonte_costo_preventivo text
  CHECK (fonte_costo_preventivo IN ('consuntivo', 'busta'));
