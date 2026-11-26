// Agenda settimanale delle squadre: interventi (tabella interventi) assegnati alle squadre,
// una riga per squadra e una colonna per giorno. Solo giorni, niente orari.
// "Genera settimana" crea gli interventi dai contratti assegnati e dalla frequenza dei servizi.
import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d) }
function lunediDi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return isoDate(x)
}
const nomeOp = p => `${p?.nome || ''} ${p?.cognome || ''}`.trim() || '—'
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

let _lun = null
let _squadre = []       // squadre attive con componenti ordinati (capo per primo)
let _assegn = []        // squadre_contratti che toccano la settimana, con contratto e servizi
let _interventi = []    // interventi della settimana con squadra
let _drag = null

// ── Pianificazione dalle frequenze ──────────────────────────────────────────
// Giorni (0-5, domenica esclusa) in cui l'assegnazione è valida nella settimana
function giorniValidi(a, lun) {
  const out = []
  for (let d = 0; d < 6; d++) {
    const iso = addDaysIso(lun, d)
    if (iso >= a.dal && (!a.al || iso <= a.al)) out.push(d)
  }
  return out
}

function settimanaIso(lun) {
  const d = new Date(lun + 'T12:00:00')
  d.setDate(d.getDate() + 3)
  const gen4 = new Date(d.getFullYear(), 0, 4, 12)
  return 1 + Math.round(((d - gen4) / 86400000 - 3 + ((gen4.getDay() + 6) % 7)) / 7)
}

// Quanti interventi servono in questa settimana per un servizio
export function interventiSettimana(s, lun) {
  const n = Number(s.interventi_numero) || 0
  if (!n) return 0
  switch (s.interventi_periodo) {
    case 'giorno': return -1 // tutti i giorni validi
    case 'settimana':
      if (n >= 1) return Math.round(n)
      return settimanaIso(lun) % Math.round(1 / n) === 0 ? 1 : 0 // es. 0,5 = settimane alterne
    case 'mese': {
      const w = Math.min(3, Math.floor((new Date(lun + 'T12:00:00').getDate() - 1) / 7)) // settimana del mese 0-3
      let k = 0
      for (let i = 0; i < Math.round(n); i++) if (Math.floor(i * 4 / Math.round(n)) % 4 === w) k++
      return k
    }
    default: return 0 // annuali e a richiesta: a mano
  }
}

// Giorni scelti per k interventi, distribuiti e sfalsati per contratto
export function scegliGiorni(validi, k, seme) {
  if (!validi.length || !k) return []
  if (k < 0 || k >= validi.length) return [...validi]
  const off = seme % validi.length
  const out = new Set()
  for (let i = 0; i < k; i++) out.add(validi[(off + Math.floor(i * validi.length / k)) % validi.length])
  return [...out].sort((a, b) => a - b)
}

function piano() {
  const nuovi = []
  for (const a of _assegn) {
    const sq = _squadre.find(s => s.id === a.squadra_id)
    const k0 = a.contratti
    if (!sq || !k0 || (k0.stato && k0.stato !== 'attivo')) continue
    const validi = giorniValidi(a, _lun)
    for (const s of k0.contratti_servizi || []) {
      const k = interventiSettimana(s, _lun)
      if (!k) continue
      const giorni = scegliGiorni(validi, k, hash(k0.id + s.id))
      const gia = _interventi.filter(iv => iv.contratto_id === k0.id && (iv.servizio_id === s.id || (!iv.servizio_id && (k0.contratti_servizi || []).length === 1))).length
      for (const d of giorni.slice(gia)) {
        nuovi.push({
          contratto_id: k0.id, servizio_id: s.id, squadra_id: sq.id,
          data_pianificata: addDaysIso(_lun, d), stato: 'pianificato', tipo_pulizia: 'ordinaria',
          operatore_id: sq.componenti[0]?.id || null, operatore2_id: sq.componenti[1]?.id || null,
        })
      }
    }
  }
  return nuovi
}

// ── Dati ────────────────────────────────────────────────────────────────────
async function carica() {
  const box = document.getElementById('ag-griglia')
  if (!box) return
  document.getElementById('ag-settimana').value = _lun
  const dom = addDaysIso(_lun, 6)
  const f = d => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  document.getElementById('ag-label').textContent = `dal ${f(_lun)} al ${f(dom)}`
  box.innerHTML = '<p style="color:var(--gray-500);font-size:13px;">Caricamento…</p>'
  const [sq, as, iv] = await Promise.all([
    supabase.from('squadre').select('id, nome, colore, attiva, capo_squadra_id, squadre_operatori(operatore_id, profili(nome, cognome))').eq('attiva', true).order('nome'),
    supabase.from('squadre_contratti')
      .select('id, squadra_id, contratto_id, dal, al, contratti(id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo))')
      .lte('dal', dom).or(`al.is.null,al.gte.${_lun}`),
    supabase.from('interventi')
      .select('id, data_pianificata, stato, contratto_id, servizio_id, squadra_id, contratti!contratto_id(numero_contratto, clienti(nome_breve, ragione_sociale)), contratti_servizi(descrizione, minuti_intervento)')
      .gte('data_pianificata', _lun).lte('data_pianificata', dom).not('squadra_id', 'is', null),
  ])
  const err = sq.error || as.error || iv.error
  if (err) {
    console.error(err)
    box.innerHTML = `<p style="color:#b91c1c;font-size:13px;">Errore: ${esc(err.message)}. Hai applicato le migrazioni v48, v49 e v50?</p>`
    return
  }
  _squadre = (sq.data || []).map(s => ({
    ...s,
    componenti: (s.squadre_operatori || []).map(o => ({ id: o.operatore_id, nome: nomeOp(o.profili) }))
      .sort((a, b) => (b.id === s.capo_squadra_id) - (a.id === s.capo_squadra_id) || a.nome.localeCompare(b.nome, 'it')),
  }))
  _assegn = as.data || []
  _interventi = iv.data || []
  render()
}

// ── Vista ───────────────────────────────────────────────────────────────────
const nomeContratto = k => k?.clienti?.nome_breve || k?.clienti?.ragione_sociale || 'Contratto'

function cardHtml(iv, colore) {
  const fatto = ['completato', 'approvato'].includes(iv.stato)
  const serv = iv.contratti_servizi?.descrizione
  return `
    <div class="ag-card" draggable="${fatto ? 'false' : 'true'}" data-iv="${iv.id}" style="border-left:4px solid ${esc(colore)};${fatto ? 'opacity:.6;' : ''}${iv.stato === 'annullato' ? 'text-decoration:line-through;opacity:.5;' : ''}">
      <div style="display:flex;justify-content:space-between;gap:4px;">
        <strong>${esc(nomeContratto(iv.contratti))}</strong>
        ${fatto || iv.stato === 'in_corso' ? '' : `<button type="button" class="ag-x" data-azione="togli" title="Togli dall'agenda">×</button>`}
      </div>
      ${serv ? `<div style="color:var(--gray-500);">${esc(serv[0].toUpperCase() + serv.slice(1))}</div>` : ''}
      ${fatto ? '<div style="color:#16a34a;">✓ fatto</div>' : iv.stato === 'in_corso' ? '<div style="color:#2563eb;">in corso</div>' : ''}
    </div>`
}

function render() {
  const box = document.getElementById('ag-griglia')
  if (!_squadre.length) {
    box.innerHTML = '<p style="color:var(--gray-500);font-size:13px;">Nessuna squadra attiva. Creale dalla sezione Squadre.</p>'
    return
  }
  const oggi = isoDate(new Date())
  const head = GIORNI.map((g, d) => {
    const iso = addDaysIso(_lun, d)
    return `<th style="text-align:center;${iso === oggi ? 'color:#0d9488;' : ''}">${g}<br><small>${new Date(iso + 'T12:00:00').getDate()}</small></th>`
  }).join('')
  const righe = _squadre.map(sq => {
    const contr = _assegn.filter(a => a.squadra_id === sq.id)
    const celle = GIORNI.map((_, d) => {
      const iso = addDaysIso(_lun, d)
      const items = _interventi.filter(iv => iv.squadra_id === sq.id && iv.data_pianificata === iso)
      return `<td class="ag-cella${d === 6 ? ' ag-dom' : ''}" data-squadra="${sq.id}" data-giorno="${d}">
        ${items.map(iv => cardHtml(iv, sq.colore)).join('')}
        <button type="button" class="ag-add" data-azione="aggiungi" title="Aggiungi intervento">+</button>
      </td>`
    }).join('')
    return `<tr>
      <td class="ag-sq">
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(sq.colore)};margin-right:4px;"></span><strong>${esc(sq.nome)}</strong></div>
        <div style="font-size:11px;color:var(--gray-500);">${esc(sq.componenti.map(c => c.nome).join(', ') || 'nessun componente')}</div>
        <div style="font-size:11px;color:var(--gray-500);">${contr.length} contratt${contr.length === 1 ? 'o' : 'i'} questa settimana</div>
      </td>${celle}</tr>`
  }).join('')
  box.innerHTML = `
    <div class="table-container"><table class="washin-table ag-table">
      <thead><tr><th style="min-width:150px;">Squadra</th>${head}</tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
    <p style="font-size:12px;color:var(--gray-500);margin-top:8px;">Trascina un intervento su un altro giorno o su un'altra squadra. Clicca per aprire la scheda completa.</p>`
}

// Menu per aggiungere un intervento a mano: contratti della squadra nella settimana (e poi tutti)
async function aggiungi(td) {
  const sq = _squadre.find(s => s.id === td.dataset.squadra)
  const d = Number(td.dataset.giorno)
  const suoi = _assegn.filter(a => a.squadra_id === sq.id).map(a => a.contratti).filter(Boolean)
  const opzioni = []
  for (const k of suoi) {
    const servizi = (k.contratti_servizi || []).filter(s => s.interventi_periodo !== 'a_richiesta')
    if (!servizi.length) opzioni.push({ k, s: null })
    for (const s of servizi) opzioni.push({ k, s })
  }
  document.querySelector('.ag-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'ag-menu'
  menu.innerHTML = `
    <div style="font-size:12px;font-weight:600;margin-bottom:6px;">${esc(sq.nome)} · ${GIORNI[d]} ${new Date(addDaysIso(_lun, d) + 'T12:00:00').getDate()}</div>
    <select class="form-input" style="font-size:12px;width:100%;">
      ${opzioni.length ? '' : '<option value="">Nessun contratto assegnato alla squadra</option>'}
      ${opzioni.map((o, i) => `<option value="${i}">${esc(nomeContratto(o.k))}${o.s ? ' · ' + esc(o.s.descrizione || 'servizio') : ''}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;">
      <button type="button" class="btn btn-secondary btn-sm" data-m="chiudi">Annulla</button>
      <button type="button" class="btn btn-primary btn-sm" data-m="ok" ${opzioni.length ? '' : 'disabled'}>Aggiungi</button>
    </div>`
  td.appendChild(menu)
  menu.addEventListener('click', async e => {
    e.stopPropagation()
    const m = e.target.closest('[data-m]')?.dataset.m
    if (m === 'chiudi') menu.remove()
    if (m !== 'ok') return
    const o = opzioni[Number(menu.querySelector('select').value)]
    const { error } = await supabase.from('interventi').insert({
      contratto_id: o.k.id, servizio_id: o.s?.id || null, squadra_id: sq.id,
      data_pianificata: addDaysIso(_lun, d), stato: 'pianificato', tipo_pulizia: 'ordinaria',
      operatore_id: sq.componenti[0]?.id || null, operatore2_id: sq.componenti[1]?.id || null,
    })
    if (error) { console.error(error); showToast('Errore: ' + error.message, 'error'); return }
    await carica()
  })
}

async function sposta(ivId, squadraId, giorno) {
  const iv = _interventi.find(x => x.id === ivId)
  const sq = _squadre.find(s => s.id === squadraId)
  if (!iv || !sq) return
  const data = addDaysIso(_lun, giorno)
  if (iv.squadra_id === squadraId && iv.data_pianificata === data) return
  const campi = { data_pianificata: data, squadra_id: squadraId }
  if (iv.squadra_id !== squadraId) Object.assign(campi, { operatore_id: sq.componenti[0]?.id || null, operatore2_id: sq.componenti[1]?.id || null })
  Object.assign(iv, campi) // subito a video, poi salvataggio
  render()
  const { error } = await supabase.from('interventi').update(campi).eq('id', ivId)
  if (error) { console.error(error); showToast('Errore spostamento: ' + error.message, 'error') }
  await carica()
}

async function generaSettimana(btn) {
  const nuovi = piano()
  if (!nuovi.length) { showToast('Niente da aggiungere: la settimana è già pianificata', 'success'); return }
  if (!confirm(`Creo ${nuovi.length} interventi per la settimana dai contratti assegnati alle squadre? Quelli già in agenda restano.`)) return
  btn.disabled = true
  const { error } = await supabase.from('interventi').insert(nuovi)
  btn.disabled = false
  if (error) { console.error(error); showToast('Errore: ' + error.message, 'error'); return }
  showToast(`${nuovi.length} interventi creati`, 'success')
  await carica()
}

async function svuota(btn) {
  const daTogliere = _interventi.filter(iv => iv.stato === 'pianificato')
  if (!daTogliere.length) { showToast('Nessun intervento pianificato da togliere', 'success'); return }
  if (!confirm(`Tolgo ${daTogliere.length} interventi ancora "pianificati" delle squadre in questa settimana? Quelli in corso o fatti restano.`)) return
  btn.disabled = true
  const { error } = await supabase.from('interventi').delete().in('id', daTogliere.map(iv => iv.id))
  btn.disabled = false
  if (error) { console.error(error); showToast('Errore: ' + error.message, 'error'); return }
  await carica()
}

// ── Init ────────────────────────────────────────────────────────────────────
export function initAgendaSquadre({ apriIntervento } = {}) {
  const sec = document.getElementById('agenda-squadre')
  if (!sec) return
  sec.innerHTML = `
    <style>
      #agenda-squadre .ag-table td, #agenda-squadre .ag-table th { vertical-align:top; padding:6px; }
      #agenda-squadre .ag-cella { min-width:110px; position:relative; }
      #agenda-squadre .ag-dom { background:var(--gray-50, #f9fafb); }
      #agenda-squadre .ag-cella.over { background:#ccfbf1; }
      #agenda-squadre .ag-card { background:#fff; border:1px solid var(--gray-200); border-radius:6px; padding:4px 6px; margin-bottom:4px; font-size:11.5px; cursor:pointer; line-height:1.3; }
      #agenda-squadre .ag-card[draggable=true] { cursor:grab; }
      #agenda-squadre .ag-x { border:none; background:none; color:var(--gray-400); cursor:pointer; font-size:14px; line-height:1; padding:0 2px; width:auto; }
      #agenda-squadre .ag-x:hover { color:#b91c1c; }
      #agenda-squadre .ag-add { border:1px dashed var(--gray-300); background:none; border-radius:6px; width:100%; color:var(--gray-400); cursor:pointer; font-size:14px; padding:0; }
      #agenda-squadre .ag-add:hover { color:#0d9488; border-color:#0d9488; }
      #agenda-squadre .ag-menu { position:absolute; z-index:20; top:100%; left:0; width:260px; background:#fff; border:1px solid var(--gray-300); border-radius:8px; padding:10px; box-shadow:0 8px 24px rgba(0,0,0,.15); }
    </style>
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Agenda squadre</h1>
        <p style="color:var(--gray-500);margin-top:8px;">Interventi della settimana assegnati alle squadre. Compaiono anche nell'app delle operatrici.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" id="ag-prev">◀</button>
        <input type="date" id="ag-settimana" class="form-input" style="max-width:160px;">
        <button class="btn btn-secondary btn-sm" id="ag-next">▶</button>
        <span id="ag-label" style="font-size:13px;color:var(--gray-500);"></span>
      </div>
    </div>
    <div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button class="btn btn-primary btn-sm" id="ag-genera">Genera settimana dai contratti</button>
        <button class="btn btn-secondary btn-sm" id="ag-svuota">Togli i pianificati della settimana</button>
      </div>
      <p style="font-size:12px;color:var(--gray-500);margin:0 0 10px;">"Genera settimana" crea gli interventi che mancano secondo la frequenza dei servizi (es. 2 v/settimana, 1 v/mese) dei contratti assegnati a ogni squadra, dal lunedì al sabato e solo nei giorni del periodo di assegnazione. I servizi annuali e a richiesta si aggiungono a mano con il +.</p>
      <div id="ag-griglia"></div>
    </div>`
  _lun = lunediDi(new Date())
  const vai = n => { _lun = addDaysIso(_lun, n); carica() }
  document.getElementById('ag-prev').addEventListener('click', () => vai(-7))
  document.getElementById('ag-next').addEventListener('click', () => vai(7))
  document.getElementById('ag-settimana').addEventListener('change', e => {
    if (!e.target.value) return
    _lun = lunediDi(new Date(e.target.value + 'T12:00:00')); carica()
  })
  document.getElementById('ag-genera').addEventListener('click', e => generaSettimana(e.currentTarget))
  document.getElementById('ag-svuota').addEventListener('click', e => svuota(e.currentTarget))

  const griglia = document.getElementById('ag-griglia')
  griglia.addEventListener('click', async e => {
    if (e.target.closest('.ag-menu')) return
    const az = e.target.closest('[data-azione]')?.dataset.azione
    if (az === 'aggiungi') { aggiungi(e.target.closest('td')); return }
    const card = e.target.closest('.ag-card')
    if (!card) return
    if (az === 'togli') {
      const { error } = await supabase.from('interventi').delete().eq('id', card.dataset.iv)
      if (error) { showToast('Errore: ' + error.message, 'error'); return }
      await carica()
      return
    }
    if (apriIntervento) apriIntervento(card.dataset.iv)
  })
  griglia.addEventListener('dragstart', e => {
    const card = e.target.closest('.ag-card')
    if (!card) return
    _drag = card.dataset.iv
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', _drag)
  })
  griglia.addEventListener('dragover', e => {
    const td = e.target.closest('.ag-cella')
    if (!td || !_drag) return
    e.preventDefault()
    griglia.querySelectorAll('.ag-cella.over').forEach(x => x !== td && x.classList.remove('over'))
    td.classList.add('over')
  })
  griglia.addEventListener('dragleave', e => { e.target.closest?.('.ag-cella')?.classList.remove('over') })
  griglia.addEventListener('drop', e => {
    const td = e.target.closest('.ag-cella')
    if (!td || !_drag) return
    e.preventDefault()
    const id = _drag
    _drag = null
    sposta(id, td.dataset.squadra, Number(td.dataset.giorno))
  })
  griglia.addEventListener('dragend', () => { _drag = null; griglia.querySelectorAll('.ag-cella.over').forEach(x => x.classList.remove('over')) })

  document.querySelectorAll('a[data-target="agenda-squadre"], [data-sheet-target="agenda-squadre"]').forEach(a =>
    a.addEventListener('click', () => carica()))
  carica()
}

// Per i fogli ore: interventi pianificati in una settimana → Set "contratto|servizio|giorno" e "contratto||giorno"
export async function pianificatiSettimana(lun, { squadraId = null, operatoreId = null } = {}) {
  const dom = addDaysIso(lun, 6)
  let q = supabase.from('interventi').select('contratto_id, servizio_id, data_pianificata, squadra_id, operatore_id, operatore2_id')
    .gte('data_pianificata', lun).lte('data_pianificata', dom).neq('stato', 'annullato')
  const ors = []
  if (squadraId) ors.push(`squadra_id.eq.${squadraId}`)
  if (operatoreId) ors.push(`operatore_id.eq.${operatoreId}`, `operatore2_id.eq.${operatoreId}`)
  if (ors.length) q = q.or(ors.join(','))
  const { data, error } = await q
  if (error) { console.warn(error.message); return new Set() }
  const out = new Set()
  for (const iv of data || []) {
    const d = Math.round((new Date(iv.data_pianificata + 'T12:00:00') - new Date(lun + 'T12:00:00')) / 86400000)
    out.add(`${iv.contratto_id}|${iv.servizio_id || ''}|${d}`)
    out.add(`${iv.contratto_id}||${d}`)
  }
  return out
}
