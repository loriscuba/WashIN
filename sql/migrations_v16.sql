-- migrations_v16.sql
-- Gestione Anagrafica HR: estensione profili + tabella buste paga

-- 1. Nuovi campi anagrafici/contrattuali su profili
ALTER TABLE profili ADD COLUMN IF NOT EXISTS matricola               text;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS ccnl                    text DEFAULT 'Pulizie e Multiservizi';
ALTER TABLE profili ADD COLUMN IF NOT EXISTS categoria_lavorativa    text;   -- es. "3° livello", "4° livello"
ALTER TABLE profili ADD COLUMN IF NOT EXISTS tipo_contratto          text CHECK (tipo_contratto IN ('indeterminato','determinato','part_time','stagionale','apprendistato'));
ALTER TABLE profili ADD COLUMN IF NOT EXISTS data_scadenza_contratto date;   -- rilevante per determinato
ALTER TABLE profili ADD COLUMN IF NOT EXISTS iban_dipendente         text;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS paga_base               numeric(10,2);  -- paga base mensile CCNL
ALTER TABLE profili ADD COLUMN IF NOT EXISTS scatti_anzianita        numeric(10,2) DEFAULT 0;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS indennita               numeric(10,2) DEFAULT 0;
ALTER TABLE profili ADD COLUMN IF NOT EXISTS note_hr                 text;

-- 2. Tabella buste paga
CREATE TABLE IF NOT EXISTS buste_paga (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operatore_id         uuid NOT NULL REFERENCES profili(id) ON DELETE CASCADE,
  anno                 int  NOT NULL,
  mese                 int  NOT NULL CHECK (mese BETWEEN 1 AND 12),

  -- Ore
  ore_lavorate         numeric(5,1)  DEFAULT 0,
  ore_straordinario    numeric(5,1)  DEFAULT 0,

  -- Componenti retributive (lorda)
  paga_base            numeric(10,2) DEFAULT 0,
  contingenza          numeric(10,2) DEFAULT 0,   -- contingenza CCNL
  edr                  numeric(10,2) DEFAULT 0,   -- Elemento Distinto della Retribuzione
  superminimo          numeric(10,2) DEFAULT 0,
  scatti_anzianita     numeric(10,2) DEFAULT 0,
  straordinari_imp     numeric(10,2) DEFAULT 0,
  indennita_varie      numeric(10,2) DEFAULT 0,
  altri_elementi       numeric(10,2) DEFAULT 0,
  totale_lordo         numeric(10,2) DEFAULT 0,

  -- Ritenute
  contributi_inps_dip  numeric(10,2) DEFAULT 0,   -- quota dipendente ~9.19%
  irpef                numeric(10,2) DEFAULT 0,
  addizionali          numeric(10,2) DEFAULT 0,   -- addizionali regionali/comunali
  altre_ritenute       numeric(10,2) DEFAULT 0,
  totale_ritenute      numeric(10,2) DEFAULT 0,

  -- Netto
  totale_netto         numeric(10,2) DEFAULT 0,

  -- TFR (Trattamento Fine Rapporto)
  tfr_mese             numeric(10,2) DEFAULT 0,   -- accantonamento mensile = lordo / 13.5
  tfr_rivalutazione    numeric(10,2) DEFAULT 0,

  -- Costo azienda
  contributi_inps_az   numeric(10,2) DEFAULT 0,   -- quota azienda ~28-30%
  inail                numeric(10,2) DEFAULT 0,
  costo_aziendale      numeric(10,2) DEFAULT 0,   -- lordo + contrib.az. + tfr

  -- Documento allegato
  file_path            text,

  -- Stato
  stato                text CHECK (stato IN ('caricata','verificata','pagata')) DEFAULT 'caricata',
  data_pagamento       date,
  note                 text,

  created_at           timestamptz DEFAULT now(),

  UNIQUE (operatore_id, anno, mese)
);

ALTER TABLE buste_paga ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all" ON buste_paga FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Bucket Supabase Storage per le buste paga (eseguire nel SQL Editor Supabase)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('buste-paga', 'buste-paga', false)
-- ON CONFLICT (id) DO NOTHING;
-- CREATE POLICY "auth read buste-paga" ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'buste-paga');
-- CREATE POLICY "auth insert buste-paga" ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'buste-paga');
-- CREATE POLICY "auth delete buste-paga" ON storage.objects FOR DELETE TO authenticated
--   USING (bucket_id = 'buste-paga');
