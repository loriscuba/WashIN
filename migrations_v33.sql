-- migrations_v33.sql — Template lettera per preventivi

CREATE TABLE IF NOT EXISTS modelli_preventivo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('condominio','hotel','uffici','facchinaggio','altro')),
  descrizione   text,
  attivo        boolean NOT NULL DEFAULT true,
  servizi_default jsonb NOT NULL DEFAULT '[]',
  clausole      jsonb NOT NULL DEFAULT '{}',
  configurazione jsonb NOT NULL DEFAULT '{}',
  creato_a      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS modello_id uuid REFERENCES modelli_preventivo(id);
ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS lettera_data jsonb;

-- Seed: modello Condominio
INSERT INTO modelli_preventivo (nome, tipo, descrizione, servizi_default, clausole, configurazione)
VALUES (
  'Condominio',
  'condominio',
  'Offerta commerciale per servizi di pulizia scala condominiale',
  '[
    "Spazzatura e lavaggio scala",
    "Pulizia portone",
    "Spolveratura cassette della posta",
    "Eliminazione ragnatele",
    "Pulizia corrimano",
    "Pulizia ascensore"
  ]'::jsonb,
  '{
    "materiali": "I materiali di pulizia sono a carico della ditta appaltatrice.",
    "assicurazione": "Gli eventuali danni che il personale dovesse causare durante l''esecuzione del servizio saranno coperti dalla nostra polizza assicurativa.",
    "incluso_vetri": "È inclusa nel preventivo la pulizia dei vetri, degli infissi, dei davanzali e della rampa garage da eseguirsi una volta al mese."
  }'::jsonb,
  '{
    "luogo_default": "Quiliano",
    "oggetto": "Servizio di pulizia scala condominiale",
    "intro": "Facciamo seguito al Vostro gradito invito per formularVi la nostra migliore offerta relativa al servizio di pulizia da eseguirsi {FREQUENZA} con le seguenti modalità:"
  }'::jsonb
)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE modelli_preventivo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_users_all" ON modelli_preventivo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
