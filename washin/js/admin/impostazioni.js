import supabase from '../supabase.js'
import { showToast } from './clienti.js'

async function loadAzienda() {
  const { data, error } = await supabase.from('azienda').select('*').limit(1).single()
  if (error && error.code !== 'PGRST116') console.error('Errore caricamento azienda:', error)
  return data || null
}

async function saveAzienda(fields) {
  try {
    const { data: existing } = await supabase.from('azienda').select('id').limit(1).single()
    let error
    if (existing?.id) {
      ;({ error } = await supabase.from('azienda').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('azienda').insert(fields))
    }
    if (error) throw error
    showToast('Dati azienda salvati', 'success')
  } catch (err) {
    showToast('Errore salvataggio dati azienda', 'error')
    console.error(err)
  }
}

export function initImpostazioni() {
  const form = document.getElementById('azienda-form')
  if (!form) return

  loadAzienda().then(data => {
    if (!data) return
    const fields = ['ragione_sociale', 'piva', 'indirizzo', 'email', 'telefono', 'iban']
    fields.forEach(f => {
      const el = form.querySelector(`[name="${f}"]`)
      if (el) el.value = data[f] ?? ''
    })
  })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(form)
    await saveAzienda({
      ragione_sociale: fd.get('ragione_sociale') || null,
      piva:            fd.get('piva') || null,
      indirizzo:       fd.get('indirizzo') || null,
      email:           fd.get('email') || null,
      telefono:        fd.get('telefono') || null,
      iban:            fd.get('iban') || null,
    })
  })
}
