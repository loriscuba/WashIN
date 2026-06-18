import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

const STATO_BADGE = { caricata: 'badge-warning', verificata: 'badge-info', pagata: 'badge-success' }

const FMT_EUR = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0)

let _currentOpId = null
let _operatori = []

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadOperatoriHR() {
  try {
    const { data, error } = await supabase
      .from('profili')
      .select(`
        id, nome, cognome, qualifica, attivo, matricola,
        tipo_contratto, paga_base, costo_mensile,
        buste_paga(id, anno, mese, totale_netto, totale_lordo, stato)
      `)
      .order('cognome', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento operatori', 'error')
    console.error(err)
    return []
  }
}

// ── Render table ─────────────────────────────────────────────────────────────

function renderTabellaHR(operatori) {
  const tbody = document.getElementById('hr-operatori-body')
  if (!tbody) return

  const q = (document.getElementById('hr-search')?.value || '').toLowerCase()
  const filtered = operatori.filter(op =>
    !q || `${op.cognome || ''} ${op.nome || ''} ${op.qualifica || ''}`.toLowerCase().includes(q)
  )

  tbody.innerHTML = ''
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun operatore trovato</td></tr>'
    return
  }

  filtered.forEach(op => {
    const buste = (op.buste_paga || []).sort((a, b) =>
      b.anno !== a.anno ? b.anno - a.anno : b.mese - a.mese
    )
    const latest = buste[0]
    const isAttivo = op.attivo !== false

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>
        <strong>${op.cognome || ''} ${op.nome || ''}</strong>
        ${op.matricola ? `<br><span style="font-size:11px;color:var(--gray-400);">Matr. ${op.matricola}</span>` : ''}
        ${!isAttivo ? '<span class="badge badge-danger" style="margin-left:6px;font-size:10px;">Inattivo</span>' : ''}
      </td>
      <td>${op.qualifica || '-'}</td>
      <td>${op.tipo_contratto ? op.tipo_contratto.replace('_', '-') : '-'}</td>
      <td>${op.paga_base ? FMT_EUR(op.paga_base) : '-'}</td>
      <td>
        ${latest
          ? `<span class="badge ${STATO_BADGE[latest.stato] || 'badge-warning'}">${MESI[latest.mese - 1]} ${latest.anno}</span>`
          : '<span style="color:var(--gray-400);font-size:12px;">—</span>'}
      </td>
      <td>
        <button class="btn btn-sm btn-secondary" data-action="hr-open" data-id="${op.id}">Gestisci</button>
      </td>
    `
    tbody.appendChild(tr)
  })
}

// ── Main modal ────────────────────────────────────────────────────────────────

async function openModalAnag(operatoreId) {
  _currentOpId = operatoreId
  const modal = document.getElementById('hr-anag-modal')
  if (!modal) return

  try {
    const { data, error } = await supabase
      .from('profili')
      .select('*')
      .eq('id', operatoreId)
      .single()
    if (error) throw error

    const title = document.getElementById('hr-modal-title')
    if (title) title.textContent = `Anagrafica — ${data.cognome || ''} ${data.nome || ''}`

    const datiForm = document.getElementById('hr-dati-form')
    if (datiForm) {
      ;['nome','cognome','email','codice_fiscale','telefono','data_assunzione','matricola','iban_dipendente','note_hr']
        .forEach(f => { const el = datiForm.querySelector(`[name="${f}"]`); if (el) el.value = data[f] ?? '' })
    }

    const retribForm = document.getElementById('hr-retrib-form')
    if (retribForm) {
      ;['ccnl','categoria_lavorativa','tipo_contratto','data_scadenza_contratto']
        .forEach(f => { const el = retribForm.querySelector(`[name="${f}"]`); if (el) el.value = data[f] ?? '' })
      ;['paga_base','scatti_anzianita','indennita','costo_mensile','ore_mensili_contratto']
        .forEach(f => { const el = retribForm.querySelector(`[name="${f}"]`); if (el) el.value = data[f] ?? '' })
    }

    setTab('dati')
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura anagrafica', 'error')
    console.error(err)
  }
}

function setTab(tabName) {
  const modal = document.getElementById('hr-anag-modal')
  if (!modal) return
  modal.querySelectorAll('.hr-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabName
    btn.style.cssText = `padding:8px 18px;border:none;background:none;font-weight:600;font-size:13px;cursor:pointer;
      border-bottom:2px solid ${active ? '#0d9488' : 'transparent'};margin-bottom:-2px;
      color:${active ? '#0d9488' : 'var(--gray-500)'};transition:all .15s;`
  })
  modal.querySelectorAll('.hr-tab-content').forEach(p => p.classList.toggle('hidden', p.dataset.tab !== tabName))

  const saveBtn = document.getElementById('hr-save-btn')
  if (saveBtn) saveBtn.style.display = tabName === 'buste' ? 'none' : ''

  if (tabName === 'buste' && _currentOpId) loadBustePagaTab(_currentOpId)
}

// ── Save personal / salary data ──────────────────────────────────────────────

async function saveDatiPersonali() {
  if (!_currentOpId) return
  try {
    const fields = {}
    const datiForm = document.getElementById('hr-dati-form')
    if (datiForm) {
      ;['nome','cognome','email','codice_fiscale','telefono','data_assunzione','matricola','iban_dipendente','note_hr']
        .forEach(f => { const el = datiForm.querySelector(`[name="${f}"]`); if (el) fields[f] = el.value || null })
    }
    const retribForm = document.getElementById('hr-retrib-form')
    if (retribForm) {
      ;['ccnl','categoria_lavorativa','tipo_contratto','data_scadenza_contratto']
        .forEach(f => { const el = retribForm.querySelector(`[name="${f}"]`); if (el) fields[f] = el.value || null })
      ;['paga_base','scatti_anzianita','indennita','costo_mensile','ore_mensili_contratto']
        .forEach(f => { const el = retribForm.querySelector(`[name="${f}"]`); if (el) fields[f] = el.value ? parseFloat(el.value) : null })
    }
    const { error } = await supabase.from('profili').update(fields).eq('id', _currentOpId)
    if (error) throw error
    showToast('Dati salvati', 'success')
    _operatori = await loadOperatoriHR()
    renderTabellaHR(_operatori)
  } catch (err) {
    showToast('Errore salvataggio', 'error')
    console.error(err)
  }
}

// ── Buste paga tab ────────────────────────────────────────────────────────────

async function loadBustePagaTab(operatoreId) {
  const container = document.getElementById('hr-buste-list')
  if (!container) return
  container.innerHTML = '<p style="color:var(--gray-500);font-size:13px;padding:8px 0;">Caricamento...</p>'

  try {
    const { data, error } = await supabase
      .from('buste_paga')
      .select('*')
      .eq('operatore_id', operatoreId)
      .order('anno', { ascending: false })
      .order('mese', { ascending: false })
    if (error) throw error
    renderBustePagaList(data || [])
  } catch (err) {
    container.innerHTML = '<p style="color:#dc2626;">Errore caricamento buste paga</p>'
    console.error(err)
  }
}

function renderBustePagaList(buste) {
  const container = document.getElementById('hr-buste-list')
  if (!container) return

  if (!buste.length) {
    container.innerHTML = '<p style="color:var(--gray-500);font-size:13px;padding:8px 0 12px;">Nessuna busta paga caricata</p>'
    return
  }

  container.innerHTML = `
    <div style="overflow-x:auto;margin-bottom:12px;">
      <table class="washin-table">
        <thead>
          <tr>
            <th>Mese / Anno</th>
            <th>Lordo</th>
            <th>Netto</th>
            <th>TFR mese</th>
            <th>Costo az.</th>
            <th>Stato</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          ${buste.map(b => `
            <tr>
              <td><strong>${MESI[b.mese - 1]} ${b.anno}</strong></td>
              <td>${FMT_EUR(b.totale_lordo)}</td>
              <td>${FMT_EUR(b.totale_netto)}</td>
              <td>${FMT_EUR(b.tfr_mese)}</td>
              <td>${FMT_EUR(b.costo_aziendale)}</td>
              <td><span class="badge ${STATO_BADGE[b.stato] || 'badge-warning'}">${b.stato}</span></td>
              <td style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" data-action="hr-edit-busta" data-id="${b.id}">Modifica</button>
                ${b.file_path ? `<button class="btn btn-sm btn-secondary" data-action="hr-download" data-path="${b.file_path}">📎 PDF</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

// ── Busta paga modal ──────────────────────────────────────────────────────────

async function openModalBusta(bustaId = null) {
  const modal = document.getElementById('hr-busta-modal')
  if (!modal || !_currentOpId) return
  const form = document.getElementById('hr-busta-form')
  if (!form) return

  form.reset()
  delete form.dataset.bustaId

  if (bustaId) {
    try {
      const { data, error } = await supabase.from('buste_paga').select('*').eq('id', bustaId).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (el && v !== null) el.value = v
      })
      form.dataset.bustaId = bustaId
      document.getElementById('hr-busta-title').textContent = `Busta paga — ${MESI[data.mese - 1]} ${data.anno}`
    } catch (err) {
      showToast('Errore caricamento busta', 'error')
      return
    }
  } else {
    const now = new Date()
    const meseEl = form.querySelector('[name="mese"]')
    const annoEl = form.querySelector('[name="anno"]')
    if (meseEl) meseEl.value = now.getMonth() + 1
    if (annoEl) annoEl.value = now.getFullYear()

    // Pre-fill paga_base from profili
    const op = _operatori.find(o => o.id === _currentOpId)
    if (op?.paga_base) {
      const pbEl = form.querySelector('[name="paga_base"]')
      if (pbEl) { pbEl.value = op.paga_base; ricalcola(form) }
    }
    document.getElementById('hr-busta-title').textContent = 'Nuova busta paga'
  }

  modal.classList.add('active')
}

function ricalcola(form) {
  const g = name => parseFloat(form.querySelector(`[name="${name}"]`)?.value || 0)
  const s = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el && !el.dataset.manual) el.value = val.toFixed(2) }

  const lordo = ['paga_base','contingenza','edr','superminimo','scatti_anzianita',
                  'straordinari_imp','indennita_varie','altri_elementi']
    .reduce((sum, f) => sum + g(f), 0)
  s('totale_lordo', lordo)

  const ritenute = g('contributi_inps_dip') + g('irpef') + g('addizionali') + g('altre_ritenute')
  s('totale_ritenute', ritenute)
  s('totale_netto', Math.max(0, lordo - ritenute))

  if (!g('tfr_mese')) s('tfr_mese', lordo / 13.5)

  s('costo_aziendale', lordo + g('contributi_inps_az') + g('inail') + g('tfr_mese'))
}

async function saveBustaPaga() {
  const modal = document.getElementById('hr-busta-modal')
  if (!modal || !_currentOpId) return
  const form = document.getElementById('hr-busta-form')
  if (!form) return

  const bustaId = form.dataset.bustaId

  // Upload file
  let filePath = bustaId ? (form.querySelector('[name="file_path_current"]')?.value || null) : null
  const fileInput = form.querySelector('[name="file"]')
  const file = fileInput?.files?.[0]
  if (file) {
    try {
      const anno = form.querySelector('[name="anno"]')?.value
      const mese = String(form.querySelector('[name="mese"]')?.value || '').padStart(2, '0')
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `${_currentOpId}/${anno}-${mese}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('buste-paga').upload(path, file)
      if (upErr) throw upErr
      filePath = path
    } catch (err) {
      showToast('Errore upload file', 'error')
      console.error(err)
      return
    }
  }

  const numCols = ['anno','mese','ore_lavorate','ore_straordinario',
    'paga_base','contingenza','edr','superminimo','scatti_anzianita',
    'straordinari_imp','indennita_varie','altri_elementi','totale_lordo',
    'contributi_inps_dip','irpef','addizionali','altre_ritenute','totale_ritenute',
    'totale_netto','tfr_mese','tfr_rivalutazione','contributi_inps_az','inail','costo_aziendale']

  const payload = { operatore_id: _currentOpId }
  numCols.forEach(f => { const el = form.querySelector(`[name="${f}"]`); if (el) payload[f] = el.value ? parseFloat(el.value) : 0 })
  ;['stato','note','data_pagamento'].forEach(f => { const el = form.querySelector(`[name="${f}"]`); if (el) payload[f] = el.value || null })
  if (filePath) payload.file_path = filePath

  try {
    let error
    if (bustaId) {
      ;({ error } = await supabase.from('buste_paga').update(payload).eq('id', bustaId))
    } else {
      ;({ error } = await supabase.from('buste_paga').insert(payload))
    }
    if (error) throw error
    showToast('Busta paga salvata', 'success')
    modal.classList.remove('active')
    loadBustePagaTab(_currentOpId)
    _operatori = await loadOperatoriHR()
    renderTabellaHR(_operatori)
  } catch (err) {
    showToast(err.code === '23505' ? 'Busta paga già presente per questo mese/anno' : 'Errore salvataggio', 'error')
    console.error(err)
  }
}

async function downloadBusta(filePath) {
  try {
    const { data, error } = await supabase.storage.from('buste-paga').createSignedUrl(filePath, 3600)
    if (error) throw error
    window.open(data.signedUrl, '_blank')
  } catch (err) {
    showToast('Errore download PDF', 'error')
    console.error(err)
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initGestioneAnagrafica() {
  try {
    // Initial load
    loadOperatoriHR().then(ops => { _operatori = ops; renderTabellaHR(_operatori) })

    // Search
    document.getElementById('hr-search')?.addEventListener('input', () => renderTabellaHR(_operatori))

    // Table row click
    document.getElementById('hr-operatori-body')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action="hr-open"]')
      if (btn?.dataset.id) await openModalAnag(btn.dataset.id)
    })

    // Tabs
    document.getElementById('hr-anag-modal')?.querySelectorAll('.hr-tab-btn')
      .forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)))

    // Modal save
    document.getElementById('hr-save-btn')?.addEventListener('click', saveDatiPersonali)

    // Modal close
    document.getElementById('hr-modal-close')?.addEventListener('click', () =>
      document.getElementById('hr-anag-modal')?.classList.remove('active'))

    // New busta paga
    document.getElementById('hr-new-busta-btn')?.addEventListener('click', () => openModalBusta())

    // Buste list click delegation
    document.getElementById('hr-buste-list')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'hr-edit-busta') await openModalBusta(btn.dataset.id)
      if (btn.dataset.action === 'hr-download') await downloadBusta(btn.dataset.path)
    })

    // Busta modal close
    document.getElementById('hr-busta-close')?.addEventListener('click', () =>
      document.getElementById('hr-busta-modal')?.classList.remove('active'))

    // Busta modal save
    document.getElementById('hr-busta-save')?.addEventListener('click', saveBustaPaga)

    // Auto-calcolo totali nel form busta
    const bustaForm = document.getElementById('hr-busta-form')
    if (bustaForm) {
      bustaForm.querySelectorAll('input[type="number"]').forEach(el => {
        el.addEventListener('input', () => ricalcola(bustaForm))
      })
    }
  } catch (err) {
    showToast('Errore inizializzazione Gestione Anagrafica', 'error')
    console.error(err)
  }
}
