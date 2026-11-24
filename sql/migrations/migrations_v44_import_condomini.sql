-- migrations_v44: importa l'elenco condomini (condomini.odt, novembre 2026)
--
-- Da applicare a mano dal SQL Editor DOPO la v43. Idempotente: si può rilanciare.
-- Generato automaticamente dall'elenco: 227 clienti con contratto,
-- 66 amministratori. Righe senza tempo né prezzi non importate:
--   Associazione, Comune Altare, Comune di Bormida, Comune Pallare, Comune Saliceto, Cpl
--
-- Regole
--   * Un cliente esistente viene riusato se il nome coincide (ignorando maiuscole e un
--     eventuale prefisso "Condominio"/"Cond."), altrimenti viene creato.
--     Il nome dell'elenco finisce in clienti.nome_breve (es. "Aurelia 58").
--   * tipo cliente: 'condominio' se l'elenco indica un amministratore, altrimenti
--     lasciato vuoto (da completare: privato o azienda).
--   * Un contratto per cliente, con fonte_import = 'elenco-condomini-2026-11'. Se esiste già, non si ricrea.
--   * Il testo originale di tempo e prezzi resta in tempo_originale / prezzo_originale /
--     prezzo_ottimale_originale; le righe di servizio vanno in contratti_servizi.
--   * Prezzi: mensili se la frequenza è settimanale o mensile, annui se annuale o
--     scritto "annui", a intervento / all'ora se scritto così.
--   * importo_mensile, prezzo_ottimale_mensile e ore_contratto_mensili sono calcolati solo
--     per i contratti con una riga sola e interpretabile. Con più righe non si sa se si
--     sommano (scale + garage) o si alternano (estate/inverno): restano vuoti e il
--     contratto ha una nota da verificare; nell'app c'è "Calcola dai servizi".

BEGIN;

CREATE TEMP TABLE _imp_clienti (nome text, amm text, tipo text, tempo text, prezzo text, ottimale text,
  importo numeric, ottimale_m numeric, ore numeric, note text) ON COMMIT DROP;
CREATE TEMP TABLE _imp_servizi (nome text, ordine int, descrizione text, tempo_testo text,
  minuti int, numero numeric, periodo text, prezzo numeric, unita text, ottimale numeric, note text) ON COMMIT DROP;

INSERT INTO public.amministratori (nome) VALUES
  ('3B'),
  ('Amm. Savonesi'),
  ('Aprile'),
  ('Arte'),
  ('Balestrieri 3b'),
  ('Bandiziol'),
  ('Bertero'),
  ('Bianchi'),
  ('Biato'),
  ('Blengeri'),
  ('Bolzan'),
  ('Bonora'),
  ('Bressan'),
  ('Calcagno'),
  ('Canepa'),
  ('Canino'),
  ('Caorsi'),
  ('Carai'),
  ('Celle servizi'),
  ('Ciarlo'),
  ('Codino'),
  ('Concordia'),
  ('Crovetto'),
  ('De Salvo'),
  ('Doglioli'),
  ('Elledi'),
  ('Emmedi'),
  ('Esposito'),
  ('Farinetti'),
  ('Forzano'),
  ('Giangiacomo'),
  ('Giusto'),
  ('La spiga'),
  ('Licausi'),
  ('Loffredo'),
  ('Lombardo'),
  ('Lupi'),
  ('Malberti'),
  ('Marabotto'),
  ('Marrucci'),
  ('Mazza'),
  ('Minuto'),
  ('Oddera'),
  ('Oliveri'),
  ('Ottonello'),
  ('Padula'),
  ('Palmeri'),
  ('Pastorino'),
  ('Peluffo'),
  ('Piovano'),
  ('Pollero'),
  ('Rebella'),
  ('Rezzani'),
  ('Rimagest'),
  ('Riviera case'),
  ('Rizzello'),
  ('Romagnoli'),
  ('Salvaterra'),
  ('Salvati'),
  ('Scarrone'),
  ('Schirru'),
  ('Serafini'),
  ('Solaro'),
  ('Studio michela'),
  ('Ventura'),
  ('Venturino')
ON CONFLICT ((lower(nome))) DO NOTHING;

INSERT INTO _imp_clienti VALUES
  ('Al collegio 5', 'Bonora', 'condominio', '0,30 2 v al mese', '47,09', '50', 47.09, 50.0, 1.0, NULL),
  ('Al collegio 6', 'Bonora', 'condominio', '0,30 1 v. Settim
0,30 2 v mese', '55,20
33', '90
40', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Aldo Moro 5', 'Bonora', 'condominio', '0,45 x 17 int annuali', '340', '510', 28.33, 42.5, 1.06, NULL),
  ('Alla costa 21', 'Bolzan', 'condominio', '0,30 2 v mese', '63,71', '50', 63.71, 50.0, 1.0, NULL),
  ('Anselmo 5', 'Pastorino', 'condominio', '0,30 1 v sett', '83,63', '90', 83.63, 90.0, 2.17, NULL),
  ('Argonauti 13', 'Crovetto', 'condominio', '0,30 1 v sett', '90,86', '90', 90.86, 90.0, 2.17, NULL),
  ('Aurelia 2b', 'Bressan', 'condominio', '0,30 1 v sett', '35,70', '90', 35.7, 90.0, 2.17, NULL),
  ('Aurelia 14-16', 'Giusto', 'condominio', '1 1 v sett', '242,25', '180', 242.25, 180.0, 4.33, NULL),
  ('Aurelia 58', 'Giusto', 'condominio', '0,30 1 v sett', '75,57', '90', 75.57, 90.0, 2.17, NULL),
  ('Aurelia 60', 'Giusto', 'condominio', '0,30 1 v sett', '73,56', '90', 73.56, 90.0, 2.17, NULL),
  ('Aurelia 226', 'Giusto', 'condominio', '0,30 1 v sett', '68,19', '90', 68.19, 90.0, 2.17, NULL),
  ('Aurelia 288', 'Giusto', 'condominio', '0,30 2 v mese', '27,05', '50', 27.05, 50.0, 1.0, NULL),
  ('Barbiani 31', 'Rimagest', 'condominio', '0,45 1 v sett', '157,67', '135', 157.67, 135.0, 3.25, NULL),
  ('Bartoli 2', 'Balestrieri 3b', 'condominio', '1 1 v sett', '128,42', '180', 128.42, 180.0, 4.33, NULL),
  ('Battisti 3', 'Palmeri', 'condominio', '1 1 v sett', '216,30', '180', 216.3, 180.0, 4.33, NULL),
  ('Bazzino 7', 'Carai', 'condominio', '1 1 v sett', '219,90', '180', 219.9, 180.0, 4.33, NULL),
  ('Beato giacomo 12', 'Lombardo', 'condominio', '0,30 1 v mese
0,20 1v sett', '97,58', '70', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bellandi 28', 'Aprile', 'condominio', '0,30 1 v sett', '39', '90', 39.0, 90.0, 2.17, NULL),
  ('Bellotto 1', 'Bandiziol', 'condominio', '0,30 scopatura
0,45 lavaggio
0,30 cort ogni 2 mesi', '118,15
15,75', '225
20', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bellotto 5', 'Rimagest', 'condominio', '0,30 scopatura
0,45 lavaggio', '156,40', '225', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bellotto 7', 'Pollero', 'condominio', '0,30 scopatura
0,45 lavaggio', '187,56', '225', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bellotto 24', 'Giusto', 'condominio', '0,45 1 v sett', '103,98', '135', 103.98, 135.0, 3.25, NULL),
  ('Belvedere 38a', 'Bonora', 'condominio', '0,30 1 v sett
? cortile
? terrazzo', '84,29
17,50
10,30', '90', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Belvedere 38c', 'Emmedi', 'condominio', '0,45 2 v mese', '36,05', '60', 36.05, 60.0, 1.5, NULL),
  ('Bertero mattiauda 7', 'Bertero', 'condominio', '0,45 2 v mese', '40', '60', 40.0, 60.0, 1.5, NULL),
  ('Bertolotto 1', 'Rimagest', 'condominio', '0,20 scopatura
0,45 lavaggio', '76,61', '170', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bertolotto 2-3', 'Arte', 'condominio', '2 1 v sett', '350', '360', 350.0, 360.0, 8.67, NULL),
  ('Bonfante 27', 'Crovetto', 'condominio', '0,45 1 v sett', '116,80', '135', 116.8, 135.0, 3.25, NULL),
  ('Borro', NULL, NULL, '1,30 1 v mese', '40', '30', 40.0, 30.0, 1.5, NULL),
  ('Box rio carbini', 'Doglioli', 'condominio', '1 4 v all''anno', '142,75', '160', 11.9, 13.33, 0.33, NULL),
  ('Bovani 19-20', 'Crovetto', 'condominio', '0,30 1 v sett
0,20 1 v mese', '126,02', '100', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bricchetti 1b', 'Giusto', 'condominio', '0,45 1 v sett
0,30 1 v mese', '119
21,63', '135
20', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Bricchetti 10', 'Giusto', 'condominio', '0,20 1 v sett', '50,24', '60', 50.24, 60.0, 1.44, NULL),
  ('Brilla 4-6', 'Amm. Savonesi', 'condominio', '1,30 1 v sett', '357', '270', 357.0, 270.0, 6.5, NULL),
  ('Cadorna 54', 'Piovano', 'condominio', '0,40 1 v sett', '97,33', '120', 97.33, 120.0, 2.89, NULL),
  ('Cad. Partigiani 7', 'Giusto', 'condominio', '0,30 1 v sett', '86,57', '90', 86.57, 90.0, 2.17, NULL),
  ('Cad. Per la lib. 33', 'Giusto', 'condominio', '0,40 2 v al mese', '49,67', '52', 49.67, 52.0, 1.33, NULL),
  ('Cairoli 37', 'Doglioli', 'condominio', '0,15 1 v sett
0,15 2 v mese', '54,10
36,75', '50
25', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Calcagno 3', 'Doglioli', 'condominio', '0,45 2 v mese', '93,73', '75', 93.73, 75.0, 1.5, NULL),
  ('Calcagno 19', 'Lombardo', 'condominio', '0,30 2 v mese', '108,15', '50', 108.15, 50.0, 1.0, NULL),
  ('Camogli 11', 'Biato', 'condominio', '0,30 1 v sett', '97,35', '90', 97.35, 90.0, 2.17, NULL),
  ('Camogli 27', 'Lombardo', 'condominio', '0,30 2 v mese', '91,92', '50', 91.92, 50.0, 1.0, NULL),
  ('Camogli 34', 'Doglioli', 'condominio', '0,30 1 v sett', '97,33', '90', 97.33, 90.0, 2.17, NULL),
  ('Campana 35', 'Lombardo', 'condominio', '0,10 1 v sett', '58,44', '30', 58.44, 30.0, 0.72, NULL),
  ('Canepa', 'Canepa', 'condominio', '0,45 1 v sett', '110', '135', 110.0, 135.0, 3.25, NULL),
  ('Capello 16-18', 'Rimagest', 'condominio', '1 1 v sett', '208,95', '180', 208.95, 180.0, 4.33, NULL),
  ('Carattino 39', 'Crovetto', 'condominio', '0,15 + 0,30
0,15 + 0,15
0,15 + 0,30
0,15 + 0,15', '97,33', '110', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Cassisi 77', 'Rimagest', 'condominio', '0,30 1 v mese
0,30 2 v mese', '36,80
75,70', '20
50', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Catalani 1', 'Carai', 'condominio', '0,20 + 0,50 2 v sett', '173,40', '210', 173.4, 210.0, 5.06, NULL),
  ('Cav. Di malta 4', 'Bonora', 'condominio', '0,30', '19,46 ad int', '20', NULL, NULL, NULL, NULL),
  ('Cav di malta 6', 'Bonora', 'condominio', '0,30 2 v mese
0,30 1 v sett', '65
100,40', '50
90', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Cav di malta 27', 'Bonora', 'condominio', '0,20 + 0,45
1 cortile', '67,35
27,03', '195
40', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Cavour 15', 'Bianchi', 'condominio', '0,45 1 v sett', '94,78', '135', 94.78, 135.0, 3.25, NULL),
  ('Cavour 23', 'Crovetto', 'condominio', '1,15 1 v mese
1,15 2 v mese', '51,92
103,85', '50
100', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Cavour 47', 'Rezzani', 'condominio', '0,30 2 v mese', '101,47', '50', 101.47, 50.0, 1.0, NULL),
  ('Centro estetico', NULL, NULL, '0,30 ad intervento', '17', '20', NULL, NULL, NULL, NULL),
  ('Chiappino 39', 'blengeri', 'condominio', '0,30 1 v sett', '78', '90', 78.0, 90.0, 2.17, NULL),
  ('Chiavella 2', 'Serafini', 'condominio', '2 1 v sett + 1 cort', '395,65', '400', NULL, NULL, NULL, NULL),
  ('Chiesa 3', 'Marrucci', 'condominio', '0,30 2 v mese', '43,50', '50', 43.5, 50.0, 1.0, NULL),
  ('Cilea 6a 6b', 'Serafini', 'condominio', '0,45 + 1,30', '310', '390', NULL, NULL, NULL, NULL),
  ('Colla 28', 'Rimagest', 'condominio', '0,30 1 v sett', '105,16', '90', 105.16, 90.0, 2.17, NULL),
  ('Colombo 14', 'Concordia', 'condominio', '0,30 1 v sett', '86,07', '90', 86.07, 90.0, 2.17, NULL),
  ('Colombo 18', 'Lombardo', 'condominio', '0,45 1 v sett', '181,68', '135', 181.68, 135.0, 3.25, NULL),
  ('Colombo 68', 'Doglioli', 'condominio', '0,30 1 v sett', '80,63', '90', 80.63, 90.0, 2.17, NULL),
  ('Colombo 115', 'Rimagest', 'condominio', '0,30 1 v sett', '68,95', '90', 68.95, 90.0, 2.17, NULL),
  ('Complesso astor', 'Serafini', 'condominio', '1,30 1 v sett + 0,45', '420', '300', NULL, NULL, NULL, NULL),
  ('Conradi 43-49', 'Forzano', 'condominio', '1,15 1 v sett', '360,53', '225', 360.53, 225.0, 5.42, NULL),
  ('Consorzio', 'Marabotto', 'condominio', '1,30 1 v mese', '75,53', '60', 75.53, 60.0, 1.5, NULL),
  ('Corosu 15-17', 'Crovetto', 'condominio', '1 1 v sett', '320,41', '180', 320.41, 180.0, 4.33, NULL),
  ('Corosu 18-20', 'Doglioli', 'condominio', '1,10 1 v sett
1,10 2 v mese', '243,10
121,50', '210
105', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Corosu 36', 'Ciarlo', 'condominio', '0,40 1 v sett', '132,45', '120', 132.45, 120.0, 2.89, NULL),
  ('Dante 5', 'Crovetto', 'condominio', '0,30 1 v sett', '118,85', '90', 118.85, 90.0, 2.17, NULL),
  ('Defferrari 9', 'Bonora', 'condominio', '0,45 1 v sett', '108,73', '135', 108.73, 135.0, 3.25, NULL),
  ('Defferrari 16', 'Bonora', 'condominio', '0,45 1 v sett
0,45 2 v mese', '82,80
44,10', '135
75', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Defferrari 33', 'Bonora', 'condominio', '0,45 1 v sett
0,45 2 v mese', '90,20
50,80', '135
75', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Defferrari 53-63-63c', 'Salvati', 'condominio', 'Fatturiamo sempre', 'Uguale ma ha', 'Importi diversi', NULL, NULL, NULL, NULL),
  ('Dei siccardi 11', 'Pastorino', 'condominio', '0,30 1 v sett', '112,50', '90', 112.5, 90.0, 2.17, NULL),
  ('De litta 2', 'Pollero', 'condominio', '0,40 1 v sett', '85', '120', 85.0, 120.0, 2.89, NULL),
  ('De litta 5', 'Pollero', 'condominio', '0,20 + 0,30 2 v sett', '93,22', '150', 93.22, 150.0, 3.61, NULL),
  ('Della rovere 25', 'Forzano', 'condominio', '0,30 2 v mese', '33,90', '50', 33.9, 50.0, 1.0, NULL),
  ('Delle agavi 15', 'Celle servizi', 'condominio', '1 1 v mese
1 2 v mese', '54
86,50', '40
90', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Dellepiane', NULL, NULL, NULL, '18', '20', NULL, NULL, NULL, NULL),
  ('Diaz 34', 'Giusto', 'condominio', '0,10 + 0,20 2 v sett', '85,37', '85', 85.37, 85.0, 2.17, NULL),
  ('Di vittorio 5', 'Giusto', 'condominio', '0,45 1 v sett
0,30 1 v mese', '175,12
30,9 area est', '135
20', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Don bosco 5', 'Doglioli', 'condominio', '0,20 2 v mese', '34,14', '33,33', 34.14, 33.33, 0.67, NULL),
  ('Don minzoni 1a 1b', 'Giusto', 'condominio', '0,45 1 v sett
0,15 1 v mese', '123,60
20,60', '135
10', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Elledi', 'Elledi', 'condominio', '2,30 a richiesta', '108', '100', NULL, NULL, NULL, NULL),
  ('Famagosta 14', 'Scarrone', 'condominio', '0,30 1 v sett', '48,67', '90', 48.67, 90.0, 2.17, NULL),
  ('Famagosta 32', 'Amm. Savonesi', 'condominio', '0,30 1 v sett', '91,57', '90', 91.57, 90.0, 2.17, NULL),
  ('F & F interni', NULL, NULL, '3 1 v mese', '120', '120', 120.0, 120.0, 3.0, NULL),
  ('Ferrari 140', 'Forzano', 'condominio', '1 1 v sett', '107,38', '180', 107.38, 180.0, 4.33, NULL),
  ('Ferrari 172', 'Bolzan', 'condominio', '0,20 + 0,30 2 v sett', '129,48', '150', 129.48, 150.0, 3.61, NULL),
  ('Ferraro Roberta', NULL, NULL, NULL, '18 all''ora', '20', NULL, NULL, NULL, NULL),
  ('Foria', NULL, NULL, NULL, '18 all''ora', '20', NULL, NULL, NULL, NULL),
  ('Forship', NULL, NULL, NULL, '21 all''ora', NULL, NULL, NULL, NULL, NULL),
  ('Foscolo 1', 'Bressan', 'condominio', '0,30 1 v sett', '138,45', '90', 138.45, 90.0, 2.17, NULL),
  ('Frizzi', NULL, NULL, NULL, '18', '20', NULL, NULL, NULL, NULL),
  ('Gagliardi 5', 'Malberti', 'condominio', '0,30 2 v mese', '50', '50', 50.0, 50.0, 1.0, NULL),
  ('Gls', NULL, NULL, NULL, '20 all''ora', '20 all''ora', NULL, NULL, NULL, NULL),
  ('Gandoglia 17', 'Bonora', 'condominio', '1 1 v sett
0,45 + 1 2 v sett', '185,75
214,10', '180
315', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Garages lancia', 'Schirru', 'condominio', '2 1 v mese', '97,33', '80', 97.33, 80.0, 2.0, NULL),
  ('Gavarone 6', 'Calcagno', 'condominio', '1 1 v mese', '34,60', '40', 34.6, 40.0, 1.0, NULL),
  ('Gavarone 7', 'Crovetto', 'condominio', '0,20 2 v mese', '47,62', '33,33', 47.62, 33.33, 0.67, NULL),
  ('Gavotti 11', 'Rimagest', 'condominio', '0,30 1 v sett', '82,20', '90', 82.2, 90.0, 2.17, NULL),
  ('Giardino 5', 'Pollero', 'condominio', '0,50 2 v mese', '61,80', '70', 61.8, 70.0, 1.67, NULL),
  ('Giovane italia 4-6', 'Biato', 'condominio', '1 1 v sett', '180,25', '180', 180.25, 180.0, 4.33, NULL),
  ('Giovane Italia 19', 'Doglioli', 'condominio', '0,45 1 v sett', '227,25', '135', 227.25, 135.0, 3.25, NULL),
  ('Giovane italia 40', 'Biato', 'condominio', '0,45 2 v mese', '84,35', '75', 84.35, 75.0, 1.5, NULL),
  ('Giovanni XXIII 37', 'Rimagest', 'condominio', '0,30 1 v sett', '123,65', '90', 123.65, 90.0, 2.17, NULL),
  ('Gozo 9', 'De Salvo', 'condominio', '0,30 1 v sett', '72,80', '90', 72.8, 90.0, 2.17, NULL),
  ('Gramsci 12-14', '3B', 'condominio', '0,45 + 1,30 2 v sett', '361,88', '390', 361.88, 390.0, 9.82, NULL),
  ('Gramsci 25', 'Giusto', 'condominio', '0,30 1 v sett', '100,55', '90', 100.55, 90.0, 2.17, NULL),
  ('Grondona 10121416', 'Pastorino', 'condominio', '2 1 v sett
0,15 1 v sett', '389,35
40 canaline', '360
40', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Imperia 6', 'Giusto', 'condominio', '0,40 2 v mese', '119', '66,67', 119.0, 66.67, 1.33, NULL),
  ('Iris mobili', NULL, NULL, '2 tutti i giorni', '1350', '1240 + festivi', 1350.0, 1240.0, 43.4, NULL),
  ('La noria', 'Giusto', 'condominio', '1 1 v sett+1,5 1vmes', '216,34', '180 + 60', NULL, NULL, NULL, NULL),
  ('La spezia 3', 'La spiga', 'condominio', '0,50 1 v sett', '129,780', '150', 129.78, 150.0, 3.61, NULL),
  ('Layolo 51', 'Peluffo', 'condominio', '1 1 v sett
1 2 v mese', '189
94,36', '180
90', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Le azalee', 'Concordia', 'condominio', '1,30/2 1 v sett', '177,36', '280', NULL, NULL, NULL, NULL),
  ('Leon. Da vinci 1-3', 'Loffredo', 'condominio', '1,30 1 v sett', '398,9', '270', 398.9, 270.0, 6.5, NULL),
  ('Leonardo da vinci 3', 'Bonora', 'condominio', '0,30 2 v mese
0,30 1 v mese', '37,30
18,40', '50
20', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Leonardo da vinci 6', 'Bonora', 'condominio', '0,30 1 v sett
0,20 + 0,30 2 v sett', '70,57
100', '90
150', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Leopardi 25', 'Carai', 'condominio', '0,30 1 v sett', '52', '90', 52.0, 90.0, 2.17, NULL),
  ('Liguria servizi', NULL, NULL, '0,45 1 v sett Vado
1,30 1 v sett Savona
1,15 2 v mese Loano', '483,40', '135
270
125 tot 530', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Liguria 3', 'Ventura', 'condominio', '0,30 1 v sett', '71,20', '90', 71.2, 90.0, 2.17, NULL),
  ('Luigi corsi 13-15', 'Oddera', 'condominio', '0,45 1 v sett', '140,06', '135', 140.06, 135.0, 3.25, NULL),
  ('Macelleria scarone', NULL, NULL, '0,30 ad int', '18', '20', NULL, NULL, NULL, NULL),
  ('Malocello 4', 'Rizzello', 'condominio', '0,30 1 v sett', '86,53', '90', 86.53, 90.0, 2.17, NULL),
  ('Malocello 50', 'Lombardo', 'condominio', '0,30 1 v sett', '111,74', '90', 111.74, 90.0, 2.17, NULL),
  ('Marconi 7', 'Giusto', 'condominio', '0,30 1 v sett', '87,58', '90', 87.58, 90.0, 2.17, NULL),
  ('Marconi 16', 'Salvaterra', 'condominio', '0,45 1 v sett', '146', '135', 146.0, 135.0, 3.25, NULL),
  ('Martini 3', 'Pastorino', 'condominio', '0,30 1 v sett', '117', '90', 117.0, 90.0, 2.17, NULL),
  ('Mazzini 5', 'Lombardo', 'condominio', '1 1 v mese
0,30 1 v sett', '65
119', '40
90', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Mazzini 6', 'Lombardo', 'condominio', '0,30 1 v sett', '130,86', '90', 130.86, 90.0, 2.17, NULL),
  ('Mazzini 22 Spotorno', 'Carai', 'condominio', '0,45 1 v sett', '74,03', '135', 74.03, 135.0, 3.25, NULL),
  ('Milano 18', 'Doglioli', 'condominio', '0,50 1 v sett', '154', '150', 154.0, 150.0, 3.61, NULL),
  ('Monastero 24', 'Canino', 'condominio', '0,30 1 v mese
0,30 2 v mese', '300,66 annui', '320', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Monastero 127', 'Bonora', 'condominio', '0,30 1 v sett', '50,92', '90', 50.92, 90.0, 2.17, NULL),
  ('Monastero 161', 'Bonora', 'condominio', '1 2 v mese per loro
uguale tutto l''anno', '1158,55 annui
fatturo periodi', '1080
diversi', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Monastero 167', 'Bonora', 'condominio', '0,45 2 v mese', '54,10', '75', 54.1, 75.0, 1.5, NULL),
  ('Montegrappa 29', 'Biato', 'condominio', '0,30 1 v sett', '123,30', '90', 123.3, 90.0, 2.17, NULL),
  ('Montegrappa 34', 'Biato', 'condominio', '0,40 2 v mese
0,40 1 v sett', '71,40
142', '66,67
120', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Montello 3', 'Lupi', 'condominio', '0,30 1 v sett', '85,62', '90', 85.62, 90.0, 2.17, NULL),
  ('Montesisto 4', 'Minuto', 'condominio', '0,45 1 v sett', '61,65', '135', 61.65, 135.0, 3.25, NULL),
  ('Morchio 5', 'Crovetto', 'condominio', '0,30 1 v sett', '119,18', '90', 119.18, 90.0, 2.17, NULL),
  ('Nino Bixio 8', 'Codino', 'condominio', '0,30 1 v sett', '74,92', '90', 74.92, 90.0, 2.17, NULL),
  ('Nizza 30a', 'Romagnoli', 'condominio', '1 1 v sett', '199,26', '180', 199.26, 180.0, 4.33, NULL),
  ('Nizza 49', 'Esposito', 'condominio', '0,20 1 v sett', '61,80', '60', 61.8, 60.0, 1.44, NULL),
  ('Nizza 51', 'Giusto', 'condominio', '0,30 1 v sett', '68,14', '90', 68.14, 90.0, 2.17, NULL),
  ('Nizza 53 b', 'Bressan', 'condominio', '0,30 1 v sett', '86,52', '90', 86.52, 90.0, 2.17, NULL),
  ('Nizza 100', 'Giusto', 'condominio', '0,30 1 v sett', '54,07', '90', 54.07, 90.0, 2.17, NULL),
  ('Nizza 116', 'Carai', 'condominio', '0,30 1 v sett', '88,66', '90', 88.66, 90.0, 2.17, NULL),
  ('Nizza 122', 'Carai', 'condominio', '0,30 + 1 2 v sett
0,30', '254,11
17,30', '270
20', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Nizza 128-130', 'Bressan', 'condominio', '1 + 2 2 v sett', '494,28', '540', 494.28, 540.0, 13.0, NULL),
  ('N. S. Degli angeli', 'Oliveri', 'condominio', '0,30 1 v sett', '86,52', '90', 86.52, 90.0, 2.17, NULL),
  ('N. S. Del monte 6-8', 'Bolzan', 'condominio', '0,45 1 v sett', '90', '135', 90.0, 135.0, 3.25, NULL),
  ('Ordine architetti', NULL, NULL, '1 1 v sett', '160', '180', 160.0, 180.0, 4.33, NULL),
  ('Padre Piazza 20', 'Crovetto', 'condominio', '1,40 1 v sett', '280,68', '300', 280.68, 300.0, 7.22, NULL),
  ('Padre Piazza 32', 'Crovetto', 'condominio', '1,20 1 v sett', '286,64', '240', 286.64, 240.0, 5.78, NULL),
  ('Papa innocenzo 7-9', 'Crovetto', 'condominio', '1 1 v sett', '156,56', '180', 156.56, 180.0, 4.33, NULL),
  ('Papa innocenzo 11', 'Venturino', 'condominio', '0,30 1 v sett', '144', '90', 144.0, 90.0, 2.17, NULL),
  ('Pastorino 10', 'Bonora', 'condominio', '0,30 1 v sett', '76,23', '90', 76.23, 90.0, 2.17, NULL),
  ('Pertinace 10c', 'Giusto', 'condominio', '0,40 1 v sett', '86,53', '120', 86.53, 120.0, 2.89, NULL),
  ('Pertinace 16b ???', 'Giusto', 'condominio', '0,40 1 v sett', '69,75', '120', 69.75, 120.0, 2.89, NULL),
  ('Pertini 1-5', 'Rebella', 'condominio', '0,45 1 v sett + 0,45', '118,14', '165', NULL, NULL, NULL, NULL),
  ('Pescetto 40', 'Rimagest', 'condominio', '0,30 1 v sett
1 1 v mese', '111,75
65', '90
40', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Piave 15', 'Bianchi', 'condominio', '0,30 1 v sett', '87,60', '90', 87.6, 90.0, 2.17, NULL),
  ('Piave 130', 'Crovetto', 'condominio', '0,40 1 v sett', '89,71', '120', 89.71, 120.0, 2.89, NULL),
  ('Piave 164b', 'Giusto', 'condominio', '0,30 1 v sett', '97,35', '90', 97.35, 90.0, 2.17, NULL),
  ('Piemonte 11', 'Giusto', 'condominio', '0,30 1 v sett', '56,72', '90', 56.72, 90.0, 2.17, NULL),
  ('Pizzorno 13', 'Crovetto', 'condominio', '0,50 1 v sett', '210,71', '150', 210.71, 150.0, 3.61, NULL),
  ('Pizzorno 15-17-19', 'Crovetto', 'condominio', '1,30 2 v mese', '188,36', '150', 188.36, 150.0, 3.0, NULL),
  ('Poggi 8', 'Forzano', 'condominio', '0,30 1 v sett', '124,02', '90', 124.02, 90.0, 2.17, NULL),
  ('Poggi 38', 'Licausi', 'condominio', '0,30 1 v sett', '84,46', '90', 84.46, 90.0, 2.17, NULL),
  ('Prime', NULL, NULL, '0,45 2 v sett', '19 all''ora', '20', 123.5, 130.0, 6.5, NULL),
  ('Primo maggio 5', 'Solaro', 'condominio', '1 1 v sett', '202', '180', 202.0, 180.0, 4.33, NULL),
  ('Prisma', NULL, NULL, '1,30 al giorno sola', '30 ad int', '30', 651.0, 651.0, 32.55, NULL),
  ('Iv novembre 9', 'Doglioli', 'condominio', '0,30 2 v mese', '52,21', '50', 52.21, 50.0, 1.0, NULL),
  ('Iv novembre 41', 'Farinetti', 'condominio', '0,30 1 v sett', '70,65', '90', 70.65, 90.0, 2.17, NULL),
  ('Quiliano 2', 'Padula', 'condominio', '0,30 1 v sett', '69,22', '90', 69.22, 90.0, 2.17, NULL),
  ('Quiliano 5', 'Aprile', 'condominio', '0,20 1 v sett', '61,20', '60', 61.2, 60.0, 1.44, NULL),
  ('Quiliano 7', 'Giusto', 'condominio', '0,20 1 v sett', '56,79', '60', 56.79, 60.0, 1.44, NULL),
  ('Quiliano 10-10a', 'De salvo', 'condominio', '1 1 v sett', '134,63', '180', 134.63, 180.0, 4.33, NULL),
  ('Recagno 4', 'Biato', 'condominio', '0,20 1 v sett
0,20 2 v mese', '51,91 sempre
51,91 uguale', '60
33,33', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Repetto 11', 'Bonora', 'condominio', '0,15 + 0,30 2 v sett', '123,43', '135', 123.43, 135.0, 3.18, NULL),
  ('Rossi 3', 'Giusto', 'condominio', '0,30 1 v sett', '67,33', '90', 67.33, 90.0, 2.17, NULL),
  ('Sabazia 13', 'Rimagest', 'condominio', '4 1 v sett + 1 vetri', '639,15', '760', NULL, NULL, NULL, NULL),
  ('Salmoiraghi', NULL, NULL, NULL, '18 all''ora', '20', NULL, NULL, NULL, NULL),
  ('S. ambrogio 4', 'Lombardo', 'condominio', '0,30 1 v sett', '101,94', '90', 101.94, 90.0, 2.17, NULL),
  ('Sanac', NULL, NULL, NULL, '21', '20', NULL, NULL, NULL, NULL),
  ('Sanda 105', 'Biato', 'condominio', '0,30 1 v sett', '42,76', '90', 42.76, 90.0, 2.17, NULL),
  ('San Francesco 13', 'Bonora', 'condominio', '0,45 2 v mese
0,45 1 v sett', '67,60
108,20', '75
135', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('San Pietro 6', 'Pollero', 'condominio', '0,20 + 0,30 2 v sett', '110,05', '150', 110.05, 150.0, 3.61, NULL),
  ('San pietro 27-29', 'Palmeri', 'condominio', '0,50 1 v sett', '92,20', '150', 92.2, 150.0, 3.61, NULL),
  ('San rocco 2', 'Giangiacomo', 'condominio', '0,30 2 v mese
0,30 1 v sett', '43,30
86,50', '50
90', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('S. andrea 1', 'Doglioli', 'condominio', '0,30 1 v sett', '75,70', '90', 75.7, 90.0, 2.17, NULL),
  ('Santa Caterina 51', 'Doglioli', 'condominio', '0,45 1 v sett', '115,40', '135', 115.4, 135.0, 3.25, NULL),
  ('Saredo 38', 'Riviera case', 'condominio', '0,30 1 v sett', '67,13', '90', 67.13, 90.0, 2.17, NULL),
  ('Sbarbaro 1', 'Amm. savonesi', 'condominio', '0,30 1 v sett', '126,42', '90', 126.42, 90.0, 2.17, NULL),
  ('Sb minerals', NULL, NULL, NULL, '18', '20', NULL, NULL, NULL, NULL),
  ('Scavino 24', 'Caorsi', 'condominio', '0,30 1 v sett', '119', '90', 119.0, 90.0, 2.17, NULL),
  ('Seirullo 27', 'Mazza', 'condominio', '1 1 v sett', '181,43', '180', 181.43, 180.0, 4.33, NULL),
  ('Serao 6', 'Ottonello', 'condominio', '0,30 1 v sett', '113', '90', 113.0, 90.0, 2.17, NULL),
  ('Serra 13a', 'Studio michela', 'condominio', '0,45 2 v mese
0,45 1 v mese', '72
36', '75
30', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('SGL', NULL, NULL, '2 2 v mese', '180', '200', 180.0, 200.0, 4.0, NULL),
  ('Silvano acerbo 20', 'Emmedi', 'condominio', '0,45 1 v mese
0,45 2 v mese
2 v mese lug ago', '41,20 ott a mag
67 giu e sett
123,60 lug ago', '30
75', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Studio legale bms', NULL, NULL, '1,30 1 v sett', '60 ad int', '60', 260.0, 260.0, 6.5, NULL),
  ('Suor Letizia 23', 'Emmedi', 'condominio', '0,30 1 v sett
0,30 2 v mese
0,45 1 v mese', '77,30
46,30
36', '90
50
30', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Testa', NULL, NULL, '1,30 2 v mese', '150', '150', 150.0, 150.0, 3.0, NULL),
  ('Torcello 7-8', 'Palmeri', 'condominio', '1 1 v sett', '85,10', '180', 85.1, 180.0, 4.33, NULL),
  ('Torino 5', 'Doglioli', 'condominio', '1 1 v mese
0,40 2 v mese', '39,50
67,60', '40
66,66', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Torino 6', 'Doglioli', 'condominio', '1 1 v mese
0,40 2 v mese', '36,80
57,40', '40
66,66', NULL, NULL, NULL, 'Più righe di servizio: verificare se si sommano o si alternano e inserire importo e ore mensili.'),
  ('Torino 24', 'Minuto', 'condominio', '0,30 1 v sett', '72,10', '90', 72.1, 90.0, 2.17, NULL),
  ('Turati 9a', 'Giusto', 'condominio', '0,30 1 v sett', '115,87', '90', 115.87, 90.0, 2.17, NULL),
  ('Universal', NULL, NULL, '1,30 1 v sett', '240', '270', 240.0, 270.0, 6.5, NULL),
  ('Vall. s. Cristoforo 19', 'Pastorino', 'condominio', '0,30 1 v sett', '88,26', '90', 88.26, 90.0, 2.17, NULL),
  ('Vallino 35', 'Doglioli', 'condominio', '0,30 2 v mese', '54,07', '50', 54.07, 50.0, 1.0, NULL),
  ('Xxiv aprile 10', 'Lombardo', 'condominio', '0,30 1 v sett', '87,16', '90', 87.16, 90.0, 2.17, NULL),
  ('Xxv aprile 68-70-72', 'Bressan', 'condominio', '1,45 1 v sett', '214', '315', 214.0, 315.0, 7.58, NULL),
  ('Verdi 16', 'Bonora', 'condominio', '0,45 3 v mese', '74,26', '90', 74.26, 90.0, 2.25, NULL),
  ('Villa delle palme', 'Rebella', 'condominio', '0,45 1 v sett', '93,29', '135', 93.29, 135.0, 3.25, NULL),
  ('Villagrande 5', 'Lombardo', 'condominio', '0,30 1 v sett', '112,50', '90', 112.5, 90.0, 2.17, NULL),
  ('Villagrande 17', 'Doglioli', 'condominio', '0,30 1 v sett', '81,06', '90', 81.06, 90.0, 2.17, NULL),
  ('Villagrande 66', 'Lombardo', 'condominio', '0,35 1 v sett', '162,22', '105', 162.22, 105.0, 2.53, NULL),
  ('Vittorio veneto 1', 'Crovetto', 'condominio', '1 1 v sett', '302,29', '180', 302.29, 180.0, 4.33, NULL),
  ('Vittorio veneto 48', 'Ottonello', 'condominio', '0,45 1 v sett', '118', '135', 118.0, 135.0, 3.25, NULL),
  ('Elena', NULL, NULL, NULL, '18', '20', NULL, NULL, NULL, NULL);

INSERT INTO _imp_servizi VALUES
  ('Al collegio 5', 1, NULL, '0,30 2 v al mese', 30, 2, 'mese', 47.09, 'mese', 50.0, NULL),
  ('Al collegio 6', 1, NULL, '0,30 1 v. Settim', 30, 1, 'settimana', 55.2, 'mese', 90.0, NULL),
  ('Al collegio 6', 2, NULL, '0,30 2 v mese', 30, 2, 'mese', 33.0, 'mese', 40.0, NULL),
  ('Aldo Moro 5', 1, NULL, '0,45 x 17 int annuali', 45, 17, 'anno', 340.0, 'anno', 510.0, NULL),
  ('Alla costa 21', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 63.71, 'mese', 50.0, NULL),
  ('Anselmo 5', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 83.63, 'mese', 90.0, NULL),
  ('Argonauti 13', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 90.86, 'mese', 90.0, NULL),
  ('Aurelia 2b', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 35.7, 'mese', 90.0, NULL),
  ('Aurelia 14-16', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 242.25, 'mese', 180.0, NULL),
  ('Aurelia 58', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 75.57, 'mese', 90.0, NULL),
  ('Aurelia 60', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 73.56, 'mese', 90.0, NULL),
  ('Aurelia 226', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 68.19, 'mese', 90.0, NULL),
  ('Aurelia 288', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 27.05, 'mese', 50.0, NULL),
  ('Barbiani 31', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 157.67, 'mese', 135.0, NULL),
  ('Bartoli 2', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 128.42, 'mese', 180.0, NULL),
  ('Battisti 3', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 216.3, 'mese', 180.0, NULL),
  ('Bazzino 7', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 219.9, 'mese', 180.0, NULL),
  ('Beato giacomo 12', 1, NULL, '0,30 1 v mese', 30, 1, 'mese', 97.58, 'mese', 70.0, NULL),
  ('Beato giacomo 12', 2, NULL, '0,20 1v sett', 20, 1, 'settimana', NULL, NULL, NULL, NULL),
  ('Bellandi 28', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 39.0, 'mese', 90.0, NULL),
  ('Bellotto 1', 1, 'scopatura', '0,30 scopatura', 30, NULL, NULL, 118.15, NULL, 225.0, NULL),
  ('Bellotto 1', 2, 'lavaggio', '0,45 lavaggio', 45, NULL, NULL, 15.75, NULL, 20.0, NULL),
  ('Bellotto 1', 3, NULL, '0,30 cort ogni 2 mesi', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Bellotto 5', 1, 'scopatura', '0,30 scopatura', 30, NULL, NULL, 156.4, NULL, 225.0, NULL),
  ('Bellotto 5', 2, 'lavaggio', '0,45 lavaggio', 45, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Bellotto 7', 1, 'scopatura', '0,30 scopatura', 30, NULL, NULL, 187.56, NULL, 225.0, NULL),
  ('Bellotto 7', 2, 'lavaggio', '0,45 lavaggio', 45, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Bellotto 24', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 103.98, 'mese', 135.0, NULL),
  ('Belvedere 38a', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 84.29, 'mese', 90.0, NULL),
  ('Belvedere 38a', 2, NULL, '? cortile', NULL, NULL, NULL, 17.5, NULL, NULL, NULL),
  ('Belvedere 38a', 3, NULL, '? terrazzo', NULL, NULL, NULL, 10.3, NULL, NULL, NULL),
  ('Belvedere 38c', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 36.05, 'mese', 60.0, NULL),
  ('Bertero mattiauda 7', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 40.0, 'mese', 60.0, NULL),
  ('Bertolotto 1', 1, 'scopatura', '0,20 scopatura', 20, NULL, NULL, 76.61, NULL, 170.0, NULL),
  ('Bertolotto 1', 2, 'lavaggio', '0,45 lavaggio', 45, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Bertolotto 2-3', 1, NULL, '2 1 v sett', 120, 1, 'settimana', 350.0, 'mese', 360.0, NULL),
  ('Bonfante 27', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 116.8, 'mese', 135.0, NULL),
  ('Borro', 1, NULL, '1,30 1 v mese', 90, 1, 'mese', 40.0, 'mese', 30.0, NULL),
  ('Box rio carbini', 1, NULL, '1 4 v all''anno', 60, 4, 'anno', 142.75, 'anno', 160.0, NULL),
  ('Bovani 19-20', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 126.02, 'mese', 100.0, NULL),
  ('Bovani 19-20', 2, NULL, '0,20 1 v mese', 20, 1, 'mese', NULL, NULL, NULL, NULL),
  ('Bricchetti 1b', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 119.0, 'mese', 135.0, NULL),
  ('Bricchetti 1b', 2, NULL, '0,30 1 v mese', 30, 1, 'mese', 21.63, 'mese', 20.0, NULL),
  ('Bricchetti 10', 1, NULL, '0,20 1 v sett', 20, 1, 'settimana', 50.24, 'mese', 60.0, NULL),
  ('Brilla 4-6', 1, NULL, '1,30 1 v sett', 90, 1, 'settimana', 357.0, 'mese', 270.0, NULL),
  ('Cadorna 54', 1, NULL, '0,40 1 v sett', 40, 1, 'settimana', 97.33, 'mese', 120.0, NULL),
  ('Cad. Partigiani 7', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 86.57, 'mese', 90.0, NULL),
  ('Cad. Per la lib. 33', 1, NULL, '0,40 2 v al mese', 40, 2, 'mese', 49.67, 'mese', 52.0, NULL),
  ('Cairoli 37', 1, NULL, '0,15 1 v sett', 15, 1, 'settimana', 54.1, 'mese', 50.0, NULL),
  ('Cairoli 37', 2, NULL, '0,15 2 v mese', 15, 2, 'mese', 36.75, 'mese', 25.0, NULL),
  ('Calcagno 3', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 93.73, 'mese', 75.0, NULL),
  ('Calcagno 19', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 108.15, 'mese', 50.0, NULL),
  ('Camogli 11', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 97.35, 'mese', 90.0, NULL),
  ('Camogli 27', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 91.92, 'mese', 50.0, NULL),
  ('Camogli 34', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 97.33, 'mese', 90.0, NULL),
  ('Campana 35', 1, NULL, '0,10 1 v sett', 10, 1, 'settimana', 58.44, 'mese', 30.0, NULL),
  ('Canepa', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 110.0, 'mese', 135.0, NULL),
  ('Capello 16-18', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 208.95, 'mese', 180.0, NULL),
  ('Carattino 39', 1, NULL, '0,15 + 0,30', NULL, NULL, NULL, 97.33, NULL, 110.0, NULL),
  ('Carattino 39', 2, NULL, '0,15 + 0,15', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Carattino 39', 3, NULL, '0,15 + 0,30', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Carattino 39', 4, NULL, '0,15 + 0,15', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Cassisi 77', 1, NULL, '0,30 1 v mese', 30, 1, 'mese', 36.8, 'mese', 20.0, NULL),
  ('Cassisi 77', 2, NULL, '0,30 2 v mese', 30, 2, 'mese', 75.7, 'mese', 50.0, NULL),
  ('Catalani 1', 1, NULL, '0,20 + 0,50 2 v sett', 35, 2, 'settimana', 173.4, 'mese', 210.0, NULL),
  ('Cav. Di malta 4', 1, NULL, '0,30', 30, NULL, NULL, 19.46, 'intervento', 20.0, NULL),
  ('Cav di malta 6', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 65.0, 'mese', 50.0, NULL),
  ('Cav di malta 6', 2, NULL, '0,30 1 v sett', 30, 1, 'settimana', 100.4, 'mese', 90.0, NULL),
  ('Cav di malta 27', 1, NULL, '0,20 + 0,45', NULL, NULL, NULL, 67.35, NULL, 195.0, NULL),
  ('Cav di malta 27', 2, 'cortile', '1 cortile', 60, NULL, NULL, 27.03, NULL, 40.0, NULL),
  ('Cavour 15', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 94.78, 'mese', 135.0, NULL),
  ('Cavour 23', 1, NULL, '1,15 1 v mese', 75, 1, 'mese', 51.92, 'mese', 50.0, NULL),
  ('Cavour 23', 2, NULL, '1,15 2 v mese', 75, 2, 'mese', 103.85, 'mese', 100.0, NULL),
  ('Cavour 47', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 101.47, 'mese', 50.0, NULL),
  ('Centro estetico', 1, NULL, '0,30 ad intervento', 30, NULL, 'a_richiesta', 17.0, 'intervento', 20.0, NULL),
  ('Chiappino 39', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 78.0, 'mese', 90.0, NULL),
  ('Chiavella 2', 1, NULL, '2 1 v sett + 1 cort', NULL, NULL, NULL, 395.65, NULL, 400.0, NULL),
  ('Chiesa 3', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 43.5, 'mese', 50.0, NULL),
  ('Cilea 6a 6b', 1, NULL, '0,45 + 1,30', NULL, NULL, NULL, 310.0, NULL, 390.0, NULL),
  ('Colla 28', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 105.16, 'mese', 90.0, NULL),
  ('Colombo 14', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 86.07, 'mese', 90.0, NULL),
  ('Colombo 18', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 181.68, 'mese', 135.0, NULL),
  ('Colombo 68', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 80.63, 'mese', 90.0, NULL),
  ('Colombo 115', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 68.95, 'mese', 90.0, NULL),
  ('Complesso astor', 1, NULL, '1,30 1 v sett + 0,45', NULL, NULL, NULL, 420.0, NULL, 300.0, NULL),
  ('Conradi 43-49', 1, NULL, '1,15 1 v sett', 75, 1, 'settimana', 360.53, 'mese', 225.0, NULL),
  ('Consorzio', 1, NULL, '1,30 1 v mese', 90, 1, 'mese', 75.53, 'mese', 60.0, NULL),
  ('Corosu 15-17', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 320.41, 'mese', 180.0, NULL),
  ('Corosu 18-20', 1, NULL, '1,10 1 v sett', 70, 1, 'settimana', 243.1, 'mese', 210.0, NULL),
  ('Corosu 18-20', 2, NULL, '1,10 2 v mese', 70, 2, 'mese', 121.5, 'mese', 105.0, NULL),
  ('Corosu 36', 1, NULL, '0,40 1 v sett', 40, 1, 'settimana', 132.45, 'mese', 120.0, NULL),
  ('Dante 5', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 118.85, 'mese', 90.0, NULL),
  ('Defferrari 9', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 108.73, 'mese', 135.0, NULL),
  ('Defferrari 16', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 82.8, 'mese', 135.0, NULL),
  ('Defferrari 16', 2, NULL, '0,45 2 v mese', 45, 2, 'mese', 44.1, 'mese', 75.0, NULL),
  ('Defferrari 33', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 90.2, 'mese', 135.0, NULL),
  ('Defferrari 33', 2, NULL, '0,45 2 v mese', 45, 2, 'mese', 50.8, 'mese', 75.0, NULL),
  ('Defferrari 53-63-63c', 1, NULL, 'Fatturiamo sempre', NULL, NULL, NULL, NULL, NULL, NULL, 'prezzo: Uguale ma ha; ottimale: Importi diversi'),
  ('Dei siccardi 11', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 112.5, 'mese', 90.0, NULL),
  ('De litta 2', 1, NULL, '0,40 1 v sett', 40, 1, 'settimana', 85.0, 'mese', 120.0, NULL),
  ('De litta 5', 1, NULL, '0,20 + 0,30 2 v sett', 25, 2, 'settimana', 93.22, 'mese', 150.0, NULL),
  ('Della rovere 25', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 33.9, 'mese', 50.0, NULL),
  ('Delle agavi 15', 1, NULL, '1 1 v mese', 60, 1, 'mese', 54.0, 'mese', 40.0, NULL),
  ('Delle agavi 15', 2, NULL, '1 2 v mese', 60, 2, 'mese', 86.5, 'mese', 90.0, NULL),
  ('Dellepiane', 1, NULL, NULL, NULL, NULL, NULL, 18.0, NULL, 20.0, NULL),
  ('Diaz 34', 1, NULL, '0,10 + 0,20 2 v sett', 15, 2, 'settimana', 85.37, 'mese', 85.0, NULL),
  ('Di vittorio 5', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 175.12, 'mese', 135.0, NULL),
  ('Di vittorio 5', 2, NULL, '0,30 1 v mese', 30, 1, 'mese', 30.9, 'mese', 20.0, 'prezzo: area est'),
  ('Don bosco 5', 1, NULL, '0,20 2 v mese', 20, 2, 'mese', 34.14, 'mese', 33.33, NULL),
  ('Don minzoni 1a 1b', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 123.6, 'mese', 135.0, NULL),
  ('Don minzoni 1a 1b', 2, NULL, '0,15 1 v mese', 15, 1, 'mese', 20.6, 'mese', 10.0, NULL),
  ('Elledi', 1, NULL, '2,30 a richiesta', 150, NULL, 'a_richiesta', 108.0, 'intervento', 100.0, NULL),
  ('Famagosta 14', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 48.67, 'mese', 90.0, NULL),
  ('Famagosta 32', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 91.57, 'mese', 90.0, NULL),
  ('F & F interni', 1, NULL, '3 1 v mese', 180, 1, 'mese', 120.0, 'mese', 120.0, NULL),
  ('Ferrari 140', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 107.38, 'mese', 180.0, NULL),
  ('Ferrari 172', 1, NULL, '0,20 + 0,30 2 v sett', 25, 2, 'settimana', 129.48, 'mese', 150.0, NULL),
  ('Ferraro Roberta', 1, NULL, NULL, NULL, NULL, NULL, 18.0, 'ora', 20.0, NULL),
  ('Foria', 1, NULL, NULL, NULL, NULL, NULL, 18.0, 'ora', 20.0, NULL),
  ('Forship', 1, NULL, NULL, NULL, NULL, NULL, 21.0, 'ora', NULL, NULL),
  ('Foscolo 1', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 138.45, 'mese', 90.0, NULL),
  ('Frizzi', 1, NULL, NULL, NULL, NULL, NULL, 18.0, NULL, 20.0, NULL),
  ('Gagliardi 5', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 50.0, 'mese', 50.0, NULL),
  ('Gls', 1, NULL, NULL, NULL, NULL, NULL, 20.0, 'ora', 20.0, NULL),
  ('Gandoglia 17', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 185.75, 'mese', 180.0, NULL),
  ('Gandoglia 17', 2, NULL, '0,45 + 1 2 v sett', 52, 2, 'settimana', 214.1, 'mese', 315.0, NULL),
  ('Garages lancia', 1, NULL, '2 1 v mese', 120, 1, 'mese', 97.33, 'mese', 80.0, NULL),
  ('Gavarone 6', 1, NULL, '1 1 v mese', 60, 1, 'mese', 34.6, 'mese', 40.0, NULL),
  ('Gavarone 7', 1, NULL, '0,20 2 v mese', 20, 2, 'mese', 47.62, 'mese', 33.33, NULL),
  ('Gavotti 11', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 82.2, 'mese', 90.0, NULL),
  ('Giardino 5', 1, NULL, '0,50 2 v mese', 50, 2, 'mese', 61.8, 'mese', 70.0, NULL),
  ('Giovane italia 4-6', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 180.25, 'mese', 180.0, NULL),
  ('Giovane Italia 19', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 227.25, 'mese', 135.0, NULL),
  ('Giovane italia 40', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 84.35, 'mese', 75.0, NULL),
  ('Giovanni XXIII 37', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 123.65, 'mese', 90.0, NULL),
  ('Gozo 9', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 72.8, 'mese', 90.0, NULL),
  ('Gramsci 12-14', 1, NULL, '0,45 + 1,30 2 v sett', 68, 2, 'settimana', 361.88, 'mese', 390.0, NULL),
  ('Gramsci 25', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 100.55, 'mese', 90.0, NULL),
  ('Grondona 10121416', 1, NULL, '2 1 v sett', 120, 1, 'settimana', 389.35, 'mese', 360.0, NULL),
  ('Grondona 10121416', 2, NULL, '0,15 1 v sett', 15, 1, 'settimana', 40.0, 'mese', 40.0, 'prezzo: canaline'),
  ('Imperia 6', 1, NULL, '0,40 2 v mese', 40, 2, 'mese', 119.0, 'mese', 66.67, NULL),
  ('Iris mobili', 1, NULL, '2 tutti i giorni', 120, 1, 'giorno', 1350.0, 'mese', 1240.0, 'ottimale: + festivi'),
  ('La noria', 1, NULL, '1 1 v sett+1,5 1vmes', NULL, NULL, NULL, 216.34, NULL, 180.0, 'ottimale: + 60'),
  ('La spezia 3', 1, NULL, '0,50 1 v sett', 50, 1, 'settimana', 129.78, 'mese', 150.0, NULL),
  ('Layolo 51', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 189.0, 'mese', 180.0, NULL),
  ('Layolo 51', 2, NULL, '1 2 v mese', 60, 2, 'mese', 94.36, 'mese', 90.0, NULL),
  ('Le azalee', 1, NULL, '1,30/2 1 v sett', NULL, NULL, NULL, 177.36, NULL, 280.0, NULL),
  ('Leon. Da vinci 1-3', 1, NULL, '1,30 1 v sett', 90, 1, 'settimana', 398.9, 'mese', 270.0, NULL),
  ('Leonardo da vinci 3', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 37.3, 'mese', 50.0, NULL),
  ('Leonardo da vinci 3', 2, NULL, '0,30 1 v mese', 30, 1, 'mese', 18.4, 'mese', 20.0, NULL),
  ('Leonardo da vinci 6', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 70.57, 'mese', 90.0, NULL),
  ('Leonardo da vinci 6', 2, NULL, '0,20 + 0,30 2 v sett', 25, 2, 'settimana', 100.0, 'mese', 150.0, NULL),
  ('Leopardi 25', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 52.0, 'mese', 90.0, NULL),
  ('Liguria servizi', 1, 'Vado', '0,45 1 v sett Vado', 45, 1, 'settimana', 483.4, 'mese', 135.0, NULL),
  ('Liguria servizi', 2, 'Savona', '1,30 1 v sett Savona', 90, 1, 'settimana', NULL, NULL, 270.0, NULL),
  ('Liguria servizi', 3, 'Loano', '1,15 2 v mese Loano', 75, 2, 'mese', NULL, NULL, 125.0, 'ottimale: tot 530'),
  ('Liguria 3', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 71.2, 'mese', 90.0, NULL),
  ('Luigi corsi 13-15', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 140.06, 'mese', 135.0, NULL),
  ('Macelleria scarone', 1, NULL, '0,30 ad int', 30, NULL, 'a_richiesta', 18.0, 'intervento', 20.0, NULL),
  ('Malocello 4', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 86.53, 'mese', 90.0, NULL),
  ('Malocello 50', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 111.74, 'mese', 90.0, NULL),
  ('Marconi 7', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 87.58, 'mese', 90.0, NULL),
  ('Marconi 16', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 146.0, 'mese', 135.0, NULL),
  ('Martini 3', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 117.0, 'mese', 90.0, NULL),
  ('Mazzini 5', 1, NULL, '1 1 v mese', 60, 1, 'mese', 65.0, 'mese', 40.0, NULL),
  ('Mazzini 5', 2, NULL, '0,30 1 v sett', 30, 1, 'settimana', 119.0, 'mese', 90.0, NULL),
  ('Mazzini 6', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 130.86, 'mese', 90.0, NULL),
  ('Mazzini 22 Spotorno', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 74.03, 'mese', 135.0, NULL),
  ('Milano 18', 1, NULL, '0,50 1 v sett', 50, 1, 'settimana', 154.0, 'mese', 150.0, NULL),
  ('Monastero 24', 1, NULL, '0,30 1 v mese', 30, 1, 'mese', 300.66, 'anno', 320.0, NULL),
  ('Monastero 24', 2, NULL, '0,30 2 v mese', 30, 2, 'mese', NULL, NULL, NULL, NULL),
  ('Monastero 127', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 50.92, 'mese', 90.0, NULL),
  ('Monastero 161', 1, 'per loro', '1 2 v mese per loro', 60, 2, 'mese', 1158.55, 'anno', 1080.0, NULL),
  ('Monastero 161', 2, NULL, 'uguale tutto l''anno', NULL, NULL, NULL, NULL, NULL, NULL, 'prezzo: fatturo periodi; ottimale: diversi'),
  ('Monastero 167', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 54.1, 'mese', 75.0, NULL),
  ('Montegrappa 29', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 123.3, 'mese', 90.0, NULL),
  ('Montegrappa 34', 1, NULL, '0,40 2 v mese', 40, 2, 'mese', 71.4, 'mese', 66.67, NULL),
  ('Montegrappa 34', 2, NULL, '0,40 1 v sett', 40, 1, 'settimana', 142.0, 'mese', 120.0, NULL),
  ('Montello 3', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 85.62, 'mese', 90.0, NULL),
  ('Montesisto 4', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 61.65, 'mese', 135.0, NULL),
  ('Morchio 5', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 119.18, 'mese', 90.0, NULL),
  ('Nino Bixio 8', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 74.92, 'mese', 90.0, NULL),
  ('Nizza 30a', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 199.26, 'mese', 180.0, NULL),
  ('Nizza 49', 1, NULL, '0,20 1 v sett', 20, 1, 'settimana', 61.8, 'mese', 60.0, NULL),
  ('Nizza 51', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 68.14, 'mese', 90.0, NULL),
  ('Nizza 53 b', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 86.52, 'mese', 90.0, NULL),
  ('Nizza 100', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 54.07, 'mese', 90.0, NULL),
  ('Nizza 116', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 88.66, 'mese', 90.0, NULL),
  ('Nizza 122', 1, NULL, '0,30 + 1 2 v sett', 45, 2, 'settimana', 254.11, 'mese', 270.0, NULL),
  ('Nizza 122', 2, NULL, '0,30', 30, NULL, NULL, 17.3, NULL, 20.0, NULL),
  ('Nizza 128-130', 1, NULL, '1 + 2 2 v sett', 90, 2, 'settimana', 494.28, 'mese', 540.0, NULL),
  ('N. S. Degli angeli', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 86.52, 'mese', 90.0, NULL),
  ('N. S. Del monte 6-8', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 90.0, 'mese', 135.0, NULL),
  ('Ordine architetti', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 160.0, 'mese', 180.0, NULL),
  ('Padre Piazza 20', 1, NULL, '1,40 1 v sett', 100, 1, 'settimana', 280.68, 'mese', 300.0, NULL),
  ('Padre Piazza 32', 1, NULL, '1,20 1 v sett', 80, 1, 'settimana', 286.64, 'mese', 240.0, NULL),
  ('Papa innocenzo 7-9', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 156.56, 'mese', 180.0, NULL),
  ('Papa innocenzo 11', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 144.0, 'mese', 90.0, NULL),
  ('Pastorino 10', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 76.23, 'mese', 90.0, NULL),
  ('Pertinace 10c', 1, NULL, '0,40 1 v sett', 40, 1, 'settimana', 86.53, 'mese', 120.0, NULL),
  ('Pertinace 16b ???', 1, NULL, '0,40 1 v sett', 40, 1, 'settimana', 69.75, 'mese', 120.0, NULL),
  ('Pertini 1-5', 1, NULL, '0,45 1 v sett + 0,45', NULL, NULL, NULL, 118.14, NULL, 165.0, NULL),
  ('Pescetto 40', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 111.75, 'mese', 90.0, NULL),
  ('Pescetto 40', 2, NULL, '1 1 v mese', 60, 1, 'mese', 65.0, 'mese', 40.0, NULL),
  ('Piave 15', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 87.6, 'mese', 90.0, NULL),
  ('Piave 130', 1, NULL, '0,40 1 v sett', 40, 1, 'settimana', 89.71, 'mese', 120.0, NULL),
  ('Piave 164b', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 97.35, 'mese', 90.0, NULL),
  ('Piemonte 11', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 56.72, 'mese', 90.0, NULL),
  ('Pizzorno 13', 1, NULL, '0,50 1 v sett', 50, 1, 'settimana', 210.71, 'mese', 150.0, NULL),
  ('Pizzorno 15-17-19', 1, NULL, '1,30 2 v mese', 90, 2, 'mese', 188.36, 'mese', 150.0, NULL),
  ('Poggi 8', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 124.02, 'mese', 90.0, NULL),
  ('Poggi 38', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 84.46, 'mese', 90.0, NULL),
  ('Prime', 1, NULL, '0,45 2 v sett', 45, 2, 'settimana', 19.0, 'ora', 20.0, NULL),
  ('Primo maggio 5', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 202.0, 'mese', 180.0, NULL),
  ('Prisma', 1, 'sola', '1,30 al giorno sola', 90, 1, 'giorno', 30.0, 'intervento', 30.0, NULL),
  ('Iv novembre 9', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 52.21, 'mese', 50.0, NULL),
  ('Iv novembre 41', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 70.65, 'mese', 90.0, NULL),
  ('Quiliano 2', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 69.22, 'mese', 90.0, NULL),
  ('Quiliano 5', 1, NULL, '0,20 1 v sett', 20, 1, 'settimana', 61.2, 'mese', 60.0, NULL),
  ('Quiliano 7', 1, NULL, '0,20 1 v sett', 20, 1, 'settimana', 56.79, 'mese', 60.0, NULL),
  ('Quiliano 10-10a', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 134.63, 'mese', 180.0, NULL),
  ('Recagno 4', 1, NULL, '0,20 1 v sett', 20, 1, 'settimana', 51.91, 'mese', 60.0, 'prezzo: sempre'),
  ('Recagno 4', 2, NULL, '0,20 2 v mese', 20, 2, 'mese', 51.91, 'mese', 33.33, 'prezzo: uguale'),
  ('Repetto 11', 1, NULL, '0,15 + 0,30 2 v sett', 22, 2, 'settimana', 123.43, 'mese', 135.0, NULL),
  ('Rossi 3', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 67.33, 'mese', 90.0, NULL),
  ('Sabazia 13', 1, NULL, '4 1 v sett + 1 vetri', NULL, NULL, NULL, 639.15, NULL, 760.0, NULL),
  ('Salmoiraghi', 1, NULL, NULL, NULL, NULL, NULL, 18.0, 'ora', 20.0, NULL),
  ('S. ambrogio 4', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 101.94, 'mese', 90.0, NULL),
  ('Sanac', 1, NULL, NULL, NULL, NULL, NULL, 21.0, NULL, 20.0, NULL),
  ('Sanda 105', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 42.76, 'mese', 90.0, NULL),
  ('San Francesco 13', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 67.6, 'mese', 75.0, NULL),
  ('San Francesco 13', 2, NULL, '0,45 1 v sett', 45, 1, 'settimana', 108.2, 'mese', 135.0, NULL),
  ('San Pietro 6', 1, NULL, '0,20 + 0,30 2 v sett', 25, 2, 'settimana', 110.05, 'mese', 150.0, NULL),
  ('San pietro 27-29', 1, NULL, '0,50 1 v sett', 50, 1, 'settimana', 92.2, 'mese', 150.0, NULL),
  ('San rocco 2', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 43.3, 'mese', 50.0, NULL),
  ('San rocco 2', 2, NULL, '0,30 1 v sett', 30, 1, 'settimana', 86.5, 'mese', 90.0, NULL),
  ('S. andrea 1', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 75.7, 'mese', 90.0, NULL),
  ('Santa Caterina 51', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 115.4, 'mese', 135.0, NULL),
  ('Saredo 38', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 67.13, 'mese', 90.0, NULL),
  ('Sbarbaro 1', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 126.42, 'mese', 90.0, NULL),
  ('Sb minerals', 1, NULL, NULL, NULL, NULL, NULL, 18.0, NULL, 20.0, NULL),
  ('Scavino 24', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 119.0, 'mese', 90.0, NULL),
  ('Seirullo 27', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 181.43, 'mese', 180.0, NULL),
  ('Serao 6', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 113.0, 'mese', 90.0, NULL),
  ('Serra 13a', 1, NULL, '0,45 2 v mese', 45, 2, 'mese', 72.0, 'mese', 75.0, NULL),
  ('Serra 13a', 2, NULL, '0,45 1 v mese', 45, 1, 'mese', 36.0, 'mese', 30.0, NULL),
  ('SGL', 1, NULL, '2 2 v mese', 120, 2, 'mese', 180.0, 'mese', 200.0, NULL),
  ('Silvano acerbo 20', 1, NULL, '0,45 1 v mese', 45, 1, 'mese', 41.2, 'mese', 30.0, 'prezzo: ott a mag'),
  ('Silvano acerbo 20', 2, NULL, '0,45 2 v mese', 45, 2, 'mese', 67.0, 'mese', 75.0, 'prezzo: giu e sett'),
  ('Silvano acerbo 20', 3, NULL, '2 v mese lug ago', NULL, NULL, NULL, 123.6, NULL, NULL, 'prezzo: lug ago'),
  ('Studio legale bms', 1, NULL, '1,30 1 v sett', 90, 1, 'settimana', 60.0, 'intervento', 60.0, NULL),
  ('Suor Letizia 23', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 77.3, 'mese', 90.0, NULL),
  ('Suor Letizia 23', 2, NULL, '0,30 2 v mese', 30, 2, 'mese', 46.3, 'mese', 50.0, NULL),
  ('Suor Letizia 23', 3, NULL, '0,45 1 v mese', 45, 1, 'mese', 36.0, 'mese', 30.0, NULL),
  ('Testa', 1, NULL, '1,30 2 v mese', 90, 2, 'mese', 150.0, 'mese', 150.0, NULL),
  ('Torcello 7-8', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 85.1, 'mese', 180.0, NULL),
  ('Torino 5', 1, NULL, '1 1 v mese', 60, 1, 'mese', 39.5, 'mese', 40.0, NULL),
  ('Torino 5', 2, NULL, '0,40 2 v mese', 40, 2, 'mese', 67.6, 'mese', 66.66, NULL),
  ('Torino 6', 1, NULL, '1 1 v mese', 60, 1, 'mese', 36.8, 'mese', 40.0, NULL),
  ('Torino 6', 2, NULL, '0,40 2 v mese', 40, 2, 'mese', 57.4, 'mese', 66.66, NULL),
  ('Torino 24', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 72.1, 'mese', 90.0, NULL),
  ('Turati 9a', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 115.87, 'mese', 90.0, NULL),
  ('Universal', 1, NULL, '1,30 1 v sett', 90, 1, 'settimana', 240.0, 'mese', 270.0, NULL),
  ('Vall. s. Cristoforo 19', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 88.26, 'mese', 90.0, NULL),
  ('Vallino 35', 1, NULL, '0,30 2 v mese', 30, 2, 'mese', 54.07, 'mese', 50.0, NULL),
  ('Xxiv aprile 10', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 87.16, 'mese', 90.0, NULL),
  ('Xxv aprile 68-70-72', 1, NULL, '1,45 1 v sett', 105, 1, 'settimana', 214.0, 'mese', 315.0, NULL),
  ('Verdi 16', 1, NULL, '0,45 3 v mese', 45, 3, 'mese', 74.26, 'mese', 90.0, NULL),
  ('Villa delle palme', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 93.29, 'mese', 135.0, NULL),
  ('Villagrande 5', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 112.5, 'mese', 90.0, NULL),
  ('Villagrande 17', 1, NULL, '0,30 1 v sett', 30, 1, 'settimana', 81.06, 'mese', 90.0, NULL),
  ('Villagrande 66', 1, NULL, '0,35 1 v sett', 35, 1, 'settimana', 162.22, 'mese', 105.0, NULL),
  ('Vittorio veneto 1', 1, NULL, '1 1 v sett', 60, 1, 'settimana', 302.29, 'mese', 180.0, NULL),
  ('Vittorio veneto 48', 1, NULL, '0,45 1 v sett', 45, 1, 'settimana', 118.0, 'mese', 135.0, NULL),
  ('Elena', 1, NULL, NULL, NULL, NULL, NULL, 18.0, NULL, 20.0, NULL);


-- Clienti: riusa quelli già presenti con lo stesso nome
UPDATE public.clienti c
SET nome_breve = i.nome
FROM _imp_clienti i
WHERE c.nome_breve IS NULL
  AND public.normalizza_nome(regexp_replace(c.ragione_sociale, '^\s*(condominio|cond\.)\s+', '', 'i'))
      = public.normalizza_nome(i.nome)
  AND NOT EXISTS (SELECT 1 FROM public.clienti c2
                  WHERE public.normalizza_nome(c2.nome_breve) = public.normalizza_nome(i.nome));

INSERT INTO public.clienti (ragione_sociale, nome_breve, tipo, attivo)
SELECT i.nome, i.nome, i.tipo, true
FROM _imp_clienti i
WHERE NOT EXISTS (SELECT 1 FROM public.clienti c
                  WHERE public.normalizza_nome(c.nome_breve) = public.normalizza_nome(i.nome));

-- Amministratore e tipo (senza sovrascrivere dati già inseriti)
UPDATE public.clienti c
SET amministratore_id = coalesce(c.amministratore_id, a.id),
    tipo              = coalesce(c.tipo, i.tipo)
FROM _imp_clienti i
LEFT JOIN public.amministratori a ON lower(a.nome) = lower(i.amm)
WHERE public.normalizza_nome(c.nome_breve) = public.normalizza_nome(i.nome);

-- Contratti
INSERT INTO public.contratti (cliente_id, tipo, stato, importo_mensile, prezzo_ottimale_mensile,
  ore_contratto_mensili, tempo_originale, prezzo_originale, prezzo_ottimale_originale, fonte_import, note)
SELECT c.id, 'ricorrente', 'attivo', i.importo, i.ottimale_m, i.ore,
       i.tempo, i.prezzo, i.ottimale, 'elenco-condomini-2026-11', i.note
FROM _imp_clienti i
JOIN public.clienti c ON public.normalizza_nome(c.nome_breve) = public.normalizza_nome(i.nome)
WHERE NOT EXISTS (SELECT 1 FROM public.contratti k
                  WHERE k.cliente_id = c.id AND k.fonte_import = 'elenco-condomini-2026-11');

-- Righe di servizio (solo per i contratti importati che non ne hanno ancora)
INSERT INTO public.contratti_servizi (contratto_id, ordine, descrizione, tempo_testo, minuti_intervento,
  interventi_numero, interventi_periodo, prezzo, prezzo_unita, prezzo_ottimale, note)
SELECT k.id, s.ordine, s.descrizione, s.tempo_testo, s.minuti, s.numero, s.periodo,
       s.prezzo, s.unita, s.ottimale, s.note
FROM _imp_servizi s
JOIN public.clienti c   ON public.normalizza_nome(c.nome_breve) = public.normalizza_nome(s.nome)
JOIN public.contratti k ON k.cliente_id = c.id AND k.fonte_import = 'elenco-condomini-2026-11'
WHERE NOT EXISTS (SELECT 1 FROM public.contratti_servizi x WHERE x.contratto_id = k.id);

COMMIT;

-- Controllo
SELECT count(*) AS contratti_importati,
       count(*) FILTER (WHERE importo_mensile IS NULL) AS senza_importo_calcolato,
       count(*) FILTER (WHERE ore_contratto_mensili IS NULL) AS senza_ore_calcolate
FROM public.contratti WHERE fonte_import = 'elenco-condomini-2026-11';
