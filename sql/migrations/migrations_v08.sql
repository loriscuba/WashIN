-- migrations_v8.sql
-- Funzioni RPC per gestione utenti senza SMTP

-- Ritorna gli ID degli utenti presenti in auth.users
-- (per distinguere chi ha un account di login da chi ha solo un profilo)
CREATE OR REPLACE FUNCTION get_auth_user_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users;
$$;

GRANT EXECUTE ON FUNCTION get_auth_user_ids() TO authenticated;

-- Funzione RPC per reset password senza SMTP
-- SECURITY DEFINER: gira con i privilegi del proprietario (può scrivere su auth.users)
-- Usa extensions.crypt/gen_salt perché pgcrypto è nello schema extensions in Supabase

CREATE OR REPLACE FUNCTION admin_set_user_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo gli admin possono chiamare questa funzione
  IF (SELECT ruolo FROM profili WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
  END IF;

  -- Password minima 6 caratteri
  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'La password deve essere di almeno 6 caratteri';
  END IF;

  -- Aggiorna direttamente in auth.users (bcrypt compatibile con GoTrue)
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun account di accesso trovato per questo utente. Crea prima l''account dalla sezione Utenti → Nuovo utente.';
  END IF;
END;
$$;

-- Permetti l'esecuzione agli utenti autenticati
GRANT EXECUTE ON FUNCTION admin_set_user_password(uuid, text) TO authenticated;
