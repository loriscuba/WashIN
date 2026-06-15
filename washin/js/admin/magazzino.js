import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const EUR = n => n != null
  ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
  : '-'

const CAT_LABEL = {
  detergenti: 'Detergenti', disinfettanti: 'Disinfettanti', sgrassatori: 'Sgrassatori',
  decalcificanti: 'Anticalcare', prodotti_wc: 'Prodotti WC', vetri: 'Vetri/superfici',
  pavimenti: 'Pavimenti', panni: 'Panni/microfibre', carta: 'Carta', sacchi: 'Sacchi',
  attrezzature: 'Attrezzature', dpi: 'Guanti/DPI', altro: 'Altro',
}

export async function loadMagazzino(filtri = {}) {
  try {
    let query = supabase.from('magazzino').select('*').order('nome', { ascending: true })
    if (filtri.attivo !== undefined) query = query.eq('attivo', filtri.attivo)
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento magazzino', 'error')
    console.error(err)
    return []
  }
}

function createMagazzinoRow(p) {
  const tr = document.createElement('tr')
  const qty = p.quantita_disponibile ?? 0
  const soglia = p.soglia_minima ?? null
  const lowStock = soglia != null && qty <= soglia
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  let scadenzaHtml = '-'
  if (p.scadenza) {
    const label = new Date(p.scadenza + 'T00:00:00').toLocaleDateString('it-IT')
    if (p.scadenza < today)
      scadenzaHtml = `<span style="color:#dc2626;font-weight:600;" title="Scaduto">${label} ⚠</span>`
    else if (p.scadenza <= in30)
      scadenzaHtml = `<span style="color:#d97706;font-weight:600;" title="In scadenza">${label} ⚠</span>`
    else
      scadenzaHtml = label
  }

  const catLabel = CAT_LABEL[p.categoria] || p.categoria || ''
  const qtyText = `${qty} ${p.unita_misura || ''}`
  const qtyHtml = lowStock
    ? `<span style="color:#dc2626;font-weight:600;" title="Sotto soglia minima">${qtyText} ⚠</span>` +
      `<br><span style="font-size:11px;color:var(--gray-400);">min. ${soglia} ${p.unita_misura || ''}</span>`
    : qtyText + (soglia != null ? `<br><span style="font-size:11px;color:var(--gray-400);">min. ${soglia}</span>` : '')

  tr.innerHTML = `
    <td>
      <strong>${p.nome}</strong>
      ${catLabel ? `<br><span style="font-size:11px;color:var(--gray-500);">${catLabel}</span>` : ''}
      ${p.codice_prodotto ? `<br><span style="font-size:10px;color:var(--gray-400);font-family:monospace;">${p.codice_prodotto}</span>` : ''}
    </td>
    <td style="font-size:13px;color:var(--gray-600);">${p.fornitore || '-'}</td>
    <td>${p.unita_misura || '-'}</td>
    <td>${EUR(p.costo_unitario)}</td>
    <td>${qtyHtml}</td>
    <td>${scadenzaHtml}</td>
    <td><span class="badge ${p.attivo ? 'badge-success' : 'badge-warning'}">${p.attivo ? 'Attivo' : 'Inattivo'}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="edit-magazzino" data-id="${p.id}">Modifica</button>
    </td>
  `
  return tr
}

export function renderTabellaMagazzino(prodotti) {
  const tbody = document.getElementById('magazzino-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!prodotti.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun prodotto in magazzino</td></tr>'
    return
  }
  prodotti.forEach(p => tbody.appendChild(createMagazzinoRow(p)))
}

export async function openModalMagazzino(id = null) {
  try {
    const modal = document.getElementById('magazzino-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    if (id) {
      const { data, error } = await supabase.from('magazzino').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (!el) return
        if (el.type === 'checkbox') el.checked = Boolean(v)
        else el.value = v ?? ''
      })
      form.dataset.magazzinoId = id
      modal.querySelector('h2').textContent = 'Modifica Prodotto'
    } else {
      form.reset()
      delete form.dataset.magazzinoId
      modal.querySelector('h2').textContent = 'Nuovo Prodotto'
      const attivoEl = form.querySelector('[name="attivo"]')
      if (attivoEl) attivoEl.checked = true
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal prodotto', 'error')
    console.error(err)
  }
}

export async function saveMagazzino(payload) {
  try {
    const fields = {
      nome: payload.nome || null,
      categoria: payload.categoria || null,
      codice_prodotto: payload.codice_prodotto || null,
      fornitore: payload.fornitore || null,
      unita_misura: payload.unita_misura || 'lt',
      costo_unitario: payload.costo_unitario !== '' && payload.costo_unitario != null
        ? parseFloat(payload.costo_unitario) : null,
      descrizione: payload.descrizione || null,
      quantita_disponibile: payload.quantita_disponibile !== '' ? parseFloat(payload.quantita_disponibile) : 0,
      soglia_minima: payload.soglia_minima !== '' && payload.soglia_minima != null
        ? parseFloat(payload.soglia_minima) : null,
      scadenza: payload.scadenza || null,
      attivo: Boolean(payload.attivo)
    }
    let error
    if (payload.id) {
      ;({ error } = await supabase.from('magazzino').update(fields).eq('id', payload.id))
    } else {
      ;({ error } = await supabase.from('magazzino').insert(fields))
    }
    if (error) throw error
    showToast('Prodotto salvato', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio prodotto', 'error')
    console.error(err)
    return null
  }
}

export function initMagazzino() {
  try {
    const addBtn = document.getElementById('add-magazzino-button')
    const modal = document.getElementById('magazzino-modal')
    const cancelBtn = document.getElementById('magazzino-cancel')
    const form = modal?.querySelector('form')

    addBtn?.addEventListener('click', () => openModalMagazzino())
    cancelBtn?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)
        const payload = {
          id: form.dataset.magazzinoId || undefined,
          nome: fd.get('nome'),
          categoria: fd.get('categoria'),
          codice_prodotto: fd.get('codice_prodotto'),
          fornitore: fd.get('fornitore'),
          unita_misura: fd.get('unita_misura'),
          costo_unitario: fd.get('costo_unitario'),
          descrizione: fd.get('descrizione'),
          quantita_disponibile: fd.get('quantita_disponibile'),
          soglia_minima: fd.get('soglia_minima'),
          scadenza: fd.get('scadenza'),
          attivo: form.querySelector('[name="attivo"]').checked
        }
        await saveMagazzino(payload)
        modal.classList.remove('active')
        loadMagazzino().then(renderTabellaMagazzino)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-magazzino' && t.dataset.id) {
        await openModalMagazzino(t.dataset.id)
      }
    })

    window.addEventListener('magazzino-updated', () => loadMagazzino().then(renderTabellaMagazzino))

    loadMagazzino().then(renderTabellaMagazzino)
  } catch (err) {
    showToast('Errore inizializzazione magazzino', 'error')
    console.error(err)
  }
}
