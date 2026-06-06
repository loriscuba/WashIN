import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const BUCKET = 'veicoli-docs'

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 864e5)
}

function scadenzaCell(dateStr) {
  if (!dateStr) return '-'
  const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT')
  const d = daysUntil(dateStr)
  if (d < 0) return `<span style="color:#dc2626;font-weight:600;" title="Scaduta">${label} ⚠</span>`
  if (d <= 30) return `<span style="color:#d97706;font-weight:600;" title="Scade tra ${d} giorni">${label} ⚠</span>`
  return label
}

export async function loadVeicoli(filtri = {}) {
  try {
    let q = supabase.from('veicoli').select('*').order('targa', { ascending: true })
    if (filtri.attivo !== undefined) q = q.eq('attivo', filtri.attivo)
    const { data, error } = await q
    if (error) throw error
    return data || []
  } catch(err) {
    showToast('Errore caricamento veicoli', 'error')
    console.error(err)
    return []
  }
}

function createVeicoloRow(v) {
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td><strong>${v.targa}</strong></td>
    <td>${[v.marca, v.modello].filter(Boolean).join(' ') || '-'}</td>
    <td>${v.anno || '-'}</td>
    <td>${v.km_attuali != null ? v.km_attuali + ' km' : '-'}</td>
    <td>${scadenzaCell(v.revisione_scadenza)}</td>
    <td>${scadenzaCell(v.assicurazione_scadenza)}</td>
    <td><span class="badge ${v.attivo ? 'badge-success' : 'badge-warning'}">${v.attivo ? 'Attivo' : 'Inattivo'}</span></td>
    <td style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" data-action="edit-veicolo" data-id="${v.id}">Modifica</button>
      <button class="btn btn-sm btn-secondary" data-action="documenti-veicolo" data-id="${v.id}" data-targa="${v.targa}">Documenti</button>
    </td>
  `
  return tr
}

export function renderTabellaVeicoli(veicoli) {
  const tbody = document.getElementById('veicoli-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!veicoli.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun veicolo registrato</td></tr>'
    return
  }
  veicoli.forEach(v => tbody.appendChild(createVeicoloRow(v)))
}

export async function openModalVeicolo(id = null) {
  try {
    const modal = document.getElementById('veicolo-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    if (id) {
      const { data, error } = await supabase.from('veicoli').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (!el) return
        if (el.type === 'checkbox') el.checked = Boolean(v)
        else el.value = v ?? ''
      })
      form.dataset.veicoloId = id
      modal.querySelector('h2').textContent = 'Modifica Veicolo'
    } else {
      form.reset()
      delete form.dataset.veicoloId
      modal.querySelector('h2').textContent = 'Nuovo Veicolo'
      const attivoEl = form.querySelector('[name="attivo"]')
      if (attivoEl) attivoEl.checked = true
    }
    modal.classList.add('active')
  } catch(err) {
    showToast('Errore apertura modal veicolo', 'error')
    console.error(err)
  }
}

export async function saveVeicolo(payload) {
  try {
    const fields = {
      targa: (payload.targa || '').toUpperCase().trim() || null,
      marca: payload.marca || null,
      modello: payload.modello || null,
      anno: payload.anno ? parseInt(payload.anno) : null,
      km_attuali: payload.km_attuali !== '' ? parseFloat(payload.km_attuali) : 0,
      revisione_scadenza: payload.revisione_scadenza || null,
      assicurazione_scadenza: payload.assicurazione_scadenza || null,
      note: payload.note || null,
      attivo: Boolean(payload.attivo)
    }
    let error
    if (payload.id) {
      ;({ error } = await supabase.from('veicoli').update(fields).eq('id', payload.id))
    } else {
      ;({ error } = await supabase.from('veicoli').insert(fields))
    }
    if (error) throw error
    showToast('Veicolo salvato', 'success')
    return true
  } catch(err) {
    showToast('Errore salvataggio veicolo', 'error')
    console.error(err)
    return null
  }
}

// ── Documenti ─────────────────────────────────────────────────────

async function renderDocumenti(veicoloId) {
  const list = document.getElementById('documenti-list')
  if (!list) return
  list.innerHTML = '<p style="color:var(--gray-500);font-size:13px;text-align:center;padding:12px;">Caricamento...</p>'
  const { data } = await supabase.from('veicoli_documenti')
    .select('*').eq('veicolo_id', veicoloId).order('created_at', { ascending: false })
  const docs = data || []
  if (!docs.length) {
    list.innerHTML = '<p style="color:var(--gray-500);font-size:13px;text-align:center;padding:16px;">Nessun documento caricato</p>'
    return
  }
  list.innerHTML = ''
  docs.forEach(doc => {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-200);gap:8px;'
    row.innerHTML = `
      <div style="min-width:0;">
        <span style="font-size:13px;font-weight:600;word-break:break-all;">${doc.nome_file}</span>
        <span class="badge badge-info" style="margin-left:8px;font-size:11px;">${doc.tipo}</span>
        <span style="display:block;font-size:11px;color:var(--gray-400);">${new Date(doc.created_at).toLocaleDateString('it-IT')}</span>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" data-action="download-doc" data-path="${doc.storage_path}" data-nome="${doc.nome_file}">⬇ Scarica</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" data-action="delete-doc" data-id="${doc.id}" data-path="${doc.storage_path}">✕</button>
      </div>
    `
    list.appendChild(row)
  })
}

export async function openDocumentiModal(veicoloId, targa) {
  const modal = document.getElementById('veicolo-documenti-modal')
  if (!modal) return
  modal.querySelector('h2').textContent = `Documenti — ${targa}`
  modal.dataset.veicoloId = veicoloId
  modal.classList.add('active')
  await renderDocumenti(veicoloId)
}

export function initVeicoli() {
  try {
    const addBtn = document.getElementById('add-veicolo-button')
    const modal = document.getElementById('veicolo-modal')
    const cancelBtn = document.getElementById('veicolo-cancel')
    const form = modal?.querySelector('form')
    const docModal = document.getElementById('veicolo-documenti-modal')
    const docClose = document.getElementById('documenti-close')
    const uploadForm = document.getElementById('upload-doc-form')
    const uploadProgress = document.getElementById('upload-progress')

    addBtn?.addEventListener('click', () => openModalVeicolo())
    cancelBtn?.addEventListener('click', () => modal?.classList.remove('active'))
    docClose?.addEventListener('click', () => docModal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)
        const payload = {
          id: form.dataset.veicoloId || undefined,
          targa: fd.get('targa'),
          marca: fd.get('marca'),
          modello: fd.get('modello'),
          anno: fd.get('anno'),
          km_attuali: fd.get('km_attuali'),
          revisione_scadenza: fd.get('revisione_scadenza'),
          assicurazione_scadenza: fd.get('assicurazione_scadenza'),
          note: fd.get('note'),
          attivo: form.querySelector('[name="attivo"]').checked
        }
        await saveVeicolo(payload)
        modal.classList.remove('active')
        loadVeicoli().then(renderTabellaVeicoli)
      })
    }

    if (uploadForm) {
      uploadForm.addEventListener('submit', async e => {
        e.preventDefault()
        const veicoloId = docModal?.dataset.veicoloId
        if (!veicoloId) return
        const fileInput = uploadForm.querySelector('[name="file"]')
        const tipoInput = uploadForm.querySelector('[name="tipo"]')
        const file = fileInput?.files?.[0]
        if (!file) { showToast('Seleziona un file', 'warning'); return }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${veicoloId}/${Date.now()}_${safeName}`
        if (uploadProgress) uploadProgress.textContent = 'Caricamento...'
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
        if (uploadProgress) uploadProgress.textContent = ''
        if (upErr) { showToast('Errore upload: ' + upErr.message, 'error'); return }
        const { error: dbErr } = await supabase.from('veicoli_documenti').insert({
          veicolo_id: veicoloId,
          nome_file: file.name,
          storage_path: path,
          tipo: tipoInput?.value || 'altro'
        })
        if (dbErr) { showToast('Errore salvataggio documento', 'error'); return }
        showToast('Documento caricato', 'success')
        uploadForm.reset()
        await renderDocumenti(veicoloId)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const action = t.dataset.action

      if (action === 'edit-veicolo' && t.dataset.id) {
        await openModalVeicolo(t.dataset.id)
      }
      if (action === 'documenti-veicolo' && t.dataset.id) {
        await openDocumentiModal(t.dataset.id, t.dataset.targa || '')
      }
      if (action === 'download-doc') {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(t.dataset.path, 120)
        if (data?.signedUrl) {
          const a = document.createElement('a'); a.href = data.signedUrl
          a.download = t.dataset.nome || 'documento'; a.target = '_blank'
          document.body.appendChild(a); a.click(); a.remove()
        } else { showToast('Errore generazione link', 'error') }
      }
      if (action === 'delete-doc') {
        if (!confirm('Eliminare questo documento?')) return
        await supabase.storage.from(BUCKET).remove([t.dataset.path])
        await supabase.from('veicoli_documenti').delete().eq('id', t.dataset.id)
        showToast('Documento eliminato', 'success')
        const vId = docModal?.dataset.veicoloId
        if (vId) await renderDocumenti(vId)
      }
    })

    loadVeicoli().then(renderTabellaVeicoli)
  } catch(err) {
    showToast('Errore inizializzazione veicoli', 'error')
    console.error(err)
  }
}
