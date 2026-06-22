import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = window.SUPABASE_URL
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const errorDiv = document.getElementById('error-msg')
  if (errorDiv) {
    errorDiv.textContent = 'Errore: configurazione Supabase mancante. Verifica che washin/js/config.js sia presente e accessibile.'
    errorDiv.style.display = 'block'
  }
  throw new Error('Supabase config missing. Ensure washin/js/config.js defines window.SUPABASE_URL and window.SUPABASE_ANON_KEY.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default supabase

export async function getUser(){
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

export async function getUserProfile(userId){
  if (!userId) return null
  const { data, error } = await supabase
    .from('profili')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) throw error
  return data
}
