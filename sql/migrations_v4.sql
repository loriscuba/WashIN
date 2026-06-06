-- WashIN v4 migrations
-- Run on Supabase SQL Editor

ALTER TABLE magazzino ADD COLUMN IF NOT EXISTS scadenza date;
