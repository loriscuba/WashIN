-- v24: Separa profili da auth.users — aggiunge user_id come FK nullable
-- Eseguire su Supabase → SQL Editor

-- 1. Aggiungi colonna user_id (nullable, FK → auth.users)
ALTER TABLE profili
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Indice univoco (solo sulle righe non NULL)
CREATE UNIQUE INDEX IF NOT EXISTS profili_user_id_key
  ON profili(user_id) WHERE user_id IS NOT NULL;

-- 3. Backfill: i profili che hanno già un auth user (id corrisponde)
UPDATE profili p
SET user_id = p.id
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND p.user_id IS NULL;

-- 4. Aggiorna il trigger handle_new_user: imposta anche user_id sulla riga creata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profili (id, user_id, email, ruolo)
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'ruolo', 'operatore')
  )
  ON CONFLICT (id) DO UPDATE
    SET user_id = NEW.id,
        email   = COALESCE(EXCLUDED.email, profili.email);
  RETURN NEW;
END;
$$;

-- 5. RLS: aggiorna la policy operatori self-select (se esiste) per usare user_id
--    Gli admin continuano a leggere tutto tramite la policy auth_users_all.
--    Se usi una policy tipo "operatori vedono solo se stessi", aggiornala così:
--
--    DROP POLICY IF EXISTS "operatori_self" ON profili;
--    CREATE POLICY "operatori_self" ON profili
--      FOR SELECT TO authenticated
--      USING (user_id = auth.uid() OR EXISTS (
--        SELECT 1 FROM profili p2 WHERE p2.user_id = auth.uid() AND p2.ruolo = 'admin'
--      ));
--
--    Lasciato commentato: adatta alle policy effettive del tuo progetto.
