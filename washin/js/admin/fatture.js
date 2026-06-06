import supabase from '../supabase.js'
import { showToast } from './clienti.js'

function formatCurrencyEUR(v){
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0)
}

function monthBounds(month){
  // month: 'YYYY-MM' or Date
  const ref = (month instanceof Date) ? month : new Date((month || (new Date()).toISOString().slice(0,7)) + '-01')
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth()+1, 0)
  const isoStart = start.toISOString().slice(0,10)
  const isoEnd = end.toISOString().slice(0,10)
  return { start: isoStart, end: isoEnd }
}

export async function loadFatture(filtri = {}){
  try{
    let q = supabase.from('fatture').select('*, clienti(ragione_sociale)')
    if (filtri.cliente_id) q = q.eq('cliente_id', filtri.cliente_id)
    if (filtri.stato) q = q.eq('stato', filtri.stato)
    if (filtri.mese){
      const { start, end } = monthBounds(filtri.mese)
      q = q.gte('mese', start).lte('mese', end)
    }
    const { data, error } = await q.order('data_emissione', { ascending: false })
    if (error) throw error
    return data || []
  }catch(err){
    showToast('Errore caricamento fatture','error')
    console.error(err)
    return []
  }
}

export function calcolaTotale(imponibile = 0, ivaPct = 22){
  const imponibileNum = Number(imponibile) || 0
  const iva = +(imponibileNum * (Number(ivaPct) || 0) / 100)
  const totale = +(imponibileNum + iva)
  return { imponibile: imponibileNum, iva, totale, imponibileFmt: formatCurrencyEUR(imponibileNum), ivaFmt: formatCurrencyEUR(iva), totaleFmt: formatCurrencyEUR(totale) }
}

function createFatturaRow(f){
  const tr = document.createElement('tr')
  const calc = calcolaTotale(f.imponibile || 0, f.iva_pct || 22)
  tr.innerHTML = `
    <td>${f.numero_fattura || '-'}</td>
    <td>${f.cliente?.ragione_sociale || '-'}</td>
    <td>${f.mese ? (new Date(f.mese)).toLocaleDateString('it-IT', {year:'numeric', month:'2-digit'}) : '-'}</td>
    <td>${calc.imponibileFmt}</td>
    <td>${calc.ivaFmt}</td>
    <td>${calc.totaleFmt}</td>
    <td><span class="badge ${f.stato === 'pagata' ? 'badge-success' : f.stato === 'bozza' ? 'badge-warning' : 'badge-info'}">${f.stato}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="edit-fattura" data-id="${f.id}">Modifica</button>
      <button class="btn btn-sm btn-primary" data-action="change-state" data-id="${f.id}">Cambia stato</button>
    </td>
  `
  return tr
}

export function renderTabella(fatture){
  try{
    const container = document.querySelector('#fatture-table-body')
    if (!container) return
    container.innerHTML = ''
    fatture.forEach(f => container.appendChild(createFatturaRow(f)))
  }catch(err){
    showToast('Errore render fatture','error')
    console.error(err)
  }
}

export async function generaFatturaDaContratto(clienteId, meseDate){
  try{
    // leggi contratto attivo
    const { data: contratti, error: eContr } = await supabase.from('contratti').select('*').eq('cliente_id', clienteId).eq('stato','attivo').order('created_at',{ascending:false}).limit(1)
    if (eContr) throw eContr
    const contratto = (contratti && contratti[0]) || null

    const { start, end } = monthBounds(meseDate)
    const { data: interventi, error: eInt } = await supabase.from('interventi').select('*').in('stato', ['completato','approvato']).gte('data_pianificata', start).lte('data_pianificata', end).eq('contratto_id', contratto ? contratto.id : null)
    if (eInt) throw eInt

    // determina imponibile: usa importo_mensile se presente, altrimenti conta interventi * 0 (default 0)
    const imponibile = contratto?.importo_mensile ? Number(contratto.importo_mensile) : ((interventi?.length || 0) * 0)

    // prefill form
    const modal = document.getElementById('fattura-modal')
    const form = modal?.querySelector('form')
    if (!form) return null
    form.querySelector('[name="cliente_id"]').value = clienteId
    if (contratto) form.querySelector('[name="contratto_id"]').value = contratto.id
    form.querySelector('[name="mese"]').value = (new Date(meseDate)).toISOString().slice(0,7)
    form.querySelector('[name="imponibile"]').value = imponibile
    form.querySelector('[name="iva_pct"]').value = contratto?.iva_pct ?? 22
    const calc = calcolaTotale(imponibile, form.querySelector('[name="iva_pct"]').value)
    form.querySelector('[name="totale"]').value = calc.totale
    // apri modal
    modal.classList.add('active')
    return { contratto, interventi, imponibile, calc }
  }catch(err){
    showToast('Errore generazione fattura da contratto','error')
    console.error(err)
    return null
  }
}

export async function saveFattura(formData){
  try{
    const imponibile = Number(formData.imponibile) || 0
    const iva_pct = Number(formData.iva_pct) || 22
    const { iva, totale } = calcolaTotale(imponibile, iva_pct)
    const fields = {
      cliente_id: formData.cliente_id || null,
      contratto_id: formData.contratto_id || null,
      numero_fattura: formData.numero_fattura || null,
      mese: formData.mese || null,
      imponibile: imponibile,
      iva_pct: iva_pct,
      totale: totale,
      stato: formData.stato || 'bozza',
      data_scadenza: formData.data_scadenza || null,
      data_pagamento: formData.data_pagamento || null,
      metodo_pagamento: formData.metodo_pagamento || null,
      note: formData.note || null,
    }
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('fatture').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('fatture').insert(fields))
    }
    if (error) throw error
    showToast('Fattura salvata', 'success')
    return true
  }catch(err){
    showToast('Errore salvataggio fattura','error')
    console.error(err)
    return null
  }
}

export async function cambiaStatoFattura(id, stato){
  try{
    const { error } = await supabase.from('fatture').update({ stato }).eq('id', id)
    if (error) throw error
    showToast('Stato fattura aggiornato', 'success')
  }catch(err){
    showToast('Errore aggiornamento stato fattura','error')
    console.error(err)
  }
}

export function exportCSV(fatture){
  try{
    const headers = ['numero','cliente','mese','imponibile','iva','totale','stato','data_pagamento']
    const rows = fatture.map(f=>{
      const calc = calcolaTotale(f.imponibile || 0, f.iva_pct || 22)
      return [
        f.numero_fattura || '',
        (f.cliente?.ragione_sociale) || '',
        f.mese ? (new Date(f.mese)).toISOString().slice(0,7) : '',
        (f.imponibile ?? '').toString(),
        (calc.iva ?? '').toString(),
        (calc.totale ?? '').toString(),
        f.stato || '',
        f.data_pagamento || ''
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fatture_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }catch(err){
    showToast('Errore export CSV','error')
    console.error(err)
  }
}

export function initFatture(){
  try{
    const addBtn = document.getElementById('add-fattura-button')
    const modalClose = document.querySelector('#fattura-modal .btn-secondary')
    const form = document.querySelector('#fattura-modal form')
    const exportBtn = document.getElementById('export-fatture-csv')
    const genFromContr = document.getElementById('gen-fattura-contratto')

    addBtn?.addEventListener('click', () => {
      const modal = document.getElementById('fattura-modal')
      form?.reset()
      delete form?.dataset.fatturaId
      modal?.classList.add('active')
    })
    modalClose?.addEventListener('click', () => document.getElementById('fattura-modal')?.classList.remove('active'))

    if (form){
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const payload = {
          id: form.dataset.fatturaId || undefined,
          cliente_id: form.querySelector('[name="cliente_id"]').value,
          contratto_id: form.querySelector('[name="contratto_id"]').value,
          numero_fattura: form.querySelector('[name="numero_fattura"]').value,
          mese: form.querySelector('[name="mese"]').value ? (new Date(form.querySelector('[name="mese"]').value + '-01')).toISOString().slice(0,10) : null,
          imponibile: parseFloat(form.querySelector('[name="imponibile"]').value) || 0,
          iva_pct: parseFloat(form.querySelector('[name="iva_pct"]').value) || 22,
          stato: form.querySelector('[name="stato"]').value || 'bozza',
          data_scadenza: form.querySelector('[name="data_scadenza"]').value || null,
          data_pagamento: form.querySelector('[name="data_pagamento"]').value || null,
          metodo_pagamento: form.querySelector('[name="metodo_pagamento"]').value || null,
          note: form.querySelector('[name="note"]').value || null,
        }
        await saveFattura(payload)
        form.reset()
        delete form.dataset.fatturaId
        document.getElementById('fattura-modal')?.classList.remove('active')
        const fatture = await loadFatture()
        renderTabella(fatture)
      })
    }

    document.addEventListener('click', async (e) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const action = t.dataset.action
      const id = t.dataset.id
      if (!action || !id) return
      if (action === 'edit-fattura') {
        const modal = document.getElementById('fattura-modal')
        const { data, error } = await supabase.from('fatture').select('*').eq('id', id).single()
        if (error) { showToast('Errore caricamento fattura','error'); return }
        const form = modal.querySelector('form')
        Object.entries(data).forEach(([k,v])=>{ const el = form.querySelector(`[name="${k}"]`); if (el) el.value = v ?? '' })
        form.dataset.fatturaId = id
        modal.classList.add('active')
      }
      if (action === 'change-state'){
        const newState = prompt('Inserisci nuovo stato (bozza, emessa, pagata, scaduta):')
        if (newState) await cambiaStatoFattura(id, newState)
        const fatture = await loadFatture()
        renderTabella(fatture)
      }
    })

    exportBtn?.addEventListener('click', async ()=>{
      const fatture = await loadFatture()
      exportCSV(fatture)
    })

    genFromContr?.addEventListener('click', async ()=>{
      const clienteId = document.querySelector('#fatture-filters [name="cliente_id"]').value
      const mese = document.querySelector('#fatture-filters [name="mese"]').value
      if (!clienteId || !mese) { showToast('Seleziona cliente e mese', 'warning'); return }
      await generaFatturaDaContratto(clienteId, mese)
    })

    // initial load
    loadFatture().then(renderTabella)
  }catch(err){
    showToast('Errore inizializzazione fatture','error')
    console.error(err)
  }
}

// Funzioni per gestione fatture
