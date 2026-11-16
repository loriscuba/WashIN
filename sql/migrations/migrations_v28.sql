-- migrations_v28: imposta FIR al 20% per tutti gli operatori attivi

UPDATE profili
SET fir_personale = 20
WHERE attivo IS NOT FALSE
  AND fir_personale IS NULL;

-- Se vuoi sovrascrivere anche quelli già impostati, usa questa invece:
-- UPDATE profili SET fir_personale = 20 WHERE attivo IS NOT FALSE;
