-- WashIN v2 migrations
-- Run on Supabase SQL Editor

CREATE TABLE IF NOT EXISTS materiali_intervento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervento_id uuid REFERENCES interventi(id) ON DELETE CASCADE,
  prodotto text NOT NULL,
  quantita numeric DEFAULT 1,
  unita text DEFAULT 'lt',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preventivi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clienti(id),
  numero_preventivo text,
  data_emissione date DEFAULT CURRENT_DATE,
  data_validita date,
  importo numeric DEFAULT 0,
  ore_stimate numeric DEFAULT 0,
  tipo_servizio text,
  frequenza text DEFAULT 'settimanale',
  stato text DEFAULT 'bozza',
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifiche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utente_id uuid REFERENCES profili(id) ON DELETE CASCADE,
  messaggio text NOT NULL,
  tipo text DEFAULT 'info',
  letto boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS (Row Level Security) - adjust to your policies
ALTER TABLE materiali_intervento ENABLE ROW LEVEL SECURITY;
ALTER TABLE preventivi ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifiche ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "allow_all_materiali" ON materiali_intervento FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_preventivi" ON preventivi FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all_notifiche" ON notifiche FOR ALL USING (true) WITH CHECK (true);
