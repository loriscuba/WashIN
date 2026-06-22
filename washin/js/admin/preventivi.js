import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const EUR = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0)

const BADGE_STATO = {
  bozza: 'badge-warning', inviato: 'badge-info', accettato: 'badge-success',
  rifiutato: 'badge-danger', scaduto: 'badge-danger', convertito: 'badge-info'
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

let _aziendaGeo = undefined   // undefined = not loaded, false = not available, {lat,lng} = ready
const _geoCache = {}

async function geocodeAddress(address) {
  const cacheKey = (address || '').trim().toLowerCase()
  if (!cacheKey) return null
  if (_geoCache[cacheKey] !== undefined) return _geoCache[cacheKey]
  const apiKey = window.GOOGLE_MAPS_KEY
  if (!apiKey) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cacheKey + ', Italia')}&key=${apiKey}&language=it&region=it`
    const res = await fetch(url)
    const data = await res.json()
    const result = (data.status === 'OK' && data.results?.length)
      ? { lat: data.results[0].geometry.location.lat, lng: data.results[0].geometry.location.lng }
      : null
    _geoCache[cacheKey] = result
    return result
  } catch { return null }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toR = x => x * Math.PI / 180
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function loadAziendaGeo() {
  if (_aziendaGeo !== undefined) return _aziendaGeo
  const { data } = await supabase.from('azienda').select('indirizzo').limit(1).single()
  _aziendaGeo = data?.indirizzo ? await geocodeAddress(data.indirizzo) || false : false
  return _aziendaGeo
}

// ── Magazzino cache ───────────────────────────────────────────────────────────

let _magItems = null
let _operatoriList = []
let _coefficienti   = []

async function loadCoefficienti() {
  const { data } = await supabase.from('coefficienti_rischio').select('*').order('ordine')
  _coefficienti = data || []
  return _coefficienti
}

function populateTipoAppaltoSelect(form, savedTipo = null) {
  const sel = form.querySelector('[name="tipo_appalto"]')
  if (!sel) return
  const opts = _coefficienti.map(c =>
    `<option value="${c.codice}" data-coeff="${c.coefficiente}" ${savedTipo === c.codice ? 'selected' : ''}>${c.descrizione} (×${Number(c.coefficiente).toFixed(3)})</option>`
  ).join('')
  sel.innerHTML = '<option value="">— seleziona tipo appalto —</option>' + opts
}

function getCoeff(form) {
  const sel = form.querySelector('[name="tipo_appalto"]')
  return parseFloat(sel?.options[sel.selectedIndex]?.dataset?.coeff || '1') || 1
}

async function loadMagItems() {
  if (_magItems) return _magItems
  const { data } = await supabase
    .from('magazzino')
    .select('id,nome,costo_unitario,unita_misura')
    .eq('attivo', true)
    .order('nome')
  _magItems = data || []
  return _magItems
}

// ── CCNL cost calculation (calls Supabase RPC) ────────────────────────────────

const LIVELLI = [
  { v: '1^', t: '1°^ Ingresso' }, { v: '1', t: '1° Livello' },
  { v: '2',  t: '2° Livello' },   { v: '3', t: '3° Livello' },
  { v: '4',  t: '4° Livello' },   { v: '5', t: '5° Livello' },
  { v: '6',  t: '6° Livello' },   { v: '7', t: '7° Livello' },
  { v: '8',  t: '8° Livello' },
]

async function loadOperatoriList() {
  const { data } = await supabase.from('profili')
    .select('id,nome,cognome,livello_ccnl,voce_tariffa_inail,costo_mensile,ore_mensili_contratto')
    .neq('attivo', false)
    .order('cognome')
  _operatoriList = data || []
  return _operatoriList
}

function buildOperatoreRow(form, item = {}) {
  const row = document.createElement('div')
  row.className = 'prev-op-row'
  row.style.cssText = 'display:grid;grid-template-columns:1fr 95px 70px 82px 88px 28px;gap:6px;align-items:center;margin-bottom:6px;'

  const opOpts = _operatoriList.map(op => {
    const sel = item.operatore_id === op.id ? 'selected' : ''
    const n = `${op.cognome || ''} ${op.nome || ''}`.trim()
    return `<option value="${op.id}" data-livello="${op.livello_ccnl || ''}" data-voce="${op.voce_tariffa_inail || ''}" ${sel}>${n}</option>`
  }).join('')

  const livOpts = LIVELLI.map(l =>
    `<option value="${l.v}" ${item.livello_ccnl === l.v ? 'selected' : ''}>${l.t}</option>`
  ).join('')

  row.innerHTML = `
    <select class="prev-op-select" style="font-size:12px;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;width:100%;">
      <option value="">— manuale —</option>${opOpts}
    </select>
    <select class="prev-op-livello" style="font-size:12px;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;width:100%;">
      <option value="">— liv. —</option>${livOpts}
    </select>
    <input class="prev-op-ore" type="number" step="0.5" min="0" value="${item.ore_stimate || ''}" placeholder="ore"
      style="font-size:12px;padding:4px 6px;text-align:center;border:1px solid #d1d5db;border-radius:6px;width:100%;">
    <input class="prev-op-cu" type="number" step="0.0001" min="0" value="${item.costo_orario || ''}" placeholder="€/h"
      style="font-size:12px;padding:4px 6px;text-align:center;border:1px solid #d1d5db;border-radius:6px;width:100%;">
    <span class="prev-op-sub" style="font-size:12px;font-weight:600;text-align:right;color:#1e40af;padding-right:4px;">${EUR((item.ore_stimate || 0) * (item.costo_orario || 0))}</span>
    <button type="button" class="prev-rm-op" style="padding:2px 6px;font-size:13px;background:#fee2e2;border:none;border-radius:5px;color:#dc2626;cursor:pointer;line-height:1;">✕</button>
  `

  const opSel  = row.querySelector('.prev-op-select')
  const livSel = row.querySelector('.prev-op-livello')
  const oreEl  = row.querySelector('.prev-op-ore')
  const cuEl   = row.querySelector('.prev-op-cu')

  async function aggiornaCostoRiga() {
    const opId = opSel.value
    if (!opId) { showRischioHint(null, null); return }

    const op = _operatoriList.find(o => o.id === opId)
    if (!op) return

    if (!op.costo_mensile || op.costo_mensile <= 0) {
      showRischioHint(null, op)
      return
    }

    const coeff       = getCoeff(form)
    const tipoSel     = form.querySelector('[name="tipo_appalto"]')
    const tipoDesc    = tipoSel?.options[tipoSel.selectedIndex]?.textContent || ''
    const oreMensili  = op.ore_mensili_contratto || 173
    const costoMese   = op.costo_mensile * coeff
    const costoOra    = costoMese / oreMensili

    cuEl.value = costoOra.toFixed(4)
    showRischioHint({ nome: `${op.cognome || ''} ${op.nome || ''}`.trim(), costoBase: op.costo_mensile, coeff, tipoDesc, costoMese, costoOra })
    calcAll(form)
  }
  row._aggiornaCosto = aggiornaCostoRiga

  opSel.addEventListener('change', () => {
    const opt = opSel.options[opSel.selectedIndex]
    if (opt?.dataset?.livello) livSel.value = opt.dataset.livello
    aggiornaCostoRiga()
  })
  livSel.addEventListener('change', aggiornaCostoRiga)
  oreEl.addEventListener('input', () => calcAll(form))
  cuEl.addEventListener('input',  () => calcAll(form))
  row.querySelector('.prev-rm-op').addEventListener('click', () => { row.remove(); calcAll(form) })

  return row
}

async function calcolaCostoCcnl(livello, ore, voce_tariffa = null) {
  if (!livello) return null
  // Se ore non compilate usa 173 (mese contrattuale pieno) come riferimento
  const oreRif = ore > 0 ? ore : 173
  try {
    const params = { p_livello: livello, p_ore_ordinarie: oreRif, p_include_ratei: true }
    if (voce_tariffa) params.p_voce_tariffa = voce_tariffa
    const { data, error } = await supabase.rpc('calcola_costo_operatore', params)
    if (error) {
      console.error('[CCNL] RPC error (SQL migration eseguita?)', error.message)
      return null
    }
    return data ? { ...data, _oreRif: oreRif, _isMonthly: ore <= 0 } : null
  } catch (e) { console.error('[CCNL]', e); return null }
}

function showCcnlHint(result, nOp) {
  const hint = document.getElementById('prev-ccnl-hint')
  if (!hint) return
  if (!result) { hint.style.display = 'none'; return }
  const n = nOp || 1
  const fmt = v => v != null ? EUR(v) : '—'
  const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—'
  const label = result._isMonthly
    ? `Costo CCNL stimato / operatore — <em>mese pieno (${result._oreRif}h)</em>`
    : `Costo CCNL stimato / operatore — <em>${result._oreRif}h</em>`
  const ratei1314 = (result.ratei_13 || 0) + (result.ratei_14 || 0)
  const inailPct  = result.tasso_inail != null ? ` (${pct(result.tasso_inail)})` : ''
  hint.innerHTML = `
    <span style="font-weight:700;color:#0d9488;">${label}</span>
    <span style="display:inline-flex;flex-wrap:wrap;gap:10px;margin-left:8px;font-size:11px;">
      <span>Lordo <b>${fmt(result.lordo)}</b></span>
      <span>+INPS az. <b>${fmt(result.contributi_inps_datore)}</b> <span style="color:#6b7280;">(${pct(result.aliquota_inps_datore)})</span></span>
      <span>+INAIL <b>${fmt(result.inail)}</b><span style="color:#6b7280;">${inailPct}</span></span>
      <span>+Ratei 13ª/14ª <b>${fmt(ratei1314)}</b></span>
      <span>+Ferie/perm. <b>${fmt(result.ratei_ferie_permessi)}</b></span>
      <span>+INPS su ratei <b>${fmt(result.contributi_su_ratei)}</b></span>
      <span>+TFR <b>${fmt(result.tfr)}</b></span>
      <span style="border-left:1px solid #0d9488;padding-left:10px;">= <b style="font-size:13px;">${fmt(result.costo_totale)} × ${n} op.</b>
        = <b style="font-size:13px;color:#0d9488;">${fmt(result.costo_totale * n)}/mese</b>
      </span>
    </span>`
  hint.style.display = 'block'
}

function showRischioHint(data, missingOp) {
  const hint = document.getElementById('prev-ccnl-hint')
  if (!hint) return
  if (!data) {
    if (!missingOp) { hint.style.display = 'none'; return }
    const nome = `${missingOp.cognome || ''} ${missingOp.nome || ''}`.trim() || 'Operatore'
    hint.innerHTML = `<span style="color:#dc2626;font-weight:700;">⚠ ${nome} non ha il costo mensile impostato.</span>
      <span style="color:#dc2626;"> Vai in Anagrafica → carica una busta paga per calcolarlo automaticamente (oppure impostalo manualmente nel tab Retribuzione).</span>`
    hint.style.display = 'block'
    return
  }
  const tipoLabel = data.tipoDesc ? `<span style="color:#6b7280;">(${data.tipoDesc})</span>` : ''
  hint.innerHTML = `<span style="font-weight:700;color:#0d9488;">${data.nome}</span> —
    base: <b>${EUR(data.costoBase)}</b> × <b>${data.coeff.toFixed(3)}</b> ${tipoLabel}
    = <b>${EUR(data.costoMese)}</b>/mese → <b style="font-size:13px;">${EUR(data.costoOra)}</b>/h`
  hint.style.display = 'block'
}

// ── Live calculation ──────────────────────────────────────────────────────────

function calcAll(form) {
  const v = name => parseFloat(form.querySelector(`[name="${name}"]`)?.value) || 0

  let totOp = 0
  form.querySelectorAll('.prev-op-row').forEach(row => {
    const ore = parseFloat(row.querySelector('.prev-op-ore')?.value) || 0
    const cu  = parseFloat(row.querySelector('.prev-op-cu')?.value)  || 0
    const sub = ore * cu
    totOp += sub
    const subEl = row.querySelector('.prev-op-sub')
    if (subEl) subEl.textContent = EUR(sub)
  })

  let totProd = 0
  form.querySelectorAll('.prev-prod-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.prev-prod-qty')?.value) || 0
    const cu  = parseFloat(row.querySelector('.prev-prod-cu')?.value) || 0
    const sub = qty * cu
    totProd += sub
    const el = row.querySelector('.prev-prod-sub')
    if (el) el.textContent = EUR(sub)
  })

  const totKm    = v('km_per_intervento') * v('n_interventi_mese') * (v('costo_km_perkm') || 0.35)
  const totAltri = v('altri_costi')
  const totale   = totOp + totProd + totKm + totAltri

  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = EUR(n) }
  set('prev-tot-op', totOp); set('r-op', totOp)
  set('prev-tot-prod', totProd); set('r-prod', totProd)
  set('prev-tot-km', totKm); set('r-km', totKm)
  set('r-altri', totAltri)
  set('r-totale', totale)

  const margine = parseFloat(document.getElementById('prev-margine-num')?.value) || 0
  const prezzo  = margine < 100 ? totale / (1 - margine / 100) : totale
  set('r-prezzo', prezzo)

  const importoEl = document.getElementById('prev-importo-finale')
  if (importoEl) importoEl.value = prezzo ? prezzo.toFixed(2) : ''
  const savedEl = document.getElementById('prev-margine-saved')
  if (savedEl) savedEl.value = margine.toFixed(1)

  return { totale, margine, prezzo }
}

// ── Prodotto row ──────────────────────────────────────────────────────────────

function buildProdottoRow(form, magItems, item = {}) {
  const row = document.createElement('div')
  row.className = 'prev-prod-row'
  row.style.cssText = 'display:grid;grid-template-columns:1fr 70px 85px 80px 28px;gap:6px;align-items:center;margin-bottom:6px;'

  const opts = magItems.map(m =>
    `<option value="${m.id}" data-cu="${m.costo_unitario ?? ''}" ${item.prodotto_id === m.id ? 'selected' : ''}>${m.nome}</option>`
  ).join('')

  row.innerHTML = `
    <select class="prev-prod-select" style="font-size:12px;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;width:100%;">
      <option value="">-- Prodotto --</option>${opts}
    </select>
    <input class="prev-prod-qty" type="number" step="0.1" min="0" placeholder="Qtà" value="${item.qty || ''}"
      style="font-size:12px;padding:4px 6px;text-align:center;border:1px solid #d1d5db;border-radius:6px;width:100%;">
    <input class="prev-prod-cu" type="number" step="0.01" min="0" placeholder="€/u" value="${item.costo_unitario || ''}"
      style="font-size:12px;padding:4px 6px;text-align:center;border:1px solid #d1d5db;border-radius:6px;width:100%;">
    <span class="prev-prod-sub" style="font-size:12px;font-weight:600;text-align:right;color:#1e40af;padding-right:4px;">${EUR((item.qty || 0) * (item.costo_unitario || 0))}</span>
    <button type="button" class="prev-rm-prod" style="padding:2px 6px;font-size:13px;background:#fee2e2;border:none;border-radius:5px;color:#dc2626;cursor:pointer;line-height:1;">✕</button>
  `

  row.querySelector('.prev-prod-select')?.addEventListener('change', e => {
    const opt = e.target.options[e.target.selectedIndex]
    const cuEl = row.querySelector('.prev-prod-cu')
    if (cuEl && opt.dataset.cu) cuEl.value = opt.dataset.cu
    calcAll(form)
  })
  row.querySelector('.prev-prod-qty')?.addEventListener('input', () => calcAll(form))
  row.querySelector('.prev-prod-cu')?.addEventListener('input', () => calcAll(form))
  row.querySelector('.prev-rm-prod')?.addEventListener('click', () => { row.remove(); calcAll(form) })

  return row
}

// ── Km distance hint ──────────────────────────────────────────────────────────

async function updateKmHint(form, clienteId) {
  const hint = document.getElementById('prev-km-hint')
  if (!hint) return
  if (!clienteId) { hint.style.display = 'none'; return }

  const az = await loadAziendaGeo()
  if (!az) { hint.style.display = 'none'; return }

  const { data: c } = await supabase.from('clienti').select('indirizzo,citta,cap').eq('id', clienteId).single()
  const addr = [c?.indirizzo, c?.cap, c?.citta].filter(Boolean).join(', ')
  if (!addr) { hint.style.display = 'none'; return }

  const cGeo = await geocodeAddress(addr)
  if (!cGeo) { hint.style.display = 'none'; return }

  const kmOW = haversineKm(az.lat, az.lng, cGeo.lat, cGeo.lng)
  const kmAR = Math.round(kmOW * 2 * 10) / 10

  hint.innerHTML = `Distanza stimata dalla sede aziendale: <strong>${kmOW.toFixed(1)} km</strong> (one-way) → <strong>${kmAR} km A/R</strong> suggeriti`
  hint.style.display = 'block'

  const kmEl = form.querySelector('[name="km_per_intervento"]')
  if (kmEl && !kmEl.value) { kmEl.value = kmAR; calcAll(form) }
}

// ── Load / Render ─────────────────────────────────────────────────────────────

export async function loadPreventivi(filtri = {}) {
  try {
    let q = supabase.from('preventivi').select('*, clienti(id,ragione_sociale,indirizzo,citta,cap,email,telefono)')
    if (filtri.stato) q = q.eq('stato', filtri.stato)
    if (filtri.cliente_id) q = q.eq('cliente_id', filtri.cliente_id)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento preventivi', 'error')
    console.error(err)
    return []
  }
}

export function renderTabellaPreventivi(preventivi) {
  const tbody = document.getElementById('preventivi-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!preventivi.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun preventivo</td></tr>'
    return
  }
  preventivi.forEach(p => {
    const tr = document.createElement('tr')
    const badge = BADGE_STATO[p.stato] || 'badge-warning'
    const convertBtn = p.stato === 'accettato'
      ? `<button class="btn btn-sm btn-primary" data-action="converti-preventivo" data-id="${p.id}">→ Contratto</button>`
      : ''
    tr.innerHTML = `
      <td>${p.numero_preventivo || '-'}</td>
      <td>${p.clienti?.ragione_sociale || '-'}</td>
      <td>${p.data_emissione || '-'}</td>
      <td>${p.data_validita || '-'}</td>
      <td>${EUR(p.importo)}</td>
      <td><span class="badge ${badge}">${p.stato}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" data-action="edit-preventivo" data-id="${p.id}">Modifica</button>
        <button class="btn btn-sm btn-secondary" data-action="print-preventivo" data-id="${p.id}">🖨 Stampa</button>
        ${convertBtn}
      </td>
    `
    tbody.appendChild(tr)
  })
}

// ── Modal open ────────────────────────────────────────────────────────────────

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
    const form  = document.getElementById('preventivo-form')
    if (!modal || !form) return

    // Reset
    form.reset()
    form.querySelectorAll('.prev-prod-row').forEach(r => r.remove())
    form.querySelectorAll('.prev-op-row').forEach(r => r.remove())
    delete form.dataset.preventivoId
    const hint = document.getElementById('prev-km-hint')
    if (hint) hint.style.display = 'none'
    ;['prev-tot-op','prev-tot-prod','prev-tot-km','r-op','r-prod','r-km','r-altri','r-totale','r-prezzo'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.textContent = '€0,00'
    })
    const importoEl = document.getElementById('prev-importo-finale')
    if (importoEl) importoEl.value = ''
    const savedEl = document.getElementById('prev-margine-saved')
    if (savedEl) savedEl.value = '30'
    const slider = document.getElementById('prev-margine-slider')
    const numEl  = document.getElementById('prev-margine-num')
    if (slider) slider.value = 30
    if (numEl)  numEl.value  = 30

    const clienteSelect = form.querySelector('[name="cliente_id"]')
    await Promise.all([
      populateClientiSelect(clienteSelect),
      loadOperatoriList(),
      loadCoefficienti(),
    ])
    populateTipoAppaltoSelect(form)

    // Ricalcola tutti gli operatori quando cambia il tipo appalto
    form.querySelector('[name="tipo_appalto"]')?.addEventListener('change', () => {
      form.querySelectorAll('.prev-op-row').forEach(r => r._aggiornaCosto?.())
    })

    const [magItems] = await Promise.all([loadMagItems(), loadAziendaGeo()])

    if (id) {
      const { data, error } = await supabase.from('preventivi').select('*').eq('id', id).single()
      if (error) throw error
      populateTipoAppaltoSelect(form, data.tipo_appalto)
      Object.entries(data).forEach(([k, v]) => {
        if (k === 'tipo_appalto') return  // già gestito sopra
        const el = form.querySelector(`[name="${k}"]`)
        if (el && v != null) el.value = v
      })
      if (clienteSelect && data.cliente_id) clienteSelect.value = data.cliente_id
      form.dataset.preventivoId = id
      modal.querySelector('h2').textContent = 'Modifica Preventivo'

      // Restore slider/display for saved margine
      const m = parseFloat(data.margine_pct) || 30
      if (slider) slider.value = m
      if (numEl)  numEl.value  = m

      // Restore prodotti
      const list = document.getElementById('prev-prodotti-list')
      const saved = Array.isArray(data.prodotti_json) ? data.prodotti_json : []
      saved.forEach(item => list?.appendChild(buildProdottoRow(form, magItems, item)))

      // Restore operatori (da operatori_json, o da campi legacy)
      const opList = document.getElementById('prev-operatori-list')
      const savedOps = Array.isArray(data.operatori_json) && data.operatori_json.length
        ? data.operatori_json
        : data.livello_ccnl
          ? [{ livello_ccnl: data.livello_ccnl, ore_stimate: data.ore_stimate, costo_orario: data.costo_orario }]
          : []
      savedOps.forEach(op => opList?.appendChild(buildOperatoreRow(form, op)))

      await updateKmHint(form, data.cliente_id)
      calcAll(form)
    } else {
      modal.querySelector('h2').textContent = 'Nuovo Preventivo'
      const emissEl = form.querySelector('[name="data_emissione"]')
      if (emissEl) emissEl.value = new Date().toISOString().slice(0, 10)
      document.getElementById('prev-operatori-list')?.appendChild(buildOperatoreRow(form))

      // Auto-genera numero preventivo al cambio cliente
      const numEl2 = form.querySelector('[name="numero_preventivo"]')
      clienteSelect?.addEventListener('change', async () => {
        const opt = clienteSelect.options[clienteSelect.selectedIndex]
        if (!opt?.value || numEl2?.value) return
        numEl2.value = await generateNumeroPreventivo(opt.textContent.trim())
      })
    }

    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal preventivo', 'error')
    console.error(err)
  }
}

// ── Numero preventivo auto-generato ──────────────────────────────────────────

async function generateNumeroPreventivo(ragioneSociale) {
  const prefix3 = ragioneSociale.replace(/\s+/g, '').substring(0, 3).toUpperCase()
  const today   = new Date()
  const dd      = String(today.getDate()).padStart(2, '0')
  const mm      = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy    = today.getFullYear()
  const dateStr = `${dd}${mm}${yyyy}`
  const base    = `${prefix3}_${dateStr}_V`

  const { data } = await supabase
    .from('preventivi')
    .select('numero_preventivo')
    .like('numero_preventivo', `${base}%`)

  let maxV = 0
  ;(data || []).forEach(r => {
    const m = r.numero_preventivo?.match(/_V(\d+)$/)
    if (m) maxV = Math.max(maxV, parseInt(m[1]))
  })

  return `${base}${maxV + 1}`
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function savePreventivo(payload) {
  try {
    const fields = {
      cliente_id:        payload.cliente_id || null,
      numero_preventivo: payload.numero_preventivo || null,
      data_emissione:    payload.data_emissione || null,
      data_validita:     payload.data_validita || null,
      tipo_servizio:     payload.tipo_servizio || null,
      frequenza:         payload.frequenza || 'settimanale',
      importo:           parseFloat(payload.importo) || 0,
      ore_stimate:       parseFloat(payload.ore_stimate) || 0,
      n_operatori:       parseInt(payload.n_operatori) || 1,
      costo_orario:      parseFloat(payload.costo_orario) || null,
      livello_ccnl:      payload.livello_ccnl || null,
      n_interventi_mese: parseInt(payload.n_interventi_mese) || null,
      km_per_intervento: parseFloat(payload.km_per_intervento) || null,
      costo_km_perkm:    parseFloat(payload.costo_km_perkm) || 0.35,
      altri_costi:       parseFloat(payload.altri_costi) || 0,
      altri_costi_nota:  payload.altri_costi_nota || null,
      margine_pct:       parseFloat(payload.margine_pct) || null,
      prodotti_json:     payload.prodotti_json || [],
      operatori_json:    payload.operatori_json || [],
      stato:             payload.stato || 'bozza',
      note:              payload.note || null,
      tipo_appalto:      payload.tipo_appalto || null,
      coefficiente_rischio: payload.coefficiente_rischio || null,
    }
    let error
    if (payload.id) {
      ;({ error } = await supabase.from('preventivi').update(fields).eq('id', payload.id))
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

// ── Print ─────────────────────────────────────────────────────────────────────

export async function printPreventivo(id) {
  try {
    const { data: p, error } = await supabase
      .from('preventivi')
      .select('*, clienti(ragione_sociale,indirizzo,citta,cap,email,telefono)')
      .eq('id', id).single()
    if (error) throw error

    const fmt = v => EUR(v)
    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT') : '-'
    const c = p.clienti || {}
    const iva = (p.importo || 0) * 0.22
    const totale = (p.importo || 0) + iva

    const clienteLines = [c.ragione_sociale, c.indirizzo, [c.cap, c.citta].filter(Boolean).join(' '), c.email, c.telefono].filter(Boolean).join('<br>')

    // cost breakdown rows
    const costoOp = (p.n_operatori || 1) * (p.costo_orario || 0) * (p.ore_stimate || 0)
    const costoProd = (Array.isArray(p.prodotti_json) ? p.prodotti_json : []).reduce((s, i) => s + (i.qty || 0) * (i.costo_unitario || 0), 0)
    const costoKm = (p.km_per_intervento || 0) * (p.n_interventi_mese || 0) * (p.costo_km_perkm || 0.35)
    const costoAltri = p.altri_costi || 0
    const costoTot = costoOp + costoProd + costoKm + costoAltri
    const margine = costoTot > 0 ? ((p.importo - costoTot) / p.importo * 100).toFixed(1) : '-'

    const operatoriJson = Array.isArray(p.operatori_json) ? p.operatori_json : []
    const operatoriRows = operatoriJson.length
      ? operatoriJson.map(op => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f0fdf4;border-radius:6px;margin-bottom:6px;">
          <span style="color:#16a34a;font-weight:600;">${op.nome || '—'}</span>
          <span style="color:#374151;font-size:12px;">${op.ore_stimate || 0} h/mese &times; ${fmt(op.costo_orario || 0)}/h = <strong>${fmt(op.costo_totale || 0)}</strong></span>
        </div>`).join('')
      : '<div style="color:#6b7280;font-size:12px;">Nessun operatore registrato</div>'

    const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8">
<title>Preventivo ${p.numero_preventivo || ''} — WashIN</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;border-bottom:3px solid #0D9488;padding-bottom:20px}
  .logo{font-size:28px;font-weight:800;color:#0D9488}.logo span{color:#111}
  .doc-meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}
  .meta-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px}
  .meta-box h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;letter-spacing:.5px}
  .meta-box p{line-height:1.7;color:#374151}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  thead tr{background:#0D9488;color:#fff} th{padding:9px 14px;text-align:left;font-size:12px;font-weight:600}
  td{padding:9px 14px;border-bottom:1px solid #e2e8f0}
  .total-row td{font-weight:700;background:#f0fdf4;border-top:2px solid #0D9488;font-size:14px}
  .cost-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:12px}
  .cost-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e5e7eb}
  .cost-row:last-child{border:none;font-weight:700;font-size:14px;color:#0D9488;padding-top:8px}
  .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-end}
  .sign-line{width:180px;border-bottom:1px solid #111;margin:40px auto 6px}.sign-label{font-size:11px;color:#6b7280;text-align:center}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase}
  .badge-bozza{background:#fef3c7;color:#92400e}.badge-inviato{background:#dbeafe;color:#1e40af}.badge-accettato{background:#d1fae5;color:#065f46}
  @media print{body{padding:0}button{display:none}}
</style></head><body>
<div class="header">
  <div>
    <div class="logo">Wash<span>IN</span></div>
    <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6;">Servizi di pulizia professionale</div>
  </div>
  <div style="text-align:right;font-size:11px;color:#555;line-height:1.8;">
    <strong style="font-size:18px;color:#111;">${p.numero_preventivo || 'PREVENTIVO'}</strong><br>
    Data: ${fmtDate(p.data_emissione)}<br>
    Validità: ${fmtDate(p.data_validita)}<br>
    <span class="badge badge-${p.stato || 'bozza'}">${p.stato || 'bozza'}</span>
  </div>
</div>
<div style="font-size:20px;font-weight:700;color:#0D9488;margin-bottom:16px;">Preventivo</div>
<div class="doc-meta">
  <div class="meta-box"><h3>Destinatario</h3><p>${clienteLines || '-'}</p></div>
  <div class="meta-box"><h3>Offerta</h3><p>
    <strong>Tipo:</strong> ${p.tipo_servizio || '-'}<br>
    <strong>Frequenza:</strong> ${p.frequenza || '-'}<br>
    <strong>Operatori:</strong> ${p.n_operatori || 1}<br>
    <strong>Ore/mese:</strong> ${p.ore_stimate || '-'}
  </p></div>
</div>
<table>
  <thead><tr><th style="width:50%">Descrizione</th><th>Frequenza</th><th>Ore/mese</th><th style="text-align:right">Importo/mese</th></tr></thead>
  <tbody>
    <tr><td>${p.tipo_servizio || 'Servizio di pulizia professionale'}</td><td>${p.frequenza || '-'}</td><td>${p.ore_stimate ? p.ore_stimate + ' h' : '-'}</td><td style="text-align:right">${fmt(p.importo)}</td></tr>
    <tr><td colspan="3" style="text-align:right;color:#6b7280;">IVA 22%</td><td style="text-align:right;color:#6b7280;">${fmt(iva)}</td></tr>
    <tr class="total-row"><td colspan="3" style="text-align:right;">TOTALE</td><td style="text-align:right;color:#0D9488;">${fmt(totale)}</td></tr>
  </tbody>
</table>
${p.note ? `<div style="margin-top:16px;padding:14px 18px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;"><strong style="font-size:11px;text-transform:uppercase;color:#92400e;">Note</strong><p style="margin-top:6px;">${p.note.replace(/\n/g,'<br>')}</p></div>` : ''}

<div style="margin-top:32px;padding-top:24px;border-top:2px dashed #d1d5db;">
  <div style="font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">Composizione costi — uso interno</div>
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Operatori</div>
  ${operatoriRows}
  <div class="cost-box" style="margin-top:14px;">
    <div class="cost-row"><span>Costo operatori/mese</span><span>${fmt(costoOp)}</span></div>
    ${costoProd > 0 ? `<div class="cost-row"><span>Prodotti</span><span>${fmt(costoProd)}</span></div>` : ''}
    ${costoKm > 0 ? `<div class="cost-row"><span>Trasferte (${p.km_per_intervento} km × ${p.n_interventi_mese} interventi)</span><span>${fmt(costoKm)}</span></div>` : ''}
    ${costoAltri > 0 ? `<div class="cost-row"><span>Altri costi${p.altri_costi_nota ? ' — ' + p.altri_costi_nota : ''}</span><span>${fmt(costoAltri)}</span></div>` : ''}
    <div class="cost-row" style="border-top:1px solid #d1d5db;margin-top:4px;padding-top:8px;"><span>Totale costi</span><span>${fmt(costoTot)}</span></div>
    <div class="cost-row"><span>Margine applicato</span><span>${margine}%</span></div>
    <div class="cost-row"><span style="color:#0D9488;font-weight:700;">Prezzo offerto</span><span style="color:#0D9488;">${fmt(p.importo)}</span></div>
  </div>
</div>

<div class="footer">
  <div style="font-size:11px;color:#6b7280;">
    <p>Preventivo valido fino al <strong>${fmtDate(p.data_validita)}</strong>.</p>
    <p style="margin-top:4px;">Per accettazione rispondere via email o firmare e restituire.</p>
  </div>
  <div style="display:flex;gap:40px;">
    <div><div class="sign-line"></div><div class="sign-label">WashIN — Timbro e firma</div></div>
    <div><div class="sign-line"></div><div class="sign-label">Cliente — Per accettazione</div></div>
  </div>
</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { showToast('Popup bloccato — consenti popup per stampare', 'warning'); return }
    win.document.write(html)
    win.document.close()
  } catch (err) {
    showToast('Errore stampa preventivo', 'error')
    console.error(err)
  }
}

// ── Converti in contratto ─────────────────────────────────────────────────────

export async function convertiInContratto(preventivoId) {
  try {
    const { data: prev, error: e1 } = await supabase.from('preventivi').select('*').eq('id', preventivoId).single()
    if (e1) throw e1
    const num = `CNTR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error: e2 } = await supabase.from('contratti').insert({
      cliente_id: prev.cliente_id, numero_contratto: num, tipo: 'ricorrente',
      importo_mensile: prev.importo, ore_contratto_mensili: prev.ore_stimate,
      frequenza: prev.frequenza || 'settimanale', stato: 'attivo', data_inizio: prev.data_emissione,
      note: `Da preventivo ${prev.numero_preventivo || ''}${prev.note ? ': ' + prev.note : ''}`
    })
    if (e2) throw e2
    await supabase.from('preventivi').update({ stato: 'convertito' }).eq('id', preventivoId)
    showToast('Contratto creato dal preventivo!', 'success')
    return true
  } catch (err) {
    showToast('Errore conversione preventivo', 'error')
    console.error(err)
    return null
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initPreventivi() {
  try {
    const modal   = document.getElementById('preventivo-modal')
    const form    = document.getElementById('preventivo-form')
    const cancelBtn = document.getElementById('preventivo-cancel')

    document.getElementById('add-preventivo-button')?.addEventListener('click', () => openModalPreventivo())
    cancelBtn?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      // Margine slider ↔ number sync
      const slider = document.getElementById('prev-margine-slider')
      const numEl  = document.getElementById('prev-margine-num')
      slider?.addEventListener('input', () => { if (numEl) numEl.value = slider.value; calcAll(form) })
      numEl?.addEventListener('input', () => { if (slider) slider.value = numEl.value; calcAll(form) })

      // Importo manuale: aggiorna margine salvato
      document.getElementById('prev-importo-finale')?.addEventListener('input', e => {
        const importo = parseFloat(e.target.value) || 0
        const totale = parseFloat(document.getElementById('r-totale')?.textContent?.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0
        if (importo > 0 && totale > 0) {
          const m = ((importo - totale) / importo * 100)
          const savedEl = document.getElementById('prev-margine-saved')
          if (savedEl) savedEl.value = Math.max(0, m).toFixed(1)
        }
      })

      // Calc triggers (operator costs handled per-row in buildOperatoreRow)
      const calcInputs = ['km_per_intervento','n_interventi_mese','costo_km_perkm','altri_costi']
      calcInputs.forEach(name => form.querySelector(`[name="${name}"]`)?.addEventListener('input', () => calcAll(form)))

      // Add operator row
      document.getElementById('prev-add-operatore')?.addEventListener('click', () => {
        document.getElementById('prev-operatori-list')?.appendChild(buildOperatoreRow(form))
      })

      // Add prodotto
      document.getElementById('prev-add-prodotto')?.addEventListener('click', async () => {
        const items = await loadMagItems()
        document.getElementById('prev-prodotti-list')?.appendChild(buildProdottoRow(form, items))
      })

      // Cliente change → km hint
      form.querySelector('[name="cliente_id"]')?.addEventListener('change', e => {
        updateKmHint(form, e.target.value)
      })

      // Submit
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)

        // Collect operatori
        const operatori = []
        form.querySelectorAll('.prev-op-row').forEach(row => {
          const opSel  = row.querySelector('.prev-op-select')
          const livSel = row.querySelector('.prev-op-livello')
          const ore    = parseFloat(row.querySelector('.prev-op-ore')?.value) || 0
          const cu     = parseFloat(row.querySelector('.prev-op-cu')?.value)  || 0
          const opt    = opSel?.options[opSel.selectedIndex]
          if (ore > 0 || livSel?.value) {
            operatori.push({
              operatore_id:       opSel?.value || null,
              nome:               opSel?.value ? (opt?.textContent?.trim() || '') : '',
              livello_ccnl:       livSel?.value || null,
              voce_tariffa_inail: opt?.dataset?.voce || null,
              ore_stimate:        ore,
              costo_orario:       cu,
              costo_totale:       Math.round(ore * cu * 100) / 100,
            })
          }
        })
        const oreStimate = operatori.reduce((s, o) => s + (o.ore_stimate || 0), 0)
        const totOpCosto = operatori.reduce((s, o) => s + (o.costo_totale || 0), 0)
        const costoMedio = oreStimate > 0 ? totOpCosto / oreStimate : null

        // Collect prodotti
        const prodotti = []
        form.querySelectorAll('.prev-prod-row').forEach(row => {
          const sel = row.querySelector('.prev-prod-select')
          const qty = parseFloat(row.querySelector('.prev-prod-qty')?.value) || 0
          const cu  = parseFloat(row.querySelector('.prev-prod-cu')?.value) || 0
          if (sel?.value && qty > 0) {
            prodotti.push({
              prodotto_id: sel.value,
              nome: sel.options[sel.selectedIndex]?.text || '',
              qty, costo_unitario: cu
            })
          }
        })

        const payload = {
          id:                form.dataset.preventivoId || undefined,
          cliente_id:        fd.get('cliente_id'),
          numero_preventivo: fd.get('numero_preventivo'),
          data_emissione:    fd.get('data_emissione'),
          data_validita:     fd.get('data_validita'),
          tipo_servizio:     fd.get('tipo_servizio'),
          frequenza:         fd.get('frequenza'),
          importo:           document.getElementById('prev-importo-finale')?.value || fd.get('importo'),
          ore_stimate:       oreStimate,
          n_operatori:       operatori.length || 1,
          costo_orario:      costoMedio != null ? parseFloat(costoMedio.toFixed(4)) : null,
          livello_ccnl:      operatori[0]?.livello_ccnl || null,
          operatori_json:    operatori,
          n_interventi_mese: fd.get('n_interventi_mese'),
          km_per_intervento: fd.get('km_per_intervento'),
          costo_km_perkm:    fd.get('costo_km_perkm'),
          altri_costi:       fd.get('altri_costi'),
          altri_costi_nota:  fd.get('altri_costi_nota'),
          margine_pct:       document.getElementById('prev-margine-saved')?.value,
          prodotti_json:     prodotti,
          stato:             fd.get('stato'),
          note:              fd.get('note'),
          tipo_appalto:      fd.get('tipo_appalto') || null,
          coefficiente_rischio: getCoeff(form),
        }
        await savePreventivo(payload)
        modal.classList.remove('active')
        loadPreventivi().then(renderTabellaPreventivi)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-preventivo' && t.dataset.id) await openModalPreventivo(t.dataset.id)
      if (t.dataset.action === 'print-preventivo' && t.dataset.id) await printPreventivo(t.dataset.id)
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
