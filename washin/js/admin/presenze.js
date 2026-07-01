import supabase from '../supabase.js'
import { showToast } from './clienti.js'

function parseTimeToSeconds(t) {
  if (!t) return 0
  const parts = t.split(':').map(Number)
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)
}

function secondsToHM(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export async function loadPresenze(filtri = {}) {
  try {
    const now = new Date()
    const defaultMese = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const mese = filtri.mese || defaultMese
    const [year, month] = mese.split('-').map(Number)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = new Date(year, month, 0).toISOString().slice(0, 10)

    let query = supabase.from('interventi')
      .select('id, data_pianificata, inizio_effettivo, fine_effettivo, ora_inizio_pianificata, ora_fine_pianificata, stato, operatore_id, operatore:profili!operatore_id(id, nome, cognome)')
      .in('stato', ['completato', 'approvato'])
      .gte('data_pianificata', start)
      .lte('data_pianificata', end)

    if (filtri.operatore_id) query = query.eq('operatore_id', filtri.operatore_id)

    const { data, error } = await query.order('data_pianificata', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento presenze', 'error')
    console.error(err)
    return []
  }
}

export function renderTabellaPresenze(interventi) {
  const tbody = document.getElementById('presenze-table-body')
  if (!tbody) return
  tbody.innerHTML = ''

  const byOp = {}
  interventi.forEach(iv => {
    const opId = iv.operatore?.id || iv.operatore_id || '__sconosciuto__'
    const opName = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : 'Sconosciuto'
    if (!byOp[opId]) byOp[opId] = { name: opName, count: 0, seconds: 0, days: new Set() }
    byOp[opId].count++
    byOp[opId].days.add(iv.data_pianificata)
    let secs = 0
    if (iv.inizio_effettivo && iv.fine_effettivo) {
      secs = Math.max(0, (new Date(iv.fine_effettivo) - new Date(iv.inizio_effettivo)) / 1000)
    } else {
      secs = Math.max(0, parseTimeToSeconds(iv.ora_fine_pianificata) - parseTimeToSeconds(iv.ora_inizio_pianificata))
    }
    byOp[opId].seconds += secs
  })

  if (!Object.keys(byOp).length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun dato per il periodo selezionato</td></tr>'
    return
  }

  Object.values(byOp).forEach(op => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>${op.name}</strong></td>
      <td>${op.days.size}</td>
      <td>${op.count}</td>
      <td><strong>${secondsToHM(op.seconds)}</strong></td>
    `
    tbody.appendChild(tr)
  })
}

export function initPresenze() {
  try {
    const meseInput = document.getElementById('presenze-mese')
    const opFilter = document.getElementById('presenze-operatore')
    const refreshBtn = document.getElementById('refresh-presenze')
    const printBtn = document.getElementById('print-presenze')

    const now = new Date()
    if (meseInput && !meseInput.value) {
      meseInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    async function loadOperatoriFilter() {
      if (!opFilter) return
      const { data } = await supabase.from('profili').select('id,nome,cognome').or('ruolo.eq.operatore,ruolo.is.null').eq('attivo', true)
      opFilter.innerHTML = '<option value="">Tutti gli operatori</option>'
      ;(data || []).forEach(op => {
        const o = document.createElement('option')
        o.value = op.id
        o.textContent = `${op.nome || ''} ${op.cognome || ''}`.trim()
        opFilter.appendChild(o)
      })
    }

    async function refresh() {
      const filtri = { mese: meseInput?.value, operatore_id: opFilter?.value || null }
      const data = await loadPresenze(filtri)
      renderTabellaPresenze(data)
    }

    meseInput?.addEventListener('change', refresh)
    opFilter?.addEventListener('change', refresh)
    refreshBtn?.addEventListener('click', refresh)

    printBtn?.addEventListener('click', () => {
      const tbody = document.getElementById('presenze-table-body')
      const meseVal = meseInput?.value || ''
      if (!tbody) return
      const win = window.open('', '_blank', 'width=800,height=600')
      if (!win) { window.print(); return }
      win.document.write(`<!DOCTYPE html><html><head>
        <meta charset="utf-8"><title>Presenze ${meseVal} — WashIN</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;font-size:14px;}
          h1{font-size:18px;margin-bottom:6px;}
          p{color:#666;margin-bottom:20px;}
          table{width:100%;border-collapse:collapse;}
          th,td{padding:10px 14px;border:1px solid #ddd;text-align:left;}
          th{background:#f5f5f5;font-weight:700;}
          tr:nth-child(even){background:#fafafa;}
        </style></head><body>
        <h1>Riepilogo Presenze</h1>
        <p>Periodo: ${meseVal} &nbsp;|&nbsp; Stampato il ${new Date().toLocaleDateString('it-IT')}</p>
        <table>
          <thead><tr><th>Operatore</th><th>Giorni lavorati</th><th>Interventi</th><th>Ore totali</th></tr></thead>
          <tbody>${tbody.innerHTML}</tbody>
        </table>
        </body></html>`)
      win.document.close()
      win.print()
    })

    loadOperatoriFilter().then(refresh)

    // Tab switching
    document.querySelectorAll('[data-ptab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.ptab
        document.getElementById('presenze-view-interventi').style.display = tab === 'interventi' ? '' : 'none'
        document.getElementById('presenze-view-ore').style.display       = tab === 'ore' ? '' : 'none'
        document.querySelector('[data-ptab="interventi"]').className = tab === 'interventi' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'
        document.querySelector('[data-ptab="ore"]').className        = tab === 'ore' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'
      })
    })

    // Ore dichiarate
    const oreMeseInput = document.getElementById('ore-mese')
    const oreLoadBtn   = document.getElementById('btn-load-ore')
    if (oreMeseInput) {
      oreMeseInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
    oreLoadBtn?.addEventListener('click', () => loadOreDichiarate(oreMeseInput?.value))
  } catch (err) {
    showToast('Errore inizializzazione presenze', 'error')
    console.error(err)
  }
}

async function loadOreDichiarate(meseStr) {
  const tbody = document.getElementById('ore-dichiarate-table-body')
  if (!tbody || !meseStr) return
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;">Caricamento...</td></tr>'

  const [anno, mese] = meseStr.split('-').map(Number)
  const from = `${anno}-${String(mese).padStart(2,'0')}-01`
  const giorni = new Date(anno, mese, 0).getDate()
  const to = `${anno}-${String(mese).padStart(2,'0')}-${String(giorni).padStart(2,'0')}`

  const { data, error } = await supabase
    .from('presenze_giornaliere')
    .select('profilo_id, data, tipo, ore_ordinarie, ore_straordinario, profilo:profili!profilo_id(nome, cognome)')
    .gte('data', from)
    .lte('data', to)

  if (error) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:24px;">Errore caricamento</td></tr>'
    return
  }

  // Count working days in month (Mon-Fri)
  let ferialiMese = 0
  for (let g = 1; g <= giorni; g++) {
    const dow = new Date(anno, mese - 1, g).getDay()
    if (dow !== 0 && dow !== 6) ferialiMese++
  }

  // Aggregate by operator
  const byOp = {}
  ;(data || []).forEach(r => {
    const id = r.profilo_id
    if (!byOp[id]) {
      const nome = r.profilo ? `${r.profilo.nome || ''} ${r.profilo.cognome || ''}`.trim() : id
      byOp[id] = { nome, ggLavoro: 0, oreOrd: 0, oreStr: 0, ferie: 0, malattia: 0, registrati: 0 }
    }
    byOp[id].registrati++
    if (r.tipo === 'lavoro') {
      byOp[id].ggLavoro++
      byOp[id].oreOrd += parseFloat(r.ore_ordinarie || 0)
      byOp[id].oreStr += parseFloat(r.ore_straordinario || 0)
    } else if (r.tipo === 'feria') byOp[id].ferie++
    else if (r.tipo === 'malattia') byOp[id].malattia++
  })

  if (!Object.keys(byOp).length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:24px;">Nessun dato per il periodo selezionato</td></tr>'
    return
  }

  function fmtOre(h) {
    if (!h) return '—'
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
    return mm ? `${hh}h ${String(mm).padStart(2,'0')}m` : `${hh}h`
  }

  tbody.innerHTML = Object.values(byOp)
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(op => {
      const nonReg = Math.max(0, ferialiMese - op.registrati)
      return `<tr>
        <td><strong>${op.nome}</strong></td>
        <td>${op.ggLavoro}</td>
        <td>${fmtOre(op.oreOrd)}</td>
        <td>${op.oreStr ? `<span style="color:#f59e0b;font-weight:600;">${fmtOre(op.oreStr)}</span>` : '—'}</td>
        <td>${op.ferie || '—'}</td>
        <td>${op.malattia || '—'}</td>
        <td>${nonReg ? `<span style="color:#ef4444;">${nonReg}</span>` : '<span style="color:#10b981;">✓</span>'}</td>
      </tr>`
    }).join('')
}
