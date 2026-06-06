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
    let query = supabase.from('interventi').select("*, profili(nome,cognome), sedi_cliente(nome_sede,indirizzo, clienti(ragione_sociale))")

    if (filtri.month){
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
  const operatorName = intervento.profili ? `${intervento.profili.nome || ''} ${intervento.profili.cognome || ''}`.trim() : 'Operatore'
  const cliente = intervento.sedi_cliente?.clienti?.ragione_sociale || ''
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
      const operatorName = iv.profili ? `${iv.profili.nome || ''} ${iv.profili.cognome || ''}`.trim() : '-'
      const cliente = iv.sedi_cliente?.clienti?.ragione_sociale || '-'
      const badgeClass = STATO_BADGE[iv.stato] || 'badge-warning'
      const avviaBtn = iv.stato === 'pianificato'
        ? `<button class="btn btn-sm btn-primary" data-action="avvia-intervento" data-id="${iv.id}">▶ Avvia</button>`
        : ''
      const stopBtn = iv.stato === 'in_corso'
        ? `<button class="btn btn-sm btn-danger" data-action="stop-intervento" data-id="${iv.id}">■ Stop</button>`
        : ''
      tr.innerHTML = `
        <td>${iv.data_pianificata}</td>
        <td>${operatorName}</td>
        <td>${cliente} / ${iv.sedi_cliente?.nome_sede || '-'}</td>
        <td>${iv.tipo_pulizia || '-'}</td>
        <td>
          <span class="badge ${badgeClass}">${iv.stato}</span>
          ${geoTag(iv.geo_inizio_lat, iv.geo_inizio_lng, iv.inizio_effettivo, '▶')}
          ${geoTag(iv.geo_fine_lat, iv.geo_fine_lng, iv.fine_effettivo, '■')}
        </td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" data-action="edit-intervento" data-id="${iv.id}">Modifica</button>
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
    const { data: ops, error: errOps } = await supabase.from('profili').select('id,nome,cognome').eq('ruolo','operatore').eq('attivo', true)
    if (errOps) throw errOps
    const opSelect = form.querySelector('[name="operatore_id"]')
    if (opSelect){
      opSelect.innerHTML = '<option value="">-- Seleziona operatore --</option>'
      ops.forEach(o=>{
        const opt = document.createElement('option')
        opt.value = o.id
        opt.textContent = `${o.nome || ''} ${o.cognome || ''}`.trim()
        opSelect.appendChild(opt)
      })
    }

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
      // quando cambia contratto → ricarica sedi
      contrattoSelect.addEventListener('change', e => {
        loadSediByContratto(e.target.value, sedeSelect)
      })
    }

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
      // ricarica sedi per il contratto salvato, poi seleziona la sede corretta
      if (data.contratto_id && contrattoSelect) contrattoSelect.value = data.contratto_id
      if (sedeSelect) await loadSediByContratto(data.contratto_id, sedeSelect, data.sede_id)
      form.dataset.interventoId = id
      // carica materiali
      const mat = await loadMaterialiPerIntervento(id)
      const matList = document.getElementById('materiali-list')
      if (matList) { matList.innerHTML = ''; mat.forEach(m => addMaterialeRow(m)) }
    } else {
      form.reset()
      delete form.dataset.interventoId
      const matList = document.getElementById('materiali-list')
      if (matList) matList.innerHTML = ''
    }

    // carica prodotti magazzino per il dropdown materiali
    _prodottiMagazzino = await loadMagazzino({ attivo: true })

    modal.classList.add('active')
  }catch(err){
    showToast('Errore apertura modal intervento','error')
    console.error(err)
  }
}

export async function saveIntervento(formData){
  try{
    const fields = {
      contratto_id: formData.contratto_id || null,
      sede_id: formData.sede_id || null,
      operatore_id: formData.operatore_id || null,
      data_pianificata: formData.data_pianificata || null,
      ora_inizio_pianificata: formData.ora_inizio || null,
      ora_fine_pianificata: formData.ora_fine || null,
      tipo_pulizia: formData.tipo_pulizia || null,
      note_operatore: formData.note || null,
      stato: formData.stato || 'pianificato'
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
    // fire-and-forget notification
    if (savedId && fields.operatore_id) {
      supabase.from('notifiche').insert({
        utente_id: fields.operatore_id,
        messaggio: `Intervento assegnato: ${fields.data_pianificata || ''} — ${fields.tipo_pulizia || 'pulizia'}`,
        tipo: 'info'
      }).then(({ error: ne }) => { if (ne) console.warn('Notifica:', ne.message) })
    }
    showToast('Intervento salvato','success')
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
    .map(p => `<option value="${p.nome}" data-unita="${p.unita_misura || 'lt'}" ${(!isCustom && m.prodotto === p.nome) ? 'selected' : ''}>${p.nome}</option>`)
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

async function saveMateriali(interventoId) {
  const container = document.getElementById('materiali-list')
  if (!container) return
  const rows = container.querySelectorAll('.materiale-row')

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
    if (error) console.error('Errore salvataggio materiali:', error)
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

    async function refreshView(){
      const month = monthInput?.value || `${refDate.getFullYear()}-${String(refDate.getMonth()+1).padStart(2,'0')}`
      const interventi = await loadInterventi({ month })
      renderCalendarioSettimana(interventi, refDate)
      renderListaInterventi(interventi)
    }

    prevBtn?.addEventListener('click', ()=>{ refDate.setDate(refDate.getDate()-7); refreshView() })
    nextBtn?.addEventListener('click', ()=>{ refDate.setDate(refDate.getDate()+7); refreshView() })
    monthInput?.addEventListener('change', refreshView)
    refresh?.addEventListener('click', refreshView)

    addBtn?.addEventListener('click', async ()=>{ await openModalIntervento(); if (modal && window.lucide) window.lucide.replace() })

    const cancelBtn = document.getElementById('intervento-cancel')
    cancelBtn?.addEventListener('click', ()=> modal?.classList.remove('active'))

    document.getElementById('add-materiale-btn')?.addEventListener('click', () => addMaterialeRow())

    if (form){
      form.addEventListener('submit', async (e)=>{
        e.preventDefault()
        const fd = new FormData(form)
        const payload = {
          id: form.dataset.interventoId || undefined,
          operatore_id: fd.get('operatore_id') || null,
          cliente_id: fd.get('cliente_id') || null,
          sede_id: fd.get('sede_id') || null,
          contratto_id: fd.get('contratto_id') || null,
          data_pianificata: fd.get('data_pianificata') || null,
          ora_inizio: fd.get('ora_inizio') || null,
          ora_fine: fd.get('ora_fine') || null,
          tipo_pulizia: fd.get('tipo_pulizia') || null,
          note: fd.get('note') || null,
        }
        const savedId = await saveIntervento(payload)
        if (savedId) await saveMateriali(savedId)
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
    })

    // initial load
    refreshView()
  }catch(err){
    showToast('Errore inizializzazione interventi','error')
    console.error(err)
  }
}
// admin/interventi.js - placeholder
// Funzioni per gestione interventi
