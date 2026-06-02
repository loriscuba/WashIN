import supabase from '../supabase.js'
import { showToast } from './clienti.js'

export async function loadOperatori() {
  try {
    const { data, error } = await supabase.from('profili').select('*').order('nome', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento operatori', 'error')
    console.error(err)
    return []
  }
}

function createOperatoreRow(op) {
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td>${op.nome || ''} ${op.cognome || ''}</td>
    <td>${op.email || ''}</td>
    <td>${op.telefono || ''}</td>
    <td>${op.qualifica || ''}</td>
    <td>${op.attivo ? 'Sì' : 'No'}</td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${op.id}">Modifica</button>
      <button class="btn btn-sm btn-danger" data-action="toggle" data-id="${op.id}" data-active="${op.attivo}">${op.attivo ? 'Disattiva' : 'Attiva'}</button>
    </td>
  `
  return tr
}

export function renderTabellaOperatori(operatori) {
  try {
    const container = document.querySelector('#operatori-table-body')
    if (!container) return
    container.innerHTML = ''
    operatori.forEach((op) => container.appendChild(createOperatoreRow(op)))
  } catch (err) {
    showToast('Errore render tabella operatori', 'error')
    console.error(err)
  }
}

export async function openModalOperatore(id = null) {
  try {
    const modal = document.getElementById('operatore-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return
    if (id) {
      const { data, error } = await supabase.from('profili').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const f = form.querySelector(`[name="${k}"]`)
        if (f) f.value = v ?? ''
      })
      form.dataset.operatoreId = id
    } else {
      form.reset()
      delete form.dataset.operatoreId
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal operatore', 'error')
    console.error(err)
  }
}

export async function saveOperatore(payload) {
  try {
    const up = {
      id: payload.id || undefined,
      nome: payload.nome,
      cognome: payload.cognome,
      email: payload.email,
      telefono: payload.telefono,
      qualifica: payload.qualifica,
      attivo: payload.attivo !== undefined ? payload.attivo : true,
      ruolo: payload.ruolo || 'operatore'
    }
    const { data, error } = await supabase.from('profili').upsert(up, { returning: 'representation' })
    if (error) throw error
    showToast('Operatore salvato', 'success')
    return data?.[0] || null
  } catch (err) {
    showToast('Errore salvataggio operatore', 'error')
    console.error(err)
    return null
  }
}

export async function toggleAttivoOperatore(id, attivo) {
  try {
    const { error } = await supabase.from('profili').update({ attivo }).eq('id', id)
    if (error) throw error
    showToast(`Operatore ${attivo ? 'attivato' : 'disattivato'}`, 'success')
  } catch (err) {
    showToast('Errore aggiornamento stato operatore', 'error')
    console.error(err)
  }
}

export function initOperatori() {
  try {
    const addBtn = document.getElementById('add-operatore-button')
    const modalClose = document.querySelector('#operatore-modal .btn-secondary')
    const form = document.querySelector('#operatore-modal form')

    addBtn?.addEventListener('click', () => openModalOperatore())
    modalClose?.addEventListener('click', () => document.getElementById('operatore-modal')?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const payload = {
          id: form.dataset.operatoreId || undefined,
          nome: form.querySelector('[name="nome"]').value,
          cognome: form.querySelector('[name="cognome"]').value,
          email: form.querySelector('[name="email"]').value,
          telefono: form.querySelector('[name="telefono"]').value,
          qualifica: form.querySelector('[name="qualifica"]').value,
          attivo: form.querySelector('[name="attivo"]').checked,
          ruolo: form.querySelector('[name="ruolo"]')?.value || 'operatore'
        }
        await saveOperatore(payload)
        form.reset()
        delete form.dataset.operatoreId
        document.getElementById('operatore-modal')?.classList.remove('active')
        const operatori = await loadOperatori()
        renderTabellaOperatori(operatori)
      })
    }

    document.addEventListener('click', async (e) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const action = t.dataset.action
      const id = t.dataset.id
      if (!action || !id) return
      if (action === 'edit') await openModalOperatore(id)
      if (action === 'toggle') {
        const isActive = t.dataset.active === 'true'
        await toggleAttivoOperatore(id, !isActive)
        const operatori = await loadOperatori()
        renderTabellaOperatori(operatori)
      }
    })

    // initial load
    loadOperatori().then(renderTabellaOperatori)
  } catch (err) {
    showToast('Errore inizializzazione operatori', 'error')
    console.error(err)
  }
}
// admin/operatori.js - placeholder
// Funzioni per gestione operatori
