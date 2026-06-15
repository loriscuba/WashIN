import supabase from '../supabase.js'
import { showToast } from './clienti.js'

let _allContratti = []
let _search = ''
let _sortCol = ''
let _sortDir = 'asc'
let _statoFiltro = 'attivo'

function sortValue(c, col) {
  switch (col) {
    case 'cliente':               return (c.clienti?.ragione_sociale || '').toLowerCase()
    case 'numero_contratto':      return (c.numero_contratto || '').toLowerCase()
    case 'tipo':                  return (c.tipo || '').toLowerCase()
    case 'importo_mensile':       return c.importo_mensile ?? -Infinity
    case 'ore_contratto_mensili': return c.ore_contratto_mensili ?? -Infinity
    case 'data_inizio':           return c.data_inizio || ''
    case 'data_fine':             return c.data_fine || ''
    case 'stato':                 return c.stato || ''
    default:                      return c.created_at || ''
  }
}

function filterAndRender() {
  let data = [..._allContratti]
  const q = _search.trim().toLowerCase()
  if (q) {
    data = data.filter(c =>
      (c.clienti?.ragione_sociale || '').toLowerCase().includes(q) ||
      (c.numero_contratto || '').toLowerCase().includes(q)
    )
  }
  if (_sortCol) {
    data.sort((a, b) => {
      const va = sortValue(a, _sortCol)
      const vb = sortValue(b, _sortCol)
      if (va < vb) return _sortDir === 'asc' ? -1 : 1
      if (va > vb) return _sortDir === 'asc' ? 1 : -1
      return 0
    })
  }
  renderTabellaContratti(data)
  updateSortIndicators()
}

function updateSortIndicators() {
  document.querySelectorAll('#contratti-thead th[data-sort-col]').forEach(th => {
    const icon = th.querySelector('.sort-icon')
    if (!icon) return
    if (th.dataset.sortCol === _sortCol) {
      icon.textContent = _sortDir === 'asc' ? ' ▲' : ' ▼'
      th.style.color = 'var(--teal)'
    } else {
      icon.textContent = ' ⇅'
      th.style.color = ''
    }
  })
}

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
    <td style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" data-action="edit-contratto" data-id="${c.id}">Modifica</button>
      <button class="btn btn-sm" style="background:#f0fdf4;color:#059669;border:1px solid #d1fae5;border-radius:6px;cursor:pointer;padding:4px 10px;font-size:12px;"
        data-action="economico-contratto" data-id="${c.id}" data-nome="${(c.clienti?.ragione_sociale || '').replace(/"/g, '&quot;')}">Economico</button>
    </td>
  `
  return tr
}

export function renderTabellaContratti(contratti) {
  try {
    const tbody = document.getElementById('contratti-table-body')
    if (!tbody) return
    tbody.innerHTML = ''
    if (!contratti.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun contratto trovato.</td></tr>'
      return
    }
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

export async function openModalContratto(id = null, prefilledClienteId = null) {
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
      if (prefilledClienteId && clienteSelect) clienteSelect.value = prefilledClienteId
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

async function reload() {
  _allContratti = await loadContratti(_statoFiltro ? { stato: _statoFiltro } : {})
  filterAndRender()
}

export function initContratti() {
  try {
    const addBtn = document.getElementById('add-contratto-button')
    const modal = document.getElementById('contratto-modal')
    const modalClose = modal?.querySelector('.btn-secondary')
    const form = modal?.querySelector('form')

    addBtn?.addEventListener('click', () => openModalContratto())
    modalClose?.addEventListener('click', () => modal?.classList.remove('active'))

    // Filtro stato
    document.querySelectorAll('.contratti-stato-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _statoFiltro = btn.dataset.stato
        document.querySelectorAll('.contratti-stato-btn').forEach(b => {
          const active = b.dataset.stato === _statoFiltro
          b.style.background = active ? '#0d9488' : '#fff'
          b.style.color = active ? '#fff' : '#6b7280'
        })
        reload()
      })
    })

    // Ricerca cliente
    document.getElementById('contratti-search')?.addEventListener('input', e => {
      _search = e.target.value
      filterAndRender()
    })

    // Ordinamento colonne
    document.getElementById('contratti-thead')?.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort-col]')
      if (!th) return
      const col = th.dataset.sortCol
      if (_sortCol === col) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        _sortCol = col
        _sortDir = 'asc'
      }
      filterAndRender()
    })

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
        window.dispatchEvent(new Event('anagrafica:reload'))
        reload()
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-contratto' && t.dataset.id) {
        await openModalContratto(t.dataset.id)
      }
    })

    reload()
  } catch (err) {
    showToast('Errore inizializzazione contratti', 'error')
    console.error(err)
  }
}
