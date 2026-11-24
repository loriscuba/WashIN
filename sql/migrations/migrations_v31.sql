-- migrations_v31.sql
-- Pulizia automatica dei PDF cifrati condivisi via WhatsApp.
-- I file in "whatsapp/" servono solo finché è valido il link (7 giorni):
-- li eliminiamo dopo 8 giorni così il link non si rompe mai prima della scadenza.
-- Eseguire nel SQL Editor di Supabase. Idempotente: rilanciabile senza rischi.

-- 1. Estensione pianificatore (di norma già disponibile su Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Rimuove un'eventuale pianificazione precedente con lo stesso nome
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-whatsapp-cedolini') THEN
    PERFORM cron.unschedule('cleanup-whatsapp-cedolini');
  END IF;
END $$;

-- 3. Pianifica la pulizia giornaliera alle 03:00
--    (usa updated_at: un ri-invio dello stesso mese rinnova il file e i suoi 7 giorni)
SELECT cron.schedule(
  'cleanup-whatsapp-cedolini',
  '0 3 * * *',
  $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'buste-paga'
      AND name LIKE 'whatsapp/%'
      AND COALESCE(updated_at, created_at) < now() - interval '8 days'
  $$
);
