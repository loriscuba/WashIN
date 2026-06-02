import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

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
    .select('nome,cognome,ruolo')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}
