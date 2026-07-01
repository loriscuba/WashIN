-- Migration v38: campi aggiuntivi per presenze dettagliate + sezione Ore mensili

-- Aggiungi sezione 'presenze-dettagliate' alle sezioni admin toggle
INSERT INTO sezioni_admin (sezione, etichetta, abilitata) VALUES
  ('presenze-dettagliate', 'Ore mensili', true)
ON CONFLICT DO NOTHING;

-- Migration v38: campi aggiuntivi per presenze dettagliate admin

-- presenze_giornaliere: nota cantiere
ALTER TABLE presenze_giornaliere
  ADD COLUMN IF NOT EXISTS nota_cantiere text;

-- presenze_mensili: breakdowns "di cui" + note commercialista
ALTER TABLE presenze_mensili
  ADD COLUMN IF NOT EXISTS ore_sabato              numeric(6,2) DEFAULT 0,

  -- note per la commercialista (strutturate)
  ADD COLUMN IF NOT EXISTS acconto_importo         numeric(8,2),
  ADD COLUMN IF NOT EXISTS premio_importo          numeric(8,2),
  ADD COLUMN IF NOT EXISTS rimborso_importo        numeric(8,2),
  ADD COLUMN IF NOT EXISTS finanziamento_importo   numeric(8,2),
  ADD COLUMN IF NOT EXISTS finanziamento_ente      text,
  ADD COLUMN IF NOT EXISTS cessione_quinto         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cessione_ente           text,
  ADD COLUMN IF NOT EXISTS trattenuta_sindacale    text,   -- es. 'CGIL', 'CISL', 'UIL'
  ADD COLUMN IF NOT EXISTS nuovo_iban              text,
  ADD COLUMN IF NOT EXISTS dimissioni_data         date,
  ADD COLUMN IF NOT EXISTS lul_data                date,
  ADD COLUMN IF NOT EXISTS lul_ore                 numeric(4,2),
  ADD COLUMN IF NOT EXISTS flag_finanziamento      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_commercialista     text;   -- testo libero
