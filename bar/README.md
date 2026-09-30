# Menu Bar (QR)

Menu digitale del bar, sullo stesso progetto Supabase di WashIN (tabelle `bar_*`).

- `bar/` — menu pubblico per i clienti. `?t=<tavolo>` mostra il numero del tavolo.
- `bar/admin.html` — gestione (login WashIN, solo ruolo `admin`): prodotti, disponibilità, categorie, tavoli, stampa/download dei QR, impostazioni.

## Setup database
Eseguire in ordine nell'SQL Editor di Supabase:
1. `sql/migrations_bar_v1.sql` — tabelle, RLS (lettura pubblica, scrittura solo admin).
2. `sql/seed_menu.sql` — menu iniziale (da `menu_bar.xlsx`); non fa nulla se ci sono già prodotti.

Le credenziali sono lette da `washin/js/config.js`. La libreria QR (`js/vendor/qrcode.js`, MIT) è inclusa nel repo.
