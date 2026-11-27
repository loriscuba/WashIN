import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { squadreDelContratto, periodoLabel } from './squadre.js'

let _allContratti = []
let _search = ''
let _sortCol = ''
let _sortDir = 'asc'
let _statoFiltro = 'attivo'
let _amministratori = []

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const eur = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)

// Servizi che si possono spuntare sul contratto (contratti.servizi_inclusi)
const SERVIZI_INCLUSI = [
  ['scale', 'Scale'], ['androne', 'Androne'], ['vetri', 'Vetri'], ['ascensore', 'Ascensore'],
  ['bidoni', 'Bidoni'], ['cortile', 'Cortile'], ['aree_esterne', 'Aree esterne'],
  ['garage', 'Garage / box'], ['cantine', 'Cantine'],
]
const PERIODI = [['settimana', 'settimana'], ['mese', 'mese'], ['anno', 'anno'], ['giorno', 'giorno'], ['a_richiesta', 'a richiesta']]
const UNITA = [['mese', 'mese'], ['anno', 'anno'], ['intervento', 'intervento'], ['ora', 'ora']]
// Volte al mese per periodo (settimana = 52/12, giorno = giorni lavorativi medi)
const VOLTE_MESE = { settimana: 52 / 12, mese: 1, anno: 1 / 12, giorno: 21.7 }

// Campi chiave per capire se un contratto è da completare
function campiMancanti(c) {
  const cl = c.clienti || {}
  const mancanti = []
  if (!cl.indirizzo) mancanti.push('indirizzo')
  if (!cl.citta) mancanti.push('città')
  if (cl.tipo === 'condominio' && !cl.codice_fiscale) mancanti.push('codice fiscale')
  if (cl.tipo === 'condominio' && !cl.amministratore_id) mancanti.push('amministratore')
  if (!c.data_inizio) mancanti.push('data inizio')
  if (c.importo_mensile == null) mancanti.push('importo')
  if (c.ore_contratto_mensili == null) mancanti.push('ore/mese')
  if (!c.chiavi && !c.codice_portone) mancanti.push('accesso')
  return mancanti
}

function nomeCliente(c) {
  return c.clienti?.nome_breve || c.clienti?.ragione_sociale || ''
}

function sortValue(c, col) {
  switch (col) {
    case 'cliente':               return nomeCliente(c).toLowerCase()
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
      (c.clienti?.nome_breve || '').toLowerCase().includes(q) ||
      (c.clienti?.amministratori?.nome || '').toLowerCase().includes(q) ||
      (c.numero_contratto || '').toLowerCase().includes(q) ||
      (q === 'da completare' && campiMancanti(c).length > 0)
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
    let q = supabase.from('contratti').select(
      '*, clienti(ragione_sociale, nome_breve, tipo, indirizzo, citta, codice_fiscale, amministratore_id, amministratori(nome))')
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
  const mancanti = campiMancanti(c)
  const amm = c.clienti?.amministratori?.nome
  const nome = nomeCliente(c) || '-'
  tr.innerHTML = `
    <td>
      <div style="font-weight:600;">${esc(nome)}</div>
      ${amm ? `<div style="font-size:11px;color:var(--gray-500);">Amm. ${esc(amm)}</div>` : ''}
      ${mancanti.length ? `<span title="Mancano: ${esc(mancanti.join(', '))}" style="display:inline-block;margin-top:3px;font-size:10px;font-weight:600;background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 6px;">da completare (${mancanti.length})</span>` : ''}
    </td>
    <td>${esc(c.numero_contratto || '-')}</td>
    <td>${esc(c.tipo || '-')}</td>
    <td>${c.importo_mensile != null ? eur(c.importo_mensile) : '-'}</td>
    <td>${c.ore_contratto_mensili ?? '-'}</td>
    <td>${esc(c.data_inizio || '-')}</td>
    <td>${esc(c.data_fine || '-')}</td>
    <td><span class="badge ${badgeClass}">${esc(c.stato)}</span></td>
    <td style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" data-action="edit-contratto" data-id="${c.id}">Modifica</button>
      <button class="btn btn-sm" style="background:#f0fdf4;color:#059669;border:1px solid #d1fae5;border-radius:6px;cursor:pointer;padding:4px 10px;font-size:12px;"
        data-action="economico-contratto" data-id="${c.id}" data-nome="${esc(c.clienti?.ragione_sociale || '')}">Economico</button>
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

// ── Select ───────────────────────────────────────────────────────────────────

async function populateClientiSelect(selectEl, selectedId = null) {
  const { data, error } = await supabase.from('clienti').select('id, ragione_sociale, nome_breve').eq('attivo', true).order('ragione_sociale')
  if (error) return
  selectEl.innerHTML = '<option value="">-- Seleziona cliente --</option>'
  ;(data || []).forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = c.nome_breve && c.nome_breve !== c.ragione_sociale ? `${c.ragione_sociale} (${c.nome_breve})` : c.ragione_sociale
    if (selectedId && c.id === selectedId) opt.selected = true
    selectEl.appendChild(opt)
  })
}

// Operatori assegnati al contratto (tabella contratti_operatori, v46)
async function renderOperatori(contrattoId) {
  const box = document.getElementById('contratto-operatori')
  if (!box) return
  const [{ data: profili, error }, assegnati] = await Promise.all([
    supabase.from('profili').select('id, nome, cognome, attivo, ruolo').order('nome'),
    contrattoId
      ? supabase.from('contratti_operatori').select('operatore_id').eq('contratto_id', contrattoId)
      : Promise.resolve({ data: [] }),
  ])
  if (error) { box.innerHTML = '<span style="color:var(--gray-500);font-size:12px;">Errore caricamento operatori</span>'; return }
  if (assegnati.error) console.error(assegnati.error)
  const scelti = new Set((assegnati.data || []).map(r => r.operatore_id))
  const lista = (profili || []).filter(p => p.attivo !== false || scelti.has(p.id))
  box.innerHTML = lista.length
    ? lista.map(p => `
      <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;">
        <input type="checkbox" data-operatore="${p.id}" style="width:auto;"${scelti.has(p.id) ? ' checked' : ''}>
        ${esc(`${p.nome || ''} ${p.cognome || ''}`.trim())}
      </label>`).join('')
    : '<span style="color:var(--gray-500);font-size:12px;">Nessun operatore attivo</span>'
}

// Squadre assegnate al contratto (v48), sola lettura: si gestiscono dalla sezione Squadre
async function renderSquadre(contrattoId) {
  const box = document.getElementById('contratto-squadre')
  if (!box) return
  if (!contrattoId) { box.innerHTML = '<span style="color:var(--gray-500);font-size:12px;">Nessuna</span>'; return }
  const righe = await squadreDelContratto(contrattoId)
  if (righe === null) { box.innerHTML = '<span style="color:var(--gray-500);font-size:12px;">Squadre non disponibili (migrazione v48)</span>'; return }
  const vis = righe.filter(r => r.stato !== 'conclusa')
  box.innerHTML = vis.length
    ? vis.map(r => `<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(r.squadre?.colore || '#999')}"></span>
        <strong>${esc(r.squadre?.nome || '')}</strong>
        <span style="color:var(--gray-500);">${esc(periodoLabel(r))}${r.stato === 'futura' ? ' · futura' : ''}${r.note ? ' · ' + esc(r.note) : ''}</span>
      </div>`).join('')
    : '<span style="color:var(--gray-500);font-size:12px;">Nessuna</span>'
}

function readOperatori() {
  return [...document.querySelectorAll('#contratto-operatori [data-operatore]:checked')].map(el => el.dataset.operatore)
}

async function saveOperatori(contrattoId, operatori) {
  const { data: esistenti, error: e0 } = await supabase.from('contratti_operatori').select('operatore_id').eq('contratto_id', contrattoId)
  if (e0) throw e0
  const prima = new Set((esistenti || []).map(r => r.operatore_id))
  const dopo = new Set(operatori)
  const via = [...prima].filter(id => !dopo.has(id))
  const nuovi = [...dopo].filter(id => !prima.has(id))
  if (via.length) {
    const { error } = await supabase.from('contratti_operatori').delete().eq('contratto_id', contrattoId).in('operatore_id', via)
    if (error) throw error
  }
  if (nuovi.length) {
    const { error } = await supabase.from('contratti_operatori').insert(nuovi.map(operatore_id => ({ contratto_id: contrattoId, operatore_id })))
    if (error) throw error
  }
}

async function loadAmministratori() {
  const { data, error } = await supabase.from('amministratori').select('*').order('nome')
  if (error) { console.error(error); _amministratori = []; return }
  _amministratori = data || []
}

function populateAmmSelect(selectEl, selectedId = '') {
  selectEl.innerHTML = '<option value="">— nessuno —</option>'
  _amministratori.forEach(a => {
    const opt = document.createElement('option')
    opt.value = a.id
    opt.textContent = a.nome
    selectEl.appendChild(opt)
  })
  selectEl.value = selectedId || ''
}

function fillAmmFields(modal, ammId) {
  const a = _amministratori.find(x => x.id === ammId) || {}
  modal.querySelectorAll('[data-amm]').forEach(el => { el.value = a[el.dataset.amm] ?? '' })
  const box = modal.querySelector('#contratto-amm-dati')
  if (box) box.style.display = ammId || modal.dataset.ammNuovo ? '' : 'none'
}

// ── Campi del cliente (data-cli) ─────────────────────────────────────────────

function setCli(modal, cliente) {
  modal.querySelectorAll('[data-cli]').forEach(el => {
    const v = cliente?.[el.dataset.cli]
    if (el.type === 'checkbox') el.checked = !!v
    else el.value = v ?? ''
  })
}

function readCli(modal) {
  const out = {}
  modal.querySelectorAll('[data-cli]').forEach(el => {
    const k = el.dataset.cli
    if (el.type === 'checkbox') out[k] = el.checked
    else if (el.type === 'number') out[k] = el.value === '' ? null : parseInt(el.value, 10)
    else out[k] = el.value.trim() || null
  })
  if (out.provincia) out.provincia = out.provincia.toUpperCase()
  if (out.codice_fiscale) out.codice_fiscale = out.codice_fiscale.toUpperCase()
  if (out.codice_sdi) out.codice_sdi = out.codice_sdi.toUpperCase()
  return out
}

async function loadCliente(modal, clienteId) {
  if (!clienteId) { setCli(modal, {}); return null }
  const { data, error } = await supabase.from('clienti').select('*').eq('id', clienteId).single()
  if (error) { console.error(error); setCli(modal, {}); return null }
  setCli(modal, data)
  return data
}

// ── Righe servizio ───────────────────────────────────────────────────────────

function options(list, selected) {
  return '<option value="">—</option>' + list.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`).join('')
}

function addServizioRow(s = {}) {
  const tbody = document.getElementById('contratto-servizi-body')
  if (!tbody) return
  const tr = document.createElement('tr')
  if (s.id) tr.dataset.id = s.id
  tr.dataset.tempoTesto = s.tempo_testo || ''
  const inp = 'style="width:100%;padding:4px 6px;font-size:12px;"'
  tr.innerHTML = `
    <td><input data-f="descrizione" ${inp} value="${esc(s.descrizione || '')}" placeholder="${esc(s.tempo_testo || 'es. scale')}" title="${esc(s.tempo_testo ? 'Originale: ' + s.tempo_testo : '')}"></td>
    <td><input data-f="minuti_intervento" type="number" min="0" step="5" ${inp} value="${s.minuti_intervento ?? ''}"></td>
    <td><input data-f="interventi_numero" type="number" min="0" step="1" ${inp} value="${s.interventi_numero ?? ''}"></td>
    <td><select data-f="interventi_periodo" ${inp}>${options(PERIODI, s.interventi_periodo)}</select></td>
    <td><input data-f="prezzo" type="number" min="0" step="0.01" ${inp} value="${s.prezzo ?? ''}"></td>
    <td><select data-f="prezzo_unita" ${inp}>${options(UNITA, s.prezzo_unita)}</select></td>
    <td><input data-f="prezzo_ottimale" type="number" min="0" step="0.01" ${inp} value="${s.prezzo_ottimale ?? ''}"></td>
    <td><input data-f="note" ${inp} value="${esc(s.note || '')}"></td>
    <td><button type="button" data-action="del-servizio" class="btn btn-sm btn-secondary" title="Elimina riga">✕</button></td>
  `
  tbody.appendChild(tr)
}

function readServizi() {
  const rows = [...document.querySelectorAll('#contratto-servizi-body tr')]
  return rows.map((tr, i) => {
    const g = f => tr.querySelector(`[data-f="${f}"]`)?.value ?? ''
    const num = f => (g(f) === '' ? null : parseFloat(g(f)))
    return {
      id: tr.dataset.id || undefined,
      ordine: i + 1,
      descrizione: g('descrizione').trim() || null,
      tempo_testo: tr.dataset.tempoTesto || null,
      minuti_intervento: g('minuti_intervento') === '' ? null : parseInt(g('minuti_intervento'), 10),
      interventi_numero: num('interventi_numero'),
      interventi_periodo: g('interventi_periodo') || null,
      prezzo: num('prezzo'),
      prezzo_unita: g('prezzo_unita') || null,
      prezzo_ottimale: num('prezzo_ottimale'),
      note: g('note').trim() || null,
    }
  }).filter(s => s.id || s.descrizione || s.minuti_intervento != null || s.prezzo != null || s.prezzo_ottimale != null)
}

// Ore di lavoro al mese della riga: i minuti sono a testa, × operatrici stimate (v54)
function oreMese(s, operatrici = 1) {
  const f = VOLTE_MESE[s.interventi_periodo]
  if (!f || s.minuti_intervento == null || s.interventi_numero == null) return null
  return s.minuti_intervento / 60 * s.interventi_numero * f * operatrici
}

function prezzoMese(prezzo, unita, s) {
  if (prezzo == null) return null
  const f = VOLTE_MESE[s.interventi_periodo]
  switch (unita) {
    case 'mese': return prezzo
    case 'anno': return prezzo / 12
    case 'intervento': return f && s.interventi_numero != null ? prezzo * s.interventi_numero * f : null
    case 'ora': { const o = oreMese(s); return o != null ? prezzo * o : null }
    default: return null
  }
}

// Somma le righe; null se una riga con prezzo/ore non è calcolabile
function calcolaDaServizi(servizi, operatrici = 1) {
  const sum = (vals) => (vals.length && vals.every(v => v != null) ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null)
  return {
    importo: sum(servizi.filter(s => s.prezzo != null).map(s => prezzoMese(s.prezzo, s.prezzo_unita, s))),
    ottimale: sum(servizi.filter(s => s.prezzo_ottimale != null).map(s => prezzoMese(s.prezzo_ottimale, s.prezzo_unita || 'mese', s))),
    ore: sum(servizi.filter(s => s.minuti_intervento != null).map(s => oreMese(s, operatrici))),
  }
}

function renderServiziInclusi(selected = []) {
  const box = document.getElementById('contratto-servizi-incl')
  if (!box) return
  box.innerHTML = SERVIZI_INCLUSI.map(([v, l]) => `
    <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:13px;">
      <input type="checkbox" data-incl="${v}" style="width:auto;"${selected.includes(v) ? ' checked' : ''}> ${l}
    </label>`).join('')
}

function renderOriginale(c) {
  const box = document.getElementById('contratto-originale')
  if (!box) return
  if (!c?.tempo_originale && !c?.prezzo_originale && !c?.prezzo_ottimale_originale) { box.style.display = 'none'; return }
  box.style.display = ''
  box.innerHTML = `<strong>Dall'elenco originale</strong>\nTempo: ${esc(c.tempo_originale || '-')}\nPrezzo attuale: ${esc(c.prezzo_originale || '-')}\nPrezzo ottimale: ${esc(c.prezzo_ottimale_originale || '-')}`
}

function renderCompletezza(c) {
  const el = document.getElementById('contratto-completezza')
  if (!el) return
  if (!c) { el.textContent = ''; return }
  const m = campiMancanti(c)
  el.textContent = m.length ? `Da completare: ${m.join(', ')}` : 'Dati principali completi'
  el.style.color = m.length ? '#92400e' : '#059669'
}

// ── Modal ────────────────────────────────────────────────────────────────────

export async function openModalContratto(id = null, prefilledClienteId = null) {
  try {
    const modal = document.getElementById('contratto-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    form.reset()
    delete form.dataset.contrattoId
    delete form.dataset.haStimate
    delete modal.dataset.ammNuovo
    document.getElementById('contratto-servizi-body').innerHTML = ''

    const clienteSelect = form.querySelector('[name="cliente_id"]')
    await Promise.all([
      populateClientiSelect(clienteSelect),
      renderOperatori(id),
      renderSquadre(id),
      loadAmministratori(),
    ])

    let contratto = null
    if (id) {
      const { data, error } = await supabase.from('contratti')
        .select('*, contratti_servizi(*), clienti(ragione_sociale, nome_breve, tipo, indirizzo, citta, codice_fiscale, amministratore_id)')
        .eq('id', id).single()
      if (error) throw error
      contratto = data
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (!el) return
        el.value = v === null || v === undefined ? '' : String(v)
      })
      if (clienteSelect && data.cliente_id) clienteSelect.value = data.cliente_id
      form.dataset.contrattoId = id
      form.dataset.haStimate = 'operatrici_stimate' in data ? '1' : ''
      modal.querySelector('h2').textContent = 'Modifica Contratto'
      ;(data.contratti_servizi || []).sort((a, b) => a.ordine - b.ordine).forEach(addServizioRow)
    } else {
      modal.querySelector('h2').textContent = 'Nuovo Contratto'
      if (prefilledClienteId && clienteSelect) clienteSelect.value = prefilledClienteId
    }

    renderServiziInclusi(contratto?.servizi_inclusi || [])
    renderOriginale(contratto)
    renderCompletezza(contratto)

    const cliente = await loadCliente(modal, clienteSelect.value)
    const ammSelect = modal.querySelector('#contratto-amm-select')
    populateAmmSelect(ammSelect, cliente?.amministratore_id)
    fillAmmFields(modal, ammSelect.value)

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
    // Campi dell'anagrafica condomini (v43): presenti solo se arrivano dal form completo
    if (formData.estesi) Object.assign(fields, formData.estesi)

    let error, contrattoId = formData.id
    if (formData.id) {
      ;({ error } = await supabase.from('contratti').update(fields).eq('id', formData.id))
    } else {
      let data
      ;({ data, error } = await supabase.from('contratti').insert(fields).select('id').single())
      contrattoId = data?.id
    }
    if (error) throw error
    if (formData.servizi && contrattoId) await saveServizi(contrattoId, formData.servizi)
    if (formData.operatori && contrattoId) await saveOperatori(contrattoId, formData.operatori)
    showToast('Contratto salvato', 'success')
    return contrattoId || true
  } catch (err) {
    showToast('Errore salvataggio contratto', 'error')
    console.error(err)
    return null
  }
}

async function saveServizi(contrattoId, servizi) {
  const { data: esistenti, error: e0 } = await supabase.from('contratti_servizi').select('id').eq('contratto_id', contrattoId)
  if (e0) throw e0
  const tenuti = new Set(servizi.filter(s => s.id).map(s => s.id))
  const daEliminare = (esistenti || []).map(r => r.id).filter(i => !tenuti.has(i))
  if (daEliminare.length) {
    const { error } = await supabase.from('contratti_servizi').delete().in('id', daEliminare)
    if (error) throw error
  }
  for (const s of servizi) {
    const { id, ...row } = s
    row.contratto_id = contrattoId
    const { error } = id
      ? await supabase.from('contratti_servizi').update(row).eq('id', id)
      : await supabase.from('contratti_servizi').insert(row)
    if (error) throw error
  }
}

// Salva cliente e amministratore dal form del contratto
async function saveClienteEAmministratore(modal, clienteId) {
  const ammSelect = modal.querySelector('#contratto-amm-select')
  let ammId = ammSelect.value || null
  const amm = {}
  modal.querySelectorAll('[data-amm]').forEach(el => { amm[el.dataset.amm] = el.value.trim() || null })

  if (modal.dataset.ammNuovo && amm.nome) {
    const { data, error } = await supabase.from('amministratori').insert(amm).select('id').single()
    if (error) throw error
    ammId = data.id
  } else if (ammId) {
    const prima = _amministratori.find(a => a.id === ammId) || {}
    const cambiato = Object.keys(amm).some(k => (prima[k] ?? null) !== amm[k])
    if (cambiato && amm.nome) {
      const { error } = await supabase.from('amministratori').update(amm).eq('id', ammId)
      if (error) throw error
    }
  }

  if (!clienteId) return
  const cli = readCli(modal)
  cli.amministratore_id = ammId
  const { error } = await supabase.from('clienti').update(cli).eq('id', clienteId)
  if (error) throw error
}

async function reload() {
  _allContratti = await loadContratti(_statoFiltro ? { stato: _statoFiltro } : {})
  filterAndRender()
}

export function initContratti() {
  try {
    const addBtn = document.getElementById('add-contratto-button')
    const modal = document.getElementById('contratto-modal')
    const form = modal?.querySelector('form')
    const annulla = form?.querySelector('button[type="submit"]')?.previousElementSibling

    addBtn?.addEventListener('click', () => openModalContratto())
    annulla?.addEventListener('click', () => modal?.classList.remove('active'))

    // Cambio cliente: ricarica i suoi dati e l'amministratore
    form?.querySelector('[name="cliente_id"]')?.addEventListener('change', async e => {
      const cliente = await loadCliente(modal, e.target.value)
      delete modal.dataset.ammNuovo
      const ammSelect = modal.querySelector('#contratto-amm-select')
      populateAmmSelect(ammSelect, cliente?.amministratore_id)
      fillAmmFields(modal, ammSelect.value)
    })

    modal?.querySelector('#contratto-amm-select')?.addEventListener('change', e => {
      delete modal.dataset.ammNuovo
      fillAmmFields(modal, e.target.value)
    })
    modal?.querySelector('#contratto-amm-nuovo')?.addEventListener('click', () => {
      modal.dataset.ammNuovo = '1'
      modal.querySelector('#contratto-amm-select').value = ''
      fillAmmFields(modal, '')
      modal.querySelector('[data-amm="nome"]')?.focus()
    })

    modal?.querySelector('#contratto-servizio-add')?.addEventListener('click', () => addServizioRow())
    modal?.querySelector('#contratto-servizi-body')?.addEventListener('click', e => {
      const b = e.target.closest('[data-action="del-servizio"]')
      if (b) b.closest('tr')?.remove()
    })
    modal?.querySelector('#contratto-calcola')?.addEventListener('click', () => {
      const r = calcolaDaServizi(readServizi(), parseInt(form.querySelector('[name="operatrici_stimate"]')?.value, 10) || 1)
      const set = (n, v) => { if (v != null) form.querySelector(`[name="${n}"]`).value = v }
      set('importo_mensile', r.importo)
      set('prezzo_ottimale_mensile', r.ottimale)
      set('ore_contratto_mensili', r.ore)
      const mancano = [r.importo == null && 'importo', r.ore == null && 'ore'].filter(Boolean)
      showToast(mancano.length ? `Non calcolabile: ${mancano.join(', ')} (completa minuti, frequenza e unità di prezzo)` : 'Importo e ore calcolati: controlla se le righe vanno sommate', mancano.length ? 'error' : 'success')
    })

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
        const v = n => form.querySelector(`[name="${n}"]`)?.value ?? ''
        const txt = n => v(n).trim() || null
        const int = n => (v(n) === '' ? null : parseInt(v(n), 10))
        const bool = n => (v(n) === '' ? null : v(n) === 'true')
        const payload = {
          id: form.dataset.contrattoId || undefined,
          cliente_id: v('cliente_id'),
          numero_contratto: v('numero_contratto'),
          tipo: v('tipo'),
          data_inizio: v('data_inizio'),
          data_fine: v('data_fine'),
          importo_mensile: v('importo_mensile'),
          ore_contratto_mensili: v('ore_contratto_mensili'),
          frequenza: v('frequenza'),
          stato: v('stato'),
          note: v('note'),
          estesi: {
            rinnovo_tacito: bool('rinnovo_tacito'),
            preavviso_disdetta_giorni: int('preavviso_disdetta_giorni'),
            servizi_inclusi: [...form.querySelectorAll('[data-incl]:checked')].map(el => el.dataset.incl),
            giorni_preferiti: txt('giorni_preferiti'),
            extra_a_parte: txt('extra_a_parte'),
            prezzo_ottimale_mensile: v('prezzo_ottimale_mensile') === '' ? null : parseFloat(v('prezzo_ottimale_mensile')),
            iva_inclusa: v('iva_inclusa') === 'true',
            modalita_pagamento: txt('modalita_pagamento'),
            termini_pagamento_giorni: int('termini_pagamento_giorni'),
            adeguamento_istat: bool('adeguamento_istat'),
            note_economiche: txt('note_economiche'),
            materiali_a_carico: v('materiali_a_carico') || null,
            codice_portone: txt('codice_portone'),
            chiavi: txt('chiavi'),
            punto_acqua: txt('punto_acqua'),
            punto_luce: txt('punto_luce'),
            ripostiglio: txt('ripostiglio'),
            note_accesso: txt('note_accesso'),
            // v54: si invia solo se la colonna esiste (contratto letto con il campo) o se è compilato
            ...((form.dataset.haStimate === '1' || v('operatrici_stimate') !== '') && { operatrici_stimate: int('operatrici_stimate') }),
          },
          servizi: readServizi(),
          operatori: readOperatori(),
        }
        try {
          await saveClienteEAmministratore(modal, payload.cliente_id)
        } catch (err) {
          showToast('Errore salvataggio dati condominio/amministratore', 'error')
          console.error(err)
          return
        }
        const ok = await saveContratto(payload)
        if (!ok) return
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
