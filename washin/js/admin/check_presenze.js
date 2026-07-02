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
      if (!anno || !mese) {
        const meseM = text.match(/(?:Competenza|Periodo|Mese)[:\s]+(\w+)\s+(\d{4})/i)
        if (meseM) {
          const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                        'luglio','agosto','settembre','ottobre','novembre','dicembre']
          mese = MESI.indexOf(meseM[1].toLowerCase()) + 1 || null
          anno = parseInt(meseM[2])
        }
        // Fallback: cerca MM/YYYY o YYYY-MM
        if (!anno) {
          const dmM = text.match(/\b(\d{2})\/(\d{4})\b/)
          if (dmM) { mese = parseInt(dmM[1]); anno = parseInt(dmM[2]) }
        }
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

export function renderCheckResults(results, containerId = 'check-presenze-results') {
  const el = document.getElementById(containerId)
  if (!el) return

  if (!results.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:32px;">Nessun risultato. Carica i PDF cedolini e clicca Avvia check.</p>'
    return
  }

  const totOk      = results.filter(r => r.status === 'ok').length
  const totErr     = results.filter(r => r.status === 'errore').length
  const totWarn    = results.filter(r => r.status === 'warning').length
  const totNoMatch = results.filter(r => r.status === 'no_match').length
  const totNoPres  = results.filter(r => r.status === 'no_presenze').length

  el.innerHTML = `
    <!-- Riepilogo -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
      <div style="background:#d1fae5;border-radius:10px;padding:12px 20px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#065f46;">${totOk}</div>
        <div style="font-size:12px;color:#065f46;">Corrispondenti</div>
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
        <div style="font-size:24px;font-weight:700;color:#6b7280;">${totNoMatch + totNoPres}</div>
        <div style="font-size:12px;color:#6b7280;">Non verificabili</div>
      </div>
    </div>

    <!-- Tabella dettaglio -->
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Operatore</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Periodo</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Stato</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Discrepanze</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Ore ord. (busta / pres.)</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Straord.</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Ferie</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e5e7eb;">Malattia</th>
          </tr>
        </thead>
        <tbody>
          ${results.map((r, i) => {
            const b = r.busta
            const p = r.presenze
            const nome = `${b.cognome || '?'} ${b.nome || ''}`.trim()
            const periodo = b.anno && b.mese ? `${MESI_NOMI[b.mese]} ${b.anno}` : '—'
            const bgRow = i % 2 === 0 ? '#fff' : '#fafafa'

            const discr = r.flags.map(f => {
              const col = GRAVITA_COLOR[f.gravita]
              const delta = f.delta > 0 ? `+${fmtH(f.delta)}` : fmtH(f.delta)
              return `<div style="color:${col};font-weight:600;font-size:12px;">▸ ${f.campo}: ${delta}</div>`
            }).join('') || (r.status === 'no_match' ? '<span style="color:#9ca3af;">Operatore non trovato in DB</span>'
                          : r.status === 'no_presenze' ? '<span style="color:#9ca3af;">Nessuna presenza inserita</span>'
                          : r.status === 'no_periodo' ? '<span style="color:#9ca3af;">Periodo non rilevato nel PDF</span>'
                          : '<span style="color:#6b7280;">—</span>')

            const oreOrdBusta = b.ore_lavorate != null ? fmtH(b.ore_lavorate) : '?'
            const oreOrdPres  = p ? fmtH(p.oreOrd) : '—'
            const strBusta    = b.ore_straordinario != null ? fmtH(b.ore_straordinario) : '?'
            const strPres     = p ? fmtH(p.oreStr) : '—'
            const ferieBusta  = b.ferie_ore != null ? fmtH(b.ferie_ore) : '?'
            const feriePres   = p ? fmtH(p.ferieOre) : '—'
            const malatBusta  = b.malattia_ore != null ? fmtH(b.malattia_ore) : '?'
            const malatPres   = p ? fmtH(p.malatOre) : '—'

            return `<tr style="background:${bgRow};border-bottom:1px solid #f3f4f6;">
              <td style="padding:10px 12px;font-weight:600;">${nome}<br><span style="font-size:11px;color:#9ca3af;font-weight:400;">${b.filename || ''}</span></td>
              <td style="padding:10px 12px;">${periodo}</td>
              <td style="padding:10px 12px;text-align:center;">${STATUS_BADGE[r.status] || ''}</td>
              <td style="padding:10px 12px;">${discr}</td>
              <td style="padding:10px 12px;text-align:center;font-family:monospace;">${oreOrdBusta} / ${oreOrdPres}</td>
              <td style="padding:10px 12px;text-align:center;font-family:monospace;">${strBusta} / ${strPres}</td>
              <td style="padding:10px 12px;text-align:center;font-family:monospace;">${ferieBusta} / ${feriePres}</td>
              <td style="padding:10px 12px;text-align:center;font-family:monospace;">${malatBusta} / ${malatPres}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top:16px;display:flex;gap:12px;">
      <button id="check-export-csv" class="btn btn-secondary btn-sm">📥 Esporta discrepanze CSV</button>
    </div>
  `

  document.getElementById('check-export-csv')?.addEventListener('click', () => exportCsv(results))
}

function exportCsv(results) {
  const cols = ['operatore','cf','periodo','status','campo','busta','presenze','delta']
  const rows = []
  results.forEach(r => {
    const nome = `${r.busta.cognome||''} ${r.busta.nome||''}`.trim()
    const periodo = r.busta.anno && r.busta.mese ? `${pad(r.busta.mese)}/${r.busta.anno}` : ''
    if (!r.flags.length) {
      rows.push({ operatore: nome, cf: r.busta.codice_fiscale||'', periodo, status: r.status, campo:'', busta:'', presenze:'', delta:'' })
    } else {
      r.flags.forEach(f => {
        rows.push({ operatore: nome, cf: r.busta.codice_fiscale||'', periodo, status: r.status,
          campo: f.campo, busta: f.busta, presenze: f.presenze, delta: f.delta })
      })
    }
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
