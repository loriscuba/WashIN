import supabase from '../supabase.js'
import { showToast } from './clienti.js'

export async function loadPreventivi(filtri = {}) {
  try {
    let query = supabase.from('preventivi').select('*, clienti(id,ragione_sociale,indirizzo,citta,cap,email,telefono,piva,cf)')
    if (filtri.stato) query = query.eq('stato', filtri.stato)
    if (filtri.cliente_id) query = query.eq('cliente_id', filtri.cliente_id)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento preventivi', 'error')
    console.error(err)
    return []
  }
}

const BADGE_STATO = {
  bozza: 'badge-warning',
  inviato: 'badge-info',
  accettato: 'badge-success',
  rifiutato: 'badge-danger',
  scaduto: 'badge-danger',
  convertito: 'badge-info'
}

export function renderTabellaPreventivi(preventivi) {
  const tbody = document.getElementById('preventivi-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!preventivi.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun preventivo</td></tr>'
    return
  }
  const fmt = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0)
  preventivi.forEach(p => {
    const tr = document.createElement('tr')
    const badge = BADGE_STATO[p.stato] || 'badge-warning'
    const convertBtn = (p.stato === 'accettato')
      ? `<button class="btn btn-sm btn-primary" data-action="converti-preventivo" data-id="${p.id}">→ Contratto</button>`
      : ''
    tr.innerHTML = `
      <td>${p.numero_preventivo || '-'}</td>
      <td>${p.clienti?.ragione_sociale || '-'}</td>
      <td>${p.data_emissione || '-'}</td>
      <td>${p.data_validita || '-'}</td>
      <td>${fmt(p.importo)}</td>
      <td><span class="badge ${badge}">${p.stato}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" data-action="edit-preventivo" data-id="${p.id}">Modifica</button>
        <button class="btn btn-sm btn-secondary" data-action="print-preventivo" data-id="${p.id}">🖨 Stampa</button>
        ${convertBtn}
      </td>
    `
    tbody.appendChild(tr)
  })
}

async function populateClientiSelect(selectEl, selectedId = null) {
  const { data } = await supabase.from('clienti').select('id,ragione_sociale').eq('attivo', true).order('ragione_sociale')
  selectEl.innerHTML = '<option value="">-- Seleziona cliente --</option>'
  ;(data || []).forEach(c => {
    const o = document.createElement('option')
    o.value = c.id
    o.textContent = c.ragione_sociale
    if (selectedId && c.id === selectedId) o.selected = true
    selectEl.appendChild(o)
  })
}

export async function openModalPreventivo(id = null) {
  try {
    const modal = document.getElementById('preventivo-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    const clienteSelect = form.querySelector('[name="cliente_id"]')
    if (clienteSelect) await populateClientiSelect(clienteSelect)

    if (id) {
      const { data, error } = await supabase.from('preventivi').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (el) el.value = v ?? ''
      })
      if (clienteSelect && data.cliente_id) clienteSelect.value = data.cliente_id
      form.dataset.preventivoId = id
      modal.querySelector('h2').textContent = 'Modifica Preventivo'
    } else {
      form.reset()
      delete form.dataset.preventivoId
      modal.querySelector('h2').textContent = 'Nuovo Preventivo'
      const emissEl = form.querySelector('[name="data_emissione"]')
      if (emissEl) emissEl.value = new Date().toISOString().slice(0, 10)
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal preventivo', 'error')
    console.error(err)
  }
}

export async function savePreventivo(formData) {
  try {
    const fields = {
      cliente_id: formData.cliente_id || null,
      numero_preventivo: formData.numero_preventivo || null,
      data_emissione: formData.data_emissione || null,
      data_validita: formData.data_validita || null,
      importo: formData.importo ? parseFloat(formData.importo) : 0,
      ore_stimate: formData.ore_stimate ? parseFloat(formData.ore_stimate) : 0,
      tipo_servizio: formData.tipo_servizio || null,
      frequenza: formData.frequenza || 'settimanale',
      stato: formData.stato || 'bozza',
      note: formData.note || null,
    }
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('preventivi').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('preventivi').insert(fields))
    }
    if (error) throw error
    showToast('Preventivo salvato', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio preventivo', 'error')
    console.error(err)
    return null
  }
}

export async function printPreventivo(id) {
  try {
    const { data: p, error } = await supabase
      .from('preventivi')
      .select('*, clienti(ragione_sociale,indirizzo,citta,cap,email,telefono,piva,cf)')
      .eq('id', id).single()
    if (error) throw error

    const fmt = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0)
    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT') : '-'
    const c = p.clienti || {}
    const iva = (p.importo || 0) * 0.22
    const totale = (p.importo || 0) + iva

    const clienteLines = [
      c.ragione_sociale,
      c.indirizzo,
      [c.cap, c.citta].filter(Boolean).join(' '),
      c.piva ? `P.IVA: ${c.piva}` : '',
      c.cf ? `C.F.: ${c.cf}` : '',
      c.email,
      c.telefono
    ].filter(Boolean).join('<br>')

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Preventivo ${p.numero_preventivo || ''} — WashIN</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #0D9488; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #0D9488; letter-spacing: -1px; }
    .logo span { color: #111; }
    .company-info { font-size: 11px; color: #555; text-align: right; line-height: 1.6; }
    .doc-title { font-size: 22px; font-weight: 700; color: #0D9488; margin-bottom: 6px; }
    .doc-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; }
    .meta-box h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: .5px; }
    .meta-box p { line-height: 1.7; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    thead tr { background: #0D9488; color: #fff; }
    th { padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; }
    td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }
    .total-row td { font-weight: 700; background: #f0fdf4; border-top: 2px solid #0D9488; font-size: 14px; }
    .notes { margin-top: 20px; padding: 14px 18px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; }
    .notes h3 { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #92400e; margin-bottom: 6px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; }
    .sign-box { text-align: center; }
    .sign-line { width: 180px; border-bottom: 1px solid #111; margin: 40px auto 6px; }
    .sign-label { font-size: 11px; color: #6b7280; }
    .validity { font-size: 11px; color: #6b7280; margin-top: 8px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-bozza { background:#fef3c7;color:#92400e; }
    .badge-inviato { background:#dbeafe;color:#1e40af; }
    .badge-accettato { background:#d1fae5;color:#065f46; }
    @media print {
      body { padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Wash<span>IN</span></div>
      <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6;">
        Servizi di pulizia professionale<br>
        info@washin.it
      </div>
    </div>
    <div class="company-info">
      <strong style="font-size:16px;color:#111;">${p.numero_preventivo || 'PREVENTIVO'}</strong><br>
      Data: ${fmtDate(p.data_emissione)}<br>
      Validità fino al: ${fmtDate(p.data_validita)}<br>
      <span class="badge badge-${p.stato || 'bozza'}">${p.stato || 'bozza'}</span>
    </div>
  </div>

  <div class="doc-title">Preventivo</div>

  <div class="doc-meta">
    <div class="meta-box">
      <h3>Destinatario</h3>
      <p>${clienteLines || '-'}</p>
    </div>
    <div class="meta-box">
      <h3>Dettagli offerta</h3>
      <p>
        <strong>Tipo servizio:</strong> ${p.tipo_servizio || '-'}<br>
        <strong>Frequenza:</strong> ${p.frequenza || '-'}<br>
        <strong>Ore stimate/mese:</strong> ${p.ore_stimate ? p.ore_stimate + ' h' : '-'}
      </p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50%">Descrizione servizio</th>
        <th>Frequenza</th>
        <th>Ore/mese</th>
        <th style="text-align:right">Importo</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${p.tipo_servizio || 'Servizio di pulizia professionale'}</td>
        <td>${p.frequenza || '-'}</td>
        <td>${p.ore_stimate ? p.ore_stimate + ' h' : '-'}</td>
        <td style="text-align:right">${fmt(p.importo)}</td>
      </tr>
      <tr>
        <td colspan="3" style="text-align:right;color:#6b7280;">IVA 22%</td>
        <td style="text-align:right;color:#6b7280;">${fmt(iva)}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" style="text-align:right;">TOTALE</td>
        <td style="text-align:right;color:#0D9488;">${fmt(totale)}</td>
      </tr>
    </tbody>
  </table>

  ${p.note ? `<div class="notes"><h3>Note</h3><p>${p.note.replace(/\n/g,'<br>')}</p></div>` : ''}

  <div class="footer">
    <div>
      <p class="validity">Il presente preventivo è valido fino al <strong>${fmtDate(p.data_validita)}</strong>.</p>
      <p class="validity" style="margin-top:4px;">Per accettazione rispondere via email o firmare e restituire il documento.</p>
    </div>
    <div style="display:flex;gap:40px;">
      <div class="sign-box">
        <div class="sign-line"></div>
        <div class="sign-label">WashIN — Timbro e firma</div>
      </div>
      <div class="sign-box">
        <div class="sign-line"></div>
        <div class="sign-label">Cliente — Per accettazione</div>
      </div>
    </div>
  </div>

  <script>window.onload = () => window.print()<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { showToast('Popup bloccato — consenti popup per stampare', 'warning'); return }
    win.document.write(html)
    win.document.close()
  } catch (err) {
    showToast('Errore stampa preventivo', 'error')
    console.error(err)
  }
}

export async function convertiInContratto(preventivoId) {
  try {
    const { data: prev, error: errPrev } = await supabase.from('preventivi').select('*').eq('id', preventivoId).single()
    if (errPrev) throw errPrev

    const num = `CNTR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error: errContr } = await supabase.from('contratti').insert({
      cliente_id: prev.cliente_id,
      numero_contratto: num,
      tipo: 'ricorrente',
      importo_mensile: prev.importo,
      ore_contratto_mensili: prev.ore_stimate,
      frequenza: prev.frequenza || 'settimanale',
      stato: 'attivo',
      data_inizio: prev.data_emissione,
      note: `Da preventivo ${prev.numero_preventivo || ''}${prev.note ? ': ' + prev.note : ''}`
    })
    if (errContr) throw errContr

    await supabase.from('preventivi').update({ stato: 'convertito' }).eq('id', preventivoId)
    showToast('Contratto creato dal preventivo!', 'success')
    return true
  } catch (err) {
    showToast('Errore conversione preventivo', 'error')
    console.error(err)
    return null
  }
}

export function initPreventivi() {
  try {
    const addBtn = document.getElementById('add-preventivo-button')
    const modal = document.getElementById('preventivo-modal')
    const form = modal?.querySelector('form')
    const cancelBtn = document.getElementById('preventivo-cancel')

    addBtn?.addEventListener('click', () => openModalPreventivo())
    cancelBtn?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)
        const payload = {
          id: form.dataset.preventivoId || undefined,
          cliente_id: fd.get('cliente_id'),
          numero_preventivo: fd.get('numero_preventivo'),
          data_emissione: fd.get('data_emissione'),
          data_validita: fd.get('data_validita'),
          importo: fd.get('importo'),
          ore_stimate: fd.get('ore_stimate'),
          tipo_servizio: fd.get('tipo_servizio'),
          frequenza: fd.get('frequenza'),
          stato: fd.get('stato'),
          note: fd.get('note'),
        }
        await savePreventivo(payload)
        modal.classList.remove('active')
        loadPreventivi().then(renderTabellaPreventivi)
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-preventivo' && t.dataset.id) {
        await openModalPreventivo(t.dataset.id)
      }
      if (t.dataset.action === 'print-preventivo' && t.dataset.id) {
        await printPreventivo(t.dataset.id)
      }
      if (t.dataset.action === 'converti-preventivo' && t.dataset.id) {
        if (confirm('Creare un contratto da questo preventivo?')) {
          await convertiInContratto(t.dataset.id)
          loadPreventivi().then(renderTabellaPreventivi)
        }
      }
    })

    loadPreventivi().then(renderTabellaPreventivi)
  } catch (err) {
    showToast('Errore inizializzazione preventivi', 'error')
    console.error(err)
  }
}
