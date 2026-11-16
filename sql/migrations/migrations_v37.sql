-- Migration v37: presenze_giornaliere + presenze_mensili + eventi_amministrativi + codice_fiscale

ALTER TABLE profili ADD COLUMN IF NOT EXISTS codice_fiscale text UNIQUE;

-- Daily operator self-reporting (from app)
CREATE TABLE IF NOT EXISTS presenze_giornaliere (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profilo_id   uuid NOT NULL REFERENCES profili(id) ON DELETE CASCADE,
  data         date NOT NULL,
  tipo         text NOT NULL DEFAULT 'lavoro'
               CHECK (tipo IN ('lavoro','feria','malattia','festivita','permesso','assenza')),
  ore_ordinarie    numeric(4,2) DEFAULT 0,
  ore_straordinario numeric(4,2) DEFAULT 0,
  note         text,
  creato_a     timestamptz DEFAULT now(),
  aggiornato_a timestamptz DEFAULT now(),
  UNIQUE (profilo_id, data)
);

-- Monthly aggregates (cedolino import or admin manual entry)
CREATE TABLE IF NOT EXISTS presenze_mensili (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profilo_id             uuid NOT NULL REFERENCES profili(id) ON DELETE CASCADE,
  anno                   integer NOT NULL,
  mese                   integer NOT NULL CHECK (mese BETWEEN 1 AND 12),

  ore_ordinarie          numeric(6,2) DEFAULT 0,   -- voce 8001
  gg_lavoro              numeric(4,1) DEFAULT 0,   -- voce 8002 (impiegati)
  ore_supplementare      numeric(6,2) DEFAULT 0,   -- voce 8019 (part-time 28%)
  ore_straordinario_25   numeric(6,2) DEFAULT 0,   -- voce 8025
  ore_domenicali         numeric(6,2) DEFAULT 0,   -- voce 8038 (50%)
  ore_notturne           numeric(6,2) DEFAULT 0,   -- voce 30 (magg. 30%)
  ferie_godute_ore       numeric(6,2) DEFAULT 0,   -- voce 8101
  festivita_godute_ore   numeric(6,2) DEFAULT 0,   -- voce 8108/8109
  ex_festivita_ore       numeric(6,2) DEFAULT 0,   -- voce 31
  gg_malattia_inps       numeric(4,1) DEFAULT 0,   -- voce 8350
  gg_carenza_malattia    integer      DEFAULT 0,   -- voce 8356
  gg_congedo_parentale   integer      DEFAULT 0,   -- voce 8364
  premio                 numeric(8,2) DEFAULT 0,   -- voce 18
  compenso_personam      numeric(8,2) DEFAULT 0,   -- voce 14
  contributo_integrativo numeric(8,2) DEFAULT 0,   -- voce 9423
  lordo_cedolino         numeric(10,2),
  imponibile_inail       numeric(10,2),
  gg_inps                integer,
  gg_inail               integer,

  fonte        text NOT NULL DEFAULT 'admin'
               CHECK (fonte IN ('admin','import_cedolino','app_operatore')),
  cedolino_id  uuid REFERENCES buste_paga(id),
  note         text,
  creato_a     timestamptz DEFAULT now(),
  aggiornato_a timestamptz DEFAULT now(),
  UNIQUE (profilo_id, anno, mese)
);

-- Administrative events (acconti TFR, finanziamenti, cessioni, premi una tantum)
CREATE TABLE IF NOT EXISTS eventi_amministrativi (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profilo_id uuid NOT NULL REFERENCES profili(id) ON DELETE CASCADE,
  anno       integer NOT NULL,
  mese       integer NOT NULL CHECK (mese BETWEEN 1 AND 12),
  tipo       text NOT NULL CHECK (tipo IN (
    'acconto_tfr','anticipazione_tfr','acconto_retribuzione',
    'restituzione_prestito','cessione_stipendio','pignoramento',
    'premio','dimissioni','trasformazione_contratto','altro'
  )),
  importo    numeric(10,2) NOT NULL,
  note       text,
  cedolino_id uuid REFERENCES buste_paga(id),
  creato_a   timestamptz DEFAULT now()
);

-- Trigger: aggiornato_a
CREATE OR REPLACE FUNCTION set_aggiornato_a()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.aggiornato_a = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_presenze_g_upd  ON presenze_giornaliere;
DROP TRIGGER IF EXISTS trg_presenze_m_upd  ON presenze_mensili;
CREATE TRIGGER trg_presenze_g_upd BEFORE UPDATE ON presenze_giornaliere
  FOR EACH ROW EXECUTE FUNCTION set_aggiornato_a();
CREATE TRIGGER trg_presenze_m_upd BEFORE UPDATE ON presenze_mensili
  FOR EACH ROW EXECUTE FUNCTION set_aggiornato_a();

-- RLS
ALTER TABLE presenze_giornaliere  ENABLE ROW LEVEL SECURITY;
ALTER TABLE presenze_mensili       ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventi_amministrativi  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all" ON presenze_giornaliere
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON presenze_mensili
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON eventi_amministrativi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_pg_profilo_data   ON presenze_giornaliere (profilo_id, data);
CREATE INDEX IF NOT EXISTS idx_pm_profilo_periodo ON presenze_mensili     (profilo_id, anno, mese);
CREATE INDEX IF NOT EXISTS idx_ea_profilo_periodo ON eventi_amministrativi (profilo_id, anno, mese);

-- Add ore section to operator dashboard toggles
INSERT INTO sezioni_operatore (sezione, etichetta, abilitata) VALUES
  ('ore', 'Le mie ore', true)
ON CONFLICT DO NOTHING;
