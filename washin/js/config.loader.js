// Script di caricamento config con fallback
async function loadConfig() {
  try {
    const response = await fetch('js/config.js');
    if (response.ok) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'js/config.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Impossibile caricare js/config.js'));
        document.head.appendChild(script);
      });
      return;
    }
  } catch (e) {
    console.warn('config.js non trovato, usando template...');
  }

  // Fallback: carica template e avvisa l'utente
  window.SUPABASE_URL = 'https://your-project.supabase.co';
  window.SUPABASE_ANON_KEY = 'your-anon-key';

  const errorDiv = document.getElementById('error-msg') || document.getElementById('auth-error');
  if (errorDiv) {
    errorDiv.textContent = '⚠️ Configura le credenziali Supabase in washin/js/config.js';
    errorDiv.style.display = 'block';
  }
  console.error('⚠️ Credenziali Supabase non configurate. Vedi washin/js/config.template.js');
}
