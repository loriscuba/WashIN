-- WashIN v6 migrations
-- Run on Supabase SQL Editor

ALTER TABLE interventi ADD COLUMN IF NOT EXISTS operatore2_id uuid REFERENCES profili(id);
