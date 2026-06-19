import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { extractTextFromFile, extractPageTextsFromPdf, parseDocumentText } from './gestione_anagrafica.js'

const ANAG_COLS = ['cognome','nome','codice_fiscale','email','telefono','matricola',
                   'qualifica','tipo_contratto','paga_base','data_assunzione',
                   'data_nascita','ccnl','categoria_lavorativa','iban_dipendente']
const BUSTE_COLS = ['codice_fiscale','anno','mese','paga_base','superminimo',
                    'indennita_varie','altri_elementi','contributi_inps_dip','irpef',
                    'addizionali','altre_ritenute','tfr_mese','totale_lordo','totale_netto']

let _anagData     = []
let _busteData    = []
let _busteAnagData = []   // anagrafica estratta da cedolini INAIL
let _operatoriCache = null

// ── Utilities ─────────────────────────────────────────────────────────────────

// Strip spaces inside numbers before parsing (handles OCR "0, 05971" → 0.05971)
const pd = s => parseFloat(String(s).replace(/\s/g,'').replace(/\./g,'').replace(',','.')) || 0

function downloadCsv(filename, cols, rows = []) {
  const bom = '﻿'
  const header = cols.join(';')
  const body = rows.map(r => cols.map(c => {
    const v = String(r[c] ?? '')
    return v.includes(';') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v
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
  const headers = lines[0].split(delim).map(h => h.replace(/^"|"$/g,'').trim())
  return lines.slice(1).map(line => {
    const vals = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue }
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

// ── Format detection ──────────────────────────────────────────────────────────

function detectPayslipFormat(text) {
  // Score-based: Italian INAIL payslip has several characteristic keywords
  const hits = [
    /\bINAIL\b/i,
    /NETTO\s*BUSTA/i,
    /TOTALE\s*LORDO/i,
    /TOTALE\s*CONTRIBUTI\s*SOCIALI/i,
    /PAGA\s*BASE/i,
    /MATRICOLA\s*INPS/i,
    /TFR\s*MESE/i,
    /COMPETENZE/i,
    /TRATTENUTE/i,
  ].filter(re => re.test(text)).length

  if (hits >= 2) return 'inail'
  if (/DATA\s*SERVICES|CED\s*PAGHE/i.test(text)) return 'ced'
  return 'generic'
}

// ── INAIL payslip parser ──────────────────────────────────────────────────────

// Helper: pick the first value that passes a sanity check
function pickValue(text, patterns, minVal = 0) {
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const v = pd(m[1])
      if (v > minVal) return v
    }
  }
  return null
}

function parseInailPayslip(text) {
  console.log('[INAIL parser] OCR (prime 800 char):\n', text.substring(0, 800))

  const anag = { ccnl: 'Pulizie e Multiservizi' }
  const busta = {}

  // ── Cognome + Nome ──────────────────────────────────────────────────────────
  // Header row: "NNN |COGNOME NOME DD/MM/YY"
  // OCR produces | (pipe) from table borders between the code and the name
  const nomeRe = [
    /\b(\d{1,3})\s*[\|:]?\s*([A-ZÀÈÉÌÒÙ]{2,}(?:\s+[A-ZÀÈÉÌÒÙ]{2,}){1,3})\s+\d{2}\/\d{2}\/\d{2}/,
    /\b(\d{1,3})\s*[\|:]?\s*([A-ZÀÈÉÌÒÙ]{2,}\s+[A-ZÀÈÉÌÒÙ]{2,}(?:\s+[A-ZÀÈÉÌÒÙ]{2,})?)\s*[\|\n]/,
  ]
  for (const re of nomeRe) {
    const m = text.match(re)
    if (m && parseInt(m[1]) <= 999) {
      const parts = m[2].trim().split(/\s+/)
      anag.cognome   = parts[0]
      anag.nome      = parts.slice(1).join(' ')
      anag.matricola = m[1]
      break
    }
  }

  // ── Data assunzione ─────────────────────────────────────────────────────────
  // Prefer date immediately after the name on same line
  if (anag.cognome) {
    const nameIdx = text.indexOf(anag.cognome)
    if (nameIdx >= 0) {
      const near = text.substring(nameIdx, nameIdx + 70)
      const dm = near.match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
      if (dm) {
        const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3]
        anag.data_assunzione = `${y}-${dm[2]}-${dm[1]}`
      }
    }
  }
  if (!anag.data_assunzione) {
    const assM = text.match(/DATA\s+ASSUNZIONE[^\d]*(\d{2})\/(\d{2})\/(\d{2,4})/i)
    if (assM) {
      const y = assM[3].length === 2 ? `20${assM[3]}` : assM[3]
      anag.data_assunzione = `${y}-${assM[2]}-${assM[1]}`
    }
  }

  // ── Data nascita ─────────────────────────────────────────────────────────────
  // Don't rely on CF match (OCR corrupts CF). Instead pick the first DD/MM/YY
  // date whose 2-digit year maps to a plausible birth year (1950–2010)
  for (const dm of text.matchAll(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/g)) {
    const yy = parseInt(dm[3])
    const year = yy > 30 ? `19${dm[3]}` : `20${dm[3]}`
    const candidate = `${year}-${dm[2]}-${dm[1]}`
    const y4 = parseInt(year)
    if (y4 >= 1950 && y4 <= 2010 && candidate !== anag.data_assunzione) {
      // Validate month
      if (parseInt(dm[2]) >= 1 && parseInt(dm[2]) <= 12) {
        anag.data_nascita = candidate
        break
      }
    }
  }

  // ── Codice Fiscale ──────────────────────────────────────────────────────────
  // Standard 16-char CF (strict)
  const cfStrictM = text.match(/\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\b/i)
  if (cfStrictM) {
    anag.codice_fiscale = cfStrictM[1].toUpperCase()
  } else {
    // Relaxed: 16-char alphanumeric, last char might be % (OCR for Z or 2)
    const cfRelaxM = text.match(/\b([A-Z]{5,7}[0-9A-Z]{8,10}[A-Z%])\b/i)
    if (cfRelaxM) {
      const cf = cfRelaxM[1].toUpperCase().replace(/%$/, 'Z')
      if (cf.length === 16) anag.codice_fiscale = cf
    }
  }

  // ── Qualifica ───────────────────────────────────────────────────────────────
  const qualM = text.match(/\b(OPERAIO|IMPIEGATO|QUADRO|DIRIGENTE|APPRENDISTA|FUNZIONARIO)\b/i)
  if (qualM) anag.qualifica = qualM[1].charAt(0).toUpperCase() + qualM[1].slice(1).toLowerCase()

  // ── Livello ─────────────────────────────────────────────────────────────────
  const livM = text.match(/LIVELLO\s+(\d+)/i)
  if (livM) anag.categoria_lavorativa = `${livM[1]}° livello`

  // ── Paga base mensile ───────────────────────────────────────────────────────
  // Retribuzione di fatto (total hourly) = PAGA BASE + CONTING + EDR + SCATTI ANZ
  // It appears on the same row as OPERAIO: "(number) | OPERAIO"
  const retribM = text.match(/([\d]+[,. ]\s*[\d]{4,5})\s*[\|]?\s*OPERAIO/i)
  if (retribM) {
    const r = pd(retribM[1])
    if (r > 4 && r < 30) anag.paga_base = Math.round(r * 173 * 100) / 100
  }
  // Fallback: PAGA BASE from ATT section (allows optional letter "A" between BASE and value)
  if (!anag.paga_base) {
    const pagaM = text.match(/PAGA\s+BASE\s+(?:[A-Z]{1,3}\s+)?([\d]+[,. ]\s*[\d]+)/i)
    if (pagaM) {
      const r = pd(pagaM[1])
      if (r > 1 && r < 30) anag.paga_base = Math.round(r * 173 * 100) / 100
    }
  }

  // ── IBAN ─────────────────────────────────────────────────────────────────────
  const ibanM = text.match(/\b(IT\d{2}[A-Z0-9]{23})\b/i)
  if (ibanM) anag.iban_dipendente = ibanM[1].toUpperCase()

  // ── Mese + Anno ─────────────────────────────────────────────────────────────
  const MESI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
                'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE']
  // Allow truncated names (OCR drops first char: "AGGIO" for "MAGGIO")
  // Allow OCR digit errors in year: ¢→6, i→1, O→0
  const meseRx = new RegExp(`(${MESI.map(m => `${m}|${m.slice(1)}`).join('|')})\\s+(20[0-9¢iIoO]{2})`, 'gi')
  const meseMatches = [...text.matchAll(meseRx)]
  if (meseMatches.length) {
    const mm = meseMatches[0]
    const mStr = mm[1].toUpperCase()
    let idx = MESI.indexOf(mStr)
    if (idx < 0) idx = MESI.findIndex(m => m.slice(1) === mStr || m.endsWith(mStr))
    const yearStr = mm[2].replace(/[¢©]/g,'6').replace(/[iI!]/g,'1').replace(/[oO0]/g,'0')
    if (idx >= 0) { busta._bp_mese = idx + 1; busta._bp_anno = parseInt(yearStr) }
  }

  // ── Ore lavorate ─────────────────────────────────────────────────────────────
  // Voce 8001 + value in range 40–250 followed by ",0" or ",00" (whole hours)
  const oreM = text.match(/8001[\s\S]{0,60}?(\d{2,3}),0{1,2}/)
  if (oreM) {
    const v = parseInt(oreM[1])
    if (v >= 40 && v <= 250) busta.ore_lavorate = v
  }
  if (!busta.ore_lavorate) {
    const ore2 = text.match(/LAVORO\s+ORDINARIO[\s\S]{0,30}?(\d{2,3}),0{1,2}/i)
    if (ore2) {
      const v = parseInt(ore2[1])
      if (v >= 40 && v <= 250) busta.ore_lavorate = v
    }
  }

  // Paga base per busta
  if (anag.paga_base) busta.paga_base = anag.paga_base

  // ── Totali ───────────────────────────────────────────────────────────────────
  busta._bp_lordo           = pickValue(text, [/TOTALE\s*LORDO[^0-9]*([\d.]+,\d{2})/gi], 200)
  busta._bp_netto           = pickValue(text, [/NETTO\s*BUSTA[^0-9]*([\d.]+,\d{2})/gi], 200)
  busta.contributi_inps_dip = pickValue(text, [/TOTALE\s*CONTRIBUTI\s*SOCIALI[^0-9]*([\d.]+,\d{2})/gi], 0)

  // IRPEF: pick the largest of all "TOTALE TRATTENUTE IRPEF" values
  const allIrpef = [...text.matchAll(/TOTALE\s+TRATTENUTE\s+IRPEF[^0-9]*([\d.]+,\d{2})/gi)]
  if (allIrpef.length) busta.irpef = Math.max(...allIrpef.map(m => pd(m[1])))

  let addTot = 0
  for (const m of text.matchAll(/RATA\s+ADDIZ[^\n]*([\d.]+,\d{2})/gi)) addTot += pd(m[1])
  for (const m of text.matchAll(/ACCONTO\s+ADD[^\n]*([\d.]+,\d{2})/gi)) addTot += pd(m[1])
  if (addTot) busta.addizionali = Math.round(addTot * 100) / 100

  let altreTot = 0
  for (const m of text.matchAll(/CESSIONE\s+STIPENDIO[^\n]*([\d.]+,\d{2})/gi)) altreTot += pd(m[1])
  for (const m of text.matchAll(/TRATT[^\n]*BONIFICO[^\n]*([\d.]+,\d{2})/gi)) altreTot += pd(m[1])
  if (altreTot) busta.altre_ritenute = Math.round(altreTot * 100) / 100

  busta.tfr_mese = pickValue(text, [/TFR\s*MESE[^0-9]*([\d.]+,\d{2})/gi], 0)

  const supM = text.match(/SUPERMINIMO[^\n]*([\d.]+,\d{2})/i)
  if (supM) busta.superminimo = pd(supM[1])

  let straordTot = 0
  for (const m of text.matchAll(/STRAORDINARIO[^\n]*([\d.]+,\d{2})/gi)) straordTot += pd(m[1])
  if (straordTot) busta.straordinari_imp = Math.round(straordTot * 100) / 100

  return { anag, busta }
}

// ── CED payslip extended parser (fallback for non-INAIL) ─────────────────────

function parseCedolino(text) {
  const r = parseDocumentText(text, 'busta_paga')

  const supM = text.match(/[Ss]uperminimo[\s\S]{0,40}?([\d.]+,\d{2})/)
  if (supM) r.superminimo = pd(supM[1])

  const premioM = text.match(/(?:[Pp]remio|[Ii]ndenn[ia][tà]?)[\s\S]{0,40}?([\d.]+,\d{2})/)
  if (premioM) r.indennita_varie = pd(premioM[1])

  const irpefM = text.match(/IRPEF[\s\S]{0,80}?([\d.]+,\d{2})\s*[\n\r]/)
  if (irpefM) r.irpef = pd(irpefM[1])
  if (!r.irpef) {
    const m2 = text.match(/IRPEF[^0-9]*([\d.]+,\d{2})/)
    if (m2) r.irpef = pd(m2[1])
  }

  const inpsM = text.match(/I\.?N\.?P\.?S\.?[^0-9]*([\d.]+,\d{2})\s*[\n\r]/)
  if (inpsM) r.contributi_inps_dip = pd(inpsM[1])

  let addTot = 0
  for (const m of text.matchAll(/[Aa]ddizional[ei]\s+(?:reg|com)[a-z]*[^0-9]*([\d.]+,\d{2})/g)) addTot += pd(m[1])
  if (addTot) r.addizionali = addTot

  let altreTot = 0
  for (const m of text.matchAll(/(?:[Mm]ensa|IVS|[Aa]ltre?\s+ritenute?)[^0-9]*([\d.]+,\d{2})/g)) altreTot += pd(m[1])
  if (altreTot) r.altre_ritenute = altreTot

  const tfrM = text.match(/[Tt][Ff][Rr][^0-9a-z]*([\d.]+,\d{2})/i)
  if (tfrM) r.tfr_mese = pd(tfrM[1])

  const oreM = text.match(/[Oo]re\s+[Ll]avorat[ea][\s:]*(\d+[.,]?\d*)/i)
  if (oreM) r.ore_lavorate = parseFloat(oreM[1].replace(',', '.'))

  return r
}

// ── Anagrafica (from CSV / ID documents) ─────────────────────────────────────

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
  const tbody   = document.getElementById('ti-anag-tbody')
  const count   = document.getElementById('ti-anag-count')
  if (!tbody) return

  const inp = (i, f, v, type = 'text', w = '100px') =>
    `<input class="ti-cell" data-i="${i}" data-f="${f}" value="${String(v ?? '').replace(/"/g,'&quot;')}" type="${type}" style="width:${w};font-size:13px;border:1px solid #e2e8f0;border-radius:4px;padding:3px 6px;">`

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

const MESI_NOMI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

async function handleBustePdf(files) {
  _busteData     = []
  _busteAnagData = []
  const progress = document.getElementById('ti-buste-pdf-progress')
  let totalPages = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (progress) progress.textContent = `Elaborazione file ${i + 1}/${files.length}: ${file.name}…`

    // Extract text per-page so multi-payslip PDFs (one per page) work correctly
    const pages = await extractPageTextsFromPdf(file, pct => {
      if (progress) progress.textContent = `OCR ${file.name}: ${pct}%`
    })

    pages.forEach((text, p) => {
      const label = pages.length > 1 ? `${file.name} (pag. ${p + 1})` : file.name
      const fmt = detectPayslipFormat(text)
      if (fmt === 'inail') {
        const { anag, busta } = parseInailPayslip(text)
        busta._filename = label
        busta._format   = 'inail'
        anag._filename  = label
        _busteData.push(busta)
        _busteAnagData.push(anag)
      } else {
        const parsed = parseCedolino(text)
        parsed._filename = label
        parsed._format   = fmt
        _busteData.push(parsed)
      }
    })
    totalPages += pages.length
  }

  if (progress) progress.textContent = `${files.length} file analizzati — ${totalPages} cedolini trovati (${_busteAnagData.length} formato INAIL)`
  const ops = await loadOperatori()
  renderBusteAnagPreview()
  renderBustePreview(ops)
}

function renderBusteAnagPreview() {
  const preview = document.getElementById('ti-buste-anag-preview')
  const tbody   = document.getElementById('ti-buste-anag-tbody')
  const count   = document.getElementById('ti-buste-anag-count')
  if (!tbody) return

  const f = v => v || '—'
  tbody.innerHTML = _busteAnagData.map(r => `
    <tr>
      <td>${f(r.cognome)}</td>
      <td>${f(r.nome)}</td>
      <td><code style="font-size:11px;">${f(r.codice_fiscale)}</code></td>
      <td>${f(r.data_nascita)}</td>
      <td>${f(r.data_assunzione)}</td>
      <td>${f(r.qualifica)}</td>
      <td>${f(r.categoria_lavorativa)}</td>
      <td>${r.paga_base ? r.paga_base.toFixed(2) : '—'}</td>
      <td style="font-size:11px;">${f(r.iban_dipendente)}</td>
    </tr>
  `).join('')

  if (count) count.textContent = _busteAnagData.length
  if (preview) preview.style.display = _busteAnagData.length ? 'block' : 'none'
}

async function confirmBusteAnagOnly() {
  if (!_busteAnagData.length) return
  const rows = _busteAnagData.filter(r => r.codice_fiscale || r.cognome).map(r => {
    const row = {}
    ANAG_COLS.forEach(c => { if (r[c] !== undefined && r[c] !== '') row[c] = r[c] })
    if (row.paga_base) row.paga_base = +row.paga_base || null
    return row
  })
  if (!rows.length) { showToast('Nessun profilo valido da salvare', 'error'); return }

  const { error } = await supabase.from('profili').upsert(rows, { onConflict: 'codice_fiscale' })
  if (error) { showToast('Errore salvataggio anagrafica: ' + error.message, 'error'); return }
  showToast(`${rows.length} profili salvati`, 'success')
  _operatoriCache = null
  // Refresh operatore dropdowns in buste preview
  const ops = await loadOperatori()
  renderBustePreview(ops)
}

async function handleBusteCsv(file) {
  const text = await file.text()
  const rows = parseCsv(text)
  _busteData     = rows.filter(r => r.anno && r.mese)
  _busteAnagData = []
  const ops = await loadOperatori()
  renderBusteAnagPreview()
  renderBustePreview(ops)
}

function renderBustePreview(operatori) {
  const preview = document.getElementById('ti-buste-preview')
  const tbody   = document.getElementById('ti-buste-tbody')
  const count   = document.getElementById('ti-buste-count')
  if (!tbody) return

  tbody.innerHTML = _busteData.map((r, i) => {
    // Auto-match operatore by CF (check _busteAnagData first, then operatori cache)
    const cf = r.codice_fiscale || _busteAnagData[i]?.codice_fiscale
    const cogn = r.cognome || _busteAnagData[i]?.cognome

    let matchedId = ''
    if (cf) {
      const m = operatori.find(o => o.codice_fiscale === cf)
      if (m) matchedId = m.id
    }
    if (!matchedId && cogn) {
      const m = operatori.find(o => o.cognome?.toLowerCase() === cogn?.toLowerCase())
      if (m) matchedId = m.id
    }

    const opOpts = [
      '<option value="">— non abbinato —</option>',
      ...operatori.map(o =>
        `<option value="${o.id}"${o.id === matchedId ? ' selected' : ''}>${o.cognome || ''} ${o.nome || ''}</option>`)
    ].join('')

    const mese = r._bp_mese || +r.mese || 0
    const anno = r._bp_anno || +r.anno || ''
    const lordo = r._bp_lordo || +r.totale_lordo || 0
    const netto = r._bp_netto || +r.totale_netto || 0
    const fmt = v => (v && v !== 0) ? v.toFixed(2) : '—'
    const isInail = r._format === 'inail'

    return `
      <tr>
        <td>
          <select class="ti-buste-op" data-i="${i}" style="font-size:12px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 4px;min-width:150px;">
            ${opOpts}
          </select>
          ${isInail ? '<span class="badge badge-success" style="font-size:10px;margin-left:4px;">INAIL</span>' : ''}
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

  // 1. Upsert profili from INAIL data (creates new profiles or updates existing ones)
  let upsertedProfiles = {}   // CF → id mapping after upsert
  if (_busteAnagData.length) {
    const anagRows = _busteAnagData.filter(r => r.codice_fiscale || r.cognome).map(r => {
      const row = {}
      ANAG_COLS.forEach(c => { if (r[c] !== undefined && r[c] !== '') row[c] = r[c] })
      if (row.paga_base) row.paga_base = +row.paga_base || null
      return row
    })
    if (anagRows.length) {
      const { data: profileData, error: profErr } = await supabase
        .from('profili')
        .upsert(anagRows, { onConflict: 'codice_fiscale' })
        .select('id,codice_fiscale')
      if (profErr) {
        showToast('Errore aggiornamento anagrafica: ' + profErr.message, 'error')
      } else {
        _operatoriCache = null
        // Reload to get ids of newly created profiles
        const { data: freshOps } = await supabase.from('profili').select('id,codice_fiscale,cognome,nome').order('cognome')
        _operatoriCache = freshOps || []
        freshOps?.forEach(o => { if (o.codice_fiscale) upsertedProfiles[o.codice_fiscale] = o.id })
      }
    }
  }

  // Reload operatori in case profiles were just created
  const ops = _operatoriCache || await loadOperatori()

  // 2. Build buste paga rows
  const rows = _busteData.map((r, i) => {
    let operatore_id = selects?.[i]?.value

    // If not manually set, try to match from freshly loaded profiles
    if (!operatore_id) {
      const cf = r.codice_fiscale || _busteAnagData[i]?.codice_fiscale
      const cogn = r.cognome || _busteAnagData[i]?.cognome
      if (cf && upsertedProfiles[cf]) operatore_id = upsertedProfiles[cf]
      else if (cf) operatore_id = ops.find(o => o.codice_fiscale === cf)?.id || ''
      else if (cogn) operatore_id = ops.find(o => o.cognome?.toLowerCase() === cogn?.toLowerCase())?.id || ''
    }

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
      straordinari_imp:    +(r.straordinari_imp || 0),
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
  if (error) { showToast('Errore import buste: ' + error.message, 'error'); return }

  const nAnag = _busteAnagData.length
  showToast(`${rows.length} buste importate${nAnag ? ` + ${nAnag} profili aggiornati` : ''}`, 'success')
  _busteData     = []
  _busteAnagData = []
  renderBusteAnagPreview()
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
      document.getElementById('ti-panel-anag').style.display   = tab === 'anag' ? '' : 'none'
      document.getElementById('ti-panel-buste').style.display  = tab === 'buste' ? '' : 'none'
    })
  })

  // Template CSV downloads
  document.getElementById('ti-dl-anag-csv')?.addEventListener('click', () => {
    downloadCsv('operatori.csv', ANAG_COLS, [{
      cognome: 'Rossi', nome: 'Mario', codice_fiscale: 'RSSMRA80A01H501Z',
      email: 'mario@esempio.it', telefono: '3331234567',
      matricola: '1001', qualifica: 'Operaio',
      tipo_contratto: 'indeterminato', paga_base: '1500',
      data_assunzione: '2020-01-01', data_nascita: '1980-01-01',
      ccnl: 'Pulizie e Multiservizi', categoria_lavorativa: '3° livello',
      iban_dipendente: ''
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

  // Anagrafiche estratte: salva solo profili
  document.getElementById('ti-buste-anag-save')?.addEventListener('click', confirmBusteAnagOnly)

  // Buste: confirm / cancel
  document.getElementById('ti-buste-confirm')?.addEventListener('click', confirmBusteImport)
  document.getElementById('ti-buste-cancel')?.addEventListener('click', () => {
    _busteData     = []
    _busteAnagData = []
    renderBusteAnagPreview()
    renderBustePreview([])
    const p = document.getElementById('ti-buste-pdf-progress')
    if (p) p.textContent = ''
  })
}
