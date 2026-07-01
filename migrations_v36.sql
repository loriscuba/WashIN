-- Migration v36: sezioni_admin
CREATE TABLE IF NOT EXISTS sezioni_admin (
  sezione   text PRIMARY KEY,
  etichetta text NOT NULL,
  abilitata boolean NOT NULL DEFAULT true
);

INSERT INTO sezioni_admin (sezione, etichetta, abilitata) VALUES
  ('clienti',               'Clienti',               true),
  ('interventi',            'Interventi',             true),
  ('gestione-anagrafica',   'Dipendenti',             true),
  ('preventivi',            'Preventivi',             true),
  ('fatture',               'Fatture',                true),
  ('presenze',              'Presenze',               true),
  ('magazzino',             'Magazzino',              true),
  ('veicoli',               'Veicoli',                true),
  ('tool-import',           'Tool Import',            true),
  ('parametri-ccnl',        'Parametri CCNL',         true),
  ('tariffe-inail',         'Tariffe INAIL',          true),
  ('coefficienti-rischio',  'Coefficienti Appalto',   true),
  ('incidenza-reale',       'Incidenza Reale',        true),
  ('algoritmo-costi',       'Algoritmo Costi',        true),
  ('email-cedolini',        'Email Cedolini',         true),
  ('fornitori',             'Fornitori',              true)
ON CONFLICT DO NOTHING;

ALTER TABLE sezioni_admin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all" ON sezioni_admin
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
