// Menu pubblico: letto dai clienti tramite QR code (?t=<tavolo>)
import { supabase, esc, euro } from './sb.js'

const $ = id => document.getElementById(id)

const tavolo = new URLSearchParams(location.search).get('t')
if (tavolo) {
  $('table-badge').textContent = `Tavolo ${tavolo.slice(0, 30)}`
  $('table-badge').classList.remove('hidden')
}

// Raggruppa le voci con lo stesso nome e una variante (es. Piccolo / Grande) in un'unica riga
function groupVariants(prodotti) {
  const out = []
  for (const p of prodotti) {
    const last = out[out.length - 1]
    if (p.variante && last && last.nome === p.nome && last.varianti) {
      last.varianti.push(p)
      last.surgelato ||= p.surgelato
      last.descrizione ||= p.descrizione
    } else if (p.variante) {
      out.push({ ...p, varianti: [p] })
    } else {
      out.push(p)
    }
  }
  return out
}

function renderItem(p) {
  const star = p.surgelato ? '<span class="star" title="Prodotto surgelato">*</span>' : ''
  const price = p.varianti
    ? `<div class="variants">${p.varianti.map(v => `<span><small>${esc(v.variante)}</small>${euro(v.prezzo)}</span>`).join('')}</div>`
    : `<div class="item-price">${euro(p.prezzo)}</div>`
  return `<div class="item">
    <div>
      <div class="item-name">${esc(p.nome)}${star}</div>
      ${p.descrizione ? `<div class="item-desc">${esc(p.descrizione)}</div>` : ''}
    </div>
    ${price}
  </div>`
}

async function load() {
  const [imp, cat, prod] = await Promise.all([
    supabase.from('bar_impostazioni').select('*').eq('id', 1).maybeSingle(),
    supabase.from('bar_categorie').select('id,nome,ordine').eq('attiva', true).order('ordine').order('nome'),
    supabase.from('bar_prodotti').select('id,categoria_id,nome,variante,descrizione,prezzo,surgelato,ordine')
      .eq('disponibile', true).order('ordine').order('nome'),
  ])
  const err = imp.error || cat.error || prod.error
  if (err) throw err

  const s = imp.data || {}
  if (s.nome_bar) { $('bar-name').textContent = s.nome_bar; document.title = `Menu · ${s.nome_bar}` }
  $('bar-sub').textContent = s.sottotitolo || ''
  $('foot').textContent = s.nota_piede || ''

  const byCat = new Map(cat.data.map(c => [c.id, []]))
  for (const p of prod.data) byCat.get(p.categoria_id)?.push(p)
  const cats = cat.data.filter(c => byCat.get(c.id).length)

  if (!cats.length) {
    $('menu').innerHTML = '<p class="state muted">Il menu non è ancora disponibile.</p>'
    return
  }

  $('cat-chips').innerHTML = cats.map(c => `<a class="chip" href="#c-${c.id}" data-id="${c.id}">${esc(c.nome)}</a>`).join('')
  $('cat-nav').classList.remove('hidden')
  $('menu').innerHTML = cats.map(c => `<section class="cat" id="c-${c.id}">
    <h2>${esc(c.nome)}</h2>
    <div class="items">${groupVariants(byCat.get(c.id)).map(renderItem).join('')}</div>
  </section>`).join('')

  // Evidenzia la categoria visibile nella barra in alto
  const chips = [...document.querySelectorAll('.chip')]
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      chips.forEach(ch => ch.classList.toggle('active', ch.dataset.id === e.target.id.slice(2)))
      const active = chips.find(ch => ch.classList.contains('active'))
      active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
  }, { rootMargin: '-70px 0px -70% 0px' })
  document.querySelectorAll('.cat').forEach(sec => io.observe(sec))
}

load().catch(e => {
  console.error(e)
  $('menu').innerHTML = '<p class="state muted">Impossibile caricare il menu. Riprova tra poco.</p>'
})
