-- ============================================================
-- Migration: Conto Economico per Contratto
-- Run this in Supabase SQL Editor (project btcnfxoqkddpfhzahhaz)
-- ============================================================

-- 1. Add cost fields to profili (operatori)
ALTER TABLE profili
  ADD COLUMN IF NOT EXISTS costo_mensile NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ore_mensili_contratto NUMERIC(5,1) DEFAULT 160;

-- 2. Add cost price to magazzino (prodotti)
ALTER TABLE magazzino
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2) DEFAULT 0;

-- 3. Create interventi_materiali (structured cost tracking, separate from checklist materiali_intervento)
CREATE TABLE IF NOT EXISTS interventi_materiali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervento_id UUID NOT NULL REFERENCES interventi(id) ON DELETE CASCADE,
  prodotto_id UUID REFERENCES magazzino(id) ON DELETE SET NULL,
  quantita NUMERIC(8,2) NOT NULL DEFAULT 1,
  costo_unitario_snapshot NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE interventi_materiali ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read interventi_materiali"
  ON interventi_materiali FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth insert interventi_materiali"
  ON interventi_materiali FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth update interventi_materiali"
  ON interventi_materiali FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth delete interventi_materiali"
  ON interventi_materiali FOR DELETE TO authenticated USING (true);

-- 4. Add vehicle economics fields
ALTER TABLE veicoli
  ADD COLUMN IF NOT EXISTS consumo_per_100km NUMERIC(5,2) DEFAULT 8,
  ADD COLUMN IF NOT EXISTS costo_carburante_litro NUMERIC(5,3) DEFAULT 1.800;

-- 5. Add km_percorsi to interventi
ALTER TABLE interventi
  ADD COLUMN IF NOT EXISTS km_percorsi NUMERIC(7,1) DEFAULT 0;
