-- WashIN v3 migrations
-- Run on Supabase SQL Editor

CREATE TABLE IF NOT EXISTS magazzino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  unita_misura text DEFAULT 'lt',
  descrizione text,
  quantita_disponibile numeric DEFAULT 0,
  attivo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE magazzino ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "allow_all_magazzino" ON magazzino FOR ALL USING (true) WITH CHECK (true);
