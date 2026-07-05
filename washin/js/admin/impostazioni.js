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

async function setImpostazione(chiave, valore) {
  const { error } = await supabase.from('impostazioni')
    .upsert({ chiave, valore: String(valore) }, { onConflict: 'chiave' })
  if (error) throw error
}

async function getImpostazione(chiave) {
  const { data } = await supabase.from('impostazioni').select('valore').eq('chiave', chiave).maybeSingle()
  return data?.valore ?? null
}

function updateModalitaCards(isOrario) {
  const classicaCard = document.getElementById('mode-classica-card')
  const orarioCard   = document.getElementById('mode-orario-card')
  if (!classicaCard || !orarioCard) return
  if (isOrario) {
    classicaCard.style.border = '2px solid var(--gray-200)'
    classicaCard.style.background = '#fafafa'
    classicaCard.querySelector('p').style.color = 'var(--gray-500)'
    orarioCard.style.border = '2px solid #0d9488'
    orarioCard.style.background = '#f0fdfa'
    orarioCard.querySelector('p').style.color = '#0d9488'
  } else {
    classicaCard.style.border = '2px solid #0d9488'
    classicaCard.style.background = '#f0fdfa'
    classicaCard.querySelector('p').style.color = '#0d9488'
    orarioCard.style.border = '2px solid var(--gray-200)'
    orarioCard.style.background = '#fafafa'
    orarioCard.querySelector('p').style.color = 'var(--gray-500)'
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

  // Modalità interventi operatrice
  const toggleOrario = document.getElementById('impost-modalita-orario')
  if (toggleOrario) {
    getImpostazione('modalita_intervento').then(val => {
      const isOrario = val === 'orario'
      toggleOrario.checked = isOrario
      updateModalitaCards(isOrario)
    })
    toggleOrario.addEventListener('change', async () => {
      const val = toggleOrario.checked ? 'orario' : 'classica'
      try {
        await setImpostazione('modalita_intervento', val)
        updateModalitaCards(toggleOrario.checked)
        showToast(`Modalità impostata: ${val}`, 'success')
      } catch (err) {
        showToast('Errore salvataggio modalità', 'error')
        console.error(err)
      }
    })
  }
}
