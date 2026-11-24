-- Tabella impostazioni globali (chiave-valore)
CREATE TABLE IF NOT EXISTS impostazioni (
  chiave          text PRIMARY KEY,
  valore          text,
  aggiornato_a    timestamptz DEFAULT now()
);

ALTER TABLE impostazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impostazioni_auth" ON impostazioni
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Default: coefficiente abilitato
INSERT INTO impostazioni (chiave, valore)
  VALUES ('preventivi_usa_coefficiente', 'true')
  ON CONFLICT (chiave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
