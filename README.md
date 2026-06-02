# WashIN

Web app per la gestione di un'impresa di pulizie.

Stack
- HTML + CSS + JavaScript (vanilla, no bundler)
- Supabase: Auth + Database + Storage

Run
1. Crea un file `config.js` nella root del progetto con le tue credenziali (NON committare mai chiavi reali). Esempio:

```js
// config.js (NON committare)
window.SUPABASE_URL = 'https://your-project.supabase.co'
window.SUPABASE_ANON_KEY = 'your-anon-key'
```

2. Apri `index.html` direttamente nel browser (nessun build step).

Schema minimo richiesto su Supabase
- Tabella `profiles` con almeno i campi:
	- `id` (uuid) — chiave primaria, corrisponde a `auth.users.id`
	- `role` (text) — valori previsti: `admin` o `operatore`

Funzionalità incluse
- Pagina di login / registrazione (autenticazione via Supabase Auth)
- Dopo login, viene letta la riga corrispondente in `profiles` e viene mostrata la dashboard corretta in base al ruolo (`admin` / `operatore`).

Design
- Mobile-first, palette: teal (#0D9488), dark navy (#0F172A), ambra (#F59E0B)
- Font: Inter (Google Fonts)
- Icone: Lucide Icons (CDN)

Nota
- Il file `config.js` deve essere creato manualmente dall'utente prima di aprire `index.html`.

Se vuoi, posso:
- Generare migrazioni SQL per creare la tabella `profiles`.
- Aggiungere mock di gestione utenti nella dashboard admin.
