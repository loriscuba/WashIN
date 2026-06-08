-- migrations_v8.sql
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
  -- pgcrypto è nello schema extensions in Supabase
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utente auth non trovato (id: %)', target_user_id;
  END IF;
END;
$$;

-- Permetti l'esecuzione agli utenti autenticati
GRANT EXECUTE ON FUNCTION admin_set_user_password(uuid, text) TO authenticated;
