import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const SEZIONI = [
  { sezione: 'clienti',             etichetta: 'Clienti',      fixed: false },
  { sezione: 'interventi',          etichetta: 'Interventi',   fixed: false },
  { sezione: 'gestione-anagrafica', etichetta: 'Dipendenti',   fixed: false },
  { sezione: 'preventivi',          etichetta: 'Preventivi',   fixed: false },
  { sezione: 'fatture',             etichetta: 'Fatture',      fixed: false },
  { sezione: 'presenze',            etichetta: 'Presenze',     fixed: false },
  { sezione: 'magazzino',           etichetta: 'Magazzino',    fixed: false },
  { sezione: 'veicoli',             etichetta: 'Veicoli',      fixed: false },
]

function toggleHtml(sezione, etichetta, enabled, fixed) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:12px 0;border-bottom:1px solid var(--gray-100);">
      <div>
        <p style="margin:0;font-weight:600;font-size:14px;color:var(--gray-800);">${etichetta}</p>
        ${fixed ? '<p style="margin:2px 0 0;font-size:11px;color:var(--gray-400);">Sempre visibile</p>' : ''}
      </div>
      <label style="position:relative;display:inline-block;width:46px;height:26px;flex-shrink:0;">
        <input type="checkbox" data-sezione-admin="${sezione}"
          ${enabled ? 'checked' : ''} ${fixed ? 'disabled' : ''}
          style="opacity:0;width:0;height:0;position:absolute;">
        <span class="sezione-toggle-track" style="
          position:absolute;inset:0;border-radius:13px;cursor:${fixed ? 'default' : 'pointer'};
          background:${enabled ? '#0d9488' : '#d1d5db'};transition:background .2s;">
          <span style="
            position:absolute;top:3px;width:20px;height:20px;background:#fff;border-radius:50%;
            transition:left .2s;left:${enabled ? '23px' : '3px'};box-shadow:0 1px 3px rgba(0,0,0,.2);">
          </span>
        </span>
      </label>
    </div>
  `
}

export function applySezioniAdmin(map) {
  SEZIONI.forEach(({ sezione }) => {
    const abilitata = map[sezione] !== false
    document.querySelectorAll(`[data-target="${sezione}"], a[href="#${sezione}"]`).forEach(el => {
      if (!el.closest('#sidebar-nav') && !el.closest('.nav-bottom')) return
      el.style.display = abilitata ? '' : 'none'
    })
    // hide sidebar nav link
    document.querySelectorAll(`#sidebar-nav a[data-target="${sezione}"]`).forEach(el => {
      el.style.display = abilitata ? '' : 'none'
    })
  })
}

export async function initSezioniAdmin() {
  const container = document.getElementById('sezioni-admin-panel')
  if (!container) return

  const { data } = await supabase.from('sezioni_admin').select('sezione, abilitata')
  const map = {}
  ;(data || []).forEach(r => { map[r.sezione] = r.abilitata })

  container.innerHTML = SEZIONI.map(({ sezione, etichetta, fixed }) =>
    toggleHtml(sezione, etichetta, map[sezione] !== false, fixed)
  ).join('')

  applySezioniAdmin(map)

  container.addEventListener('change', async e => {
    const cb = e.target
    if (cb.tagName !== 'INPUT' || !cb.dataset.sezioneAdmin) return
    const meta = SEZIONI.find(s => s.sezione === cb.dataset.sezioneAdmin)
    if (!meta) return

    const { error } = await supabase.from('sezioni_admin').upsert({
      sezione: cb.dataset.sezioneAdmin,
      etichetta: meta.etichetta,
      abilitata: cb.checked,
    }, { onConflict: 'sezione' })

    if (error) {
      showToast('Errore salvataggio', 'error')
      cb.checked = !cb.checked
      return
    }

    const track = cb.nextElementSibling
    if (track) {
      track.style.background = cb.checked ? '#0d9488' : '#d1d5db'
      const knob = track.firstElementChild
      if (knob) knob.style.left = cb.checked ? '23px' : '3px'
    }

    applySezioniAdmin({ ...Object.fromEntries(SEZIONI.map(s => [s.sezione, map[s.sezione] !== false])), [cb.dataset.sezioneAdmin]: cb.checked })
    map[cb.dataset.sezioneAdmin] = cb.checked
    showToast(cb.checked ? 'Sezione abilitata' : 'Sezione disabilitata', 'success')
  })
}
