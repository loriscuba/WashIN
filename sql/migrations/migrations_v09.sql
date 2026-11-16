-- migrations_v9.sql
-- Conferma email utente senza SMTP (usata dopo admin signUp)

CREATE OR REPLACE FUNCTION admin_confirm_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT ruolo FROM profili WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_confirm_user(uuid) TO authenticated;
