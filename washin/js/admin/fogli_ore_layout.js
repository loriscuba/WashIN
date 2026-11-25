// Geometria del foglio ore settimanale (A4 verticale, millimetri, origine in alto a sinistra).
// La usano sia la stampa (fogli_ore_pdf.js) sia la lettura della scansione
// (fogli_ore_lettura.js): se cambi una misura qui, cambia per entrambe.
//
// Versioni del foglio (scritte nel QR: "WASHIN|FS|<id>|<versione>"):
//   1  primi fogli stampati (QR senza versione): cerchi con il numero dentro
//   2  cerchi vuoti con i valori stampati sopra la prima riga, righe un po' più
//      basse e in fondo il TOTALE delle X dichiarato dall'operatrice

export const PAGE = { w: 210, h: 297 }
export const QR_PREFIX = 'WASHIN|FS|'
export const LAYOUT_CORRENTE = 2

// Quadrati neri agli angoli (servono a raddrizzare la scansione)
export const MARKER = { size: 6 }
export const MARKERS = [
  { x: 7, y: 7 },     // alto sinistra
  { x: 203, y: 7 },   // alto destra
  { x: 7, y: 290 },   // basso sinistra
  { x: 203, y: 290 }, // basso destra
]

// QR con l'id del foglio
export const QR = { x: 170, y: 12, size: 26 }

export const RIGHE = 15
export const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
export const MINUTI_VALUES = [0, 15, 30, 45]
export const codiceFoglio = numero => 'FO-' + String(numero).padStart(6, '0')

const cache = {}
export function getLayout(versione = LAYOUT_CORRENTE) {
  const v = versione === 1 ? 1 : 2
  if (cache[v]) return cache[v]

  const TABLE = {
    top: 58,
    header: 10,
    rowH: v === 1 ? 10.5 : 10,
    colN: 14, colCod: 21, colNome: 37, colGiorni: 101, right: 196,
  }
  TABLE.dayW = (TABLE.right - TABLE.colGiorni) / 7
  TABLE.bottom = TABLE.top + TABLE.header + TABLE.rowH * RIGHE
  const BOX = { w: 7, h: 7.2 }

  // Casella della riga r (1-15) e del giorno d (0 = lunedì … 6 = domenica)
  const boxRect = (r, d) => {
    const cx = TABLE.colGiorni + TABLE.dayW * d + TABLE.dayW / 2
    const cy = TABLE.top + TABLE.header + TABLE.rowH * (r - 1) + TABLE.rowH / 2
    return { x: cx - BOX.w / 2, y: cy - BOX.h / 2, w: BOX.w, h: BOX.h, cx, cy }
  }

  // Sezione VARIAZIONI: 5 righe, in ognuna 4 gruppi di cerchi
  const VAR = v === 1
    ? { titleY: TABLE.bottom + 7, firstY: TABLE.bottom + 14, gapY: 7, righe: 5, r: 2.0, valoriDentro: true }
    : { titleY: TABLE.bottom + 6, valoriY: TABLE.bottom + 11, firstY: TABLE.bottom + 15.5, gapY: 6.6, righe: 5, r: 2.0, valoriDentro: false }
  const VAR_GROUPS = [
    { key: 'riga',   label: 'Riga',   labelX: 14,    x0: 22,  gap: 4.8, values: Array.from({ length: RIGHE }, (_, i) => String(i + 1)) },
    { key: 'giorno', label: 'Giorno', labelX: 96,    x0: 106, gap: 4.8, values: ['L', 'M', 'M', 'G', 'V', 'S', 'D'] },
    { key: 'ore',    label: 'Ore',    labelX: 141.5, x0: 148, gap: 4.8, values: ['0', '1', '2', '3'] },
    { key: 'minuti', label: 'Min',    labelX: 168.5, x0: 176, gap: 4.8, values: ['00', '15', '30', '45'] },
  ]
  const bubbleCenter = (varRow, group, i) => ({ cx: group.x0 + VAR.r + i * group.gap, cy: VAR.firstY + VAR.gapY * varRow })
  const lastVarY = VAR.firstY + VAR.gapY * (VAR.righe - 1)

  // Totale X dichiarato (solo v2): decine 0-4 e unità 0-9
  const TOTALE = v === 1 ? null : {
    y: lastVarY + 11, valoriY: lastVarY + 6.6, r: 2.0,
    gruppi: [
      { key: 'decine', label: 'decine', labelX: 74,  x0: 87,  gap: 4.8, values: ['0', '1', '2', '3', '4'] },
      { key: 'unita',  label: 'unità',  labelX: 115, x0: 126, gap: 4.8, values: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
    ],
  }
  const totaleCenter = (group, i) => ({ cx: group.x0 + TOTALE.r + i * group.gap, cy: TOTALE.y })

  const FOOTER = v === 1
    ? { noteY: lastVarY + 9, firmaY: lastVarY + 17 }
    : { noteY: TOTALE.y + 8, firmaY: TOTALE.y + 15 }

  cache[v] = { versione: v, TABLE, BOX, boxRect, VAR, VAR_GROUPS, bubbleCenter, TOTALE, totaleCenter, FOOTER }
  return cache[v]
}
