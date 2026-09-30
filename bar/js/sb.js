// Client Supabase condiviso: usa le stesse credenziali di WashIN (washin/js/config.js)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
  throw new Error('Configurazione Supabase mancante: verifica washin/js/config.js')
}

export const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
export const euro = n => fmt.format(Number(n || 0))
