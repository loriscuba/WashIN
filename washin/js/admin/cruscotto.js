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

// ── Mappa ────────────────────────────────────────────────────────────────────

let _mapInstance = null
let _mapMarkers = []
let _mapInfoWindow = null
let _interventiOggi = []
let _mapView = 'lista'

const STATUS_COLORS = {
  pianificato: '#3b82f6',
  in_corso:    '#f59e0b',
  completato:  '#10b981',
  approvato:   '#0d9488',
  annullato:   '#ef4444',
}
const STATUS_LABEL = {
  pianificato: 'Pianificato',
  in_corso:    'In corso',
  completato:  'Completato',
  approvato:   'Approvato',
  annullato:   'Annullato',
}

async function ensureGoogleMaps() {
  if (window.google?.maps?.Map) return window.google.maps
  const key = window.GOOGLE_MAPS_KEY
  if (!key) throw new Error('GOOGLE_MAPS_KEY non configurata')
  return new Promise((resolve, reject) => {
    const cb = '_gmcb_' + Date.now()
    window[cb] = () => resolve(window.google.maps)
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=${cb}`
    s.async = true
    s.onerror = reject
    document.head.appendChild(s)
  })
}

async function geocodeSede(sedeId, address) {
  if (!address?.trim()) return null
  const key = window.GOOGLE_MAPS_KEY
  if (!key) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + ', Italia')}&key=${key}&language=it&region=it`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) { console.warn('Geocoding: nessun risultato per', address); return null }
    const { lat, lng } = data.results[0].geometry.location
    const { error } = await supabase.from('sedi_cliente').update({ lat, lng }).eq('id', sedeId)
    if (error) console.error('Geocoding: errore salvataggio sede', sedeId, error)
    else console.info('Geocoding OK:', address, '→', lat, lng)
    return { lat, lng }
  } catch (err) {
    console.warn('Geocoding failed:', address, err)
    return null
  }
}

async function geocodeAllSedi() {
  try {
    const { data: sedi, error } = await supabase
      .from('sedi_cliente')
      .select('id, indirizzo, lat, lng, contratti(clienti(citta))')
      .is('lat', null)
      .not('indirizzo', 'is', null)
    if (error || !sedi?.length) return

    console.info(`Geocodifica automatica: ${sedi.length} sedi da aggiornare`)
    let done = 0
    for (const sede of sedi) {
      if (!sede.indirizzo?.trim()) continue
      const coords = await geocodeSede(sede.id, sede.indirizzo.trim())
      if (coords) done++
    }
    if (done) console.info(`Geocodifica completata: ${done}/${sedi.length} sedi aggiornate`)
  } catch(err) {
    console.warn('Errore geocodifica automatica:', err)
  }
}

function buildPopup(iv) {
  const sede = iv.sedi_cliente || {}
  const op1 = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : ''
  const op2 = iv.operatore2 ? `${iv.operatore2.nome || ''} ${iv.operatore2.cognome || ''}`.trim() : ''
  const op = [op1, op2].filter(Boolean).join(' + ') || '-'
  const cliente = iv.contratti?.clienti?.ragione_sociale || sede.clienti?.ragione_sociale || '-'
  const color = STATUS_COLORS[iv.stato] || '#6b7280'
  const label = STATUS_LABEL[iv.stato] || iv.stato
  return `
    <div style="font-size:13px;line-height:1.5;min-width:190px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111;">${iv.ora_inizio_pianificata || '--:--'} — ${iv.tipo_pulizia || '-'}</p>
      <p style="margin:0 0 3px;color:#374151;"><strong>${cliente}</strong></p>
      <p style="margin:0 0 3px;color:#6b7280;">📍 ${sede.nome_sede || '-'}${sede.indirizzo ? `<br><span style="font-size:11px;">${sede.indirizzo}</span>` : ''}</p>
      <p style="margin:0 0 6px;color:#6b7280;">👷 ${op}</p>
      <span style="display:inline-block;padding:2px 10px;border-radius:4px;background:${color};color:#fff;font-size:11px;font-weight:600;">${label}</span>
    </div>
  `
}

async function renderMappaOggi(interventi) {
  const mapDiv = document.getElementById('mappa-oggi')
  if (!mapDiv || mapDiv.style.display === 'none') return

  const gm = await ensureGoogleMaps()

  if (!_mapInstance) {
    _mapInstance = new gm.Map(mapDiv, {
      center: { lat: 44.5, lng: 11.3 },
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    })
    _mapInfoWindow = new gm.InfoWindow()
    _mapInstance.addListener('click', () => _mapInfoWindow.close())
  } else {
    _mapMarkers.forEach(m => m.setMap(null))
    _mapMarkers = []
    _mapInfoWindow.close()
    gm.event.trigger(_mapInstance, 'resize')
  }

  const coordMap = new Map()
  const bounds = new gm.LatLngBounds()
  let hasMarkers = false

  function makeIcon(ivs) {
    const multi = ivs.length > 1
    const color = multi ? '#6366f1' : (STATUS_COLORS[ivs[0].stato] || '#6b7280')
    const size = multi ? 30 : 26
    const inner = multi
      ? `<text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial,sans-serif">${ivs.length}</text>`
      : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" stroke="white" stroke-width="3"/>${inner}</svg>`
    return {
      url: 'data:image/svg+xml,' + encodeURIComponent(svg),
      scaledSize: new gm.Size(size, size),
      anchor: new gm.Point(size / 2, size / 2),
    }
  }

  function makePopupContent(ivs) {
    if (ivs.length === 1) return buildPopup(ivs[0])
    const nomeSede = ivs[0].sedi_cliente?.nome_sede || 'Sede'
    return `<div style="font-size:13px;min-width:220px;">
      <p style="margin:0 0 8px;font-weight:700;color:#6366f1;">📍 ${nomeSede} — ${ivs.length} interventi</p>
      ${ivs.map(iv => buildPopup(iv)).join('<hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb;">')}
    </div>`
  }

  function fitBounds() {
    if (!hasMarkers) return
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      _mapInstance.setCenter(bounds.getCenter())
      _mapInstance.setZoom(15)
    } else {
      _mapInstance.fitBounds(bounds, { padding: 50 })
    }
  }

  function placeOrUpdate(iv, lat, lng) {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
    const pos = { lat, lng }
    bounds.extend(pos)
    hasMarkers = true
    if (coordMap.has(key)) {
      const entry = coordMap.get(key)
      entry.ivs.push(iv)
      entry.marker.setIcon(makeIcon(entry.ivs))
      entry.content = makePopupContent(entry.ivs)
    } else {
      const ivs = [iv]
      const marker = new gm.Marker({ position: pos, map: _mapInstance, icon: makeIcon(ivs) })
      const entry = { ivs, marker, content: makePopupContent(ivs) }
      coordMap.set(key, entry)
      _mapMarkers.push(marker)
      marker.addListener('click', () => {
        _mapInfoWindow.setContent(entry.content)
        _mapInfoWindow.open(_mapInstance, marker)
      })
    }
    fitBounds()
    const noData = document.getElementById('mappa-no-data')
    if (noData) noData.style.display = 'none'
  }

  // 1. Place markers with known coordinates immediately
  for (const iv of interventi) {
    const sede = iv.sedi_cliente
    if (!sede) continue
    if (sede.lat && sede.lng) placeOrUpdate(iv, Number(sede.lat), Number(sede.lng))
  }

  // 2. Geocode sedi without coordinates incrementally
  for (const iv of interventi) {
    const sede = iv.sedi_cliente
    if (!sede || (sede.lat && sede.lng)) continue
    const address = sede.indirizzo?.trim()
    if (!address) continue
    const coords = await geocodeSede(iv.sede_id, address)
    if (coords) placeOrUpdate(iv, coords.lat, coords.lng)
  }

  if (!hasMarkers) {
    const noData = document.getElementById('mappa-no-data')
    if (noData) noData.style.display = 'flex'
  }
}

function setMapView(view) {
  _mapView = view
  const lista   = document.getElementById('oggi-lista')
  const mappa   = document.getElementById('mappa-oggi')
  const noData  = document.getElementById('mappa-no-data')
  const legenda = document.getElementById('mappa-legenda')
  const btnL    = document.getElementById('btn-view-lista')
  const btnM    = document.getElementById('btn-view-mappa')

  const isMappa = view === 'mappa'
  if (lista)   lista.style.display   = isMappa ? 'none' : 'block'
  if (mappa)   mappa.style.display   = isMappa ? 'block' : 'none'
  if (legenda) legenda.style.display = isMappa ? 'flex' : 'none'
  if (noData && !isMappa) noData.style.display = 'none'

  const activeStyle   = 'background:#0d9488;color:#fff;'
  const inactiveStyle = 'background:#fff;color:#6b7280;'
  if (btnL) btnL.style.cssText = (isMappa ? inactiveStyle : activeStyle) + 'padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;'
  if (btnM) btnM.style.cssText = (isMappa ? activeStyle : inactiveStyle) + 'padding:5px 14px;font-size:12px;font-weight:600;border:none;cursor:pointer;'

  if (isMappa) renderMappaOggi(_interventiOggi)
}

// ── KPI ──────────────────────────────────────────────────────────────────────

export async function loadKPI(){
  try{
    const today = todayISO()
    const { start, end } = monthRange()

    const p1 = supabase.from('interventi').select('id', { count: 'exact' }).eq('data_pianificata', today)
    const p2 = supabase.from('interventi')
      .select('inizio_effettivo,fine_effettivo,ora_inizio_pianificata,ora_fine_pianificata,stato,data_pianificata')
      .in('stato', ['completato','approvato'])
      .gte('data_pianificata', start).lte('data_pianificata', end)
    const p3 = supabase.from('fatture').select('totale,mese').gte('mese', start).lte('mese', end)
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
        totalSeconds += Math.max(0, (new Date(row.fine_effettivo) - new Date(row.inizio_effettivo)) / 1000)
      } else {
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
    const { data, error } = await supabase.from('interventi').select(`
      *,
      operatore:profili!operatore_id(nome,cognome),
      operatore2:profili!operatore2_id(nome,cognome),
      sedi_cliente(nome_sede, indirizzo, lat, lng),
      contratti!contratto_id(clienti(ragione_sociale, citta))
    `).eq('data_pianificata', today).order('ora_inizio_pianificata', { ascending: true })
    if (error) throw error

    _interventiOggi = data || []

    const btnM = document.getElementById('btn-view-mappa')
    if (btnM) {
      const hasData = _interventiOggi.length > 0
      btnM.disabled = !hasData
      btnM.title = hasData ? '' : 'Nessun intervento oggi'
      btnM.style.opacity = hasData ? '' : '0.4'
      btnM.style.cursor = hasData ? '' : 'not-allowed'
    }

    const tbody = document.getElementById('interventi-oggi-body')
    if (tbody) {
      tbody.innerHTML = ''
      _interventiOggi.forEach(iv => {
        const tr = document.createElement('tr')
        const op1 = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : ''
        const op2 = iv.operatore2 ? `${iv.operatore2.nome || ''} ${iv.operatore2.cognome || ''}`.trim() : ''
        const op = [op1, op2].filter(Boolean).join(' + ') || '-'
        const cliente = iv.contratti?.clienti?.ragione_sociale || '-'
        const color = STATUS_COLORS[iv.stato] || '#6b7280'
        tr.innerHTML = `
          <td>${iv.ora_inizio_pianificata || '-'}</td>
          <td>${op}</td>
          <td>
            <strong>${cliente}</strong><br>
            ${iv.sedi_cliente?.nome_sede || '-'}
            ${iv.sedi_cliente?.indirizzo ? `<br><span style="font-size:11px;color:var(--gray-500);">${iv.sedi_cliente.indirizzo}</span>` : ''}
          </td>
          <td>${iv.tipo_pulizia || '-'}</td>
          <td><span class="badge" style="background:${color};color:#fff;">${STATUS_LABEL[iv.stato] || iv.stato}</span></td>
          <td><button class="btn btn-sm btn-secondary" data-action="open" data-id="${iv.id}">Dettaglio</button></td>
        `
        tbody.appendChild(tr)
      })
    }

    if (_mapView === 'mappa' && _interventiOggi.length === 0) setMapView('lista')
    else if (_mapView === 'mappa') await renderMappaOggi(_interventiOggi)
    return _interventiOggi
  }catch(err){
    showToast('Errore caricamento interventi oggi','error')
    console.error(err)
    return []
  }
}

// ── Grafici ──────────────────────────────────────────────────────────────────

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

// ── Alert magazzino / veicoli ────────────────────────────────────────────────

export async function loadMagazzinoAlert() {
  try {
    const today = todayISO()
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('magazzino').select('*').eq('attivo', true)
    if (error) throw error
    const items = (data || []).filter(p => {
      const soglia = p.soglia_minima ?? 5
      return (p.quantita_disponibile ?? 0) <= soglia || (p.scadenza && p.scadenza <= in30)
    }).sort((a, b) => {
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
      const isLowStock = (p.quantita_disponibile ?? 0) <= (p.soglia_minima ?? 5)
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
        if (dateStr < today) return `<span class="badge badge-danger">${label}: ${d} ⚠</span>`
        if (dateStr <= in90) return `<span class="badge badge-warning">${label}: ${d}</span>`
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

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCruscotto(){
  try{
    async function refreshAll(){
      await loadKPI()
      await loadInterventiOggi()
      await loadGrafici()
      await loadMagazzinoAlert()
      await loadVeicoliAlert()
    }

    window.addEventListener('cruscotto:refresh', refreshAll)
    setInterval(refreshAll, 15 * 60 * 1000)

    document.getElementById('interventi-oggi-body')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action="open"]')
      if (btn?.dataset.id) await openModalIntervento(btn.dataset.id)
    })

    document.getElementById('btn-view-lista')?.addEventListener('click', () => setMapView('lista'))
    document.getElementById('btn-view-mappa')?.addEventListener('click', () => setMapView('mappa'))

    refreshAll()
    geocodeAllSedi() // background: geocodifica sedi senza coordinate
  }catch(err){
    showToast('Errore inizializzazione cruscotto','error')
    console.error(err)
  }
}
