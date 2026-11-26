// Stampa dei fogli ore settimanali (jsPDF + qrcode-generator da CDN).
import {
  PAGE, QR_PREFIX, MARKER, MARKERS, QR, RIGHE, GIORNI, codiceFoglio, getLayout, LAYOUT_CORRENTE,
} from './fogli_ore_layout.js'

const { TABLE, boxRect, VAR, VAR_GROUPS, bubbleCenter, TOTALE, totaleCenter, FOOTER } = getLayout(LAYOUT_CORRENTE)

const LIBS = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  qrcode: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
}
const _loading = {}
export function loadScript(url, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName])
  if (!_loading[url]) {
    _loading[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = () => resolve(globalName ? window[globalName] : true)
      s.onerror = () => { delete _loading[url]; reject(new Error('Impossibile caricare ' + url)) }
      document.head.appendChild(s)
    })
  }
  return _loading[url]
}

async function libs() {
  await Promise.all([loadScript(LIBS.jspdf, 'jspdf'), loadScript(LIBS.qrcode, 'qrcode')])
  return { jsPDF: window.jspdf.jsPDF, qrcode: window.qrcode }
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d }

// Tronca un testo alla larghezza disponibile (mm)
function fit(doc, text, maxW) {
  let t = String(text ?? '')
  if (doc.getTextWidth(t) <= maxW) return t
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

function drawQr(doc, qrcode, data) {
  const qr = qrcode(0, 'M')
  qr.addData(data)
  qr.make()
  const n = qr.getModuleCount()
  const m = QR.size / n
  doc.setFillColor(0, 0, 0)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) doc.rect(QR.x + c * m, QR.y + r * m, m + 0.01, m + 0.01, 'F')
    }
  }
}

function drawPage(doc, qrcode, p) {
  const { foglio, operatore, righe, squadra, squadraUnica, componenti = [], pianificati = null } = p
  const lun = foglio.settimana_inizio
  const dom = addDays(lun, 6)
  const dLun = addDays(lun, 0)
  const codice = codiceFoglio(foglio.numero)

  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setFillColor(0, 0, 0)
  for (const mk of MARKERS) doc.rect(mk.x - MARKER.size / 2, mk.y - MARKER.size / 2, MARKER.size, MARKER.size, 'F')
  drawQr(doc, qrcode, `${QR_PREFIX}${foglio.id}|${LAYOUT_CORRENTE}`)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text('FOGLIO ORE SETTIMANALE', 14, 17)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(squadraUnica ? 'Squadra:' : 'Operatrice:', 14, 25)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(fit(doc, operatore, 130), 34, 25)
  if (squadra && !squadraUnica) {
    const w = doc.getTextWidth(fit(doc, operatore, 130))
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(fit(doc, /^squadra\b/i.test(squadra) ? squadra : `squadra ${squadra}`, 125 - w), 36 + w, 25)
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`Settimana: da lunedì ${dLun.getDate()} ${MESI[dLun.getMonth()]} a domenica ${dom.getDate()} ${MESI[dom.getMonth()]} ${dom.getFullYear()}`, 14, 31.5)
  doc.setFont('courier', 'bold'); doc.setFontSize(11)
  doc.text(`Foglio ${codice}${foglio.pagine > 1 ? `   pag. ${foglio.pagina}/${foglio.pagine}` : ''}`, 14, 38)
  if (squadraUnica) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(fit(doc, `Componenti: ${componenti.join(', ') || '—'}`, 90), 74, 38)
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.text("1) Fai una X nel giorno in cui hai fatto l'intervento: vale il tempo previsto indicato nella riga.", 14, 46)
  doc.text('2) Solo se il tempo è stato diverso, fai comunque la X e compila una riga di VARIAZIONI in fondo.'
    + (pianificati ? ' Sfondo grigio = giorno previsto.' : ''), 14, 50.5)
  doc.text(squadraUnica
    ? '3) Annerisci il TOTALE delle X. Nelle note scrivi chi era assente e in che giorno. Non scrivere sul QR e sui quadratini neri.'
    : '3) In fondo annerisci il TOTALE delle X che hai fatto. Non scrivere sul QR e sui quadratini neri.', 14, 55)

  // Tabella
  const T = TABLE
  // domenica in grigio; con i giorni pianificati dall'agenda, in grigio solo quelli
  doc.setFillColor(225, 225, 225)
  if (!pianificati) doc.rect(T.colGiorni + T.dayW * 6, T.top, T.dayW, T.bottom - T.top, 'F')
  else {
    doc.setFillColor(205, 205, 205)
    for (const r of righe) {
      if (!r.contratto_id) continue
      for (let d = 0; d < 7; d++) {
        if (!pianificati.has(`${r.contratto_id}|${r.servizio_id || ''}|${d}`)) continue
        doc.rect(T.colGiorni + T.dayW * d, T.top + T.header + T.rowH * (r.riga - 1), T.dayW, T.rowH, 'F')
      }
    }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
  doc.text('N.', T.colN + 3.5, T.top + 6.3, { align: 'center' })
  doc.text('Cod.', T.colCod + 1, T.top + 6.3)
  doc.text('Condominio · servizio · tempo previsto', T.colNome + 1, T.top + 6.3)
  for (let d = 0; d < 7; d++) {
    const x = T.colGiorni + T.dayW * d + T.dayW / 2
    const dt = addDays(lun, d)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(GIORNI[d], x, T.top + 4.3, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(`${dt.getDate()}/${dt.getMonth() + 1}`, x, T.top + 8.3, { align: 'center' })
  }
  const byRiga = new Map(righe.map(r => [r.riga, r]))
  for (let r = 1; r <= RIGHE; r++) {
    const yTop = T.top + T.header + T.rowH * (r - 1)
    const riga = byRiga.get(r)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(String(r), T.colN + 3.5, yTop + 6.6, { align: 'center' })
    if (riga?.contratto_id) {
      doc.setFont('courier', 'bold'); doc.setFontSize(8.5)
      doc.text(fit(doc, riga.codice || '', 15), T.colCod + 0.8, yTop + 6.6)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text(fit(doc, riga.etichetta, 62), T.colNome + 1, yTop + 4.6)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
      doc.text(fit(doc, riga.dettaglio, 62), T.colNome + 1, yTop + 8.4)
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130, 130, 130)
      doc.text('(libera: extra, scrivi il condominio)', T.colNome + 1, yTop + 6.6)
      doc.setTextColor(0, 0, 0)
    }
    doc.setLineWidth(0.25)
    for (let d = 0; d < 7; d++) {
      const b = boxRect(r, d)
      doc.setFillColor(255, 255, 255)
      doc.rect(b.x, b.y, b.w, b.h, 'FD')
    }
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.1)
    doc.line(T.colN, yTop + T.rowH, T.right, yTop + T.rowH)
    doc.setDrawColor(0, 0, 0)
  }
  doc.setLineWidth(0.35)
  doc.rect(T.colN, T.top, T.right - T.colN, T.bottom - T.top)
  doc.line(T.colN, T.top + T.header, T.right, T.top + T.header)
  doc.setLineWidth(0.2)
  for (const x of [T.colCod, T.colNome, T.colGiorni]) doc.line(x, T.top, x, T.bottom)
  doc.setLineWidth(0.1)
  for (let d = 1; d < 7; d++) doc.line(T.colGiorni + T.dayW * d, T.top, T.colGiorni + T.dayW * d, T.bottom)

  // Variazioni: cerchi vuoti, valori stampati sopra la prima riga
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('VARIAZIONI', 14, VAR.titleY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text('solo se il tempo è diverso: annerisci un cerchio per gruppo (riga, giorno, ore, minuti) = tempo TOTALE impiegato', 38, VAR.titleY)
  for (const g of VAR_GROUPS) {
    g.values.forEach((label, i) => {
      const { cx } = bubbleCenter(0, g, i)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(label.length > 1 ? 6 : 7)
      doc.text(label, cx, VAR.valoriY, { align: 'center' })
    })
  }
  for (let v = 0; v < VAR.righe; v++) {
    for (const g of VAR_GROUPS) {
      const { cy } = bubbleCenter(v, g, 0)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
      doc.text(g.label, g.labelX, cy + 1)
      g.values.forEach((_, i) => {
        const { cx } = bubbleCenter(v, g, i)
        doc.setLineWidth(0.2)
        doc.circle(cx, cy, VAR.r)
      })
    }
  }

  // Totale X dichiarato dall'operatrice (doppio controllo della lettura)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('TOTALE X della settimana:', 14, TOTALE.y + 1.2)
  for (const g of TOTALE.gruppi) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.text(g.label, g.labelX, TOTALE.y + 1)
    g.values.forEach((label, i) => {
      const { cx, cy } = totaleCenter(g, i)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
      doc.text(label, cx, TOTALE.valoriY, { align: 'center' })
      doc.setLineWidth(0.2)
      doc.circle(cx, cy, TOTALE.r)
    })
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(110, 110, 110)
  doc.text(['es. 12 X =', 'decine 1, unità 2'], 177, TOTALE.y - 0.6)
  doc.setTextColor(0, 0, 0)

  // Note e firme
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const noteLabel = squadraUnica ? 'Assenti (chi, che giorno) / note:' : 'Note:'
  doc.text(noteLabel, 14, FOOTER.noteY)
  doc.setLineWidth(0.15)
  doc.line(16 + doc.getTextWidth(noteLabel), FOOTER.noteY + 0.5, 196, FOOTER.noteY + 0.5)
  const firma = squadraUnica ? 'Firma capo squadra:' : 'Firma operatrice:'
  doc.text(firma, 14, FOOTER.firmaY)
  doc.line(16 + doc.getTextWidth(firma), FOOTER.firmaY + 0.5, 105, FOOTER.firmaY + 0.5)
  doc.text('Visto ufficio:', 115, FOOTER.firmaY)
  doc.line(136, FOOTER.firmaY + 0.5, 196, FOOTER.firmaY + 0.5)
  doc.setFontSize(6.5); doc.setTextColor(130, 130, 130)
  doc.text(`WashIN · ${codice} · stampato il ${new Date().toLocaleDateString('it-IT')}`, 14, PAGE.h - 4)
  doc.setTextColor(0, 0, 0)
}

// pagine: [{ foglio: {id, numero, settimana_inizio, pagina, pagine}, operatore, righe: [...] }]
export async function creaPdfFogli(pagine) {
  const { jsPDF, qrcode } = await libs()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  pagine.forEach((p, i) => {
    if (i > 0) doc.addPage()
    drawPage(doc, qrcode, p)
  })
  return doc
}
