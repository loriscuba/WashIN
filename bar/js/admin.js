// Pannello gestione menu bar: prodotti, categorie, tavoli/QR, impostazioni
import { supabase, esc, euro } from './sb.js'

const $ = id => document.getElementById(id)
const state = { categorie: [], prodotti: [], tavoli: [], imp: {} }
const MENU_URL = new URL('./', location.href).href

function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2600)
}

function fail(error, msg = 'Operazione non riuscita') {
  console.error(error)
  toast(`${msg}: ${error.message || error}`)
}

// ---------- Auth ----------
async function checkAccess() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return showLogin()
  const { data: isAdmin, error } = await supabase.rpc('bar_is_admin')
  if (error) return showLogin(`Errore di verifica: ${error.message}`)
  if (!isAdmin) return showLogin('Questo account non ha il ruolo di amministratore.')
  $('login-view').classList.add('hidden')
  $('app-view').classList.remove('hidden')
  await loadAll()
}

function showLogin(msg = '') {
  $('app-view').classList.add('hidden')
  $('login-view').classList.remove('hidden')
  $('login-error').textContent = msg
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault()
  $('login-error').textContent = ''
  const { error } = await supabase.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value })
  if (error) return ($('login-error').textContent = 'Email o password non corretti.')
  checkAccess()
})

$('logout').addEventListener('click', async () => {
  await supabase.auth.signOut()
  showLogin()
})

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn))
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab))
}))

// ---------- Data ----------
async function loadAll() {
  const [c, p, t, i] = await Promise.all([
    supabase.from('bar_categorie').select('*').order('ordine').order('nome'),
    supabase.from('bar_prodotti').select('*').order('ordine').order('nome'),
    supabase.from('bar_tavoli').select('*').order('ordine').order('etichetta'),
    supabase.from('bar_impostazioni').select('*').eq('id', 1).maybeSingle(),
  ])
  const err = c.error || p.error || t.error || i.error
  if (err) return fail(err, 'Caricamento non riuscito')
  state.categorie = c.data
  state.prodotti = p.data
  state.tavoli = t.data
  state.imp = i.data || {}
  renderProdotti()
  renderCategorie()
  renderTavoli()
  renderImpostazioni()
}

// ---------- Prodotti ----------
function renderProdotti() {
  const q = $('prod-search').value.trim().toLowerCase()
  const html = state.categorie.map(c => {
    const items = state.prodotti.filter(p => p.categoria_id === c.id &&
      (!q || `${p.nome} ${p.variante || ''} ${p.descrizione || ''}`.toLowerCase().includes(q)))
    if (!items.length && q) return ''
    return `<div class="card">
      <h3>${esc(c.nome)}${c.attiva ? '' : ' <span class="muted">(nascosta)</span>'}</h3>
      ${items.map(p => `<div class="list-row ${p.disponibile ? '' : 'off'}">
        <label class="switch" title="Disponibile"><input type="checkbox" data-toggle="${p.id}" ${p.disponibile ? 'checked' : ''}><span></span></label>
        <div class="grow">
          <div class="item-name">${esc(p.nome)}${p.variante ? ` <span class="muted">· ${esc(p.variante)}</span>` : ''}${p.surgelato ? '<span class="star">*</span>' : ''}</div>
          ${p.descrizione ? `<div class="item-desc">${esc(p.descrizione)}</div>` : ''}
        </div>
        <div class="item-price">${euro(p.prezzo)}</div>
        <button class="btn sm" data-edit="${p.id}">Modifica</button>
      </div>`).join('') || '<p class="muted" style="font-size:.9rem">Nessun prodotto.</p>'}
    </div>`
  }).join('')
  $('prod-list').innerHTML = html || '<p class="muted">Nessun risultato.</p>'
}

$('prod-search').addEventListener('input', renderProdotti)

$('prod-list').addEventListener('change', async e => {
  const id = e.target.dataset.toggle
  if (!id) return
  const disponibile = e.target.checked
  const { error } = await supabase.from('bar_prodotti').update({ disponibile }).eq('id', id)
  if (error) { e.target.checked = !disponibile; return fail(error) }
  state.prodotti.find(p => p.id === id).disponibile = disponibile
  e.target.closest('.list-row').classList.toggle('off', !disponibile)
  toast(disponibile ? 'Prodotto visibile nel menu' : 'Prodotto nascosto dal menu')
})

$('prod-list').addEventListener('click', e => {
  const id = e.target.dataset.edit
  if (id) openProdotto(state.prodotti.find(p => p.id === id))
})

$('new-prod').addEventListener('click', () => openProdotto(null))
$('p-cancel').addEventListener('click', () => $('prod-dialog').close())

let editing = null
function openProdotto(p) {
  if (!state.categorie.length) return toast('Crea prima una categoria')
  editing = p
  $('prod-title').textContent = p ? 'Modifica prodotto' : 'Nuovo prodotto'
  $('p-cat').innerHTML = state.categorie.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')
  $('p-cat').value = p?.categoria_id || state.categorie[0].id
  $('p-nome').value = p?.nome || ''
  $('p-var').value = p?.variante || ''
  $('p-desc').value = p?.descrizione || ''
  $('p-prezzo').value = p?.prezzo ?? ''
  $('p-ordine').value = p?.ordine ?? ''
  $('p-surg').checked = !!p?.surgelato
  $('p-disp').checked = p ? p.disponibile : true
  $('p-del').classList.toggle('hidden', !p)
  $('prod-dialog').showModal()
}

$('prod-form').addEventListener('submit', async e => {
  e.preventDefault()
  const ordine = $('p-ordine').value === ''
    ? Math.max(0, ...state.prodotti.map(p => p.ordine)) + 1
    : parseInt($('p-ordine').value, 10)
  const row = {
    categoria_id: $('p-cat').value,
    nome: $('p-nome').value.trim(),
    variante: $('p-var').value.trim() || null,
    descrizione: $('p-desc').value.trim() || null,
    prezzo: Number($('p-prezzo').value),
    ordine,
    surgelato: $('p-surg').checked,
    disponibile: $('p-disp').checked,
  }
  const { error } = editing
    ? await supabase.from('bar_prodotti').update(row).eq('id', editing.id)
    : await supabase.from('bar_prodotti').insert(row)
  if (error) return fail(error, 'Salvataggio non riuscito')
  $('prod-dialog').close()
  toast('Prodotto salvato')
  loadAll()
})

$('p-del').addEventListener('click', async () => {
  if (!editing || !confirm(`Eliminare "${editing.nome}${editing.variante ? ' ' + editing.variante : ''}"?`)) return
  const { error } = await supabase.from('bar_prodotti').delete().eq('id', editing.id)
  if (error) return fail(error)
  $('prod-dialog').close()
  toast('Prodotto eliminato')
  loadAll()
})

// ---------- Categorie ----------
function renderCategorie() {
  $('cat-list').innerHTML = state.categorie.map(c => {
    const n = state.prodotti.filter(p => p.categoria_id === c.id).length
    return `<div class="list-row" data-cat="${c.id}">
      <input type="number" class="c-ordine" value="${c.ordine}" style="width:70px" title="Ordine">
      <input type="text" class="c-nome grow" value="${esc(c.nome)}">
      <label class="check" style="margin:0"><input type="checkbox" class="c-attiva" ${c.attiva ? 'checked' : ''}> Visibile</label>
      <span class="muted" style="font-size:.85rem;white-space:nowrap">${n} prod.</span>
      <button class="btn sm" data-save-cat>Salva</button>
      <button class="btn sm danger" data-del-cat ${n ? 'disabled title="Svuota prima la categoria"' : ''}>Elimina</button>
    </div>`
  }).join('') || '<p class="muted">Nessuna categoria.</p>'
}

$('cat-list').addEventListener('click', async e => {
  const row = e.target.closest('[data-cat]')
  if (!row) return
  const id = row.dataset.cat
  if (e.target.hasAttribute('data-save-cat')) {
    const upd = {
      nome: row.querySelector('.c-nome').value.trim(),
      ordine: parseInt(row.querySelector('.c-ordine').value, 10) || 0,
      attiva: row.querySelector('.c-attiva').checked,
    }
    if (!upd.nome) return toast('Il nome è obbligatorio')
    const { error } = await supabase.from('bar_categorie').update(upd).eq('id', id)
    if (error) return fail(error)
    toast('Categoria salvata')
    loadAll()
  } else if (e.target.hasAttribute('data-del-cat')) {
    if (!confirm('Eliminare questa categoria?')) return
    const { error } = await supabase.from('bar_categorie').delete().eq('id', id)
    if (error) return fail(error)
    toast('Categoria eliminata')
    loadAll()
  }
})

$('cat-form').addEventListener('submit', async e => {
  e.preventDefault()
  const nome = $('cat-new').value.trim()
  if (!nome) return
  const ordine = Math.max(0, ...state.categorie.map(c => c.ordine)) + 1
  const { error } = await supabase.from('bar_categorie').insert({ nome, ordine })
  if (error) return fail(error)
  $('cat-new').value = ''
  toast('Categoria aggiunta')
  loadAll()
})

// ---------- Tavoli e QR ----------
const tableUrl = etichetta => etichetta == null ? MENU_URL : `${MENU_URL}?t=${encodeURIComponent(etichetta)}`

function qrSvg(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount(), m = 4, size = n + m * 2
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#0F172A"/></svg>`
}

function qrCard(t) {
  const label = t ? `Tavolo ${esc(t.etichetta)}` : 'Menu'
  return `<div class="qr-card" data-tav="${t ? t.id : ''}">
    <div class="qr-bar">${esc(state.imp.nome_bar || 'Menu')}</div>
    <div class="qr-sub">Inquadra per vedere il menu</div>
    ${qrSvg(tableUrl(t?.etichetta))}
    <div class="qr-table">${label}</div>
    <div class="qr-tools">
      <button class="btn sm" data-png>PNG</button>
      <a class="btn sm" href="${esc(tableUrl(t?.etichetta))}" target="_blank" rel="noopener">Apri</a>
      ${t ? '<button class="btn sm danger" data-del-tav>Elimina</button>' : ''}
    </div>
  </div>`
}

function renderTavoli() {
  $('qr-url').textContent = MENU_URL
  const attivi = state.tavoli.filter(t => t.attivo)
  $('qr-grid').innerHTML = attivi.map(qrCard).join('') + qrCard(null)
}

async function addTavoli(etichette) {
  const esistenti = new Set(state.tavoli.map(t => t.etichetta))
  let ordine = Math.max(0, ...state.tavoli.map(t => t.ordine))
  const rows = etichette.filter(e => e && !esistenti.has(e)).map(etichetta => ({ etichetta, ordine: ++ordine }))
  if (!rows.length) return toast('Tavoli già presenti')
  const { error } = await supabase.from('bar_tavoli').insert(rows)
  if (error) return fail(error)
  toast(rows.length === 1 ? 'Tavolo aggiunto' : `${rows.length} tavoli aggiunti`)
  loadAll()
}

$('tav-form').addEventListener('submit', e => {
  e.preventDefault()
  addTavoli([$('tav-new').value.trim()])
  $('tav-new').value = ''
})

$('tav-range').addEventListener('submit', e => {
  e.preventDefault()
  const from = parseInt($('tav-from').value, 10), to = parseInt($('tav-to').value, 10)
  if (!(from >= 1 && to >= from && to - from < 200)) return toast('Intervallo non valido')
  addTavoli(Array.from({ length: to - from + 1 }, (_, i) => String(from + i)))
})

$('qr-grid').addEventListener('click', async e => {
  const card = e.target.closest('.qr-card')
  if (!card) return
  if (e.target.hasAttribute('data-del-tav')) {
    if (!confirm('Eliminare questo tavolo? Il QR già stampato continuerà a funzionare.')) return
    const { error } = await supabase.from('bar_tavoli').delete().eq('id', card.dataset.tav)
    if (error) return fail(error)
    loadAll()
  } else if (e.target.hasAttribute('data-png')) {
    downloadPng(card)
  }
})

// Esporta la card QR (nome bar + codice + tavolo) come PNG ad alta risoluzione
function downloadPng(card) {
  const svg = card.querySelector('svg').outerHTML
  const img = new Image()
  img.onload = () => {
    const W = 1000, H = 1300, canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#0F172A'; ctx.textAlign = 'center'
    ctx.font = '800 64px Inter, Arial, sans-serif'
    ctx.fillText(card.querySelector('.qr-bar').textContent, W / 2, 110)
    ctx.fillStyle = '#64748B'; ctx.font = '500 36px Inter, Arial, sans-serif'
    ctx.fillText('Inquadra per vedere il menu', W / 2, 170)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 100, 210, 800, 800)
    ctx.fillStyle = '#0F172A'; ctx.font = '800 96px Inter, Arial, sans-serif'
    const label = card.querySelector('.qr-table').textContent
    ctx.fillText(label, W / 2, 1150)
    const a = document.createElement('a')
    a.download = `qr-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

$('print-qr').addEventListener('click', () => {
  $('print-area').innerHTML = `<div class="qr-grid">${$('qr-grid').innerHTML}</div>`
  document.body.classList.add('printing-qr')
  window.print()
})
window.addEventListener('afterprint', () => document.body.classList.remove('printing-qr'))

// ---------- Impostazioni ----------
function renderImpostazioni() {
  $('imp-nome').value = state.imp.nome_bar || ''
  $('imp-sub').value = state.imp.sottotitolo || ''
  $('imp-nota').value = state.imp.nota_piede || ''
}

$('imp-form').addEventListener('submit', async e => {
  e.preventDefault()
  const row = {
    id: 1,
    nome_bar: $('imp-nome').value.trim(),
    sottotitolo: $('imp-sub').value.trim() || null,
    nota_piede: $('imp-nota').value.trim() || null,
  }
  const { error } = await supabase.from('bar_impostazioni').upsert(row)
  if (error) return fail(error)
  toast('Impostazioni salvate')
  loadAll()
})

checkAccess().catch(e => showLogin(`Errore: ${e.message}`))
