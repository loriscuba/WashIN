import supabase from '../supabase.js'

let _modalitaOrario = false   // true = inserimento ore, false = classica

async function loadModalita() {
  const { data } = await supabase.from('impostazioni').select('valore').eq('chiave', 'modalita_intervento').maybeSingle()
  _modalitaOrario = data?.valore === 'orario'
}

function createToastContainer() {
  let container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.style.position = 'fixed'
    container.style.right = '20px'
    container.style.bottom = '20px'
    container.style.display = 'grid'
    container.style.gap = '10px'
    container.style.zIndex = '9999'
    document.body.appendChild(container)
  }
  return container
}

function showToast(message, type = 'success') {
  const container = createToastContainer()
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.padding = '12px 16px'
  toast.style.borderRadius = '12px'
  toast.style.boxShadow = '0 10px 24px rgba(0,0,0,0.12)'
  toast.style.color = '#fff'
  toast.style.opacity = '0'
  toast.style.transform = 'translateY(10px)'
  toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
  toast.style.maxWidth = '320px'
  toast.style.fontSize = '14px'
  toast.style.background = type === 'error' ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#0D9488'
  container.appendChild(toast)
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0)'
  })
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(10px)'
    toast.addEventListener('transitionend', () => toast.remove(), { once: true })
  }, 3000)
}

export async function getOperatoreId() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.user) return null
  const authId = data.session.user.id
  // interventi.operatore_id referenzia profili.id, non l'auth UUID
  const { data: profile } = await supabase.from('profili').select('id').eq('user_id', authId).single()
  return profile?.id || null
}

function buildMapsUrl(indirizzo = '', citta = '') {
  const address = [indirizzo, citta].filter(Boolean).join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`
}

export function buildMapsUrlPublic(indirizzo = '', citta = '') {
  return buildMapsUrl(indirizzo, citta)
}

function localDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function endOfWeekStr() {
  const today = new Date()
  const day = today.getDay() // 0=dom, 1=lun, ..., 6=sab
  const daysToSunday = day === 0 ? 0 : 7 - day
  const sunday = new Date(today)
  sunday.setDate(today.getDate() + daysToSunday)
  return localDateStr(sunday)
}

export async function loadInterventiOperatore(start, end) {
  try {
    const operatoreId = await getOperatoreId()
    if (!operatoreId) return []

    const { data, error } = await supabase
      .from('interventi')
      .select('*, sedi_cliente(nome_sede,indirizzo), contratti!contratto_id(clienti(ragione_sociale)), operatore:profili!operatore_id(nome,cognome), operatore2:profili!operatore2_id(nome,cognome)')
      .or(`operatore_id.eq.${operatoreId},operatore2_id.eq.${operatoreId}`)
      .gte('data_pianificata', start)
      .lte('data_pianificata', end)
      .order('data_pianificata', { ascending: true })
      .order('ora_inizio_pianificata', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    showToast('Errore caricamento interventi', 'error')
    console.error(error)
    return []
  }
}

export async function loadInterventiPassati() {
  try {
    const operatoreId = await getOperatoreId()
    if (!operatoreId) return []
    const ieri = new Date()
    ieri.setDate(ieri.getDate() - 1)
    const { data, error } = await supabase
      .from('interventi')
      .select('*, sedi_cliente(nome_sede,indirizzo), contratti!contratto_id(clienti(ragione_sociale)), operatore:profili!operatore_id(nome,cognome), operatore2:profili!operatore2_id(nome,cognome)')
      .or(`operatore_id.eq.${operatoreId},operatore2_id.eq.${operatoreId}`)
      .lte('data_pianificata', localDateStr(ieri))
      .order('data_pianificata', { ascending: false })
      .limit(50)
    if (error) throw error
    return data || []
  } catch (error) {
    showToast('Errore caricamento storico', 'error')
    console.error(error)
    return []
  }
}

export function renderInterventiPassati(interventi) {
  const container = document.getElementById('storico-list')
  if (!container) return
  container.innerHTML = ''
  if (!interventi.length) {
    container.innerHTML = '<p style="color:var(--gray-500);text-align:center;padding:24px 0;">Nessun intervento passato.</p>'
    return
  }
  interventi.forEach(iv => {
    const card = document.createElement('div')
    card.className = 'intervento-card'
    const cliente = iv.contratti?.clienti?.ragione_sociale || iv.sedi_cliente?.clienti?.ragione_sociale || 'Cliente sconosciuto'
    const sede = iv.sedi_cliente?.nome_sede || ''
    const dataFmt = iv.data_pianificata
      ? new Date(iv.data_pianificata + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
      : '-'
    const fmtT = t => t ? t.slice(0, 5) : ''
    const orario = iv.ora_inizio_pianificata
      ? `${fmtT(iv.ora_inizio_pianificata)}${iv.ora_fine_pianificata ? ' — ' + fmtT(iv.ora_fine_pianificata) : ''}`
      : ''
    const stato = iv.stato || 'pianificato'
    const incompleto = stato !== 'completato' || !iv.fine_effettivo
    const op1s = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : ''
    const op2s = iv.operatore2 ? `${iv.operatore2.nome || ''} ${iv.operatore2.cognome || ''}`.trim() : ''
    const operatoriStorico = [op1s, op2s].filter(Boolean).join(' + ')
    card.innerHTML = `
      <div class="meta">
        <div>
          <strong>${dataFmt}${orario ? '  ·  ' + orario : ''}</strong>
          <p style="margin:6px 0 0;color:var(--gray-700);font-weight:600;">${cliente}</p>
          ${operatoriStorico ? `<p style="margin:2px 0 0;font-size:12px;color:var(--gray-500);">👤 ${operatoriStorico}</p>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge ${badgeForStato(stato)}">${stato}</span>
          ${incompleto ? '<span class="badge badge-warning">⚠ Incompleto</span>' : ''}
        </div>
      </div>
      ${sede ? `<div class="location">${sede}</div>` : ''}
      ${incompleto ? `<div class="actions"><button class="btn btn-secondary btn-sm" data-action="checklist" data-id="${iv.id}" type="button">Compila checklist</button></div>` : ''}
    `
    container.appendChild(card)
  })
}

function badgeForStato(stato) {
  if (stato === 'in_corso') return 'badge-success'
  if (stato === 'completato') return 'badge-info'
  if (stato === 'annullato') return 'badge-danger'
  return 'badge-warning'
}

export function renderInterventi(interventi) {
  const container = document.getElementById('agenda-cards')
  if (!container) return
  container.innerHTML = ''

  if (!interventi.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,0.07);">
        <div style="font-size:44px;margin-bottom:12px;">📅</div>
        <p style="font-weight:700;font-size:16px;color:var(--gray-600);margin:0 0 6px;">Tutto libero</p>
        <p style="font-size:14px;color:var(--gray-400);margin:0;">Nessun intervento per questo periodo.</p>
      </div>`
    return
  }

  let lastDate = null
  interventi.forEach((iv) => {
    const stato = iv.stato || 'pianificato'
    const datePianificata = iv.data_pianificata || ''

    if (datePianificata !== lastDate) {
      lastDate = datePianificata
      const d = new Date(datePianificata + 'T00:00:00')
      const isToday = localDateStr(d) === localDateStr(new Date())
      const lbl = document.createElement('p')
      lbl.className = 'date-label'
      lbl.textContent = isToday
        ? 'Oggi — ' + d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
        : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
      container.appendChild(lbl)
    }

    const card = document.createElement('div')
    card.className = 'intervento-card'
    const cliente = iv.contratti?.clienti?.ragione_sociale || iv.sedi_cliente?.clienti?.ragione_sociale || 'Cliente sconosciuto'
    const sede = iv.sedi_cliente?.nome_sede || ''
    const indirizzo = iv.sedi_cliente?.indirizzo || ''
    const fmt = t => t ? t.slice(0, 5) : ''
    const orario = iv.ora_inizio_pianificata
      ? `${fmt(iv.ora_inizio_pianificata)}${iv.ora_fine_pianificata ? ' — ' + fmt(iv.ora_fine_pianificata) : ''}`
      : 'Orario non definito'
    const fmtTs = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const tempiEffettivi = iv.inizio_effettivo
      ? `<p class="iv-orario" style="color:#059669;font-size:12px;margin-top:2px;">▶ ${fmtTs(iv.inizio_effettivo)}${iv.fine_effettivo ? ' — ■ ' + fmtTs(iv.fine_effettivo) : ' in corso...'}</p>`
      : ''
    const location = [sede, indirizzo].filter(Boolean).join(' — ')
    const mapsUrl = buildMapsUrl(indirizzo, '')
    const actionDone = stato === 'completato' || stato === 'annullato'
    const actionLabel = stato === 'pianificato' ? 'Avvia intervento' : stato === 'in_corso' ? 'Segna completato' : stato.replace('_', ' ')
    const newState = stato === 'pianificato' ? 'in_corso' : 'completato'
    const borderColor = { in_corso: '#10b981', completato: '#0d9488', annullato: '#ef4444', pianificato: '#f59e0b' }[stato] || '#f59e0b'
    const op1 = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : ''
    const op2 = iv.operatore2 ? `${iv.operatore2.nome || ''} ${iv.operatore2.cognome || ''}`.trim() : ''
    const operatori = [op1, op2].filter(Boolean).join(' + ')

    const oreCompilate = iv.ore_ordinarie != null
    const oreLabel = oreCompilate
      ? `✅ ${iv.ore_ordinarie}h ord${iv.ore_straordinario ? ' + ' + iv.ore_straordinario + 'h str' : ''}`
      : null
    const oreBorderColor = oreCompilate ? '#10b981' : borderColor

    const actionsHtml = _modalitaOrario
      ? `<a class="btn btn-secondary btn-sm" style="text-align:center;" href="${mapsUrl}" target="_blank" rel="noreferrer">Mappa</a>
         <button class="btn ${oreCompilate ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="inserisci-ore" data-id="${iv.id}" data-data="${iv.data_pianificata}" type="button">⏱ ${oreCompilate ? 'Modifica orario' : 'Inserisci orario'}</button>`
      : `<a class="btn btn-secondary btn-sm" style="text-align:center;" href="${mapsUrl}" target="_blank" rel="noreferrer">Mappa</a>
         <button class="btn btn-secondary btn-sm" data-action="checklist" data-id="${iv.id}" type="button" style="text-align:center;">Checklist</button>
         ${!actionDone ? `<button class="btn btn-primary btn-sm btn-avvia" data-action="status" data-id="${iv.id}" data-newstate="${newState}" type="button">${actionLabel}</button>` : ''}`

    card.innerHTML = `
      <div style="height:4px;background:${oreBorderColor};"></div>
      <div class="iv-inner">
        <div class="iv-header">
          <span class="iv-cliente">${cliente}</span>
          <span class="badge ${badgeForStato(stato)}" style="flex-shrink:0;">${stato.replace('_', ' ')}</span>
        </div>
        ${operatori ? `<p style="margin:0 0 4px;font-size:12px;color:var(--gray-500);">👤 ${operatori}</p>` : ''}
        <p class="iv-orario">⏱ ${orario}</p>
        ${oreLabel ? `<p style="margin:2px 0 0;font-size:12px;color:#059669;font-weight:600;">${oreLabel}</p>` : ''}
        ${tempiEffettivi}
        ${location ? `<p class="iv-location">📍 ${location}</p>` : '<div style="margin-bottom:14px;"></div>'}
        <div class="iv-actions">${actionsHtml}</div>
      </div>
    `
    container.appendChild(card)
  })
}

async function checkChecklistComplete(interventoId) {
  try {
    const { data, error } = await supabase
      .from('checklist_compilate')
      .select('voci_compilate')
      .eq('intervento_id', interventoId)
      .single()
    if (error) return false
    const voci = data?.voci_compilate || {}
    return Object.values(voci).some((value) => value === true || value === 'true' || value === 1)
  } catch (error) {
    console.error(error)
    return false
  }
}

function getGeolocation(){
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation){ reject(new Error('Geolocalizzazione non supportata')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

export async function cambiaStatoIntervento(id, stato) {
  try {
    if (stato === 'completato') {
      const completo = await checkChecklistComplete(id)
      if (!completo) {
        showToast('Devi compilare almeno una voce della checklist prima di completare.', 'warning')
        return false
      }
    }

    const payload = { stato }

    if (stato === 'in_corso') {
      payload.inizio_effettivo = new Date().toISOString()
      try {
        const geo = await getGeolocation()
        payload.geo_inizio_lat = geo.lat
        payload.geo_inizio_lng = geo.lng
      } catch {
        showToast('Posizione non disponibile — avvio senza geolocalizzazione', 'warning')
      }
    }

    if (stato === 'completato') {
      payload.fine_effettivo = new Date().toISOString()
      try {
        const geo = await getGeolocation()
        payload.geo_fine_lat = geo.lat
        payload.geo_fine_lng = geo.lng
      } catch {
        showToast('Posizione non disponibile — stop senza geolocalizzazione', 'warning')
      }
    }

    const { error } = await supabase.from('interventi').update(payload).eq('id', id)
    if (error) throw error
    showToast(stato === 'in_corso' ? 'Intervento avviato' : 'Intervento completato', 'success')
    return true
  } catch (error) {
    showToast('Errore aggiornamento stato intervento', 'error')
    console.error(error)
    return false
  }
}

async function apriModaleOre(interventoId, dataPianificata) {
  const operatoreId = await getOperatoreId()
  if (!operatoreId) return

  // Carica ore già salvate sull'intervento
  const { data: ivEsistente } = await supabase
    .from('interventi')
    .select('ore_ordinarie,ore_straordinario,note_ore')
    .eq('id', interventoId)
    .maybeSingle()

  const oreOrdEx  = ivEsistente?.ore_ordinarie    || 0
  const oreStrEx  = ivEsistente?.ore_straordinario || 0
  const noteEx    = ivEsistente?.note_ore          || ''

  function toHM(dec) {
    const h = Math.floor(dec), m = Math.round((dec - h) * 60)
    return { h, m }
  }
  const { h: ohOrd, m: omOrd } = toHM(oreOrdEx)
  const { h: ohStr, m: omStr } = toHM(oreStrEx)

  const dataFmt = new Date(dataPianificata + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  // Crea overlay
  const overlay = document.createElement('div')
  overlay.id = 'ore-modal-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);'
  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 36px;
      width:100%;max-width:480px;box-shadow:0 -8px 40px rgba(0,0,0,.15);
      animation:slideUp .25s ease;
    ">
      <style>@keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
      <div style="width:40px;height:4px;background:#e5e7eb;border-radius:2px;margin:0 auto 20px;"></div>
      <h3 style="margin:0 0 4px;font-size:17px;font-weight:700;">Inserisci orario</h3>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${dataFmt}</p>

      <div style="margin-bottom:18px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Ore ordinarie</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Ore</label>
            <input id="ore-modal-ord-h" type="number" min="0" max="24" value="${ohOrd}"
              style="width:100%;padding:11px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Minuti</label>
            <input id="ore-modal-ord-m" type="number" min="0" max="59" value="${omOrd}"
              style="width:100%;padding:11px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
        </div>
      </div>

      <div style="margin-bottom:18px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f59e0b;">Ore straordinarie</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Ore</label>
            <input id="ore-modal-str-h" type="number" min="0" max="24" value="${ohStr}"
              style="width:100%;padding:11px 12px;border:1.5px solid #fde68a;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#9ca3af;display:block;margin-bottom:4px;">Minuti</label>
            <input id="ore-modal-str-m" type="number" min="0" max="59" value="${omStr}"
              style="width:100%;padding:11px 12px;border:1.5px solid #fde68a;border-radius:10px;font-size:18px;font-weight:700;text-align:center;box-sizing:border-box;">
          </div>
        </div>
      </div>

      <div style="margin-bottom:22px;">
        <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Note</label>
        <textarea id="ore-modal-note" rows="2" placeholder="Cantiere, note speciali…"
          style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;resize:none;">${noteEx}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button id="ore-modal-cancel" style="padding:13px;background:#f3f4f6;color:#374151;border:none;border-radius:12px;font-size:15px;cursor:pointer;">Annulla</button>
        <button id="ore-modal-save"   style="padding:13px;background:#0d9488;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Salva</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  function chiudi() { overlay.remove() }

  overlay.getElementById?.('ore-modal-cancel')
  document.getElementById('ore-modal-cancel').addEventListener('click', chiudi)
  overlay.addEventListener('click', e => { if (e.target === overlay) chiudi() })

  document.getElementById('ore-modal-save').addEventListener('click', async () => {
    const ordH = parseInt(document.getElementById('ore-modal-ord-h').value) || 0
    const ordM = parseInt(document.getElementById('ore-modal-ord-m').value) || 0
    const strH = parseInt(document.getElementById('ore-modal-str-h').value) || 0
    const strM = parseInt(document.getElementById('ore-modal-str-m').value) || 0
    const note = document.getElementById('ore-modal-note').value.trim() || null

    const ore_ordinarie    = Math.round((ordH + ordM / 60) * 100) / 100
    const ore_straordinario = Math.round((strH + strM / 60) * 100) / 100

    // Salva sull'intervento (fonte principale per conto economico e resoconto)
    const { error } = await supabase.from('interventi').update({
      ore_ordinarie,
      ore_straordinario,
      note_ore: note,
      stato: 'completato',
    }).eq('id', interventoId)

    if (error) {
      showToast('Errore salvataggio ore', 'error')
      console.error(error)
      return
    }

    // Aggiorna presenze_giornaliere (cartellino) sommando tutti gli interventi del giorno
    try {
      const { data: dayIv } = await supabase
        .from('interventi')
        .select('ore_ordinarie,ore_straordinario')
        .eq('operatore_id', operatoreId)
        .eq('data_pianificata', dataPianificata)
        .not('ore_ordinarie', 'is', null)
      const totOrd = (dayIv || []).reduce((s, i) => s + (i.ore_ordinarie || 0), 0)
      const totStr = (dayIv || []).reduce((s, i) => s + (i.ore_straordinario || 0), 0)
      await supabase.from('presenze_giornaliere').upsert({
        profilo_id: operatoreId,
        data: dataPianificata,
        tipo: 'lavoro',
        ore_ordinarie: Math.round(totOrd * 100) / 100,
        ore_straordinario: Math.round(totStr * 100) / 100,
      }, { onConflict: 'profilo_id,data' })
    } catch { /* cartellino non bloccante */ }

    showToast('Orario salvato', 'success')
    chiudi()
    window.dispatchEvent(new CustomEvent('agenda:refresh'))
  })
}

let _vistaSettimana = false

export function refreshAgenda() {
  const oggi = new Date()
  const start = localDateStr(oggi)
  const end = _vistaSettimana ? endOfWeekStr() : start
  loadInterventiOperatore(start, end).then(renderInterventi)
}

export async function initAgenda() {
  await loadModalita()

  const btnOggi = document.getElementById('btn-vista-oggi')
  const btnSett = document.getElementById('btn-vista-settimana')
  const subtitle = document.getElementById('agenda-subtitle')
  const container = document.getElementById('agenda-cards')

  async function refresh() {
    const oggi = new Date()
    const start = localDateStr(oggi)
    const end = _vistaSettimana ? endOfWeekStr() : start
    if (subtitle) subtitle.textContent = _vistaSettimana ? 'Questa settimana' : 'Interventi di oggi'
    const interventi = await loadInterventiOperatore(start, end)
    renderInterventi(interventi)
  }

  btnOggi?.addEventListener('click', () => {
    _vistaSettimana = false
    btnOggi.classList.add('active')
    btnSett?.classList.remove('active')
    refresh()
  })
  btnSett?.addEventListener('click', () => {
    _vistaSettimana = true
    btnSett.classList.add('active')
    btnOggi?.classList.remove('active')
    refresh()
  })

  container?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]')
    if (!button) return
    const id = button.dataset.id
    const action = button.dataset.action
    if (!id || !action) return

    if (action === 'status') {
      const newState = button.dataset.newstate
      const ok = await cambiaStatoIntervento(id, newState)
      if (ok) await refresh()
    }

    if (action === 'checklist') {
      const eventDetail = new CustomEvent('operatore:open-checklist', { detail: { interventoId: id } })
      window.dispatchEvent(eventDetail)
    }

    if (action === 'inserisci-ore') {
      await apriModaleOre(id, button.dataset.data)
    }
  })

  window.addEventListener('agenda:refresh', refresh)

  await refresh()
}
