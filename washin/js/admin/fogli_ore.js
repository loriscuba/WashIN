// Fogli ore settimanali a crocette: stampa, import della scansione, riepilogo sui contratti.
import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { creaPdfFogli } from './fogli_ore_pdf.js'
import { fileToCanvases, leggiPagina } from './fogli_ore_lettura.js'
import { RIGHE, GIORNI, codiceFoglio } from './fogli_ore_layout.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const PERIODO = { settimana: 'settimana', mese: 'mese', anno: 'anno', giorno: 'giorno', a_richiesta: 'a richiesta' }

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function lunediDi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d) }
const fmtMin = m => {
  if (m == null) return '—'
  const h = Math.floor(m / 60), mm = m % 60
  return (h ? `${h}h` : '') + (mm ? ` ${String(mm).padStart(2, '0')}'` : (h ? '' : "0'"))
}
const nomeOp = p => `${p?.nome || ''} ${p?.cognome || ''}`.trim() || '—'

let _letture = [] // pagine lette in attesa di conferma
let _contrattiAttivi = null

// ── HTML della sezione ──────────────────────────────────────────────────────
function render() {
  const sec = document.getElementById('fogli-ore')
  if (!sec) return
  sec.innerHTML = `
    <style>
      #fogli-ore input[type=checkbox] { width:auto; padding:0; }
      #fogli-ore input[type=file] { width:auto; }
      #fogli-ore table select, #fogli-ore table input[type=number] { width:auto; }
    </style>
    <div class="page-header">
      <h1>Fogli ore</h1>
      <p style="color:var(--gray-500);margin-top:8px;">Fogli settimanali a crocette per le operatrici: stampa, importa la scansione, ritrova le ore sui contratti.</p>
    </div>
    <div style="display:flex;border:1.5px solid var(--gray-300);border-radius:8px;overflow:hidden;width:max-content;max-width:100%;margin-bottom:16px;">
      <button class="fo-tab" data-tab="stampa">1. Stampa</button>
      <button class="fo-tab" data-tab="importa">2. Importa scansione</button>
      <button class="fo-tab" data-tab="riepilogo">3. Ore sui contratti</button>
    </div>

    <div class="fo-pane" data-pane="stampa">
      <div class="card">
        <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;">
          <label style="font-size:13px;font-weight:600;">Settimana (lunedì)
            <input type="date" id="fo-settimana" class="form-input" style="display:block;margin-top:4px;">
          </label>
          <span id="fo-settimana-label" style="font-size:13px;color:var(--gray-500);padding-bottom:8px;"></span>
        </div>
        <p style="font-size:12px;color:var(--gray-500);margin:12px 0 8px;">
          Ogni operatrice riceve le righe dei contratti attivi in cui è flaggata come operatore (una riga per servizio).
          Oltre 15 righe si passa a un secondo foglio.
        </p>
        <div id="fo-operatori" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px;"></div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" id="fo-tutti">Seleziona tutte</button>
          <button class="btn btn-primary" id="fo-genera">Genera e scarica PDF</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <h3 style="margin:0 0 8px;font-size:15px;">Fogli già generati per questa settimana</h3>
        <div class="table-container"><table class="washin-table">
          <thead><tr><th>Foglio</th><th>Operatrice</th><th>Righe</th><th>Stato</th><th></th></tr></thead>
          <tbody id="fo-generati"></tbody>
        </table></div>
      </div>
    </div>

    <div class="fo-pane" data-pane="importa" style="display:none;">
      <div class="card">
        <p style="font-size:13px;margin:0 0 10px;">Carica la scansione dei fogli compilati: un PDF con più pagine oppure le foto (una per foglio).
          Il QR dice di che foglio si tratta; tu controlli la griglia e confermi.</p>
        <input type="file" id="fo-file" accept="application/pdf,image/*" multiple>
        <div id="fo-stato-lettura" style="font-size:13px;color:var(--gray-500);margin-top:8px;"></div>
      </div>
      <div id="fo-letture"></div>
    </div>

    <div class="fo-pane" data-pane="riepilogo" style="display:none;">
      <div class="card">
        <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;">
          <label style="font-size:13px;font-weight:600;">Mese
            <input type="month" id="fo-mese" class="form-input" style="display:block;margin-top:4px;">
          </label>
          <input type="search" id="fo-cerca" class="form-input" placeholder="Cerca condominio o contratto…" style="min-width:220px;">
        </div>
        <p style="font-size:12px;color:var(--gray-500);margin:10px 0;">Ore previste = somma delle ore/mese dei servizi del contratto. Extra = tempo in più (o in meno) segnato nelle variazioni rispetto al previsto. Scostamento = rendicontate − previste del mese.</p>
        <div class="table-container"><table class="washin-table">
          <thead><tr><th>Condominio</th><th>Contratto</th><th>Interventi</th><th>Variazioni</th><th>Ore rendicontate</th><th>di cui extra</th><th>Ore previste/mese</th><th>Scostamento</th></tr></thead>
          <tbody id="fo-riepilogo"></tbody>
        </table></div>
      </div>
    </div>
  `
  sec.querySelectorAll('.fo-tab').forEach(b => {
    b.style.cssText = 'padding:7px 14px;font-size:13px;font-weight:600;border:none;cursor:pointer;background:#fff;color:#6b7280;border-right:1px solid var(--gray-300);'
    b.addEventListener('click', () => setTab(b.dataset.tab))
  })
  const lun = lunediDi(new Date())
  lun.setDate(lun.getDate() + 7) // di solito si stampa la settimana dopo
  const inp = document.getElementById('fo-settimana')
  inp.value = isoDate(lun)
  inp.addEventListener('change', () => {
    if (!inp.value) return
    inp.value = isoDate(lunediDi(new Date(inp.value + 'T12:00:00')))
    caricaStampa()
  })
  document.getElementById('fo-tutti').addEventListener('click', () => {
    const boxes = [...document.querySelectorAll('#fo-operatori input[type=checkbox]')]
    const all = boxes.every(b => b.checked)
    boxes.forEach(b => { b.checked = !all })
  })
  document.getElementById('fo-genera').addEventListener('click', generaFogli)
  document.getElementById('fo-generati').addEventListener('click', onGeneratiClick)
  document.getElementById('fo-file').addEventListener('change', onFile)
  document.getElementById('fo-letture').addEventListener('click', onLettureClick)
  document.getElementById('fo-letture').addEventListener('change', onLettureChange)
  const mese = document.getElementById('fo-mese')
  const oggi = new Date()
  mese.value = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  mese.addEventListener('change', caricaRiepilogo)
  document.getElementById('fo-cerca').addEventListener('input', caricaRiepilogo)
  setTab('stampa')
}

function setTab(tab) {
  document.querySelectorAll('#fogli-ore .fo-tab').forEach(b => {
    const on = b.dataset.tab === tab
    b.style.background = on ? '#0d9488' : '#fff'
    b.style.color = on ? '#fff' : '#6b7280'
  })
  document.querySelectorAll('#fogli-ore .fo-pane').forEach(p => { p.style.display = p.dataset.pane === tab ? '' : 'none' })
  if (tab === 'stampa') caricaStampa()
  if (tab === 'riepilogo') caricaRiepilogo()
}

// ── 1. Stampa ───────────────────────────────────────────────────────────────
function settimanaLabel(lun) {
  const a = new Date(lun + 'T12:00:00'), b = new Date(addDaysIso(lun, 6) + 'T12:00:00')
  const f = d => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return `dal ${f(a)} al ${f(b)} ${b.getFullYear()}`
}

// Righe del foglio per ogni operatrice, dai contratti attivi flaggati
async function righePerOperatori(ids) {
  const { data, error } = await supabase
    .from('contratti_operatori')
    .select('operatore_id, contratti(id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo))')
    .in('operatore_id', ids)
  if (error) throw error
  const per = new Map(ids.map(id => [id, []]))
  for (const row of data || []) {
    const k = row.contratti
    if (!k || (k.stato && k.stato !== 'attivo')) continue
    const nome = k.clienti?.nome_breve || k.clienti?.ragione_sociale || 'Contratto'
    const servizi = (k.contratti_servizi || []).filter(s => s.interventi_periodo !== 'a_richiesta')
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
    const base = { contratto_id: k.id, codice: k.numero_contratto || '', etichetta: nome }
    if (!servizi.length) {
      per.get(row.operatore_id).push({ ...base, servizio_id: null, dettaglio: 'tempo da definire sul contratto', minuti_previsti: null })
      continue
    }
    for (const s of servizi) {
      const freq = s.interventi_numero != null && s.interventi_periodo
        ? `${String(s.interventi_numero).replace('.', ',')} v/${PERIODO[s.interventi_periodo] || s.interventi_periodo}` : ''
      const dettaglio = [s.descrizione ? s.descrizione[0].toUpperCase() + s.descrizione.slice(1) : 'Servizio',
        s.minuti_intervento != null ? fmtMin(s.minuti_intervento).trim() : 'tempo da definire', freq].filter(Boolean).join(' · ')
      per.get(row.operatore_id).push({ ...base, servizio_id: s.id, dettaglio, minuti_previsti: s.minuti_intervento })
    }
  }
  for (const list of per.values()) {
    list.sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it', { numeric: true })) // stabile: i servizi restano nell'ordine del contratto
  }
  return per
}

let _operatori = []
async function caricaStampa() {
  const lun = document.getElementById('fo-settimana').value
  document.getElementById('fo-settimana-label').textContent = lun ? settimanaLabel(lun) : ''
  const box = document.getElementById('fo-operatori')
  box.innerHTML = '<span style="color:var(--gray-500);font-size:13px;">Caricamento…</span>'
  try {
    const [{ data: profili, error: e1 }, { data: assegn, error: e2 }] = await Promise.all([
      supabase.from('profili').select('id, nome, cognome, attivo').order('nome'),
      supabase.from('contratti_operatori').select('operatore_id, contratti(stato)'),
    ])
    if (e1) throw e1
    if (e2) throw e2
    const conta = new Map()
    for (const a of assegn || []) {
      if (a.contratti && a.contratti.stato && a.contratti.stato !== 'attivo') continue
      conta.set(a.operatore_id, (conta.get(a.operatore_id) || 0) + 1)
    }
    _operatori = (profili || []).filter(p => conta.has(p.id) && p.attivo !== false)
    box.innerHTML = _operatori.length
      ? _operatori.map(p => `
        <label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:6px 8px;border:1px solid var(--gray-200);border-radius:8px;cursor:pointer;">
          <input type="checkbox" value="${p.id}"> <span style="flex:1;">${esc(nomeOp(p))}</span>
          <span style="color:var(--gray-500);font-size:11px;">${conta.get(p.id)} contr.</span>
        </label>`).join('')
      : '<span style="color:var(--gray-500);font-size:13px;">Nessuna operatrice è flaggata sui contratti attivi. Assegnale dalla scheda del contratto.</span>'
  } catch (err) {
    console.error(err)
    box.innerHTML = `<span style="color:#b91c1c;font-size:13px;">Errore: ${esc(err.message)}. Hai applicato la migrazione v47?</span>`
  }
  await caricaGenerati()
}

async function caricaGenerati() {
  const lun = document.getElementById('fo-settimana').value
  const tb = document.getElementById('fo-generati')
  const { data, error } = await supabase.from('fogli_ore')
    .select('id, numero, pagina, pagine, stato, operatore_id, profili(nome, cognome), fogli_ore_righe(riga)')
    .eq('settimana_inizio', lun).order('numero')
  if (error) { tb.innerHTML = `<tr><td colspan="5" style="color:#b91c1c;">${esc(error.message)}</td></tr>`; return }
  tb.innerHTML = (data || []).length ? data.map(f => `
    <tr style="${f.stato === 'annullato' ? 'opacity:.5;' : ''}">
      <td style="font-family:monospace;">${codiceFoglio(f.numero)}${f.pagine > 1 ? ` <small>(${f.pagina}/${f.pagine})</small>` : ''}</td>
      <td>${esc(nomeOp(f.profili))}</td>
      <td>${(f.fogli_ore_righe || []).length}</td>
      <td><span class="badge ${f.stato === 'importato' ? 'badge-success' : f.stato === 'annullato' ? 'badge-danger' : 'badge-warning'}">${f.stato}</span></td>
      <td style="white-space:nowrap;">
        ${f.stato !== 'annullato' ? `<button class="btn btn-sm btn-secondary" data-action="ristampa" data-id="${f.id}">Ristampa</button>` : ''}
        ${f.stato === 'stampato' ? `<button class="btn btn-sm btn-secondary" data-action="annulla" data-id="${f.id}">Annulla</button>` : ''}
      </td>
    </tr>`).join('') : '<tr><td colspan="5" style="color:var(--gray-500);">Nessun foglio per questa settimana.</td></tr>'
}

async function paginePerFogli(ids) {
  const { data, error } = await supabase.from('fogli_ore')
    .select('id, numero, settimana_inizio, pagina, pagine, profili(nome, cognome), fogli_ore_righe(*)')
    .in('id', ids).order('numero')
  if (error) throw error
  return (data || []).map(f => ({
    foglio: f, operatore: nomeOp(f.profili),
    righe: (f.fogli_ore_righe || []).sort((a, b) => a.riga - b.riga),
  }))
}

function scaricaPdf(doc, nome) {
  doc.save(nome)
}

async function generaFogli() {
  const lun = document.getElementById('fo-settimana').value
  const ids = [...document.querySelectorAll('#fo-operatori input:checked')].map(i => i.value)
  if (!lun) { showToast('Scegli la settimana', 'error'); return }
  if (!ids.length) { showToast('Seleziona almeno un\'operatrice', 'error'); return }
  const btn = document.getElementById('fo-genera')
  btn.disabled = true; btn.textContent = 'Genero…'
  try {
    // fogli già stampati per la stessa settimana: si annullano (non quelli importati)
    const { data: esistenti } = await supabase.from('fogli_ore').select('id, operatore_id')
      .eq('settimana_inizio', lun).eq('stato', 'stampato').in('operatore_id', ids)
    if (esistenti?.length) {
      if (!confirm(`Ci sono già ${esistenti.length} fogli stampati per questa settimana per le operatrici scelte. Li annullo e ne genero di nuovi?`)) return
      const { error } = await supabase.from('fogli_ore').update({ stato: 'annullato' }).in('id', esistenti.map(e => e.id))
      if (error) throw error
    }
    const per = await righePerOperatori(ids)
    const creati = []
    for (const opId of ids) {
      const righe = per.get(opId) || []
      const chunks = []
      for (let i = 0; i < Math.max(1, righe.length); i += RIGHE) chunks.push(righe.slice(i, i + RIGHE))
      for (let p = 0; p < chunks.length; p++) {
        const { data: f, error } = await supabase.from('fogli_ore')
          .insert({ operatore_id: opId, settimana_inizio: lun, pagina: p + 1, pagine: chunks.length })
          .select('id').single()
        if (error) throw error
        if (chunks[p].length) {
          const { error: e2 } = await supabase.from('fogli_ore_righe').insert(chunks[p].map((r, i) => ({
            foglio_id: f.id, riga: i + 1, contratto_id: r.contratto_id, servizio_id: r.servizio_id,
            codice: r.codice, etichetta: r.etichetta, dettaglio: r.dettaglio, minuti_previsti: r.minuti_previsti,
          })))
          if (e2) throw e2
        }
        creati.push(f.id)
      }
    }
    const doc = await creaPdfFogli(await paginePerFogli(creati))
    scaricaPdf(doc, `fogli-ore-${lun}.pdf`)
    showToast(`${creati.length} fogli generati`)
    await caricaGenerati()
  } catch (err) {
    console.error(err)
    showToast('Errore: ' + err.message, 'error')
  } finally {
    btn.disabled = false; btn.textContent = 'Genera e scarica PDF'
  }
}

async function onGeneratiClick(e) {
  const b = e.target.closest('button[data-action]')
  if (!b) return
  try {
    if (b.dataset.action === 'ristampa') {
      const doc = await creaPdfFogli(await paginePerFogli([b.dataset.id]))
      scaricaPdf(doc, 'foglio-ore.pdf')
    } else if (b.dataset.action === 'annulla') {
      if (!confirm('Annullo questo foglio? Non sarà più importabile.')) return
      const { error } = await supabase.from('fogli_ore').update({ stato: 'annullato' }).eq('id', b.dataset.id)
      if (error) throw error
      await caricaGenerati()
    }
  } catch (err) {
    showToast('Errore: ' + err.message, 'error')
  }
}

// ── 2. Import della scansione ───────────────────────────────────────────────
async function contrattiAttivi() {
  if (_contrattiAttivi) return _contrattiAttivi
  const { data } = await supabase.from('contratti')
    .select('id, numero_contratto, stato, clienti(nome_breve, ragione_sociale)').eq('stato', 'attivo')
  _contrattiAttivi = (data || []).map(k => ({ id: k.id, nome: `${k.clienti?.nome_breve || k.clienti?.ragione_sociale || ''}${k.numero_contratto ? ' (' + k.numero_contratto + ')' : ''}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }))
  return _contrattiAttivi
}

async function caricaFoglio(id) {
  const { data, error } = await supabase.from('fogli_ore')
    .select('id, numero, settimana_inizio, stato, operatore_id, pagina, pagine, profili(nome, cognome), fogli_ore_righe(*)')
    .eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function onFile(e) {
  const files = [...(e.target.files || [])]
  if (!files.length) return
  const st = document.getElementById('fo-stato-lettura')
  _letture = []
  document.getElementById('fo-letture').innerHTML = ''
  try {
    await contrattiAttivi()
    let n = 0
    for (const file of files) {
      st.textContent = `Apro ${file.name}…`
      const canvases = await fileToCanvases(file)
      for (const canvas of canvases) {
        n++
        st.textContent = `Leggo pagina ${n}…`
        const lettura = await leggiPagina(canvas)
        const item = { idx: _letture.length, canvas, lettura, foglio: null, stato: {} }
        if (lettura.foglioId) {
          try { item.foglio = await caricaFoglio(lettura.foglioId) } catch (err) { console.error(err) }
          if (!item.foglio) lettura.avvisi.push('Il QR non corrisponde a nessun foglio generato')
        }
        prepara(item)
        _letture.push(item)
        renderLettura(item)
      }
    }
    st.textContent = `${n} pagine lette. Controlla le griglie e conferma ogni foglio.`
  } catch (err) {
    console.error(err)
    st.textContent = 'Errore nella lettura: ' + err.message
  } finally {
    e.target.value = ''
  }
}

// Stato modificabile: caselle spuntate, variazioni, contratto delle righe libere
function prepara(item) {
  const L = item.lettura
  item.stato = {
    x: {}, incerti: {},
    variazioni: L.variazioni.map(v => ({ ...v })),
    libere: {}, // riga → { contratto_id, minuti }
  }
  for (let r = 1; r <= RIGHE; r++) {
    for (let d = 0; d < 7; d++) {
      const c = L.caselle[r][d]
      if (c.x) item.stato.x[`${r}-${d}`] = true
      if (c.incerto) item.stato.incerti[`${r}-${d}`] = true
    }
  }
}

function righeMap(item) {
  return new Map((item.foglio?.fogli_ore_righe || []).map(r => [r.riga, r]))
}

function renderLettura(item) {
  const cont = document.getElementById('fo-letture')
  let el = document.getElementById(`fo-lettura-${item.idx}`)
  if (!el) {
    el = document.createElement('div')
    el.id = `fo-lettura-${item.idx}`
    el.className = 'card'
    el.style.marginTop = '16px'
    cont.appendChild(el)
  }
  const f = item.foglio
  const L = item.lettura
  const S = item.stato
  const rm = righeMap(item)
  const avvisi = [...L.avvisi]
  if (f?.stato === 'importato') avvisi.push('Questo foglio è già stato importato: confermando sostituisci le ore precedenti')
  if (f?.stato === 'annullato') avvisi.push('Questo foglio è stato annullato')
  const lun = f?.settimana_inizio

  const head = f
    ? `<div><strong style="font-family:monospace;">${codiceFoglio(f.numero)}</strong> · ${esc(nomeOp(f.profili))} · settimana ${esc(settimanaLabel(lun))}</div>`
    : `<div><strong>Pagina ${item.idx + 1}</strong>: foglio non riconosciuto.
        Codice foglio (es. FO-000123): <input type="text" class="form-input" data-role="codice" style="width:130px;display:inline-block;">
        <button class="btn btn-sm btn-secondary" data-action="cerca-foglio" data-idx="${item.idx}">Usa</button></div>`

  let grid = ''
  if (f) {
    const righeVisibili = []
    for (let r = 1; r <= RIGHE; r++) {
      const hasX = Object.keys(S.x).some(k => k.startsWith(r + '-')) || S.variazioni.some(v => v.riga === r)
      if (rm.has(r) || hasX) righeVisibili.push(r)
    }
    grid = `
      <div class="table-container" style="margin-top:10px;"><table class="washin-table" style="font-size:12px;">
        <thead><tr><th>N.</th><th>Condominio / servizio</th><th>Previsto</th>
          ${GIORNI.map((g, d) => `<th style="text-align:center;">${g}<br><small>${new Date(addDaysIso(lun, d) + 'T12:00:00').getDate()}</small></th>`).join('')}
          <th>Totale</th></tr></thead>
        <tbody>
        ${righeVisibili.map(r => {
          const riga = rm.get(r)
          const libera = !riga?.contratto_id
          const lib = S.libere[r] || {}
          const desc = libera
            ? `<select data-role="libera-contratto" data-riga="${r}" class="form-input" style="font-size:12px;padding:2px 4px;max-width:220px;">
                 <option value="">— riga libera: scegli il contratto —</option>
                 ${(_contrattiAttivi || []).map(k => `<option value="${k.id}" ${lib.contratto_id === k.id ? 'selected' : ''}>${esc(k.nome)}</option>`).join('')}
               </select>`
            : `<strong>${esc(riga.etichetta)}</strong> <small style="color:var(--gray-500);">${esc(riga.codice || '')}</small><br><small>${esc(riga.dettaglio || '')}</small>`
          const prev = libera || riga.minuti_previsti == null
            ? `<input type="number" min="0" step="5" data-role="minuti-riga" data-riga="${r}" value="${lib.minuti ?? riga?.minuti_previsti ?? ''}" placeholder="min" class="form-input" style="width:64px;font-size:12px;padding:2px 4px;">`
            : fmtMin(riga.minuti_previsti)
          let tot = 0
          const celle = GIORNI.map((_, d) => {
            const k = `${r}-${d}`
            const on = !!S.x[k]
            const v = S.variazioni.find(v => v.riga === r && v.giorno === d && v.minuti != null)
            const min = minutiCella(item, r, d)
            if ((on || v) && min != null) tot += min
            const bg = S.incerti[k] ? 'background:#fef3c7;' : ''
            return `<td style="text-align:center;${bg}">
              <input type="checkbox" data-role="x" data-cella="${k}" ${on || v ? 'checked' : ''} ${v ? 'disabled' : ''}>
              ${v ? `<div style="font-size:10px;color:#b45309;font-weight:600;">${fmtMin(v.minuti)}</div>` : ''}
            </td>`
          }).join('')
          return `<tr><td>${r}</td><td>${desc}</td><td>${prev}</td>${celle}<td><strong>${fmtMin(tot)}</strong></td></tr>`
        }).join('') || `<tr><td colspan="11" style="color:var(--gray-500);">Nessuna X trovata.</td></tr>`}
        </tbody>
      </table></div>
      <div style="margin-top:10px;">
        <strong style="font-size:13px;">Variazioni</strong>
        <span style="font-size:12px;color:var(--gray-500);"> (tempo totale effettivo, sostituisce quello previsto)</span>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
          ${S.variazioni.map((v, i) => `
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;${v.incerto ? 'background:#fef3c7;padding:4px;border-radius:6px;' : ''}">
              Riga <select data-role="var-riga" data-i="${i}" class="form-input" style="width:64px;font-size:12px;padding:2px;">
                <option value=""></option>${Array.from({ length: RIGHE }, (_, k) => `<option ${v.riga === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select>
              Giorno <select data-role="var-giorno" data-i="${i}" class="form-input" style="width:70px;font-size:12px;padding:2px;">
                <option value=""></option>${GIORNI.map((g, d) => `<option value="${d}" ${v.giorno === d ? 'selected' : ''}>${g}</option>`).join('')}</select>
              Minuti <input type="number" min="0" step="5" data-role="var-minuti" data-i="${i}" value="${v.minuti ?? ''}" class="form-input" style="width:70px;font-size:12px;padding:2px 4px;">
              <button class="btn btn-sm btn-secondary" data-action="var-del" data-idx="${item.idx}" data-i="${i}">Togli</button>
              ${v.incerto ? '<span style="color:#b45309;">da controllare</span>' : ''}
            </div>`).join('')}
          <div><button class="btn btn-sm btn-secondary" data-action="var-add" data-idx="${item.idx}">+ Variazione</button></div>
        </div>
      </div>`
  }

  const thumb = item.thumb || (item.thumb = item.canvas.toDataURL('image/jpeg', 0.6))
  el.dataset.idx = item.idx
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:start;">
      ${head}
      <div style="display:flex;gap:6px;">
        <a href="${thumb}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">Vedi scansione</a>
        ${f && f.stato !== 'annullato' ? `<button class="btn btn-sm btn-primary" data-action="conferma" data-idx="${item.idx}" ${item.salvato ? 'disabled' : ''}>${item.salvato ? 'Salvato ✓' : 'Conferma e salva'}</button>` : ''}
      </div>
    </div>
    ${avvisi.length ? `<div style="margin-top:8px;font-size:12px;color:#92400e;background:#fef3c7;border-radius:6px;padding:6px 8px;">${avvisi.map(esc).join('<br>')}</div>` : ''}
    ${f ? '<div style="font-size:11px;color:var(--gray-500);margin-top:6px;">In giallo le caselle e le variazioni lette con poca sicurezza.</div>' : ''}
    ${grid}
  `
}

function minutiCella(item, r, d) {
  const v = item.stato.variazioni.find(v => v.riga === r && v.giorno === d && v.minuti != null)
  if (v) return v.minuti
  const lib = item.stato.libere[r]
  if (lib?.minuti != null && lib.minuti !== '') return Number(lib.minuti)
  return righeMap(item).get(r)?.minuti_previsti ?? null
}

function itemDa(el) {
  const card = el.closest('[id^="fo-lettura-"]')
  return card ? _letture[Number(card.dataset.idx)] : null
}

function onLettureChange(e) {
  const t = e.target
  const item = itemDa(t)
  if (!item) return
  const S = item.stato
  const role = t.dataset.role
  if (role === 'x') { if (t.checked) S.x[t.dataset.cella] = true; else delete S.x[t.dataset.cella]; delete S.incerti[t.dataset.cella] }
  else if (role === 'libera-contratto') (S.libere[t.dataset.riga] ||= {}).contratto_id = t.value || null
  else if (role === 'minuti-riga') (S.libere[t.dataset.riga] ||= {}).minuti = t.value === '' ? null : Number(t.value)
  else if (role?.startsWith('var-')) {
    const v = S.variazioni[Number(t.dataset.i)]
    if (role === 'var-riga') v.riga = t.value ? Number(t.value) : null
    if (role === 'var-giorno') v.giorno = t.value === '' ? null : Number(t.value)
    if (role === 'var-minuti') v.minuti = t.value === '' ? null : Number(t.value)
    v.incerto = false
  } else return
  item.salvato = false
  renderLettura(item)
}

async function onLettureClick(e) {
  const b = e.target.closest('button[data-action]')
  if (!b) return
  const item = _letture[Number(b.dataset.idx)]
  if (!item) return
  const a = b.dataset.action
  if (a === 'var-add') { item.stato.variazioni.push({ riga: null, giorno: null, minuti: null, incerto: false }); item.salvato = false; renderLettura(item) }
  if (a === 'var-del') { item.stato.variazioni.splice(Number(b.dataset.i), 1); item.salvato = false; renderLettura(item) }
  if (a === 'cerca-foglio') {
    const codice = b.parentElement.querySelector('[data-role="codice"]').value.trim()
    const num = Number(codice.replace(/\D/g, ''))
    if (!num) return
    const { data } = await supabase.from('fogli_ore').select('id').eq('numero', num).maybeSingle()
    if (!data) { showToast('Foglio non trovato', 'error'); return }
    item.lettura = await leggiPagina(item.canvas, data.id)
    item.foglio = await caricaFoglio(data.id)
    prepara(item)
    renderLettura(item)
  }
  if (a === 'conferma') await conferma(item, b)
}

// Costruisce le righe di ore_rendicontate dal foglio rivisto
function calcolaOre(item) {
  const f = item.foglio
  const S = item.stato
  const rm = righeMap(item)
  const errori = []
  const out = new Map() // "r-d" → record
  const celle = new Set(Object.keys(S.x))
  for (const v of S.variazioni) {
    if (v.riga == null || v.giorno == null || v.minuti == null) { errori.push('Completa o togli le variazioni incomplete'); continue }
    celle.add(`${v.riga}-${v.giorno}`)
  }
  for (const k of celle) {
    const [r, d] = k.split('-').map(Number)
    const riga = rm.get(r)
    const contratto_id = riga?.contratto_id || S.libere[r]?.contratto_id
    if (!contratto_id) { errori.push(`Riga ${r}: scegli il contratto`); continue }
    const min = minutiCella(item, r, d)
    if (min == null) { errori.push(`Riga ${r}: indica i minuti`); continue }
    const previsti = riga?.contratto_id ? riga.minuti_previsti : null
    const variazione = S.variazioni.some(v => v.riga === r && v.giorno === d)
    out.set(k, {
      contratto_id, servizio_id: riga?.contratto_id ? riga.servizio_id : null,
      operatore_id: f.operatore_id, data: addDaysIso(f.settimana_inizio, d),
      minuti: min, minuti_previsti: previsti, variazione: variazione && previsti != null ? min !== previsti : variazione,
      fonte: 'foglio', foglio_id: f.id, riga: r,
    })
  }
  return { righe: [...out.values()], errori: [...new Set(errori)] }
}

async function conferma(item, btn) {
  const { righe, errori } = calcolaOre(item)
  if (errori.length) { showToast(errori[0], 'error'); return }
  btn.disabled = true; btn.textContent = 'Salvo…'
  try {
    const { error: e1 } = await supabase.from('ore_rendicontate').delete().eq('foglio_id', item.foglio.id)
    if (e1) throw e1
    if (righe.length) {
      const { error: e2 } = await supabase.from('ore_rendicontate').insert(righe)
      if (e2) throw e2
    }
    const { error: e3 } = await supabase.from('fogli_ore').update({ stato: 'importato', importato_at: new Date().toISOString() }).eq('id', item.foglio.id)
    if (e3) throw e3
    item.salvato = true
    item.foglio.stato = 'importato'
    const tot = righe.reduce((s, r) => s + r.minuti, 0)
    showToast(`${codiceFoglio(item.foglio.numero)}: ${righe.length} interventi, ${fmtMin(tot).trim()} salvati`)
  } catch (err) {
    console.error(err)
    showToast('Errore nel salvataggio: ' + err.message, 'error')
  }
  renderLettura(item)
}

// ── 3. Riepilogo ────────────────────────────────────────────────────────────
async function caricaRiepilogo() {
  const tb = document.getElementById('fo-riepilogo')
  const mese = document.getElementById('fo-mese').value
  if (!mese) return
  tb.innerHTML = '<tr><td colspan="8" style="color:var(--gray-500);">Caricamento…</td></tr>'
  const { data, error } = await supabase.from('v_rendiconto_contratti_mese').select('*').eq('mese', `${mese}-01`)
  if (error) { tb.innerHTML = `<tr><td colspan="8" style="color:#b91c1c;">${esc(error.message)}</td></tr>`; return }
  const q = document.getElementById('fo-cerca').value.trim().toLowerCase()
  const rows = (data || []).filter(r => !q || `${r.condominio} ${r.numero_contratto}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.condominio).localeCompare(String(b.condominio), 'it', { numeric: true }))
  const n = v => v == null ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 })
  tb.innerHTML = rows.length ? rows.map(r => {
    const s = Number(r.scostamento_ore)
    const col = r.ore_previste_mese == null ? '' : s > 0.25 ? 'color:#b91c1c;font-weight:600;' : s < -0.25 ? 'color:#b45309;font-weight:600;' : 'color:#059669;'
    return `<tr>
      <td>${esc(r.condominio)}</td><td>${esc(r.numero_contratto || '')}</td>
      <td>${r.interventi}</td><td>${r.variazioni || ''}</td>
      <td>${n(r.ore_rendicontate)}</td>
      <td>${r.ore_extra == null ? '—' : Math.abs(Number(r.ore_extra)) < 0.01 ? '0' : (Number(r.ore_extra) > 0 ? '+' : '') + n(r.ore_extra)}</td>
      <td>${n(r.ore_previste_mese)}</td>
      <td style="${col}">${r.ore_previste_mese == null ? '—' : (s > 0 ? '+' : '') + n(s)}</td>
    </tr>`
  }).join('') : '<tr><td colspan="8" style="color:var(--gray-500);">Nessuna ora rendicontata in questo mese.</td></tr>'
}

export function initFogliOre() {
  render()
}
