-- migrations_v19.sql
-- Modulo costo aziendale operatore: parametri CCNL + tariffe INAIL + RPC calcolo

-- ── 1. Tariffe INAIL (per voce di tariffa, variano per settore) ───────────────
CREATE TABLE IF NOT EXISTS tariffe_inail (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voce_tariffa  text NOT NULL,
  descrizione   text NOT NULL,
  tasso_inail   numeric(7,5) NOT NULL,  -- 0.03000 = 3.00%
  valido_da     date NOT NULL DEFAULT '2024-01-01',
  valido_a      date,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (voce_tariffa, valido_da)
);
ALTER TABLE tariffe_inail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all" ON tariffe_inail FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Tariffe INAIL 2024 — voci principali pulizie / portierato
-- NOTA: verificare le aliquote assegnate dalla propria sede INAIL (variano per azienda)
INSERT INTO tariffe_inail (voce_tariffa, descrizione, tasso_inail, valido_da) VALUES
  ('0411', 'Pulizie e disinfezione ambienti civili',          0.03000, '2024-01-01'),
  ('0722', 'Pulizie e manutenzione impianti industriali',     0.04500, '2024-01-01'),
  ('6422', 'Disinfestazione e derattizzazione',               0.05500, '2024-01-01'),
  ('9232', 'Portierato e custodia',                          0.01500, '2024-01-01')
ON CONFLICT (voce_tariffa, valido_da) DO NOTHING;

-- ── 2. Parametri CCNL (versionati per data) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS parametri_ccnl (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livello              text NOT NULL,
  descrizione_livello  text,
  paga_base_mensile    numeric(10,2) NOT NULL DEFAULT 0,   -- minimo tabellare
  contingenza          numeric(10,2) NOT NULL DEFAULT 513.38,
  edr                  numeric(10,2) NOT NULL DEFAULT 10.33,
  divisore_orario      int           NOT NULL DEFAULT 173,
  aliquota_inps_datore numeric(7,5)  NOT NULL DEFAULT 0.28500,
  percentuale_rateo_13 numeric(7,5)  NOT NULL DEFAULT 0.08333,  -- 1/12
  percentuale_rateo_14 numeric(7,5)  NOT NULL DEFAULT 0.08333,  -- 1/12 (CCNL Multiservizi include 14ª)
  percentuale_tfr      numeric(7,5)  NOT NULL DEFAULT 0.07407,  -- 1/13.5
  valido_da            date NOT NULL,
  valido_a             date,
  created_at           timestamptz DEFAULT now(),
  UNIQUE (livello, valido_da),
  CONSTRAINT ccnl_validita CHECK (valido_a IS NULL OR valido_a > valido_da)
);
ALTER TABLE parametri_ccnl ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_users_all" ON parametri_ccnl FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- CCNL Multiservizi / Servizi di Pulizia 2024
-- NOTA: valori INDICATIVI — verificare con la tabella retributiva ufficiale del rinnovo
-- contingenza = 513.38 € e EDR = 10.33 € sono fissi per tutti i livelli
INSERT INTO parametri_ccnl
  (livello, descrizione_livello, paga_base_mensile, contingenza, edr, divisore_orario, aliquota_inps_datore, valido_da)
VALUES
  ('1^', '1°^ Livello — ingresso (primi 18 mesi)',              845.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('1',  '1° Livello — qualifiche elementari',                   895.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('2',  '2° Livello — operaio qualificato base',                945.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('3',  '3° Livello — operaio qualificato pulizie ordinarie',  1000.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('4',  '4° Livello — operaio specializzato',                  1090.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('5',  '5° Livello — caposquadra / impiegato 1ª categoria',   1210.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('6',  '6° Livello — responsabile tecnico',                   1370.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('7',  '7° Livello — quadro intermedio',                      1560.00, 513.38, 10.33, 173, 0.28500, '2024-01-01'),
  ('8',  '8° Livello — quadro superiore / funzionario',         1800.00, 513.38, 10.33, 173, 0.28500, '2024-01-01')
ON CONFLICT (livello, valido_da) DO NOTHING;

-- ── 3. Estensioni tabelle esistenti ──────────────────────────────────────────
-- Voce tariffa INAIL per operatore (default pulizie civili)
ALTER TABLE profili
  ADD COLUMN IF NOT EXISTS voce_tariffa_inail text DEFAULT '0411';

-- Imponibili dal cedolino (già estratti dal parser CED, ora salvati)
ALTER TABLE buste_paga
  ADD COLUMN IF NOT EXISTS imponibile_inps  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imponibile_inail numeric(10,2) DEFAULT 0;

-- Livello CCNL usato in preventivo (per ripristinare il calcolo)
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS livello_ccnl text;

-- ── 4. RPC calcola_costo_operatore ───────────────────────────────────────────
-- Unica funzione per preventivo (stima da CCNL tabella) e consuntivo (valori reali)
-- Preventivo: passare p_livello + p_ore_ordinarie, lasciare p_lordo_busta = NULL
-- Consuntivo: passare p_lordo_busta + p_imponibile_contributivo (dall'imponibile INPS del cedolino)
CREATE OR REPLACE FUNCTION calcola_costo_operatore(
  p_livello                 text    DEFAULT NULL,
  p_voce_tariffa            text    DEFAULT NULL,
  p_imponibile_contributivo numeric DEFAULT NULL,
  p_imponibile_inail        numeric DEFAULT NULL,
  p_lordo_busta             numeric DEFAULT NULL,
  p_ore_ordinarie           numeric DEFAULT 0,
  p_ore_straordinario       numeric DEFAULT 0,
  p_include_ratei           boolean DEFAULT true,
  p_data_riferimento        date    DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_ccnl              parametri_ccnl%ROWTYPE;
  v_tasso_inail       numeric;
  v_lordo             numeric;
  v_impon_contrib     numeric;
  v_impon_inail_base  numeric;
  v_tariffa_h         numeric;
  v_ore_totali        numeric;
  v_inps_az           numeric;
  v_inail_az          numeric;
  v_rateo_13          numeric;
  v_rateo_14          numeric;
  v_tfr               numeric;
  v_costo_totale      numeric;
  v_costo_orario      numeric;
BEGIN
  -- Parametri CCNL validi alla data
  SELECT * INTO v_ccnl
  FROM parametri_ccnl
  WHERE (p_livello IS NULL OR livello = p_livello)
    AND valido_da <= p_data_riferimento
    AND (valido_a IS NULL OR valido_a >= p_data_riferimento)
  ORDER BY valido_da DESC
  LIMIT 1;

  IF v_ccnl.id IS NULL THEN
    v_ccnl.paga_base_mensile    := 1000.00;
    v_ccnl.contingenza          := 513.38;
    v_ccnl.edr                  := 10.33;
    v_ccnl.divisore_orario      := 173;
    v_ccnl.aliquota_inps_datore := 0.28500;
    v_ccnl.percentuale_rateo_13 := 0.08333;
    v_ccnl.percentuale_rateo_14 := 0.08333;
    v_ccnl.percentuale_tfr      := 0.07407;
    v_ccnl.livello              := NULL;
  END IF;

  -- Tasso INAIL per voce di tariffa
  SELECT tasso_inail INTO v_tasso_inail
  FROM tariffe_inail
  WHERE (p_voce_tariffa IS NULL OR voce_tariffa = p_voce_tariffa)
    AND valido_da <= p_data_riferimento
    AND (valido_a IS NULL OR valido_a >= p_data_riferimento)
  ORDER BY valido_da DESC
  LIMIT 1;
  v_tasso_inail := COALESCE(v_tasso_inail, 0.03000);

  v_ore_totali := COALESCE(p_ore_ordinarie, 0) + COALESCE(p_ore_straordinario, 0);

  IF p_lordo_busta IS NOT NULL THEN
    -- Modalità consuntivo: valori reali dal cedolino
    v_lordo            := p_lordo_busta;
    v_impon_contrib    := COALESCE(p_imponibile_contributivo, p_lordo_busta);
    v_impon_inail_base := COALESCE(p_imponibile_inail, v_impon_contrib);
  ELSE
    -- Modalità preventivo: stima tariffa oraria × ore da CCNL tabella
    v_tariffa_h        := (v_ccnl.paga_base_mensile + v_ccnl.contingenza + v_ccnl.edr)
                          / v_ccnl.divisore_orario;
    v_lordo            := ROUND(v_tariffa_h * GREATEST(v_ore_totali, 1), 2);
    v_impon_contrib    := v_lordo;
    v_impon_inail_base := v_lordo;
  END IF;

  -- Contributi azienda
  v_inps_az  := ROUND(v_impon_contrib    * v_ccnl.aliquota_inps_datore, 2);
  v_inail_az := ROUND(v_impon_inail_base * v_tasso_inail, 2);

  -- Ratei e TFR (competenza mensile)
  IF p_include_ratei THEN
    v_rateo_13 := ROUND(v_lordo * v_ccnl.percentuale_rateo_13, 2);
    v_rateo_14 := ROUND(v_lordo * v_ccnl.percentuale_rateo_14, 2);
    v_tfr      := ROUND(v_lordo * v_ccnl.percentuale_tfr, 2);
  ELSE
    v_rateo_13 := 0;
    v_rateo_14 := 0;
    v_tfr      := 0;
  END IF;

  v_costo_totale := v_lordo + v_inps_az + v_inail_az + v_rateo_13 + v_rateo_14 + v_tfr;
  v_costo_orario := CASE
    WHEN v_ore_totali > 0 THEN ROUND(v_costo_totale / v_ore_totali, 4)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'lordo',                  v_lordo,
    'contributi_inps_datore', v_inps_az,
    'inail',                  v_inail_az,
    'ratei_13',               v_rateo_13,
    'ratei_14',               v_rateo_14,
    'tfr',                    v_tfr,
    'costo_totale',           v_costo_totale,
    'costo_orario_effettivo', v_costo_orario,
    'aliquota_inps_datore',   v_ccnl.aliquota_inps_datore,
    'tasso_inail',            v_tasso_inail,
    'livello',                v_ccnl.livello
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calcola_costo_operatore TO authenticated;
