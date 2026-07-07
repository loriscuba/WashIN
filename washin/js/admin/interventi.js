import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { loadMagazzino } from './magazzino.js'

let _prodottiMagazzino = []

function formatDateISO(d){
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yyyy = d.getFullYear()
  return `${yyyy}-${mm}-${dd}`
}

function startOfMonth(date){
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
function endOfMonth(date){
  return new Date(date.getFullYear(), date.getMonth()+1, 0)
}

export async function loadInterventi(filtri = {}){
  try{
    let query = supabase.from('interventi').select("*, operatore:profili!operatore_id(nome,cognome), operatore2:profili!operatore2_id(nome,cognome), sedi_cliente(nome_sede,indirizzo), contratti!contratto_id(clienti(ragione_sociale))")

    if (filtri.date) {
      query = query.eq('data_pianificata', filtri.date)
    } else if (filtri.month){
      // filtri.month può essere string 'YYYY-MM' o Date
      let ref = (filtri.month instanceof Date) ? filtri.month : new Date(filtri.month + '-01')
      const start = formatDateISO(startOfMonth(ref))
      const end = formatDateISO(endOfMonth(ref))
      query = query.gte('data_pianificata', start).lte('data_pianificata', end)
    }

    if (filtri.operatore) query = query.eq('operatore_id', filtri.operatore)
    if (filtri.stato) query = query.eq('stato', filtri.stato)

    const { data, error } = await query.order('data_pianificata', { ascending: true }).order('ora_inizio_pianificata', { ascending: true })
    if (error) throw error
    return data || []
  }catch(err){
    showToast('Errore caricamento interventi','error')
    console.error(err)
    return []
  }
}

function createPill(intervento){
  const span = document.createElement('span')
  span.className = 'badge'
  span.style.display = 'inline-block'
  span.style.margin = '4px 0'
  span.style.cursor = 'pointer'
  span.dataset.id = intervento.id
  const op1 = intervento.operatore ? `${intervento.operatore.nome || ''} ${intervento.operatore.cognome || ''}`.trim() : ''
  const op2 = intervento.operatore2 ? `${intervento.operatore2.nome || ''} ${intervento.operatore2.cognome || ''}`.trim() : ''
  const operatorName = [op1, op2].filter(Boolean).join(' + ') || 'Operatore'
  const cliente = intervento.contratti?.clienti?.ragione_sociale || ''
  span.textContent = `${operatorName} — ${cliente}`
  // color by stato
  switch(intervento.stato){
    case 'in_corso': span.classList.add('badge-success'); break
    case 'completato': span.classList.add('badge-info'); break
    case 'approvato': span.classList.add('badge-success'); break
    case 'annullato': span.classList.add('badge-danger'); break
    default: span.classList.add('badge-warning');
  }
  span.addEventListener('click', ()=> openModalIntervento(intervento.id))
  return span
}

export function renderCalendarioSettimana(interventi, dataRiferimento = new Date()){
  try{
    const ref = new Date(dataRiferimento)
    const day = ref.getDay()
    // compute monday
    const monday = new Date(ref)
    const diff = (day + 6) % 7 // make monday=0
    monday.setDate(ref.getDate() - diff)

    const container = document.getElementById('calendar-week')
    if (!container){
      console.warn('calendar-week container non trovato')
      return
    }
    container.innerHTML = ''
    const table = document.createElement('table')
    table.className = 'washin-table'
    const thead = document.createElement('thead')
    const trh = document.createElement('tr')
    const days = []
    for(let i=0;i<7;i++){
      const d = new Date(monday)
      d.setDate(monday.getDate()+i)
      days.push(d)
      const th = document.createElement('th')
      th.textContent = d.toLocaleDateString('it-IT', {weekday:'short', day:'numeric'})
      trh.appendChild(th)
    }
    thead.appendChild(trh)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    const tr = document.createElement('tr')
    days.forEach(dayDate=>{
      const td = document.createElement('td')
      const iso = formatDateISO(dayDate)
      const items = interventi.filter(iv => iv.data_pianificata === iso)
      items.forEach(iv=> td.appendChild(createPill(iv)))
      tr.appendChild(td)
    })
    tbody.appendChild(tr)
    table.appendChild(tbody)
    container.appendChild(table)
  }catch(err){
    showToast('Errore render calendario','error')
    console.error(err)
  }
}

const STATO_BADGE = { pianificato:'badge-warning', in_corso:'badge-info', completato:'badge-success', approvato:'badge-success', annullato:'badge-danger' }

function fmtTime(ts){ return ts ? new Date(ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '' }
function geoTag(lat, lng, ts, emoji){
  if (!lat) return ''
  return `<span style="font-size:11px;color:var(--gray-500);display:block;" title="Lat ${Number(lat).toFixed(5)}, Lng ${Number(lng).toFixed(5)}">${emoji} ${fmtTime(ts)}</span>`
}

export function renderListaInterventi(interventi){
  try{
    const tbody = document.getElementById('interventi-table-body')
    if (!tbody){ console.warn('interventi-table-body non trovato'); return }
    tbody.innerHTML = ''
    interventi.forEach(iv=>{
      const tr = document.createElement('tr')
      const op1 = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : ''
      const op2 = iv.operatore2 ? `${iv.operatore2.nome || ''} ${iv.operatore2.cognome || ''}`.trim() : ''
      const operatorName = [op1, op2].filter(Boolean).join(' + ') || '-'
      const cliente = iv.contratti?.clienti?.ragione_sociale || '-'
      const badgeClass = STATO_BADGE[iv.stato] || 'badge-warning'
      const oreOk = iv.ore_ordinarie != null
      const avviaBtn = iv.stato === 'pianificato'
        ? `<button class="btn btn-sm btn-primary" data-action="avvia-intervento" data-id="${iv.id}">▶ Avvia</button>`
        : ''
      const stopBtn = iv.stato === 'in_corso'
        ? `<button class="btn btn-sm btn-danger" data-action="stop-intervento" data-id="${iv.id}">■ Stop</button>`
        : ''
      if (oreOk) tr.style.borderLeft = '3px solid #10b981'
      tr.innerHTML = `
        <td style="white-space:nowrap;">${iv.data_pianificata}${iv.ora_inizio_pianificata ? '<br><span style="font-size:11px;color:var(--gray-500);">P: ' + iv.ora_inizio_pianificata.slice(0,5) + (iv.ora_fine_pianificata ? '–' + iv.ora_fine_pianificata.slice(0,5) : '') + '</span>' : ''}</td>
        <td>${operatorName}</td>
        <td>
          <strong>${cliente}</strong><br>
          ${iv.sedi_cliente?.nome_sede || '-'}
          ${iv.sedi_cliente?.indirizzo ? `<br><span style="font-size:11px;color:var(--gray-500);">${iv.sedi_cliente.indirizzo}</span>` : ''}
        </td>
        <td>${iv.tipo_pulizia || '-'}</td>
        <td>
          <span class="badge ${badgeClass}">${iv.stato}</span>
          ${oreOk ? `<span style="display:block;font-size:11px;color:#059669;font-weight:600;margin-top:3px;">✅ ${iv.ore_ordinarie}h ord${iv.ore_straordinario ? ' +' + iv.ore_straordinario + 'h str' : ''}</span>` : ''}
        </td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" data-action="edit-intervento" data-id="${iv.id}">Modifica</button>
          <button class="btn btn-sm ${oreOk ? 'btn-secondary' : 'btn-primary'}" data-action="inserisci-ore-admin" data-id="${iv.id}" data-op1="${iv.operatore_id || ''}" data-op1name="${op1}" data-op2="${iv.operatore2_id || ''}" data-op2name="${op2}" data-data="${iv.data_pianificata}">⏱ ${oreOk ? 'Ore' : 'Inserisci ore'}</button>
          ${avviaBtn}${stopBtn}
        </td>
      `
      tbody.appendChild(tr)
    })
  }catch(err){
    showToast('Errore render lista interventi','error')
    console.error(err)
  }
}

function getGeolocation(){
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocalizzazione non supportata')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

export async function avviaIntervento(id){
  try{
    let geoData = {}
    try{
      const geo = await getGeolocation()
      geoData = { geo_inizio_lat: geo.lat, geo_inizio_lng: geo.lng }
    }catch{
      showToast('Geolocalizzazione non disponibile — avvio senza posizione', 'warning')
    }
    const { error } = await supabase.from('interventi').update({
      stato: 'in_corso',
      inizio_effettivo: new Date().toISOString(),
      ...geoData
    }).eq('id', id)
    if (error) throw error
    showToast('Intervento avviato', 'success')
  }catch(err){
    showToast('Errore avvio intervento', 'error')
    console.error(err)
  }
}

export async function stopIntervento(id){
  try{
    let geoData = {}
    try{
      const geo = await getGeolocation()
      geoData = { geo_fine_lat: geo.lat, geo_fine_lng: geo.lng }
    }catch{
      showToast('Geolocalizzazione non disponibile — stop senza posizione', 'warning')
    }
    const { error } = await supabase.from('interventi').update({
      stato: 'completato',
      fine_effettivo: new Date().toISOString(),
      ...geoData
    }).eq('id', id)
    if (error) throw error
    showToast('Intervento completato', 'success')
  }catch(err){
    showToast('Errore stop intervento', 'error')
    console.error(err)
  }
}

export async function cambiaStatoIntervento(id, nuovoStato, motivo = null){
  try{
    const payload = { stato: nuovoStato }
    if (nuovoStato === 'annullato' && motivo) payload.note_operatore = motivo
    const { error } = await supabase.from('interventi').update(payload).eq('id', id)
    if (error) throw error
    showToast('Stato intervento aggiornato','success')
  }catch(err){
    showToast('Errore aggiornamento stato intervento','error')
    console.error(err)
  }
}

async function loadSediByContratto(contrattoId, sedeSelect, currentSedeId = null){
  sedeSelect.innerHTML = '<option value="">-- Seleziona sede --</option>'
  if (!contrattoId) return
  const { data: sedi } = await supabase.from('sedi_cliente').select('id,nome_sede').eq('contratto_id', contrattoId)
  ;(sedi || []).forEach(s => {
    const o = document.createElement('option')
    o.value = s.id
    o.textContent = s.nome_sede
    if (currentSedeId && s.id === currentSedeId) o.selected = true
    sedeSelect.appendChild(o)
  })
}

export async function openModalIntervento(id = null){
  try{
    const modal = document.getElementById('intervento-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) { console.warn('intervento-modal non trovato'); return }

    // carica operatori
    const { data: ops, error: errOps } = await supabase.from('profili').select('id,nome,cognome').or('ruolo.eq.operatore,ruolo.is.null').eq('attivo', true)
    if (errOps) throw errOps
    const buildOpOptions = (select, selectedId = null) => {
      if (!select) return
      select.innerHTML = '<option value="">-- Nessuno --</option>'
      ops.forEach(o => {
        const opt = document.createElement('option')
        opt.value = o.id
        opt.textContent = `${o.nome || ''} ${o.cognome || ''}`.trim()
        if (selectedId && o.id === selectedId) opt.selected = true
        select.appendChild(opt)
      })
    }
    const sel1 = form.querySelector('[name="operatore_id"]')
    const sel2 = form.querySelector('[name="operatore2_id"]')
    buildOpOptions(sel1)
    buildOpOptions(sel2)

    // Impedisce selezione dello stesso operatore in entrambi i campi
    const syncDuplicates = () => {
      const v1 = sel1?.value, v2 = sel2?.value
      sel2?.querySelectorAll('option').forEach(o => { o.disabled = o.value && o.value === v1 })
      sel1?.querySelectorAll('option').forEach(o => { o.disabled = o.value && o.value === v2 })
    }
    sel1?.addEventListener('change', () => { if (sel2?.value === sel1.value) sel2.value = ''; syncDuplicates() })
    sel2?.addEventListener('change', () => { if (sel1?.value === sel2.value) sel2.value = ''; syncDuplicates() })

    // carica contratti attivi (con nome cliente)
    const { data: contratti, error: errContr } = await supabase
      .from('contratti')
      .select('id, numero_contratto, clienti(ragione_sociale)')
      .eq('stato', 'attivo')
      .order('numero_contratto')
    if (errContr) throw errContr
    const contrattoSelect = form.querySelector('[name="contratto_id"]')
    const sedeSelect = form.querySelector('[name="sede_id"]')
    if (contrattoSelect){
      contrattoSelect.innerHTML = '<option value="">-- Seleziona contratto --</option>'
      ;(contratti || []).forEach(c => {
        const opt = document.createElement('option')
        opt.value = c.id
        opt.textContent = `${c.numero_contratto || c.id.slice(0,8)} — ${c.clienti?.ragione_sociale || ''}`
        contrattoSelect.appendChild(opt)
      })
      // quando cambia contratto → ricarica sedi (onchange sovrascrive, evita accumulo listener)
      contrattoSelect.onchange = e => loadSediByContratto(e.target.value, sedeSelect)
    }

    // carica prodotti magazzino prima di tutto, così addMaterialeRow li trova già pronti
    _prodottiMagazzino = await loadMagazzino({ attivo: true })

    if (id){
      const { data, error } = await supabase.from('interventi').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k,v])=>{
        const el = form.querySelector(`[name="${k}"]`)
        if (el) el.value = v ?? ''
      })
      // mappa manuale campi con nome diverso tra DB e form
      const oraInEl = form.querySelector('[name="ora_inizio"]')
      const oraFinEl = form.querySelector('[name="ora_fine"]')
      if (oraInEl) oraInEl.value = data.ora_inizio_pianificata || ''
      if (oraFinEl) oraFinEl.value = data.ora_fine_pianificata || ''
      // seleziona operatore 2 se presente
      if (data.operatore2_id) {
        buildOpOptions(form.querySelector('[name="operatore2_id"]'), data.operatore2_id)
      }
      // ricarica sedi per il contratto salvato, poi seleziona la sede corretta
      if (data.contratto_id && contrattoSelect) contrattoSelect.value = data.contratto_id
      if (sedeSelect) await loadSediByContratto(data.contratto_id, sedeSelect, data.sede_id)
      form.dataset.interventoId = id
      // carica materiali (dopo _prodottiMagazzino, così i select sono già popolati)
      const mat = await loadMaterialiPerIntervento(id)
      const matList = document.getElementById('materiali-list')
      if (matList) { matList.innerHTML = ''; mat.forEach(m => addMaterialeRow(m)) }
      // mostra tempi effettivi se registrati
      const tempiDiv = document.getElementById('intervento-tempi-effettivi')
      const tempiText = document.getElementById('tempi-effettivi-text')
      if (tempiDiv && tempiText) {
        if (data.inizio_effettivo) {
          const fmtT = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
          const dateStr = new Date(data.inizio_effettivo).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
          let txt = `▶ ${fmtT(data.inizio_effettivo)}`
          if (data.fine_effettivo) txt += ` — ■ ${fmtT(data.fine_effettivo)}`
          txt += `  (${dateStr})`
          tempiText.textContent = txt
          tempiDiv.style.display = ''
        } else {
          tempiDiv.style.display = 'none'
        }
      }
      const ricSec = document.getElementById('ricorrenza-section')
      if (ricSec) ricSec.style.display = 'none'
    } else {
      form.reset()
      delete form.dataset.interventoId
      const matList = document.getElementById('materiali-list')
      if (matList) matList.innerHTML = ''
      const tempiDiv = document.getElementById('intervento-tempi-effettivo')
      if (tempiDiv) tempiDiv.style.display = 'none'
      const ricSec = document.getElementById('ricorrenza-section')
      if (ricSec) ricSec.style.display = ''
      const ricTog = document.getElementById('ricorrenza-toggle')
      if (ricTog) ricTog.checked = false
      const ricOpts = document.getElementById('ricorrenza-opts')
      if (ricOpts) ricOpts.style.display = 'none'
      const ricPrev = document.getElementById('ricorrenza-preview')
      if (ricPrev) ricPrev.textContent = ''
    }

    modal.classList.add('active')
  }catch(err){
    showToast('Errore apertura modal intervento','error')
    console.error(err)
  }
}

export async function saveIntervento(formData, { silent = false } = {}){
  try{
    const fields = {
      contratto_id: formData.contratto_id || null,
      sede_id: formData.sede_id || null,
      operatore_id: formData.operatore_id || null,
      operatore2_id: formData.operatore2_id || null,
      data_pianificata: formData.data_pianificata || null,
      ora_inizio_pianificata: formData.ora_inizio || null,
      ora_fine_pianificata: formData.ora_fine || null,
      tipo_pulizia: formData.tipo_pulizia || null,
      note_operatore: formData.note || null,
      stato: formData.stato || 'pianificato',
      km_percorsi: parseFloat(formData.km_percorsi) || 0,
    }
    let savedId = formData.id
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('interventi').update(fields).eq('id', formData.id))
    } else {
      const { data: ins, error: errIns } = await supabase.from('interventi').insert(fields).select('id').single()
      error = errIns
      if (!errIns) savedId = ins.id
    }
    if (error) throw error
    // fire-and-forget notifications to both operators
    const notifyOps = [fields.operatore_id, fields.operatore2_id].filter(Boolean)
    notifyOps.forEach(uid => {
      supabase.from('notifiche').insert({
        utente_id: uid,
        messaggio: `Intervento assegnato: ${fields.data_pianificata || ''} — ${fields.tipo_pulizia || 'pulizia'}`,
        tipo: 'info'
      }).then(({ error: ne }) => { if (ne) console.warn('Notifica:', ne.message) })
    })
    if (!silent) showToast('Intervento salvato','success')
    return savedId
  }catch(err){
    showToast('Errore salvataggio intervento','error')
    console.error(err)
    return null
  }
}

async function loadMaterialiPerIntervento(interventoId) {
  const { data } = await supabase.from('materiali_intervento')
    .select('*').eq('intervento_id', interventoId).order('created_at')
  return data || []
}

function addMaterialeRow(m = {}) {
  const container = document.getElementById('materiali-list')
  if (!container) return
  const row = document.createElement('div')
  row.className = 'materiale-row'
  row.style.cssText = 'display:grid;grid-template-columns:1fr 70px 70px 36px;gap:6px;align-items:center;margin-bottom:8px;'

  const isCustom = m.prodotto && !_prodottiMagazzino.find(p => p.nome === m.prodotto)
  const optsHtml = _prodottiMagazzino
    .map(p => `<option value="${p.nome}" data-id="${p.id}" data-costo="${p.costo_unitario || 0}" data-unita="${p.unita_misura || 'lt'}" ${(!isCustom && m.prodotto === p.nome) ? 'selected' : ''}>${p.nome}</option>`)
    .join('')
  const unitOptions = ['lt','kg','pz','m²'].map(u =>
    `<option value="${u}" ${(m.unita || 'lt') === u ? 'selected' : ''}>${u}</option>`
  ).join('')

  const inp = 'padding:8px;border:1px solid var(--gray-300);border-radius:8px;font-size:13px;'
  row.innerHTML = `
    <div>
      <select class="mat-prodotto" style="${inp}width:100%;display:${isCustom ? 'none' : 'block'};">
        <option value="">-- Seleziona prodotto --</option>
        ${optsHtml}
        <option value="__custom__">Altro (libero)...</option>
      </select>
      <input class="mat-custom-name" type="text" placeholder="Nome prodotto" value="${isCustom ? (m.prodotto || '') : ''}"
        style="${inp}width:100%;box-sizing:border-box;display:${isCustom ? 'block' : 'none'};" />
    </div>
    <input class="mat-quantita" type="number" placeholder="Qtà" value="${m.quantita ?? 1}" min="0" step="0.1" style="${inp}" />
    <select class="mat-unita" style="${inp}">${unitOptions}</select>
    <button type="button" data-action="remove-materiale"
      style="padding:0;width:32px;height:32px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;">✕</button>
  `

  const sel = row.querySelector('.mat-prodotto')
  const customInput = row.querySelector('.mat-custom-name')
  const unitSel = row.querySelector('.mat-unita')

  sel.addEventListener('change', () => {
    if (sel.value === '__custom__') {
      sel.style.display = 'none'
      customInput.style.display = 'block'
      customInput.focus()
    } else {
      const u = sel.options[sel.selectedIndex]?.dataset?.unita
      if (u) { const o = unitSel.querySelector(`option[value="${u}"]`); if (o) o.selected = true }
    }
  })

  if (m.id) row.dataset.materialeId = m.id
  container.appendChild(row)
}

async function adjustMagazzinoQty(prodottoNome, delta) {
  if (!prodottoNome?.trim()) return
  const { data, error: errSel } = await supabase.from('magazzino')
    .select('id, quantita_disponibile').eq('nome', prodottoNome.trim()).limit(1)
  if (errSel) { console.error('Magazzino lookup:', errSel); return }
  if (!data || !data.length) { console.warn(`Prodotto non trovato in magazzino: "${prodottoNome}"`); return }
  const p = data[0]
  const { error: errUpd } = await supabase.from('magazzino').update({
    quantita_disponibile: Math.max(0, (p.quantita_disponibile || 0) + delta)
  }).eq('id', p.id)
  if (errUpd) console.error('Magazzino update error:', errUpd)
}

async function saveMateriali(interventoId) {
  const container = document.getElementById('materiali-list')
  if (!container) return
  const rows = container.querySelectorAll('.materiale-row')

  // Restore old quantities before deleting
  const { data: oldMat } = await supabase.from('materiali_intervento')
    .select('prodotto, quantita').eq('intervento_id', interventoId)
  if (oldMat) {
    for (const m of oldMat) await adjustMagazzinoQty(m.prodotto, m.quantita || 0)
  }

  await supabase.from('materiali_intervento').delete().eq('intervento_id', interventoId)

  const toInsert = []
  rows.forEach(row => {
    const prodSel = row.querySelector('.mat-prodotto')
    const customInp = row.querySelector('.mat-custom-name')
    const prodotto = (customInp?.style.display !== 'none' ? customInp?.value : prodSel?.value)?.trim()
    if (!prodotto || prodotto === '__custom__') return
    toInsert.push({
      intervento_id: interventoId,
      prodotto,
      quantita: parseFloat(row.querySelector('.mat-quantita')?.value) || 1,
      unita: row.querySelector('.mat-unita')?.value || 'lt'
    })
  })
  if (toInsert.length) {
    const { error } = await supabase.from('materiali_intervento').insert(toInsert)
    if (error) { console.error('Errore salvataggio materiali:', error); return }
    // Subtract new quantities from magazzino
    for (const m of toInsert) await adjustMagazzinoQty(m.prodotto, -(m.quantita || 0))
    showToast('Scorte magazzino aggiornate', 'success')
    window.dispatchEvent(new CustomEvent('magazzino-updated'))
  }

  // Sync economic cost table (interventi_materiali) — uses prodotto_id + costo_unitario_snapshot
  await supabase.from('interventi_materiali').delete().eq('intervento_id', interventoId)
  const ecoInsert = []
  rows.forEach(row => {
    const prodSel = row.querySelector('.mat-prodotto')
    const customInp = row.querySelector('.mat-custom-name')
    if (customInp?.style.display !== 'none') return // prodotti liberi non hanno ID magazzino
    const opt = prodSel?.options[prodSel?.selectedIndex]
    const prodId = opt?.dataset?.id
    if (!prodId) return
    ecoInsert.push({
      intervento_id: interventoId,
      prodotto_id: prodId,
      quantita: parseFloat(row.querySelector('.mat-quantita')?.value) || 1,
      costo_unitario_snapshot: parseFloat(opt?.dataset?.costo) || 0,
    })
  })
  if (ecoInsert.length) {
    await supabase.from('interventi_materiali').insert(ecoInsert)
  }
}

export function renderCalendarioMese(interventi, mese) {
  try {
    const container = document.getElementById('calendar-month')
    if (!container) return
    container.innerHTML = ''
    const ref = typeof mese === 'string' ? new Date(mese + '-01') : new Date(mese)
    const year = ref.getFullYear()
    const month = ref.getMonth()
    const todayStr = new Date().toISOString().slice(0, 10)
    const table = document.createElement('table')
    table.style.cssText = 'width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px;'
    const thead = document.createElement('thead')
    const trh = document.createElement('tr')
    ;['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(d => {
      const th = document.createElement('th')
      th.textContent = d
      th.style.cssText = 'text-align:center;padding:6px 2px;font-size:11px;font-weight:600;border-bottom:2px solid var(--gray-200);'
      trh.appendChild(th)
    })
    thead.appendChild(trh)
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    const firstOfMonth = new Date(year, month, 1)
    const lastOfMonth = new Date(year, month + 1, 0)
    const startOffset = (firstOfMonth.getDay() + 6) % 7
    const cur = new Date(firstOfMonth)
    cur.setDate(cur.getDate() - startOffset)
    while (cur <= lastOfMonth) {
      const tr = document.createElement('tr')
      for (let i = 0; i < 7; i++) {
        const iso = formatDateISO(cur)
        const isThisMonth = cur.getMonth() === month
        const td = document.createElement('td')
        td.style.cssText = `vertical-align:top;min-height:64px;padding:3px;border:1px solid var(--gray-200);${!isThisMonth ? 'background:#f8fafc;' : ''}`
        const numEl = document.createElement('div')
        if (iso === todayStr) {
          numEl.innerHTML = `<span style="background:#0D9488;color:#fff;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${cur.getDate()}</span>`
        } else {
          numEl.textContent = cur.getDate()
          numEl.style.cssText = `font-size:11px;font-weight:600;color:${isThisMonth ? 'var(--gray-700)' : 'var(--gray-400)'};margin-bottom:2px;`
        }
        td.appendChild(numEl)
        const items = interventi.filter(iv => iv.data_pianificata === iso)
        items.slice(0, 2).forEach(iv => {
          const pill = createPill(iv)
          pill.style.cssText += ';font-size:10px;padding:1px 4px;margin:1px 0;display:block;'
          td.appendChild(pill)
        })
        if (items.length > 2) {
          const more = document.createElement('div')
          more.textContent = `+${items.length - 2}`
          more.style.cssText = 'font-size:9px;color:var(--gray-400);'
          td.appendChild(more)
        }
        tr.appendChild(td)
        cur.setDate(cur.getDate() + 1)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    container.appendChild(table)
  } catch(err) {
    console.error('Errore render calendario mese:', err)
  }
}

export function initInterventi(){
  try{
    const prevBtn = document.getElementById('prev-week')
    const nextBtn = document.getElementById('next-week')
    const monthInput = document.getElementById('interventi-month')
    const refresh = document.getElementById('refresh-interventi')
    const addBtn = document.getElementById('add-intervento-button')
    const modal = document.getElementById('intervento-modal')
    const form = modal?.querySelector('form')
    let refDate = new Date()
    let currentView = 'today'

    // auto-set current month
    if (monthInput) {
      monthInput.value = `${refDate.getFullYear()}-${String(refDate.getMonth()+1).padStart(2,'0')}`
    }

    function setView(v) {
      currentView = v
      const isToday = v === 'today'
      const wk = document.getElementById('calendar-week')
      const mo = document.getElementById('calendar-month')
      if (wk) wk.style.display = v === 'week' ? '' : 'none'
      if (mo) mo.style.display = v === 'month' ? '' : 'none'
      if (prevBtn) prevBtn.style.display = isToday ? 'none' : ''
      if (nextBtn) nextBtn.style.display = isToday ? 'none' : ''
      if (monthInput) monthInput.style.display = isToday ? 'none' : ''
      document.getElementById('view-today')?.classList.toggle('btn-primary', isToday)
      document.getElementById('view-today')?.classList.toggle('btn-secondary', !isToday)
      document.getElementById('view-week')?.classList.toggle('btn-primary', v === 'week')
      document.getElementById('view-week')?.classList.toggle('btn-secondary', v !== 'week')
      document.getElementById('view-month')?.classList.toggle('btn-primary', v === 'month')
      document.getElementById('view-month')?.classList.toggle('btn-secondary', v !== 'month')
    }

    async function refreshView(){
      if (currentView === 'today') {
        const todayStr = new Date().toISOString().slice(0, 10)
        const interventi = await loadInterventi({ date: todayStr })
        renderListaInterventi(interventi)
      } else {
        const month = monthInput?.value || `${refDate.getFullYear()}-${String(refDate.getMonth()+1).padStart(2,'0')}`
        const interventi = await loadInterventi({ month })
        if (currentView === 'week') renderCalendarioSettimana(interventi, refDate)
        else renderCalendarioMese(interventi, month)
        renderListaInterventi(interventi)
      }
    }

    prevBtn?.addEventListener('click', () => {
      if (currentView === 'month') {
        refDate.setMonth(refDate.getMonth() - 1)
        if (monthInput) monthInput.value = `${refDate.getFullYear()}-${String(refDate.getMonth()+1).padStart(2,'0')}`
      } else {
        refDate.setDate(refDate.getDate() - 7)
      }
      refreshView()
    })
    nextBtn?.addEventListener('click', () => {
      if (currentView === 'month') {
        refDate.setMonth(refDate.getMonth() + 1)
        if (monthInput) monthInput.value = `${refDate.getFullYear()}-${String(refDate.getMonth()+1).padStart(2,'0')}`
      } else {
        refDate.setDate(refDate.getDate() + 7)
      }
      refreshView()
    })

    document.getElementById('view-today')?.addEventListener('click', () => { setView('today'); refreshView() })
    document.getElementById('view-week')?.addEventListener('click', () => { setView('week'); refreshView() })
    document.getElementById('view-month')?.addEventListener('click', () => { setView('month'); refreshView() })
    monthInput?.addEventListener('change', refreshView)
    refresh?.addEventListener('click', refreshView)

    addBtn?.addEventListener('click', async ()=>{ await openModalIntervento(); if (modal && window.lucide) window.lucide.replace() })

    const cancelBtn = document.getElementById('intervento-cancel')
    cancelBtn?.addEventListener('click', ()=> modal?.classList.remove('active'))

    document.getElementById('add-materiale-btn')?.addEventListener('click', () => addMaterialeRow())

    // ── Ricorrenza ────────────────────────────────────
    function updateRicorrenzaPreview() {
      const preview = document.getElementById('ricorrenza-preview')
      if (!preview) return
      const datePart = form?.querySelector('[name="data_pianificata"]')?.value
      const tipo = form?.querySelector('[name="ricorrenza_tipo"]')?.value || 'settimanale'
      const count = parseInt(form?.querySelector('[name="ricorrenza_count"]')?.value || 2)
      if (!datePart || count < 2) { preview.textContent = ''; return }
      const dates = []
      const base = new Date(datePart + 'T12:00:00')
      for (let i = 0; i < Math.min(count, 6); i++) {
        const d = new Date(base)
        if (tipo === 'settimanale') d.setDate(d.getDate() + i * 7)
        else d.setMonth(d.getMonth() + i)
        dates.push(d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }))
      }
      const suffix = count > 6 ? ` … +${count - 6} altri` : ''
      preview.textContent = `${count} interventi: ${dates.join(' · ')}${suffix}`
    }

    document.getElementById('ricorrenza-toggle')?.addEventListener('change', e => {
      const opts = document.getElementById('ricorrenza-opts')
      if (opts) opts.style.display = e.target.checked ? 'block' : 'none'
      if (e.target.checked) updateRicorrenzaPreview()
    })
    form?.querySelector('[name="ricorrenza_tipo"]')?.addEventListener('change', updateRicorrenzaPreview)
    form?.querySelector('[name="ricorrenza_count"]')?.addEventListener('input', updateRicorrenzaPreview)
    form?.querySelector('[name="data_pianificata"]')?.addEventListener('change', updateRicorrenzaPreview)

    if (form){
      form.addEventListener('submit', async (e)=>{
        e.preventDefault()
        const fd = new FormData(form)
        const isNew = !form.dataset.interventoId

        // ── Validazione campi obbligatori ──────────────────────
        const required = [
          { name: 'operatore_id',    label: 'Operatore' },
          { name: 'contratto_id',    label: 'Contratto' },
          { name: 'sede_id',         label: 'Sede' },
          { name: 'data_pianificata',label: 'Data' },
        ]
        const missing = []
        required.forEach(({ name, label }) => {
          const el = form.querySelector(`[name="${name}"]`)
          const empty = !fd.get(name)
          if (el) el.style.borderColor = empty ? '#dc2626' : ''
          if (empty) missing.push(label)
        })
        if (missing.length) {
          showToast(`Campi obbligatori mancanti: ${missing.join(', ')}`, 'error')
          return
        }

        const payload = {
          id: form.dataset.interventoId || undefined,
          operatore_id: fd.get('operatore_id') || null,
          operatore2_id: fd.get('operatore2_id') || null,
          cliente_id: fd.get('cliente_id') || null,
          sede_id: fd.get('sede_id') || null,
          contratto_id: fd.get('contratto_id') || null,
          data_pianificata: fd.get('data_pianificata') || null,
          ora_inizio: fd.get('ora_inizio') || null,
          ora_fine: fd.get('ora_fine') || null,
          tipo_pulizia: fd.get('tipo_pulizia') || null,
          note: fd.get('note') || null,
          stato: fd.get('stato') || null,
          km_percorsi: fd.get('km_percorsi') || 0,
        }

        const ricEnabled = isNew && document.getElementById('ricorrenza-toggle')?.checked
        const ricTipo = fd.get('ricorrenza_tipo') || 'settimanale'
        const ricCount = Math.max(2, Math.min(52, parseInt(fd.get('ricorrenza_count') || 2)))
        const useRic = ricEnabled && ricCount >= 2

        const savedId = await saveIntervento(payload, { silent: useRic })
        if (savedId) {
          await saveMateriali(savedId)
          if (useRic) {
            const base = new Date(payload.data_pianificata + 'T12:00:00')
            for (let i = 1; i < ricCount; i++) {
              const d = new Date(base)
              if (ricTipo === 'settimanale') d.setDate(d.getDate() + i * 7)
              else d.setMonth(d.getMonth() + i)
              await saveIntervento(
                { ...payload, id: undefined, data_pianificata: d.toISOString().slice(0, 10) },
                { silent: true }
              )
            }
            showToast(`Creati ${ricCount} interventi ${ricTipo === 'settimanale' ? 'settimanali' : 'mensili'}`, 'success')
          }
        }
        modal.classList.remove('active')
        refreshView()
      })
    }

    // delegate clicks for edit/avvia/stop/remove-materiale
    document.addEventListener('click', async (e)=>{
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const action = t.dataset.action
      if (!action) return
      if (action === 'remove-materiale') { t.closest('.materiale-row')?.remove(); return }
      const id = t.dataset.id
      if (!id) return
      if (action === 'edit-intervento') await openModalIntervento(id)
      if (action === 'avvia-intervento'){ await avviaIntervento(id); refreshView() }
      if (action === 'stop-intervento'){ await stopIntervento(id); refreshView() }
      if (action === 'inserisci-ore-admin') {
        await apriModaleOreAdmin(id, t.dataset.data, t.dataset.op1, t.dataset.op1name, t.dataset.op2, t.dataset.op2name)
      }
    })

    window.addEventListener('interventi:refresh', refreshView)

    // initial load
    setView('today')
    refreshView()
  }catch(err){
    showToast('Errore inizializzazione interventi','error')
    console.error(err)
  }
}
// ── Modal ore admin ───────────────────────────────────────────────────────────

export async function apriModaleOreAdmin(interventoId, dataPianificata, op1Id, op1Name, op2Id, op2Name) {
  // Carica ore già salvate sull'intervento
  const { data: iv } = await supabase
    .from('interventi')
    .select('ore_ordinarie,ore_straordinario,note_ore,operatore_id')
    .eq('id', interventoId)
    .maybeSingle()

  function toHM(dec) { const h = Math.floor(dec||0), m = Math.round(((dec||0)-h)*60); return { h, m } }
  const { h: ohOrd, m: omOrd } = toHM(iv?.ore_ordinarie)
  const { h: ohStr, m: omStr } = toHM(iv?.ore_straordinario)
  const noteEx = iv?.note_ore || ''

  const dataFmt = new Date(dataPianificata + 'T00:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' })

  // Selettore operatore (solo se ci sono due operatori)
  const opSelectHtml = op2Id
    ? `<div style="margin-bottom:16px;">
        <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Operatore</label>
        <select id="ore-adm-op" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;">
          <option value="${op1Id}">${op1Name}</option>
          <option value="${op2Id}">${op2Name}</option>
          <option value="entrambi">Entrambi</option>
        </select>
      </div>`
    : `<input type="hidden" id="ore-adm-op" value="${op1Id}">`

  const overlay = document.createElement('div')
  overlay.id = 'ore-adm-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);'
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px 20px;width:100%;max-width:420px;box-shadow:0 8px 40px rgba(0,0,0,.18);">
      <h3 style="margin:0 0 4px;font-size:17px;font-weight:700;">Inserisci orario</h3>
      <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">${dataFmt}</p>
      ${opSelectHtml}
      <div style="margin-bottom:14px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Ore ordinarie</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Ore</label>
            <input id="ore-adm-ord-h" type="number" min="0" max="24" value="${ohOrd}" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Minuti</label>
            <input id="ore-adm-ord-m" type="number" min="0" max="59" value="${omOrd}" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f59e0b;">Ore straordinarie</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Ore</label>
            <input id="ore-adm-str-h" type="number" min="0" max="24" value="${ohStr}" style="width:100%;padding:10px;border:1.5px solid #fde68a;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Minuti</label>
            <input id="ore-adm-str-m" type="number" min="0" max="59" value="${omStr}" style="width:100%;padding:10px;border:1.5px solid #fde68a;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Note</label>
        <textarea id="ore-adm-note" rows="2" placeholder="Note cantiere…" style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;resize:none;">${noteEx}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button id="ore-adm-cancel" style="padding:12px;background:#f3f4f6;color:#374151;border:none;border-radius:12px;font-size:15px;cursor:pointer;">Annulla</button>
        <button id="ore-adm-save" style="padding:12px;background:#0d9488;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Salva</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const chiudi = () => overlay.remove()
  document.getElementById('ore-adm-cancel').addEventListener('click', chiudi)
  overlay.addEventListener('click', e => { if (e.target === overlay) chiudi() })

  document.getElementById('ore-adm-save').addEventListener('click', async () => {
    const ordH = parseInt(document.getElementById('ore-adm-ord-h').value) || 0
    const ordM = parseInt(document.getElementById('ore-adm-ord-m').value) || 0
    const strH = parseInt(document.getElementById('ore-adm-str-h').value) || 0
    const strM = parseInt(document.getElementById('ore-adm-str-m').value) || 0
    const note = document.getElementById('ore-adm-note').value.trim() || null
    const opSel = document.getElementById('ore-adm-op').value

    const ore_ordinarie    = Math.round((ordH + ordM / 60) * 100) / 100
    const ore_straordinario = Math.round((strH + strM / 60) * 100) / 100

    const { error } = await supabase.from('interventi').update({
      ore_ordinarie, ore_straordinario, note_ore: note, stato: 'concluso',
    }).eq('id', interventoId)

    if (error) { showToast('Errore salvataggio ore', 'error'); console.error(error); return }

    // Aggiorna presenze_giornaliere per gli operatori selezionati
    const opIds = opSel === 'entrambi'
      ? [op1Id, op2Id].filter(Boolean)
      : [opSel].filter(Boolean)

    for (const opId of opIds) {
      try {
        const { data: dayIv } = await supabase
          .from('interventi')
          .select('ore_ordinarie,ore_straordinario')
          .or(`operatore_id.eq.${opId},operatore2_id.eq.${opId}`)
          .eq('data_pianificata', dataPianificata)
          .not('ore_ordinarie', 'is', null)
        const totOrd = (dayIv||[]).reduce((s,i)=>s+(i.ore_ordinarie||0),0)
        const totStr = (dayIv||[]).reduce((s,i)=>s+(i.ore_straordinario||0),0)
        await supabase.from('presenze_giornaliere').upsert({
          profilo_id: opId, data: dataPianificata, tipo: 'lavoro',
          ore_ordinarie: Math.round(totOrd*100)/100,
          ore_straordinario: Math.round(totStr*100)/100,
        }, { onConflict: 'profilo_id,data' })
      } catch { /* non bloccante */ }
    }

    showToast('Orario salvato', 'success')
    chiudi()
    window.dispatchEvent(new CustomEvent('interventi:refresh'))
  })
}
