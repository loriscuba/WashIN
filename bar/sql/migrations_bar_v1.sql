-- migrations_bar_v1.sql — Menu bar con QR code per i tavoli
-- Tabelle con prefisso bar_ nello schema public (nessuna configurazione extra della Data API).
-- Lettura pubblica (anon) per il menu; scrittura solo per utenti WashIN con ruolo 'admin'.

-- Helper: l'utente corrente è admin in profili?
CREATE OR REPLACE FUNCTION public.bar_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profili
    WHERE id = auth.uid() AND ruolo = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.bar_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_is_admin() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.bar_categorie (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL UNIQUE,
  ordine     integer NOT NULL DEFAULT 0,
  attiva     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bar_prodotti (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.bar_categorie(id) ON DELETE RESTRICT,
  nome         text NOT NULL,
  variante     text,
  descrizione  text,
  prezzo       numeric(7,2) NOT NULL CHECK (prezzo >= 0),
  surgelato    boolean NOT NULL DEFAULT false,
  disponibile  boolean NOT NULL DEFAULT true,
  ordine       integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bar_prodotti_categoria_idx ON public.bar_prodotti (categoria_id, ordine);

CREATE TABLE IF NOT EXISTS public.bar_tavoli (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etichetta  text NOT NULL UNIQUE,   -- es. "1", "12", "Terrazza 3"
  ordine     integer NOT NULL DEFAULT 0,
  attivo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Impostazioni (riga singola, id = 1)
CREATE TABLE IF NOT EXISTS public.bar_impostazioni (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_bar    text NOT NULL DEFAULT 'Il nostro Bar',
  sottotitolo text,
  nota_piede  text DEFAULT '* Prodotto surgelato. Per informazioni su allergeni chiedere al personale.',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.bar_impostazioni (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at automatico
CREATE OR REPLACE FUNCTION public.bar_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bar_prodotti_touch ON public.bar_prodotti;
CREATE TRIGGER bar_prodotti_touch BEFORE UPDATE ON public.bar_prodotti
  FOR EACH ROW EXECUTE FUNCTION public.bar_touch_updated_at();

DROP TRIGGER IF EXISTS bar_impostazioni_touch ON public.bar_impostazioni;
CREATE TRIGGER bar_impostazioni_touch BEFORE UPDATE ON public.bar_impostazioni
  FOR EACH ROW EXECUTE FUNCTION public.bar_touch_updated_at();

-- RLS
ALTER TABLE public.bar_categorie    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_prodotti     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_tavoli       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_impostazioni ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bar_categorie','bar_prodotti','bar_tavoli','bar_impostazioni'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "bar_public_read" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "bar_admin_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "bar_admin_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "bar_admin_delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "bar_public_read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "bar_admin_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.bar_is_admin()))', t);
    EXECUTE format('CREATE POLICY "bar_admin_update" ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.bar_is_admin())) WITH CHECK ((SELECT public.bar_is_admin()))', t);
    EXECUTE format('CREATE POLICY "bar_admin_delete" ON public.%I FOR DELETE TO authenticated USING ((SELECT public.bar_is_admin()))', t);
  END LOOP;
END $$;

GRANT SELECT ON public.bar_categorie, public.bar_prodotti, public.bar_tavoli, public.bar_impostazioni TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_categorie, public.bar_prodotti, public.bar_tavoli, public.bar_impostazioni TO authenticated;
