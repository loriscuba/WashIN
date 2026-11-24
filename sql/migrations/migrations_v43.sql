-- migrations_v43: anagrafica contratti condomini
--
-- Da applicare a mano dal SQL Editor, DOPO v41 e v42 (usa public.is_admin()).
-- Idempotente: si può rilanciare senza rischi. Non cancella né modifica dati esistenti.
-- Il caricamento dell'elenco condomini è nella v44 (migrations_v44_import_condomini.sql).
--
-- Cosa aggiunge
--   amministratori          nuova tabella: studi/amministratori di condominio
--   clienti                 dati del condominio: nome breve, CF, fatturazione elettronica,
--                           amministratore, referente in loco, struttura dello stabile
--   contratti               durata e disdetta, servizi inclusi, condizioni economiche,
--                           dati operativi (chiavi, acqua/luce, materiali, operatore)
--                           e il testo originale dell'elenco importato
--   contratti_servizi       nuova tabella: una riga per ogni servizio del contratto
--                           (es. scopatura 0,30 1 v sett + lavaggio 0,45 2 v mese)
--
-- Convenzioni dei servizi
--   minuti_intervento   durata di un intervento in minuti ("0,30" = 30, "1,15" = 75)
--   interventi_numero   quante volte nel periodo ("2 v mese" = 2)
--   interventi_periodo  giorno | settimana | mese | anno | a_richiesta
--   prezzo_unita        mese | anno | intervento | ora
--   ore_mensili         colonna calcolata: settimana = 52/12 volte, giorno = 21,7 giorni lavorativi

-- ── 1. Amministratori ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.amministratori (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,            -- ragione sociale / studio
  referente       text,
  telefono        text,
  email           text,
  pec             text,
  indirizzo       text,
  citta           text,
  note            text,
  attivo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS amministratori_nome_uq ON public.amministratori (lower(nome));

-- ── 2. Clienti: dati del condominio ─────────────────────────────────────────
ALTER TABLE public.clienti
  ADD COLUMN IF NOT EXISTS nome_breve          text,     -- come lo chiamiamo noi, es. "Aurelia 58"
  ADD COLUMN IF NOT EXISTS codice_fiscale      text,
  ADD COLUMN IF NOT EXISTS pec                 text,
  ADD COLUMN IF NOT EXISTS codice_sdi          text,
  ADD COLUMN IF NOT EXISTS split_payment       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amministratore_id   uuid REFERENCES public.amministratori(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referente_in_loco   text,     -- es. consigliere
  ADD COLUMN IF NOT EXISTS telefono_referente  text,
  ADD COLUMN IF NOT EXISTS num_scale           integer,
  ADD COLUMN IF NOT EXISTS num_piani           integer,
  ADD COLUMN IF NOT EXISTS num_interni         integer,
  ADD COLUMN IF NOT EXISTS ascensore           boolean,
  ADD COLUMN IF NOT EXISTS cortile             boolean,
  ADD COLUMN IF NOT EXISTS garage              boolean,
  ADD COLUMN IF NOT EXISTS cantine             boolean;

-- Chiave per riconoscere un condominio dal nome usato in ufficio (minuscolo, spazi singoli)
CREATE OR REPLACE FUNCTION public.normalizza_nome(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(regexp_replace(lower(trim(t)), '\s+', ' ', 'g'), '');
$$;
CREATE UNIQUE INDEX IF NOT EXISTS clienti_nome_breve_uq
  ON public.clienti (public.normalizza_nome(nome_breve))
  WHERE nome_breve IS NOT NULL;
CREATE INDEX IF NOT EXISTS clienti_amministratore_idx ON public.clienti (amministratore_id);

-- ── 3. Contratti ────────────────────────────────────────────────────────────
ALTER TABLE public.contratti
  -- durata
  ADD COLUMN IF NOT EXISTS rinnovo_tacito            boolean,
  ADD COLUMN IF NOT EXISTS preavviso_disdetta_giorni integer,
  -- servizio
  ADD COLUMN IF NOT EXISTS servizi_inclusi           text[] NOT NULL DEFAULT '{}',  -- scale, vetri, androne, bidoni, aree_esterne, ...
  ADD COLUMN IF NOT EXISTS giorni_preferiti          text,
  ADD COLUMN IF NOT EXISTS extra_a_parte             text,
  -- economico
  ADD COLUMN IF NOT EXISTS prezzo_ottimale_mensile   numeric,
  ADD COLUMN IF NOT EXISTS iva_inclusa               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modalita_pagamento        text,      -- bonifico, RiBa, ...
  ADD COLUMN IF NOT EXISTS termini_pagamento_giorni  integer,
  ADD COLUMN IF NOT EXISTS adeguamento_istat         boolean,
  ADD COLUMN IF NOT EXISTS note_economiche           text,
  -- operativo
  ADD COLUMN IF NOT EXISTS materiali_a_carico        text,      -- impresa | condominio
  ADD COLUMN IF NOT EXISTS codice_portone            text,
  ADD COLUMN IF NOT EXISTS chiavi                    text,      -- chi ha le chiavi / dove si ritirano
  ADD COLUMN IF NOT EXISTS punto_acqua               text,
  ADD COLUMN IF NOT EXISTS punto_luce                text,
  ADD COLUMN IF NOT EXISTS ripostiglio               text,
  ADD COLUMN IF NOT EXISTS note_accesso              text,
  ADD COLUMN IF NOT EXISTS operatore_id              uuid REFERENCES public.profili(id) ON DELETE SET NULL,
  -- testo originale dell'elenco importato (non si modifica dall'app)
  ADD COLUMN IF NOT EXISTS tempo_originale           text,
  ADD COLUMN IF NOT EXISTS prezzo_originale          text,
  ADD COLUMN IF NOT EXISTS prezzo_ottimale_originale text,
  ADD COLUMN IF NOT EXISTS fonte_import              text;      -- es. 'elenco-condomini-2026-11'

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratti_materiali_a_carico_chk') THEN
    ALTER TABLE public.contratti ADD CONSTRAINT contratti_materiali_a_carico_chk
      CHECK (materiali_a_carico IS NULL OR materiali_a_carico IN ('impresa','condominio'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS contratti_operatore_idx ON public.contratti (operatore_id);

-- ── 4. Servizi del contratto ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contratti_servizi (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratto_id        uuid NOT NULL REFERENCES public.contratti(id) ON DELETE CASCADE,
  ordine              integer NOT NULL DEFAULT 0,
  descrizione         text,             -- es. scopatura, lavaggio, cortile, vetri
  tempo_testo         text,             -- testo originale, es. "0,30 2 v mese"
  minuti_intervento   integer CHECK (minuti_intervento IS NULL OR minuti_intervento >= 0),
  interventi_numero   numeric CHECK (interventi_numero IS NULL OR interventi_numero >= 0),
  interventi_periodo  text CHECK (interventi_periodo IS NULL OR interventi_periodo IN ('giorno','settimana','mese','anno','a_richiesta')),
  prezzo              numeric,
  prezzo_unita        text CHECK (prezzo_unita IS NULL OR prezzo_unita IN ('mese','anno','intervento','ora')),
  prezzo_ottimale     numeric,
  note                text,
  ore_mensili numeric GENERATED ALWAYS AS (
    round(
      minuti_intervento / 60.0 * interventi_numero *
      CASE interventi_periodo
        WHEN 'giorno'    THEN 21.7
        WHEN 'settimana' THEN 52.0 / 12
        WHEN 'mese'      THEN 1
        WHEN 'anno'      THEN 1.0 / 12
      END, 2)
  ) STORED,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratti_servizi_contratto_idx ON public.contratti_servizi (contratto_id, ordine);

-- ── 5. Permessi (come v42: tutto all'admin) ─────────────────────────────────
ALTER TABLE public.amministratori    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratti_servizi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all ON public.amministratori;
CREATE POLICY admin_all ON public.amministratori
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_all ON public.contratti_servizi;
CREATE POLICY admin_all ON public.contratti_servizi
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- L'operatore vede i servizi dei contratti dei propri interventi (come contratti in v42)
DROP POLICY IF EXISTS op_select ON public.contratti_servizi;
CREATE POLICY op_select ON public.contratti_servizi
  FOR SELECT TO authenticated
  USING (contratto_id IN (SELECT contratto_id FROM public.interventi
                          WHERE id IN (SELECT public.miei_interventi_ids())));

REVOKE ALL ON public.amministratori, public.contratti_servizi FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amministratori, public.contratti_servizi TO authenticated;
