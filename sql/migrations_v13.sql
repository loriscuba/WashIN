-- migrations_v13.sql
-- Nuova tabella "fornitori" per la gestione standard dei fornitori
-- (prodotti chimici/detergenza, materiali consumo, attrezzature, DPI, noleggi, manutenzione...)

CREATE TABLE IF NOT EXISTS fornitori (
  id                    uuid primary key default gen_random_uuid(),
  ragione_sociale       text not null,
  piva                  text,
  codice_fiscale        text,
  categoria             text,
  referente             text,
  email                 text,
  telefono              text,
  indirizzo             text,
  citta                 text,
  cap                   text,
  provincia             text,
  iban                  text,
  termini_pagamento     text,
  tempi_consegna_giorni integer,
  ordine_minimo         numeric,
  sconto_concordato     numeric,
  certificazioni        text,
  valutazione           integer,
  note                  text,
  attivo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

ALTER TABLE fornitori ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_all" ON fornitori;
CREATE POLICY "auth_users_all" ON fornitori FOR ALL TO authenticated USING (true) WITH CHECK (true);
