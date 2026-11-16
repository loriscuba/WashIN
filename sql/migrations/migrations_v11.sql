-- migrations_v11.sql
-- Foto profilo: colonna avatar_url su profili + bucket Supabase Storage

-- 1. Aggiungi colonna avatar_url alla tabella profili
ALTER TABLE profili ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Crea il bucket "avatars" (pubblico, max 10 MB per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS su storage.objects per il bucket avatars

-- Chiunque può leggere (bucket pubblico)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Ogni utente autenticato può caricare solo dentro la propria cartella (userId/...)
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Ogni utente può aggiornare solo i propri file
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Ogni utente può eliminare solo i propri file
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );
