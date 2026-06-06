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
      const { data } = await supabase.from('profili').select('id,nome,cognome').eq('ruolo', 'operatore').eq('attivo', true)
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
  } catch (err) {
    showToast('Errore inizializzazione presenze', 'error')
    console.error(err)
  }
}
