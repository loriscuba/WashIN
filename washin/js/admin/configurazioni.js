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

  // Load data when navigating to each config sub-section
  document.getElementById('main-content')?.addEventListener('click', e => {
    const link = e.target.closest('a[data-target]')
    if (!link) return
    if (link.dataset.target === 'parametri-ccnl')     refreshCcnl()
    if (link.dataset.target === 'tariffe-inail')      refreshInail()
    if (link.dataset.target === 'coefficienti-rischio') refreshCoefficienti()
  })
}
