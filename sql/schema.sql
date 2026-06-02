-- schema.sql
-- Schema Supabase per WashIN

-- Tabella profili collegata a auth.users
CREATE TABLE IF NOT EXISTS profili (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  nome text,
  cognome text,
  email text,
  telefono text,
  ruolo text CHECK (ruolo IN ('admin','operatore')),
  codice_fiscale text,
  data_assunzione date,
  qualifica text,
  attivo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clienti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ragione_sociale text NOT NULL,
  tipo text CHECK (tipo IN ('privato','azienda','condominio')),
  indirizzo text,
  citta text,
  cap text,
  referente text,
  telefono text,
  email text,
  note text,
  attivo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sedi_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clienti(id),
  nome_sede text,
  indirizzo text,
  piano text,
  mq_totali numeric,
  note_accesso text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contratti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clienti(id),
  numero_contratto text,
  tipo text CHECK (tipo IN ('una_tantum','ricorrente','appalto')),
  data_inizio date,
  data_fine date,
  importo_mensile numeric,
  ore_contratto_mensili numeric,
  frequenza text CHECK (frequenza IN ('giornaliera','settimanale','mensile')),
  stato text CHECK (stato IN ('attivo','scaduto','sospeso')) DEFAULT 'attivo',
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interventi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratto_id uuid REFERENCES contratti(id),
  sede_id uuid REFERENCES sedi_cliente(id),
  operatore_id uuid REFERENCES profili(id),
  data_pianificata date NOT NULL,
  ora_inizio_pianificata time,
  ora_fine_pianificata time,
  ora_inizio_effettiva time,
  ora_fine_effettiva time,
  stato text CHECK (stato IN ('pianificato','in_corso','completato','annullato','approvato')) DEFAULT 'pianificato',
  tipo_pulizia text CHECK (tipo_pulizia IN ('ordinaria','straordinaria','sanificazione','post_cantiere')),
  note_operatore text,
  firma_cliente boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo_pulizia text,
  voci jsonb DEFAULT '[]',
  attivo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_compilate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervento_id uuid REFERENCES interventi(id),
  template_id uuid REFERENCES checklist_template(id),
  voci_compilate jsonb DEFAULT '{}',
  completamento_pct numeric DEFAULT 0,
  note text,
  compiled_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fatture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clienti(id),
  contratto_id uuid REFERENCES contratti(id),
  numero_fattura text,
  mese date,
  data_emissione date DEFAULT CURRENT_DATE,
  imponibile numeric,
  iva_pct numeric DEFAULT 22,
  totale numeric,
  stato text CHECK (stato IN ('bozza','emessa','pagata','scaduta')) DEFAULT 'bozza',
  data_scadenza date,
  data_pagamento date,
  metodo_pagamento text,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Abilita Row Level Security su tutte le tabelle
ALTER TABLE profili ENABLE ROW LEVEL SECURITY;
ALTER TABLE clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedi_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratti ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventi ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_compilate ENABLE ROW LEVEL SECURITY;
ALTER TABLE fatture ENABLE ROW LEVEL SECURITY;

-- Policy permissiva per utenti autenticati
CREATE POLICY "auth_users_all" ON profili FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON clienti FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON sedi_cliente FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON contratti FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON interventi FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON checklist_template FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON checklist_compilate FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_users_all" ON fatture FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger per creare un profilo utente di default al momento della registrazione
CREATE FUNCTION create_profile_after_signup()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profili (id, email, ruolo, created_at)
  VALUES (NEW.id, NEW.email, 'operatore', now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_profile_after_signup();
