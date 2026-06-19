import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { extractTextFromFile, parseDocumentText } from './gestione_anagrafica.js'

const ANAG_COLS = ['cognome','nome','codice_fiscale','email','telefono','matricola',
                   'qualifica','tipo_contratto','paga_base','data_assunzione','ccnl']
const BUSTE_COLS = ['codice_fiscale','anno','mese','paga_base','superminimo',
                    'indennita_varie','altri_elementi','contributi_inps_dip','irpef',
                    'addizionali','altre_ritenute','tfr_mese','totale_lordo','totale_netto']

let _anagData = []
let _busteData = []
let _operatoriCache = null

// ── Utilities ─────────────────────────────────────────────────────────────────

function downloadCsv(filename, cols, rows = []) {
  const bom = '﻿'
  const header = cols.join(';')
  const body = rows.map(r => cols.map(c => {
    const v = String(r[c] ?? '')
    return v.includes(';') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const delim = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(delim).map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).map(line => {
    const vals = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue }
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === delim && !inQ) { vals.push(cur); cur = ''; continue }
      cur += ch
    }
    vals.push(cur)
    const row = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
    return row
  })
}

async function loadOperatori() {
  if (_operatoriCache) return _operatoriCache
  const { data } = await supabase.from('profili').select('id,cognome,nome,codice_fiscale').order('cognome')
  _operatoriCache = data || []
  return _operatoriCache
}

// ── CED payslip extended parser ───────────────────────────────────────────────

function parseCedolino(text) {
  const pd = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
  const r = parseDocumentText(text, 'busta_paga')

  // Superminimo
  const supM = text.match(/[Ss]uperminimo[\s\S]{0,40}?([\d.]+,\d{2})/)
  if (supM) r.superminimo = pd(supM[1])

  // Premio / Indennità varie
  const premioM = text.match(/(?:[Pp]remio|[Pp]rod(?:uzione)?|[Ii]ndenn[ia][tà]?)[\s\S]{0,40}?([\d.]+,\d{2})/)
  if (premioM) r.indennita_varie = pd(premioM[1])

  // IRPEF — take last numeric value on the IRPEF line
  const irpefM = text.match(/IRPEF[\s\S]{0,80}?([\d.]+,\d{2})\s*[\n\r]/)
  if (irpefM) r.irpef = pd(irpefM[1])
  if (!r.irpef) {
    const irpef2 = text.match(/IRPEF[^0-9]*([\d.]+,\d{2})/)
    if (irpef2) r.irpef = pd(irpef2[1])
  }

  // INPS dipendente — last value on INPS/contributi line
  const inpsM = text.match(/I\.?N\.?P\.?S\.?[^0-9]*([\d.]+,\d{2})\s*[\n\r]/)
  if (inpsM) r.contributi_inps_dip = pd(inpsM[1])
  if (!r.contributi_inps_dip) {
    const inps2 = text.match(/(?:contrib[a-z]+\s+dip|quota\s+dip)[^0-9]*([\d.]+,\d{2})/i)
    if (inps2) r.contributi_inps_dip = pd(inps2[1])
  }

  // Addizionali (somma regionale + comunale)
  let addTot = 0
  for (const m of text.matchAll(/[Aa]ddizional[ei]\s+(?:reg|com)[a-z]*[^0-9]*([\d.]+,\d{2})/g)) {
    addTot += pd(m[1])
  }
  if (addTot) r.addizionali = addTot

  // Altre ritenute (mensa, IVS, ecc.)
  let altreTot = 0
  for (const m of text.matchAll(/(?:[Mm]ensa|IVS|[Aa]ltre?\s+ritenute?)[^0-9]*([\d.]+,\d{2})/g)) {
    altreTot += pd(m[1])
  }
  if (altreTot) r.altre_ritenute = altreTot

  // TFR
  const tfrM = text.match(/[Tt][Ff][Rr][^0-9a-z]*([\d.]+,\d{2})/i)
  if (tfrM) r.tfr_mese = pd(tfrM[1])

  // Ore lavorate
  const oreM = text.match(/[Oo]re\s+[Ll]avorat[ea][\s:]*(\d+[.,]?\d*)/i)
  if (oreM) r.ore_lavorate = parseFloat(oreM[1].replace(',', '.'))

  return r
}

// ── Anagrafica ────────────────────────────────────────────────────────────────

async function handleAnagFiles(files) {
  _anagData = []
  const progress = document.getElementById('ti-anag-progress')

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (progress) progress.textContent = `Elaborazione ${i + 1}/${files.length}: ${file.name}…`

    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      const rows = parseCsv(text)
      rows.forEach(r => { if (r.codice_fiscale || r.cognome) _anagData.push(r) })
    } else {
      const text = await extractTextFromFile(file, pct => {
        if (progress) progress.textContent = `OCR ${i + 1}/${files.length}: ${pct}%`
      })
      const parsed = parseDocumentText(text, 'carta_identita')
      if (parsed.cognome || parsed.codice_fiscale) _anagData.push(parsed)
    }
  }

  if (progress) progress.textContent = `Analizzati ${files.length} file — ${_anagData.length} operatori trovati`
  renderAnagPreview()
}

function renderAnagPreview() {
  const preview = document.getElementById('ti-anag-preview')
  const tbody = document.getElementById('ti-anag-tbody')
  const count = document.getElementById('ti-anag-count')
  if (!tbody) return

  const inp = (i, f, v, type = 'text', w = '100px') =>
    `<input class="ti-cell" data-i="${i}" data-f="${f}" value="${String(v ?? '').replace(/"/g, '&quot;')}" type="${type}" style="width:${w};font-size:13px;border:1px solid #e2e8f0;border-radius:4px;padding:3px 6px;">`

  tbody.innerHTML = _anagData.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${inp(i,'cognome',r.cognome,'text','110px')}</td>
      <td>${inp(i,'nome',r.nome,'text','100px')}</td>
      <td>${inp(i,'codice_fiscale',r.codice_fiscale,'text','140px')}</td>
      <td>${inp(i,'email',r.email,'email','150px')}</td>
      <td>${inp(i,'qualifica',r.qualifica,'text','100px')}</td>
      <td>${inp(i,'paga_base',r.paga_base,'number','80px')}</td>
      <td>${inp(i,'data_assunzione',r.data_assunzione,'date','130px')}</td>
      <td><span class="badge badge-info" style="font-size:11px;">da importare</span></td>
    </tr>
  `).join('')

  tbody.querySelectorAll('.ti-cell').forEach(el => {
    el.addEventListener('change', e => {
      _anagData[+e.target.dataset.i][e.target.dataset.f] = e.target.value
    })
  })

  if (count) count.textContent = _anagData.length
  if (preview) preview.style.display = _anagData.length ? 'block' : 'none'
}

async function confirmAnagImport() {
  if (!_anagData.length) return
  const rows = _anagData.map(r => {
    const row = {}
    ANAG_COLS.forEach(c => { if (r[c] !== undefined && r[c] !== '') row[c] = r[c] })
    if (row.paga_base) row.paga_base = parseFloat(row.paga_base) || null
    return row
  }).filter(r => r.codice_fiscale || r.cognome)

  if (!rows.length) { showToast('Nessuna riga valida', 'error'); return }

  const { error } = await supabase.from('profili').upsert(rows, { onConflict: 'codice_fiscale' })
  if (error) { showToast('Errore import: ' + error.message, 'error'); return }
  showToast(`${rows.length} operatori importati`, 'success')
  _anagData = []
  _operatoriCache = null
  renderAnagPreview()
}

// ── Buste paga ────────────────────────────────────────────────────────────────

async function handleBustePdf(files) {
  _busteData = []
  const progress = document.getElementById('ti-buste-pdf-progress')

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (progress) progress.textContent = `Elaborazione ${i + 1}/${files.length}: ${file.name}…`
    const text = await extractTextFromFile(file, pct => {
      if (progress) progress.textContent = `Analisi ${i + 1}/${files.length}: ${pct}%`
    })
    const parsed = parseCedolino(text)
    parsed._filename = file.name
    _busteData.push(parsed)
  }

  if (progress) progress.textContent = `${files.length} PDF analizzati`
  const ops = await loadOperatori()
  renderBustePreview(ops)
}

async function handleBusteCsv(file) {
  const text = await file.text()
  const rows = parseCsv(text)
  _busteData = rows.filter(r => r.anno && r.mese)
  const ops = await loadOperatori()
  renderBustePreview(ops)
}

const MESI_NOMI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function renderBustePreview(operatori) {
  const preview = document.getElementById('ti-buste-preview')
  const tbody = document.getElementById('ti-buste-tbody')
  const count = document.getElementById('ti-buste-count')
  if (!tbody) return

  tbody.innerHTML = _busteData.map((r, i) => {
    // Auto-match by CF then cognome
    let matchedId = ''
    if (r.codice_fiscale) {
      const m = operatori.find(o => o.codice_fiscale === r.codice_fiscale)
      if (m) matchedId = m.id
    }
    if (!matchedId && r.cognome) {
      const m = operatori.find(o => o.cognome?.toLowerCase() === r.cognome?.toLowerCase())
      if (m) matchedId = m.id
    }

    const opOpts = [
      '<option value="">— non abbinato —</option>',
      ...operatori.map(o => `<option value="${o.id}"${o.id === matchedId ? ' selected' : ''}>${o.cognome || ''} ${o.nome || ''}</option>`)
    ].join('')

    const mese = r._bp_mese || +r.mese || 0
    const anno = r._bp_anno || +r.anno || ''
    const lordo = r._bp_lordo || +r.totale_lordo || 0
    const netto = r._bp_netto || +r.totale_netto || 0
    const fmt = v => v ? v.toFixed(2) : '—'

    return `
      <tr>
        <td>
          <select class="ti-buste-op" data-i="${i}" style="font-size:12px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 4px;min-width:150px;">
            ${opOpts}
          </select>
        </td>
        <td>${MESI_NOMI[(mese || 1) - 1] || mese}</td>
        <td>${anno}</td>
        <td>${fmt(lordo)}</td>
        <td>${fmt(r.irpef)}</td>
        <td>${fmt(r.contributi_inps_dip)}</td>
        <td>${fmt(r.tfr_mese)}</td>
        <td>${fmt(netto)}</td>
        <td><span class="badge badge-info" style="font-size:11px;">da importare</span></td>
      </tr>
    `
  }).join('')

  if (count) count.textContent = _busteData.length
  if (preview) preview.style.display = _busteData.length ? 'block' : 'none'
}

async function confirmBusteImport() {
  if (!_busteData.length) return
  const selects = document.getElementById('ti-buste-tbody')?.querySelectorAll('.ti-buste-op')

  const rows = _busteData.map((r, i) => {
    const operatore_id = selects?.[i]?.value
    if (!operatore_id) return null
    const mese = r._bp_mese || +r.mese
    const anno = r._bp_anno || +r.anno
    if (!mese || !anno) return null
    return {
      operatore_id,
      anno,
      mese,
      paga_base:           +(r.paga_base || 0),
      superminimo:         +(r.superminimo || 0),
      indennita_varie:     +(r.indennita_varie || 0),
      altri_elementi:      +(r.altri_elementi || 0),
      contributi_inps_dip: +(r.contributi_inps_dip || 0),
      irpef:               +(r.irpef || 0),
      addizionali:         +(r.addizionali || 0),
      altre_ritenute:      +(r.altre_ritenute || 0),
      tfr_mese:            +(r.tfr_mese || 0),
      ore_lavorate:        +(r.ore_lavorate || 0),
      totale_lordo:        +(r._bp_lordo || r.totale_lordo || 0),
      totale_netto:        +(r._bp_netto || r.totale_netto || 0),
      totale_ritenute:     +((r.irpef||0) + (r.contributi_inps_dip||0) + (r.addizionali||0) + (r.altre_ritenute||0)),
    }
  }).filter(Boolean)

  if (!rows.length) { showToast('Nessuna busta abbinata a un operatore', 'error'); return }

  const { error } = await supabase.from('buste_paga').upsert(rows, { onConflict: 'operatore_id,anno,mese' })
  if (error) { showToast('Errore import: ' + error.message, 'error'); return }
  showToast(`${rows.length} buste paga importate`, 'success')
  _busteData = []
  renderBustePreview([])
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initToolImport() {
  // Tab switching (Anagrafica / Buste paga)
  document.querySelectorAll('.ti-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ti-tab-btn').forEach(b => {
        b.style.color = 'var(--gray-500)'
        b.style.borderBottom = 'none'
      })
      btn.style.color = 'var(--teal,#0d9488)'
      btn.style.borderBottom = '2px solid var(--teal,#0d9488)'
      const tab = btn.dataset.tab
      document.getElementById('ti-panel-anag').style.display = tab === 'anag' ? '' : 'none'
      document.getElementById('ti-panel-buste').style.display = tab === 'buste' ? '' : 'none'
    })
  })

  // Template CSV download buttons
  document.getElementById('ti-dl-anag-csv')?.addEventListener('click', () => {
    downloadCsv('operatori.csv', ANAG_COLS, [{
      cognome: 'Rossi', nome: 'Mario', codice_fiscale: 'RSSMRA80A01H501Z',
      email: 'mario@esempio.it', telefono: '3331234567',
      matricola: '1001', qualifica: '3° livello',
      tipo_contratto: 'indeterminato', paga_base: '1500',
      data_assunzione: '2020-01-01', ccnl: 'Pulizie e Multiservizi'
    }])
  })

  document.getElementById('ti-dl-buste-csv')?.addEventListener('click', () => {
    downloadCsv('buste_paga.csv', BUSTE_COLS, [{
      codice_fiscale: 'RSSMRA80A01H501Z', anno: '2023', mese: '1',
      paga_base: '1500', superminimo: '0', indennita_varie: '0',
      altri_elementi: '0', contributi_inps_dip: '137.85', irpef: '250',
      addizionali: '15', altre_ritenute: '0', tfr_mese: '115',
      totale_lordo: '1850', totale_netto: '1447.15'
    }])
  })

  // Anagrafica: parse
  document.getElementById('ti-parse-anag')?.addEventListener('click', () => {
    const input = document.getElementById('ti-anag-input')
    if (!input?.files?.length) { showToast('Seleziona almeno un file', 'error'); return }
    handleAnagFiles(Array.from(input.files))
  })

  // Anagrafica: confirm / cancel
  document.getElementById('ti-anag-confirm')?.addEventListener('click', confirmAnagImport)
  document.getElementById('ti-anag-cancel')?.addEventListener('click', () => {
    _anagData = []
    renderAnagPreview()
    const p = document.getElementById('ti-anag-progress')
    if (p) p.textContent = ''
  })

  // Buste mode toggle (CSV / PDF)
  document.querySelectorAll('.ti-buste-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ti-buste-mode').forEach(b => {
        b.classList.remove('btn-primary')
        b.classList.add('btn-secondary')
      })
      btn.classList.remove('btn-secondary')
      btn.classList.add('btn-primary')
      const mode = btn.dataset.mode
      document.getElementById('ti-buste-panel-csv').style.display = mode === 'csv' ? '' : 'none'
      document.getElementById('ti-buste-panel-pdf').style.display = mode === 'pdf' ? '' : 'none'
    })
  })

  // Buste: parse CSV
  document.getElementById('ti-parse-buste-csv')?.addEventListener('click', () => {
    const file = document.getElementById('ti-buste-csv-input')?.files?.[0]
    if (!file) { showToast('Seleziona un file CSV', 'error'); return }
    handleBusteCsv(file)
  })

  // Buste: parse PDF
  document.getElementById('ti-parse-buste-pdf')?.addEventListener('click', () => {
    const input = document.getElementById('ti-buste-pdf-input')
    if (!input?.files?.length) { showToast('Seleziona almeno un PDF', 'error'); return }
    handleBustePdf(Array.from(input.files))
  })

  // Buste: confirm / cancel
  document.getElementById('ti-buste-confirm')?.addEventListener('click', confirmBusteImport)
  document.getElementById('ti-buste-cancel')?.addEventListener('click', () => {
    _busteData = []
    renderBustePreview([])
    const p = document.getElementById('ti-buste-pdf-progress')
    if (p) p.textContent = ''
  })
}
