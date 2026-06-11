import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { openModalCliente } from './clienti.js'
import { openModalContratto } from './contratti.js'
import { openModalSede, openStoricSede } from './sedi.js'

let _tree = []
let _search = ''

const EUR = n => n != null
  ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
  : ''

export async function loadAnagrafica() {
  try {
    const { data, error } = await supabase
      .from('clienti')
      .select(`
        id, ragione_sociale, tipo, piva, citta, provincia, referente, telefono, attivo,
        contratti(
          id, numero_contratto, tipo, importo_mensile, stato,
          sedi_cliente(id, nome_sede, indirizzo, mq_totali)
        )
      `)
      .order('ragione_sociale', { ascending: true })
    if (error) throw error
    _tree = (data || []).map(c => ({
      ...c,
      contratti: (c.contratti || []).sort((a, b) =>
        (a.numero_contratto || '').localeCompare(b.numero_contratto || ''))
    }))
    return _tree
  } catch (err) {
    showToast('Errore caricamento anagrafica', 'error')
    console.error(err)
    return []
  }
}

function matches(cliente) {
  if (!_search) return true
  const q = _search.toLowerCase()
  if ((cliente.ragione_sociale || '').toLowerCase().includes(q)) return true
  if ((cliente.piva || '').toLowerCase().includes(q)) return true
  if ((cliente.citta || '').toLowerCase().includes(q)) return true
  if ((cliente.provincia || '').toLowerCase().includes(q)) return true
  for (const c of (cliente.contratti || [])) {
    if ((c.numero_contratto || '').toLowerCase().includes(q)) return true
    for (const s of (c.sedi_cliente || [])) {
      if ((s.nome_sede || '').toLowerCase().includes(q)) return true
      if ((s.indirizzo || '').toLowerCase().includes(q)) return true
    }
  }
  return false
}

export function renderAnagrafica() {
  const container = document.getElementById('anagrafica-list')
  if (!container) return
  const filtered = _tree.filter(matches)
  if (!filtered.length) {
    container.innerHTML = `<div class="ana-empty-state">
      <div style="font-size:40px;margin-bottom:12px;">🔍</div>
      <p>Nessun risultato${_search ? ` per "<strong>${_search}</strong>"` : ''}.</p>
    </div>`
    return
  }
  container.innerHTML = ''
  filtered.forEach(c => container.appendChild(buildClienteEl(c)))
}

function buildClienteEl(cliente) {
  const contratti = cliente.contratti || []
  const el = document.createElement('div')
  el.className = 'ana-cliente'
  el.dataset.id = cliente.id

  const badgeCls = cliente.attivo ? 'badge-success' : 'badge-danger'
  const meta = [
    cliente.citta,
    cliente.provincia ? `(${cliente.provincia})` : null
  ].filter(Boolean).join(' ')

  el.innerHTML = `
    <div class="ana-row ana-cliente-row" data-toggle-cli="${cliente.id}">
      <span class="ana-arrow">${contratti.length ? '▶' : '·'}</span>
      <div class="ana-main">
        <span class="ana-name">${cliente.ragione_sociale || '—'}</span>
        <span class="ana-submeta">
          ${cliente.tipo ? `<span class="ana-chip">${cliente.tipo}</span>` : ''}
          ${cliente.piva ? `<span class="ana-chip">P.IVA ${cliente.piva}</span>` : ''}
          ${meta ? `<span class="ana-chip">📍 ${meta}</span>` : ''}
          ${cliente.referente ? `<span class="ana-chip">👤 ${cliente.referente}</span>` : ''}
        </span>
      </div>
      <div class="ana-right">
        <span class="badge ${badgeCls}">${cliente.attivo ? 'Attivo' : 'Inattivo'}</span>
        <span class="ana-chip">${contratti.length} contr.</span>
      </div>
      <div class="ana-actions">
        <button class="btn btn-sm btn-secondary" data-action="edit-cliente" data-id="${cliente.id}">Modifica</button>
        <button class="btn btn-sm ana-btn-blue" data-action="new-contratto" data-cliente-id="${cliente.id}">+ Contratto</button>
      </div>
    </div>
    <div class="ana-children" id="ana-c-${cliente.id}" style="display:none">
      ${contratti.length
        ? contratti.map(c => buildContrattoHtml(c, cliente.ragione_sociale || '')).join('')
        : '<div class="ana-leaf-empty">Nessun contratto — usa "+ Contratto" per aggiungerne uno.</div>'
      }
    </div>
  `

  el.querySelector(`[data-toggle-cli="${cliente.id}"]`)?.addEventListener('click', ev => {
    if (ev.target.closest('[data-action]')) return
    if (!contratti.length) return
    toggleChildren(`ana-c-${cliente.id}`, el.querySelector('.ana-arrow'))
  })

  if (_search && contratti.length) {
    const sub = el.querySelector(`#ana-c-${cliente.id}`)
    const arrow = el.querySelector('.ana-arrow')
    if (sub) sub.style.display = 'block'
    if (arrow) arrow.textContent = '▼'
  }

  return el
}

function buildContrattoHtml(c, nomeCliente) {
  const sedi = (c.sedi_cliente || []).sort((a, b) => (a.nome_sede || '').localeCompare(b.nome_sede || ''))
  const badgeCls = c.stato === 'attivo' ? 'badge-success' : c.stato === 'scaduto' ? 'badge-danger' : 'badge-warning'

  return `
    <div class="ana-contratto" data-id="${c.id}">
      <div class="ana-row ana-contratto-row" data-toggle-ctr="${c.id}">
        <span class="ana-arrow">${sedi.length ? '▶' : '·'}</span>
        <div class="ana-main">
          <span class="ana-name" style="font-size:14px;">${c.numero_contratto || '—'}</span>
          <span class="ana-submeta">
            <span class="ana-chip">${c.tipo || '-'}</span>
            ${c.importo_mensile != null ? `<span class="ana-chip" style="color:#059669;font-weight:600;">${EUR(c.importo_mensile)}/mese</span>` : ''}
          </span>
        </div>
        <div class="ana-right">
          <span class="badge ${badgeCls}">${c.stato || '—'}</span>
          <span class="ana-chip">${sedi.length} sed${sedi.length === 1 ? 'e' : 'i'}</span>
        </div>
        <div class="ana-actions">
          <button class="btn btn-sm btn-secondary" data-action="edit-contratto" data-id="${c.id}">Modifica</button>
          <button class="btn btn-sm ana-btn-green" data-action="new-sede" data-contratto-id="${c.id}">+ Sede</button>
          <button class="btn btn-sm ana-btn-eco" data-action="economico-contratto" data-id="${c.id}" data-nome="${nomeCliente.replace(/"/g, '&quot;')}">Economico</button>
        </div>
      </div>
      <div class="ana-children" id="ana-s-${c.id}" style="display:none">
        ${sedi.length
          ? sedi.map(s => buildSedeHtml(s)).join('')
          : '<div class="ana-leaf-empty">Nessuna sede — usa "+ Sede" per aggiungerne una.</div>'
        }
      </div>
    </div>
  `
}

function buildSedeHtml(s) {
  return `
    <div class="ana-sede" data-id="${s.id}">
      <div class="ana-row ana-sede-row">
        <span style="font-size:14px;width:14px;flex-shrink:0;text-align:center;">📍</span>
        <div class="ana-main">
          <span class="ana-name" style="font-size:13px;">${s.nome_sede || '—'}</span>
          <span class="ana-submeta">
            ${s.indirizzo ? `<span class="ana-chip">${s.indirizzo}</span>` : ''}
            ${s.mq_totali != null ? `<span class="ana-chip">${s.mq_totali} mq</span>` : ''}
          </span>
        </div>
        <div class="ana-right"></div>
        <div class="ana-actions">
          <button class="btn btn-sm btn-secondary" data-action="edit-sede" data-id="${s.id}">Modifica</button>
          <button class="btn btn-sm btn-secondary" data-action="storico-sede" data-id="${s.id}" data-nome="${(s.nome_sede || '').replace(/"/g, '&quot;')}">Storico</button>
        </div>
      </div>
    </div>
  `
}

function toggleChildren(elId, arrowEl) {
  const sub = document.getElementById(elId)
  if (!sub) return
  const open = sub.style.display !== 'none'
  sub.style.display = open ? 'none' : 'block'
  if (arrowEl) arrowEl.textContent = open ? '▶' : '▼'
}

export async function reloadAnagrafica() {
  await loadAnagrafica()
  renderAnagrafica()
}

export function initAnagrafica() {
  document.getElementById('anagrafica-search')?.addEventListener('input', e => {
    _search = e.target.value.trim()
    renderAnagrafica()
  })

  document.getElementById('add-cliente-ana-button')?.addEventListener('click', () => openModalCliente())

  document.getElementById('anagrafica-list')?.addEventListener('click', async e => {
    // Toggle contratto children
    const toggleCtr = e.target.closest('[data-toggle-ctr]')
    if (toggleCtr && !e.target.closest('[data-action]')) {
      const cId = toggleCtr.dataset.toggleCtr
      toggleChildren(`ana-s-${cId}`, toggleCtr.querySelector('.ana-arrow'))
      return
    }

    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const { action } = btn.dataset

    if (action === 'new-contratto') await openModalContratto(null, btn.dataset.clienteId)
    if (action === 'new-sede') await openModalSede(null, btn.dataset.contrattoId)
    // edit-cliente, edit-contratto, edit-sede, storico-sede, economico-contratto
    // handled by their own init listeners via global document delegation
  })

  window.addEventListener('anagrafica:reload', reloadAnagrafica)

  reloadAnagrafica()
}
