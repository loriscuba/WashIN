-- migrations_v47: fogli ore settimanali a crocette e ore rendicontate sui contratti
--
-- Da incollare nel SQL Editor DOPO v43 e v46 (usa contratti_servizi,
-- contratti_operatori e public.is_admin()). Idempotente, non tocca dati esistenti.
--
-- Come funziona
--   fogli_ore              un foglio = una pagina A4 stampata per un'operatrice e una
--                          settimana (lunedì-domenica). Il QR stampato contiene l'id.
--   fogli_ore_righe        le righe stampate sul foglio (1-15): contratto + servizio e
--                          minuti previsti al momento della stampa. Le righe senza
--                          contratto sono quelle libere per gli extra.
--   ore_rendicontate       una riga per ogni intervento fatto (X sul foglio), con i
--                          minuti effettivi: quelli del contratto, oppure quelli della
--                          sezione VARIAZIONI se l'operatrice li ha segnati.
--   v_rendiconto_contratti_mese
--                          per contratto e mese: interventi, ore rendicontate,
--                          tempo extra rispetto al previsto (variazioni),
--                          ore previste da contratto e scostamento.

-- ── 1. Fogli ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fogli_ore (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             bigserial UNIQUE,              -- stampato come FO-000123
  operatore_id       uuid NOT NULL REFERENCES public.profili(id) ON DELETE CASCADE,
  settimana_inizio   date NOT NULL CHECK (extract(isodow FROM settimana_inizio) = 1),
  pagina             integer NOT NULL DEFAULT 1,
  pagine             integer NOT NULL DEFAULT 1,
  stato              text NOT NULL DEFAULT 'stampato'
                     CHECK (stato IN ('stampato','importato','annullato')),
  importato_at       timestamptz,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fogli_ore_settimana_idx ON public.fogli_ore (settimana_inizio, operatore_id);

CREATE TABLE IF NOT EXISTS public.fogli_ore_righe (
  foglio_id          uuid NOT NULL REFERENCES public.fogli_ore(id) ON DELETE CASCADE,
  riga               integer NOT NULL CHECK (riga BETWEEN 1 AND 15),
  contratto_id       uuid REFERENCES public.contratti(id) ON DELETE SET NULL,
  servizio_id        uuid REFERENCES public.contratti_servizi(id) ON DELETE SET NULL,
  codice             text,          -- numero contratto stampato, es. C-042
  etichetta          text,          -- es. "Bellotto 1"
  dettaglio          text,          -- es. "Lavaggio · 45' · 1 v/settimana"
  minuti_previsti    integer CHECK (minuti_previsti IS NULL OR minuti_previsti >= 0),
  PRIMARY KEY (foglio_id, riga)
);

-- ── 2. Ore rendicontate ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ore_rendicontate (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratto_id       uuid NOT NULL REFERENCES public.contratti(id) ON DELETE CASCADE,
  servizio_id        uuid REFERENCES public.contratti_servizi(id) ON DELETE SET NULL,
  operatore_id       uuid REFERENCES public.profili(id) ON DELETE SET NULL,
  data               date NOT NULL,
  minuti             integer NOT NULL CHECK (minuti >= 0),
  minuti_previsti    integer,
  variazione         boolean NOT NULL DEFAULT false,   -- tempo diverso dal previsto
  fonte              text NOT NULL DEFAULT 'foglio' CHECK (fonte IN ('foglio','manuale')),
  foglio_id          uuid REFERENCES public.fogli_ore(id) ON DELETE CASCADE,
  riga               integer,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ore_rendicontate_contratto_idx ON public.ore_rendicontate (contratto_id, data);
CREATE INDEX IF NOT EXISTS ore_rendicontate_operatore_idx ON public.ore_rendicontate (operatore_id, data);
-- Un foglio reimportato sostituisce le sue ore: una sola riga per foglio/riga/giorno
CREATE UNIQUE INDEX IF NOT EXISTS ore_rendicontate_foglio_uq
  ON public.ore_rendicontate (foglio_id, riga, data) WHERE foglio_id IS NOT NULL;

-- ── 3. Riepilogo per contratto e mese ───────────────────────────────────────
DROP VIEW IF EXISTS public.v_rendiconto_contratti_mese;
CREATE VIEW public.v_rendiconto_contratti_mese
WITH (security_invoker = true) AS
WITH ore AS (
  SELECT contratto_id,
         date_trunc('month', data)::date                AS mese,
         count(*)                                       AS interventi,
         sum(minuti)                                    AS minuti,
         sum(minuti_previsti)                           AS minuti_previsti_interventi,
         sum(minuti - minuti_previsti) FILTER (WHERE minuti_previsti IS NOT NULL) AS minuti_extra,
         count(*) FILTER (WHERE variazione)             AS variazioni
  FROM public.ore_rendicontate
  GROUP BY 1, 2
),
previste AS (
  SELECT contratto_id, round(sum(ore_mensili), 2) AS ore_previste_mese
  FROM public.contratti_servizi
  GROUP BY 1
)
SELECT o.contratto_id,
       o.mese,
       k.numero_contratto,
       coalesce(c.nome_breve, c.ragione_sociale)         AS condominio,
       o.interventi,
       o.variazioni,
       round(o.minuti / 60.0, 2)                         AS ore_rendicontate,
       round(o.minuti_previsti_interventi / 60.0, 2)     AS ore_previste_interventi,
       round(o.minuti_extra / 60.0, 2)                   AS ore_extra,
       p.ore_previste_mese,
       round(o.minuti / 60.0 - coalesce(p.ore_previste_mese, 0), 2) AS scostamento_ore
FROM ore o
JOIN public.contratti k ON k.id = o.contratto_id
LEFT JOIN public.clienti c ON c.id = k.cliente_id
LEFT JOIN previste p ON p.contratto_id = o.contratto_id;

-- ── 4. Permessi: solo admin ─────────────────────────────────────────────────
ALTER TABLE public.fogli_ore        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fogli_ore_righe  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ore_rendicontate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all ON public.fogli_ore;
CREATE POLICY admin_all ON public.fogli_ore
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS admin_all ON public.fogli_ore_righe;
CREATE POLICY admin_all ON public.fogli_ore_righe
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS admin_all ON public.ore_rendicontate;
CREATE POLICY admin_all ON public.ore_rendicontate
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.fogli_ore, public.fogli_ore_righe, public.ore_rendicontate,
              public.v_rendiconto_contratti_mese FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fogli_ore, public.fogli_ore_righe,
              public.ore_rendicontate TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fogli_ore_numero_seq TO authenticated;
GRANT SELECT ON public.v_rendiconto_contratti_mese TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'v47 ok' AS esito;
