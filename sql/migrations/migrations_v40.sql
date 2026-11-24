-- migrations_v40: ore lavorate registrate sull'intervento
--
-- Queste colonne esistono già nel database di produzione: sono state create a
-- mano a luglio 2026 insieme alle PR "ore su intervento" e "ore per operatore",
-- ma non erano in nessun file del repo. Questo file serve a ricostruire lo
-- schema da zero. Idempotente: rilanciarlo sul database attuale non cambia nulla.
--
--   ore_ordinarie / ore_straordinario          → operatore principale
--   ore_ordinarie_op2 / ore_straordinario_op2  → secondo operatore (operatore2_id)
--   note_ore                                   → note cantiere inserite con le ore

ALTER TABLE interventi
  ADD COLUMN IF NOT EXISTS ore_ordinarie         numeric,
  ADD COLUMN IF NOT EXISTS ore_straordinario     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note_ore              text,
  ADD COLUMN IF NOT EXISTS ore_ordinarie_op2     numeric,
  ADD COLUMN IF NOT EXISTS ore_straordinario_op2 numeric DEFAULT 0;
