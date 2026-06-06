import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { openModalIntervento } from './interventi.js'

function todayISO(){
  return new Date().toISOString().slice(0,10)
}

function monthRange(date = new Date()){
  const start = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0,10)
  const end = new Date(date.getFullYear(), date.getMonth()+1, 0).toISOString().slice(0,10)
  return { start, end }
}

function parseTimeToSeconds(t){
  if (!t) return 0
  const parts = t.split(':').map(Number)
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)
}

export async function loadKPI(){
  try{
    const today = todayISO()
    const { start, end } = monthRange()

    const p1 = supabase.from('interventi').select('id', { count: 'exact' }).eq('data_pianificata', today)
    const p2 = supabase.from('interventi')
      .select('inizio_effettivo,fine_effettivo,ora_inizio_pianificata,ora_fine_pianificata,stato,data_pianificata')
      .in('stato', ['completato','approvato'])
      .gte('data_pianificata', start).lte('data_pianificata', end)
    const p3 = supabase.from('fatture').select('totale,stato,mese').in('stato', ['emessa','pagata']).gte('mese', start).lte('mese', end)
    const p4 = supabase.from('clienti').select('id', { count: 'exact' }).eq('attivo', true)

    const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4])

    if (r1.error) throw r1.error
    if (r2.error) throw r2.error
    if (r3.error) throw r3.error
    if (r4.error) throw r4.error

    const interventiOggi = r1.count ?? (r1.data ? r1.data.length : 0)

    const rows2 = r2.data || []
    let totalSeconds = 0
    rows2.forEach(row => {
      if (row.inizio_effettivo && row.fine_effettivo) {
        // usa i timestamp reali se l'operatore ha usato avvia/stop
        totalSeconds += Math.max(0, (new Date(row.fine_effettivo) - new Date(row.inizio_effettivo)) / 1000)
      } else {
        // fallback: ore pianificate
        totalSeconds += Math.max(0, parseTimeToSeconds(row.ora_fine_pianificata) - parseTimeToSeconds(row.ora_inizio_pianificata))
      }
    })
    const oreMese = +(totalSeconds / 3600).toFixed(1)

    const rows3 = r3.data || []
    const fatturato = rows3.reduce((s,x)=> s + (Number(x.totale)||0), 0)
    const clientiAttivi = r4.count ?? (r4.data ? r4.data.length : 0)

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
    ;(data||[]).forEach(iv => {
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
  const barCanvas = document.getElementById('chart-interventi-mesi')
  const pieCanvas = document.getElementById('chart-stati-mese')
  if (!barCanvas && !pieCanvas) return null
  try{
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

    const labels = months.map(m => m.toLocaleDateString('it-IT',{year:'numeric', month:'short'}))
    const counts = months.map(() => 0)
    const stateCounts = {}
    ;(interventi||[]).forEach(iv => {
      const d = new Date(iv.data_pianificata)
      const idx = months.findIndex(m => m.getFullYear()===d.getFullYear() && m.getMonth()===d.getMonth())
      if (idx>=0) counts[idx]++
      stateCounts[iv.stato] = (stateCounts[iv.stato]||0) + 1
    })

    const Chart = await ensureChartJs()

    const barCtx = document.getElementById('chart-interventi-mesi')?.getContext('2d')
    if (barCtx){
      if (barCtx._chart) barCtx._chart.destroy()
      barCtx._chart = new Chart(barCtx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Interventi', data: counts, backgroundColor: '#3b82f6' }] },
        options: { responsive: true }
      })
    }

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

export async function loadMagazzinoAlert() {
  try {
    const today = todayISO()
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('magazzino').select('*').eq('attivo', true)
    if (error) throw error
    const items = (data || []).filter(p =>
      (p.quantita_disponibile ?? 0) <= 5 || (p.scadenza && p.scadenza <= in30)
    ).sort((a, b) => {
      if (a.scadenza && b.scadenza) return a.scadenza.localeCompare(b.scadenza)
      if (a.scadenza) return -1
      if (b.scadenza) return 1
      return 0
    })

    const card = document.getElementById('magazzino-alert-card')
    const tbody = document.getElementById('magazzino-alert-body')
    if (!card || !tbody) return

    if (!items.length) { card.style.display = 'none'; return }
    card.style.display = 'block'
    tbody.innerHTML = ''
    items.forEach(p => {
      const isExpired = p.scadenza && p.scadenza < today
      const isExpiring = p.scadenza && p.scadenza <= in30
      const isLowStock = (p.quantita_disponibile ?? 0) <= 5
      const badges = []
      if (isExpired) badges.push('<span class="badge badge-danger">Scaduto</span>')
      else if (isExpiring) badges.push('<span class="badge badge-warning">In scadenza</span>')
      if (isLowStock) badges.push('<span class="badge badge-warning">Scorte basse</span>')
      const dateLabel = p.scadenza
        ? new Date(p.scadenza + 'T00:00:00').toLocaleDateString('it-IT')
        : '-'
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td><strong>${p.nome}</strong></td>
        <td>${p.quantita_disponibile ?? 0} ${p.unita_misura || ''}</td>
        <td>${dateLabel}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap;">${badges.join('')}</td>
      `
      tbody.appendChild(tr)
    })
  } catch(err) {
    console.error('Errore alert magazzino:', err)
  }
}

export async function loadVeicoliAlert() {
  try {
    const today = todayISO()
    const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('veicoli').select('*').eq('attivo', true)
    if (error) throw error

    // Mostra tutti i veicoli che hanno almeno una scadenza impostata, ordinati per scadenza più vicina
    const items = (data || [])
      .filter(v => v.revisione_scadenza || v.assicurazione_scadenza)
      .sort((a, b) => {
        const aMin = [a.revisione_scadenza, a.assicurazione_scadenza].filter(Boolean).sort()[0] || '9999'
        const bMin = [b.revisione_scadenza, b.assicurazione_scadenza].filter(Boolean).sort()[0] || '9999'
        return aMin.localeCompare(bMin)
      })

    const card = document.getElementById('veicoli-alert-card')
    const tbody = document.getElementById('veicoli-alert-body')
    if (!card || !tbody) return

    if (!items.length) { card.style.display = 'none'; return }
    card.style.display = 'block'
    tbody.innerHTML = ''
    items.forEach(v => {
      function scadCell(dateStr, label) {
        if (!dateStr) return ''
        const d = new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT')
        if (dateStr < today)
          return `<span class="badge badge-danger">${label}: ${d} ⚠</span>`
        if (dateStr <= in90)
          return `<span class="badge badge-warning">${label}: ${d}</span>`
        return `<span class="badge" style="background:var(--gray-200);color:var(--gray-700);">${label}: ${d}</span>`
      }
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td><strong>${v.targa}</strong></td>
        <td>${[v.marca, v.modello].filter(Boolean).join(' ') || '-'}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap;">
          ${scadCell(v.revisione_scadenza, 'Revisione')}
          ${scadCell(v.assicurazione_scadenza, 'Assicurazione')}
        </td>
      `
      tbody.appendChild(tr)
    })
  } catch(err) {
    showToast('Tabella veicoli non trovata — esegui migrations_v5.sql', 'error')
    console.error('Errore alert veicoli:', err)
  }
}

export function initCruscotto(){
  try{
    async function refreshAll(){
      await loadKPI()
      await loadInterventiOggi()
      await loadGrafici()
      await loadMagazzinoAlert()
      await loadVeicoliAlert()
    }
    const refresh = document.getElementById('refresh-cruscotto')
    refresh?.addEventListener('click', refreshAll)

    document.getElementById('interventi-oggi-body')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action="open"]')
      if (btn?.dataset.id) await openModalIntervento(btn.dataset.id)
    })

    refreshAll()
  }catch(err){
    showToast('Errore inizializzazione cruscotto','error')
    console.error(err)
  }
}
