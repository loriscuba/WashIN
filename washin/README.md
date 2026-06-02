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
