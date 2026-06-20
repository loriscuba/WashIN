-- migrations_v21.sql
-- Modello costo operatore più accurato:
--   1. Aggiunge percentuale_rateo_ferie_permessi a parametri_ccnl (~22% lordo CCNL Multiservizi)
--   2. Aggiorna aliquota_inps_datore da 28.5% → 31.5% (più aderente al reale)
--   3. Riscrive calcola_costo_operatore: INPS su ratei, ratei ferie/permessi

-- ── 1. Nuova colonna ──────────────────────────────────────────────────────────
ALTER TABLE parametri_ccnl
  ADD COLUMN IF NOT EXISTS percentuale_rateo_ferie_permessi numeric(7,5) NOT NULL DEFAULT 0.22000;

-- ── 2. Aggiorna valori di default per CCNL Multiservizi 2024 ─────────────────
-- aliquota_inps_datore: corregge 28.5% → 31.5% (valore più vicino al reale;
--   la differenza copre CIGS, contribuzione integrativa e minori voci INPS)
-- percentuale_rateo_ferie_permessi: 22% di lordo mensile (26gg ferie + ex-festività + ROL)
UPDATE parametri_ccnl
SET    aliquota_inps_datore            = 0.31500,
       percentuale_rateo_ferie_permessi = 0.22000
WHERE  valido_da = '2024-01-01';

-- ── 3. Riscrittura RPC calcola_costo_operatore ───────────────────────────────
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
  v_inps_az           numeric;      -- INPS datore su lordo
  v_inail_az          numeric;
  v_rateo_13          numeric;
  v_rateo_14          numeric;
  v_rateo_ferie       numeric;      -- ratei ferie + permessi + ex-festività
  v_ratei_totali      numeric;      -- 13ª + 14ª + ferie/permessi
  v_inps_su_ratei     numeric;      -- INPS datore anche sui ratei
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
    v_ccnl.paga_base_mensile                := 1000.00;
    v_ccnl.contingenza                      := 513.38;
    v_ccnl.edr                              := 10.33;
    v_ccnl.divisore_orario                  := 173;
    v_ccnl.aliquota_inps_datore             := 0.31500;
    v_ccnl.percentuale_rateo_13             := 0.08333;
    v_ccnl.percentuale_rateo_14             := 0.08333;
    v_ccnl.percentuale_rateo_ferie_permessi := 0.22000;
    v_ccnl.percentuale_tfr                  := 0.07407;
    v_ccnl.livello                          := NULL;
  END IF;

  -- Assicura che la colonna nuova abbia un fallback anche su righe pre-migrazione
  IF v_ccnl.percentuale_rateo_ferie_permessi IS NULL THEN
    v_ccnl.percentuale_rateo_ferie_permessi := 0.22000;
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

  -- INPS e INAIL datore su lordo
  v_inps_az  := ROUND(v_impon_contrib    * v_ccnl.aliquota_inps_datore, 2);
  v_inail_az := ROUND(v_impon_inail_base * v_tasso_inail, 2);

  -- Ratei, TFR e contributi su ratei
  IF p_include_ratei THEN
    v_rateo_13     := ROUND(v_lordo * v_ccnl.percentuale_rateo_13, 2);
    v_rateo_14     := ROUND(v_lordo * v_ccnl.percentuale_rateo_14, 2);
    v_rateo_ferie  := ROUND(v_lordo * v_ccnl.percentuale_rateo_ferie_permessi, 2);
    v_ratei_totali := v_rateo_13 + v_rateo_14 + v_rateo_ferie;
    -- L'INPS datore si applica anche ai ratei (competenza mensile)
    v_inps_su_ratei := ROUND(v_ratei_totali * v_ccnl.aliquota_inps_datore, 2);
    -- TFR calcolato su lordo + 13ª + 14ª (base legale art. 2120 c.c.)
    v_tfr           := ROUND((v_lordo + v_rateo_13 + v_rateo_14) * v_ccnl.percentuale_tfr, 2);
  ELSE
    v_rateo_13      := 0;
    v_rateo_14      := 0;
    v_rateo_ferie   := 0;
    v_ratei_totali  := 0;
    v_inps_su_ratei := 0;
    v_tfr           := 0;
  END IF;

  v_costo_totale := v_lordo + v_inps_az + v_inail_az
                    + v_ratei_totali + v_inps_su_ratei + v_tfr;

  v_costo_orario := CASE
    WHEN v_ore_totali > 0 THEN ROUND(v_costo_totale / v_ore_totali, 4)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'lordo',                          v_lordo,
    'contributi_inps_datore',         v_inps_az,
    'inail',                          v_inail_az,
    'ratei_13',                       v_rateo_13,
    'ratei_14',                       v_rateo_14,
    'ratei_ferie_permessi',           v_rateo_ferie,
    'contributi_su_ratei',            v_inps_su_ratei,
    'tfr',                            v_tfr,
    'costo_totale',                   v_costo_totale,
    'costo_orario_effettivo',         v_costo_orario,
    'aliquota_inps_datore',           v_ccnl.aliquota_inps_datore,
    'percentuale_rateo_ferie_permessi', v_ccnl.percentuale_rateo_ferie_permessi,
    'tasso_inail',                    v_tasso_inail,
    'livello',                        v_ccnl.livello
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calcola_costo_operatore TO authenticated;

-- Ricarica schema cache PostgREST
NOTIFY pgrst, 'reload schema';
