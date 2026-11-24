// Lettura ottica dei fogli ore scansionati: QR, quadrati agli angoli, X nelle caselle
// e cerchi delle VARIAZIONI. Tutto nel browser, niente servizi esterni.
import {
  PAGE, QR_PREFIX, MARKER, MARKERS, QR, RIGHE, boxRect, VAR, VAR_GROUPS, bubbleCenter, MINUTI_VALUES,
} from './fogli_ore_layout.js'

const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'

function loadScript(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName])
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = url
    s.onload = () => resolve(window[globalName])
    s.onerror = () => reject(new Error('Impossibile caricare ' + url))
    document.head.appendChild(s)
  })
}

// ── Caricamento file → canvas (una per pagina) ──────────────────────────────
const TARGET_W = 1700 // ~200 dpi su A4

export async function fileToCanvases(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (isPdf) {
    const pdfjs = await loadScript(PDFJS_URL, 'pdfjsLib')
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    const out = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const vp0 = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: TARGET_W / Math.min(vp0.width, vp0.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      out.push(canvas)
    }
    return out
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = url
    })
    const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return [canvas]
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── Geometria: omografia mm → pixel ─────────────────────────────────────────
function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

// Trasformazione affine da 3 coppie di punti
export function affine(src, dst) {
  const A = [], b = []
  for (let i = 0; i < 3; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0]); b.push(u)
    A.push([0, 0, 0, x, y, 1]); b.push(v)
  }
  const h = solve(A, b)
  if (!h) return null
  return (x, y) => [h[0] * x + h[1] * y + h[2], h[3] * x + h[4] * y + h[5]]
}

export function homography(src, dst) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  const h = solve(A, b)
  if (!h) return null
  return (x, y) => {
    const w = h[6] * x + h[7] * y + 1
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
  }
}

// ── Immagine in bianco/nero ─────────────────────────────────────────────────
function toGray(imageData) {
  const { data, width, height } = imageData
  const g = new Uint8ClampedArray(width * height)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    g[j] = v; hist[g[j]]++
  }
  // "bianco" = 90° percentile; scuro sotto il 55% del bianco
  let acc = 0, white = 255
  const target = width * height * 0.9
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) { white = v; break } }
  const thr = Math.max(60, white * 0.55)
  const dark = new Uint8Array(width * height)
  for (let j = 0; j < g.length; j++) dark[j] = g[j] < thr ? 1 : 0
  return { dark, width, height }
}

function integral(dark, width, height) {
  const I = new Uint32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += dark[y * width + x]
      I[(y + 1) * (width + 1) + x + 1] = I[y * (width + 1) + x + 1] + row
    }
  }
  return (x0, y0, x1, y1) => { // somma su [x0,x1) × [y0,y1)
    x0 = Math.max(0, Math.min(width, x0)); x1 = Math.max(0, Math.min(width, x1))
    y0 = Math.max(0, Math.min(height, y0)); y1 = Math.max(0, Math.min(height, y1))
    const W = width + 1
    return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]
  }
}

// Cerca il quadrato nero pieno più vicino a (px,py) entro un raggio
function findMarker(sum, px, py, sidePx, radiusPx) {
  const s = Math.max(4, Math.round(sidePx))
  const area = s * s
  let best = null
  const step = Math.max(1, Math.round(s / 8))
  for (let y = Math.round(py - radiusPx); y <= py + radiusPx; y += step) {
    for (let x = Math.round(px - radiusPx); x <= px + radiusPx; x += step) {
      const x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2)
      const fill = sum(x0, y0, x0 + s, y0 + s) / area
      if (fill < 0.8) continue
      // bordo bianco attorno: il quadrato non deve far parte di una macchia più grande
      const m = Math.round(s * 0.35)
      const ring = (sum(x0 - m, y0 - m, x0 + s + m, y0 + s + m) - fill * area) / ((s + 2 * m) ** 2 - area)
      const score = fill - ring
      if (!best || score > best.score) best = { x, y, score }
    }
  }
  return best && best.score > 0.5 ? best : null
}

async function readQr(canvas, imageData) {
  const jsQR = await loadScript(JSQR_URL, 'jsQR')
  const opts = { inversionAttempts: 'attemptBoth' }
  const full = jsQR(imageData.data, imageData.width, imageData.height, opts)
  if (full) return full
  // Riprova sul quarto in alto a destra (dove sta il QR), anche rimpicciolito:
  // ridurre l'immagine smussa il rumore delle scansioni e delle foto
  const sx = Math.floor(canvas.width * 0.5), sw = canvas.width - sx
  const sh = Math.floor(canvas.height * 0.35)
  for (const k of [1, 0.6, 0.4]) {
    const c = document.createElement('canvas')
    c.width = Math.round(sw * k); c.height = Math.round(sh * k)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, sx, 0, sw, sh, 0, 0, c.width, c.height)
    const id = ctx.getImageData(0, 0, c.width, c.height)
    const r = jsQR(id.data, id.width, id.height, opts)
    if (r) {
      const back = p => ({ x: sx + p.x / k, y: p.y / k })
      for (const key of Object.keys(r.location)) r.location[key] = back(r.location[key])
      return r
    }
  }
  return null
}

// Frazione di pixel scuri in un rettangolo (mm) o cerchio (mm), campionando con H
function fillRect(H, dark, width, height, x, y, w, h, n = 14) {
  let hit = 0, tot = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [u, v] = H(x + (i + 0.5) * w / n, y + (j + 0.5) * h / n)
      const ui = Math.round(u), vi = Math.round(v)
      if (ui < 0 || vi < 0 || ui >= width || vi >= height) continue
      tot++; hit += dark[vi * width + ui]
    }
  }
  return tot ? hit / tot : 0
}
function fillCircle(H, dark, width, height, cx, cy, r, n = 12) {
  let hit = 0, tot = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = -r + (i + 0.5) * 2 * r / n, dy = -r + (j + 0.5) * 2 * r / n
      if (dx * dx + dy * dy > r * r) continue
      const [u, v] = H(cx + dx, cy + dy)
      const ui = Math.round(u), vi = Math.round(v)
      if (ui < 0 || vi < 0 || ui >= width || vi >= height) continue
      tot++; hit += dark[vi * width + ui]
    }
  }
  return tot ? hit / tot : 0
}

// Una X: soglia relativa alle caselle vuote della stessa pagina
const X_MIN = 0.06, X_SURE = 0.10

function pickBubble(scores) {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0])
  const [best, second] = [order[0], order[1] || [0, -1]]
  if (best[0] < 0.2) return { index: null, incerto: best[0] > 0.12 }
  if (best[0] >= 0.35 && best[0] - second[0] >= 0.2) return { index: best[1], incerto: false }
  return { index: best[1], incerto: true }
}

/**
 * Legge una pagina scansionata.
 * Ritorna { foglioId, qr, allineata, caselle[riga 1..15][giorno 0..6] = {x, incerto, score},
 *           variazioni: [{riga, giorno, minuti, incerto}], avvisi: [] }
 */
export async function leggiPagina(canvas, foglioIdForzato = null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const avvisi = []

  let foglioId = foglioIdForzato
  const qr = await readQr(canvas, img)
  if (qr?.data?.startsWith(QR_PREFIX)) foglioId = foglioIdForzato || qr.data.slice(QR_PREFIX.length).trim()
  else if (!foglioIdForzato) avvisi.push('QR non letto: scegli tu il foglio')

  const { dark, width, height } = toGray(img)
  const sum = integral(dark, width, height)

  // Prima stima: affine dal QR (se letto) oppure pagina intera
  let H0 = null
  if (qr?.location) {
    const L = qr.location
    H0 = affine(
      [[QR.x, QR.y], [QR.x + QR.size, QR.y], [QR.x, QR.y + QR.size]],
      [[L.topLeftCorner.x, L.topLeftCorner.y], [L.topRightCorner.x, L.topRightCorner.y],
       [L.bottomLeftCorner.x, L.bottomLeftCorner.y]],
    )
  }
  const Hpage = (() => { const sx = width / PAGE.w, sy = height / PAGE.h; return (x, y) => [x * sx, y * sy] })()
  const pxmmOf = T => { const [ax, ay] = T(0, 0), [bx, by] = T(PAGE.w, 0); return Math.hypot(bx - ax, by - ay) / PAGE.w }

  const cerca = (T, raggioMm) => MARKERS.map(mk => {
    const [px, py] = T(mk.x, mk.y)
    return findMarker(sum, px, py, MARKER.size * pxmmOf(T), raggioMm * pxmmOf(T))
  })
  let found = H0 ? cerca(H0, 12) : [null, null, null, null]
  if (found.filter(Boolean).length < 4) {
    const f2 = cerca(Hpage, 25)
    found = found.map((f, i) => f || f2[i])
  }
  // Con 3 quadrati trovati si stima il quarto e lo si cerca lì
  if (found.filter(Boolean).length === 3) {
    const idx = found.map((f, i) => f ? i : -1).filter(i => i >= 0)
    const T = affine(idx.map(i => [MARKERS[i].x, MARKERS[i].y]), idx.map(i => [found[i].x, found[i].y]))
    const miss = found.findIndex(f => !f)
    if (T) {
      const [px, py] = T(MARKERS[miss].x, MARKERS[miss].y)
      found[miss] = findMarker(sum, px, py, MARKER.size * pxmmOf(T), 8 * pxmmOf(T))
    }
  }
  if (!H0) H0 = Hpage
  let H = null
  if (found.every(Boolean)) {
    H = homography(MARKERS.map(m => [m.x, m.y]), found.map(f => [f.x, f.y]))
  }
  if (!H) {
    avvisi.push('Quadrati agli angoli non trovati: lettura meno precisa, controlla bene')
    H = H0
  }
  const allineata = found.every(Boolean)
  if (!H) {
    avvisi.push('Quadrati agli angoli non trovati: lettura meno precisa, controlla bene')
    H = H0
  }

  const caselle = {}
  const tutti = []
  for (let r = 1; r <= RIGHE; r++) {
    caselle[r] = []
    for (let d = 0; d < 7; d++) {
      const b = boxRect(r, d)
      const mx = b.w * 0.18, my = b.h * 0.18
      const score = fillRect(H, dark, width, height, b.x + mx, b.y + my, b.w - 2 * mx, b.h - 2 * my)
      caselle[r][d] = { score }
      tutti.push(score)
    }
  }
  const base = tutti.slice().sort((a, b) => a - b)[Math.floor(tutti.length / 2)] || 0
  for (let r = 1; r <= RIGHE; r++) {
    for (const c of caselle[r]) {
      const s = c.score - base
      c.x = s >= X_MIN
      c.incerto = (s >= X_MIN * 0.5 && s < X_SURE)
    }
  }

  const variazioni = []
  for (let v = 0; v < VAR.righe; v++) {
    const val = {}
    let qualcosa = false, incerto = false
    for (const g of VAR_GROUPS) {
      const scores = g.values.map((_, i) => {
        const { cx, cy } = bubbleCenter(v, g, i)
        return fillCircle(H, dark, width, height, cx, cy, VAR.r * 0.75)
      })
      const p = pickBubble(scores)
      val[g.key] = p.index
      if (p.index != null || p.incerto) qualcosa = true
      if (p.incerto) incerto = true
    }
    if (!qualcosa) continue
    const ok = val.riga != null && val.giorno != null && val.ore != null && val.minuti != null
    variazioni.push({
      riga: val.riga != null ? val.riga + 1 : null,
      giorno: val.giorno,
      minuti: val.ore != null && val.minuti != null ? val.ore * 60 + MINUTI_VALUES[val.minuti] : null,
      incerto: incerto || !ok,
    })
  }

  return { foglioId, qr: !!qr, allineata, caselle, variazioni, avvisi }
}
