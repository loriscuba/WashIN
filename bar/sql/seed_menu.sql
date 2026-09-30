-- Seed menu bar (da menu_bar.xlsx). Idempotente: salta se esistono già prodotti.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bar_prodotti) THEN RETURN; END IF;

  INSERT INTO public.bar_categorie (nome, ordine) VALUES
    ('Tavola Calda – Pasta', 1),
    ('Tavola Calda – Insalate e Secondi', 2),
    ('Pizza', 3),
    ('Panini', 4),
    ('Piadine', 5),
    ('Snack e Dolci', 6),
    ('Caffetteria', 7)
  ON CONFLICT (nome) DO NOTHING;

  INSERT INTO public.bar_prodotti (categoria_id, nome, variante, descrizione, prezzo, surgelato, disponibile, ordine)
  SELECT c.id, v.nome, v.variante, v.descrizione, v.prezzo, v.surgelato, v.disponibile, v.ordine
  FROM (VALUES
    ('Tavola Calda – Pasta', 'Bolognese', NULL, NULL, 11.00, false, true, 1),
    ('Tavola Calda – Pasta', 'Pesto', NULL, NULL, 11.00, false, true, 2),
    ('Tavola Calda – Pasta', 'Arrabbiata', NULL, NULL, 11.00, false, true, 3),
    ('Tavola Calda – Pasta', 'Pomodoro', NULL, NULL, 8.50, false, true, 4),
    ('Tavola Calda – Pasta', 'Gnocchi o Trofie al Pesto', NULL, NULL, 13.00, true, true, 5),
    ('Tavola Calda – Pasta', 'Ravioli Burro e Salvia', NULL, NULL, 14.00, true, true, 6),
    ('Tavola Calda – Pasta', 'Pansotti al Sugo di Noci', NULL, NULL, 14.00, true, true, 7),
    ('Tavola Calda – Insalate e Secondi', 'Insalata Mista', NULL, NULL, 13.00, false, true, 8),
    ('Tavola Calda – Insalate e Secondi', 'Bresaola, Rucola e Grana', NULL, NULL, 14.00, false, true, 9),
    ('Tavola Calda – Insalate e Secondi', 'Carpaccio di Tonno con Rucola e Pomodorini', NULL, NULL, 15.00, false, true, 10),
    ('Tavola Calda – Insalate e Secondi', 'Roast Beef e Patate', NULL, NULL, 14.00, false, true, 11),
    ('Pizza', 'Marinara', NULL, 'Pomodoro, aglio, origano', 6.00, true, true, 12),
    ('Pizza', 'Margherita', NULL, 'Pomodoro, mozzarella', 8.00, true, true, 13),
    ('Pizza', 'Bufala', NULL, 'Pomodoro, pomodorini, mozzarella di bufala', 12.00, true, true, 14),
    ('Pizza', 'Prosciutto', NULL, 'Pomodoro, prosciutto cotto, mozzarella', 9.50, true, true, 15),
    ('Pizza', 'Diavola', NULL, 'Pomodoro, salame piccante, mozzarella', 9.50, true, true, 16),
    ('Pizza', 'Wurstel', NULL, 'Pomodoro, wurstel, mozzarella', 9.50, true, true, 17),
    ('Pizza', '4 Formaggi', NULL, 'Mozzarella, fontina, stracchino, gorgonzola', 9.50, true, true, 18),
    ('Pizza', 'Romana', NULL, 'Pomodoro, olive, capperi, acciughe, mozzarella', 10.00, true, true, 19),
    ('Pizza', 'Pesto', NULL, 'Pesto, mozzarella', 10.00, true, true, 20),
    ('Pizza', 'Tonno e Cipolle', NULL, 'Pomodoro, tonno, cipolle, mozzarella', 10.00, true, true, 21),
    ('Pizza', 'Vegetariana', NULL, 'Pomodoro, verdure grigliate, mozzarella', 9.50, true, true, 22),
    ('Pizza', 'Salsiccia', NULL, 'Pomodoro, salsiccia, cipolle, gorgonzola, mozzarella', 12.00, true, true, 23),
    ('Pizza', 'Speck', NULL, 'Panna, mozzarella, speck', 12.00, true, true, 24),
    ('Pizza', 'Capricciosa', NULL, 'Pomodoro, funghetti, carciofini, cotto, mozzarella', 10.00, true, true, 25),
    ('Panini', 'Cotto e Formaggio', NULL, NULL, 7.00, false, true, 26),
    ('Panini', 'Salame e Formaggio', NULL, NULL, 7.00, false, true, 27),
    ('Panini', 'Pomodoro e Mozzarella', NULL, NULL, 7.00, false, true, 28),
    ('Panini', 'Crudo e Mozzarella', NULL, NULL, 8.00, false, true, 29),
    ('Piadine', 'Cotto e Mozzarella', NULL, NULL, 8.50, false, true, 30),
    ('Piadine', 'Crudo, Stracchino e Rucola', NULL, NULL, 8.50, false, true, 31),
    ('Piadine', 'Cotto, Pomodoro e Mozzarella', NULL, NULL, 8.50, false, true, 32),
    ('Piadine', 'Vegetariana', NULL, 'Verdure grigliate e formaggio', 8.50, true, true, 33),
    ('Piadine', 'Speck e Brie', NULL, NULL, 8.50, false, true, 34),
    ('Snack e Dolci', 'Brioches', NULL, 'Marmellata, cioccolato, crema, vuote', 2.00, true, true, 35),
    ('Snack e Dolci', 'Focaccia liscia', NULL, NULL, 1.80, false, true, 36),
    ('Snack e Dolci', 'Focaccia farcita piccola', NULL, NULL, 2.50, false, true, 37),
    ('Snack e Dolci', 'Pizza trancio', NULL, NULL, 3.50, false, true, 38),
    ('Snack e Dolci', 'Toast', NULL, NULL, 4.50, false, true, 39),
    ('Snack e Dolci', 'Focaccia farcita', NULL, NULL, 6.00, false, true, 40),
    ('Caffetteria', 'Caffè espresso', NULL, NULL, 1.50, false, true, 41),
    ('Caffetteria', 'Caffè americano', NULL, NULL, 2.50, false, true, 42),
    ('Caffetteria', 'Caffè decaffeinato', NULL, NULL, 1.60, false, true, 43),
    ('Caffetteria', 'Caffè d''orzo', 'Piccolo', NULL, 1.50, false, true, 44),
    ('Caffetteria', 'Caffè d''orzo', 'Grande', NULL, 2.50, false, true, 45),
    ('Caffetteria', 'Caffè al ginseng', 'Piccolo', NULL, 1.80, false, true, 46),
    ('Caffetteria', 'Caffè al ginseng', 'Grande', NULL, 2.50, false, true, 47),
    ('Caffetteria', 'Caffè corretto', NULL, NULL, 2.00, false, true, 48),
    ('Caffetteria', 'Cappuccino', NULL, NULL, 2.00, false, true, 49),
    ('Caffetteria', 'Latte macchiato', NULL, NULL, 3.00, false, true, 50),
    ('Caffetteria', 'Marocchino', NULL, NULL, 2.00, false, true, 51),
    ('Caffetteria', 'Latte bianco', NULL, NULL, 1.80, false, true, 52),
    ('Caffetteria', 'Tè e tisane', NULL, NULL, 2.50, false, true, 53),
    ('Caffetteria', 'Cioccolata calda', NULL, NULL, 3.50, false, true, 54)
  ) AS v(categoria, nome, variante, descrizione, prezzo, surgelato, disponibile, ordine)
  JOIN public.bar_categorie c ON c.nome = v.categoria;
END $$;
