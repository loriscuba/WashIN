-- Migration v39: sicurezza profili e funzioni RPC
--
-- 1. profili: prima qualsiasi utente autenticato poteva modificare/creare/eliminare
--    qualsiasi profilo, incluso il proprio ruolo (operatore -> admin).
--    Ora: lettura invariata; INSERT/DELETE solo admin; UPDATE admin su tutti,
--    operatore solo sul proprio profilo e solo avatar_url.
-- 2. get_auth_user_ids(): era eseguibile anche senza login e restituiva tutti gli
--    id di auth.users. Ora solo admin autenticati.
-- 3. admin_set_user_password / admin_confirm_user: il controllo admin usava solo
--    profili.id; ora usa is_admin() (id o user_id), come il resto dell'app.
-- 4. Revoca EXECUTE da anon sulle funzioni SECURITY DEFINER che non servono senza login.

-- Helper unico: l'utente corrente è admin? (profili collegati via user_id o, per i
-- profili creati da utenti.js, via id)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profili
    WHERE auth.uid() IN (id, user_id) AND ruolo = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ── 1. profili ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_users_all"          ON public.profili;
DROP POLICY IF EXISTS "profili_select"          ON public.profili;
DROP POLICY IF EXISTS "profili_insert_admin"    ON public.profili;
DROP POLICY IF EXISTS "profili_update_admin"    ON public.profili;
DROP POLICY IF EXISTS "profili_update_self"     ON public.profili;
DROP POLICY IF EXISTS "profili_delete_admin"    ON public.profili;

CREATE POLICY "profili_select" ON public.profili
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profili_insert_admin" ON public.profili
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "profili_update_admin" ON public.profili
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "profili_update_self" ON public.profili
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IN (id, user_id))
  WITH CHECK ((SELECT auth.uid()) IN (id, user_id));
CREATE POLICY "profili_delete_admin" ON public.profili
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- Un non-admin può modificare solo avatar_url sul proprio profilo.
-- Si applica solo alle richieste dell'API (ruoli anon/authenticated): service_role
-- (edge function) e trigger SECURITY DEFINER non sono toccati.
CREATE OR REPLACE FUNCTION public.profili_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF (to_jsonb(NEW) - 'avatar_url') IS DISTINCT FROM (to_jsonb(OLD) - 'avatar_url')
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Accesso negato: puoi modificare solo la tua foto profilo'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profili_guard_update ON public.profili;
CREATE TRIGGER profili_guard_update BEFORE UPDATE ON public.profili
  FOR EACH ROW EXECUTE FUNCTION public.profili_guard_update();

-- ── 2. get_auth_user_ids ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_auth_user_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id FROM auth.users u WHERE public.is_admin();
$$;
REVOKE ALL ON FUNCTION public.get_auth_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_user_ids() TO authenticated;

-- ── 3. admin_confirm_user / admin_set_user_password ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_confirm_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accesso negato: richiesto ruolo admin';
  END IF;
  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'La password deve essere di almeno 6 caratteri';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun account di accesso trovato per questo utente. Crea prima l''account dalla sezione Utenti → Nuovo utente.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO authenticated;

-- ── 4. Funzioni trigger e di calcolo: non servono all'utente anonimo ─────────
-- (i trigger continuano a funzionare: EXECUTE non viene controllato quando scattano)
REVOKE ALL ON FUNCTION public.create_profile_after_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'calcola_costo_operatore' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
