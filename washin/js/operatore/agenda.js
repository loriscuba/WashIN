import supabase from '../supabase.js'

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
  return data.session.user.id
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

export async function loadInterventiOperatore(giorni = 1) {
  try {
    const operatoreId = await getOperatoreId()
    if (!operatoreId) return []
    const oggi = new Date()
    const fine = new Date(oggi)
    fine.setDate(oggi.getDate() + giorni - 1)
    const startDate = localDateStr(oggi)
    const endDate = localDateStr(fine)

    const { data, error } = await supabase
      .from('interventi')
      .select('*, sedi_cliente(nome_sede,indirizzo,clienti(ragione_sociale))')
      .eq('operatore_id', operatoreId)
      .gte('data_pianificata', startDate)
      .lte('data_pianificata', endDate)
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
    container.innerHTML = '<div class="intervento-card"><p style="margin:0;color:var(--gray-500);">Nessun intervento pianificato per questo periodo.</p></div>'
    return
  }

  interventi.forEach((iv) => {
    const card = document.createElement('div')
    card.className = 'intervento-card'
    const cliente = iv.sedi_cliente?.clienti?.ragione_sociale || 'Cliente sconosciuto'
    const sede = iv.sedi_cliente?.nome_sede || ''
    const indirizzo = iv.sedi_cliente?.indirizzo || ''
    const orario = iv.ora_inizio_pianificata
      ? `${iv.ora_inizio_pianificata}${iv.ora_fine_pianificata ? ' — ' + iv.ora_fine_pianificata : ''}`
      : 'Orario non definito'
    const mapsUrl = buildMapsUrl(indirizzo, '')
    const stato = iv.stato || 'pianificato'
    const actionLabel = stato === 'pianificato' ? 'Inizia' : stato === 'in_corso' ? 'Termina' : 'Vedi dettaglio'

    card.innerHTML = `
      <div class="meta">
        <div>
          <strong>${orario}</strong>
          <p style="margin:6px 0 0;color:var(--gray-700);font-weight:600;">${cliente}</p>
        </div>
        <span class="badge ${badgeForStato(stato)}">${stato}</span>
      </div>
      <div class="location">${sede}${indirizzo ? ' — ' + indirizzo : ''}</div>
      <div class="actions">
        <a class="btn btn-secondary btn-sm" href="${mapsUrl}" target="_blank" rel="noreferrer">Vai a Maps</a>
        <button class="btn btn-primary btn-sm" data-action="status" data-id="${iv.id}" data-newstate="${stato === 'pianificato' ? 'in_corso' : stato === 'in_corso' ? 'completato' : 'completato'}" type="button">${actionLabel}</button>
        <button class="btn btn-secondary btn-sm" data-action="checklist" data-id="${iv.id}" type="button">Compila checklist</button>
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

let currentDays = 1

export async function initAgenda() {
  const toggle = document.getElementById('toggle-week')
  const container = document.getElementById('agenda-cards')

  async function refresh() {
    const days = toggle?.checked ? 7 : 1
    currentDays = days
    const interventi = await loadInterventiOperatore(days)
    renderInterventi(interventi)
  }

  toggle?.addEventListener('change', refresh)

  container?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]')
    if (!button) return
    const id = button.dataset.id
    const action = button.dataset.action
    if (!id || !action) return

    if (action === 'status') {
      const newState = button.dataset.newstate
      const ok = await cambiaStatoIntervento(id, newState)
      if (ok) {
        await refresh()
      }
    }

    if (action === 'checklist') {
      const eventDetail = new CustomEvent('operatore:open-checklist', { detail: { interventoId: id } })
      window.dispatchEvent(eventDetail)
    }
  })

  await refresh()
}
