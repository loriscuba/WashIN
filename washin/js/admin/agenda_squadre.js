// Agenda settimanale delle squadre: interventi (tabella interventi) assegnati alle squadre,
// una riga per squadra, una colonna "In settimana" (interventi senza giorno fisso, v53) e una per giorno.
// "Genera settimana" crea gli interventi dai GIRI (v52) nei giorni del giro; i contratti
// assegnati a una squadra ma in nessun giro seguono ancora la frequenza dei servizi e vanno
// senza giorno (la squadra li fa quando può nella settimana), tranne i servizi giornalieri.
// Col + si aggiunge anche un lavoro straordinario, pure su contratti fuori dal giro della squadra.
import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { serviziUnici } from './fogli_ore_righe.js'
import { caricaGiri, giroGiorni } from './giri_calendario.js'

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
let _giri = []          // giri attivi con contratti (vuoto se manca la v52)
let _drag = null
let _tutti = null       // contratti attivi (per gli straordinari), caricati al primo uso

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

// Una sola assegnazione per squadra e contratto (se due periodi toccano la stessa settimana
// si uniscono i giorni validi)
function assegnUniche() {
  const m = new Map()
  for (const a of _assegn) {
    const k = `${a.squadra_id}|${a.contratto_id}`
    const prima = m.get(k)
    if (!prima) m.set(k, { ...a, giorni: giorniValidi(a, _lun) })
    else prima.giorni = [...new Set([...prima.giorni, ...giorniValidi(a, _lun)])].sort((x, y) => x - y)
  }
  return [...m.values()]
}

const fmtMin = m => m == null ? '' : m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + "'" : ''}` : `${m}'`
const PER = { settimana: 'sett', mese: 'mese', anno: 'anno', giorno: 'giorno' }
function etichettaServizio(s) {
  const d = s.descrizione ? s.descrizione[0].toUpperCase() + s.descrizione.slice(1) : 'Servizio'
  const f = s.interventi_numero != null && s.interventi_periodo ? `${String(s.interventi_numero).replace('.', ',')} v/${PER[s.interventi_periodo] || s.interventi_periodo}` : ''
  return [d, fmtMin(s.minuti_intervento), f].filter(Boolean).join(' · ')
}

// Squadra che fa il contratto in quel giorno: una copertura temporanea (assegnazione con
// data "al") su un'altra squadra prevale sulla squadra del giro
function squadraDelGiorno(g, contrattoId, iso) {
  const cop = _assegn.find(a => a.contratto_id === contrattoId && a.al && a.squadra_id !== g.squadra_id && iso >= a.dal && iso <= a.al)
  return _squadre.find(s => s.id === (cop ? cop.squadra_id : g.squadra_id))
}

// Contratti in almeno un giro attivo: la loro pianificazione la fanno i giri
const contrattiNeiGiri = () => new Set(_giri.filter(g => g.attivo).flatMap(g => (g.giri_contratti || []).map(r => r.contratto_id)))

function pianoGiri() {
  const nuovi = []
  const fissi = _interventi.filter(iv => !iv.senza_giorno && iv.tipo_pulizia !== 'straordinaria')
  const presi = new Set(fissi.map(iv => `${iv.contratto_id}|${iv.servizio_id || ''}|${iv.data_pianificata}`))
  for (const g of _giri) {
    if (!g.attivo || !g.squadra_id) continue
    for (const d of giroGiorni(g, _lun)) {
      const iso = addDaysIso(_lun, d)
      for (const r of g.giri_contratti || []) {
        const k0 = r.contratti
        if (!k0 || (k0.stato && k0.stato !== 'attivo')) continue
        const servizi = serviziUnici(k0.contratti_servizi)
        const servizio = r.servizio_id || (servizi.length === 1 ? servizi[0].id : null)
        const chiave = `${k0.id}|${servizio || ''}|${iso}`
        if (presi.has(chiave) || (!servizio && fissi.some(iv => iv.contratto_id === k0.id && iv.data_pianificata === iso))) continue
        const sq = squadraDelGiorno(g, k0.id, iso)
        if (!sq) continue
        presi.add(chiave)
        nuovi.push({
          contratto_id: k0.id, servizio_id: servizio, squadra_id: sq.id, giro_id: g.id,
          data_pianificata: iso, stato: 'pianificato', tipo_pulizia: 'ordinaria',
          operatore_id: sq.componenti[0]?.id || null, operatore2_id: sq.componenti[1]?.id || null,
        })
      }
    }
  }
  return nuovi
}

function piano() {
  const nuovi = pianoGiri()
  const neiGiri = contrattiNeiGiri()
  for (const a of assegnUniche()) {
    if (neiGiri.has(a.contratto_id)) continue
    const sq = _squadre.find(s => s.id === a.squadra_id)
    const k0 = a.contratti
    if (!sq || !k0 || (k0.stato && k0.stato !== 'attivo')) continue
    const validi = a.giorni
    const servizi = serviziUnici(k0.contratti_servizi)
    for (const s of servizi) {
      const k = interventiSettimana(s, _lun)
      if (!k) continue
      if (!validi.length) continue
      // giornalieri su ogni giorno; gli altri senza giorno fisso (data = primo giorno valido della settimana)
      const giorni = k < 0 ? scegliGiorni(validi, k, 0) : Array(k).fill(validi[0])
      const gia = _interventi.filter(iv => iv.contratto_id === k0.id && iv.tipo_pulizia !== 'straordinaria' && (iv.servizio_id === s.id || (!iv.servizio_id && servizi.length === 1))).length
      for (const d of giorni.slice(gia)) {
        nuovi.push({
          contratto_id: k0.id, servizio_id: s.id, squadra_id: sq.id,
          data_pianificata: addDaysIso(_lun, d), senza_giorno: k > 0, stato: 'pianificato', tipo_pulizia: 'ordinaria',
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
  const giri = await caricaGiri()
  _giri = giri || []
  const [sq, as, iv] = await Promise.all([
    supabase.from('squadre').select('id, nome, colore, attiva, capo_squadra_id, squadre_operatori(operatore_id, profili(nome, cognome))').eq('attiva', true).order('nome'),
    supabase.from('squadre_contratti')
      .select('id, squadra_id, contratto_id, dal, al, contratti(id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo))')
      .lte('dal', dom).or(`al.is.null,al.gte.${_lun}`),
    supabase.from('interventi')
      .select(`id, data_pianificata, senza_giorno, tipo_pulizia, stato, contratto_id, servizio_id, squadra_id, ${giri ? 'giro_id, ' : ''}contratti!contratto_id(numero_contratto, clienti(nome_breve, ragione_sociale)), contratti_servizi(descrizione, minuti_intervento)`)
      .gte('data_pianificata', _lun).lte('data_pianificata', dom).not('squadra_id', 'is', null),
  ])
  const err = sq.error || as.error || iv.error
  if (err) {
    console.error(err)
    box.innerHTML = `<p style="color:#b91c1c;font-size:13px;">Errore: ${esc(err.message)}. Hai applicato le migrazioni v48-v50, v52 e v53?</p>`
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
      ${iv.tipo_pulizia === 'straordinaria' ? '<div style="color:#c2410c;font-weight:600;">Straordinario</div>' : ''}
      ${serv ? `<div style="color:var(--gray-500);">${esc(serv[0].toUpperCase() + serv.slice(1))}</div>` : ''}
      ${iv.giro_id ? `<div style="color:var(--gray-400);font-size:10.5px;">↻ ${esc(_giri.find(g => g.id === iv.giro_id)?.nome || 'giro')}</div>` : ''}
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
  const head = '<th style="text-align:center;">In settimana<br><small>senza giorno</small></th>' + GIORNI.map((g, d) => {
    const iso = addDaysIso(_lun, d)
    return `<th style="text-align:center;${iso === oggi ? 'color:#0d9488;' : ''}">${g}<br><small>${new Date(iso + 'T12:00:00').getDate()}</small></th>`
  }).join('')
  const righe = _squadre.map(sq => {
    const giriSq = _giri.filter(g => g.attivo && g.squadra_id === sq.id && giroGiorni(g, _lun).length)
    const contr = [...new Set([..._assegn.filter(a => a.squadra_id === sq.id).map(a => a.contratto_id),
      ...giriSq.flatMap(g => (g.giri_contratti || []).map(r => r.contratto_id))])]
    const celle = ['S', ...GIORNI.keys()].map(d => {
      const items = _interventi.filter(iv => iv.squadra_id === sq.id &&
        (d === 'S' ? iv.senza_giorno : !iv.senza_giorno && iv.data_pianificata === addDaysIso(_lun, d)))
      return `<td class="ag-cella${d === 6 ? ' ag-dom' : d === 'S' ? ' ag-sett' : ''}" data-squadra="${sq.id}" data-giorno="${d}">
        ${items.map(iv => cardHtml(iv, sq.colore)).join('')}
        <button type="button" class="ag-add" data-azione="aggiungi" title="Aggiungi intervento">+</button>
      </td>`
    }).join('')
    return `<tr>
      <td class="ag-sq">
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(sq.colore)};margin-right:4px;"></span><strong>${esc(sq.nome)}</strong></div>
        <div style="font-size:11px;color:var(--gray-500);">${esc(sq.componenti.map(c => c.nome).join(', ') || 'nessun componente')}</div>
        <div style="font-size:11px;color:var(--gray-500);">${contr.length} contratt${contr.length === 1 ? 'o' : 'i'} questa settimana</div>
        ${giriSq.length ? `<div style="font-size:11px;color:var(--gray-500);">↻ ${esc(giriSq.map(g => g.nome).join(', '))}</div>` : ''}
      </td>${celle}</tr>`
  }).join('')
  box.innerHTML = `
    <div class="table-container"><table class="washin-table ag-table">
      <thead><tr><th style="min-width:150px;">Squadra</th>${head}</tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
    <p style="font-size:12px;color:var(--gray-500);margin-top:8px;">Gli interventi "In settimana" si fanno in un giorno qualsiasi della settimana. Trascina un intervento su un giorno, su "In settimana" o su un'altra squadra. Clicca per aprire la scheda completa.</p>`
}

// Menu per aggiungere un intervento a mano: contratti della squadra nella settimana (e poi tutti)
async function aggiungi(td) {
  const sq = _squadre.find(s => s.id === td.dataset.squadra)
  const d = td.dataset.giorno === 'S' ? 'S' : Number(td.dataset.giorno)
  const ordina = l => l.sort((a, b) => nomeContratto(a).localeCompare(nomeContratto(b), 'it', { numeric: true }))
  const suoi = ordina([...new Map([
    ..._assegn.filter(a => a.squadra_id === sq.id && a.contratti).map(a => [a.contratto_id, a.contratti]),
    ..._giri.filter(g => g.attivo && g.squadra_id === sq.id).flatMap(g => (g.giri_contratti || []).filter(r => r.contratti).map(r => [r.contratto_id, r.contratti])),
  ]).values()])
  const opzioniDi = lista => lista.flatMap(k => {
    const servizi = serviziUnici(k.contratti_servizi)
    return servizi.length ? servizi.map(s => ({ k, s })) : [{ k, s: null }]
  })
  const optHtml = l => l.length
    ? l.map((o, i) => `<option value="${i}">${esc(nomeContratto(o.k))}${o.s ? ' · ' + esc(etichettaServizio(o.s)) : ''}</option>`).join('')
    : '<option value="">Nessun contratto assegnato alla squadra o ai suoi giri</option>'
  let opzioni = opzioniDi(suoi)
  document.querySelector('.ag-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'ag-menu'
  menu.innerHTML = `
    <div style="font-size:12px;font-weight:600;margin-bottom:6px;">${esc(sq.nome)} · ${d === 'S' ? 'in settimana, senza giorno' : GIORNI[d] + ' ' + new Date(addDaysIso(_lun, d) + 'T12:00:00').getDate()}</div>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" data-m="straord" style="width:auto;"> Lavoro straordinario (anche contratti fuori giro)
    </label>
    <select class="form-input" style="font-size:12px;width:100%;">${optHtml(opzioni)}</select>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;">
      <button type="button" class="btn btn-secondary btn-sm" data-m="chiudi">Annulla</button>
      <button type="button" class="btn btn-primary btn-sm" data-m="ok" ${opzioni.length ? '' : 'disabled'}>Aggiungi</button>
    </div>`
  // Il menu sta sopra la pagina (position:fixed): la tabella scorre in orizzontale e lo taglierebbe
  document.body.appendChild(menu)
  const r = td.getBoundingClientRect()
  const w = 280
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'
  const h = menu.offsetHeight
  menu.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px'
  const chiudi = ev => {
    if (ev && ev.type === 'mousedown' && menu.contains(ev.target)) return
    menu.remove()
    document.removeEventListener('mousedown', chiudi, true)
    window.removeEventListener('scroll', chiudi, true)
  }
  setTimeout(() => {
    document.addEventListener('mousedown', chiudi, true)
    window.addEventListener('scroll', chiudi, true)
  })
  const sel = menu.querySelector('select')
  const okBtn = menu.querySelector('[data-m="ok"]')
  menu.querySelector('[data-m="straord"]').addEventListener('change', async e => {
    if (e.target.checked && !_tutti) {
      sel.innerHTML = '<option value="">Caricamento…</option>'
      const { data, error } = await supabase.from('contratti')
        .select('id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo)')
        .eq('stato', 'attivo')
      if (error) { showToast('Errore: ' + error.message, 'error'); e.target.checked = false }
      else _tutti = ordina(data || [])
    }
    // straordinario: prima i contratti della squadra, poi tutti gli altri attivi
    opzioni = opzioniDi(e.target.checked && _tutti ? [...suoi, ..._tutti.filter(k => !suoi.some(x => x.id === k.id))] : suoi)
    sel.innerHTML = optHtml(opzioni)
    okBtn.disabled = !opzioni.length
  })
  menu.addEventListener('click', async e => {
    e.stopPropagation()
    const m = e.target.closest('[data-m]')?.dataset.m
    if (m === 'chiudi') chiudi()
    if (m !== 'ok') return
    const o = opzioni[Number(sel.value)]
    if (!o) return
    const straord = menu.querySelector('[data-m="straord"]').checked
    chiudi()
    const { error } = await supabase.from('interventi').insert({
      contratto_id: o.k.id, servizio_id: o.s?.id || null, squadra_id: sq.id,
      data_pianificata: addDaysIso(_lun, d === 'S' ? 0 : d), senza_giorno: d === 'S', stato: 'pianificato',
      tipo_pulizia: straord ? 'straordinaria' : 'ordinaria',
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
  const sg = giorno === 'S'
  const data = sg ? (iv.senza_giorno ? iv.data_pianificata : _lun) : addDaysIso(_lun, giorno)
  if (iv.squadra_id === squadraId && iv.data_pianificata === data && !!iv.senza_giorno === sg) return
  const campi = { data_pianificata: data, senza_giorno: sg, squadra_id: squadraId }
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
      #agenda-squadre .ag-sett { background:#f0fdfa; }
      #agenda-squadre .ag-cella.over { background:#ccfbf1; }
      #agenda-squadre .ag-card { background:#fff; border:1px solid var(--gray-200); border-radius:6px; padding:4px 6px; margin-bottom:4px; font-size:11.5px; cursor:pointer; line-height:1.3; }
      #agenda-squadre .ag-card[draggable=true] { cursor:grab; }
      #agenda-squadre .ag-x { border:none; background:none; color:var(--gray-400); cursor:pointer; font-size:14px; line-height:1; padding:0 2px; width:auto; }
      #agenda-squadre .ag-x:hover { color:#b91c1c; }
      #agenda-squadre .ag-add { border:1px dashed var(--gray-300); background:none; border-radius:6px; width:100%; color:var(--gray-400); cursor:pointer; font-size:14px; padding:0; }
      #agenda-squadre .ag-add:hover { color:#0d9488; border-color:#0d9488; }
      .ag-menu { position:fixed; z-index:1000; width:280px; background:#fff; border:1px solid var(--gray-300); border-radius:8px; padding:10px; box-shadow:0 8px 24px rgba(0,0,0,.15); font-family:inherit; }
      #agenda-squadre .table-container { overflow-y:visible; }
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
      <p style="font-size:12px;color:var(--gray-500);margin:0 0 10px;">"Genera settimana" crea gli interventi dei <strong>giri</strong> (sezione Giri) nei loro giorni, con la squadra del giro (o quella che la copre temporaneamente). Per i contratti in nessun giro crea gli interventi che mancano secondo la frequenza dei servizi (es. 2 v/settimana, 1 v/mese) dei contratti assegnati a ogni squadra, nella colonna "In settimana" (senza giorno fisso); i servizi giornalieri vanno su ogni giorno del periodo di assegnazione. I servizi annuali, a richiesta e i lavori straordinari si aggiungono a mano con il +.</p>
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
    sposta(id, td.dataset.squadra, td.dataset.giorno === 'S' ? 'S' : Number(td.dataset.giorno))
  })
  griglia.addEventListener('dragend', () => { _drag = null; griglia.querySelectorAll('.ag-cella.over').forEach(x => x.classList.remove('over')) })

  document.querySelectorAll('a[data-target="agenda-squadre"], [data-sheet-target="agenda-squadre"]').forEach(a =>
    a.addEventListener('click', () => carica()))
  carica()
}

// Per i fogli ore: interventi pianificati in una settimana → Set "contratto|servizio|giorno" e "contratto||giorno"
export async function pianificatiSettimana(lun, { squadraId = null, operatoreId = null } = {}) {
  const dom = addDaysIso(lun, 6)
  let q = supabase.from('interventi').select('contratto_id, servizio_id, data_pianificata, senza_giorno, squadra_id, operatore_id, operatore2_id')
    .gte('data_pianificata', lun).lte('data_pianificata', dom).neq('stato', 'annullato')
  const ors = []
  if (squadraId) ors.push(`squadra_id.eq.${squadraId}`)
  if (operatoreId) ors.push(`operatore_id.eq.${operatoreId}`, `operatore2_id.eq.${operatoreId}`)
  if (ors.length) q = q.or(ors.join(','))
  const { data, error } = await q
  if (error) { console.warn(error.message); return new Set() }
  const out = new Set()
  for (const iv of data || []) {
    // senza giorno: previsto in tutta la settimana (lun-sab)
    const giorni = iv.senza_giorno ? [0, 1, 2, 3, 4, 5]
      : [Math.round((new Date(iv.data_pianificata + 'T12:00:00') - new Date(lun + 'T12:00:00')) / 86400000)]
    for (const d of giorni) {
      out.add(`${iv.contratto_id}|${iv.servizio_id || ''}|${d}`)
      out.add(`${iv.contratto_id}||${d}`)
    }
  }
  return out
}
