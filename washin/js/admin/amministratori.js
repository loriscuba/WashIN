import supabase from '../supabase.js'
import { showToast } from './clienti.js'
import { openModalContratto } from './contratti.js'

let _all = []
let _search = ''
const _aperti = new Set()

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const nomeCondominio = c => c.nome_breve || c.ragione_sociale || '—'

async function load() {
  const { data, error } = await supabase
    .from('amministratori')
    .select('*, clienti(id, ragione_sociale, nome_breve, attivo, contratti(id, stato))')
    .order('nome')
  if (error) {
    showToast('Errore caricamento amministratori', 'error')
    console.error(error)
    return []
  }
  return (data || []).map(a => ({
    ...a,
    clienti: (a.clienti || []).sort((x, y) => nomeCondominio(x).localeCompare(nomeCondominio(y), 'it', { numeric: true })),
  }))
}

function render() {
  const tbody = document.getElementById('amministratori-table-body')
  if (!tbody) return
  const q = _search.trim().toLowerCase()
  const rows = _all.filter(a => !q ||
    [a.nome, a.referente, a.email, a.pec, a.telefono].some(v => (v || '').toLowerCase().includes(q)) ||
    a.clienti.some(c => nomeCondominio(c).toLowerCase().includes(q)))

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun amministratore trovato.</td></tr>'
    return
  }
  tbody.innerHTML = rows.map(a => {
    const aperto = _aperti.has(a.id) || (q && a.clienti.some(c => nomeCondominio(c).toLowerCase().includes(q)))
    const contatti = [a.email, a.pec && `PEC ${a.pec}`].filter(Boolean).map(esc).join('<br>')
    const condomini = a.clienti.map(c => {
      const contratto = (c.contratti || []).find(k => k.stato === 'attivo') || (c.contratti || [])[0]
      return contratto
        ? `<button type="button" class="btn btn-sm btn-secondary" data-action="amm-apri-contratto" data-id="${contratto.id}" style="margin:2px;">${esc(nomeCondominio(c))}</button>`
        : `<span class="badge" style="margin:2px;">${esc(nomeCondominio(c))}</span>`
    }).join('')
    return `
      <tr>
        <td style="font-weight:600;">${esc(a.nome)}</td>
        <td>${esc(a.referente || '-')}</td>
        <td>${esc(a.telefono || '-')}</td>
        <td style="font-size:12px;">${contatti || '-'}</td>
        <td>
          <button type="button" class="btn btn-sm btn-secondary" data-action="amm-toggle" data-id="${a.id}">
            ${a.clienti.length} ${aperto ? '▲' : '▼'}
          </button>
        </td>
        <td><button type="button" class="btn btn-sm btn-secondary" data-action="amm-edit" data-id="${a.id}">Modifica</button></td>
      </tr>
      ${aperto ? `<tr><td colspan="6" style="background:var(--gray-50,#f9fafb);">
        ${condomini || '<span style="color:var(--gray-500);font-size:12px;">Nessun condominio collegato.</span>'}
      </td></tr>` : ''}`
  }).join('')
}

async function reload() {
  _all = await load()
  render()
}

function openModal(id = null) {
  const modal = document.getElementById('amministratore-modal')
  const form = modal?.querySelector('form')
  if (!form) return
  form.reset()
  delete form.dataset.id
  if (id) {
    const a = _all.find(x => x.id === id)
    if (a) Object.entries(a).forEach(([k, v]) => {
      const el = form.querySelector(`[name="${k}"]`)
      if (el) el.value = v ?? ''
    })
    form.dataset.id = id
  }
  modal.querySelector('h2').textContent = id ? 'Modifica amministratore' : 'Nuovo amministratore'
  modal.classList.add('active')
}

export function initAmministratori() {
  const modal = document.getElementById('amministratore-modal')
  const form = modal?.querySelector('form')

  document.getElementById('add-amministratore-button')?.addEventListener('click', () => openModal())
  document.getElementById('amministratori-search')?.addEventListener('input', e => { _search = e.target.value; render() })
  modal?.querySelector('[data-action="close-amministratore"]')?.addEventListener('click', () => modal.classList.remove('active'))

  document.getElementById('amministratori-table-body')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-action]')
    if (!b) return
    const id = b.dataset.id
    if (b.dataset.action === 'amm-toggle') {
      _aperti.has(id) ? _aperti.delete(id) : _aperti.add(id)
      render()
    } else if (b.dataset.action === 'amm-edit') {
      openModal(id)
    } else if (b.dataset.action === 'amm-apri-contratto') {
      await openModalContratto(id)
    }
  })

  form?.addEventListener('submit', async e => {
    e.preventDefault()
    const fields = {}
    ;['nome', 'referente', 'telefono', 'email', 'pec', 'indirizzo', 'citta', 'note'].forEach(k => {
      fields[k] = form.querySelector(`[name="${k}"]`)?.value.trim() || null
    })
    if (!fields.nome) { showToast('Inserisci il nome', 'error'); return }
    const { error } = form.dataset.id
      ? await supabase.from('amministratori').update(fields).eq('id', form.dataset.id)
      : await supabase.from('amministratori').insert(fields)
    if (error) {
      showToast(error.code === '23505' ? 'Esiste già un amministratore con questo nome' : 'Errore salvataggio amministratore', 'error')
      console.error(error)
      return
    }
    showToast('Amministratore salvato', 'success')
    modal.classList.remove('active')
    reload()
  })

  // Ricarica quando si apre la sezione o dopo modifiche a clienti/contratti
  document.querySelectorAll('[data-target="amministratori"]').forEach(el => el.addEventListener('click', () => reload()))
  window.addEventListener('anagrafica:reload', () => reload())
  reload()
}
