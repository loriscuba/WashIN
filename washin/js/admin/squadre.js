// Squadre: anagrafica, componenti e assegnazione (anche temporanea) ai contratti. Tabelle v48.
import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const nomeOp = p => `${p?.nome || ''} ${p?.cognome || ''}`.trim() || '—'
const oggiIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtData = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
const COLORI = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#475569']

let _squadre = []      // con componenti e contratti
let _profili = []
let _contratti = []
let _sel = null        // id squadra aperta ('new' = nuova)

// Stato di un'assegnazione rispetto a oggi
function statoPeriodo(r, oggi = oggiIso()) {
  if (r.dal > oggi) return 'futura'
  if (r.al && r.al < oggi) return 'conclusa'
  return 'attiva'
}
export function periodoLabel(r) {
  return r.al ? `dal ${fmtData(r.dal)} al ${fmtData(r.al)}` : `dal ${fmtData(r.dal)}`
}

function render() {
  const sec = document.getElementById('squadre')
  if (!sec) return
  sec.innerHTML = `
    <style>
      #squadre input[type=checkbox] { width:auto; padding:0; }
      #squadre input[type=color] { width:38px; height:32px; padding:0; border:none; background:none; }
      #squadre table input, #squadre table select { width:auto; }
      .sq-card { cursor:pointer; border:1.5px solid var(--gray-200); border-radius:10px; padding:12px 14px; background:#fff; }
      .sq-card.on { border-color:#0d9488; box-shadow:0 0 0 2px rgba(13,148,136,.15); }
      .sq-dot { display:inline-block; width:12px; height:12px; border-radius:50%; vertical-align:middle; margin-right:6px; }
      .sq-grid { display:grid; grid-template-columns:minmax(240px,320px) 1fr; gap:16px; align-items:start; }
      @media (max-width: 800px) { .sq-grid { grid-template-columns:1fr; } }
    </style>
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Squadre</h1>
        <p style="color:var(--gray-500);margin-top:8px;">Gruppi di operatori da assegnare ai contratti, anche solo per un periodo.</p>
      </div>
      <button class="btn btn-primary" id="sq-nuova">+ Nuova squadra</button>
    </div>
    <div class="sq-grid">
      <div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-500);margin-bottom:8px;">
          <input type="checkbox" id="sq-mostra-inattive"> Mostra squadre non attive
        </label>
        <div id="sq-lista" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
      <div id="sq-dettaglio"></div>
    </div>
  `
  document.getElementById('sq-nuova').addEventListener('click', () => { _sel = 'new'; renderLista(); renderDettaglio() })
  document.getElementById('sq-mostra-inattive').addEventListener('change', renderLista)
  document.getElementById('sq-lista').addEventListener('click', e => {
    const c = e.target.closest('[data-squadra]')
    if (!c) return
    _sel = c.dataset.squadra
    renderLista(); renderDettaglio()
  })
}

async function carica() {
  const [sq, pr, ct] = await Promise.all([
    supabase.from('squadre')
      .select('*, squadre_operatori(operatore_id), squadre_contratti(id, contratto_id, dal, al, note)')
      .order('nome'),
    supabase.from('profili').select('id, nome, cognome, attivo').order('nome'),
    supabase.from('contratti').select('id, numero_contratto, stato, clienti(nome_breve, ragione_sociale)'),
  ])
  if (sq.error) {
    console.error(sq.error)
    const msg = /squadre/.test(sq.error.message || '') ? 'Tabelle squadre mancanti: applica la migrazione v48.' : 'Errore caricamento squadre'
    document.getElementById('sq-lista').innerHTML = `<p style="color:#b91c1c;font-size:13px;">${esc(msg)}</p>`
    return
  }
  _squadre = sq.data || []
  _profili = pr.data || []
  _contratti = (ct.data || []).map(k => ({
    id: k.id, stato: k.stato,
    nome: `${k.clienti?.nome_breve || k.clienti?.ragione_sociale || '—'}${k.numero_contratto ? ' (' + k.numero_contratto + ')' : ''}`,
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }))
  renderLista()
  renderDettaglio()
}

function renderLista() {
  const box = document.getElementById('sq-lista')
  if (!box) return
  const tutte = document.getElementById('sq-mostra-inattive')?.checked
  const lista = _squadre.filter(s => tutte || s.attiva || s.id === _sel)
  if (!lista.length) {
    box.innerHTML = '<p style="font-size:13px;color:var(--gray-500);">Nessuna squadra. Crea la prima con "+ Nuova squadra".</p>'
    return
  }
  const profilo = id => _profili.find(p => p.id === id)
  box.innerHTML = lista.map(s => {
    const comp = (s.squadre_operatori || []).map(o => nomeOp(profilo(o.operatore_id)))
    const attivi = (s.squadre_contratti || []).filter(r => statoPeriodo(r) === 'attiva').length
    return `
      <div class="sq-card${s.id === _sel ? ' on' : ''}" data-squadra="${s.id}">
        <div style="font-weight:600;font-size:14px;"><span class="sq-dot" style="background:${esc(s.colore)}"></span>${esc(s.nome)}
          ${s.attiva ? '' : '<span class="badge" style="margin-left:6px;">non attiva</span>'}</div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">${comp.length ? esc(comp.join(', ')) : 'Nessun componente'}</div>
        <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${attivi} contratt${attivi === 1 ? 'o' : 'i'} in corso</div>
      </div>`
  }).join('')
}

function rigaContrattoHtml(r = {}) {
  const opts = _contratti
    .filter(k => k.stato === 'attivo' || k.id === r.contratto_id)
    .map(k => `<option value="${k.id}"${k.id === r.contratto_id ? ' selected' : ''}>${esc(k.nome)}</option>`).join('')
  const st = r.dal ? statoPeriodo(r) : ''
  const badge = st === 'attiva' ? '<span class="badge badge-success">in corso</span>'
    : st === 'futura' ? '<span class="badge badge-info">futura</span>'
    : st === 'conclusa' ? '<span class="badge">conclusa</span>' : ''
  return `
    <tr data-riga="${r.id || ''}">
      <td><select class="form-input" data-f="contratto_id" style="max-width:260px;"><option value="">— scegli contratto —</option>${opts}</select></td>
      <td><input type="date" class="form-input" data-f="dal" value="${esc(r.dal || oggiIso())}"></td>
      <td><input type="date" class="form-input" data-f="al" value="${esc(r.al || '')}" title="Vuoto = senza scadenza"></td>
      <td><input type="text" class="form-input" data-f="note" value="${esc(r.note || '')}" placeholder="es. copertura ferie" style="min-width:140px;"></td>
      <td style="white-space:nowrap;">${badge}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" data-azione="togli" title="Togli">✕</button></td>
    </tr>`
}

function renderDettaglio() {
  const box = document.getElementById('sq-dettaglio')
  if (!box) return
  if (!_sel) {
    box.innerHTML = '<div class="card"><p style="font-size:13px;color:var(--gray-500);margin:0;">Seleziona una squadra a sinistra o creane una nuova.</p></div>'
    return
  }
  const s = _sel === 'new'
    ? { nome: '', colore: COLORI[_squadre.length % COLORI.length], attiva: true, squadre_operatori: [], squadre_contratti: [] }
    : _squadre.find(x => x.id === _sel)
  if (!s) { _sel = null; renderDettaglio(); return }
  const comp = new Set((s.squadre_operatori || []).map(o => o.operatore_id))
  // Un operatore sta in una sola squadra: chi è già in un'altra non si può spuntare
  const altrove = new Map()
  for (const x of _squadre) if (x.id !== s.id) for (const o of x.squadre_operatori || []) altrove.set(o.operatore_id, x.nome)
  const operatori = _profili.filter(p => p.attivo !== false || comp.has(p.id))
  const righe = [...(s.squadre_contratti || [])].sort((a, b) => (b.dal || '').localeCompare(a.dal || ''))

  box.innerHTML = `
    <div class="card">
      <div style="display:grid;grid-template-columns:2fr auto 2fr;gap:12px;align-items:end;">
        <label style="font-size:13px;font-weight:600;">Nome squadra
          <input type="text" id="sq-nome" class="form-input" value="${esc(s.nome)}" placeholder="es. Squadra A" style="display:block;margin-top:4px;">
        </label>
        <label style="font-size:13px;font-weight:600;">Colore
          <input type="color" id="sq-colore" value="${esc(s.colore)}" style="display:block;margin-top:4px;">
        </label>
        <label style="font-size:13px;font-weight:600;">Capo squadra
          <select id="sq-capo" class="form-input" style="display:block;margin-top:4px;">
            <option value="">— nessuno —</option>
            ${operatori.map(p => `<option value="${p.id}"${p.id === s.capo_squadra_id ? ' selected' : ''}>${esc(nomeOp(p))}</option>`).join('')}
          </select>
        </label>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin-top:10px;">
        <input type="checkbox" id="sq-attiva"${s.attiva ? ' checked' : ''}> Squadra attiva
      </label>

      <h3 style="font-size:14px;margin:18px 0 6px;">Componenti</h3>
      <input type="search" id="sq-cerca-op" class="form-input" placeholder="Cerca operatore…" style="max-width:240px;margin-bottom:8px;">
      <div id="sq-componenti" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 12px;max-height:220px;overflow-y:auto;padding:8px 10px;border:1.5px solid var(--gray-300);border-radius:8px;">
        ${operatori.map(p => `
          <label data-nome="${esc(nomeOp(p).toLowerCase())}" style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400;${altrove.has(p.id) ? 'opacity:.5;' : ''}"
            ${altrove.has(p.id) ? `title="Già in ${esc(altrove.get(p.id))}"` : ''}>
            <input type="checkbox" data-operatore="${p.id}"${comp.has(p.id) ? ' checked' : ''}${altrove.has(p.id) ? ' disabled' : ''}> ${esc(nomeOp(p))}
            ${altrove.has(p.id) ? `<small style="color:var(--gray-500);">(${esc(altrove.get(p.id))})</small>` : ''}
          </label>`).join('') || '<span style="font-size:12px;color:var(--gray-500);">Nessun operatore attivo</span>'}
      </div>

      <h3 style="font-size:14px;margin:18px 0 6px;">Contratti assegnati</h3>
      <p style="font-size:12px;color:var(--gray-500);margin:0 0 8px;">Nel periodo indicato la squadra sostituisce gli operatori fissi del contratto (sui fogli ore il contratto passa alla squadra). Lascia vuota la data "al" se l'assegnazione non ha scadenza; per una copertura temporanea (es. ferie) metti le due date.</p>
      <div class="table-container"><table class="washin-table">
        <thead><tr><th>Contratto</th><th>Dal</th><th>Al</th><th>Note</th><th></th><th></th></tr></thead>
        <tbody id="sq-contratti">${righe.map(rigaContrattoHtml).join('')}</tbody>
      </table></div>
      <button type="button" class="btn btn-secondary btn-sm" id="sq-add-contratto" style="margin-top:8px;">+ Assegna contratto</button>

      <label style="display:block;font-size:13px;font-weight:600;margin-top:16px;">Note
        <textarea id="sq-note" class="form-input" rows="2" style="display:block;margin-top:4px;width:100%;">${esc(s.note || '')}</textarea>
      </label>

      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px;flex-wrap:wrap;">
        ${_sel === 'new' ? '<span></span>' : '<button type="button" class="btn btn-danger btn-sm" id="sq-elimina">Elimina squadra</button>'}
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm" id="sq-annulla">Annulla</button>
          <button type="button" class="btn btn-primary btn-sm" id="sq-salva">Salva squadra</button>
        </div>
      </div>
    </div>
  `
  document.getElementById('sq-cerca-op').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    box.querySelectorAll('#sq-componenti label[data-nome]').forEach(l => { l.style.display = !q || l.dataset.nome.includes(q) ? '' : 'none' })
  })
  document.getElementById('sq-add-contratto').addEventListener('click', () => {
    document.getElementById('sq-contratti').insertAdjacentHTML('beforeend', rigaContrattoHtml())
  })
  document.getElementById('sq-contratti').addEventListener('click', e => {
    if (e.target.closest('[data-azione="togli"]')) e.target.closest('tr').remove()
  })
  document.getElementById('sq-annulla').addEventListener('click', () => { if (_sel === 'new') _sel = null; renderLista(); renderDettaglio() })
  document.getElementById('sq-salva').addEventListener('click', e => salva(s, e.currentTarget))
  document.getElementById('sq-elimina')?.addEventListener('click', () => elimina(s))
}

function leggiForm() {
  const nome = document.getElementById('sq-nome').value.trim()
  const componenti = [...document.querySelectorAll('#sq-componenti [data-operatore]:checked')].map(el => el.dataset.operatore)
  const righe = [...document.querySelectorAll('#sq-contratti tr')].map(tr => {
    const v = f => tr.querySelector(`[data-f="${f}"]`).value.trim()
    return { id: tr.dataset.riga || null, contratto_id: v('contratto_id'), dal: v('dal'), al: v('al') || null, note: v('note') || null }
  })
  return {
    squadra: {
      nome,
      colore: document.getElementById('sq-colore').value,
      capo_squadra_id: document.getElementById('sq-capo').value || null,
      attiva: document.getElementById('sq-attiva').checked,
      note: document.getElementById('sq-note').value.trim() || null,
    },
    componenti, righe,
  }
}

function valida({ squadra, righe }) {
  if (!squadra.nome) return 'Dai un nome alla squadra'
  for (const r of righe) {
    if (!r.contratto_id) return 'Scegli il contratto in ogni riga (o toglila)'
    if (!r.dal) return 'Ogni assegnazione deve avere la data "dal"'
    if (r.al && r.al < r.dal) return 'La data "al" non può essere prima di "dal"'
  }
  // Stesso contratto due volte con periodi sovrapposti
  for (let i = 0; i < righe.length; i++) for (let j = i + 1; j < righe.length; j++) {
    const a = righe[i], b = righe[j]
    if (a.contratto_id !== b.contratto_id) continue
    if ((a.al || '9999') >= b.dal && (b.al || '9999') >= a.dal) return 'Lo stesso contratto ha due periodi che si sovrappongono'
  }
  return null
}

async function salva(s, btn) {
  const dati = leggiForm()
  const err = valida(dati)
  if (err) { showToast(err, 'error'); return }
  btn.disabled = true
  try {
    let id = s.id
    if (id) {
      const { error } = await supabase.from('squadre').update(dati.squadra).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('squadre').insert(dati.squadra).select('id').single()
      if (error) throw error
      id = data.id
    }

    // Componenti: differenza tra prima e dopo
    const prima = new Set((s.squadre_operatori || []).map(o => o.operatore_id))
    const dopo = new Set(dati.componenti)
    const via = [...prima].filter(x => !dopo.has(x))
    const nuovi = [...dopo].filter(x => !prima.has(x))
    if (via.length) {
      const { error } = await supabase.from('squadre_operatori').delete().eq('squadra_id', id).in('operatore_id', via)
      if (error) throw error
    }
    if (nuovi.length) {
      const { error } = await supabase.from('squadre_operatori').insert(nuovi.map(operatore_id => ({ squadra_id: id, operatore_id })))
      if (error) throw error
    }

    // Contratti: aggiorna le righe esistenti, inserisce le nuove, cancella le tolte
    const tenute = new Set(dati.righe.filter(r => r.id).map(r => r.id))
    const tolte = (s.squadre_contratti || []).map(r => r.id).filter(x => !tenute.has(x))
    if (tolte.length) {
      const { error } = await supabase.from('squadre_contratti').delete().in('id', tolte)
      if (error) throw error
    }
    for (const r of dati.righe.filter(r => r.id)) {
      const { id: rid, ...campi } = r
      const { error } = await supabase.from('squadre_contratti').update(campi).eq('id', rid)
      if (error) throw error
    }
    const nuove = dati.righe.filter(r => !r.id).map(({ id: _, ...campi }) => ({ ...campi, squadra_id: id }))
    if (nuove.length) {
      const { error } = await supabase.from('squadre_contratti').insert(nuove)
      if (error) throw error
    }

    showToast('Squadra salvata', 'success')
    _sel = id
    await carica()
  } catch (e) {
    console.error(e)
    showToast(/una_squadra/.test(e.message || '') ? 'Un operatore scelto è già in un\'altra squadra' : /squadre_nome_uq|duplicate/.test(e.message || '') ? 'Esiste già una squadra con questo nome' : 'Errore salvataggio squadra', 'error')
  } finally {
    btn.disabled = false
  }
}

async function elimina(s) {
  if (!confirm(`Eliminare la squadra "${s.nome}"? Le assegnazioni ai contratti vengono tolte; gli interventi in agenda restano senza squadra.`)) return
  const { error } = await supabase.from('squadre').delete().eq('id', s.id)
  if (error) { console.error(error); showToast('Errore eliminazione', 'error'); return }
  showToast('Squadra eliminata', 'success')
  _sel = null
  await carica()
}

// Squadre assegnate a un contratto (per il modal Contratti, sola lettura)
export async function squadreDelContratto(contrattoId) {
  const { data, error } = await supabase.from('squadre_contratti')
    .select('id, dal, al, note, squadre(nome, colore)')
    .eq('contratto_id', contrattoId)
    .order('dal', { ascending: false })
  if (error) return null
  return (data || []).map(r => ({ ...r, stato: statoPeriodo(r) }))
}

export function initSquadre() {
  render()
  // Ricarica quando si apre la sezione
  document.querySelectorAll('a[data-target="squadre"], [data-sheet-target="squadre"]').forEach(a =>
    a.addEventListener('click', () => carica()))
  carica()
}
