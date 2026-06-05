import supabase from '../supabase.js'
import { showToast } from './clienti.js'

export async function loadSedi(filtri = {}) {
  try {
    let q = supabase.from('sedi_cliente').select('*, contratti(numero_contratto, clienti(ragione_sociale))')
    if (filtri.contratto_id) q = q.eq('contratto_id', filtri.contratto_id)
    if (filtri.cliente_id) q = q.eq('cliente_id', filtri.cliente_id)
    const { data, error } = await q.order('nome_sede', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento sedi', 'error')
    console.error(err)
    return []
  }
}

function createSedeRow(s) {
  const contratto = s.contratti?.numero_contratto || '-'
  const cliente = s.contratti?.clienti?.ragione_sociale || '-'
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td>${s.nome_sede || '-'}</td>
    <td>${cliente}</td>
    <td>${contratto}</td>
    <td>${s.indirizzo || '-'}</td>
    <td>${s.piano || '-'}</td>
    <td>${s.mq_totali ?? '-'}</td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="edit-sede" data-id="${s.id}">Modifica</button>
    </td>
  `
  return tr
}

export function renderTabellaSedi(sedi) {
  try {
    const tbody = document.getElementById('sedi-table-body')
    if (!tbody) return
    tbody.innerHTML = ''
    if (!sedi.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">Nessuna sede</td></tr>'
      return
    }
    sedi.forEach(s => tbody.appendChild(createSedeRow(s)))
  } catch (err) {
    showToast('Errore render sedi', 'error')
    console.error(err)
  }
}

async function populateContrattiSelect(selectEl, selectedId = null) {
  const { data, error } = await supabase
    .from('contratti')
    .select('id, numero_contratto, clienti(ragione_sociale)')
    .eq('stato', 'attivo')
    .order('numero_contratto')
  if (error) return
  selectEl.innerHTML = '<option value="">-- Seleziona contratto --</option>'
  ;(data || []).forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = `${c.numero_contratto || c.id.slice(0,8)} — ${c.clienti?.ragione_sociale || ''}`
    if (selectedId && c.id === selectedId) opt.selected = true
    selectEl.appendChild(opt)
  })
}

export async function openModalSede(id = null) {
  try {
    const modal = document.getElementById('sede-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    const contrattoSelect = form.querySelector('[name="contratto_id"]')
    await populateContrattiSelect(contrattoSelect)

    if (id) {
      const { data, error } = await supabase.from('sedi_cliente').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (el) el.value = v ?? ''
      })
      if (contrattoSelect && data.contratto_id) contrattoSelect.value = data.contratto_id
      form.dataset.sedeId = id
      modal.querySelector('h2').textContent = 'Modifica Sede'
    } else {
      form.reset()
      delete form.dataset.sedeId
      modal.querySelector('h2').textContent = 'Nuova Sede'
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal sede', 'error')
    console.error(err)
  }
}

export async function saveSede(formData) {
  try {
    const fields = {
      contratto_id: formData.contratto_id || null,
      nome_sede: formData.nome_sede || null,
      indirizzo: formData.indirizzo || null,
      piano: formData.piano || null,
      mq_totali: formData.mq_totali ? parseFloat(formData.mq_totali) : null,
      note_accesso: formData.note_accesso || null,
    }
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('sedi_cliente').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('sedi_cliente').insert(fields))
    }
    if (error) throw error
    showToast('Sede salvata', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio sede', 'error')
    console.error(err)
    return null
  }
}

export function initSedi() {
  try {
    const addBtn = document.getElementById('add-sede-button')
    const modal = document.getElementById('sede-modal')
    const modalClose = modal?.querySelector('.btn-secondary')
    const form = modal?.querySelector('form')

    addBtn?.addEventListener('click', () => openModalSede())
    modalClose?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const payload = {
          id: form.dataset.sedeId || undefined,
          contratto_id: form.querySelector('[name="contratto_id"]').value,
          nome_sede: form.querySelector('[name="nome_sede"]').value,
          indirizzo: form.querySelector('[name="indirizzo"]').value,
          piano: form.querySelector('[name="piano"]').value,
          mq_totali: form.querySelector('[name="mq_totali"]').value,
          note_accesso: form.querySelector('[name="note_accesso"]').value,
        }
        await saveSede(payload)
        form.reset()
        delete form.dataset.sedeId
        modal.classList.remove('active')
        loadSedi().then(renderTabellaSedi)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-sede' && t.dataset.id) {
        await openModalSede(t.dataset.id)
      }
    })

    loadSedi().then(renderTabellaSedi)
  } catch (err) {
    showToast('Errore inizializzazione sedi', 'error')
    console.error(err)
  }
}
