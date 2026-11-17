-- migrations_v14.sql
-- Colonne mancanti su sedi_cliente: contratto_id, lat, lng

-- 1. Collega ogni sede al contratto (era previsto da demo_data.sql ma mai migrato)
ALTER TABLE sedi_cliente ADD COLUMN IF NOT EXISTS contratto_id uuid REFERENCES contratti(id);

-- 2. Coordinate geografiche per la mappa del cruscotto
ALTER TABLE sedi_cliente ADD COLUMN IF NOT EXISTS lat  double precision;
ALTER TABLE sedi_cliente ADD COLUMN IF NOT EXISTS lng  double precision;

-- 3. Indice per velocizzare le query di geocodifica (sedi senza coordinate)
CREATE INDEX IF NOT EXISTS sedi_cliente_lat_null_idx ON sedi_cliente (id) WHERE lat IS NULL;
