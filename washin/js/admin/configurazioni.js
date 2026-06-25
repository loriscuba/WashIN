import supabase from '../supabase.js'
import { showToast } from './clienti.js'

// ── Parametri CCNL ────────────────────────────────────────────────────────────

async function loadParametriCcnl() {
  const { data, error } = await supabase
    .from('parametri_ccnl')
    .select('*')
    .order('valido_da', { ascending: false })
    .order('livello')
  if (error) { console.error(error); return [] }
  return data || []
}

function fmtPct(v) {
  return v != null ? (v * 100).toFixed(3) : ''
}

function renderParametriCcnl(rows) {
  const tbody = document.getElementById('ccnl-tbody')
  if (!tbody) return
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--gray-400);padding:24px;">Nessun parametro CCNL. Eseguire migrations_v19.sql su Supabase.</td></tr>'
    return
  }
  tbody.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input class="ccnl-inp tbl-inp" name="livello" value="${r.livello ?? ''}" style="width:52px"></td>
      <td><input class="ccnl-inp tbl-inp" name="descrizione_livello" value="${r.descrizione_livello ?? ''}" style="width:100%;min-width:180px"></td>
      <td><input class="ccnl-inp tbl-inp" type="number" step="0.01" name="paga_base_mensile" value="${r.paga_base_mensile ?? ''}" style="width:90px"></td>
      <td><input class="ccnl-inp tbl-inp" type="number" step="0.01" name="contingenza" value="${r.contingenza ?? ''}" style="width:82px"></td>
      <td><input class="ccnl-inp tbl-inp" type="number" step="0.01" name="edr" value="${r.edr ?? ''}" style="width:68px"></td>
      <td><input class="ccnl-inp tbl-inp" type="number" name="divisore_orario" value="${r.divisore_orario ?? ''}" style="width:56px"></td>
      <td><input class="ccnl-inp tbl-inp" type="number" step="0.001" name="aliquota_inps_datore" value="${fmtPct(r.aliquota_inps_datore)}" data-is-pct="1" style="width:72px" title="INPS datore in % (es. 31.5)"></td>
      <td><input class="ccnl-inp tbl-inp" type="number" step="0.001" name="percentuale_rateo_ferie_permessi" value="${fmtPct(r.percentuale_rateo_ferie_permessi)}" data-is-pct="1" style="width:72px" title="Ferie + permessi + ex-festività in % del lordo (es. 22.0)"></td>
      <td><input class="ccnl-inp tbl-inp" type="date" name="valido_da" value="${r.valido_da ?? ''}" style="width:122px"></td>
      <td style="white-space:nowrap">
        <button class="btn btn-primary btn-sm ccnl-save-btn">Salva</button>
      </td>
    </tr>
  `).join('')
}

async function saveCcnlRow(tr) {
  const id = tr.dataset.id
  const inputs = tr.querySelectorAll('.ccnl-inp')
  const fields = {}
  inputs.forEach(inp => {
    if (inp.type === 'number') {
      const v = +inp.value
      fields[inp.name] = inp.dataset.isPct ? v / 100 : v
    } else {
      fields[inp.name] = inp.value
    }
  })

  const { error } = await supabase.from('parametri_ccnl').update(fields).eq('id', id)
  if (error) { showToast('Errore salvataggio CCNL: ' + error.message, 'error'); console.error(error) }
  else showToast('Parametri CCNL salvati', 'success')
}

// ── Tariffe INAIL ─────────────────────────────────────────────────────────────

async function loadTariffeInail() {
  const { data, error } = await supabase
    .from('tariffe_inail')
    .select('*')
    .order('valido_da', { ascending: false })
    .order('voce_tariffa')
  if (error) { console.error(error); return [] }
  return data || []
}

function renderTariffeInail(rows) {
  const tbody = document.getElementById('inail-tbody')
  if (!tbody) return
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:24px;">Nessuna tariffa INAIL. Eseguire migrations_v19.sql su Supabase.</td></tr>'
    return
  }
  tbody.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input class="inail-inp tbl-inp" name="voce_tariffa" value="${r.voce_tariffa ?? ''}" style="width:72px"></td>
      <td><input class="inail-inp tbl-inp" name="descrizione" value="${r.descrizione ?? ''}" style="width:100%;min-width:220px"></td>
      <td>
        <input class="inail-inp tbl-inp" type="number" step="0.00001" name="tasso_inail" value="${fmtPct(r.tasso_inail)}" data-is-pct="1" style="width:76px" title="Valore in % (es. 3.000)">
        <span style="color:var(--gray-400);font-size:12px"> %</span>
      </td>
      <td><input class="inail-inp tbl-inp" type="date" name="valido_da" value="${r.valido_da ?? ''}" style="width:122px"></td>
      <td style="white-space:nowrap">
        <button class="btn btn-primary btn-sm inail-save-btn">Salva</button>
        <button class="btn btn-danger btn-sm inail-del-btn" style="margin-left:6px">Elimina</button>
      </td>
    </tr>
  `).join('')
}

async function saveInailRow(tr) {
  const id = tr.dataset.id
  const inputs = tr.querySelectorAll('.inail-inp')
  const fields = {}
  inputs.forEach(inp => {
    if (inp.type === 'number') {
      const v = +inp.value
      fields[inp.name] = inp.dataset.isPct ? v / 100 : v
    } else {
      fields[inp.name] = inp.value
    }
  })

  let error
  if (id === 'new') {
    ;({ error } = await supabase.from('tariffe_inail').insert(fields))
  } else {
    ;({ error } = await supabase.from('tariffe_inail').update(fields).eq('id', id))
  }

  if (error) { showToast('Errore salvataggio tariffa INAIL: ' + error.message, 'error'); console.error(error) }
  else { showToast('Tariffa INAIL salvata', 'success'); await refreshInail() }
}

async function deleteInailRow(id) {
  if (!confirm('Eliminare questa tariffa INAIL?')) return
  const { error } = await supabase.from('tariffe_inail').delete().eq('id', id)
  if (error) { showToast('Errore eliminazione: ' + error.message, 'error') }
  else { showToast('Tariffa eliminata', 'success'); await refreshInail() }
}

function addNewInailRow() {
  const tbody = document.getElementById('inail-tbody')
  if (!tbody) return
  if (tbody.querySelector('[data-id="new"]')) return

  const today = new Date().toISOString().slice(0, 10)
  const tr = document.createElement('tr')
  tr.dataset.id = 'new'
  tr.innerHTML = `
    <td><input class="inail-inp tbl-inp" name="voce_tariffa" value="" placeholder="0000" style="width:72px"></td>
    <td><input class="inail-inp tbl-inp" name="descrizione" value="" placeholder="Descrizione attività" style="width:100%;min-width:220px"></td>
    <td>
      <input class="inail-inp tbl-inp" type="number" step="0.00001" name="tasso_inail" value="3.000" data-is-pct="1" style="width:76px">
      <span style="color:var(--gray-400);font-size:12px"> %</span>
    </td>
    <td><input class="inail-inp tbl-inp" type="date" name="valido_da" value="${today}" style="width:122px"></td>
    <td style="white-space:nowrap">
      <button class="btn btn-primary btn-sm inail-save-btn">Salva</button>
      <button class="btn btn-secondary btn-sm inail-cancel-btn" style="margin-left:6px">Annulla</button>
    </td>
  `
  tbody.prepend(tr)
  tr.querySelector('.inail-inp').focus()
  tr.querySelector('.inail-cancel-btn')?.addEventListener('click', () => tr.remove())
}

// ── Refresh helpers ───────────────────────────────────────────────────────────

async function refreshCcnl() {
  const rows = await loadParametriCcnl()
  renderParametriCcnl(rows)
}

async function refreshInail() {
  const rows = await loadTariffeInail()
  renderTariffeInail(rows)
}

// ── Coefficienti rischio appalto ──────────────────────────────────────────────

async function loadCoefficientiRischio() {
  const { data, error } = await supabase.from('coefficienti_rischio').select('*').order('ordine')
  if (error) { console.error(error); return [] }
  return data || []
}

function renderCoefficientiRischio(rows) {
  const tbody = document.getElementById('coeff-tbody')
  if (!tbody) return
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:24px;">Nessun coefficiente. Eseguire migrations_v23.sql su Supabase.</td></tr>'
    return
  }
  tbody.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input class="coeff-inp tbl-inp" name="codice" value="${r.codice ?? ''}" style="width:110px"></td>
      <td><input class="coeff-inp tbl-inp" name="descrizione" value="${r.descrizione ?? ''}" style="width:100%;min-width:200px"></td>
      <td><input class="coeff-inp tbl-inp" type="number" step="0.001" name="coefficiente" value="${r.coefficiente ?? ''}" style="width:88px" title="es. 1.100"></td>
      <td><input class="coeff-inp tbl-inp" type="number" step="1" name="ordine" value="${r.ordine ?? 0}" style="width:60px"></td>
      <td style="white-space:nowrap">
        <button class="btn btn-primary btn-sm coeff-save-btn">Salva</button>
        <button class="btn btn-danger btn-sm coeff-del-btn" style="margin-left:6px">Elimina</button>
      </td>
    </tr>
  `).join('')
}

async function saveCoefficientiRow(tr) {
  const id = tr.dataset.id
  const fields = {}
  tr.querySelectorAll('.coeff-inp').forEach(inp => {
    fields[inp.name] = inp.type === 'number' ? +inp.value : inp.value
  })
  let error
  if (id === 'new') {
    ;({ error } = await supabase.from('coefficienti_rischio').insert(fields))
  } else {
    ;({ error } = await supabase.from('coefficienti_rischio').update(fields).eq('id', id))
  }
  if (error) { showToast('Errore salvataggio: ' + error.message, 'error') }
  else { showToast('Coefficiente salvato', 'success'); await refreshCoefficienti() }
}

async function deleteCoefficientiRow(id) {
  if (!confirm('Eliminare questo coefficiente?')) return
  const { error } = await supabase.from('coefficienti_rischio').delete().eq('id', id)
  if (error) { showToast('Errore eliminazione: ' + error.message, 'error') }
  else { showToast('Coefficiente eliminato', 'success'); await refreshCoefficienti() }
}

function addNewCoefficientiRow() {
  const tbody = document.getElementById('coeff-tbody')
  if (!tbody || tbody.querySelector('[data-id="new"]')) return
  const tr = document.createElement('tr')
  tr.dataset.id = 'new'
  tr.innerHTML = `
    <td><input class="coeff-inp tbl-inp" name="codice" placeholder="es. speciale" style="width:110px"></td>
    <td><input class="coeff-inp tbl-inp" name="descrizione" placeholder="Descrizione tipo appalto" style="width:100%;min-width:200px"></td>
    <td><input class="coeff-inp tbl-inp" type="number" step="0.001" name="coefficiente" value="1.100" style="width:88px"></td>
    <td><input class="coeff-inp tbl-inp" type="number" step="1" name="ordine" value="4" style="width:60px"></td>
    <td style="white-space:nowrap">
      <button class="btn btn-primary btn-sm coeff-save-btn">Salva</button>
      <button class="btn btn-secondary btn-sm coeff-cancel-btn" style="margin-left:6px">Annulla</button>
    </td>
  `
  tbody.prepend(tr)
  tr.querySelector('.coeff-inp').focus()
  tr.querySelector('.coeff-cancel-btn')?.addEventListener('click', () => tr.remove())
}

async function refreshCoefficienti() {
  renderCoefficientiRischio(await loadCoefficientiRischio())
  await loadImpostUseCoeff()
}

// ── Impostazione: usa coefficiente nei preventivi ─────────────────────────────

async function loadImpostUseCoeff() {
  const { data } = await supabase.from('impostazioni')
    .select('valore').eq('chiave', 'preventivi_usa_coefficiente').maybeSingle()
  const val = data?.valore !== 'false'
  const el = document.getElementById('impost-usa-coeff')
  if (el) el.checked = val
  return val
}

async function saveImpostUseCoeff(val) {
  const { error } = await supabase.from('impostazioni')
    .upsert({ chiave: 'preventivi_usa_coefficiente', valore: val ? 'true' : 'false', aggiornato_a: new Date().toISOString() })
  if (error) { showToast('Errore salvataggio impostazione', 'error'); return }
  window.dispatchEvent(new CustomEvent('impostazioni:changed', { detail: { preventivi_usa_coefficiente: val } }))
  showToast(val ? 'Coefficiente abilitato nei preventivi' : 'Coefficiente disabilitato nei preventivi', 'success')
}

// ── Fattore di Incidenza Reale (FIR) ─────────────────────────────────────────

const EUR_FIR = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0)

async function loadFirPersonale() {
  const { data } = await supabase.from('profili')
    .select('id,nome,cognome,livello_ccnl,ore_mensili_contratto,costo_mensile,fir_personale')
    .neq('attivo', false)
    .order('cognome')

  const tbody = document.getElementById('fir-tbody')
  if (!tbody) return

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--gray-500);">Nessun dipendente trovato</td></tr>'
    return
  }

  tbody.innerHTML = data.map(op => {
    const nome = `${op.cognome || ''} ${op.nome || ''}`.trim()
    const fir  = op.fir_personale != null ? op.fir_personale : ''
    const ore  = op.ore_mensili_contratto || 160
    const costoOra = (op.costo_mensile > 0 && fir !== '')
      ? (op.costo_mensile / ore).toFixed(4)
      : (op.costo_mensile > 0 ? (op.costo_mensile / ore).toFixed(4) : '—')
    const costoRealeFmt = op.costo_mensile > 0
      ? `<span style="color:#065f46;font-weight:600;">${EUR_FIR(op.costo_mensile)}</span>`
      : `<span style="color:#dc2626;">—</span>`
    return `
      <tr data-id="${op.id}">
        <td style="font-weight:600;">${nome}</td>
        <td>${op.livello_ccnl || '<span style="color:var(--gray-500);">—</span>'}</td>
        <td style="text-align:center;">${ore}</td>
        <td>${costoRealeFmt}</td>
        <td>
          <div style="display:flex;align-items:center;gap:5px;">
            <input class="fir-op-inp tbl-inp" type="number" step="0.1" min="50" max="200"
              value="${fir}" placeholder="—" style="width:68px;">
            <span style="font-size:11px;color:var(--gray-500);">%</span>
          </div>
        </td>
        <td style="font-size:12px;color:#1e40af;text-align:center;" class="fir-op-preview">${costoOra !== '—' ? EUR_FIR(costoOra) + '/h' : '—'}</td>
        <td><button class="btn btn-primary btn-sm fir-op-save-btn" style="white-space:nowrap;">Salva</button></td>
      </tr>
    `
  }).join('')

  // live preview: update €/h when FIR or costo_mensile change
  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    const op = data.find(o => o.id === tr.dataset.id)
    if (!op) return
    const inp = tr.querySelector('.fir-op-inp')
    const preview = tr.querySelector('.fir-op-preview')
    inp?.addEventListener('input', () => {
      const fv = parseFloat(inp.value)
      const ore = op.ore_mensili_contratto || 160
      if (!isNaN(fv) && op.costo_mensile > 0) {
        preview.textContent = EUR_FIR(op.costo_mensile / ore) + '/h'
      } else if (!isNaN(fv) && fv >= 50) {
        preview.textContent = '(stima CCNL)'
      } else {
        preview.textContent = '—'
      }
    })
  })
}

async function saveFirOperatore(tr) {
  const id  = tr.dataset.id
  const inp = tr.querySelector('.fir-op-inp')
  const raw = inp?.value
  if (raw === '' || raw == null) {
    const { error } = await supabase.from('profili').update({ fir_personale: null }).eq('id', id)
    if (error) { showToast('Errore salvataggio FIR', 'error'); return }
    showToast('FIR rimosso (userebbe il globale)', 'success')
    return
  }
  const val = parseFloat(raw)
  if (isNaN(val) || val < 50 || val > 200) { showToast('FIR deve essere tra 50 e 200', 'error'); return }
  const { error } = await supabase.from('profili').update({ fir_personale: val }).eq('id', id)
  if (error) { showToast('Errore salvataggio FIR: ' + error.message, 'error'); return }
  window.dispatchEvent(new CustomEvent('impostazioni:changed', { detail: { fir_operatore: { id, fir_personale: val } } }))
  showToast(`FIR ${val}% salvato`, 'success')
}

async function ricalcolaFirDaBustePaga() {
  const tbody = document.getElementById('fir-tbody')
  if (!tbody) return

  // I cedolini non contengono i costi datore reali (INPS datore, ratei, ecc.)
  // Usiamo il lordo medio mensile + parametri CCNL per una stima uniforme.
  // Per FIR personalizzati per operatore, caricare il consuntivo della commercialista.
  const { data: buste, error } = await supabase
    .from('buste_paga')
    .select('operatore_id,totale_lordo')
    .gt('totale_lordo', 0)

  if (error) { showToast('Errore lettura buste paga', 'error'); return }
  if (!buste?.length) { showToast('Nessuna busta paga caricata — caricare prima i cedolini in Anagrafica', 'info'); return }

  const agg = {}
  for (const b of buste) {
    if (!agg[b.operatore_id]) agg[b.operatore_id] = { lordo: 0, n: 0 }
    agg[b.operatore_id].lordo += b.totale_lordo
    agg[b.operatore_id].n++
  }

  // Parametri CCNL per calcolare il costo datore completo
  const { data: ccnl } = await supabase
    .from('parametri_ccnl')
    .select('percentuale_rateo_13,percentuale_rateo_14,percentuale_rateo_ferie_permessi,aliquota_inps_datore,percentuale_tfr')
    .order('valido_da', { ascending: false })
    .limit(1)
    .maybeSingle()

  const inps   = ccnl?.aliquota_inps_datore             ?? 0.31500
  const inail  = 0.03000
  const r13    = ccnl?.percentuale_rateo_13             ?? 0.08333
  const r14    = ccnl?.percentuale_rateo_14             ?? 0.08333
  const rferie = ccnl?.percentuale_rateo_ferie_permessi ?? 0.22000
  const tfr    = ccnl?.percentuale_tfr                  ?? 0.07407
  // FIR CCNL = INPS + INAIL + ratei×(1+INPS) + TFR×(1+r13+r14)
  const firCcnl = inps + inail
    + (r13 + r14 + rferie) * (1 + inps)
    + (1 + r13 + r14) * tfr - 1
  const firPct = Math.round(firCcnl * 1000) / 10

  let aggiornati = 0
  for (const opId of Object.keys(agg)) {
    const tr = tbody.querySelector(`tr[data-id="${opId}"]`)
    if (tr) {
      const inp = tr.querySelector('.fir-op-inp')
      if (inp) { inp.value = firPct; inp.dispatchEvent(new Event('input')) }
      aggiornati++
    }
  }

  showToast(aggiornati > 0
    ? `FIR CCNL stimato ${firPct}% impostato per ${aggiornati} operatori — carica il consuntivo per valori personalizzati`
    : 'Nessun operatore con buste paga trovato',
    aggiornati > 0 ? 'info' : 'warning')
}

// ── Algoritmo costi: agevolazione INPS e buffer inefficienze ─────────────────

function _setAlgoritmoParamsVisible(attivo) {
  const paramsEl = document.getElementById('algoritmo-params')
  if (paramsEl) paramsEl.style.opacity = attivo ? '1' : '0.35'
  paramsEl?.querySelectorAll('input,button').forEach(el => { el.disabled = !attivo })
  // lascia visibile il pulsante Salva ma disabilitato — utente capisce lo stato
}

async function loadAlgoritmoParametri() {
  const { data } = await supabase.from('impostazioni')
    .select('chiave,valore')
    .in('chiave', ['agevolazione_inps_calibrata', 'buffer_inefficienze', 'algoritmo_costi_attivo'])
  const map = Object.fromEntries((data || []).map(r => [r.chiave, r.valore]))
  const attivo = map.algoritmo_costi_attivo === 'true'
  const toggleEl = document.getElementById('algoritmo-attivo-toggle')
  const agevEl   = document.getElementById('algoritmo-agevolazione-inps')
  const bufEl    = document.getElementById('algoritmo-buffer-inefficienze')
  if (toggleEl) toggleEl.checked = attivo
  if (agevEl) agevEl.value = parseFloat(map.agevolazione_inps_calibrata ?? '0') * 100 || 0
  if (bufEl)  bufEl.value  = parseFloat(map.buffer_inefficienze ?? '0.12') * 100 || 12
  _setAlgoritmoParamsVisible(attivo)
}

async function saveAlgoritmoParametri() {
  const agevEl = document.getElementById('algoritmo-agevolazione-inps')
  const bufEl  = document.getElementById('algoritmo-buffer-inefficienze')
  const agev = parseFloat(agevEl?.value || '0') / 100
  const buf  = parseFloat(bufEl?.value  || '12') / 100
  if (isNaN(agev) || agev < 0 || agev > 0.5) { showToast('Agevolazione INPS deve essere tra 0% e 50%', 'error'); return }
  if (isNaN(buf)  || buf  < 0 || buf  > 1)   { showToast('Buffer inefficienze deve essere tra 0% e 100%', 'error'); return }
  const updates = [
    { chiave: 'agevolazione_inps_calibrata', valore: String(agev), aggiornato_a: new Date().toISOString() },
    { chiave: 'buffer_inefficienze',         valore: String(buf),  aggiornato_a: new Date().toISOString() }
  ]
  const { error } = await supabase.from('impostazioni').upsert(updates)
  if (error) { showToast('Errore salvataggio: ' + error.message, 'error'); return }
  showToast('Parametri algoritmo salvati', 'success')
}

// FIR globale fallback (impostazioni table)
async function loadFir() {
  const { data } = await supabase.from('impostazioni')
    .select('valore').eq('chiave', 'fir_personale').maybeSingle()
  const val = data?.valore != null ? parseFloat(data.valore) : 80
  const el = document.getElementById('fir-input')
  if (el) el.value = val
  return val
}

async function saveFir() {
  const el = document.getElementById('fir-input')
  const val = parseFloat(el?.value)
  if (isNaN(val) || val < 50 || val > 200) { showToast('FIR deve essere tra 50 e 200', 'error'); return }
  const { error } = await supabase.from('impostazioni')
    .upsert({ chiave: 'fir_personale', valore: String(val), aggiornato_a: new Date().toISOString() })
  if (error) { showToast('Errore salvataggio FIR', 'error'); return }
  window.dispatchEvent(new CustomEvent('impostazioni:changed', { detail: { fir_personale: val } }))
  showToast(`FIR globale salvato: ${val}%`, 'success')
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initConfigurazioni() {
  // Delegated click handler for CCNL section
  document.getElementById('parametri-ccnl')?.addEventListener('click', async e => {
    if (e.target.classList.contains('ccnl-save-btn')) {
      const tr = e.target.closest('tr[data-id]')
      if (tr) await saveCcnlRow(tr)
    }
  })

  // Delegated click handler for INAIL section
  document.getElementById('tariffe-inail')?.addEventListener('click', async e => {
    if (e.target.classList.contains('inail-save-btn')) {
      const tr = e.target.closest('tr[data-id]')
      if (tr) await saveInailRow(tr)
    }
    if (e.target.classList.contains('inail-del-btn')) {
      const tr = e.target.closest('tr[data-id]')
      if (tr) await deleteInailRow(tr.dataset.id)
    }
  })

  document.getElementById('inail-add-btn')?.addEventListener('click', addNewInailRow)

  // Delegated click handler for coefficienti section
  document.getElementById('coefficienti-rischio')?.addEventListener('click', async e => {
    if (e.target.classList.contains('coeff-save-btn')) {
      const tr = e.target.closest('tr[data-id]')
      if (tr) await saveCoefficientiRow(tr)
    }
    if (e.target.classList.contains('coeff-del-btn')) {
      const tr = e.target.closest('tr[data-id]')
      if (tr) await deleteCoefficientiRow(tr.dataset.id)
    }
  })
  document.getElementById('coeff-add-btn')?.addEventListener('click', addNewCoefficientiRow)
  document.getElementById('impost-usa-coeff')?.addEventListener('change', e => saveImpostUseCoeff(e.target.checked))

  document.getElementById('fir-save-btn')?.addEventListener('click', saveFir)
  document.getElementById('fir-ricalcola-btn')?.addEventListener('click', ricalcolaFirDaBustePaga)
  document.getElementById('algoritmo-save-btn')?.addEventListener('click', saveAlgoritmoParametri)

  document.getElementById('algoritmo-attivo-toggle')?.addEventListener('change', async e => {
    const attivo = e.target.checked
    _setAlgoritmoParamsVisible(attivo)
    const { error } = await supabase.from('impostazioni').upsert({
      chiave: 'algoritmo_costi_attivo', valore: attivo ? 'true' : 'false', aggiornato_a: new Date().toISOString()
    })
    if (error) showToast('Errore salvataggio', 'error')
    else showToast(attivo ? 'Algoritmo avanzato attivato' : 'Algoritmo disattivato — verrà usato solo il RPC base', 'success')
  })

  document.getElementById('fir-tbody')?.addEventListener('click', async e => {
    if (e.target.classList.contains('fir-op-save-btn')) {
      const tr = e.target.closest('tr[data-id]')
      if (tr) await saveFirOperatore(tr)
    }
  })

  // Load data when navigating to each config sub-section
  document.getElementById('main-content')?.addEventListener('click', e => {
    const link = e.target.closest('a[data-target]')
    if (!link) return
    if (link.dataset.target === 'parametri-ccnl')       refreshCcnl()
    if (link.dataset.target === 'tariffe-inail')        refreshInail()
    if (link.dataset.target === 'coefficienti-rischio') refreshCoefficienti()
    if (link.dataset.target === 'incidenza-reale')      { loadFir(); loadFirPersonale() }
    if (link.dataset.target === 'algoritmo-costi')      loadAlgoritmoParametri()
  })
}
