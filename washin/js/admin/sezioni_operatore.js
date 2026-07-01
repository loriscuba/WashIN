import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const SEZIONI = [
  { sezione: 'agenda',    etichetta: 'Agenda',                fixed: true  },
  { sezione: 'documenti', etichetta: 'I miei documenti',      fixed: false },
  { sezione: 'cedolini',  etichetta: 'Cedolini',              fixed: false },
  { sezione: 'storico',   etichetta: 'Storico interventi',    fixed: false },
]

function toggleHtml(sezione, enabled, fixed) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:14px 0;border-bottom:1px solid var(--gray-100);">
      <div>
        <p style="margin:0;font-weight:600;font-size:14px;color:var(--gray-800);">${
          SEZIONI.find(s => s.sezione === sezione)?.etichetta || sezione}</p>
        ${fixed ? '<p style="margin:2px 0 0;font-size:11px;color:var(--gray-400);">Sempre visibile</p>' : ''}
      </div>
      <label style="position:relative;display:inline-block;width:46px;height:26px;flex-shrink:0;">
        <input type="checkbox" data-sezione="${sezione}"
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

export async function initSezioniOperatore() {
  const container = document.getElementById('sezioni-operatore-panel')
  if (!container) return

  const { data } = await supabase.from('sezioni_operatore').select('sezione, abilitata')
  const map = {}
  ;(data || []).forEach(r => { map[r.sezione] = r.abilitata })

  container.innerHTML = SEZIONI.map(({ sezione, fixed }) =>
    toggleHtml(sezione, map[sezione] !== false, fixed)
  ).join('')

  container.addEventListener('change', async e => {
    const cb = e.target
    if (cb.tagName !== 'INPUT' || !cb.dataset.sezione) return
    const meta = SEZIONI.find(s => s.sezione === cb.dataset.sezione)
    if (!meta) return

    const { error } = await supabase.from('sezioni_operatore').upsert({
      sezione: cb.dataset.sezione,
      etichetta: meta.etichetta,
      abilitata: cb.checked,
    }, { onConflict: 'sezione' })

    if (error) {
      showToast('Errore salvataggio', 'error')
      cb.checked = !cb.checked
      return
    }

    // Update track visual
    const track = cb.nextElementSibling
    if (track) {
      track.style.background = cb.checked ? '#0d9488' : '#d1d5db'
      const knob = track.firstElementChild
      if (knob) knob.style.left = cb.checked ? '23px' : '3px'
    }
    showToast(cb.checked ? 'Sezione abilitata' : 'Sezione disabilitata', 'success')
  })
}
