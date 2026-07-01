-- migrations_v29.sql
-- Scatti di anzianità e agevolazione INPS nella stima costo preventivo
--   1. Aggiunge n_scatti_anzianita a profili
--   2. Aggiunge valore_scatto_ora a parametri_ccnl (CCNL Multiservizi: 0.1663 €/h per scatto)
--   3. Seed parametri algoritmo in impostazioni
--   4. Aggiorna calcola_costo_operatore con p_n_scatti e p_agevolazione_inps

-- ── 1. Scatti anzianità sul profilo operatore ─────────────────────────────────
ALTER TABLE profili
  ADD COLUMN IF NOT EXISTS n_scatti_anzianita int NOT NULL DEFAULT 0;

-- ── 2. Valore scatto orario sul CCNL ─────────────────────────────────────────
-- CCNL Multiservizi: ogni scatto vale 0.1663 €/h (28.77 €/mese ÷ 173 h)
ALTER TABLE parametri_ccnl
  ADD COLUMN IF NOT EXISTS valore_scatto_ora numeric(8,4) NOT NULL DEFAULT 0.1663;

UPDATE parametri_ccnl
SET    valore_scatto_ora = 0.1663
WHERE  valore_scatto_ora IS NULL OR valore_scatto_ora = 0;

-- ── 3. Parametri algoritmo in impostazioni ────────────────────────────────────
INSERT INTO impostazioni (chiave, valore)
VALUES ('algoritmo_costi_attivo', 'false')
ON CONFLICT (chiave) DO NOTHING;

INSERT INTO impostazioni (chiave, valore)
VALUES ('agevolazione_inps_calibrata', '0')
ON CONFLICT (chiave) DO NOTHING;

INSERT INTO impostazioni (chiave, valore)
VALUES ('buffer_inefficienze', '0.12')
ON CONFLICT (chiave) DO NOTHING;

-- ── 4. Aggiornamento RPC calcola_costo_operatore ─────────────────────────────
-- Rimuove la firma precedente (9 parametri, v21) per evitare overload ambiguo
DROP FUNCTION IF EXISTS calcola_costo_operatore(
  text, text, numeric, numeric, numeric, numeric, numeric, boolean, date
);

CREATE OR REPLACE FUNCTION calcola_costo_operatore(
  p_livello                 text    DEFAULT NULL,
  p_voce_tariffa            text    DEFAULT NULL,
  p_imponibile_contributivo numeric DEFAULT NULL,
  p_imponibile_inail        numeric DEFAULT NULL,
  p_lordo_busta             numeric DEFAULT NULL,
  p_ore_ordinarie           numeric DEFAULT 0,
  p_ore_straordinario       numeric DEFAULT 0,
  p_include_ratei           boolean DEFAULT true,
  p_data_riferimento        date    DEFAULT CURRENT_DATE,
  p_n_scatti                int     DEFAULT 0,
  p_agevolazione_inps       numeric DEFAULT 0
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
  v_rateo_ferie       numeric;
  v_ratei_totali      numeric;
  v_inps_su_ratei     numeric;
  v_tfr               numeric;
  v_costo_totale      numeric;
  v_costo_orario      numeric;
  v_aliquota_inps_eff numeric;
  v_valore_scatto_ora numeric;
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
    v_ccnl.paga_base_mensile                := 1000.00;
    v_ccnl.contingenza                      := 513.38;
    v_ccnl.edr                              := 10.33;
    v_ccnl.divisore_orario                  := 173;
    v_ccnl.aliquota_inps_datore             := 0.31500;
    v_ccnl.percentuale_rateo_13             := 0.08333;
    v_ccnl.percentuale_rateo_14             := 0.08333;
    v_ccnl.percentuale_rateo_ferie_permessi := 0.22000;
    v_ccnl.percentuale_tfr                  := 0.07407;
    v_ccnl.valore_scatto_ora                := 0.16630;
    v_ccnl.livello                          := NULL;
  END IF;

  -- Fallback per colonne aggiunte in migrazione precedente
  IF v_ccnl.percentuale_rateo_ferie_permessi IS NULL THEN
    v_ccnl.percentuale_rateo_ferie_permessi := 0.22000;
  END IF;
  IF v_ccnl.valore_scatto_ora IS NULL THEN
    v_ccnl.valore_scatto_ora := 0.16630;
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

  -- Aliquota INPS effettiva (al netto dell'agevolazione, mai < 0)
  v_aliquota_inps_eff := GREATEST(
    v_ccnl.aliquota_inps_datore - COALESCE(p_agevolazione_inps, 0),
    0
  );

  v_ore_totali := COALESCE(p_ore_ordinarie, 0) + COALESCE(p_ore_straordinario, 0);
  v_valore_scatto_ora := v_ccnl.valore_scatto_ora;

  IF p_lordo_busta IS NOT NULL THEN
    -- Modalità consuntivo: valori reali dal cedolino
    v_lordo            := p_lordo_busta;
    v_impon_contrib    := COALESCE(p_imponibile_contributivo, p_lordo_busta);
    v_impon_inail_base := COALESCE(p_imponibile_inail, v_impon_contrib);
  ELSE
    -- Modalità preventivo: tariffa oraria CCNL + scatti anzianità × ore
    v_tariffa_h        := (v_ccnl.paga_base_mensile + v_ccnl.contingenza + v_ccnl.edr)
                          / v_ccnl.divisore_orario
                          + v_valore_scatto_ora * GREATEST(COALESCE(p_n_scatti, 0), 0);
    v_lordo            := ROUND(v_tariffa_h * GREATEST(v_ore_totali, 1), 2);
    v_impon_contrib    := v_lordo;
    v_impon_inail_base := v_lordo;
  END IF;

  -- INPS e INAIL datore
  v_inps_az  := ROUND(v_impon_contrib    * v_aliquota_inps_eff, 2);
  v_inail_az := ROUND(v_impon_inail_base * v_tasso_inail, 2);

  -- Ratei, TFR e contributi su ratei
  IF p_include_ratei THEN
    v_rateo_13      := ROUND(v_lordo * v_ccnl.percentuale_rateo_13, 2);
    v_rateo_14      := ROUND(v_lordo * v_ccnl.percentuale_rateo_14, 2);
    v_rateo_ferie   := ROUND(v_lordo * v_ccnl.percentuale_rateo_ferie_permessi, 2);
    v_ratei_totali  := v_rateo_13 + v_rateo_14 + v_rateo_ferie;
    v_inps_su_ratei := ROUND(v_ratei_totali * v_aliquota_inps_eff, 2);
    v_tfr           := ROUND((v_lordo + v_rateo_13 + v_rateo_14) * v_ccnl.percentuale_tfr, 2);
  ELSE
    v_rateo_13      := 0; v_rateo_14     := 0; v_rateo_ferie   := 0;
    v_ratei_totali  := 0; v_inps_su_ratei := 0; v_tfr           := 0;
  END IF;

  v_costo_totale := v_lordo + v_inps_az + v_inail_az
                    + v_ratei_totali + v_inps_su_ratei + v_tfr;

  v_costo_orario := CASE
    WHEN v_ore_totali > 0 THEN ROUND(v_costo_totale / v_ore_totali, 4)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'lordo',                            v_lordo,
    'contributi_inps_datore',           v_inps_az,
    'inail',                            v_inail_az,
    'ratei_13',                         v_rateo_13,
    'ratei_14',                         v_rateo_14,
    'ratei_ferie_permessi',             v_rateo_ferie,
    'contributi_su_ratei',              v_inps_su_ratei,
    'tfr',                              v_tfr,
    'costo_totale',                     v_costo_totale,
    'costo_orario_effettivo',           v_costo_orario,
    'aliquota_inps_datore',             v_ccnl.aliquota_inps_datore,
    'aliquota_inps_effettiva',          v_aliquota_inps_eff,
    'agevolazione_inps',                COALESCE(p_agevolazione_inps, 0),
    'percentuale_rateo_ferie_permessi', v_ccnl.percentuale_rateo_ferie_permessi,
    'tasso_inail',                      v_tasso_inail,
    'n_scatti',                         COALESCE(p_n_scatti, 0),
    'valore_scatto_ora',                v_valore_scatto_ora,
    'livello',                          v_ccnl.livello
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calcola_costo_operatore TO authenticated;

NOTIFY pgrst, 'reload schema';
