import supabase, { getUserProfile } from '../supabase.js'
import { checkAuth, logout } from '../auth.js'
import { initAgenda, loadInterventiPassati, renderInterventiPassati, refreshAgenda } from './agenda.js'
import { initChecklist, loadChecklistPerIntervento } from './checklist.js'

let _currentUserId = null

async function loadNotificheBadge(userId) {
  try {
    const { count, error } = await supabase.from('notifiche')
      .select('id', { count: 'exact' })
      .eq('utente_id', userId)
      .eq('letto', false)
    if (error) return
    const badge = document.getElementById('notifiche-badge')
    if (!badge) return
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count)
      badge.style.display = 'flex'
    } else {
      badge.style.display = 'none'
    }
  } catch { }
}

async function markNotificheRead(userId) {
  try {
    await supabase.from('notifiche').update({ letto: true }).eq('utente_id', userId).eq('letto', false)
    const badge = document.getElementById('notifiche-badge')
    if (badge) badge.style.display = 'none'
  } catch { }
}

let _storicoLoaded = false

function showSection(sectionId) {
  const sections = ['agenda', 'checklist', 'documenti', 'cedolini', 'storico', 'profilo']
  sections.forEach((id) => {
    const el = document.getElementById(id)
    if (!el) return
    el.classList.toggle('hidden', id !== sectionId)
    document.querySelectorAll(`[data-section="${id}"]`).forEach(link => {
      link.classList.toggle('active', id === sectionId)
    })
  })
  if (sectionId === 'agenda' && _currentUserId) markNotificheRead(_currentUserId)
  if (sectionId === 'storico' && !_storicoLoaded) {
    _storicoLoaded = true
    loadInterventiPassati().then(renderInterventiPassati)
  }
}

async function loadOperatorInfo() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session?.user) return null
    _currentUserId = data.session.user.id
    const profile = await getUserProfile(_currentUserId)
    if (profile) {
      const name = `${profile.nome || ''} ${profile.cognome || ''}`.trim() || 'Operatore'
      const nameEl = document.getElementById('operator-name')
      const greetingEl = document.getElementById('greeting-name')
      if (nameEl) nameEl.textContent = name
      if (greetingEl) greetingEl.textContent = name
    }
    await loadNotificheBadge(_currentUserId)
    return profile
  } catch (error) {
    console.error('loadOperatorInfo', error)
    return null
  }
}

function updateTodayDate() {
  const date = new Date()
  const formatted = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const todayEl = document.getElementById('today-date')
  if (todayEl) todayEl.textContent = formatted
}

function bindNavigation() {
  function handleNavClick(event) {
    const target = event.target.closest('a[data-section]')
    if (!target) return
    event.preventDefault()
    showSection(target.dataset.section)
  }

  document.getElementById('sidebar-nav')?.addEventListener('click', handleNavClick)
  document.getElementById('bottom-nav')?.addEventListener('click', handleNavClick)
}

function initProfilo(profile) {
  // Popola la card utente con i dati del profilo
  const nomeEl = document.getElementById('profilo-nome')
  const emailEl = document.getElementById('profilo-email')
  if (nomeEl && profile) {
    nomeEl.textContent = `${profile.nome || ''} ${profile.cognome || ''}`.trim() || 'Operatore'
  }
  if (emailEl && profile) {
    emailEl.textContent = profile.email || '—'
  }

  document.getElementById('form-cambia-email')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = e.target.querySelector('[name="new_email"]').value.trim()
    if (!email) return
    const { error } = await supabase.auth.updateUser({ email })
    if (error) {
      alert('Errore: ' + error.message)
    } else {
      alert('Controlla la tua nuova casella email per confermare il cambio.')
      e.target.reset()
    }
  })

  document.getElementById('form-cambia-password')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const pw = e.target.querySelector('[name="new_password"]').value
    const pw2 = e.target.querySelector('[name="confirm_password"]').value
    if (pw !== pw2) { alert('Le password non coincidono.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) {
      alert('Errore: ' + error.message)
    } else {
      alert('Password aggiornata con successo.')
      e.target.reset()
    }
  })
}

async function initDashboard() {
  await checkAuth()
  updateTodayDate()
  const profile = await loadOperatorInfo()
  bindNavigation()
  document.getElementById('logout')?.addEventListener('click', logout)
  showSection('agenda')
  await initAgenda()
  initChecklist()
  initProfilo(profile)

  document.getElementById('btn-back-agenda')?.addEventListener('click', () => showSection('agenda'))

  window.addEventListener('checklist:completata', () => {
    _storicoLoaded = false
    showSection('agenda')
    refreshAgenda()
  })

  document.getElementById('storico-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="checklist"]')
    if (!btn) return
    showSection('checklist')
    await loadChecklistPerIntervento(btn.dataset.id)
  })

  window.addEventListener('operatore:open-checklist', async (event) => {
    showSection('checklist')
    await loadChecklistPerIntervento(event.detail.interventoId)
  })

  if (window.lucide) lucide.replace()
}

export default initDashboard
