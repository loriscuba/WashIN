-- ============================================================
-- DEMO DATA - WashIN
-- Eseguire DOPO le migrazioni:
--   ALTER TABLE profili ALTER COLUMN id SET DEFAULT gen_random_uuid();
--   ALTER TABLE profili DROP CONSTRAINT IF EXISTS profili_id_fkey;
--   ALTER TABLE sedi_cliente ADD COLUMN IF NOT EXISTS contratto_id uuid REFERENCES contratti(id);
--   ALTER TABLE interventi ADD COLUMN IF NOT EXISTS inizio_effettivo timestamptz;
--   ALTER TABLE interventi ADD COLUMN IF NOT EXISTS fine_effettivo timestamptz;
--   ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_inizio_lat double precision;
--   ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_inizio_lng double precision;
--   ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_fine_lat double precision;
--   ALTER TABLE interventi ADD COLUMN IF NOT EXISTS geo_fine_lng double precision;
-- ============================================================

-- 1. OPERATORI
INSERT INTO profili (id, nome, cognome, email, telefono, qualifica, attivo, ruolo) VALUES
  ('a1000000-0000-0000-0000-000000000001','Marco','Rossi','marco.rossi@washin.it','333 1234567','Capo squadra',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000002','Giulia','Bianchi','giulia.bianchi@washin.it','333 2345678','Addetta pulizie',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000003','Antonio','Ferretti','antonio.ferretti@washin.it','333 3456789','Operaio specializzato',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000004','Francesca','Marino','francesca.marino@washin.it','333 4567890','Addetta pulizie',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000005','Luca','De Santis','luca.desantis@washin.it','333 5678901','Capo squadra',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000006','Valentina','Esposito','valentina.esposito@washin.it','333 6789012','Addetta pulizie',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000007','Roberto','Conti','roberto.conti@washin.it','333 7890123','Operaio specializzato',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000008','Sara','Lombardi','sara.lombardi@washin.it','333 8901234','Addetta pulizie',true,'operatore'),
  ('a1000000-0000-0000-0000-000000000009','Diego','Mancini','diego.mancini@washin.it','333 9012345','Operaio specializzato',false,'operatore'),
  ('a1000000-0000-0000-0000-000000000010','Elena','Ricci','elena.ricci@washin.it','333 0123456','Addetta pulizie',true,'operatore')
ON CONFLICT (id) DO NOTHING;

-- 2. CLIENTI
INSERT INTO clienti (id, ragione_sociale, tipo, indirizzo, citta, cap, referente, telefono, email, attivo) VALUES
  ('b1000000-0000-0000-0000-000000000001','Studio Legale Moretti & Associati','azienda','Via Montenapoleone 8','Milano','20121','Avv. Claudio Moretti','02 1234 5678','amministrazione@moretti-law.it',true),
  ('b1000000-0000-0000-0000-000000000002','Condominio Residenza Aurora','condominio','Via delle Magnolie 24','Milano','20137','Geom. Sergio Fontana','02 2345 6789','aurora.cond@gmail.com',true),
  ('b1000000-0000-0000-0000-000000000003','Ristorante Da Luigi S.r.l.','azienda','Corso Buenos Aires 55','Milano','20124','Luigi Caruso','02 3456 7890','info@daluigi.it',true),
  ('b1000000-0000-0000-0000-000000000004','Hotel Belvedere S.p.A.','azienda','Via Vittorio Emanuele 12','Bergamo','24121','Dott.ssa Anna Ferraro','035 123 456','operativo@hotelbelvedere.it',true),
  ('b1000000-0000-0000-0000-000000000005','Farmacia Centrale Rossi','azienda','Piazza del Duomo 3','Lecco','23900','Dott. Franco Rossi','0341 12 3456','farmacia@rossicentralelc.it',true),
  ('b1000000-0000-0000-0000-000000000006','Condominio Torre Verde','condominio','Via Novara 88','Milano','20153','Ing. Paola Galli','02 4567 8901','torreverde.amm@libero.it',true),
  ('b1000000-0000-0000-0000-000000000007','Centro Medico Salute S.r.l.','azienda','Viale Brianza 15','Monza','20900','Dr. Matteo Colombo','039 234 5678','segreteria@centrosalutemonza.it',true),
  ('b1000000-0000-0000-0000-000000000008','Supermercato Freschi S.r.l.','azienda','Via Lorenteggio 142','Milano','20146','Maria Grazia Pini','02 5678 9012','direttore@freschimilano.it',true),
  ('b1000000-0000-0000-0000-000000000009','Famiglia Zanetti','privato','Via Como 7','Monza','20900','Sig. Giorgio Zanetti','347 123 4567','giorgio.zanetti@gmail.com',true),
  ('b1000000-0000-0000-0000-000000000010','Palestra FitLife S.r.l.','azienda','Via Padova 98','Milano','20127','Simone Ferretti','02 6789 0123','info@fitlifemilano.it',true)
ON CONFLICT (id) DO NOTHING;

-- 3. CONTRATTI
INSERT INTO contratti (id, cliente_id, numero_contratto, tipo, data_inizio, data_fine, importo_mensile, ore_contratto_mensili, frequenza, stato, note) VALUES
  ('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','CNTR-2025-001','ricorrente','2025-01-01','2026-12-31',1800.00,24,'settimanale','attivo','Pulizia uffici e sale riunioni'),
  ('c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002','CNTR-2025-002','ricorrente','2025-03-01','2027-02-28',2400.00,32,'settimanale','attivo','Scale, corridoi, locali comuni'),
  ('c1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000003','CNTR-2025-003','ricorrente','2025-02-01','2026-01-31',1200.00,20,'giornaliera','attivo','Cucina e sala ristorante'),
  ('c1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000004','CNTR-2025-004','appalto','2025-04-01','2028-03-31',5500.00,80,'giornaliera','attivo','Pulizia completa struttura alberghiera'),
  ('c1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000005','CNTR-2026-001','ricorrente','2026-01-01','2026-12-31',600.00,8,'settimanale','attivo',NULL),
  ('c1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000006','CNTR-2025-006','ricorrente','2025-06-01','2027-05-31',3200.00,44,'settimanale','attivo','Condominio 4 scale, 48 appartamenti'),
  ('c1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000007','CNTR-2025-007','ricorrente','2025-05-01','2027-04-30',2100.00,28,'settimanale','attivo','Sale visita, reception, corridoi'),
  ('c1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000008','CNTR-2026-002','ricorrente','2026-02-01','2027-01-31',1600.00,22,'giornaliera','attivo','Pulizia notturna dopo chiusura'),
  ('c1000000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000009','CNTR-2026-003','una_tantum','2026-05-15','2026-05-15',350.00,4,'mensile','scaduto','Pulizia straordinaria villa privata'),
  ('c1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000010','CNTR-2025-010','ricorrente','2025-09-01','2027-08-31',1400.00,18,'settimanale','attivo','Spogliatoi, zone umide, sala pesi')
ON CONFLICT (id) DO NOTHING;

-- 4. SEDI (collegate a contratti)
INSERT INTO sedi_cliente (id, contratto_id, cliente_id, nome_sede, indirizzo, piano, mq_totali, note_accesso) VALUES
  ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Sede principale','Via Montenapoleone 8','3° piano',450.00,'Citofono studio, chiedere di Beatrice'),
  ('d1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002','Scala A + B','Via delle Magnolie 24','Piano terra-6°',620.00,'Chiave cassetta scala A, codice portone 1247'),
  ('d1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000003','Cucina e sala','Corso Buenos Aires 55','Piano terra',180.00,'Entrare da ingresso posteriore via Plinio'),
  ('d1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000004','Hotel completo','Via Vittorio Emanuele 12','Tutti i piani',2800.00,'Badge magnetico presso reception, chiedere di Sergio'),
  ('d1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000005','Farmacia','Piazza del Duomo 3','Piano terra',120.00,'Chiave deposito, cassetta codice 9821'),
  ('d1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000006','Scale A-B-C-D','Via Novara 88','Piano terra-8°',1200.00,'Quattro chiavi scala, custodia portineria'),
  ('d1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000007','Centro medico','Viale Brianza 15','1° piano',340.00,'Citofono 12, codice allarme 4455'),
  ('d1000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000008','Supermercato','Via Lorenteggio 142','Piano terra',760.00,'Accesso ore 22:00, contattare capo turno notturno'),
  ('d1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000009','Villa privata','Via Como 7','Piano terra + 1°',280.00,'Citofono Zanetti, parcheggio in cortile'),
  ('d1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000010','Palestra','Via Padova 98','Piano terra',520.00,'Accesso ore 21:30, codice 7733')
ON CONFLICT (id) DO NOTHING;

-- 5. INTERVENTI (mix di stati: completato, approvato, in_corso, pianificato)
INSERT INTO interventi (id, contratto_id, sede_id, operatore_id, data_pianificata, ora_inizio_pianificata, ora_fine_pianificata, tipo_pulizia, stato, note_operatore, inizio_effettivo, fine_effettivo, geo_inizio_lat, geo_inizio_lng, geo_fine_lat, geo_fine_lng) VALUES
  ('e1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','2026-06-02','08:00','10:00','ordinaria','completato',NULL,'2026-06-02 08:03:00+02','2026-06-02 10:07:00+02',45.46683,9.19444,45.46690,9.19451),
  ('e1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','2026-06-02','09:00','12:00','ordinaria','completato',NULL,'2026-06-02 09:01:00+02','2026-06-02 12:05:00+02',45.46050,9.21780,45.46055,9.21785),
  ('e1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003','2026-06-03','07:00','08:30','ordinaria','approvato',NULL,'2026-06-03 07:02:00+02','2026-06-03 08:28:00+02',45.47210,9.21330,45.47215,9.21338),
  ('e1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000005','2026-06-03','08:00','13:00','ordinaria','approvato','Pavimenti lucidati extra','2026-06-03 08:00:00+02','2026-06-03 13:02:00+02',45.69720,9.67340,45.69728,9.67345),
  ('e1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000007','d1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000004','2026-06-05','08:30','10:30','ordinaria','in_corso',NULL,'2026-06-05 08:32:00+02',NULL,45.58440,9.27150,NULL,NULL),
  ('e1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000006','d1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','2026-06-05','09:00','12:00','ordinaria','in_corso',NULL,'2026-06-05 09:04:00+02',NULL,45.45820,9.14210,NULL,NULL),
  ('e1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000006','2026-06-05','14:00','18:00','ordinaria','pianificato',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  ('e1000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000008','d1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000007','2026-06-06','22:00','01:00','ordinaria','pianificato',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  ('e1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000010','d1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000003','2026-06-07','21:30','23:00','sanificazione','pianificato',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  ('e1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','2026-06-09','08:00','10:00','straordinaria','pianificato',NULL,NULL,NULL,NULL,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- 6. FATTURE
INSERT INTO fatture (id, cliente_id, contratto_id, numero_fattura, mese, imponibile, iva_pct, totale, stato, data_scadenza, data_pagamento, metodo_pagamento, note) VALUES
  ('f1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','FT-2026-001','2026-04-01',1800.00,22,2196.00,'pagata','2026-05-15','2026-05-10','bonifico',NULL),
  ('f1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','FT-2026-002','2026-04-01',2400.00,22,2928.00,'pagata','2026-05-15','2026-05-14','bonifico',NULL),
  ('f1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','FT-2026-003','2026-04-01',1200.00,22,1464.00,'pagata','2026-05-20','2026-05-18','contanti',NULL),
  ('f1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000004','FT-2026-004','2026-04-01',5500.00,22,6710.00,'pagata','2026-05-30','2026-05-28','bonifico','Pagamento anticipato'),
  ('f1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000005','FT-2026-005','2026-04-01',600.00,22,732.00,'pagata','2026-05-15','2026-05-20','bonifico',NULL),
  ('f1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','FT-2026-006','2026-05-01',1800.00,22,2196.00,'emessa','2026-06-15',NULL,NULL,NULL),
  ('f1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','FT-2026-007','2026-05-01',2400.00,22,2928.00,'emessa','2026-06-15',NULL,NULL,NULL),
  ('f1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000004','FT-2026-008','2026-05-01',5500.00,22,6710.00,'emessa','2026-06-30',NULL,NULL,'Contratto appalto alberghiero'),
  ('f1000000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000006','FT-2026-009','2026-05-01',3200.00,22,3904.00,'bozza','2026-06-20',NULL,NULL,NULL),
  ('f1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000007','FT-2026-010','2026-05-01',2100.00,22,2562.00,'bozza','2026-06-25',NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;
