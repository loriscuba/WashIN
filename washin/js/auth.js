import supabase, { getUserProfile } from './supabase.js'

const form = document.getElementById('login-form')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const errorMsg = document.getElementById('error-msg')

async function redirectToDashboard(userId) {
  try {
    const profile = await getUserProfile(userId)
    const role = profile?.ruolo === 'admin' ? 'admin' : 'operatore'
    const target = role === 'admin' ? 'admin/dashboard.html' : 'operatore/dashboard.html'
    window.location.href = target
  } catch (error) {
    console.warn('Errore profilo:', error)
    window.location.href = 'operatore/dashboard.html'
  }
}

async function checkSession() {
  const { data } = await supabase.auth.getSession()
  if (data?.session?.user) {
    redirectToDashboard(data.session.user.id)
  }
}

async function handleLogin(event) {
  event.preventDefault()
  errorMsg.textContent = ''
  errorMsg.classList.remove('visible')

  const email = emailInput.value.trim()
  const password = passwordInput.value

  if (!email || !password) {
    errorMsg.textContent = 'Email o password non corretti'
    errorMsg.classList.add('visible')
    return
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data?.user) {
    errorMsg.textContent = 'Email o password non corretti'
    errorMsg.classList.add('visible')
    return
  }

  redirectToDashboard(data.user.id)
}

export async function logout() {
  await supabase.auth.signOut()
  window.location.href = '../index.html'
}

export async function checkAuth() {
  const { data } = await supabase.auth.getSession()
  if (!data?.session?.user) {
    window.location.href = '../index.html'
  }
}

if (form) {
  form.addEventListener('submit', handleLogin)

  window.addEventListener('DOMContentLoaded', () => {
    // Controlla se nell'hash c'è un token di recovery (da link email Supabase)
    const hash = window.location.hash
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    if (params.get('type') === 'recovery' && params.get('access_token')) {
      showNewPasswordPanel()
    } else {
      checkSession()
    }
  })

  // "Password dimenticata?" → mostra info contatto admin
  document.getElementById('forgot-link')?.addEventListener('click', e => {
    e.preventDefault()
    form.style.display = 'none'
    document.getElementById('reset-panel').style.display = ''
  })

  document.getElementById('back-to-login')?.addEventListener('click', e => {
    e.preventDefault()
    document.getElementById('reset-panel').style.display = 'none'
    form.style.display = ''
  })

  // Pannello imposta nuova password (da link recovery)
  document.getElementById('new-password-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const pw  = document.getElementById('new-pw').value
    const pw2 = document.getElementById('confirm-pw').value
    const msg = document.getElementById('new-pw-msg')
    if (pw !== pw2) { msg.textContent = 'Le password non coincidono.'; msg.classList.add('visible'); return }
    if (pw.length < 8) { msg.textContent = 'Minimo 8 caratteri.'; msg.classList.add('visible'); return }
    const btn = e.target.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.textContent = 'Salvataggio...'
    const { error } = await supabase.auth.updateUser({ password: pw })
    btn.disabled = false
    btn.textContent = 'Imposta password'
    if (error) {
      msg.textContent = 'Errore: ' + error.message
      msg.classList.add('visible')
    } else {
      msg.style.color = '#059669'
      msg.textContent = 'Password aggiornata! Accedi con le nuove credenziali.'
      msg.classList.add('visible')
      btn.style.display = 'none'
      // Pulisce l'hash dall'URL
      history.replaceState(null, '', window.location.pathname)
    }
  })
}

function showNewPasswordPanel() {
  if (form) form.style.display = 'none'
  document.getElementById('reset-panel').style.display = 'none'
  document.getElementById('new-password-panel').style.display = ''
}
