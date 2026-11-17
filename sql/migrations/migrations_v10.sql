-- migrations_v10.sql
-- RLS policies for interventi: allow operators to read/update their own rows

ALTER TABLE interventi ENABLE ROW LEVEL SECURITY;

-- Admin: full access
DROP POLICY IF EXISTS "admin_interventi_all" ON interventi;
CREATE POLICY "admin_interventi_all" ON interventi
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profili WHERE id = auth.uid() AND ruolo = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profili WHERE id = auth.uid() AND ruolo = 'admin'));

-- Operatori: read own interventions
DROP POLICY IF EXISTS "operatori_interventi_select" ON interventi;
CREATE POLICY "operatori_interventi_select" ON interventi
  FOR SELECT TO authenticated
  USING (operatore_id = auth.uid() OR operatore2_id = auth.uid());

-- Operatori: update own interventions (stato, inizio_effettivo, fine_effettivo, geo fields)
DROP POLICY IF EXISTS "operatori_interventi_update" ON interventi;
CREATE POLICY "operatori_interventi_update" ON interventi
  FOR UPDATE TO authenticated
  USING (operatore_id = auth.uid() OR operatore2_id = auth.uid())
  WITH CHECK (operatore_id = auth.uid() OR operatore2_id = auth.uid());
