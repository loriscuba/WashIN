# SQL di WashIN

Le modifiche al database si applicano **a mano** dal SQL Editor di Supabase
(progetto "WashIN Prj"). Lo storico migrazioni di Supabase non le registra,
quindi l'unico elenco affidabile è questa cartella.

## Struttura

| Percorso | Cosa contiene |
|---|---|
| `schema.sql` | Schema iniziale (tabelle base). |
| `migrations/migrations_vNN*.sql` | Migrazioni numerate, da applicare in ordine di nome. |
| `migrations/extra_*.sql` | Migrazioni senza numero arrivate dalla vecchia cartella `washin/sql/`. Sono già applicate in produzione; l'ordine originale non è noto, ma sono tutte idempotenti. |
| `dev/demo_data.sql` | Dati di esempio, solo per un database di prova. |
| `dev/cleanup_dev.sql` | **Irreversibile.** Svuota operatori e interventi. Mai in produzione. |

## Note sulla numerazione

- I numeri sotto 10 hanno lo zero davanti (`v05`) per tenere l'ordine giusto.
- `v29` e `v30` esistevano in due versioni diverse (una in `sql/`, una nella
  root). Sono entrambe applicate in produzione e ora si chiamano `v29a`/`v29b`
  e `v30a`/`v30b`.
- `v40` documenta le colonne delle ore su `interventi` che erano state create a
  mano senza file.

## Nuove migrazioni

1. Crea `migrations/migrations_vNN.sql` con il numero successivo.
2. Scrivila idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`).
3. Applicala dal SQL Editor **dopo** il merge della PR, e solo una volta.
