-- migrations_v34.sql — Visibilità sezioni dashboard operatore

CREATE TABLE IF NOT EXISTS sezioni_operatore (
  sezione   text PRIMARY KEY,
  etichetta text NOT NULL,
  abilitata boolean NOT NULL DEFAULT true
);

INSERT INTO sezioni_operatore (sezione, etichetta, abilitata) VALUES
  ('agenda',    'Agenda',                true),
  ('documenti', 'I miei documenti',      true),
  ('cedolini',  'Cedolini',              true),
  ('storico',   'Storico interventi',    true)
ON CONFLICT DO NOTHING;

ALTER TABLE sezioni_operatore ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all" ON sezioni_operatore
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
