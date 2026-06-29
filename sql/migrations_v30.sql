-- migrations_v30.sql
-- Storage bucket "buste-paga" e policy per l'invio dei cedolini.
-- Eseguire nel SQL Editor di Supabase. Idempotente: si può rilanciare senza rischi.

-- 1. Bucket privato per i PDF delle buste paga
INSERT INTO storage.buckets (id, name, public)
VALUES ('buste-paga', 'buste-paga', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: gli utenti autenticati possono leggere/caricare/aggiornare/eliminare
--    i file nel bucket (DROP+CREATE perché CREATE POLICY non supporta IF NOT EXISTS)
DROP POLICY IF EXISTS "buste_paga_select" ON storage.objects;
CREATE POLICY "buste_paga_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'buste-paga');

DROP POLICY IF EXISTS "buste_paga_insert" ON storage.objects;
CREATE POLICY "buste_paga_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'buste-paga');

DROP POLICY IF EXISTS "buste_paga_update" ON storage.objects;
CREATE POLICY "buste_paga_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'buste-paga')
  WITH CHECK (bucket_id = 'buste-paga');

DROP POLICY IF EXISTS "buste_paga_delete" ON storage.objects;
CREATE POLICY "buste_paga_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'buste-paga');

-- 3. Righe di default per la configurazione SMTP (vuote: si compilano dall'app
--    in Configurazioni -> Email Cedolini). La porta di default è 465 (SSL).
INSERT INTO impostazioni (chiave, valore) VALUES
  ('smtp_host',      ''),
  ('smtp_port',      '465'),
  ('smtp_user',      ''),
  ('smtp_from_name', ''),
  ('smtp_secure',    'true')
ON CONFLICT (chiave) DO NOTHING;
