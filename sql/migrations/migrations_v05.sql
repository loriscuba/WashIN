-- WashIN v5 migrations
-- Run on Supabase SQL Editor

CREATE TABLE IF NOT EXISTS veicoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  targa text NOT NULL,
  marca text,
  modello text,
  anno integer,
  km_attuali numeric DEFAULT 0,
  revisione_scadenza date,
  assicurazione_scadenza date,
  note text,
  attivo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veicoli_documenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veicolo_id uuid REFERENCES veicoli(id) ON DELETE CASCADE,
  nome_file text NOT NULL,
  storage_path text NOT NULL,
  tipo text DEFAULT 'altro',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE veicoli ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_veicoli" ON veicoli;
CREATE POLICY "allow_all_veicoli" ON veicoli FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE veicoli_documenti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_veicoli_documenti" ON veicoli_documenti;
CREATE POLICY "allow_all_veicoli_documenti" ON veicoli_documenti FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket (run separately if this fails):
INSERT INTO storage.buckets (id, name, public)
VALUES ('veicoli-docs', 'veicoli-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "allow_all_veicoli_docs_storage" ON storage.objects;
CREATE POLICY "allow_all_veicoli_docs_storage" ON storage.objects
FOR ALL USING (bucket_id = 'veicoli-docs') WITH CHECK (bucket_id = 'veicoli-docs');
