-- v23: Coefficienti rischio appalto per preventivi semplificati
-- Eseguire su Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS coefficienti_rischio (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  codice       text    NOT NULL UNIQUE,
  descrizione  text    NOT NULL,
  coefficiente numeric(5,3) NOT NULL DEFAULT 1.000,
  ordine       integer DEFAULT 0
);

INSERT INTO coefficienti_rischio (codice, descrizione, coefficiente, ordine) VALUES
  ('semplice',  'Appalto semplice continuativo', 1.050, 1),
  ('normale',   'Appalto normale pulizie',        1.100, 2),
  ('complesso', 'Appalto complesso',              1.150, 3)
ON CONFLICT (codice) DO NOTHING;

ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS tipo_appalto       text,
  ADD COLUMN IF NOT EXISTS coefficiente_rischio numeric(5,3);
