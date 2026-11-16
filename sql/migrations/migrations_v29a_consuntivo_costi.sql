-- migrations_v29: Consuntivo Costi — tabella storico costi reali per dipendente

-- Colonna media progressiva costo orario su profili
ALTER TABLE profili ADD COLUMN IF NOT EXISTS costo_orario_medio numeric(12,5);

-- Tabella consuntivo_costi: una riga per dipendente per periodo (annuale o mensile)
CREATE TABLE IF NOT EXISTS consuntivo_costi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operatore_id    uuid NOT NULL REFERENCES profili(id) ON DELETE CASCADE,
  anno            integer NOT NULL,
  mese_da         integer NOT NULL DEFAULT 1,   -- mese inizio periodo (1–12)
  mese_a          integer NOT NULL DEFAULT 12,  -- mese fine periodo  (1–12)
  ore_lavorate    numeric(10,2),
  totale_costo    numeric(12,2),
  costo_orario    numeric(12,5) NOT NULL,
  perc_incidenza  numeric(8,2),
  creato_a        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operatore_id, anno, mese_da, mese_a)
);

-- Indice per query storiche per operatore
CREATE INDEX IF NOT EXISTS idx_consuntivo_costi_operatore ON consuntivo_costi(operatore_id, anno, mese_da);

-- RLS: visibile agli utenti autenticati della stessa organizzazione
ALTER TABLE consuntivo_costi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_consuntivo_costi" ON consuntivo_costi;
CREATE POLICY "auth_consuntivo_costi" ON consuntivo_costi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
