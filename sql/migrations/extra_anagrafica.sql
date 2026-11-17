-- Migration: Aggiunte piva e provincia a clienti
ALTER TABLE clienti
  ADD COLUMN IF NOT EXISTS piva VARCHAR(20),
  ADD COLUMN IF NOT EXISTS provincia VARCHAR(5);
