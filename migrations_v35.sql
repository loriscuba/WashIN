-- migrations_v35.sql — Normalizza ruolo su profili importati senza ruolo

UPDATE profili SET ruolo = 'operatore' WHERE ruolo IS NULL;
