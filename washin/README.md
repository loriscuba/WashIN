Istruzioni per pubblicazione file di configurazione

- Non committare `config.js` se contiene chiavi sensibili.
- Copia `js/config.template.js` o `js/config.example.js` in `js/config.js` e sostituisci i valori con le tue credenziali Supabase.
- Per siti statici (GitHub Pages) puoi usare la chiave anon di Supabase, ma abilita regole di sicurezza (RLS) e limita l'accesso.
- Se vuoi che il file sia servito pubblicamente, crea `washin/js/config.js` nel repository, ma ricontrolla che la chiave sia appropriata per l'uso client.

Esempio veloce (locale):

1. Copia il template:

```bash
cp washin/js/config.template.js washin/js/config.js
```

2. Modifica `washin/js/config.js` con la tua `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

3. Non includere `washin/js/config.js` nel commit se contiene chiavi reali; aggiungilo a `.gitignore` (già presente nel progetto).
# WashIN (cartella `washin/`)

Progetto web per la gestione di un'impresa di pulizie.

Questa cartella contiene la struttura minima dei file frontend.

Configurazione
1. Creare `config.js` in `washin/js/` con le credenziali Supabase (NON committare le chiavi):

```js
// washin/js/config.js (NON committare)
window.SUPABASE_URL = 'https://your-project.supabase.co'
window.SUPABASE_ANON_KEY = 'your-anon-key'
```

2. Aprire `washin/index.html` direttamente nel browser.

Note
- I file presenti sono placeholder: aggiungere implementazione JS/CSS/HTML
- `.gitignore` contiene già `config.js` per evitare commit accidentali
