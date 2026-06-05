import supabase, { getUserProfile } from '../supabase.js'
import { checkAuth, logout } from '../auth.js'
import { initAgenda } from './agenda.js'
import { initChecklist, loadChecklistPerIntervento } from './checklist.js'

function showSection(sectionId) {
  const sections = ['agenda', 'checklist', 'documenti', 'cedolini', 'profilo']
  sections.forEach((id) => {
    const el = document.getElementById(id)
    const link = document.querySelector(`[data-section="${id}"]`)
    if (!el || !link) return
    el.classList.toggle('hidden', id !== sectionId)
    link.classList.toggle('active', id === sectionId)
  })
}

async function loadOperatorInfo() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session?.user) return null
    const profile = await getUserProfile(data.session.user.id)
    if (profile) {
      const name = `${profile.nome || ''} ${profile.cognome || ''}`.trim() || 'Operatore'
      const nameEl = document.getElementById('operator-name')
      const greetingEl = document.getElementById('greeting-name')
      if (nameEl) nameEl.textContent = name
      if (greetingEl) greetingEl.textContent = name
    }
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
  const nav = document.getElementById('sidebar-nav')
  nav?.addEventListener('click', (event) => {
    const target = event.target.closest('a[data-section]')
    if (!target) return
    event.preventDefault()
    showSection(target.dataset.section)
  })

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('hidden')
  })

  document.getElementById('toggle-week')?.addEventListener('change', (event) => {
    document.getElementById('week-view')?.classList.toggle('hidden', !event.target.checked)
  })
}

function initProfilo() {
  document.getElementById('btn-profilo')?.addEventListener('click', () => showSection('profilo'))

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
  await loadOperatorInfo()
  bindNavigation()
  document.getElementById('logout')?.addEventListener('click', logout)
  showSection('agenda')
  await initAgenda()
  initChecklist()
  initProfilo()

  window.addEventListener('operatore:open-checklist', async (event) => {
    showSection('checklist')
    await loadChecklistPerIntervento(event.detail.interventoId)
  })

  if (window.lucide) lucide.replace()
}

export default initDashboard
