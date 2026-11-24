-- Migration: Modelli Contratto e aggiornamento tabella contratti

-- 1. Create table modelli_contratto
CREATE TABLE IF NOT EXISTS modelli_contratto (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_cliente    VARCHAR(50)   NOT NULL CHECK (tipo_cliente IN ('condominio', 'azienda', 'privato')),
  nome            VARCHAR(255)  NOT NULL,
  descrizione     TEXT,
  configurazione  JSONB         NOT NULL DEFAULT '{}',
  attivo          BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE modelli_contratto ENABLE ROW LEVEL SECURITY;

-- Policy: full access for admins only
CREATE POLICY "Admin full access on modelli_contratto"
  ON modelli_contratto
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profili
      WHERE profili.id = auth.uid()
        AND profili.ruolo = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profili
      WHERE profili.id = auth.uid()
        AND profili.ruolo = 'admin'
    )
  );

-- 3. Alter contratti table
ALTER TABLE contratti
  ADD COLUMN IF NOT EXISTS scheda_dati  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS modello_id   UUID  REFERENCES modelli_contratto(id) ON DELETE SET NULL;

-- 4. Insert default template: Contratto Pulizia Condominio
INSERT INTO modelli_contratto (tipo_cliente, nome, descrizione, configurazione)
VALUES (
  'condominio',
  'Contratto Pulizia Condominio',
  'Modello standard per contratti di pulizia condominiale',
  '{
    "ragione_sociale_appaltatore": "",
    "piva_appaltatore": "",
    "comune_appaltatore": "",
    "indirizzo_appaltatore": "",
    "registro_imprese": "",
    "legale_rappresentante": "",
    "iban": "",
    "foro_competente": "",
    "massimale_polizza": "2.000.000,00",
    "giorni_pagamento": 30,
    "giorni_preavviso_disdetta": 60,
    "giorni_preavviso_recesso": 30,
    "giorni_termine_diffida": 15
  }'::jsonb
);
