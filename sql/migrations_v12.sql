-- migrations_v12.sql
-- Fix colonne mancanti su interventi + UNIQUE constraint su checklist_compilate

-- 1. Aggiungi colonne timestamp e geo su interventi
--    (lo schema originale aveva ora_inizio_effettiva time, non inizio_effettivo timestamptz)
ALTER TABLE interventi ADD COLUMN IF NOT EXISTS inizio_effettivo  timestamptz;
ALTER TABLE interventi ADD COLUMN IF NOT EXISTS fine_effettivo    timestamptz;
ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_inizio_lat    numeric;
ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_inizio_lng    numeric;
ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_fine_lat      numeric;
ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_fine_lng      numeric;

-- 2. Pulisci righe duplicate in checklist_compilate
--    (bug precedente: upsert senza onConflict creava una riga nuova ad ogni salvataggio)
DELETE FROM checklist_compilate
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY intervento_id
             ORDER BY compiled_at DESC NULLS LAST
           ) AS rn
    FROM checklist_compilate
  ) ranked
  WHERE rn > 1
);

-- 3. Aggiungi UNIQUE constraint su intervento_id (necessario per upsert corretto)
ALTER TABLE checklist_compilate
  DROP CONSTRAINT IF EXISTS checklist_compilate_intervento_id_key;
ALTER TABLE checklist_compilate
  ADD CONSTRAINT checklist_compilate_intervento_id_key UNIQUE (intervento_id);
