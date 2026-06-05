import supabase from '../supabase.js'
import { showToast } from './clienti.js'

export async function loadContratti(filtri = {}) {
  try {
    let q = supabase.from('contratti').select('*, clienti(ragione_sociale)')
    if (filtri.cliente_id) q = q.eq('cliente_id', filtri.cliente_id)
    if (filtri.stato) q = q.eq('stato', filtri.stato)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento contratti', 'error')
    console.error(err)
    return []
  }
}

function createContrattoRow(c) {
  const tr = document.createElement('tr')
  const badgeClass = c.stato === 'attivo' ? 'badge-success' : c.stato === 'scaduto' ? 'badge-danger' : 'badge-warning'
  tr.innerHTML = `
    <td>${c.clienti?.ragione_sociale || '-'}</td>
    <td>${c.numero_contratto || '-'}</td>
    <td>${c.tipo || '-'}</td>
    <td>${c.importo_mensile != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(c.importo_mensile) : '-'}</td>
    <td>${c.ore_contratto_mensili ?? '-'}</td>
    <td>${c.data_inizio || '-'}</td>
    <td>${c.data_fine || '-'}</td>
    <td><span class="badge ${badgeClass}">${c.stato}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="edit-contratto" data-id="${c.id}">Modifica</button>
    </td>
  `
  return tr
}

export function renderTabellaContratti(contratti) {
  try {
    const tbody = document.getElementById('contratti-table-body')
    if (!tbody) return
    tbody.innerHTML = ''
    contratti.forEach(c => tbody.appendChild(createContrattoRow(c)))
  } catch (err) {
    showToast('Errore render contratti', 'error')
    console.error(err)
  }
}

async function populateClientiSelect(selectEl, selectedId = null) {
  const { data, error } = await supabase.from('clienti').select('id, ragione_sociale').eq('attivo', true).order('ragione_sociale')
  if (error) return
  selectEl.innerHTML = '<option value="">-- Seleziona cliente --</option>'
  ;(data || []).forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = c.ragione_sociale
    if (selectedId && c.id === selectedId) opt.selected = true
    selectEl.appendChild(opt)
  })
}

export async function openModalContratto(id = null) {
  try {
    const modal = document.getElementById('contratto-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    const clienteSelect = form.querySelector('[name="cliente_id"]')
    await populateClientiSelect(clienteSelect)

    if (id) {
      const { data, error } = await supabase.from('contratti').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (el) el.value = v ?? ''
      })
      if (clienteSelect && data.cliente_id) clienteSelect.value = data.cliente_id
      form.dataset.contrattoId = id
      modal.querySelector('h2').textContent = 'Modifica Contratto'
    } else {
      form.reset()
      delete form.dataset.contrattoId
      modal.querySelector('h2').textContent = 'Nuovo Contratto'
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal contratto', 'error')
    console.error(err)
  }
}

export async function saveContratto(formData) {
  try {
    const fields = {
      cliente_id: formData.cliente_id || null,
      numero_contratto: formData.numero_contratto || null,
      tipo: formData.tipo || null,
      data_inizio: formData.data_inizio || null,
      data_fine: formData.data_fine || null,
      importo_mensile: formData.importo_mensile ? parseFloat(formData.importo_mensile) : null,
      ore_contratto_mensili: formData.ore_contratto_mensili ? parseFloat(formData.ore_contratto_mensili) : null,
      frequenza: formData.frequenza || null,
      stato: formData.stato || 'attivo',
      note: formData.note || null,
    }
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('contratti').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('contratti').insert(fields))
    }
    if (error) throw error
    showToast('Contratto salvato', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio contratto', 'error')
    console.error(err)
    return null
  }
}

export function initContratti() {
  try {
    const addBtn = document.getElementById('add-contratto-button')
    const modal = document.getElementById('contratto-modal')
    const modalClose = modal?.querySelector('.btn-secondary')
    const form = modal?.querySelector('form')

    addBtn?.addEventListener('click', () => openModalContratto())
    modalClose?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const payload = {
          id: form.dataset.contrattoId || undefined,
          cliente_id: form.querySelector('[name="cliente_id"]').value,
          numero_contratto: form.querySelector('[name="numero_contratto"]').value,
          tipo: form.querySelector('[name="tipo"]').value,
          data_inizio: form.querySelector('[name="data_inizio"]').value,
          data_fine: form.querySelector('[name="data_fine"]').value,
          importo_mensile: form.querySelector('[name="importo_mensile"]').value,
          ore_contratto_mensili: form.querySelector('[name="ore_contratto_mensili"]').value,
          frequenza: form.querySelector('[name="frequenza"]').value,
          stato: form.querySelector('[name="stato"]').value,
          note: form.querySelector('[name="note"]').value,
        }
        await saveContratto(payload)
        form.reset()
        delete form.dataset.contrattoId
        modal.classList.remove('active')
        loadContratti().then(renderTabellaContratti)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-contratto' && t.dataset.id) {
        await openModalContratto(t.dataset.id)
      }
    })

    loadContratti().then(renderTabellaContratti)
  } catch (err) {
    showToast('Errore inizializzazione contratti', 'error')
    console.error(err)
  }
}
