import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { extractPageTextsFromPdf } from './gestione_anagrafica.js'
import { detectPayslipFormat, parseInailPayslip, parseCedolino } from './tool_import.js'

// ─── Stato ────────────────────────────────────────────────────────────────────
let _parsed  = []   // { cognome, nome, cf, anno, mese, filename, ore_lavorate, ore_straordinario, ferie_ore, malattia_ore }
let _results = []   // { op, busta, presenze, delta, flags }

const SOGLIA_ORE  = 1.0   // discrepanza minima in ore per segnalare
const SOGLIA_PERC = 0.05  // 5% di scarto percentuale

function pad(n) { return String(n).padStart(2,'0') }

function fmtH(h) {
  if (h == null || h === 0) return '—'
  const neg = h < 0; h = Math.abs(h)
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
  return (neg ? '−' : '') + (mm ? `${hh}h ${pad(mm)}m` : `${hh}h`)
}

// ─── Parsing PDF cedolini ─────────────────────────────────────────────────────

export async function parseCedoliniPerCheck(files, onProgress) {
  _parsed = []
  let total = 0

  for (let i = 0; i < files.length; i++) {
    onProgress?.(`File ${i+1}/${files.length}: ${files[i].name}…`)
    const pages = await extractPageTextsFromPdf(files[i])
    pages.forEach((text, p) => {
      const fmt = detectPayslipFormat(text)
      const { anag, busta } = fmt === 'inail' ? parseInailPayslip(text) : parseCedolino(text)
      const cf = anag.codice_fiscale || busta.codice_fiscale || null

      // Estrai anno/mese dal testo se non già nel busta
      let anno = busta.anno, mese = busta.mese
      const MESI_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                       'luglio','agosto','settembre','ottobre','novembre','dicembre']
      if (!anno || !mese) {
        // 1. Etichetta esplicita: "Competenza MAGGIO 2026", "Periodo Maggio 2026", "Mese: 05/2026"
        const labelM = text.match(/(?:Competenza|Periodo\s+(?:di\s+)?paga|Mese\s+(?:di\s+)?competenza|Cedolino)[:\s]+([A-Za-zàèéìòù]+)\s+(\d{4})/i)
        if (labelM) {
          const m = MESI_IT.indexOf(labelM[1].toLowerCase()) + 1
          if (m && parseInt(labelM[2]) > 2000) { mese = m; anno = parseInt(labelM[2]) }
        }
        // 2. "MAGGIO 2026" standalone (mese in maiuscolo vicino a anno plausibile)
        if (!anno) {
          for (const m of text.matchAll(/\b(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)\s+(20\d{2})\b/gi)) {
            const mi = MESI_IT.indexOf(m[1].toLowerCase()) + 1
            if (mi) { mese = mi; anno = parseInt(m[2]); break }
          }
        }
        // 3. MM/YYYY strettamente con anno >= 2020 e mese 01-12
        if (!anno) {
          for (const m of text.matchAll(/\b(0[1-9]|1[0-2])\/(20[2-9]\d)\b/g)) {
            mese = parseInt(m[1]); anno = parseInt(m[2]); break
          }
        }
        // 4. YYYY-MM (ISO)
        if (!anno) {
          const isoM = text.match(/\b(20[2-9]\d)-(0[1-9]|1[0-2])\b/)
          if (isoM) { anno = parseInt(isoM[1]); mese = parseInt(isoM[2]) }
        }
        console.log('[check periodo]', anag.cognome, anag.nome, '→', mese, anno)
      }

      _parsed.push({
        cognome:          anag.cognome || '',
        nome:             anag.nome    || '',
        codice_fiscale:   cf,
        anno:             anno ? parseInt(anno) : null,
        mese:             mese ? parseInt(mese) : null,
        filename:         files.length > 1 ? files[i].name : `${files[i].name} p.${p+1}`,
        ore_lavorate:     busta.ore_lavorate     || null,
        ore_straordinario:busta.ore_straordinario|| null,
        ferie_ore:        busta.ferie_ore        || null,
        malattia_ore:     busta.malattia_ore     || null,
        _raw_busta:       busta,
      })
      total++
    })
  }

  onProgress?.(`${files.length} file — ${total} cedolini trovati`)
  return _parsed
}

// ─── Match operatori ──────────────────────────────────────────────────────────

async function matchOperatori(parsed) {
  const { data: profili } = await supabase
    .from('profili').select('id,cognome,nome,codice_fiscale')
  if (!profili) return []

  return parsed.map(p => {
    // 1. match CF esatto
    let op = p.codice_fiscale
      ? profili.find(pr => pr.codice_fiscale?.toUpperCase() === p.codice_fiscale.toUpperCase())
      : null
    // 2. match cognome+nome
    if (!op && p.cognome) {
      op = profili.find(pr =>
        pr.cognome?.toLowerCase() === p.cognome.toLowerCase() &&
        (!p.nome || pr.nome?.toLowerCase() === p.nome.toLowerCase())
      )
    }
    return { ...p, profilo_id: op?.id || null, profilo: op || null }
  })
}

// ─── Carica presenze dal DB per confronto ─────────────────────────────────────

async function loadPresenzePerMese(profiloId, anno, mese) {
  if (!profiloId || !anno || !mese) return null
  const from = `${anno}-${pad(mese)}-01`
  const to   = new Date(anno, mese, 0).toISOString().slice(0, 10)

  const { data: gg } = await supabase
    .from('presenze_giornaliere').select('*')
    .eq('profilo_id', profiloId).gte('data', from).lte('data', to)

  if (!gg) return null

  let oreOrd = 0, oreStr = 0, ferieOre = 0, malatOre = 0, ggFerie = 0, ggMalat = 0
  gg.forEach(r => {
    if (r.tipo === 'lavoro') {
      oreOrd += parseFloat(r.ore_ordinarie || 0)
      oreStr += parseFloat(r.ore_straordinario || 0)
    } else if (r.tipo === 'feria') {
      ggFerie++
      ferieOre += parseFloat(r.ore_ordinarie || 0) || 8
    } else if (r.tipo === 'malattia') {
      ggMalat++
      malatOre += parseFloat(r.ore_ordinarie || 0) || 8
    }
  })

  return { oreOrd, oreStr, ferieOre, malatOre, ggFerie, ggMalat, righe: gg.length }
}

// ─── Calcola discrepanze ──────────────────────────────────────────────────────

function calcDelta(busta, pres) {
  const flags = []

  const dOrd = pres.oreOrd - (busta.ore_lavorate || 0)
  if (busta.ore_lavorate && Math.abs(dOrd) >= SOGLIA_ORE) {
    flags.push({
      campo: 'Ore ordinarie',
      busta: busta.ore_lavorate,
      presenze: pres.oreOrd,
      delta: dOrd,
      gravita: Math.abs(dOrd) >= 4 ? 'alta' : 'media',
    })
  }

  const dStr = pres.oreStr - (busta.ore_straordinario || 0)
  if (busta.ore_straordinario && Math.abs(dStr) >= SOGLIA_ORE) {
    flags.push({
      campo: 'Ore straordinario',
      busta: busta.ore_straordinario,
      presenze: pres.oreStr,
      delta: dStr,
      gravita: Math.abs(dStr) >= 2 ? 'alta' : 'media',
    })
  } else if (!busta.ore_straordinario && pres.oreStr >= SOGLIA_ORE) {
    flags.push({
      campo: 'Straordinario non in busta',
      busta: 0,
      presenze: pres.oreStr,
      delta: pres.oreStr,
      gravita: 'info',
    })
  }

  const dFerie = pres.ferieOre - (busta.ferie_ore || 0)
  if (busta.ferie_ore && Math.abs(dFerie) >= SOGLIA_ORE) {
    flags.push({
      campo: 'Ore ferie',
      busta: busta.ferie_ore,
      presenze: pres.ferieOre,
      delta: dFerie,
      gravita: Math.abs(dFerie) >= 8 ? 'alta' : 'media',
    })
  }

  const dMalat = pres.malatOre - (busta.malattia_ore || 0)
  if (busta.malattia_ore && Math.abs(dMalat) >= SOGLIA_ORE) {
    flags.push({
      campo: 'Ore malattia',
      busta: busta.malattia_ore,
      presenze: pres.malatOre,
      delta: dMalat,
      gravita: Math.abs(dMalat) >= 8 ? 'alta' : 'media',
    })
  }

  return flags
}

// ─── Run check completo ───────────────────────────────────────────────────────

export async function runCheck(parsed, onProgress) {
  const matched = await matchOperatori(parsed)
  _results = []

  for (let i = 0; i < matched.length; i++) {
    const b = matched[i]
    onProgress?.(`Confronto ${i+1}/${matched.length}: ${b.cognome} ${b.nome}…`)

    const pres = await loadPresenzePerMese(b.profilo_id, b.anno, b.mese)
    const flags = pres ? calcDelta(b, pres) : []

    _results.push({
      busta:    b,
      presenze: pres,
      flags,
      status: !b.profilo_id    ? 'no_match'
            : !b.anno || !b.mese ? 'no_periodo'
            : !pres             ? 'no_presenze'
            : flags.length === 0 ? 'ok'
            : flags.some(f => f.gravita === 'alta') ? 'errore'
            : 'warning',
    })
  }

  return _results
}

// ─── Render risultati ─────────────────────────────────────────────────────────

const GRAVITA_COLOR = { alta: '#ef4444', media: '#f59e0b', info: '#6b7280' }
const STATUS_BADGE = {
  ok:          '<span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">✓ OK</span>',
  errore:      '<span style="background:#fee2e2;color:#991b1b;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">✕ Errore</span>',
  warning:     '<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">⚠ Attenzione</span>',
  no_match:    '<span style="background:#f3f4f6;color:#6b7280;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">? No match</span>',
  no_presenze: '<span style="background:#eff6ff;color:#1e40af;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">– Nessuna presenza</span>',
  no_periodo:  '<span style="background:#f3f4f6;color:#6b7280;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">? Periodo sconosciuto</span>',
}

const MESI_NOMI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

// Stato spunte: index → true (corretto manualmente)
const _spunte = {}

function rowDiscr(r) {
  const b = r.busta, p = r.presenze
  // Mostra sempre i 4 campi con busta / gestionale, evidenziando le discrepanze
  const campi = [
    { label: 'Ore ordinarie',  busta: b.ore_lavorate,      pres: p?.oreOrd,    soglia: SOGLIA_ORE },
    { label: 'Straordinario',  busta: b.ore_straordinario, pres: p?.oreStr,    soglia: SOGLIA_ORE },
    { label: 'Ferie',          busta: b.ferie_ore,         pres: p?.ferieOre,  soglia: SOGLIA_ORE },
    { label: 'Malattia',       busta: b.malattia_ore,      pres: p?.malatOre,  soglia: SOGLIA_ORE },
  ]
  return campi.map(c => {
    const hasBusta = c.busta != null
    const hasPres  = c.pres  != null
    const diff     = hasBusta && hasPres ? Math.abs(c.pres - c.busta) : 0
    const discr    = hasBusta && hasPres && diff >= c.soglia
    const col      = discr ? (diff >= 4 ? '#ef4444' : '#f59e0b') : '#6b7280'
    const bVal     = hasBusta ? fmtH(c.busta) : '?'
    const pVal     = hasPres  ? fmtH(c.pres)  : '—'
    const delta    = discr ? ` (${c.pres - c.busta > 0 ? '+' : ''}${fmtH(c.pres - c.busta)})` : ''
    return `<div style="font-size:12px;margin-bottom:3px;${discr ? `color:${col};font-weight:600;` : 'color:#6b7280;'}">
      <span style="display:inline-block;width:90px;">${c.label}:</span>
      <span>busta <strong>${bVal}</strong> / gest. <strong>${pVal}</strong>${discr ? `<span style="color:${col};">${delta}</span>` : ''}</span>
    </div>`
  }).join('')
}

export function renderCheckResults(results, containerId = 'check-presenze-results') {
  const el = document.getElementById(containerId)
  if (!el) return

  if (!results.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:32px;">Nessun risultato. Carica i PDF cedolini e clicca Avvia check.</p>'
    return
  }

  const totOk   = results.filter(r => r.status === 'ok').length
  const totErr  = results.filter(r => r.status === 'errore').length
  const totWarn = results.filter(r => r.status === 'warning').length
  const totNV   = results.filter(r => ['no_match','no_presenze','no_periodo'].includes(r.status)).length

  el.innerHTML = `
    <!-- Riepilogo + azioni -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:20px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="background:#d1fae5;border-radius:10px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#065f46;">${totOk}</div>
          <div style="font-size:12px;color:#065f46;">Corretti</div>
        </div>
        <div style="background:#fee2e2;border-radius:10px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#991b1b;">${totErr}</div>
          <div style="font-size:12px;color:#991b1b;">Errori</div>
        </div>
        <div style="background:#fef3c7;border-radius:10px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#92400e;">${totWarn}</div>
          <div style="font-size:12px;color:#92400e;">Avvisi</div>
        </div>
        <div style="background:#f3f4f6;border-radius:10px;padding:12px 20px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#6b7280;">${totNV}</div>
          <div style="font-size:12px;color:#6b7280;">Non verificabili</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:13px;color:#6b7280;">Spunta le buste corrette →</span>
        <button id="check-report-btn" class="btn btn-primary btn-sm">📋 Report commercialista</button>
        <button id="check-export-csv" class="btn btn-secondary btn-sm">📥 CSV</button>
      </div>
    </div>

    <!-- Legenda -->
    <p style="font-size:12px;color:#9ca3af;margin:0 0 12px;">
      Per ogni riga: <strong>busta</strong> = valore estratto dal PDF cedolino · <strong>gest.</strong> = valore inserito nel gestionale.
      Metti la spunta ✓ sulle righe già verificate e corrette — il report commercialista includerà solo quelle <em>senza</em> spunta.
    </p>

    <!-- Tabella -->
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;width:40px;">✓</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Operatore</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Periodo</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Stato</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Busta vs Gestionale</th>
          </tr>
        </thead>
        <tbody id="check-tbody">
          ${results.map((r, i) => {
            const b = r.busta
            const nome = `${b.cognome || '?'} ${b.nome || ''}`.trim()
            const periodo = b.anno && b.mese ? `${MESI_NOMI[b.mese]} ${b.anno}` : '—'
            const checked = _spunte[i] ? 'checked' : ''
            const bgRow = _spunte[i] ? '#f0fdf4' : (i % 2 === 0 ? '#fff' : '#fafafa')

            const detail = r.status === 'no_match'    ? '<span style="color:#9ca3af;font-size:12px;">Operatore non trovato nel gestionale</span>'
                         : r.status === 'no_presenze' ? '<span style="color:#9ca3af;font-size:12px;">Nessuna presenza inserita per questo mese</span>'
                         : r.status === 'no_periodo'  ? '<span style="color:#9ca3af;font-size:12px;">Periodo non rilevato nel PDF</span>'
                         : rowDiscr(r)

            return `<tr data-idx="${i}" style="background:${bgRow};border-bottom:1px solid #f3f4f6;transition:background .1s;">
              <td style="padding:10px 12px;text-align:center;">
                <input type="checkbox" class="check-spunta" data-idx="${i}" ${checked}
                  style="width:18px;height:18px;accent-color:#0d9488;cursor:pointer;">
              </td>
              <td style="padding:10px 12px;font-weight:600;">${nome}<br><span style="font-size:11px;color:#9ca3af;font-weight:400;">${b.filename || ''}</span></td>
              <td style="padding:10px 12px;white-space:nowrap;">${periodo}</td>
              <td style="padding:10px 12px;text-align:center;">${STATUS_BADGE[r.status] || ''}</td>
              <td style="padding:10px 12px;">${detail}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  `

  // Spunte
  el.querySelectorAll('.check-spunta').forEach(cb => {
    cb.addEventListener('change', () => {
      const i = parseInt(cb.dataset.idx)
      _spunte[i] = cb.checked
      const tr = cb.closest('tr')
      tr.style.background = cb.checked ? '#f0fdf4' : (i % 2 === 0 ? '#fff' : '#fafafa')
    })
  })

  document.getElementById('check-export-csv')?.addEventListener('click', () => exportCsv(results))
  document.getElementById('check-report-btn')?.addEventListener('click', () => exportReportCommercialista(results))
}

function exportReportCommercialista(results) {
  // Solo le righe senza spunta (non confermate come corrette) e con discrepanze o non verificabili
  const daInviare = results.filter((r, i) => !_spunte[i] && r.status !== 'ok')
  if (!daInviare.length) {
    alert('Tutte le buste sono state spuntate come corrette. Nessuna discrepanza da segnalare.')
    return
  }

  const oggi = new Date().toLocaleDateString('it-IT')

  const righe = daInviare.map(r => {
    const b    = r.busta
    const p    = r.presenze
    const nome = `${b.cognome || ''} ${b.nome || ''}`.trim()
    const periodo = b.anno && b.mese ? `${MESI_NOMI[b.mese]} ${b.anno}` : '—'

    const campi = [
      { label: 'Ore ordinarie', busta: b.ore_lavorate,      pres: p?.oreOrd   },
      { label: 'Straordinario', busta: b.ore_straordinario, pres: p?.oreStr   },
      { label: 'Ferie',         busta: b.ferie_ore,         pres: p?.ferieOre },
      { label: 'Malattia',      busta: b.malattia_ore,      pres: p?.malatOre },
    ].filter(c => c.busta != null || c.pres != null)

    const dettaglio = campi.map(c => {
      const bVal = c.busta != null ? fmtH(c.busta) : '?'
      const pVal = c.pres  != null ? fmtH(c.pres)  : '—'
      const diff = (c.busta != null && c.pres != null) ? c.pres - c.busta : null
      const diffStr = diff != null && Math.abs(diff) >= SOGLIA_ORE
        ? ` → scarto <strong style="color:#ef4444;">${diff > 0 ? '+' : ''}${fmtH(diff)}</strong>`
        : ''
      return `<tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">${c.label}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;font-family:monospace;">${bVal}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;font-family:monospace;">${pVal}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">${diffStr || '—'}</td>
      </tr>`
    }).join('')

    const statusLabel = r.status === 'errore'  ? '⚠ DISCREPANZA'
                      : r.status === 'warning'  ? '⚠ ATTENZIONE'
                      : r.status === 'no_presenze' ? '– Dati assenti'
                      : r.status === 'no_match' ? '? Operatore non trovato'
                      : r.status

    return `
      <div style="margin-bottom:28px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111827;padding-bottom:6px;margin-bottom:10px;">
          <span style="font-size:16px;font-weight:700;">${nome}</span>
          <span style="font-size:13px;color:#6b7280;">${periodo} · ${statusLabel}</span>
        </div>
        ${campi.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:left;">Voce</th>
              <th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;">Busta paga</th>
              <th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;">Gestionale</th>
              <th style="padding:6px 12px;border:1px solid #e5e7eb;text-align:left;">Scarto</th>
            </tr>
          </thead>
          <tbody>${dettaglio}</tbody>
        </table>` : `<p style="color:#6b7280;font-size:13px;">${
          r.status === 'no_match'    ? 'Operatore non trovato nel gestionale — verificare manualmente.' :
          r.status === 'no_presenze' ? 'Nessuna presenza inserita per questo periodo nel gestionale.' :
          'Nessun dettaglio disponibile.'
        }</p>`}
      </div>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="it"><head>
    <meta charset="utf-8">
    <title>Report discrepanze presenze — ${oggi}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px 40px; font-size: 14px; color: #111827; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .sub { color: #6b7280; font-size: 13px; margin: 0 0 32px; }
      @media print { body { padding: 16px 24px; } }
    </style>
  </head><body>
    <h1>Report discrepanze presenze vs buste paga</h1>
    <p class="sub">Generato il ${oggi} · ${daInviare.length} cedolini con discrepanze da verificare</p>
    ${righe}
    <p style="margin-top:40px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">
      Documento generato da WashIN · Busta paga = valori estratti dal PDF cedolino · Gestionale = presenze inserite manualmente
    </p>
  </body></html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.print()
}

function exportCsv(results) {
  const cols = ['operatore','cf','periodo','status','voce','busta','gestionale','scarto']
  const rows = []
  results.forEach((r, i) => {
    const nome    = `${r.busta.cognome||''} ${r.busta.nome||''}`.trim()
    const periodo = r.busta.anno && r.busta.mese ? `${pad(r.busta.mese)}/${r.busta.anno}` : ''
    const cf      = r.busta.codice_fiscale || ''
    const status  = _spunte[i] ? 'confermato_ok' : r.status
    const b = r.busta, p = r.presenze
    const campi = [
      { voce: 'Ore ordinarie', busta: b.ore_lavorate,      gest: p?.oreOrd   },
      { voce: 'Straordinario', busta: b.ore_straordinario, gest: p?.oreStr   },
      { voce: 'Ferie',         busta: b.ferie_ore,         gest: p?.ferieOre },
      { voce: 'Malattia',      busta: b.malattia_ore,      gest: p?.malatOre },
    ]
    campi.forEach(c => {
      const sc = (c.busta != null && c.gest != null) ? c.gest - c.busta : ''
      rows.push({ operatore: nome, cf, periodo, status,
        voce: c.voce, busta: c.busta ?? '', gestionale: c.gest ?? '', scarto: sc })
    })
  })
  const bom = '﻿'
  const header = cols.join(';')
  const body = rows.map(r => cols.map(c => String(r[c]??'')).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bom + header + '\n' + body], { type: 'text/csv;charset=utf-8' }))
  a.download = 'check_presenze.csv'
  a.click()
}

// ─── Init UI ──────────────────────────────────────────────────────────────────

export function initCheckPresenze() {
  const dropzone   = document.getElementById('check-pdf-dropzone')
  const fileInput  = document.getElementById('check-pdf-input')
  const progress   = document.getElementById('check-progress')
  const runBtn     = document.getElementById('check-run-btn')
  const resultsDiv = document.getElementById('check-presenze-results')

  if (!dropzone) return

  let _files = []

  function onFiles(files) {
    _files = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    dropzone.querySelector('p').textContent =
      `${_files.length} PDF selezionati (${_files.map(f=>f.name).join(', ').slice(0,80)}${_files.length > 3 ? '…' : ''})`
    runBtn.disabled = _files.length === 0
  }

  dropzone.addEventListener('click', () => fileInput.click())
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = '#0d9488' })
  dropzone.addEventListener('dragleave',  () => { dropzone.style.borderColor = '#d1d5db' })
  dropzone.addEventListener('drop', e => {
    e.preventDefault()
    dropzone.style.borderColor = '#d1d5db'
    onFiles(e.dataTransfer.files)
  })
  fileInput?.addEventListener('change', () => onFiles(fileInput.files))

  runBtn?.addEventListener('click', async () => {
    if (!_files.length) return
    runBtn.disabled = true
    progress.style.display = 'block'
    resultsDiv.innerHTML = ''

    try {
      progress.textContent = 'Analisi PDF in corso…'
      const parsed = await parseCedoliniPerCheck(_files, msg => { progress.textContent = msg })

      progress.textContent = 'Confronto con presenze inserite…'
      const results = await runCheck(parsed, msg => { progress.textContent = msg })

      _results = results
      renderCheckResults(results)
      progress.style.display = 'none'
    } catch (err) {
      showToast('Errore: ' + err.message, 'error')
      console.error(err)
      progress.style.display = 'none'
    } finally {
      runBtn.disabled = false
    }
  })
}
