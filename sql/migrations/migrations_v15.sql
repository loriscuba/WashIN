-- migrations_v15.sql
-- Tabella DDT (Documento di Trasporto) con supporto tracking TNT

CREATE TABLE IF NOT EXISTS ddt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ddt    text,
  data_ddt      date DEFAULT CURRENT_DATE,
  contratto_id  uuid REFERENCES contratti(id),
  cliente_id    uuid REFERENCES clienti(id),
  sede_id       uuid REFERENCES sedi_cliente(id),
  descrizione   text,
  quantita      numeric,
  unita_misura  text,
  stato         text CHECK (stato IN ('bozza','emesso','consegnato','annullato')) DEFAULT 'bozza',
  note          text,
  tnt_url       text,
  tnt_dati      jsonb,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE ddt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all" ON ddt FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Nel caso la tabella esistesse già senza queste colonne:
ALTER TABLE ddt ADD COLUMN IF NOT EXISTS tnt_url  text;
ALTER TABLE ddt ADD COLUMN IF NOT EXISTS tnt_dati jsonb;
