-- migrations_v53: interventi senza giorno fisso (agenda squadre)
--
-- Da incollare nel SQL Editor DOPO v50. Idempotente.
--
--   * interventi.senza_giorno: l'intervento va fatto in un giorno qualsiasi della settimana.
--     data_pianificata resta il primo giorno della settimana (serve per filtri e report);
--     quando il foglio ore confermato dice in che giorno è stato fatto, prende quel giorno.
--   * I lavori straordinari usano tipo_pulizia = 'straordinaria' (già previsto), nessuna colonna nuova.

ALTER TABLE public.interventi ADD COLUMN IF NOT EXISTS senza_giorno boolean NOT NULL DEFAULT false;
