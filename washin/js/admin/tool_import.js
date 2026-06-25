import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { extractTextFromFile, extractPageTextsFromPdf, parseDocumentText } from './gestione_anagrafica.js'

const ANAG_COLS = ['cognome','nome','codice_fiscale','email','telefono','matricola',
                   'qualifica','tipologia','tipo_contratto','paga_base','data_assunzione',
                   'data_nascita','ccnl','categoria_lavorativa','iban_dipendente',
                   'livello_ccnl','ore_mensili_contratto','scatti_anzianita','costo_mensile',
                   'data_scadenza_contratto','tipo_retribuzione','reparto','posizione_inail']
const BUSTE_COLS = ['codice_fiscale','anno','mese','paga_base','contingenza','edr','superminimo',
                    'scatti_anzianita','indennita_varie','altri_elementi','contributi_inps_dip','irpef',
                    'addizionali','altre_ritenute','tfr_mese','totale_lordo','totale_netto',
                    'imponibile_inps','contributi_inps_az','inail','costo_aziendale']

let _anagData     = []
let _busteData    = []
let _busteAnagData = []   // anagrafica estratta da cedolini INAIL

// Estrae data di nascita dal codice fiscale italiano (molto più affidabile dell'OCR)
function birthDateFromCF(cf) {
  if (!cf || cf.length !== 16) return null
  const MESE_CF = { A:1,B:2,C:3,D:4,E:5,H:6,L:7,M:8,P:9,R:10,S:11,T:12 }
  const yy    = parseInt(cf.slice(6, 8))
  const m     = MESE_CF[cf.charAt(8).toUpperCase()]
  const dd    = parseInt(cf.slice(9, 11)) % 40   // donne: +40
  if (!m || dd < 1 || dd > 31) return null
  const curY2 = new Date().getFullYear() % 100
  const year  = yy <= curY2 + 1 ? `20${String(yy).padStart(2,'0')}` : `19${String(yy).padStart(2,'0')}`
  return `${year}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`
}
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
  // CED/Teamsystem keywords take priority — these don't appear in INAIL scanned payslips
  const cedHits = [
    /CONTRIBUTO\s*[1-5]\b/i,
    /IMPON[.\s]+CONTR[.\s]+SOC/i,
    /DATI\s*STATISTICI/i,
    /E\.D\.R\./i,
    /CONTINGEN\./i,
    /SCATTI\s+ANZ/i,
    /DATA\s*SERVICES|CED\s*PAGHE/i,
    /\b800[12]\b|\b8025\b|\b9117\b/,
  ].filter(re => re.test(text)).length
  if (cedHits >= 2) return 'ced'

  // INAIL scanned payslip
  const inailHits = [
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
  if (inailHits >= 2) return 'inail'

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

  // ── Data nascita — ricavata dal CF (molto più affidabile dei pattern testuali) ──
  anag.data_nascita = birthDateFromCF(anag.codice_fiscale)
  // Fallback: etichetta esplicita "DATA DI NASCITA" o "NASCITA" nel testo
  if (!anag.data_nascita) {
    const lblM = text.match(/(?:DATA\s+(?:DI\s+)?NASCITA|NASCITA)\s*[:\s]+(\d{2})\/(\d{2})\/(\d{2,4})/i)
    if (lblM) {
      const y = lblM[3].length === 2
        ? (parseInt(lblM[3]) > (new Date().getFullYear() % 100) + 1 ? `19${lblM[3]}` : `20${lblM[3]}`)
        : lblM[3]
      anag.data_nascita = `${y}-${lblM[2]}-${lblM[1]}`
    }
  }

  // ── Qualifica + Tipologia ───────────────────────────────────────────────────
  const qualM = text.match(/\b(OPERAI[AO]|IMPIEGAT[AO]|QUADRO|DIRIGENTE|APPRENDISTA|FUNZIONARIO|ADDETT[AO]|AMMINISTRATORE)\b/i)
  if (qualM) {
    anag.qualifica = qualM[1].charAt(0).toUpperCase() + qualM[1].slice(1).toLowerCase()
    const q = qualM[1].toUpperCase()
    if (/AMMINISTRAT/.test(q)) { anag.tipologia = 'amministratore'; anag.tipo_retribuzione = 'mensile_fisso' }
    else if (/IMPIEGAT/.test(q)) { anag.tipologia = 'impiegato'; anag.tipo_retribuzione = 'giornaliera' }
    else if (/OPERAI/.test(q)) { anag.tipologia = 'operaio'; anag.tipo_retribuzione = 'oraria' }
    else { anag.tipologia = 'addetto_pulizie'; anag.tipo_retribuzione = 'oraria' }
  }

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

// ── CED / Teamsystem payslip parser ──────────────────────────────────────────

function parseCedolino(text) {
  console.log('[CED parser] (prime 600 char):\n', text.substring(0, 600))

  const anag = {}
  const busta = {}
  const lines = text.split('\n')

  const MESI_IT = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
                   'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE']

  // ── Mese + Anno ─────────────────────────────────────────────────────────────
  for (const [idx, m] of MESI_IT.entries()) {
    const mm = text.match(new RegExp(`\\b${m}\\s+(20\\d{2})\\b`, 'i'))
    if (mm) { busta._bp_mese = idx + 1; busta._bp_anno = parseInt(mm[1]); break }
  }

  // ── Header line: "MESE ANNO … MATRICOLA  COGNOME NOME  DD/MM/YY" ─────────
  const headerLineIdx = lines.findIndex(l => MESI_IT.some(m => l.toUpperCase().includes(m)))
  const headerLine = headerLineIdx >= 0 ? lines[headerLineIdx] : ''
  if (headerLine) {
    const nameHM = headerLine.match(/\b([A-ZÀÈÉÌÒÙ]{2,}(?:\s+[A-ZÀÈÉÌÒÙ']{2,}){1,3})\s+\d{2}\/\d{2}\/\d{2,4}/)
    if (nameHM) {
      const parts = nameHM[1].trim().split(/\s+/)
      anag.cognome = parts[0]
      anag.nome    = parts.slice(1).join(' ')
      const beforeName = headerLine.substring(0, headerLine.indexOf(nameHM[1]))
      const matM = beforeName.match(/\b(\d{1,6})\s*$/)
      if (matM && parseInt(matM[1]) < 10000) anag.matricola = matM[1]
    }
  }

  // ── CF line: "CF  COMUNE  data_nascita  livello  data_assunzione" ──────────
  const cfM = text.match(/\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/i)
  if (cfM) {
    anag.codice_fiscale = cfM[1].toUpperCase()
    const cfLine = lines.find(l => l.includes(cfM[1])) || ''
    const afterCf = cfLine.substring(cfLine.indexOf(cfM[1]) + 16).trim()

    // Comune: all-caps word(s) before first date
    const comuneM = afterCf.match(/^([A-ZÀÈÉÌÒÙ][A-ZÀÈÉÌÒÙ\s']{1,30}?)\s+\d{2}\//)
    if (comuneM) anag.comune_residenza = comuneM[1].trim()

    // Dates in CF line: first = data_nascita, second = data_assunzione
    const cfDates = [...afterCf.matchAll(/(\d{2})\/(\d{2})\/(\d{2,4})/g)]
    if (cfDates.length >= 1) {
      const [, d, mo, y] = cfDates[0]
      const year = y.length === 2 ? (parseInt(y) > 30 ? `19${y}` : `20${y}`) : y
      anag.data_nascita = `${year}-${mo}-${d}`
    }
    if (cfDates.length >= 2) {
      const [, d, mo, y] = cfDates[1]
      const year = y.length === 2 ? (parseInt(y) < 50 ? `20${y}` : `19${y}`) : y
      anag.data_assunzione = `${year}-${mo}-${d}`
    }

    // Nota: il numero tra le due date è NR_SCATTI (scatti anzianità), NON il livello CCNL.
    // Il livello CCNL viene estratto dalla riga qualifica qui sotto.
  }

  // ── Livello CCNL + Reparto dalla riga qualifica CED ─────────────────────────
  // Formato: QUALIFICA C_COSTO(1-2 digit) COD_COSTO(3 digit) LIVELLO LIVELLO [%ptime] ORE_CCNL GG_CCNL
  // Il livello si riconosce perché appare DUE VOLTE di seguito (LIVELLO = COD_LIV)
  const livelloM = text.match(/\b(\d{3})\s+([1-8])\s+\2\s+((?:\d{1,2},\d{2}\s+)?(\d{2,3},\d{2}))\s+\d{2}\b/)
  if (livelloM) {
    anag.reparto = livelloM[1]          // 3-digit cod_costo = reparto
    anag.livello_ccnl = livelloM[2]
    anag.categoria_lavorativa = `${livelloM[2]}° livello`
    const oreCcnl = parseFloat(livelloM[4].replace(',', '.'))
    const seg = livelloM[3].trim()
    if (/\s/.test(seg)) {
      const ptPct = parseFloat(seg.split(/\s+/)[0].replace(',', '.'))
      if (ptPct >= 1 && ptPct < 100) {
        anag.tipo_contratto = 'part_time'
        anag.ore_mensili_contratto = Math.round(oreCcnl * ptPct / 100 * 100) / 100
      } else {
        anag.ore_mensili_contratto = oreCcnl
      }
    } else {
      anag.ore_mensili_contratto = oreCcnl
    }
  }

  // ── Qualifica + Tipologia ───────────────────────────────────────────────────
  const qualM = text.match(/\b(OPERAI[AO]|IMPIEGAT[AO]|QUADRO|DIRIGENTE|APPRENDISTA|FUNZIONARIO|ADDETT[AO]\s+ALLE?\s+PULIZ\w*|ADDETT[AO]|AMMINISTRATORE)\b/i)
  if (qualM) {
    anag.qualifica = qualM[1].trim().charAt(0).toUpperCase() + qualM[1].trim().slice(1).toLowerCase()
    const q = qualM[1].toUpperCase()
    if (/AMMINISTRAT/.test(q)) anag.tipologia = 'amministratore'
    else if (/IMPIEGAT/.test(q)) anag.tipologia = 'impiegato'
    else if (/OPERAI/.test(q)) anag.tipologia = 'operaio'
    else anag.tipologia = 'addetto_pulizie'
  }
  // Tipo retribuzione iniziale da tipologia (raffinato dopo lettura paga_base)
  if (!anag.tipo_retribuzione) {
    if (anag.tipologia === 'amministratore') anag.tipo_retribuzione = 'mensile_fisso'
    else if (anag.tipologia === 'impiegato') anag.tipo_retribuzione = 'giornaliera'
    else anag.tipo_retribuzione = 'oraria'
  }

  // ── Paga base + Scatti ANZ: header e valori possono essere sulla stessa riga ──
  // pdfjs spesso non inserisce \n tra header e valori nelle tabelle CED.
  // Formato mensile: valori > 100 € (e.g. 1.575,18); orario: valori < 30 (tariffa/ora)
  const pagaRow = text.match(/PAGA\s+BASE[\s\S]{0,120}?SCATTI\s+ANZ[^0-9,]*([\d.]+,\d{2,5})\s+([\d.]+,\d{2,5})\s+([\d.]+,\d{2,5})\s+([\d.]+,\d{2,5})/i)
  if (pagaRow) {
    const pb = pd(pagaRow[1]), sc = pd(pagaRow[4])
    if (pb > 100) {
      // Lavoratore mensile: paga_base = solo componente base
      anag.paga_base        = pb
      busta.contingenza     = pd(pagaRow[2])
      busta.edr             = pd(pagaRow[3])
      anag.scatti_anzianita = sc
      // Raffina tipo_retribuzione: impiegato → giornaliera, altri → mensile_fisso
      if (!anag.tipo_retribuzione || anag.tipo_retribuzione === 'oraria') {
        anag.tipo_retribuzione = anag.tipologia === 'impiegato' ? 'giornaliera' : 'mensile_fisso'
      }
    } else if (pb > 0) {
      // Lavoratore orario: moltiplica tariffa per ore CCNL
      const refH = anag.ore_mensili_contratto || 173
      anag.paga_base        = Math.round((pb + pd(pagaRow[2]) + pd(pagaRow[3]) + sc) * refH * 100) / 100
      busta.contingenza     = Math.round(pd(pagaRow[2]) * refH * 100) / 100
      busta.edr             = Math.round(pd(pagaRow[3]) * refH * 100) / 100
      if (sc > 0) anag.scatti_anzianita = Math.round(sc * refH * 100) / 100
      anag.tipo_retribuzione = 'oraria'
    }
  }
  if (!anag.paga_base) {
    const pbM = text.match(/PAGA\s+BASE[^0-9\n]*([\d.]+,\d{2,5})/i)
    if (pbM) {
      const v = pd(pbM[1])
      if (v > 100) anag.paga_base = v
      else if (v > 0) anag.paga_base = Math.round(v * 173 * 100) / 100
    }
  }

  // Ore CCNL: look for standard CCNL hours value
  const oreCcnlM = text.match(/\b(130|160|168|173|176|180),00\b/)
  if (oreCcnlM) anag.ore_ccnl = parseInt(oreCcnlM[1])

  // Superminimo
  const supM = text.match(/SUPERMIN[^0-9\n]*([\d.]+,\d{2})/i)
  if (supM) { const v = pd(supM[1]); if (v > 0) busta.superminimo = v }

  // TIPO CONTRATTO da DATA CESSAZIONE (vuoto = indeterminato, con data = determinato)
  if (/DATA\s+CESSAZIONE/.test(text)) {
    const cessM = text.match(/DATA\s+CESSAZIONE\s*(\d{2}\/\d{2}\/\d{2,4})/)
    if (cessM) {
      anag.tipo_contratto = 'determinato'
      const [, dd, mm, yy] = cessM[1].match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
      const year = yy.length === 2 ? (+yy <= 30 ? 2000 + +yy : 1900 + +yy) : +yy
      anag.data_scadenza_contratto = `${year}-${mm}-${dd}`
    } else {
      anag.tipo_contratto = anag.tipo_contratto || 'indeterminato'
    }
  }

  // ── IBAN ─────────────────────────────────────────────────────────────────────
  const ibanM = text.match(/\b(IT\d{2}[A-Z0-9]{23})\b/i)
  if (ibanM) anag.iban_dipendente = ibanM[1].toUpperCase()

  // ── Voce codes ───────────────────────────────────────────────────────────────
  // 8001 = ore lavoro ordinario
  const ore8001 = text.match(/8001[\s\S]{0,100}?(\d{2,3})[,.]00/)
  if (ore8001) { const v = parseInt(ore8001[1]); if (v >= 1 && v <= 250) busta.ore_lavorate = v }
  // 8002 = giorni (fallback)
  if (!busta.ore_lavorate) {
    const ore8002 = text.match(/8002[\s\S]{0,100}?(\d{1,2})[,.]00/)
    if (ore8002) { const v = parseInt(ore8002[1]); if (v >= 1 && v <= 31) busta.giorni_lavorati = v }
  }

  // 8025 = straordinario
  let straordTot = 0
  for (const m of text.matchAll(/8025[\s\S]{0,120}?([\d.]+,\d{2})/g)) straordTot += pd(m[1])
  if (straordTot) busta.straordinari_imp = Math.round(straordTot * 100) / 100

  // 8122 = quattordicesima, 9835/9837/9838 = incentivo L.199/25
  let altriTot = 0
  for (const code of ['8122','9835','9837','9838']) {
    const m = text.match(new RegExp(`${code}[\\s\\S]{0,120}?([\\d.]+,\\d{2})`))
    if (m) altriTot += pd(m[1])
  }
  if (altriTot) busta.altri_elementi = Math.round(altriTot * 100) / 100

  // ── Financial totals (positional: CED labels are in template header, not near values) ─────────
  // After "Tfr maturato VALUE" the summary block follows in fixed line order:
  //   [5 nums] LORDO  IMPON_INPS  CONTR1(INPS)  CONTR4(INAIL)  TOT_CONTRIB
  //   [1 num]  imposta sostitutiva (small ~3-5 €)
  //   [4 nums] IMPON_IRPEF  IRPEF_LORDA  TOT_DETR  IRPEF_PAGATA
  //   [3 nums] acconto  arrot_prec  trattenute_corpo
  //   [2 nums] arrotondamento(tiny < 1€)  NETTO_BUSTA
  const tfrMatM = text.match(/Tfr\s+maturato\s+([\d.]+,\d{2})/i)
  if (tfrMatM) {
    busta.tfr_maturato = pd(tfrMatM[1])
    // extractPageTextsFromPdf uses join(' ') — flat text, no newlines.
    // Layout after "Tfr maturato VALUE":
    //   [0]lordo [1]impon_inps [2]contr1(INPS) [3]contr4(INAIL) [4]tot_contrib
    //   [5]imposta_sost(<20, optional) | impon_irpef
    //   [irpefStart..+3] impon_irpef, irpef_lorda, tot_detr, IRPEF_PAGATA
    //   [variable] acconto/addizionali block (1-5 values per employee)
    //   [...k] arrotondamento(<1)  [k+1] NETTO_BUSTA
    //   [dati statistici row] ... IMPON_INAIL (≈ seqNums[1]) ... TFR_MESE ...
    const afterTfr = text.substring(tfrMatM.index + tfrMatM[0].length)
    const seqNums = [...afterTfr.matchAll(/([\d.]+,\d{2,5})/g)].map(m => pd(m[1]))
    if (seqNums.length >= 13 && seqNums[0] > 300) {
      busta._bp_lordo           = seqNums[0]
      busta.imponibile_inps     = seqNums[1]
      busta.contributi_inps_dip = seqNums[2]
      busta.contributo_inail    = seqNums[3]

      const irpefStart = (seqNums[5] > 0 && seqNums[5] < 20) ? 6 : 5
      busta.imponibile_irpef = seqNums[irpefStart]
      busta.irpef            = seqNums[irpefStart + 3]

      // Acconto block has variable length — scan backward for last (tiny<1, netto>100<lordo)
      const scanEnd = Math.min(seqNums.length - 1, 25)
      for (let k = scanEnd - 1; k >= irpefStart + 4; k--) {
        if (seqNums[k] < 1 && seqNums[k + 1] > 100 && seqNums[k + 1] < seqNums[0]) {
          busta._bp_netto = seqNums[k + 1]
          break
        }
      }

      // TFR mese: in DATI STATISTICI row, imponibile INAIL (≈ seqNums[1]) appears again
      // The last occurrence of that value in afterTfr is the dati-stat row → next value is TFR MESE
      const ni = Math.round(seqNums[1])
      const niStr = ni >= 1000
        ? `${Math.floor(ni / 1000)}\\.${(ni % 1000).toString().padStart(3, '0')}`
        : String(ni)
      const imponRe = new RegExp(niStr + ',\\d{2}', 'g')
      const imponOcc = [...afterTfr.matchAll(imponRe)]
      if (imponOcc.length >= 2) {
        const lastM = imponOcc[imponOcc.length - 1]
        const afterLast = afterTfr.substring(lastM.index + lastM[0].length)
        const tfrMM = afterLast.match(/^\s*([\d.]+,\d{2})/)
        if (tfrMM) {
          const v = pd(tfrMM[1])
          if (v >= 20 && v <= 700) busta.tfr_mese = v
        }
      }
    }
  }

  // Addizionali: 9117 (reg) + 9119 / 9173 (com)
  let addTot = 0
  for (const code of ['9117','9119','9173']) {
    const m = text.match(new RegExp(`${code}[\\s\\S]{0,80}?([\\d.]+,\\d{2})`))
    if (m) addTot += pd(m[1])
  }
  if (!addTot) {
    for (const m of text.matchAll(/ADDIZ\w*\s+(?:REG|COM)[A-Z.]*[^0-9]*([\d.]+,\d{2})/gi)) addTot += pd(m[1])
  }
  if (addTot) busta.addizionali = Math.round(addTot * 100) / 100

  // Altre ritenute: 8250 (cessione stipendio) + 9252 (prestito)
  let altreTot = 0
  for (const code of ['8250','9252']) {
    const m = text.match(new RegExp(`${code}[\\s\\S]{0,80}?([\\d.]+,\\d{2})`))
    if (m) altreTot += pd(m[1])
  }
  if (altreTot) busta.altre_ritenute = Math.round(altreTot * 100) / 100

  // Pass anag fields through to busta for matching
  if (anag.paga_base) busta.paga_base = anag.paga_base
  if (anag.codice_fiscale) busta.codice_fiscale = anag.codice_fiscale

  return { anag, busta }
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
  const rowsRaw = _anagData.map(r => {
    const row = {}
    ANAG_COLS.forEach(c => { if (r[c] !== undefined && r[c] !== '') row[c] = r[c] })
    if (row.paga_base) row.paga_base = parseFloat(row.paga_base) || null
    return row
  }).filter(r => r.codice_fiscale || r.cognome)
  const seenAnag = new Map()
  rowsRaw.forEach(r => seenAnag.set(r.codice_fiscale || r.cognome, r))
  const rows = Array.from(seenAnag.values())

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
  _operatoriCache = null  // forza reload fresco per evitare ID stale
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
        busta._filename   = label
        busta._format     = 'inail'
        busta._sourceFile = file
        busta._pageIndex  = p
        anag._filename    = label
        _busteData.push(busta)
        _busteAnagData.push(anag)
      } else {
        const { anag, busta } = parseCedolino(text)
        busta._filename   = label
        busta._format     = fmt
        busta._sourceFile = file
        busta._pageIndex  = p
        anag._filename    = label
        _busteData.push(busta)
        _busteAnagData.push(anag)
      }
    })
    totalPages += pages.length
  }

  if (progress) progress.textContent = `${files.length} file analizzati — ${totalPages} cedolini trovati (${_busteAnagData.length} anagrafiche estratte)`
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
  const rowsRaw = _busteAnagData.filter(r => r.codice_fiscale || r.cognome).map(r => {
    const row = {}
    ANAG_COLS.forEach(c => { if (r[c] !== undefined && r[c] !== '') row[c] = r[c] })
    if (row.paga_base) row.paga_base = +row.paga_base || null
    return row
  })
  // Deduplica per codice_fiscale: più buste dello stesso dipendente generano righe duplicate
  const seen = new Map()
  rowsRaw.forEach(r => seen.set(r.codice_fiscale || r.cognome, r))
  const rows = Array.from(seen.values())
  if (!rows.length) { showToast('Nessun profilo valido da salvare', 'error'); return }

  // Calcola costo_mensile tramite RPC preventivi per ogni operatore con livello CCNL
  await Promise.all(rows.map(async row => {
    if (!row.livello_ccnl) return
    try {
      const ore = row.ore_mensili_contratto || 173
      const { data } = await supabase.rpc('calcola_costo_operatore', {
        p_livello: row.livello_ccnl,
        p_ore_ordinarie: ore,
        p_include_ratei: true,
      })
      if (data?.costo_totale) row.costo_mensile = Math.round(data.costo_totale * 100) / 100
    } catch { /* RPC non disponibile: salta */ }
  }))

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
  _operatoriCache = null  // forza reload fresco
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
    const fmtBadge = r._format === 'inail'
      ? '<span class="badge badge-success" style="font-size:10px;margin-left:4px;">INAIL</span>'
      : r._format === 'ced'
      ? '<span class="badge badge-info" style="font-size:10px;margin-left:4px;">CED</span>'
      : ''

    return `
      <tr>
        <td>
          <select class="ti-buste-op" data-i="${i}" style="font-size:12px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 4px;min-width:150px;">
            ${opOpts}
          </select>
          ${fmtBadge}
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

// ── pdf-lib: split PDF multi-cedolino in pagine singole ──────────────────────

let _pdflibPromise = null
function ensurePdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib)
  if (_pdflibPromise) return _pdflibPromise
  _pdflibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src     = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
    s.onload  = () => resolve(window.PDFLib)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return _pdflibPromise
}

async function uploadBustePagaPdfs(rowsMeta) {
  const metas = rowsMeta.filter(m => m.sourceFile && m.pageIndex !== undefined)
  if (!metas.length) return 0

  const progress = document.getElementById('ti-buste-pdf-progress')
  if (progress) progress.textContent = 'Caricamento pdf-lib…'

  let PDFLib
  try { PDFLib = await ensurePdfLib() }
  catch { showToast('pdf-lib non disponibile — PDF non salvati', 'warning'); return 0 }

  // Raggruppa per file sorgente per caricare ogni PDF una sola volta
  const byFile = new Map()
  metas.forEach(m => {
    if (!byFile.has(m.sourceFile)) byFile.set(m.sourceFile, [])
    byFile.get(m.sourceFile).push(m)
  })

  let uploaded = 0
  const total = metas.length

  for (const [file, fileMetas] of byFile) {
    let srcPdf
    try {
      srcPdf = await PDFLib.PDFDocument.load(await file.arrayBuffer())
    } catch (e) {
      console.error('[PDF split] apertura fallita:', file.name, e)
      continue
    }

    for (const meta of fileMetas) {
      try {
        const newPdf = await PDFLib.PDFDocument.create()
        const [page] = await newPdf.copyPages(srcPdf, [meta.pageIndex])
        newPdf.addPage(page)
        const pdfBytes = await newPdf.save()

        const mese2 = String(meta.mese).padStart(2, '0')
        const path  = `${meta.operatore_id}/${meta.anno}-${mese2}.pdf`

        await supabase.storage.from('buste-paga').upload(path, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        })
        await supabase.from('buste_paga')
          .update({ file_path: path })
          .eq('operatore_id', meta.operatore_id)
          .eq('anno', meta.anno)
          .eq('mese', meta.mese)

        uploaded++
        if (progress) progress.textContent = `PDF salvati: ${uploaded}/${total}…`
      } catch (e) {
        console.error('[PDF split] upload fallito:', meta, e)
      }
    }
  }

  if (progress) progress.textContent = ''
  return uploaded
}

async function confirmBusteImport() {
  if (!_busteData.length) return
  const selects = document.getElementById('ti-buste-tbody')?.querySelectorAll('.ti-buste-op')

  // 1. Upsert profili from INAIL data (creates new profiles or updates existing ones)
  let upsertedProfiles = {}   // CF → id mapping after upsert
  if (_busteAnagData.length) {
    const anagRowsRaw = _busteAnagData.filter(r => r.codice_fiscale || r.cognome).map(r => {
      const row = {}
      ANAG_COLS.forEach(c => { if (r[c] !== undefined && r[c] !== '') row[c] = r[c] })
      if (row.paga_base) row.paga_base = +row.paga_base || null
      return row
    })
    const seenBuste = new Map()
    anagRowsRaw.forEach(r => seenBuste.set(r.codice_fiscale || r.cognome, r))
    const anagRows = Array.from(seenBuste.values())
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
  const rows     = []
  const rowsMeta = []   // per upload PDF dopo il salvataggio

  _busteData.forEach((r, i) => {
    let operatore_id = selects?.[i]?.value

    // If not manually set, try to match from freshly loaded profiles
    if (!operatore_id) {
      const cf   = r.codice_fiscale || _busteAnagData[i]?.codice_fiscale
      const cogn = r.cognome        || _busteAnagData[i]?.cognome
      if (cf && upsertedProfiles[cf]) operatore_id = upsertedProfiles[cf]
      else if (cf)   operatore_id = ops.find(o => o.codice_fiscale === cf)?.id || ''
      else if (cogn) operatore_id = ops.find(o => o.cognome?.toLowerCase() === cogn?.toLowerCase())?.id || ''
    }

    if (!operatore_id) return
    const mese = r._bp_mese || +r.mese
    const anno = r._bp_anno || +r.anno
    if (!mese || !anno) return

    const lordo      = +(r._bp_lordo || r.totale_lordo || 0)
    const imponInps  = +(r.imponibile_inps || lordo)
    const inpsAz     = Math.round(imponInps * 0.285 * 100) / 100
    const inailAz    = Math.round(imponInps * 0.030 * 100) / 100
    const tfrCalc    = Math.round(lordo / 13.5 * 100) / 100
    const rateiCalc  = Math.round(lordo * (1 / 12 + 1 / 12) * 100) / 100
    const costoAz    = Math.round((lordo + inpsAz + inailAz + tfrCalc + rateiCalc) * 100) / 100

    rows.push({
      operatore_id,
      anno,
      mese,
      paga_base:           +(r.paga_base || 0),
      contingenza:         +(r.contingenza || 0),
      edr:                 +(r.edr || 0),
      superminimo:         +(r.superminimo || 0),
      scatti_anzianita:    +(r.scatti_anzianita || 0),
      straordinari_imp:    +(r.straordinari_imp || 0),
      indennita_varie:     +(r.indennita_varie || 0),
      altri_elementi:      +(r.altri_elementi || 0),
      contributi_inps_dip: +(r.contributi_inps_dip || 0),
      irpef:               +(r.irpef || 0),
      addizionali:         +(r.addizionali || 0),
      altre_ritenute:      +(r.altre_ritenute || 0),
      tfr_mese:            +(r.tfr_mese || 0),
      ore_lavorate:        +(r.ore_lavorate || 0),
      totale_lordo:        lordo,
      totale_netto:        +(r._bp_netto || r.totale_netto || 0),
      totale_ritenute:     +((r.irpef||0) + (r.contributi_inps_dip||0) + (r.addizionali||0) + (r.altre_ritenute||0)),
      imponibile_inps:     imponInps,
      imponibile_inail:    imponInps,
      contributi_inps_az:  inpsAz,
      inail:               inailAz,
      costo_aziendale:     costoAz,
    })
    rowsMeta.push({ operatore_id, anno, mese, sourceFile: r._sourceFile, pageIndex: r._pageIndex })
  })

  if (!rows.length) { showToast('Nessuna busta abbinata a un operatore', 'error'); return }

  // Deduplica per operatore_id+anno+mese: più pagine PDF dello stesso cedolino generano duplicati
  const seenBustePaga = new Map()
  rows.forEach((r, i) => { seenBustePaga.set(`${r.operatore_id}-${r.anno}-${r.mese}`, { row: r, meta: rowsMeta[i] }) })
  const dedupRows     = Array.from(seenBustePaga.values()).map(v => v.row)
  const dedupRowsMeta = Array.from(seenBustePaga.values()).map(v => v.meta)
  rows.length = 0; rows.push(...dedupRows)
  rowsMeta.length = 0; rowsMeta.push(...dedupRowsMeta)

  // Valida operatore_id contro profili attuali prima dell'upsert
  const { data: validProfiles } = await supabase.from('profili').select('id')
  const validIds = new Set((validProfiles || []).map(p => p.id))
  const invalidRows = rows.filter(r => !validIds.has(r.operatore_id))
  if (invalidRows.length) {
    console.error('[import] operatore_id non trovati in profili:', invalidRows.map(r => r.operatore_id))
    showToast(`${invalidRows.length} buste con operatore non trovato — ricarica la pagina e riprova`, 'error')
    return
  }

  const { error } = await supabase.from('buste_paga').upsert(rows, { onConflict: 'operatore_id,anno,mese' })
  if (error) { showToast('Errore import buste: ' + error.message, 'error'); return }

  // Aggiorna profili.costo_mensile con il costo_aziendale effettivo dell'ultimo mese importato
  const latestByOp = {}
  rows.forEach(r => {
    const ex = latestByOp[r.operatore_id]
    if (!ex || r.anno > ex.anno || (r.anno === ex.anno && r.mese > ex.mese)) latestByOp[r.operatore_id] = r
  })
  await Promise.all(
    Object.values(latestByOp).map(r =>
      supabase.from('profili').update({ costo_mensile: r.costo_aziendale }).eq('id', r.operatore_id)
    )
  )

  const nAnag = _busteAnagData.length
  showToast(`${rows.length} buste importate${nAnag ? ` + ${nAnag} profili aggiornati` : ''} — salvataggio PDF in corso…`, 'success')

  const nPdf = await uploadBustePagaPdfs(rowsMeta)
  if (nPdf > 0) showToast(`${nPdf} PDF salvati nello storage`, 'success')

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
