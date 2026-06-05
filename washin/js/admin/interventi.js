import supabase from '../supabase.js'
import { showToast } from './clienti.js'

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

export function renderListaInterventi(interventi){
  try{
    const tbody = document.getElementById('interventi-table-body')
    if (!tbody){ console.warn('interventi-table-body non trovato'); return }
    tbody.innerHTML = ''
    interventi.forEach(iv=>{
      const tr = document.createElement('tr')
      const operatorName = iv.profili ? `${iv.profili.nome || ''} ${iv.profili.cognome || ''}`.trim() : '-'
      const cliente = iv.sedi_cliente?.clienti?.ragione_sociale || '-'
      tr.innerHTML = `
        <td>${iv.data_pianificata}</td>
        <td>${operatorName}</td>
        <td>${cliente} / ${iv.sedi_cliente?.nome_sede || '-'}</td>
        <td>${iv.tipo_pulizia || '-'}</td>
        <td><span class="badge ${iv.stato === 'completato' ? 'badge-success' : iv.stato === 'annullato' ? 'badge-danger' : 'badge-warning'}">${iv.stato}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${iv.id}">Modifica</button>
          <button class="btn btn-sm btn-primary" data-action="start" data-id="${iv.id}">Avvia</button>
        </td>
      `
      tbody.appendChild(tr)
    })
  }catch(err){
    showToast('Errore render lista interventi','error')
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
      // ricarica sedi per il contratto salvato, poi seleziona la sede corretta
      if (data.contratto_id && contrattoSelect) contrattoSelect.value = data.contratto_id
      if (sedeSelect) await loadSediByContratto(data.contratto_id, sedeSelect, data.sede_id)
      form.dataset.interventoId = id
    } else {
      form.reset()
      delete form.dataset.interventoId
    }

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
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('interventi').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('interventi').insert(fields))
    }
    if (error) throw error
    showToast('Intervento salvato','success')
    return true
  }catch(err){
    showToast('Errore salvataggio intervento','error')
    console.error(err)
    return null
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
        await saveIntervento(payload)
        modal.classList.remove('active')
        refreshView()
      })
    }

    // delegate clicks for edit/start
    document.addEventListener('click', async (e)=>{
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const action = t.dataset.action
      const id = t.dataset.id
      if (!action || !id) return
      if (action === 'edit') await openModalIntervento(id)
      if (action === 'start') await cambiaStatoIntervento(id, 'in_corso')
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
