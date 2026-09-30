-- migrations_v39.sql — Rimozione del menu bar da WashIN.
-- Il menu bar è stato spostato nel progetto DrinkIN (repo e database Supabase separati).
-- Nessun CASCADE: se qualcosa dipende ancora da queste tabelle, la migrazione si ferma.

DROP TABLE IF EXISTS public.bar_prodotti;
DROP TABLE IF EXISTS public.bar_categorie;
DROP TABLE IF EXISTS public.bar_tavoli;
DROP TABLE IF EXISTS public.bar_impostazioni;
DROP FUNCTION IF EXISTS public.bar_touch_updated_at();
DROP FUNCTION IF EXISTS public.bar_is_admin();
