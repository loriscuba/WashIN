-- ⚠️  CLEANUP AMBIENTE DI SVILUPPO — IRREVERSIBILE
-- Mantiene solo loriscuba@gmail.com, cancella tutti gli operatori e gli interventi.
-- Eseguire su Supabase → SQL Editor

-- ── 0. VERIFICA PRIMA DI PROCEDERE ───────────────────────────────────────────
-- Controlla cosa verrà eliminato:

SELECT
  p.id,
  p.cognome,
  p.nome,
  p.email         AS profilo_email,
  u.email         AS auth_email,
  p.user_id,
  p.ruolo
FROM profili p
LEFT JOIN auth.users u ON p.user_id = u.id
ORDER BY u.email NULLS LAST, p.cognome;

-- (se il risultato è quello atteso, prosegui con la sezione 1)

-- ── 1. ELIMINA OPERATORI (profili non admin) ──────────────────────────────────
-- CASCADE su: buste_paga, checklist_compilate, presenze (se hanno FK con CASCADE)

DELETE FROM profili
WHERE user_id IS NULL                                            -- profili importati senza account
   OR user_id NOT IN (
        SELECT id FROM auth.users WHERE email = 'loriscuba@gmail.com'
      );

-- ── 2. ELIMINA UTENTI AUTH (eccetto admin) ────────────────────────────────────
-- ON DELETE SET NULL su profili.user_id → il profilo admin non viene toccato

DELETE FROM auth.users
WHERE email != 'loriscuba@gmail.com';

-- ── 3. PULISCE INTERVENTI E PRESENZE ─────────────────────────────────────────

DELETE FROM interventi;
DELETE FROM presenze;

-- ── 4. VERIFICA FINALE ────────────────────────────────────────────────────────

SELECT 'profili'    AS tabella, count(*) AS righe FROM profili
UNION ALL
SELECT 'auth.users',             count(*)          FROM auth.users
UNION ALL
SELECT 'buste_paga',             count(*)          FROM buste_paga
UNION ALL
SELECT 'interventi',             count(*)          FROM interventi
UNION ALL
SELECT 'presenze',               count(*)          FROM presenze;
