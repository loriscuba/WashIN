import supabase from '../supabase.js'
import { showToast } from './clienti.js'

function todayISO(){
  return new Date().toISOString().slice(0,10)
}
function monthRange(date = new Date()){
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth()+1, 0)
function parseTimeToSeconds(t){
  if (!t) return 0
  // t expected as 'HH:MM:SS' or 'HH:MM'
export async function loadKPI(){
  try{
    const today = todayISO()
  const { start, end } = monthRange()

  const p1 = supabase.from('interventi').select('id', { count: 'exact' }).eq('data_pianificata', today)
  const p2 = supabase.from('interventi').select('ora_inizio_effettiva,ora_fine_effettiva,stato,data_pianificata').in('stato', ['completato','approvato']).gte('data_pianificata', start).lte('data_pianificata', end)
  const p3 = supabase.from('fatture').select('totale,stato,mese').in('stato', ['emessa','pagata']).gte('mese', start).lte('mese', end)
  const p4 = supabase.from('clienti').select('id', { count: 'exact' }).eq('attivo', true)

  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4])

  if (r1.error) throw r1.error
  if (r2.error) throw r2.error
  if (r3.error) throw r3.error
  if (r4.error) throw r4.error

  const interventiOggi = r1.count ?? (r1.data ? r1.data.length : 0)

  // total hours in month
  const rows2 = r2.data || []
  let totalSeconds = 0
    rows2.forEach(row => {
      totalSeconds += Math.max(0, parseTimeToSeconds(row.ora_fine_effettiva) - parseTimeToSeconds(row.ora_inizio_effettiva))
    })
  const oreMese = +(totalSeconds/3600).toFixed(2)

  // fatturato
  const rows3 = r3.data || []
  const fatturato = rows3.reduce((s,x)=> s + (Number(x.totale)||0), 0)
  const clientiAttivi = r4.count ?? (r4.data ? r4.data.length : 0)

  // update DOM
  const elInterventi = document.getElementById('kpi-interventi-oggi')
  const elOre = document.getElementById('kpi-ore-mese')
  const elFatt = document.getElementById('kpi-fatturato-mese')
  const elClienti = document.getElementById('kpi-clienti-attivi')
  if (elInterventi) elInterventi.textContent = interventiOggi
  if (elOre) elOre.textContent = `${oreMese} h`
  if (elFatt) elFatt.textContent = new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(fatturato)
  if (elClienti) elClienti.textContent = clientiAttivi
    return { interventiOggi, oreMese, fatturato, clientiAttivi }
  }catch(err){
    showToast('Errore caricamento KPI','error')
    console.error(err)
    return { interventiOggi:0, oreMese:0, fatturato:0, clientiAttivi:0 }
  }
}

export async function loadInterventiOggi(){
  try{
    const today = todayISO()
  const { data, error } = await supabase.from('interventi').select('*, profili(nome,cognome), sedi_cliente(nome_sede,indirizzo, clienti(ragione_sociale))').eq('data_pianificata', today).order('ora_inizio_pianificata', { ascending: true })
  if (error) throw error
  const tbody = document.getElementById('interventi-oggi-body')
  if (!tbody) return data || []
  tbody.innerHTML = ''
  (data||[]).forEach(iv => {
  const tr = document.createElement('tr')
  const op = iv.profili ? `${iv.profili.nome || ''} ${iv.profili.cognome || ''}`.trim() : '-'
  const cliente = iv.sedi_cliente?.clienti?.ragione_sociale || '-'
      tr.innerHTML = `
        <td>${iv.ora_inizio_pianificata || '-'}</td>
        <td>${op}</td>
  <td>${cliente} / ${iv.sedi_cliente?.nome_sede || '-'}</td>
  <td>${iv.tipo_pulizia || '-'}</td>
  <td><span class="badge">${iv.stato}</span></td>
        <td><button class="btn btn-sm btn-secondary" data-action="open" data-id="${iv.id}">Dettaglio</button></td>
      `
      tbody.appendChild(tr)
    })
    return data || []
  }catch(err){
    showToast('Errore caricamento interventi oggi','error')
    console.error(err)
    return []
  }
}

async function ensureChartJs(){
  if (window.Chart) return window.Chart
  return new Promise((resolve, reject) => {
  const s = document.createElement('script')
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js'
  s.onload = () => resolve(window.Chart)
  s.onerror = reject
  document.head.appendChild(s)
  })
}

export async function loadGrafici(){
  try{
    // ultimi 6 mesi
  const now = new Date()
  const months = []
  for(let i=5;i>=0;i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(d)
    }
  const start = new Date(months[0].getFullYear(), months[0].getMonth(), 1).toISOString().slice(0,10)
  const end = new Date(months[months.length-1].getFullYear(), months[months.length-1].getMonth()+1,0).toISOString().slice(0,10)

  const { data: interventi, error } = await supabase.from('interventi').select('id, data_pianificata, stato').gte('data_pianificata', start).lte('data_pianificata', end)
  if (error) throw error

  // count per mese
  const labels = months.map(m => m.toLocaleDateString('it-IT',{year:'numeric', month:'short'}))
  const counts = months.map(m => 0)
    const stateCounts = {}
    (interventi||[]).forEach(iv => {
      const d = new Date(iv.data_pianificata)
  const idx = months.findIndex(m => m.getFullYear()===d.getFullYear() && m.getMonth()===d.getMonth())
  if (idx>=0) counts[idx]++
  stateCounts[iv.stato] = (stateCounts[iv.stato]||0) + 1
  })

  const Chart = await ensureChartJs()

  // bar chart
  const barCtx = document.getElementById('chart-interventi-mesi')?.getContext('2d')
  if (barCtx){
      if (barCtx._chart) barCtx._chart.destroy()
      barCtx._chart = new Chart(barCtx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Interventi', data: counts, backgroundColor: '#3b82f6' }] },
        options: { responsive: true }
      })
  }

  // pie chart for current month
    const pieCtx = document.getElementById('chart-stati-mese')?.getContext('2d')
    if (pieCtx){
      if (pieCtx._chart) pieCtx._chart.destroy()
  const labelsPie = Object.keys(stateCounts)
  const dataPie = Object.values(stateCounts)
  pieCtx._chart = new Chart(pieCtx, {
  type: 'pie',
  data: { labels: labelsPie, datasets: [{ data: dataPie, backgroundColor: ['#10b981','#f97316','#ef4444','#60a5fa'] }] },
  options: { responsive: true }
      })
    }

    return { labels, counts, stateCounts }
  }catch(err){
    showToast('Errore caricamento grafici','error')
    console.error(err)
    return null
  }
}

export function initCruscotto(){
  try{
    async function refreshAll(){
      await loadKPI()
      await loadInterventiOggi()
      await loadGrafici()
    }
  const refresh = document.getElementById('refresh-cruscotto')
  refresh?.addEventListener('click', refreshAll)
  // initial
    refreshAll()
  }catch(err){
    showToast('Errore inizializzazione cruscotto','error')
    console.error(err)
  }
}

import supabase from '../supabase.js'
import { showToast } from './clienti.js'

export async function loadStats(){
  try{
    const [{ data: clienti, error: e1 }, { data: interventi, error: e2 }, { data: operatori, error: e3 }] = await Promise.all([
      supabase.from('clienti').select('*', { count: 'exact' }),
      supabase.from('interventi').select('*', { count: 'exact' }),
      supabase.from('profili').select('*', { count: 'exact' })
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3
    return {
      clienti: clienti?.length || 0,
      interventi: interventi?.length || 0,
      operatori: operatori?.length || 0,
    }
  }catch(err){
    showToast('Errore caricamento cruscotto','error')
    console.error(err)
    return { clienti: 0, interventi: 0, operatori: 0 }
  }
}

export function renderStats(stats){
  try{
    const elClienti = document.getElementById('stat-clienti')
    const elInterventi = document.getElementById('stat-interventi')
    const elOperatori = document.getElementById('stat-operatori')
    if (elClienti) elClienti.textContent = stats.clienti
    if (elInterventi) elInterventi.textContent = stats.interventi
    if (elOperatori) elOperatori.textContent = stats.operatori
  }catch(err){
    showToast('Errore render cruscotto','error')
    console.error(err)
  }
}

export function initCruscotto(){
  try{
    const refresh = document.getElementById('refresh-cruscotto')
    async function refreshAll(){
      const stats = await loadStats()
      renderStats(stats)
    }
    refresh?.addEventListener('click', refreshAll)
    refreshAll()
  }catch(err){
    showToast('Errore inizializzazione cruscotto','error')
    console.error(err)
  }
}
// admin/cruscotto.js - placeholder
// Logica del cruscotto/admin overview
