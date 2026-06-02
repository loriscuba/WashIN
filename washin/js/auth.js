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
}

window.addEventListener('DOMContentLoaded', checkSession)
