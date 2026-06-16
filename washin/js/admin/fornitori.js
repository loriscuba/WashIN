import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const EUR = n => n != null
  ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
  : '-'

const CAT_LABEL = {
  detergenza_chimica: 'Detergenza/chimici', materiali_consumo: 'Materiali di consumo',
  attrezzature: 'Attrezzature/macchinari', dpi_sicurezza: 'DPI/sicurezza',
  noleggio: 'Noleggio', manutenzione: 'Manutenzione/assistenza',
  divise: 'Divise/abbigliamento', altro: 'Altro',
}

const PAGAMENTO_LABEL = {
  immediato: 'Immediato', '30gg': '30 gg', '60gg': '60 gg', '90gg': '90 gg',
  rimessa_diretta: 'Rimessa diretta',
}

let _attivoFiltro = true

export async function loadFornitori(filtri = {}) {
  try {
    let query = supabase.from('fornitori').select('*').order('ragione_sociale', { ascending: true })
    if (filtri.attivo !== undefined) query = query.eq('attivo', filtri.attivo)
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento fornitori', 'error')
    console.error(err)
    return []
  }
}

function starsHtml(v) {
  if (!v) return '-'
  return '★'.repeat(v) + '☆'.repeat(5 - v)
}

function createFornitoreRow(f) {
  const tr = document.createElement('tr')
  const catLabel = CAT_LABEL[f.categoria] || f.categoria || '-'
  const pagLabel = PAGAMENTO_LABEL[f.termini_pagamento] || f.termini_pagamento || '-'

  tr.innerHTML = `
    <td>
      <strong>${f.ragione_sociale}</strong>
      <br><span style="font-size:11px;color:var(--gray-500);">${catLabel}</span>
    </td>
    <td style="font-size:13px;color:var(--gray-600);">
      ${f.referente || '-'}
      ${f.telefono ? `<br><span style="font-size:11px;color:var(--gray-400);">${f.telefono}</span>` : ''}
    </td>
    <td>${pagLabel}</td>
    <td>${f.tempi_consegna_giorni != null ? `${f.tempi_consegna_giorni} gg` : '-'}</td>
    <td>${f.ordine_minimo != null ? EUR(f.ordine_minimo) : '-'}</td>
    <td style="color:#d97706;">${starsHtml(f.valutazione)}</td>
    <td><span class="badge ${f.attivo ? 'badge-success' : 'badge-warning'}">${f.attivo ? 'Attivo' : 'Inattivo'}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="edit-fornitore" data-id="${f.id}">Modifica</button>
    </td>
  `
  return tr
}

export function renderTabellaFornitori(fornitori) {
  const tbody = document.getElementById('fornitori-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!fornitori.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun fornitore registrato</td></tr>'
    return
  }
  fornitori.forEach(f => tbody.appendChild(createFornitoreRow(f)))
}

export async function openModalFornitore(id = null) {
  try {
    const modal = document.getElementById('fornitore-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    if (id) {
      const { data, error } = await supabase.from('fornitori').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (!el) return
        if (el.type === 'checkbox') el.checked = Boolean(v)
        else el.value = v ?? ''
      })
      form.dataset.fornitoreId = id
      modal.querySelector('h2').textContent = 'Modifica Fornitore'
    } else {
      form.reset()
      delete form.dataset.fornitoreId
      modal.querySelector('h2').textContent = 'Nuovo Fornitore'
      const attivoEl = form.querySelector('[name="attivo"]')
      if (attivoEl) attivoEl.checked = true
    }
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal fornitore', 'error')
    console.error(err)
  }
}

export async function saveFornitore(payload) {
  try {
    const fields = {
      ragione_sociale: payload.ragione_sociale || null,
      piva: payload.piva || null,
      codice_fiscale: payload.codice_fiscale || null,
      categoria: payload.categoria || null,
      referente: payload.referente || null,
      email: payload.email || null,
      telefono: payload.telefono || null,
      indirizzo: payload.indirizzo || null,
      citta: payload.citta || null,
      cap: payload.cap || null,
      provincia: payload.provincia || null,
      iban: payload.iban || null,
      termini_pagamento: payload.termini_pagamento || null,
      tempi_consegna_giorni: payload.tempi_consegna_giorni !== '' && payload.tempi_consegna_giorni != null
        ? parseInt(payload.tempi_consegna_giorni, 10) : null,
      ordine_minimo: payload.ordine_minimo !== '' && payload.ordine_minimo != null
        ? parseFloat(payload.ordine_minimo) : null,
      sconto_concordato: payload.sconto_concordato !== '' && payload.sconto_concordato != null
        ? parseFloat(payload.sconto_concordato) : null,
      certificazioni: payload.certificazioni || null,
      valutazione: payload.valutazione !== '' && payload.valutazione != null
        ? parseInt(payload.valutazione, 10) : null,
      note: payload.note || null,
      attivo: Boolean(payload.attivo),
      updated_at: new Date().toISOString(),
    }
    let error
    if (payload.id) {
      ;({ error } = await supabase.from('fornitori').update(fields).eq('id', payload.id))
    } else {
      ;({ error } = await supabase.from('fornitori').insert(fields))
    }
    if (error) throw error
    showToast('Fornitore salvato', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio fornitore', 'error')
    console.error(err)
    return null
  }
}

function reload() {
  return loadFornitori(_attivoFiltro === null ? {} : { attivo: _attivoFiltro }).then(renderTabellaFornitori)
}

export function initFornitori() {
  try {
    const addBtn = document.getElementById('add-fornitore-button')
    const modal = document.getElementById('fornitore-modal')
    const cancelBtn = document.getElementById('fornitore-cancel')
    const form = modal?.querySelector('form')

    addBtn?.addEventListener('click', () => openModalFornitore())
    cancelBtn?.addEventListener('click', () => modal?.classList.remove('active'))

    document.querySelectorAll('.fornitori-attivo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.attivo
        _attivoFiltro = val === '' ? null : val === 'true'
        document.querySelectorAll('.fornitori-attivo-btn').forEach(b => {
          const active = b.dataset.attivo === btn.dataset.attivo
          b.style.background = active ? '#0d9488' : '#fff'
          b.style.color = active ? '#fff' : '#6b7280'
        })
        reload()
      })
    })

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)
        const payload = {
          id: form.dataset.fornitoreId || undefined,
          ragione_sociale: fd.get('ragione_sociale'),
          piva: fd.get('piva'),
          codice_fiscale: fd.get('codice_fiscale'),
          categoria: fd.get('categoria'),
          referente: fd.get('referente'),
          email: fd.get('email'),
          telefono: fd.get('telefono'),
          indirizzo: fd.get('indirizzo'),
          citta: fd.get('citta'),
          cap: fd.get('cap'),
          provincia: fd.get('provincia'),
          iban: fd.get('iban'),
          termini_pagamento: fd.get('termini_pagamento'),
          tempi_consegna_giorni: fd.get('tempi_consegna_giorni'),
          ordine_minimo: fd.get('ordine_minimo'),
          sconto_concordato: fd.get('sconto_concordato'),
          certificazioni: fd.get('certificazioni'),
          valutazione: fd.get('valutazione'),
          note: fd.get('note'),
          attivo: form.querySelector('[name="attivo"]').checked,
        }
        await saveFornitore(payload)
        modal.classList.remove('active')
        reload()
      })
    }

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-fornitore' && t.dataset.id) {
        await openModalFornitore(t.dataset.id)
      }
    })

    reload()
  } catch (err) {
    showToast('Errore inizializzazione fornitori', 'error')
    console.error(err)
  }
}
