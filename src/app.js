import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase.mjs'

let supabase

function warnIfMissingConfig(){
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
    const authError = document.getElementById('auth-error')
    if (authError) authError.textContent = 'config.js mancante o incompleto. Crealo seguendo README.'
    throw new Error('Missing Supabase config (SUPABASE_URL / SUPABASE_ANON_KEY)')
  }
}

function qs(sel){return document.querySelector(sel)}

async function init(){
  try{
    warnIfMissingConfig()
  }catch(e){
    return
  }

  supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

  // wire UI
  qs('#login-form').addEventListener('submit', onLogin)
  qs('#signup-btn').addEventListener('click', onSignUp)

  qs('#nav-right').addEventListener('click', (e)=>{
    if (e.target && e.target.id === 'signout') handleSignOut()
  })

  // auth state
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      loadProfile(session.user)
    } else {
      showAuth()
    }
  })

  // initial check
  const { data: { user } } = await supabase.auth.getUser().catch(()=>({data:{user:null}}))
  if (user) loadProfile(user)
  else showAuth()

  // icons
  if (window.lucide) window.lucide.replace()
}

function showAuth(){
  qs('#auth-section').classList.remove('hidden')
  qs('#dashboard').classList.add('hidden')
  qs('#nav-right').innerHTML = ''
}

function showDashboardForRole(role, user){
  qs('#auth-section').classList.add('hidden')
  qs('#dashboard').classList.remove('hidden')
  qs('#admin-dashboard').classList.toggle('hidden', role !== 'admin')
  qs('#operator-dashboard').classList.toggle('hidden', role !== 'operatore')

  qs('#nav-right').innerHTML = `<span class="muted">${user.email}</span> <button id="signout" class="btn ghost">Esci</button>`
  if (window.lucide) window.lucide.replace()
}

async function loadProfile(user){
  // assume a table `profiles` with primary key `id` (uuid) and column `role` (text)
  const { data, error } = await supabase.from('profiles').select('role,full_name').eq('id', user.id).single()
  if (error && error.code === 'PGRST116'){
    // table missing or RLS; still show basic UI
    showDashboardForRole('operatore', user)
    return
  }

  if (error){
    console.warn('Error fetching profile', error)
    showDashboardForRole('operatore', user)
    return
  }

  const role = data?.role || 'operatore'
  showDashboardForRole(role, user)
}

async function onLogin(e){
  e.preventDefault()
  const email = qs('#email').value
  const password = qs('#password').value
  qs('#auth-error').textContent = ''
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error){
    qs('#auth-error').textContent = error.message || 'Errore login'
    return
  }
  if (data?.user) loadProfile(data.user)
}

async function onSignUp(){
  const email = qs('#email').value
  const password = qs('#password').value
  if (!email || !password){ qs('#auth-error').textContent = 'Inserisci email e password per registrarti.'; return }
  qs('#auth-error').textContent = ''
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error){ qs('#auth-error').textContent = error.message; return }

  // if signUp returns user immediately (no email confirm) create profile
  const user = data.user
  if (user){
    await supabase.from('profiles').upsert({ id: user.id, role: 'operatore' })
    loadProfile(user)
  } else {
    qs('#auth-error').textContent = 'Registrazione inviata — controlla la tua casella (email confirm).' 
  }
}

async function handleSignOut(){
  await supabase.auth.signOut()
  showAuth()
}

// init on DOM
window.addEventListener('DOMContentLoaded', init)
