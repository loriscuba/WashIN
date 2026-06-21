import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

const STATO_BADGE = { caricata: 'badge-warning', verificata: 'badge-info', pagata: 'badge-success' }

const FMT_EUR = v => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0)

let _currentOpId = null
let _operatori = []

// ── PDF.js — caricamento lazy ─────────────────────────────────────────────────

let _pdfjsPromise = null
function ensurePdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (_pdfjsPromise) return _pdfjsPromise
  _pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
      resolve(window.pdfjsLib)
    }
    s.onerror = reject
    document.head.appendChild(s)
  })
  return _pdfjsPromise
}

// ── Tesseract.js OCR — caricamento lazy ───────────────────────────────────────

let _tesseractPromise = null
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (_tesseractPromise) return _tesseractPromise
  _tesseractPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    s.onload = () => resolve(window.Tesseract)
    s.onerror = () => { _tesseractPromise = null; reject(new Error('Tesseract load failed')) }
    document.head.appendChild(s)
  })
  return _tesseractPromise
}

async function extractTextFromFile(file, onProgress) {
  if (!file) return ''

  if (file.type === 'application/pdf') {
    try {
      const pdfjs = await ensurePdfJs()
      const buf = await file.arrayBuffer()
      const pdf = await pdfjs.getDocument({ data: buf }).promise
      const numPages = Math.min(pdf.numPages, 4)

      // Try digital text extraction first
      let text = ''
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(it => it.str).join(' ') + '\n'
      }

      // If no text found (scanned PDF), fall back to OCR via canvas render
      if (text.trim().length < 30) {
        if (onProgress) onProgress(0)
        const Tesseract = await ensureTesseract()
        text = ''
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2.0 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          const pageProgress = pct => {
            if (onProgress) onProgress(Math.round(((i - 1) / numPages + pct / 100 / numPages) * 100))
          }
          // pass canvas directly — avoids heavy PNG encoding step
          const result = await Tesseract.recognize(canvas, 'ita+eng', {
            logger: m => { if (m.status === 'recognizing text') pageProgress(Math.round(m.progress * 100)) }
          })
          text += result.data.text + '\n'
        }
      }
      return text
    } catch (err) {
      console.warn('PDF text extraction:', err)
      return ''
    }
  }

  if (file.type.startsWith('image/')) {
    try {
      const Tesseract = await ensureTesseract()
      const url = URL.createObjectURL(file)
      try {
        const result = await Tesseract.recognize(url, 'ita+eng', {
          logger: m => {
            if (m.status === 'recognizing text' && onProgress) {
              onProgress(Math.round(m.progress * 100))
            }
          }
        })
        return result.data.text
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.warn('OCR failed:', err)
      return ''
    }
  }
  return ''
}

// ── Estrazione testo pagina per pagina (per PDF multi-cedolino) ──────────────

async function extractPageTextsFromPdf(file, onProgress) {
  if (!file || file.type !== 'application/pdf') {
    const text = await extractTextFromFile(file, onProgress)
    return text ? [text] : []
  }
  try {
    const pdfjs = await ensurePdfJs()
    const buf = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buf }).promise
    const numPages = pdf.numPages
    const pages = []

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      let text = content.items.map(it => it.str).join(' ') + '\n'

      if (text.trim().length < 30) {
        const Tesseract = await ensureTesseract()
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        const result = await Tesseract.recognize(canvas, 'ita+eng', {
          logger: m => {
            if (m.status === 'recognizing text' && onProgress)
              onProgress(Math.round(((i - 1) / numPages + m.progress / numPages) * 100))
          }
        })
        text = result.data.text + '\n'
      } else if (onProgress) {
        onProgress(Math.round((i / numPages) * 100))
      }
      pages.push(text)
    }
    return pages
  } catch (err) {
    console.warn('PDF page extraction:', err)
    return []
  }
}

// ── Parsing campi da testo estratto ──────────────────────────────────────────

function parseDocumentText(text, docType) {
  const r = {}
  if (!text) return r

  // Codice Fiscale
  const cfM = text.match(/\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\b/i)
  if (cfM) r.codice_fiscale = cfM[1].toUpperCase()

  // IBAN italiano
  const ibanM = text.match(/\b(IT\s*\d{2}\s*[A-Z0-9]\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{3})\b/i)
  if (ibanM) r.iban_dipendente = ibanM[1].replace(/\s+/g, '').toUpperCase()

  if (docType === 'busta_paga') {
    const pd = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0

    // CF + matricola + cognome + nome (formato CED: "CF MATR COGNOME NOME" su una riga)
    const cfLineM = text.match(/([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z0-9][0-9]{3}[A-Z])\s+(\d{4,8})\s+([A-Z][A-Z\-']+)\s+([A-Z][A-Z\-']+)/i)
    if (cfLineM) {
      if (!r.codice_fiscale) r.codice_fiscale = cfLineM[1].toUpperCase()
      r.matricola = cfLineM[2]
      r.cognome = cfLineM[3].toUpperCase()
      r.nome = cfLineM[4].toUpperCase()
    }
    // Matricola fallback da label
    if (!r.matricola) {
      const matrM = text.match(/[Mm]atricola[\s:]+([A-Z0-9]{3,12})/i)
      if (matrM) r.matricola = matrM[1]
    }

    // Mese + anno + netto (CED ultima riga: "... Gennaio 2023 3.551,00")
    const mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
    const mNM = text.match(new RegExp(`(${mesiNomi.join('|')})\\s+(\\d{4})\\s+([\\d.]+,\\d{2})\\s*$`, 'im'))
    if (mNM) {
      const idx = mesiNomi.indexOf(mNM[1])
      if (idx >= 0) { r._bp_mese = idx + 1; r._bp_anno = parseInt(mNM[2]) }
      r._bp_netto = pd(mNM[3])
    }
    // Fallback: "Competenza: Gennaio 2024" oppure "03/2024"
    if (!r._bp_mese) {
      const compM = text.match(/[Cc]ompetenza[\s:]+([A-Za-z]+)\s+(\d{4})/)
      if (compM) {
        const idx = MESI.findIndex(m => m.toLowerCase().startsWith(compM[1].toLowerCase().slice(0,3)))
        if (idx >= 0) { r._bp_mese = idx + 1; r._bp_anno = parseInt(compM[2]) }
      }
      if (!r._bp_mese) {
        const mmyyM = text.match(/(\d{2})\/(\d{4})/)
        if (mmyyM) { r._bp_mese = parseInt(mmyyM[1]); r._bp_anno = parseInt(mmyyM[2]) }
      }
    }

    // Paga base = Minimo contrattuale
    const minimoPos = text.search(/\bMinimo\b/)
    if (minimoPos >= 0) {
      const mnM = text.substring(minimoPos).match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})/)
      if (mnM) r.paga_base = pd(mnM[1])
    } else {
      const pbM = text.match(/[Pp]aga\s+[Bb]ase[\s:€]+([0-9]{1,6}[.,][0-9]{2})/)
      if (pbM) r.paga_base = parseFloat(pbM[1].replace(',', '.'))
    }

    // Lordo: massimo tra i valori che compaiono in coppia identica adiacente (CED: lordo + lordo annuale)
    const pairMs = [...text.matchAll(/\b(\d[\d.]+,\d{2})\s+\1\b/g)]
    if (pairMs.length) r._bp_lordo = Math.max(...pairMs.map(m => pd(m[1])))
    if (!r._bp_lordo) {
      const lM = text.match(/[Ll]ordo[\s:€a-z]+([0-9]{1,6}[.,][0-9]{2})/)
      if (lM) r._bp_lordo = parseFloat(lM[1].replace(',', '.'))
    }

    // Netto fallback da label
    if (!r._bp_netto) {
      const nettoM = text.match(/[Nn]etto[\s:€a-z]+([0-9]{1,6}[.,][0-9]{2})/)
      if (nettoM) r._bp_netto = parseFloat(nettoM[1].replace(',', '.'))
    }

    // Cognome/nome fallback (prima riga tutto maiuscolo "COGNOME NOME")
    if (!r.cognome) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      for (const line of lines.slice(0, 8)) {
        const parole = line.match(/^([A-ZÀÈÉÌÒÙ]{2,}\s+[A-ZÀÈÉÌÒÙ]{2,}(?:\s+[A-ZÀÈÉÌÒÙ]{2,})?)$/)
        if (parole) {
          const parts = parole[1].split(/\s+/)
          r.cognome = parts[0]
          r.nome = parts.slice(1).join(' ')
          break
        }
      }
    }

    // CED Teamsystem: LIVELLO + ORE MENSILI + part-time
    // Riga qualifica: "... REPARTO LIVELLO COD_LIV [%PTIME ORE_CCNL] GG_CCNL"
    // Pattern: 3-digit cod_costo, livello (1-8), stesso livello ripetuto, [%ptime], ore_mensili, gg_ccnl
    const livelloM = text.match(/\b(\d{3})\s+([1-8])\s+\2\s+((?:\d{1,2},\d{2}\s+)?(\d{2,3},\d{2}))\s+\d{2}\b/)
    if (livelloM) {
      r.livello_ccnl = livelloM[2]
      r.ore_mensili_contratto = pd(livelloM[4])
      const seg = livelloM[3].trim()
      if (/\s/.test(seg)) {
        const ptPct = pd(seg.split(/\s+/)[0])
        if (ptPct >= 1 && ptPct < 100) r._is_part_time = true
      }
    }

    // QUALIFICA: parola/e maiuscole prima del cod_costo + livello
    if (!r.qualifica) {
      const qualM = text.match(/\b([A-Z][A-Z\s.]{2,30}?)\s+\d{1,2}\s+\d{3}\s+([1-8])\s+\2[\s,]/)
      if (qualM) r.qualifica = qualM[1].trim().replace(/\s+/g, ' ')
    }

    // PAGA BASE da CED (fallback se non trovata sopra)
    if (!r.paga_base) {
      const pbCedM = text.match(/PAGA\s+BASE\s+CONTINGEN[^\n]+\n([\d.]+,\d{2})\s/)
      if (pbCedM) r.paga_base = pd(pbCedM[1])
    }

    // SCATTI ANZIANITÀ: 4° valore della riga dati sotto header "SCATTI ANZ"
    const scPos = text.search(/SCATTI\s+ANZ/)
    if (scPos >= 0) {
      const scRow = text.substring(scPos).match(/[\r\n]+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)/)
      if (scRow) {
        const rawSc = pd(scRow[4])
        if (rawSc >= 1) {
          r.scatti_anzianita = rawSc
        } else if (rawSc > 0 && r.ore_mensili_contratto) {
          r.scatti_anzianita = Math.round(rawSc * r.ore_mensili_contratto * 100) / 100
        }
      }
    }

    // DATA ASSUNZIONE: ultima data DD/MM/YY nella riga del CF
    if (!r.data_assunzione) {
      const cfRowM = text.match(/[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z][^\n]+/)
      if (cfRowM) {
        const allDates = [...cfRowM[0].matchAll(/\b(\d{2})\/(\d{2})\/(\d{2})\b/g)].filter(m => +m[2] >= 1 && +m[2] <= 12)
        if (allDates.length >= 2) {
          const [, dd, mm, yy] = allDates[allDates.length - 1]
          r.data_assunzione = `${+yy <= 30 ? 2000 + +yy : 1900 + +yy}-${mm}-${dd}`
        }
      }
    }

    // CCNL + categoria lavorativa
    if (!r.ccnl && /pulizie|multiservizi/i.test(text)) r.ccnl = 'Pulizie e Multiservizi'
    if (r.livello_ccnl && !r.categoria_lavorativa) r.categoria_lavorativa = `${r.livello_ccnl}° livello`
  }

  if (docType === 'carta_identita') {
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)
    console.log('[OCR carta_identita] testo grezzo:\n' + text)

    // Estrae il primo nome/cognome valido dalla riga ignorando artefatti OCR
    const CONNECTORS = new Set(['DE', 'DI', 'DEL', 'DELLA', 'DEGLI', 'LO', 'LA', 'LE', 'D'])
    const extractName = (line) => {
      const words = line.toUpperCase().split(/\s+/)
      const result = []
      for (const w of words) {
        if (/^[A-ZÀÈÉÌÒÙŁ\-']{2,}$/.test(w)) {
          result.push(w)
          if (!CONNECTORS.has(w)) break
        } else break
      }
      return result.length ? result.join(' ') : null
    }

    // Controlla se una riga è un'etichetta CIE (non un valore)
    const isLabel = (s) => /COGNOME|SURNAME|NOME|NAME|LUOGO|BIRTH|SESSO|SEX|STATURA|HEIGHT|EMISSIONE|ISSUING|SCADENZA|EXPIRY|FIRMA|HOLDER|CITTADINANZA|NATIONALITY|CODICE|FISCAL|COMUNE|MUNICIPALITY|IDENTIT|MINISTERO|REPUBBLICA/i.test(s)

    for (let i = 0; i < lines.length; i++) {
      const up = lines[i].toUpperCase()

      // Cognome
      if (up.includes('COGNOME') && !r.cognome) {
        for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
          if (!isLabel(lines[j])) {
            const n = extractName(lines[j])
            if (n) { r.cognome = n; break }
          }
        }
      }

      // Nome (riga con "NOME" ma non "COGNOME")
      if (up.includes('NOME') && !up.includes('COGNOME') && !r.nome) {
        for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
          if (!isLabel(lines[j]) && lines[j].toUpperCase() !== r.cognome) {
            const n = extractName(lines[j])
            if (n) { r.nome = n; break }
          }
        }
      }

      // Codice Fiscale
      if ((up.includes('CODICE') || up.includes('FISCAL')) && !r.codice_fiscale) {
        for (let j = i; j <= i + 3 && j < lines.length; j++) {
          const m = lines[j].match(/([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z0-9][0-9]{3}[A-Z])/i)
          if (m) { r.codice_fiscale = m[1].toUpperCase(); break }
        }
      }
    }

    // Fallback MRZ: riga "COGNOME<<NOME<<<" nell'area machine-readable
    if (!r.nome) {
      for (const line of lines) {
        const m = line.match(/([A-Z]{2,})<<([A-Z]+)/)
        if (m) {
          if (!r.cognome) r.cognome = m[1]
          r.nome = m[2]
          break
        }
      }
    }

    // Data di nascita: cerca "01.02.1985" o "01/02/1985"
    const dataN = text.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/)
    if (dataN) r.data_nascita = `${dataN[3]}-${dataN[2]}-${dataN[1]}`

    // CF fallback sull'intero testo (cattura anche casi senza label vicina)
    if (!r.codice_fiscale) {
      const m = text.match(/([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z0-9][0-9]{3}[A-Z])/i)
      if (m) r.codice_fiscale = m[1].toUpperCase()
    }
  }

  return r
}

// ── Anteprima documento ───────────────────────────────────────────────────────

function showDocumentPreview(file, container) {
  if (!container) return
  const url = URL.createObjectURL(file)
  if (file.type === 'application/pdf') {
    container.innerHTML = `<iframe src="${url}#toolbar=0" style="width:100%;height:100%;min-height:420px;border:none;border-radius:6px;" title="Anteprima PDF"></iframe>`
  } else {
    container.innerHTML = `<img src="${url}" style="max-width:100%;max-height:520px;object-fit:contain;border-radius:6px;display:block;margin:auto;" alt="Anteprima documento">`
  }
  container.style.display = ''
}

// ── Modal nuovo operatore ─────────────────────────────────────────────────────

function openModalNuovoOp() {
  const modal = document.getElementById('hr-nuovo-modal')
  if (!modal) return
  const form = document.getElementById('hr-nuovo-form')
  if (form) form.reset()
  const preview = document.getElementById('hr-nuovo-preview')
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none' }
  const estrato = document.getElementById('hr-nuovo-estratto')
  if (estrato) estrato.innerHTML = ''
  modal.classList.add('active')
}

async function handleNuovoFileChange(file) {
  if (!file) return
  const docType = document.querySelector('input[name="hr-doc-type"]:checked')?.value || 'busta_paga'
  const preview = document.getElementById('hr-nuovo-preview')
  showDocumentPreview(file, preview)

  const estratoDiv = document.getElementById('hr-nuovo-estratto')
  if (estratoDiv) estratoDiv.innerHTML = '<span style="color:var(--gray-500);font-size:12px;">⏳ Analisi documento in corso…</span>'

  const text = await extractTextFromFile(file, pct => {
    if (estratoDiv) estratoDiv.innerHTML = `<span style="color:var(--gray-500);font-size:12px;">⏳ OCR in corso… ${pct}%</span>`
  })
  const parsed = parseDocumentText(text, docType)

  // Popola i campi del form
  const form = document.getElementById('hr-nuovo-form')
  if (form) {
    const set = (name, val) => { if (val != null) { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val } }
    set('nome', parsed.nome)
    set('cognome', parsed.cognome)
    set('codice_fiscale', parsed.codice_fiscale)
    set('iban_dipendente', parsed.iban_dipendente)
    set('matricola', parsed.matricola)
    set('paga_base', parsed.paga_base)
    set('qualifica', parsed.qualifica)
    set('data_assunzione', parsed.data_assunzione)
    if (parsed._is_part_time) set('tipo_contratto', 'part_time')
    // Memorizza dati busta per salvataggio
    form.dataset.bpMese = parsed._bp_mese || ''
    form.dataset.bpAnno = parsed._bp_anno || ''
    form.dataset.bpLordo = parsed._bp_lordo || ''
    form.dataset.bpNetto = parsed._bp_netto || ''
    form.dataset.dataNascita = parsed.data_nascita || ''
    // Memorizza dati retribuzione per salvataggio (non sono in hr-nuovo-form)
    form.dataset.retribLivello   = parsed.livello_ccnl || ''
    form.dataset.retribCcnl      = parsed.ccnl || ''
    form.dataset.retribCategoria = parsed.categoria_lavorativa || ''
    form.dataset.retribOre       = parsed.ore_mensili_contratto != null ? parsed.ore_mensili_contratto : ''
    form.dataset.retribScatti    = parsed.scatti_anzianita != null ? parsed.scatti_anzianita : ''
  }

  if (estratoDiv) {
    const campi = Object.entries(parsed)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `<strong>${k.replace('_', ' ')}:</strong> ${v}`)
    estratoDiv.innerHTML = campi.length
      ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;font-size:12px;line-height:1.8;">${campi.join('<br>')}</div>`
      : '<span style="color:var(--gray-400);font-size:12px;">Nessun dato estratto automaticamente — compila manualmente</span>'
  }
}

// ── Auto-fill busta paga da PDF (formato CED) ─────────────────────────────────

async function handleBustaFileChange(file) {
  if (!file) return
  const form = document.getElementById('hr-busta-form')
  if (!form) return

  const titleEl = document.getElementById('hr-busta-title')
  if (titleEl) titleEl.textContent = 'Analisi PDF in corso…'

  const text = await extractTextFromFile(file)
  if (!text?.trim()) {
    if (titleEl) titleEl.textContent = 'Nuova busta paga'
    return
  }

  const pd = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
  const set = (name, val) => {
    if (val == null || val === 0 || val === '') return
    const el = form.querySelector(`[name="${name}"]`)
    if (el) el.value = typeof val === 'number' ? val.toFixed(2) : val
  }
  const setRaw = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el && val != null) el.value = val }

  // Mese + anno + netto (CED ultima riga: "Gennaio 2023 3.551,00")
  const mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
  const mNM = text.match(new RegExp(`(${mesiNomi.join('|')})\\s+(\\d{4})\\s+([\\d.]+,\\d{2})\\s*$`, 'im'))
  let nettoPdf = 0
  if (mNM) {
    const idx = mesiNomi.indexOf(mNM[1])
    if (idx >= 0) { setRaw('mese', idx + 1); setRaw('anno', mNM[2]) }
    nettoPdf = pd(mNM[3])
    if (titleEl) titleEl.textContent = `Busta paga — ${mNM[1]} ${mNM[2]}`
  } else if (titleEl) titleEl.textContent = 'Nuova busta paga'
  if (!form.querySelector('[name="mese"]')?.value) {
    const compM = text.match(/[Cc]ompetenza[\s:]+([A-Za-z]+)\s+(\d{4})/)
    if (compM) {
      const idx = MESI.findIndex(m => m.toLowerCase().startsWith(compM[1].toLowerCase().slice(0, 3)))
      if (idx >= 0) { setRaw('mese', idx + 1); setRaw('anno', compM[2]) }
    }
  }

  // Paga base (Minimo) + Superminimo
  const minimoPos = text.search(/\bMinimo\b/)
  if (minimoPos >= 0) {
    const mnM = text.substring(minimoPos).match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})/)
    if (mnM) { set('paga_base', pd(mnM[1])); set('superminimo', pd(mnM[2])) }
  }

  // Premio/Indennità varie
  const premioM = text.match(/Premio\s+Prod[\w.]*\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/)
  if (premioM) set('indennita_varie', pd(premioM[1]))

  // Altri elementi (fringe benefits, rimborso spese, incentivi)
  const fringeM  = text.match(/[Ff]ringe\s+[Bb]enefits[^0-9]*([\d.]+,\d{2})/)
  const rimborsoM = text.match(/[Rr]imborso\s+spese[^0-9]*([\d.]+,\d{2})/)
  const inceM    = text.match(/[Ii]ncentivo[^0-9]*([\d.]+,\d{2})/)
  const altriEl  = (fringeM ? pd(fringeM[1]) : 0) + (rimborsoM ? pd(rimborsoM[1]) : 0) + (inceM ? pd(inceM[1]) : 0)
  if (altriEl) set('altri_elementi', altriEl)

  // IRPEF: "imp_fiscale irpef giorni irpef" nel blocco bottom CED
  const irpefM = text.match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+\d{1,2}\s+\2/)
  if (irpefM) set('irpef', pd(irpefM[2]))

  // INPS dipendente: imponibile × 3 poi due valori → ultimo = ritenute sociali
  const ritSocM = text.match(/([\d.]+,\d{2})\s+\1\s+\1\s+[\d.,]+\s+([\d.]+,\d{2})/)
  if (ritSocM) set('contributi_inps_dip', pd(ritSocM[2]))

  // Addizionali regionali + comunali
  const addRegM = text.match(/[Aa]ddizion[\w.]*regionale[^\d]*([\d.]+,\d{2})/)
  const addComM = text.match(/[Aa]ddizion[\w.]*comunale[^\d]*([\d.]+,\d{2})/)
  const addTot  = (addRegM ? pd(addRegM[1]) : 0) + (addComM ? pd(addComM[1]) : 0)
  if (addTot) set('addizionali', addTot)

  // Altre ritenute (trattenuta mensa + Ctr. IVS)
  const mensaM = text.match(/[Tt]rattenuta\s+mensa[^0-9]*([\d.]+,\d{2})/)
  const ivsM   = text.match(/[Cc]tr\.\s*IVS[^0-9]*([\d.]+,\d{2})/)
  const altrRit = (mensaM ? pd(mensaM[1]) : 0) + (ivsM ? pd(ivsM[1]) : 0)
  if (altrRit) set('altre_ritenute', altrRit)

  // TFR mensile
  const tfrM = text.match(/[Tt]fr\s+a\s+fdo[^0-9]*([\d.]+,\d{2})/)
  if (tfrM) set('tfr_mese', pd(tfrM[1]))

  // Ore lavorate
  const oreLavM = text.match(/ORE\s+LAVORATE[^\d]*([\d]+(?:[,.]\d{0,2})?)/)
  if (oreLavM) {
    const el = form.querySelector('[name="ore_lavorate"]')
    if (el) el.value = parseFloat(oreLavM[1].replace(',', '.'))
  }

  // Ricalcola totali dai componenti
  ricalcola(form)

  // Override totali con valori letti direttamente dal PDF
  const pairMs = [...text.matchAll(/\b(\d[\d.]+,\d{2})\s+\1\b/g)]
  let lordoPdf = 0
  if (pairMs.length) lordoPdf = Math.max(...pairMs.map(m => pd(m[1])))
  if (lordoPdf) {
    const lEl = form.querySelector('[name="totale_lordo"]')
    if (lEl) lEl.value = lordoPdf.toFixed(2)
  }
  if (nettoPdf) {
    const nEl = form.querySelector('[name="totale_netto"]')
    if (nEl) nEl.value = nettoPdf.toFixed(2)
  }
  // Totale trattenute: "competenze trattenute 0,XX 0,XX" (arrotondamenti a fine riga)
  const totTrM = text.match(/([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+0,\d{2}\s+0,\d{2}/)
  if (totTrM) {
    const rEl = form.querySelector('[name="totale_ritenute"]')
    if (rEl) rEl.value = pd(totTrM[2]).toFixed(2)
  }
  // Ricalcola costo aziendale usando il lordo PDF
  if (lordoPdf) {
    const tfr    = parseFloat(form.querySelector('[name="tfr_mese"]')?.value || 0)
    const inpsAz = parseFloat(form.querySelector('[name="contributi_inps_az"]')?.value || 0)
    const inail  = parseFloat(form.querySelector('[name="inail"]')?.value || 0)
    const caEl   = form.querySelector('[name="costo_aziendale"]')
    if (caEl) caEl.value = (lordoPdf + inpsAz + inail + tfr).toFixed(2)
  }

  // Campi retribuzione da CED (livello, CCNL, ore, part-time, scatti)
  const parsedRetrib = parseDocumentText(text, 'busta_paga')
  set('scatti_anzianita', parsedRetrib.scatti_anzianita)
  // Memorizza in dataset così saveBustaPaga può aggiornare profili in automatico
  form.dataset.retribLivello   = parsedRetrib.livello_ccnl || ''
  form.dataset.retribCcnl      = parsedRetrib.ccnl || ''
  form.dataset.retribCategoria = parsedRetrib.categoria_lavorativa || ''
  form.dataset.retribOre       = parsedRetrib.ore_mensili_contratto != null ? parsedRetrib.ore_mensili_contratto : ''
  form.dataset.retribScatti    = parsedRetrib.scatti_anzianita != null ? parsedRetrib.scatti_anzianita : ''
  form.dataset.retribPartTime  = parsedRetrib._is_part_time ? '1' : ''
  // Precompila anche hr-retrib-form (se aperto) per feedback visivo immediato
  const retribForm = document.getElementById('hr-retrib-form')
  if (retribForm) {
    const setR = (name, val) => { if (val != null && val !== '') { const el = retribForm.querySelector(`[name="${name}"]`); if (el) el.value = val } }
    setR('ccnl', parsedRetrib.ccnl)
    setR('livello_ccnl', parsedRetrib.livello_ccnl)
    setR('categoria_lavorativa', parsedRetrib.categoria_lavorativa)
    if (parsedRetrib.ore_mensili_contratto) setR('ore_mensili_contratto', parsedRetrib.ore_mensili_contratto.toFixed(2))
    if (parsedRetrib.scatti_anzianita)      setR('scatti_anzianita',      parsedRetrib.scatti_anzianita.toFixed(2))
    if (parsedRetrib._is_part_time)         setR('tipo_contratto',        'part_time')
  }
}

async function saveNuovoOperatore() {
  const form = document.getElementById('hr-nuovo-form')
  if (!form) return
  const g = name => form.querySelector(`[name="${name}"]`)?.value?.trim() || null

  if (!g('cognome') && !g('nome')) {
    showToast('Inserisci almeno nome o cognome', 'error')
    return
  }

  const fields = {
    nome: g('nome'),
    cognome: g('cognome'),
    codice_fiscale: g('codice_fiscale') ? g('codice_fiscale').toUpperCase() : null,
    email: g('email'),
    telefono: g('telefono'),
    matricola: g('matricola'),
    iban_dipendente: g('iban_dipendente'),
    qualifica: g('qualifica'),
    data_assunzione: g('data_assunzione') || null,
    tipo_contratto: g('tipo_contratto') || null,
    ccnl: g('ccnl') || form.dataset.retribCcnl || null,
    paga_base: g('paga_base') ? parseFloat(g('paga_base')) : null,
    ruolo: 'operatore',
    attivo: true,
    livello_ccnl:          form.dataset.retribLivello || null,
    categoria_lavorativa:  form.dataset.retribCategoria || null,
    ore_mensili_contratto: form.dataset.retribOre ? parseFloat(form.dataset.retribOre) : null,
    scatti_anzianita:      form.dataset.retribScatti ? parseFloat(form.dataset.retribScatti) : null,
  }

  try {
    const { data, error } = await supabase.from('profili').insert(fields).select('id').single()
    if (error) throw error

    const newId = data.id

    // Upload documento + salva busta paga se presente
    const fileInput = form.querySelector('[name="file"]')
    const file = fileInput?.files?.[0]
    const docType = document.querySelector('input[name="hr-doc-type"]:checked')?.value
    let filePath = null

    if (file && newId) {
      const ext = file.name.split('.').pop() || 'pdf'
      const folder = docType === 'busta_paga' ? 'buste-paga' : 'documenti-hr'
      const path = `${newId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(folder).upload(path, file)
      if (!upErr) filePath = path
    }

    // Se busta paga: salva record busta
    if (docType === 'busta_paga' && newId && (form.dataset.bpMese || form.dataset.bpAnno)) {
      const bpPayload = {
        operatore_id: newId,
        mese: parseInt(form.dataset.bpMese) || new Date().getMonth() + 1,
        anno: parseInt(form.dataset.bpAnno) || new Date().getFullYear(),
        paga_base: fields.paga_base || 0,
        totale_lordo: parseFloat(form.dataset.bpLordo) || 0,
        totale_netto: parseFloat(form.dataset.bpNetto) || 0,
        file_path: filePath,
        stato: 'caricata',
      }
      await supabase.from('buste_paga').insert(bpPayload)
    }

    showToast('Operatore creato', 'success')
    document.getElementById('hr-nuovo-modal')?.classList.remove('active')
    _operatori = await loadOperatoriHR()
    renderTabellaHR(_operatori)
    // Apri subito l'anagrafica del nuovo operatore
    await openModalAnag(newId)
  } catch (err) {
    showToast('Errore creazione operatore', 'error')
    console.error(err)
  }
}

// ── Selects CCNL / INAIL per scheda retribuzione ─────────────────────────────

let _ccnlOpts = null
let _inailOpts = null

async function loadCcnlOpts() {
  if (_ccnlOpts) return _ccnlOpts
  const { data } = await supabase.from('parametri_ccnl')
    .select('livello,descrizione_livello').order('valido_da', { ascending: false }).order('livello')
  const seen = new Set()
  _ccnlOpts = (data || []).filter(r => { if (seen.has(r.livello)) return false; seen.add(r.livello); return true })
  return _ccnlOpts
}

async function loadInailOpts() {
  if (_inailOpts) return _inailOpts
  const { data } = await supabase.from('tariffe_inail')
    .select('voce_tariffa,descrizione,tasso_inail').order('valido_da', { ascending: false }).order('voce_tariffa')
  const seen = new Set()
  _inailOpts = (data || []).filter(r => { if (seen.has(r.voce_tariffa)) return false; seen.add(r.voce_tariffa); return true })
  return _inailOpts
}

async function populateRetribSelects(currentLivello, currentVoce) {
  const [ccnlOpts, inailOpts] = await Promise.all([loadCcnlOpts(), loadInailOpts()])

  const lvlSel = document.querySelector('#hr-retrib-form [name="livello_ccnl"]')
  if (lvlSel) {
    lvlSel.innerHTML = '<option value="">— non specificato —</option>'
    ccnlOpts.forEach(r => {
      const o = document.createElement('option')
      o.value = r.livello
      o.textContent = `${r.livello} — ${r.descrizione_livello || r.livello}`
      if (r.livello === currentLivello) o.selected = true
      lvlSel.appendChild(o)
    })
  }

  const voiceSel = document.querySelector('#hr-retrib-form [name="voce_tariffa_inail"]')
  if (voiceSel) {
    voiceSel.innerHTML = '<option value="">— non specificata —</option>'
    inailOpts.forEach(r => {
      const o = document.createElement('option')
      o.value = r.voce_tariffa
      o.textContent = `${r.voce_tariffa} — ${r.descrizione} (${(r.tasso_inail * 100).toFixed(2)}%)`
      if (r.voce_tariffa === currentVoce) o.selected = true
      voiceSel.appendChild(o)
    })
  }
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadOperatoriHR() {
  try {
    const { data, error } = await supabase
      .from('profili')
      .select(`
        id, nome, cognome, qualifica, attivo, matricola, email,
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
      <td style="white-space:nowrap;">
        <button class="btn btn-sm btn-secondary" data-action="hr-open" data-id="${op.id}">Gestisci</button>
        <button class="btn btn-sm btn-primary" data-action="hr-attiva"
          data-id="${op.id}"
          data-email="${op.email || ''}"
          data-nome="${(op.cognome || '') + ' ' + (op.nome || '')}"
          style="margin-left:4px;"
          title="Crea credenziali di accesso per questo operatore">
          Crea account
        </button>
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
      await populateRetribSelects(data.livello_ccnl, data.voce_tariffa_inail || '0411')
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
      ;['ccnl','categoria_lavorativa','tipo_contratto','data_scadenza_contratto','livello_ccnl','voce_tariffa_inail']
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
    // Aggiorna profili con dati retribuzione estratti dal PDF (se presenti)
    const retribUpdate = {}
    if (form.dataset.retribLivello)   retribUpdate.livello_ccnl          = form.dataset.retribLivello
    if (form.dataset.retribCcnl)      retribUpdate.ccnl                  = form.dataset.retribCcnl
    if (form.dataset.retribCategoria) retribUpdate.categoria_lavorativa  = form.dataset.retribCategoria
    if (form.dataset.retribOre)       retribUpdate.ore_mensili_contratto = parseFloat(form.dataset.retribOre)
    if (form.dataset.retribScatti)    retribUpdate.scatti_anzianita       = parseFloat(form.dataset.retribScatti)
    if (form.dataset.retribPartTime)  retribUpdate.tipo_contratto         = 'part_time'
    if (Object.keys(retribUpdate).length) {
      await supabase.from('profili').update(retribUpdate).eq('id', _currentOpId)
    }
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

export { extractTextFromFile, extractPageTextsFromPdf, parseDocumentText }

export function initGestioneAnagrafica() {
  try {
    // Initial load + reload ogni volta che la sezione diventa attiva
    loadOperatoriHR().then(ops => { _operatori = ops; renderTabellaHR(_operatori) })
    document.addEventListener('section:active', e => {
      if (e.detail === 'gestione-anagrafica') {
        loadOperatoriHR().then(ops => { _operatori = ops; renderTabellaHR(_operatori) })
      }
    })

    // Search
    document.getElementById('hr-search')?.addEventListener('input', () => renderTabellaHR(_operatori))

    // Table row click
    document.getElementById('hr-operatori-body')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'hr-open' && btn.dataset.id) await openModalAnag(btn.dataset.id)
      if (btn.dataset.action === 'hr-attiva') {
        document.getElementById('attiva-account-nome').textContent = btn.dataset.nome?.trim() || ''
        const form = document.getElementById('attiva-account-form')
        form.querySelector('[name="profilo_id"]').value = btn.dataset.id
        form.querySelector('[name="email"]').value      = btn.dataset.email || ''
        form.querySelector('[name="password"]').value  = ''
        form.querySelector('[name="conferma"]').value  = ''
        document.getElementById('attiva-account-modal').classList.add('active')
      }
    })

    // Crea account: annulla
    document.getElementById('attiva-account-cancel')?.addEventListener('click', () =>
      document.getElementById('attiva-account-modal')?.classList.remove('active'))

    // Crea account: submit
    document.getElementById('attiva-account-form')?.addEventListener('submit', async e => {
      e.preventDefault()
      const form   = e.target
      const email  = form.querySelector('[name="email"]').value.trim()
      const pw     = form.querySelector('[name="password"]').value
      const conf   = form.querySelector('[name="conferma"]').value
      const pid    = form.querySelector('[name="profilo_id"]').value

      if (pw !== conf) { showToast('Le password non coincidono', 'error'); return }
      if (pw.length < 6) { showToast('Password: minimo 6 caratteri', 'error'); return }

      const submitBtn = document.getElementById('attiva-account-submit')
      submitBtn.disabled = true
      submitBtn.textContent = 'Creazione…'
      try {
        const { data, error } = await supabase.functions.invoke('crea-utente-operatore', {
          body: { email, password: pw, profilo_id: pid }
        })
        if (error || data?.error) throw new Error(data?.error || error?.message || 'Errore sconosciuto')
        showToast('Account creato. L\'operatore può ora accedere.', 'success')
        document.getElementById('attiva-account-modal').classList.remove('active')
        _operatori = await loadOperatoriHR()
        renderTabellaHR(_operatori)
      } catch (err) {
        showToast('Errore: ' + err.message, 'error')
      } finally {
        submitBtn.disabled = false
        submitBtn.textContent = 'Crea account'
      }
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
      // Auto-fill campi da PDF cedolino
      bustaForm.querySelector('[name="file"]')?.addEventListener('change', e => {
        const file = e.target.files?.[0]
        if (file) handleBustaFileChange(file)
      })
    }

    // ── Nuovo operatore ─────────────────────────────────────────────────────
    document.getElementById('hr-nuovo-btn')?.addEventListener('click', openModalNuovoOp)

    document.getElementById('hr-nuovo-close')?.addEventListener('click', () =>
      document.getElementById('hr-nuovo-modal')?.classList.remove('active'))

    document.getElementById('hr-nuovo-save')?.addEventListener('click', saveNuovoOperatore)

    document.getElementById('hr-nuovo-file-input')?.addEventListener('change', e => {
      const file = e.target.files?.[0]
      if (file) handleNuovoFileChange(file)
    })

    // Cambio tipo documento reimposta preview
    document.querySelectorAll('input[name="hr-doc-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const file = document.getElementById('hr-nuovo-file-input')?.files?.[0]
        const manuale = document.querySelector('input[name="hr-doc-type"]:checked')?.value === 'manuale'
        const preview = document.getElementById('hr-nuovo-preview')
        if (manuale && preview) { preview.innerHTML = ''; preview.style.display = 'none' }
        if (file && !manuale) handleNuovoFileChange(file)
      })
    })

  } catch (err) {
    showToast('Errore inizializzazione Gestione Anagrafica', 'error')
    console.error(err)
  }
}
