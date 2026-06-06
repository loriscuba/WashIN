-- migrations_v7.sql
-- RLS policy for preventivi table (and other tables added post-schema)

-- preventivi
ALTER TABLE preventivi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON preventivi;
CREATE POLICY "auth_users_all" ON preventivi FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- magazzino (added in v3)
ALTER TABLE magazzino ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON magazzino;
CREATE POLICY "auth_users_all" ON magazzino FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- materiali_intervento
ALTER TABLE materiali_intervento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON materiali_intervento;
CREATE POLICY "auth_users_all" ON materiali_intervento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- notifiche
ALTER TABLE notifiche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON notifiche;
CREATE POLICY "auth_users_all" ON notifiche FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- veicoli (added in v5)
ALTER TABLE veicoli ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON veicoli;
CREATE POLICY "auth_users_all" ON veicoli FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- veicoli_documenti (added in v5)
ALTER TABLE veicoli_documenti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON veicoli_documenti;
CREATE POLICY "auth_users_all" ON veicoli_documenti FOR ALL TO authenticated USING (true) WITH CHECK (true);
