import supabase from '../supabase.js'
import { showToast } from './clienti.js'

// ── State ─────────────────────────────────────────────────────────────────────

let _modelli = []

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadModelliPreventivo() {
  const { data, error } = await supabase
    .from('modelli_preventivo')
    .select('*')
    .eq('attivo', true)
    .order('nome')
  if (error) { console.error(error); return [] }
  _modelli = data || []
  return _modelli
}

export function getModelliCache() { return _modelli }

// ── Render sezione configurazioni ─────────────────────────────────────────────

const TIPO_ICON = { condominio: '🏢', hotel: '🏨', uffici: '🏢', facchinaggio: '📦', altro: '📄' }

function renderModelliPrevList(modelli) {
  const el = document.getElementById('modelli-prev-list')
  if (!el) return
  el.innerHTML = ''
  if (!modelli.length) {
    el.innerHTML = '<p style="color:var(--gray-500);padding:24px;">Nessun modello presente.</p>'
    return
  }
  modelli.forEach(m => {
    const card = document.createElement('div')
    card.className = 'card'
    card.style.cssText = 'padding:16px 20px;display:flex;align-items:center;gap:16px;margin-bottom:12px;'
    const serviziDefault = Array.isArray(m.servizi_default) ? m.servizi_default : []
    card.innerHTML = `
      <div style="font-size:28px;flex-shrink:0;">${TIPO_ICON[m.tipo] || '📄'}</div>
      <div style="flex:1;min-width:0;">
        <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:var(--gray-900);">${m.nome}</p>
        <p style="margin:0 0 6px;font-size:12px;color:var(--gray-500);">${m.descrizione || ''}</p>
        <span class="badge badge-success" style="margin-right:4px;">Attivo</span>
        <span class="badge badge-info">${m.tipo}</span>
        <p style="margin:6px 0 0;font-size:11px;color:var(--gray-400);">${serviziDefault.length} servizi predefiniti</p>
      </div>
      <div style="flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" data-action="edit-modello-prev" data-id="${m.id}">Modifica</button>
      </div>
    `
    el.appendChild(card)
  })
}

// ── Modal modello preventivo ──────────────────────────────────────────────────

function openModalModelloPreventivo(id = null) {
  const modal = document.getElementById('modello-prev-modal')
  if (!modal) return
  const form = modal.querySelector('form')
  if (!form) return

  form.reset()
  delete form.dataset.modelloId

  if (id) {
    const m = _modelli.find(x => x.id === id)
    if (!m) return
    form.dataset.modelloId = id
    form.querySelector('[name="nome"]').value = m.nome
    form.querySelector('[name="tipo"]').value = m.tipo
    form.querySelector('[name="descrizione"]').value = m.descrizione || ''
    form.querySelector('[name="luogo_default"]').value = m.configurazione?.luogo_default || ''
    form.querySelector('[name="compagnia_default"]').value = m.configurazione?.compagnia_default || ''
    form.querySelector('[name="polizza_default"]').value = m.configurazione?.polizza_default || ''
    // servizi
    const serviziEl = form.querySelector('[name="servizi_testo"]')
    if (serviziEl) serviziEl.value = (Array.isArray(m.servizi_default) ? m.servizi_default : []).join('\n')
    modal.querySelector('h2').textContent = 'Modifica Modello'
  } else {
    modal.querySelector('h2').textContent = 'Nuovo Modello'
  }
  modal.classList.add('active')
}

async function saveModelloPreventivo(form) {
  const fd = new FormData(form)
  const serviziTesto = (fd.get('servizi_testo') || '').split('\n').map(s => s.trim()).filter(Boolean)
  const fields = {
    nome:        fd.get('nome')?.trim(),
    tipo:        fd.get('tipo'),
    descrizione: fd.get('descrizione')?.trim() || null,
    servizi_default: serviziTesto,
    configurazione: {
      luogo_default:      fd.get('luogo_default')?.trim() || '',
      compagnia_default:  fd.get('compagnia_default')?.trim() || '',
      polizza_default:    fd.get('polizza_default')?.trim() || '',
    }
  }
  if (!fields.nome || !fields.tipo) { showToast('Nome e tipo obbligatori', 'error'); return false }

  const id = form.dataset.modelloId
  let error
  if (id) {
    ;({ error } = await supabase.from('modelli_preventivo').update(fields).eq('id', id))
  } else {
    ;({ error } = await supabase.from('modelli_preventivo').insert(fields))
  }
  if (error) { showToast('Errore salvataggio modello', 'error'); console.error(error); return false }
  showToast('Modello salvato', 'success')
  return true
}

// ── Init sezione ──────────────────────────────────────────────────────────────

export async function initModelliPreventivo() {
  const section = document.getElementById('modelli-preventivo')
  if (!section) return

  const modelli = await loadModelliPreventivo()
  renderModelliPrevList(modelli)

  // Delegated click
  section.addEventListener('click', e => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t.dataset.action === 'edit-modello-prev') openModalModelloPreventivo(t.dataset.id)
    if (t.dataset.action === 'new-modello-prev') openModalModelloPreventivo()
  })

  // Modal
  const modal = document.getElementById('modello-prev-modal')
  if (modal) {
    modal.querySelector('#modello-prev-cancel')?.addEventListener('click', () => modal.classList.remove('active'))
    modal.querySelector('form')?.addEventListener('submit', async e => {
      e.preventDefault()
      const ok = await saveModelloPreventivo(e.target)
      if (ok) {
        modal.classList.remove('active')
        const m = await loadModelliPreventivo()
        renderModelliPrevList(m)
      }
    })
  }
}
