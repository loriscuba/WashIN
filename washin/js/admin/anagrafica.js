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

const _ico = (paths, size = 14) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;">${paths}</svg>`

const ICO = {
  chevronRight: _ico('<polyline points="9 18 15 12 9 6"></polyline>'),
  chevronDown:  _ico('<polyline points="6 9 12 15 18 9"></polyline>'),
  dot:          _ico('<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"></circle>', 8),
  mapPin:       _ico('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>', 13),
  user:         _ico('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>', 13),
  hash:         _ico('<line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line>', 12),
  fileText:     _ico('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>', 13),
  search:       _ico('<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>', 40),
}

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
      <div style="color:var(--gray-300);margin-bottom:12px;">${ICO.search}</div>
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

  const arrowHtml = contratti.length ? ICO.chevronRight : ICO.dot

  el.innerHTML = `
    <div class="ana-row ana-cliente-row" data-toggle-cli="${cliente.id}">
      <span class="ana-arrow">${arrowHtml}</span>
      <div class="ana-main">
        <span class="ana-name">${cliente.ragione_sociale || '—'}</span>
        <span class="ana-submeta">
          ${cliente.tipo ? `<span class="ana-chip">${cliente.tipo}</span>` : ''}
          ${cliente.piva ? `<span class="ana-chip">${ICO.hash} ${cliente.piva}</span>` : ''}
          ${meta ? `<span class="ana-chip">${ICO.mapPin} ${meta}</span>` : ''}
          ${cliente.referente ? `<span class="ana-chip">${ICO.user} ${cliente.referente}</span>` : ''}
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
    if (arrow) arrow.innerHTML = ICO.chevronDown
  }

  return el
}

function buildContrattoHtml(c, nomeCliente) {
  const sedi = (c.sedi_cliente || []).sort((a, b) => (a.nome_sede || '').localeCompare(b.nome_sede || ''))
  const badgeCls = c.stato === 'attivo' ? 'badge-success' : c.stato === 'scaduto' ? 'badge-danger' : 'badge-warning'
  const arrowHtml = sedi.length ? ICO.chevronRight : ICO.dot

  return `
    <div class="ana-contratto" data-id="${c.id}">
      <div class="ana-row ana-contratto-row" data-toggle-ctr="${c.id}">
        <span class="ana-arrow">${arrowHtml}</span>
        <div class="ana-main">
          <span class="ana-name" style="font-size:14px;">${c.numero_contratto || '—'}</span>
          <span class="ana-submeta">
            <span class="ana-chip">${ICO.fileText} ${c.tipo || '-'}</span>
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
        <span class="ana-arrow" style="color:var(--gray-400);">${ICO.mapPin}</span>
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
  if (arrowEl) arrowEl.innerHTML = open ? ICO.chevronRight : ICO.chevronDown
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
