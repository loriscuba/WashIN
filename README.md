# WashIN

Gestionale web per un'impresa di pulizie: clienti e sedi, contratti, preventivi,
interventi, presenze, buste paga, fatture, magazzino, veicoli e conto economico
(area **admin**), più agenda, checklist, ore e cedolini per gli **operatori**.

## Stack

- HTML, CSS e JavaScript senza build (moduli ES, librerie da CDN)
- [Supabase](https://supabase.com): login, database Postgres, storage dei PDF ed edge function
- Pubblicazione su GitHub Pages a ogni push su `main` (`.github/workflows/pages-deploy.yml`)

## Struttura

| Percorso | Cosa contiene |
|---|---|
| `index.html`, `404.html` | Reindirizzano a `washin/` |
| `washin/index.html` | Login |
| `washin/admin/dashboard.html` + `washin/js/admin/` | Area admin, un file JS per sezione |
| `washin/operatore/dashboard.html` + `washin/js/operatore/` | Area operatore |
| `washin/js/config.js` | URL Supabase e chiavi pubbliche (vedi i commenti nel file) |
| `sql/` | Schema e migrazioni del database (vedi `sql/README.md`) |
| `supabase/functions/` | Edge function: `crea-utente-operatore`, `send-cedolino`, `c` (link breve al cedolino) |

## Database

Le modifiche si applicano a mano dal SQL Editor di Supabase. Le regole sono in
[`sql/README.md`](sql/README.md).

Il collegamento tra profilo e account di accesso è `profili.user_id` →
`auth.users.id`. `profili.id` è un id interno e non coincide con l'account.

## Provare in locale

Serve un server statico, perché i moduli ES non funzionano aprendo il file:

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000/washin/
```

L'app usa il database di produzione indicato in `washin/js/config.js`.
