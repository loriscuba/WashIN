import supabase from '../supabase.js'
import { showToast } from './clienti.js'

export async function loadPreventivi(filtri = {}) {
  try {
    let query = supabase.from('preventivi').select('*, clienti(ragione_sociale)')
    if (filtri.stato) query = query.eq('stato', filtri.stato)
    if (filtri.cliente_id) query = query.eq('cliente_id', filtri.cliente_id)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento preventivi', 'error')
    console.error(err)
    return []
  }
}

const BADGE_STATO = {
  bozza: 'badge-warning',
  inviato: 'badge-info',
  accettato: 'badge-success',
  rifiutato: 'badge-danger',
  scaduto: 'badge-danger',
  convertito: 'badge-info'
}

export function renderTabellaPreventivi(preventivi) {
  const tbody = document.getElementById('preventivi-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!preventivi.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun preventivo</td></tr>'
    return
  }
  const fmt = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0)
  preventivi.forEach(p => {
    const tr = document.createElement('tr')
    const badge = BADGE_STATO[p.stato] || 'badge-warning'
    const convertBtn = (p.stato === 'accettato')
      ? `<button class="btn btn-sm btn-primary" data-action="converti-preventivo" data-id="${p.id}">→ Contratto</button>`
      : ''
    tr.innerHTML = `
      <td>${p.numero_preventivo || '-'}</td>
      <td>${p.clienti?.ragione_sociale || '-'}</td>
      <td>${p.data_emissione || '-'}</td>
      <td>${p.data_validita || '-'}</td>
      <td>${fmt(p.importo)}</td>
      <td><span class="badge ${badge}">${p.stato}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" data-action="edit-preventivo" data-id="${p.id}">Modifica</button>
        ${convertBtn}
      </td>
    `
    tbody.appendChild(tr)
  })
}

async function populateClientiSelect(selectEl, selectedId = null) {
  const { data } = await supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale')
  selectEl.innerHTML = '<option value="">-- Seleziona cliente --</option>'
  ;(data || []).forEach(c => {
    const o = document.createElement('option')
    o.value = c.id
    o.textContent = c.ragione_sociale
    if (selectedId && c.id === selectedId) o.selected = true
    selectEl.appendChild(o)
  })
}

export async function openModalPreventivo(id = null) {
  try {
    const modal = document.getElementById('preventivo-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    const clienteSelect = form.querySelector('[name="cliente_id"]')
    if (clienteSelect) await populateClientiSelect(clienteSelect)

    if (id) {
      const { data, error } = await supabase.from('preventivi').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (el) el.value = v ?? ''
      })
      if (clienteSelect && data.cliente_id) clienteSelect.value = data.cliente_id
      form.dataset.preventivoId = id
      modal.querySelector('h2').textContent = 'Modifica Preventivo'
    } else {
      form.reset()
      delete form.dataset.preventivoId
      modal.querySelector('h2').textContent = 'Nuovo Preventivo'
      const emissEl = form.querySelector('[name="data_emissione"]')
      if (emissEl) emissEl.value = new Date().toISOString().slice(0, 10)
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal preventivo', 'error')
    console.error(err)
  }
}

export async function savePreventivo(formData) {
  try {
    const fields = {
      cliente_id: formData.cliente_id || null,
      numero_preventivo: formData.numero_preventivo || null,
      data_emissione: formData.data_emissione || null,
      data_validita: formData.data_validita || null,
      importo: formData.importo ? parseFloat(formData.importo) : 0,
      ore_stimate: formData.ore_stimate ? parseFloat(formData.ore_stimate) : 0,
      tipo_servizio: formData.tipo_servizio || null,
      frequenza: formData.frequenza || 'settimanale',
      stato: formData.stato || 'bozza',
      note: formData.note || null,
    }
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('preventivi').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('preventivi').insert(fields))
    }
    if (error) throw error
    showToast('Preventivo salvato', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio preventivo', 'error')
    console.error(err)
    return null
  }
}

export async function convertiInContratto(preventivoId) {
  try {
    const { data: prev, error: errPrev } = await supabase.from('preventivi').select('*').eq('id', preventivoId).single()
    if (errPrev) throw errPrev

    const num = `CNTR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error: errContr } = await supabase.from('contratti').insert({
      cliente_id: prev.cliente_id,
      numero_contratto: num,
      tipo: 'ricorrente',
      importo_mensile: prev.importo,
      ore_contratto_mensili: prev.ore_stimate,
      frequenza: prev.frequenza || 'settimanale',
      stato: 'attivo',
      data_inizio: prev.data_emissione,
      note: `Da preventivo ${prev.numero_preventivo || ''}${prev.note ? ': ' + prev.note : ''}`
    })
    if (errContr) throw errContr

    await supabase.from('preventivi').update({ stato: 'convertito' }).eq('id', preventivoId)
    showToast('Contratto creato dal preventivo!', 'success')
    return true
  } catch (err) {
    showToast('Errore conversione preventivo', 'error')
    console.error(err)
    return null
  }
}

export function initPreventivi() {
  try {
    const addBtn = document.getElementById('add-preventivo-button')
    const modal = document.getElementById('preventivo-modal')
    const form = modal?.querySelector('form')
    const cancelBtn = document.getElementById('preventivo-cancel')

    addBtn?.addEventListener('click', () => openModalPreventivo())
    cancelBtn?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)
        const payload = {
          id: form.dataset.preventivoId || undefined,
          cliente_id: fd.get('cliente_id'),
          numero_preventivo: fd.get('numero_preventivo'),
          data_emissione: fd.get('data_emissione'),
          data_validita: fd.get('data_validita'),
          importo: fd.get('importo'),
          ore_stimate: fd.get('ore_stimate'),
          tipo_servizio: fd.get('tipo_servizio'),
          frequenza: fd.get('frequenza'),
          stato: fd.get('stato'),
          note: fd.get('note'),
        }
        await savePreventivo(payload)
        modal.classList.remove('active')
        loadPreventivi().then(renderTabellaPreventivi)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-preventivo' && t.dataset.id) {
        await openModalPreventivo(t.dataset.id)
      }
      if (t.dataset.action === 'converti-preventivo' && t.dataset.id) {
        if (confirm('Creare un contratto da questo preventivo?')) {
          await convertiInContratto(t.dataset.id)
          loadPreventivi().then(renderTabellaPreventivi)
        }
      }
    })

    loadPreventivi().then(renderTabellaPreventivi)
  } catch (err) {
    showToast('Errore inizializzazione preventivi', 'error')
    console.error(err)
  }
}
