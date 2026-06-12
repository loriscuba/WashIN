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

export async function calcolaContoEconomico(contratto_id, mese, anno) {
  const startDate = `${anno}-${String(mese).padStart(2, '0')}-01`
  const endDate = new Date(anno, mese, 0).toISOString().slice(0, 10)

  const { data: contratto, error: ce } = await supabase
    .from('contratti')
    .select('*, clienti(ragione_sociale)')
    .eq('id', contratto_id)
    .single()
  if (ce || !contratto) return null

  const { data: interventiRaw, error: ie } = await supabase
    .from('interventi')
    .select(`
      id, data_pianificata, ora_inizio_pianificata, ora_fine_pianificata,
      inizio_effettivo, fine_effettivo, km_percorsi,
      operatore:profili!operatore_id(nome, cognome, costo_mensile, ore_mensili_contratto),
      operatore2:profili!operatore2_id(nome, cognome, costo_mensile, ore_mensili_contratto)
    `)
    .eq('contratto_id', contratto_id)
    .in('stato', ['completato', 'approvato'])
    .gte('data_pianificata', startDate)
    .lte('data_pianificata', endDate)
    .not('fine_effettivo', 'is', null)
    .not('inizio_effettivo', 'is', null)
  if (ie) throw ie

  const rows = interventiRaw || []

  // Materials for all interventions
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

  // Fleet average for vehicle cost
  const { data: veicoli } = await supabase
    .from('veicoli').select('consumo_per_100km, costo_carburante_litro').eq('attivo', true)
  const vCount = (veicoli || []).length
  const avgConsumo = vCount ? veicoli.reduce((s, v) => s + (v.consumo_per_100km || 8), 0) / vCount : 8
  const avgCarbL = vCount ? veicoli.reduce((s, v) => s + (v.costo_carburante_litro || 1.8), 0) / vCount : 1.8

  let hasDatiParziali = rows.length === 0
  let totaleForzaLavoro = 0
  let totaleMateriali = 0
  let totaleVeicoli = 0

  const interventiCalcolati = rows.map(iv => {
    const ore = (new Date(iv.fine_effettivo) - new Date(iv.inizio_effettivo)) / 3_600_000

    let costoForzaLavoro = 0
    ;[iv.operatore, iv.operatore2].filter(Boolean).forEach(op => {
      const costoMensile = op.costo_mensile || 0
      const oreMensili = op.ore_mensili_contratto || 160
      if (!costoMensile) hasDatiParziali = true
      const costoOrario = oreMensili > 0 ? costoMensile / oreMensili : 0
      costoForzaLavoro += costoOrario * ore
    })

    const mats = matsByIntervento[iv.id] || []
    const costoMateriali = mats.reduce((s, m) => s + (m.quantita || 0) * (m.costo_unitario_snapshot || 0), 0)

    const km = iv.km_percorsi || 0
    const costoVeicolo = km > 0 ? km * (avgConsumo / 100) * avgCarbL : 0

    totaleForzaLavoro += costoForzaLavoro
    totaleMateriali += costoMateriali
    totaleVeicoli += costoVeicolo

    return {
      id: iv.id,
      data: iv.data_pianificata,
      ore: Math.max(0, ore),
      costoForzaLavoro,
      costoMateriali,
      costoVeicolo,
    }
  })

  const ricavo = contratto.importo_mensile || 0
  const costoTotale = totaleForzaLavoro + totaleMateriali + totaleVeicoli
  const margineLordo = ricavo - costoTotale
  const marginePct = ricavo > 0 ? (margineLordo / ricavo) * 100 : null

  return {
    contratto,
    ricavo,
    totaleForzaLavoro,
    totaleMateriali,
    totaleVeicoli,
    costoTotale,
    margineLordo,
    marginePct,
    hasDatiParziali,
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
  const sectionEl = document.getElementById('ce-interventi-section')

  if (loadingEl) loadingEl.style.display = 'flex'
  if (kpiEl) kpiEl.innerHTML = ''
  if (bannerEl) bannerEl.style.display = 'none'
  if (sectionEl) sectionEl.style.display = 'none'

  try {
    const result = await calcolaContoEconomico(_ceContrattoId, mese, anno)
    if (loadingEl) loadingEl.style.display = 'none'

    if (!result) {
      showToast('Errore calcolo conto economico', 'error')
      return
    }

    if (bannerEl) bannerEl.style.display = result.hasDatiParziali ? 'flex' : 'none'

    renderKPICards(result)

    const tbody = document.getElementById('ce-interventi-tbody')
    if (sectionEl && tbody) {
      if (result.interventi.length > 0) {
        sectionEl.style.display = 'block'
        tbody.innerHTML = ''
        result.interventi.forEach(iv => {
          const tr = document.createElement('tr')
          tr.innerHTML = `
            <td>${iv.data ? new Date(iv.data + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '-'}</td>
            <td>${iv.ore.toFixed(1)}h</td>
            <td>${eur(iv.costoForzaLavoro)}</td>
            <td>${eur(iv.costoMateriali)}</td>
            <td>${eur(iv.costoVeicolo)}</td>
            <td><strong>${eur(iv.costoForzaLavoro + iv.costoMateriali + iv.costoVeicolo)}</strong></td>
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
    const sectionEl = document.getElementById('ce-interventi-section')
    if (sectionEl) sectionEl.style.display = 'none'
    modal.classList.add('active')
    calcolaEMostra()
  })

  window.addEventListener('cruscotto:refresh', loadWidgetMarginalita)
  loadWidgetMarginalita()
}
