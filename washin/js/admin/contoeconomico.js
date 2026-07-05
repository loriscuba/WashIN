import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function eur(n) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0)
}

function pctStr(n) {
  if (n === null || n === undefined) return 'N/D'
  return n.toFixed(1) + '%'
}

function marginColor(pct) {
  if (pct === null || pct === undefined) return '#6b7280'
  if (pct > 30) return '#059669'
  if (pct >= 10) return '#d97706'
  return '#dc2626'
}

// Costo orario: 1) busta paga del mese  2) costo_orario_medio da consuntivi  3) costo_mensile/ore_mensili
function _getCostoOrario(op, opId, busteMap) {
  const busta = busteMap[opId]
  if (busta?.costo_aziendale > 0 && busta?.ore_lavorate > 0)
    return { costoOrario: busta.costo_aziendale / busta.ore_lavorate, fonte: 'busta' }
  if (op?.costo_orario_medio > 0)
    return { costoOrario: op.costo_orario_medio, fonte: 'consuntivo' }
  const cm = op?.costo_mensile || 0
  const om = op?.ore_mensili_contratto || 160
  if (cm > 0)
    return { costoOrario: cm / om, fonte: 'profilo' }
  return { costoOrario: 0, fonte: null }
}

// Ore intervento: 1) inizio/fine effettivo  2) orario pianificato
// Nota: presenze_giornaliere registra ore giornaliere totali (non per-intervento), non usarle qui
function _getOreIntervento(iv) {
  if (iv.inizio_effettivo && iv.fine_effettivo) {
    const ore = (new Date(iv.fine_effettivo) - new Date(iv.inizio_effettivo)) / 3_600_000
    if (ore > 24) return { ore, anomalo: true, fonte: 'effettivo' }
    if (ore > 0)  return { ore, anomalo: false, fonte: 'effettivo' }
  }
  if (iv.ora_inizio_pianificata && iv.ora_fine_pianificata) {
    const [hi, mi] = iv.ora_inizio_pianificata.split(':').map(Number)
    const [hf, mf] = iv.ora_fine_pianificata.split(':').map(Number)
    const ore = (hf * 60 + mf - hi * 60 - mi) / 60
    if (ore > 0 && ore <= 24) return { ore, anomalo: false, fonte: 'pianificato' }
  }
  return { ore: 0, anomalo: false, fonte: null }
}

const FONTE_BADGE = {
  busta:      '<span title="Da busta paga importata" style="font-size:10px;padding:1px 5px;border-radius:4px;background:#d1fae5;color:#065f46;">busta</span>',
  consuntivo: '<span title="Da consuntivo costi" style="font-size:10px;padding:1px 5px;border-radius:4px;background:#eff6ff;color:#1e40af;">consuntivo</span>',
  profilo:    '<span title="Da costo mensile profilo" style="font-size:10px;padding:1px 5px;border-radius:4px;background:#f3f4f6;color:#374151;">profilo</span>',
  pianificato:'<span title="Ore pianificate (no timbrature)" style="font-size:10px;padding:1px 5px;border-radius:4px;background:#fef3c7;color:#92400e;">pianif.</span>',
}

export async function calcolaContoEconomico(contratto_id, mese, anno) {
  const startDate = `${anno}-${String(mese).padStart(2, '0')}-01`
  const endDate = new Date(anno, mese, 0).toISOString().slice(0, 10)

  const { data: contratto, error: ce } = await supabase
    .from('contratti')
    .select('*, clienti(ragione_sociale)')
    .eq('id', contratto_id)
    .single()
  if (ce || !contratto) return null

  // Tutti gli interventi non annullati del periodo (inclusi pianificato, per modalità orario)
  const { data: interventiRaw, error: ie } = await supabase
    .from('interventi')
    .select(`
      id, data_pianificata, ora_inizio_pianificata, ora_fine_pianificata,
      inizio_effettivo, fine_effettivo, km_percorsi, stato,
      operatore_id, operatore2_id,
      operatore:profili!operatore_id(nome, cognome, costo_mensile, ore_mensili_contratto, costo_orario_medio),
      operatore2:profili!operatore2_id(nome, cognome, costo_mensile, ore_mensili_contratto, costo_orario_medio)
    `)
    .eq('contratto_id', contratto_id)
    .neq('stato', 'annullato')
    .gte('data_pianificata', startDate)
    .lte('data_pianificata', endDate)
    .order('data_pianificata', { ascending: true })
  if (ie) throw ie

  const rows = interventiRaw || []

  // Carica buste_paga del mese per tutti gli operatori coinvolti
  const opIds = [...new Set([
    ...rows.map(r => r.operatore_id),
    ...rows.map(r => r.operatore2_id),
  ].filter(Boolean))]

  let busteMap = {}
  if (opIds.length > 0) {
    const { data: buste } = await supabase
      .from('buste_paga')
      .select('operatore_id, costo_aziendale, ore_lavorate')
      .in('operatore_id', opIds)
      .eq('anno', anno)
      .eq('mese', mese)
    ;(buste || []).forEach(b => { busteMap[b.operatore_id] = b })
  }

  // Materiali
  let matsByIntervento = {}
  if (rows.length > 0) {
    const ids = rows.map(r => r.id)
    const { data: mats } = await supabase
      .from('interventi_materiali')
      .select('intervento_id, quantita, costo_unitario_snapshot')
      .in('intervento_id', ids)
    ;(mats || []).forEach(m => {
      if (!matsByIntervento[m.intervento_id]) matsByIntervento[m.intervento_id] = []
      matsByIntervento[m.intervento_id].push(m)
    })
  }

  // Fleet
  const { data: veicoli } = await supabase
    .from('veicoli').select('consumo_per_100km, costo_carburante_litro').eq('attivo', true)
  const vCount = (veicoli || []).length
  const avgConsumo = vCount ? veicoli.reduce((s, v) => s + (v.consumo_per_100km || 8), 0) / vCount : 8
  const avgCarbL   = vCount ? veicoli.reduce((s, v) => s + (v.costo_carburante_litro || 1.8), 0) / vCount : 1.8

  let hasDatiParziali = rows.length === 0
  let opSenzaCosto    = []
  let usaDatiStimati  = false
  let totaleForzaLavoro = 0, totaleMateriali = 0, totaleVeicoli = 0

  const interventiCalcolati = rows.map(iv => {
    const { ore, anomalo, fonte: fonteOre } = _getOreIntervento(iv)
    if (fonteOre === 'pianificato') usaDatiStimati = true

    if (anomalo) {
      return { id: iv.id, data: iv.data_pianificata, ore, anomalo: true, stato: iv.stato,
               costoForzaLavoro: 0, costoMateriali: 0, costoVeicolo: 0, fonteOre, fonteCosto: null }
    }

    let costoForzaLavoro = 0, fonteCosto = null
    const operatori = [
      iv.operatore  ? { op: iv.operatore,  id: iv.operatore_id  } : null,
      iv.operatore2 ? { op: iv.operatore2, id: iv.operatore2_id } : null,
    ].filter(Boolean)

    for (const { op, id } of operatori) {
      const { costoOrario, fonte: fc } = _getCostoOrario(op, id, busteMap)
      if (!fc) {
        hasDatiParziali = true
        const cognome = op?.cognome || 'operatore'
        if (!opSenzaCosto.includes(cognome)) opSenzaCosto.push(cognome)
      }
      if (!fonteCosto && fc) fonteCosto = fc
      costoForzaLavoro += costoOrario * ore
    }

    const mats = matsByIntervento[iv.id] || []
    const costoMateriali = mats.reduce((s, m) => s + (m.quantita || 0) * (m.costo_unitario_snapshot || 0), 0)
    const km = iv.km_percorsi || 0
    const costoVeicolo = km > 0 ? km * (avgConsumo / 100) * avgCarbL : 0

    totaleForzaLavoro += costoForzaLavoro
    totaleMateriali   += costoMateriali
    totaleVeicoli     += costoVeicolo

    return { id: iv.id, data: iv.data_pianificata, ore, anomalo: false, stato: iv.stato,
             costoForzaLavoro, costoMateriali, costoVeicolo, fonteOre, fonteCosto }
  })

  const ricavo       = contratto.importo_mensile || 0
  const costoTotale  = totaleForzaLavoro + totaleMateriali + totaleVeicoli
  const margineLordo = ricavo - costoTotale
  const marginePct   = ricavo > 0 ? (margineLordo / ricavo) * 100 : null

  return {
    contratto, ricavo,
    totaleForzaLavoro, totaleMateriali, totaleVeicoli,
    costoTotale, margineLordo, marginePct,
    hasDatiParziali, opSenzaCosto, usaDatiStimati,
    hasAnomalies: interventiCalcolati.some(iv => iv.anomalo),
    interventi: interventiCalcolati,
  }
}

function renderKPICards(result) {
  const container = document.getElementById('ce-kpi')
  if (!container) return
  const mc = marginColor(result.marginePct)
  container.innerHTML = `
    <div class="ce-kpi-card" style="border-top:3px solid #3b82f6;">
      <div class="ce-kpi-label">Ricavo</div>
      <div class="ce-kpi-value">${eur(result.ricavo)}</div>
    </div>
    <div class="ce-kpi-card" style="border-top:3px solid #f97316;">
      <div class="ce-kpi-label">Forza Lavoro</div>
      <div class="ce-kpi-value">${eur(result.totaleForzaLavoro)}</div>
    </div>
    <div class="ce-kpi-card" style="border-top:3px solid #8b5cf6;">
      <div class="ce-kpi-label">Materiali</div>
      <div class="ce-kpi-value">${eur(result.totaleMateriali)}</div>
    </div>
    <div class="ce-kpi-card" style="border-top:3px solid #06b6d4;">
      <div class="ce-kpi-label">Veicoli</div>
      <div class="ce-kpi-value">${eur(result.totaleVeicoli)}</div>
    </div>
    <div class="ce-kpi-card" style="border-top:3px solid #6b7280;">
      <div class="ce-kpi-label">Costo Totale</div>
      <div class="ce-kpi-value">${eur(result.costoTotale)}</div>
    </div>
    <div class="ce-kpi-card" style="border-top:3px solid ${mc};">
      <div class="ce-kpi-label">Margine Lordo</div>
      <div class="ce-kpi-value" style="color:${mc};">${eur(result.margineLordo)}</div>
    </div>
    <div class="ce-kpi-card" style="border-top:3px solid ${mc};">
      <div class="ce-kpi-label">Margine %</div>
      <div class="ce-kpi-value" style="color:${mc};font-size:22px;font-weight:800;">${pctStr(result.marginePct)}</div>
    </div>
  `
}

let _ceContrattoId = null

async function calcolaEMostra() {
  if (!_ceContrattoId) return
  const mese = parseInt(document.getElementById('ce-mese')?.value || new Date().getMonth() + 1)
  const anno = parseInt(document.getElementById('ce-anno')?.value || new Date().getFullYear())

  const loadingEl = document.getElementById('ce-loading')
  const kpiEl = document.getElementById('ce-kpi')
  const bannerEl = document.getElementById('ce-banner-parziale')
  const bannerTextEl = document.getElementById('ce-banner-parziale-text')
  const bannerStimatiEl = document.getElementById('ce-banner-stimati')
  const anomalieEl = document.getElementById('ce-banner-anomalie')
  const sectionEl = document.getElementById('ce-interventi-section')

  if (loadingEl) loadingEl.style.display = 'flex'
  if (kpiEl) kpiEl.innerHTML = ''
  if (bannerEl) bannerEl.style.display = 'none'
  if (bannerStimatiEl) bannerStimatiEl.style.display = 'none'
  if (anomalieEl) anomalieEl.style.display = 'none'
  if (sectionEl) sectionEl.style.display = 'none'

  try {
    const result = await calcolaContoEconomico(_ceContrattoId, mese, anno)
    if (loadingEl) loadingEl.style.display = 'none'

    if (!result) {
      showToast('Errore calcolo conto economico', 'error')
      return
    }

    if (bannerEl) {
      bannerEl.style.display = result.hasDatiParziali ? 'flex' : 'none'
      if (result.hasDatiParziali && bannerTextEl) {
        const nomi = result.opSenzaCosto.length
          ? ` (${result.opSenzaCosto.join(', ')})`
          : ''
        bannerTextEl.innerHTML = `<strong>Dati parziali:</strong> costo non configurato per alcuni operatori${nomi}. Importa le buste paga o imposta il costo mensile nel profilo. I valori potrebbero essere incompleti.`
      }
    }
    if (bannerStimatiEl) bannerStimatiEl.style.display = result.usaDatiStimati ? 'flex' : 'none'
    if (anomalieEl) anomalieEl.style.display = result.hasAnomalies ? 'flex' : 'none'

    renderKPICards(result)

    const tbody = document.getElementById('ce-interventi-tbody')
    if (sectionEl && tbody) {
      if (result.interventi.length > 0) {
        sectionEl.style.display = 'block'
        tbody.innerHTML = ''
        result.interventi.forEach(iv => {
          const tr = document.createElement('tr')
          if (iv.anomalo) tr.style.background = '#fef2f2'
          const oreCell = iv.anomalo
            ? `<span style="color:#dc2626;font-weight:700;" title="Durata anomala: verifica inizio/fine effettivo nel pannello Interventi">${iv.ore.toFixed(1)}h ⚠</span>`
            : `${iv.ore.toFixed(1)}h`
          const oreBadge = (!iv.anomalo && iv.fonteOre && iv.fonteOre !== 'effettivo') ? ' ' + (FONTE_BADGE[iv.fonteOre] || '') : ''
          const costoBadge = (!iv.anomalo && iv.fonteCosto) ? (FONTE_BADGE[iv.fonteCosto] || '') : ''
          tr.innerHTML = `
            <td>${iv.data ? new Date(iv.data + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '-'}</td>
            <td>${oreCell}${oreBadge}</td>
            <td>${iv.anomalo ? '—' : eur(iv.costoForzaLavoro)}</td>
            <td>${iv.anomalo ? '—' : eur(iv.costoMateriali)}</td>
            <td>${iv.anomalo ? '—' : eur(iv.costoVeicolo)}</td>
            <td><strong>${iv.anomalo ? '—' : eur(iv.costoForzaLavoro + iv.costoMateriali + iv.costoVeicolo)}</strong></td>
            <td>${costoBadge}</td>
          `
          tbody.appendChild(tr)
        })
      }
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none'
    showToast('Errore: ' + err.message, 'error')
    console.error(err)
  }
}

export async function loadWidgetMarginalita() {
  const container = document.getElementById('widget-marginalita-body')
  if (!container) return

  try {
    const now = new Date()
    const mese = now.getMonth() + 1
    const anno = now.getFullYear()

    const { data: contratti, error } = await supabase
      .from('contratti')
      .select('id, numero_contratto, importo_mensile, clienti(ragione_sociale)')
      .eq('stato', 'attivo')
    if (error) throw error

    if (!contratti?.length) {
      container.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-500);padding:16px;">Nessun contratto attivo</td></tr>'
      return
    }

    const results = await Promise.all(
      contratti.map(c => calcolaContoEconomico(c.id, mese, anno).catch(() => null))
    )

    const items = results
      .filter(Boolean)
      .map(r => ({
        nome: r.contratto.clienti?.ragione_sociale || '-',
        numero: r.contratto.numero_contratto || '-',
        ricavo: r.ricavo,
        margineLordo: r.margineLordo,
        marginePct: r.marginePct,
      }))
      .sort((a, b) => {
        if (a.marginePct === null && b.marginePct === null) return 0
        if (a.marginePct === null) return -1
        if (b.marginePct === null) return 1
        return a.marginePct - b.marginePct
      })

    container.innerHTML = ''
    items.forEach(item => {
      const mc = marginColor(item.marginePct)
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>
          <strong>${item.nome}</strong>
          <br><span style="font-size:11px;color:var(--gray-500);">${item.numero}</span>
        </td>
        <td>${eur(item.ricavo)}</td>
        <td style="color:${mc};font-weight:600;">${eur(item.margineLordo)}</td>
        <td>
          <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;background:${mc}22;color:${mc};">
            ${pctStr(item.marginePct)}
          </span>
        </td>
      `
      container.appendChild(tr)
    })
  } catch (err) {
    console.error('Errore widget marginalità:', err)
    container.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-500);padding:16px;">Errore caricamento</td></tr>'
  }
}

export function initContoEconomico() {
  const modal = document.getElementById('conto-economico-modal')
  if (!modal) return

  modal.querySelector('.ce-close')?.addEventListener('click', () => modal.classList.remove('active'))
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active') })

  const meseEl = document.getElementById('ce-mese')
  if (meseEl) {
    meseEl.innerHTML = MESI.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')
    meseEl.value = String(new Date().getMonth() + 1)
  }
  const annoEl = document.getElementById('ce-anno')
  if (annoEl) annoEl.value = String(new Date().getFullYear())

  document.getElementById('ce-calcola')?.addEventListener('click', calcolaEMostra)

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="economico-contratto"]')
    if (!btn) return
    const id = btn.dataset.id
    const nome = btn.dataset.nome || ''
    if (!id) return
    _ceContrattoId = id
    const titleEl = document.getElementById('ce-modal-title')
    if (titleEl) titleEl.textContent = `Conto Economico — ${nome}`
    const kpiEl = document.getElementById('ce-kpi')
    if (kpiEl) kpiEl.innerHTML = ''
    const bannerEl = document.getElementById('ce-banner-parziale')
    if (bannerEl) bannerEl.style.display = 'none'
    const bannerStimatiEl = document.getElementById('ce-banner-stimati')
    if (bannerStimatiEl) bannerStimatiEl.style.display = 'none'
    const sectionEl = document.getElementById('ce-interventi-section')
    if (sectionEl) sectionEl.style.display = 'none'
    modal.classList.add('active')
    calcolaEMostra()
  })

  window.addEventListener('cruscotto:refresh', loadWidgetMarginalita)
  loadWidgetMarginalita()
}
