// Giri: ogni giro appartiene a una squadra, si ripete ogni settimana (o ogni N settimane)
// oppure in certe settimane del mese, e contiene i contratti da fare in quei giorni. Tabelle v52.
import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { serviziUnici } from './fogli_ore_righe.js'
import { caricaGiri, descriviGiro, prossimiPassaggi, GIORNI_GIRO, SETTIMANE_MESE } from './giri_calendario.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const oggiIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtGiorno = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
const PER = { settimana: 'sett', mese: 'mese', anno: 'anno', giorno: 'giorno' }

let _giri = []
let _squadre = []
let _contratti = []    // con servizi
let _sel = null        // id giro aperto ('new' = nuovo)

const nomeK = k => `${k.clienti?.nome_breve || k.clienti?.ragione_sociale || '—'}${k.numero_contratto ? ' (' + k.numero_contratto + ')' : ''}`
function etichettaServizio(s) {
  const d = s.descrizione ? s.descrizione[0].toUpperCase() + s.descrizione.slice(1) : 'Servizio'
  const f = s.interventi_numero != null && s.interventi_periodo ? `${String(s.interventi_numero).replace('.', ',')} v/${PER[s.interventi_periodo] || s.interventi_periodo}` : ''
  return [d, s.minuti_intervento != null ? `${s.minuti_intervento}'` : '', f].filter(Boolean).join(' · ')
}

function render() {
  const sec = document.getElementById('giri')
  if (!sec) return
  sec.innerHTML = `
    <style>
      #giri input[type=checkbox], #giri input[type=radio] { width:auto; padding:0; }
      #giri table select { width:auto; max-width:260px; }
      .gi-card { cursor:pointer; border:1.5px solid var(--gray-200); border-radius:10px; padding:12px 14px; background:#fff; }
      .gi-card.on { border-color:#0d9488; box-shadow:0 0 0 2px rgba(13,148,136,.15); }
      .gi-dot { display:inline-block; width:12px; height:12px; border-radius:50%; vertical-align:middle; margin-right:6px; }
      .gi-grid { display:grid; grid-template-columns:minmax(240px,320px) 1fr; gap:16px; align-items:start; }
      .gi-chk { display:inline-flex; align-items:center; gap:4px; font-size:13px; font-weight:400; margin-right:12px; }
      @media (max-width: 800px) { .gi-grid { grid-template-columns:1fr; } }
    </style>
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Giri</h1>
        <p style="color:var(--gray-500);margin-top:8px;">Ogni giro è di una squadra, si ripete ogni settimana o in certe settimane del mese e raccoglie i contratti da fare. "Genera settimana" in Agenda squadre crea gli interventi dai giri.</p>
      </div>
      <button class="btn btn-primary" id="gi-nuovo">+ Nuovo giro</button>
    </div>
    <div class="gi-grid">
      <div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500);margin-bottom:8px;">
          <input type="checkbox" id="gi-mostra-inattivi"> Mostra giri non attivi
        </label>
        <div id="gi-lista" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
      <div id="gi-dettaglio"></div>
    </div>`
  document.getElementById('gi-nuovo').addEventListener('click', () => { _sel = 'new'; renderLista(); renderDettaglio() })
  document.getElementById('gi-mostra-inattivi').addEventListener('change', renderLista)
  document.getElementById('gi-lista').addEventListener('click', e => {
    const c = e.target.closest('[data-giro]')
    if (!c) return
    _sel = c.dataset.giro
    renderLista(); renderDettaglio()
  })
}

async function carica() {
  const [giri, sq, ct] = await Promise.all([
    caricaGiri('id'),
    supabase.from('squadre').select('id, nome, colore, attiva').order('nome'),
    supabase.from('contratti').select('id, numero_contratto, stato, clienti(nome_breve, ragione_sociale, indirizzo, citta), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo)'),
  ])
  if (giri === null) {
    document.getElementById('gi-lista').innerHTML = '<p style="color:#b91c1c;font-size:13px;">Tabelle giri mancanti: applica la migrazione v52.</p>'
    return
  }
  _giri = giri
  _squadre = sq.data || []
  _contratti = (ct.data || []).map(k => ({
    ...k, nome: nomeK(k),
    indirizzo: [k.clienti?.indirizzo, k.clienti?.citta].filter(Boolean).join(', '),
    servizi: serviziUnici(k.contratti_servizi),
    cerca: [k.clienti?.nome_breve, k.clienti?.ragione_sociale, k.numero_contratto, k.clienti?.indirizzo, k.clienti?.citta].filter(Boolean).join(' ').toLowerCase(),
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }))
  renderLista()
  renderDettaglio()
}

function renderLista() {
  const box = document.getElementById('gi-lista')
  if (!box) return
  const tutti = document.getElementById('gi-mostra-inattivi')?.checked
  const lista = _giri.filter(g => tutti || g.attivo || g.id === _sel)
  if (!lista.length) {
    box.innerHTML = '<p style="font-size:13px;color:var(--gray-500);">Nessun giro. Crea il primo con "+ Nuovo giro".</p>'
    return
  }
  // Raggruppati per squadra
  const gruppi = new Map()
  for (const g of lista) {
    const k = g.squadre?.nome || 'Senza squadra'
    gruppi.set(k, [...(gruppi.get(k) || []), g])
  }
  box.innerHTML = [...gruppi].map(([sq, giri]) => `
    <div style="font-size:12px;font-weight:600;color:var(--gray-500);margin-top:4px;">${esc(sq)}</div>
    ${giri.map(g => `
      <div class="gi-card${g.id === _sel ? ' on' : ''}" data-giro="${g.id}">
        <div style="font-weight:600;font-size:14px;"><span class="gi-dot" style="background:${esc(g.squadre?.colore || '#94a3b8')}"></span>${esc(g.nome)}
          ${g.attivo ? '' : '<span class="badge" style="margin-left:6px;">non attivo</span>'}</div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">${esc(descriviGiro(g))}</div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${(g.giri_contratti || []).length} contratt${(g.giri_contratti || []).length === 1 ? 'o' : 'i'}</div>
      </div>`).join('')}`).join('')
}

function rigaHtml(r) {
  const k = _contratti.find(x => x.id === r.contratto_id)
  const servizi = k?.servizi || []
  return `
    <tr data-contratto="${esc(r.contratto_id)}">
      <td style="white-space:nowrap;">
        <button type="button" class="btn btn-secondary btn-sm" data-azione="su" title="Sposta su">▲</button>
        <button type="button" class="btn btn-secondary btn-sm" data-azione="giu" title="Sposta giù">▼</button>
      </td>
      <td><strong style="font-size:13px;">${esc(k?.nome || 'Contratto')}</strong>
        ${k?.indirizzo ? `<br><small style="color:var(--gray-500);">${esc(k.indirizzo)}</small>` : ''}</td>
      <td><select class="form-input" data-f="servizio_id" style="font-size:12px;">
        <option value="">Contratto (intervento unico)</option>
        ${servizi.map(s => `<option value="${s.id}"${s.id === r.servizio_id ? ' selected' : ''}>${esc(etichettaServizio(s))}</option>`).join('')}
      </select></td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-azione="togli" title="Togli">✕</button></td>
    </tr>`
}

function renderDettaglio() {
  const box = document.getElementById('gi-dettaglio')
  if (!box) return
  if (!_sel) {
    box.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--gray-500);margin:0;">Seleziona un giro a sinistra o creane uno nuovo.</p></div>'
    return
  }
  const g = _sel === 'new'
    ? { nome: '', squadra_id: _squadre.find(s => s.attiva)?.id || null, cadenza: 'settimana', giorni: [], ogni_settimane: 1, settimane_mese: [], dal: oggiIso(), al: null, attivo: true, giri_contratti: [] }
    : _giri.find(x => x.id === _sel)
  if (!g) { _sel = null; renderDettaglio(); return }
  const righe = g.giri_contratti || []
  const nelGiro = new Set(righe.map(r => r.contratto_id))
  const altri = new Map() // contratto → altri giri
  for (const x of _giri) if (x.id !== g.id && x.attivo) for (const r of x.giri_contratti || [])
    altri.set(r.contratto_id, [...new Set([...(altri.get(r.contratto_id) || []), x.nome])])
  const lista = _contratti.filter(k => k.stato === 'attivo' || nelGiro.has(k.id))
  const sett = g.cadenza !== 'mese'

  box.innerHTML = `
    <div class="card">
      <div style="display:grid;grid-template-columns:2fr 2fr;gap:12px;align-items:end;">
        <label style="font-size:13px;font-weight:600;">Nome giro
          <input type="text" id="gi-nome" class="form-input" value="${esc(g.nome)}" placeholder="es. Giro martedì centro" style="display:block;margin-top:4px;">
        </label>
        <label style="font-size:13px;font-weight:600;">Squadra
          <select id="gi-squadra" class="form-input" style="display:block;margin-top:4px;">
            <option value="">— nessuna —</option>
            ${_squadre.filter(s => s.attiva || s.id === g.squadra_id).map(s => `<option value="${s.id}"${s.id === g.squadra_id ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}
          </select>
        </label>
      </div>

      <h3 style="font-size:14px;margin:18px 0 6px;">Quando</h3>
      <div style="margin-bottom:8px;">
        <label class="gi-chk"><input type="radio" name="gi-cadenza" value="settimana"${sett ? ' checked' : ''}> Settimanale</label>
        <label class="gi-chk"><input type="radio" name="gi-cadenza" value="mese"${sett ? '' : ' checked'}> Mensile</label>
      </div>
      <div style="margin-bottom:8px;"><span style="font-size:12px;color:var(--gray-500);margin-right:8px;">Giorni</span>
        ${GIORNI_GIRO.map((n, i) => `<label class="gi-chk"><input type="checkbox" data-giorno="${i + 1}"${(g.giorni || []).includes(i + 1) ? ' checked' : ''}> ${n}</label>`).join('')}
      </div>
      <div id="gi-sett" style="margin-bottom:8px;${sett ? '' : 'display:none;'}">
        <label style="font-size:13px;">Ogni <input type="number" id="gi-ogni" class="form-input" min="1" max="8" value="${esc(g.ogni_settimane || 1)}" style="width:60px;display:inline-block;"> settimane
          <small style="color:var(--gray-500);">(1 = tutte; 2 = settimane alterne, contate dalla data "dal")</small></label>
      </div>
      <div id="gi-mese" style="margin-bottom:8px;${sett ? 'display:none;' : ''}"><span style="font-size:12px;color:var(--gray-500);margin-right:8px;">Settimane del mese</span>
        ${Object.entries(SETTIMANE_MESE).map(([v, n]) => `<label class="gi-chk"><input type="checkbox" data-sm="${v}"${(g.settimane_mese || []).includes(Number(v)) ? ' checked' : ''}> ${n}</label>`).join('')}
        <div style="font-size:12px;color:var(--gray-500);">es. Mar + 1ª = il primo martedì del mese</div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
        <label style="font-size:13px;">Dal <input type="date" id="gi-dal" class="form-input" value="${esc(g.dal || oggiIso())}" style="display:block;"></label>
        <label style="font-size:13px;">Al <input type="date" id="gi-al" class="form-input" value="${esc(g.al || '')}" title="Vuoto = senza scadenza" style="display:block;"></label>
        <label class="gi-chk"><input type="checkbox" id="gi-attivo"${g.attivo ? ' checked' : ''}> Giro attivo</label>
      </div>
      <div id="gi-prossimi" style="font-size:12px;color:var(--gray-500);margin-top:8px;"></div>

      <h3 style="font-size:14px;margin:18px 0 6px;">Contratti del giro</h3>
      <p style="font-size:12px;color:var(--gray-500);margin:0 0 8px;">A ogni passaggio del giro viene creato un intervento per ogni riga. Scegli il servizio se il giro fa solo una parte del contratto (es. solo vetri).</p>
      <input type="search" id="gi-cerca" class="form-input" placeholder="Cerca contratto (nome, numero, indirizzo)…" style="max-width:320px;margin-bottom:8px;">
      <div id="gi-lista-contratti" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px 12px;max-height:220px;overflow-y:auto;padding:8px 10px;border:1.5px solid var(--gray-300);border-radius:8px;">
        ${lista.map(k => `
          <label data-cerca="${esc(k.cerca)}" style="display:flex;align-items:flex-start;gap:6px;font-size:13px;font-weight:400;" title="${esc(k.indirizzo)}">
            <input type="checkbox" data-contratto="${k.id}"${nelGiro.has(k.id) ? ' checked' : ''} style="margin-top:2px;">
            <span>${esc(k.nome)}${k.indirizzo ? `<br><small style="color:var(--gray-500);">${esc(k.indirizzo)}</small>` : ''}
              ${altri.has(k.id) ? `<br><small style="color:#b45309;">anche in: ${esc(altri.get(k.id).join(', '))}</small>` : ''}</span>
          </label>`).join('') || '<span style="font-size:12px;color:var(--gray-500);">Nessun contratto attivo</span>'}
      </div>
      <div class="table-container" style="margin-top:10px;"><table class="washin-table">
        <thead><tr><th>Ordine</th><th>Contratto</th><th>Servizio</th><th></th></tr></thead>
        <tbody id="gi-righe">${righe.map(rigaHtml).join('')}</tbody>
      </table></div>

      <label style="display:block;font-size:13px;font-weight:600;margin-top:16px;">Note
        <textarea id="gi-note" class="form-input" rows="2" style="display:block;margin-top:4px;width:100%;">${esc(g.note || '')}</textarea>
      </label>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;flex-wrap:wrap;">
        ${_sel === 'new' ? '<span></span>' : '<button type="button" class="btn btn-danger btn-sm" id="gi-elimina">Elimina giro</button>'}
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm" id="gi-annulla">Annulla</button>
          <button type="button" class="btn btn-primary btn-sm" id="gi-salva">Salva giro</button>
        </div>
      </div>
    </div>`

  const aggiornaProssimi = () => {
    const f = leggiForm().giro
    const p = prossimiPassaggi(f, f.dal > oggiIso() ? f.dal : oggiIso())
    document.getElementById('gi-prossimi').textContent = p.length ? `Prossimi passaggi: ${p.map(fmtGiorno).join(', ')}` : 'Nessun passaggio: scegli giorni (e settimane del mese).'
  }
  box.firstElementChild.addEventListener('change', e => {
    if (e.target.name === 'gi-cadenza') {
      const m = e.target.value === 'mese'
      document.getElementById('gi-sett').style.display = m ? 'none' : ''
      document.getElementById('gi-mese').style.display = m ? '' : 'none'
    }
    aggiornaProssimi()
  })
  aggiornaProssimi()

  const tbody = document.getElementById('gi-righe')
  document.getElementById('gi-cerca').addEventListener('input', e => {
    const parole = e.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    box.querySelectorAll('#gi-lista-contratti label[data-cerca]').forEach(l => { l.style.display = parole.every(w => l.dataset.cerca.includes(w)) ? '' : 'none' })
  })
  document.getElementById('gi-lista-contratti').addEventListener('change', e => {
    const cb = e.target.closest('[data-contratto]')
    if (!cb) return
    const id = cb.dataset.contratto
    const tr = [...tbody.querySelectorAll('tr')].filter(t => t.dataset.contratto === id)
    if (cb.checked) { if (!tr.length) tbody.insertAdjacentHTML('beforeend', rigaHtml({ contratto_id: id })) }
    else tr.forEach(t => t.remove())
  })
  tbody.addEventListener('click', e => {
    const az = e.target.closest('[data-azione]')?.dataset.azione
    const tr = e.target.closest('tr')
    if (!az || !tr) return
    if (az === 'su' && tr.previousElementSibling) tr.parentNode.insertBefore(tr, tr.previousElementSibling)
    if (az === 'giu' && tr.nextElementSibling) tr.parentNode.insertBefore(tr.nextElementSibling, tr)
    if (az === 'togli') {
      const id = tr.dataset.contratto
      tr.remove()
      if (![...tbody.querySelectorAll('tr')].some(t => t.dataset.contratto === id)) {
        const cb = box.querySelector(`#gi-lista-contratti [data-contratto="${id}"]`)
        if (cb) cb.checked = false
      }
    }
  })
  document.getElementById('gi-annulla').addEventListener('click', () => { if (_sel === 'new') _sel = null; renderLista(); renderDettaglio() })
  document.getElementById('gi-salva').addEventListener('click', e => salva(g, e.currentTarget))
  document.getElementById('gi-elimina')?.addEventListener('click', () => elimina(g))
}

function leggiForm() {
  const cadenza = document.querySelector('input[name="gi-cadenza"]:checked')?.value || 'settimana'
  return {
    giro: {
      nome: document.getElementById('gi-nome').value.trim(),
      squadra_id: document.getElementById('gi-squadra').value || null,
      cadenza,
      giorni: [...document.querySelectorAll('#gi-dettaglio [data-giorno]:checked')].map(c => Number(c.dataset.giorno)),
      ogni_settimane: Math.min(8, Math.max(1, Number(document.getElementById('gi-ogni').value) || 1)),
      settimane_mese: cadenza === 'mese' ? [...document.querySelectorAll('#gi-dettaglio [data-sm]:checked')].map(c => Number(c.dataset.sm)) : [],
      dal: document.getElementById('gi-dal').value || oggiIso(),
      al: document.getElementById('gi-al').value || null,
      attivo: document.getElementById('gi-attivo').checked,
      note: document.getElementById('gi-note').value.trim() || null,
    },
    righe: [...document.querySelectorAll('#gi-righe tr')].map((tr, i) => ({
      contratto_id: tr.dataset.contratto, servizio_id: tr.querySelector('[data-f="servizio_id"]').value || null, ordine: i,
    })),
  }
}

function valida({ giro, righe }) {
  if (!giro.nome) return 'Dai un nome al giro'
  if (!giro.giorni.length) return 'Scegli almeno un giorno'
  if (giro.cadenza === 'mese' && !giro.settimane_mese.length) return 'Scegli almeno una settimana del mese'
  if (giro.al && giro.al < giro.dal) return 'La data "al" non può essere prima di "dal"'
  const visti = new Set()
  for (const r of righe) {
    const k = `${r.contratto_id}|${r.servizio_id || ''}`
    if (visti.has(k)) return 'Lo stesso contratto e servizio compare due volte'
    visti.add(k)
  }
  return null
}

async function salva(g, btn) {
  const dati = leggiForm()
  const err = valida(dati)
  if (err) { showToast(err, 'error'); return }
  btn.disabled = true
  try {
    let id = g.id
    if (id) {
      const { error } = await supabase.from('giri').update(dati.giro).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('giri').insert(dati.giro).select('id').single()
      if (error) throw error
      id = data.id
    }
    // Contratti: si riscrivono tutti (gli interventi puntano al giro, non alle righe)
    if (g.id) {
      const { error } = await supabase.from('giri_contratti').delete().eq('giro_id', id)
      if (error) throw error
    }
    if (dati.righe.length) {
      const { error } = await supabase.from('giri_contratti').insert(dati.righe.map(r => ({ ...r, giro_id: id })))
      if (error) throw error
    }
    showToast('Giro salvato', 'success')
    _sel = id
    await carica()
  } catch (e) {
    console.error(e)
    showToast(/giri_nome_uq|duplicate/.test(e.message || '') ? 'Esiste già un giro con questo nome' : 'Errore salvataggio giro: ' + (e.message || ''), 'error')
  } finally {
    btn.disabled = false
  }
}

async function elimina(g) {
  if (!confirm(`Eliminare il giro "${g.nome}"? Gli interventi già in agenda restano.`)) return
  const { error } = await supabase.from('giri').delete().eq('id', g.id)
  if (error) { console.error(error); showToast('Errore eliminazione', 'error'); return }
  showToast('Giro eliminato', 'success')
  _sel = null
  await carica()
}

export function initGiri() {
  render()
  document.querySelectorAll('a[data-target="giri"], [data-sheet-target="giri"]').forEach(a =>
    a.addEventListener('click', () => carica()))
  carica()
}
