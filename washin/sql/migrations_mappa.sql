-- Aggiunge coordinate geografiche alle sedi per la mappa interventi
ALTER TABLE sedi_cliente
  ADD COLUMN IF NOT EXISTS lat FLOAT,
  ADD COLUMN IF NOT EXISTS lng FLOAT;
