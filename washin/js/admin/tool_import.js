import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { extractTextFromFile, parseDocumentText } from './gestione_anagrafica.js'

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

const pd = s => parseFloat(String(s).replace(/\./g,'').replace(',','.')) || 0

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
  if (/POSIZIONE\s*INAIL|MATRICOLA\s*INPS.*AZIENDA|TOTALE\s*CONTRIBUTI\s*SOCIALI/i.test(text)) return 'inail'
  if (/DATA\s*SERVICES|CED\s*PAGHE/i.test(text)) return 'ced'
  return 'generic'
}

// ── INAIL payslip parser ──────────────────────────────────────────────────────

function parseInailPayslip(text) {
  const anag = { ccnl: 'Pulizie e Multiservizi' }
  const busta = {}

  // Codice Fiscale (standard 16-char Italian CF)
  const cfM = text.match(/\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\b/i)
  if (cfM) anag.codice_fiscale = cfM[1].toUpperCase()

  // COGNOME + NOME: in the header data row as "NNN COGNOME NOME DD/MM/YY"
  // The employee code (1–3 digits) precedes the name, and the assunzione date follows
  const nomeM = text.match(/\b(\d{1,3})\s+([A-ZÀÈÉÌÒÙ]{2,}(?:\s+[A-ZÀÈÉÌÒÙ]{2,}){1,3})\s+\d{2}\/\d{2}\/\d{2}/)
  if (nomeM) {
    const parts = nomeM[2].trim().split(/\s+/)
    anag.cognome = parts[0]
    anag.nome    = parts.slice(1).join(' ')
    anag.matricola = nomeM[1]
  }

  // Data assunzione: first DD/MM/YY (or DD/MM/YYYY) in the header region
  // The assunzione date is the one directly after the name block
  if (anag.cognome) {
    const nameIdx = text.indexOf(anag.cognome)
    if (nameIdx >= 0) {
      const afterName = text.substring(nameIdx, nameIdx + 60)
      const dm = afterName.match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
      if (dm) {
        const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3]
        anag.data_assunzione = `${y}-${dm[2]}-${dm[1]}`
      }
    }
  }
  if (!anag.data_assunzione) {
    const assM = text.match(/DATA\s+ASSUNZIONE[^\n]*?(\d{2})\/(\d{2})\/(\d{2,4})/i)
    if (assM) {
      const y = assM[3].length === 2 ? `20${assM[3]}` : assM[3]
      anag.data_assunzione = `${y}-${assM[2]}-${assM[1]}`
    }
  }

  // Data nascita: DD/MM/YY format in the CF row (year before 30 → 20xx, else 19xx)
  if (cfM) {
    const cfIdx = text.indexOf(cfM[1])
    if (cfIdx >= 0) {
      const afterCF = text.substring(cfIdx, cfIdx + 250)
      const dm = afterCF.match(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/)
      if (dm) {
        const yy = parseInt(dm[3])
        const year = yy > 30 ? `19${dm[3]}` : `20${dm[3]}`
        anag.data_nascita = `${year}-${dm[2]}-${dm[1]}`
      }
    }
  }

  // Qualifica: OPERAIO / IMPIEGATO / etc. in the retribuzione row
  const qualM = text.match(/\b(OPERAIO|IMPIEGATO|QUADRO|DIRIGENTE|APPRENDISTA|FUNZIONARIO)\b/i)
  if (qualM) anag.qualifica = qualM[1].charAt(0).toUpperCase() + qualM[1].slice(1).toLowerCase()

  // Livello (LIVELLO N in the header area)
  const livM = text.match(/LIVELLO\s+(\d+)/i)
  if (livM) anag.categoria_lavorativa = `${livM[1]}° livello`

  // Paga base mensile = paga giornaliera × 173 ore convenzionali
  const pagaGiornM = text.match(/PAGA\s+BASE\s+([\d]+[,.][\d]+)/i)
  if (pagaGiornM) anag.paga_base = Math.round(pd(pagaGiornM[1]) * 173 * 100) / 100

  // IBAN dipendente
  const ibanM = text.match(/\b(IT\d{2}[A-Z0-9]{23})\b/i)
  if (ibanM) anag.iban_dipendente = ibanM[1].toUpperCase()

  // ── Busta paga ──────────────────────────────────────────────────────────────

  // Mese + Anno
  const MESI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
                'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE']
  const meseM = text.match(new RegExp(`(${MESI.join('|')})\\s+(\\d{4})`, 'i'))
  if (meseM) {
    const idx = MESI.findIndex(m => m === meseM[1].toUpperCase())
    if (idx >= 0) { busta._bp_mese = idx + 1; busta._bp_anno = parseInt(meseM[2]) }
  }

  // Ore lavorate: voce 8001 LAVORO ORDINARIO ORE
  const oreM = text.match(/8001\D{1,10}([\d]+(?:[,.][\d]+)?)/)
  if (oreM) busta.ore_lavorate = pd(oreM[1])
  if (!busta.ore_lavorate) {
    const ore2 = text.match(/LAVORO\s+ORDINARIO\s+ORE\D{0,20}([\d]+(?:[,.][\d]+)?)/i)
    if (ore2) busta.ore_lavorate = pd(ore2[1])
  }

  // Paga base per la busta (da anagrafica estratta)
  if (anag.paga_base) busta.paga_base = anag.paga_base

  // TOTALE LORDO
  const lordoM = text.match(/TOTALE\s+LORDO[^0-9]*([\d.]+,\d{2})/i)
  if (lordoM) busta._bp_lordo = pd(lordoM[1])

  // NETTO BUSTA
  const nettoM = text.match(/NETTO\s+BUSTA[^0-9]*([\d.]+,\d{2})/i)
  if (nettoM) busta._bp_netto = pd(nettoM[1])

  // TOTALE CONTRIBUTI SOCIALI → INPS dipendente (include contrib.1 + contrib.2)
  const inpsM = text.match(/TOTALE\s+CONTRIBUTI\s+SOCIALI[^0-9]*([\d.]+,\d{2})/i)
  if (inpsM) busta.contributi_inps_dip = pd(inpsM[1])

  // TOTALE TRATTENUTE IRPEF — there are two matches: "F.S." (smaller) and the actual one (larger)
  const allIrpef = [...text.matchAll(/TOTALE\s+TRATTENUTE\s+IRPEF[^0-9]*([\d.]+,\d{2})/gi)]
  if (allIrpef.length >= 2) {
    // Pick the larger value (actual IRPEF, not F.S. withholding)
    busta.irpef = Math.max(...allIrpef.map(m => pd(m[1])))
  } else if (allIrpef.length === 1) {
    busta.irpef = pd(allIrpef[0][1])
  }

  // Addizionali regionali + comunali (voci 9117, 9119, 9173 trattenute del mese)
  // Match lines with RATA ADDIZ or ACCONTO ADD and grab the trattenuta value
  let addTot = 0
  for (const m of text.matchAll(/RATA\s+ADDIZ[^\n]*([\d.]+,\d{2})/gi)) addTot += pd(m[1])
  for (const m of text.matchAll(/ACCONTO\s+ADD[^\n]*([\d.]+,\d{2})/gi)) addTot += pd(m[1])
  if (addTot) busta.addizionali = Math.round(addTot * 100) / 100

  // Altre ritenute: CESSIONE STIPENDIO + TRATT.BONIFICO ENTE CRED. (voci 9250, 217)
  let altreTot = 0
  for (const m of text.matchAll(/CESSIONE\s+STIPENDIO[^\n]*([\d.]+,\d{2})/gi)) altreTot += pd(m[1])
  for (const m of text.matchAll(/TRATT[^\n]*BONIFICO[^\n]*([\d.]+,\d{2})/gi)) altreTot += pd(m[1])
  if (altreTot) busta.altre_ritenute = Math.round(altreTot * 100) / 100

  // TFR mese (da sezione DATI STATISTICI)
  const tfrM = text.match(/TFR\s+MESE[^0-9]*([\d.]+,\d{2})/i)
  if (tfrM) busta.tfr_mese = pd(tfrM[1])

  // Superminimo (voce SUPERMINIMO o SUPERMINIMO AZIENDALE)
  const supM = text.match(/SUPERMINIMO[^\n]*([\d.]+,\d{2})/i)
  if (supM) busta.superminimo = pd(supM[1])

  // Straordinari → indennita_varie (voci 8025, 8101, etc.)
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

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (progress) progress.textContent = `Elaborazione ${i + 1}/${files.length}: ${file.name}…`
    const text = await extractTextFromFile(file, pct => {
      if (progress) progress.textContent = `Analisi ${i + 1}/${files.length}: ${pct}%`
    })

    const fmt = detectPayslipFormat(text)
    if (fmt === 'inail') {
      const { anag, busta } = parseInailPayslip(text)
      busta._filename = file.name
      busta._format   = 'inail'
      anag._filename  = file.name
      _busteData.push(busta)
      _busteAnagData.push(anag)
    } else {
      const parsed = parseCedolino(text)
      parsed._filename = file.name
      parsed._format   = fmt
      _busteData.push(parsed)
    }
  }

  if (progress) progress.textContent = `${files.length} PDF analizzati (${_busteAnagData.length} formato INAIL)`
  const ops = await loadOperatori()
  renderBusteAnagPreview()
  renderBustePreview(ops)
}

function renderBusteAnagPreview() {
  const preview = document.getElementById('ti-buste-anag-preview')
  const tbody   = document.getElementById('ti-buste-anag-tbody')
  if (!tbody) return

  const fmt = v => v || '—'
  tbody.innerHTML = _busteAnagData.map(r => `
    <tr>
      <td>${fmt(r.cognome)}</td>
      <td>${fmt(r.nome)}</td>
      <td><code style="font-size:11px;">${fmt(r.codice_fiscale)}</code></td>
      <td>${fmt(r.data_nascita)}</td>
      <td>${fmt(r.data_assunzione)}</td>
      <td>${fmt(r.qualifica)}</td>
      <td>${fmt(r.categoria_lavorativa)}</td>
      <td>${r.paga_base ? r.paga_base.toFixed(2) : '—'}</td>
      <td style="font-size:11px;">${fmt(r.iban_dipendente)}</td>
    </tr>
  `).join('')

  if (preview) preview.style.display = _busteAnagData.length ? 'block' : 'none'
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
