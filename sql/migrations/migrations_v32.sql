-- migrations_v32: campo interno/scala per sedi_cliente
ALTER TABLE sedi_cliente ADD COLUMN IF NOT EXISTS interno text;
