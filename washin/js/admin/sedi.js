import supabase from '../supabase.js'
import { showToast } from './clienti.js'

// ── Geocoding live check ──────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}

let _geoAbortCtrl = null

async function nominatimSearch(query) {
  if (_geoAbortCtrl) _geoAbortCtrl.abort()
  _geoAbortCtrl = new AbortController()
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Italia')}&format=json&limit=1&accept-language=it&addressdetails=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'WashIN/1.0' }, signal: _geoAbortCtrl.signal })
    const data = await res.json()
    _geoAbortCtrl = null
    if (!data.length) return null
    const a = data[0]
    const ad = a.address || {}
    const road = ad.road || ad.pedestrian || ad.footway || ''
    const num = ad.house_number || ''
    const cap = ad.postcode || ''
    const city = ad.city || ad.town || ad.village || ad.municipality || ''
    const prov = (ad.county || '').replace(/Provincia (di |del |della |dell')/i, '').slice(0, 2).toUpperCase() || 'SV'
    const clean = [road + (num ? ' ' + num : ''), [cap, city, prov].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    return { lat: parseFloat(a.lat), lng: parseFloat(a.lon), displayName: clean || a.display_name }
  } catch(err) {
    if (err.name !== 'AbortError') console.warn('Nominatim:', err)
    return null
  }
}

async function runGeoCheck(address) {
  const t = address?.trim()
  if (!t || t.length < 6) return null
  const exact = await nominatimSearch(t)
  if (exact) return { found: true, ...exact }
  // Fallback: rimuovi il numero civico e riprova
  const m = t.match(/^(.*?)\s+\d+[A-Za-z]?\s*,(.*)$/)
  if (m) {
    const noNum = (m[1] + ', ' + m[2]).replace(/,\s*,/, ',').trim()
    const fallback = await nominatimSearch(noNum)
    if (fallback) return { found: false, suggestion: fallback.displayName, ...fallback }
  }
  return null
}

export async function loadSedi(filtri = {}) {
  try {
    let q = supabase.from('sedi_cliente').select('*, contratti(numero_contratto, clienti(ragione_sociale))')
    if (filtri.contratto_id) q = q.eq('contratto_id', filtri.contratto_id)
    if (filtri.cliente_id) q = q.eq('cliente_id', filtri.cliente_id)
    const { data, error } = await q.order('nome_sede', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    showToast('Errore caricamento sedi', 'error')
    console.error(err)
    return []
  }
}

function createSedeRow(s) {
  const contratto = s.contratti?.numero_contratto || '-'
  const cliente = s.contratti?.clienti?.ragione_sociale || '-'
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td>${s.nome_sede || '-'}</td>
    <td>${cliente}</td>
    <td>${contratto}</td>
    <td>${s.indirizzo || '-'}</td>
    <td>${s.piano || '-'}</td>
    <td>${s.mq_totali ?? '-'}</td>
    <td style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" data-action="edit-sede" data-id="${s.id}">Modifica</button>
      <button class="btn btn-sm btn-secondary" data-action="storico-sede" data-id="${s.id}" data-nome="${s.nome_sede || ''}">Storico</button>
    </td>
  `
  return tr
}

const STORICO_BADGE = { pianificato:'badge-warning', in_corso:'badge-info', completato:'badge-success', approvato:'badge-success', annullato:'badge-danger' }

export async function openStoricSede(sedeId, sedeName) {
  try {
    const modal = document.getElementById('storico-sede-modal')
    if (!modal) return
    const title = document.getElementById('storico-sede-title')
    if (title) title.textContent = `Storico — ${sedeName}`
    const tbody = document.getElementById('storico-sede-body')
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;">Caricamento...</td></tr>'
    modal.classList.add('active')

    const { data, error } = await supabase.from('interventi')
      .select('*, operatore:profili!operatore_id(nome,cognome)')
      .eq('sede_id', sedeId)
      .order('data_pianificata', { ascending: false })
      .limit(60)
    if (error) throw error

    if (!tbody) return
    if (!data?.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun intervento registrato</td></tr>'
      return
    }
    tbody.innerHTML = ''
    data.forEach(iv => {
      const tr = document.createElement('tr')
      const op = iv.operatore ? `${iv.operatore.nome || ''} ${iv.operatore.cognome || ''}`.trim() : '-'
      const badge = STORICO_BADGE[iv.stato] || 'badge-warning'
      tr.innerHTML = `
        <td>${iv.data_pianificata}</td>
        <td>${op}</td>
        <td>${iv.tipo_pulizia || '-'}</td>
        <td><span class="badge ${badge}">${iv.stato}</span></td>
      `
      tbody.appendChild(tr)
    })
  } catch (err) {
    showToast('Errore caricamento storico sede', 'error')
    console.error(err)
  }
}

export function renderTabellaSedi(sedi) {
  try {
    const tbody = document.getElementById('sedi-table-body')
    if (!tbody) return
    tbody.innerHTML = ''
    if (!sedi.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">Nessuna sede</td></tr>'
      return
    }
    sedi.forEach(s => tbody.appendChild(createSedeRow(s)))
  } catch (err) {
    showToast('Errore render sedi', 'error')
    console.error(err)
  }
}

async function populateContrattiSelect(selectEl, selectedId = null) {
  const { data, error } = await supabase
    .from('contratti')
    .select('id, numero_contratto, clienti(ragione_sociale)')
    .eq('stato', 'attivo')
    .order('numero_contratto')
  if (error) return
  selectEl.innerHTML = '<option value="">-- Seleziona contratto --</option>'
  ;(data || []).forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = `${c.numero_contratto || c.id.slice(0,8)} — ${c.clienti?.ragione_sociale || ''}`
    if (selectedId && c.id === selectedId) opt.selected = true
    selectEl.appendChild(opt)
  })
}

export async function openModalSede(id = null, prefilledContrattoId = null) {
  try {
    const modal = document.getElementById('sede-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    const contrattoSelect = form.querySelector('[name="contratto_id"]')
    await populateContrattiSelect(contrattoSelect)

    if (id) {
      const { data, error } = await supabase.from('sedi_cliente').select('*').eq('id', id).single()
      if (error) throw error
      Object.entries(data).forEach(([k, v]) => {
        const el = form.querySelector(`[name="${k}"]`)
        if (el) el.value = v ?? ''
      })
      if (contrattoSelect && data.contratto_id) contrattoSelect.value = data.contratto_id
      form.dataset.sedeId = id
      modal.querySelector('h2').textContent = 'Modifica Sede'
    } else {
      form.reset()
      delete form.dataset.sedeId
      modal.querySelector('h2').textContent = 'Nuova Sede'
      if (prefilledContrattoId && contrattoSelect) contrattoSelect.value = prefilledContrattoId
    }
    // Resetta il feedback e, in modifica, rilancia il check sull'indirizzo esistente
    const _geoFb = document.getElementById('sede-indirizzo-geo-fb')
    if (_geoFb) _geoFb.innerHTML = ''
    form._geoResult = null
    if (id) {
      const _ind = form.querySelector('[name="indirizzo"]')
      if (_ind?.value) _ind.dispatchEvent(new Event('input'))
    }

    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal sede', 'error')
    console.error(err)
  }
}

export async function saveSede(formData) {
  try {
    const fields = {
      contratto_id: formData.contratto_id || null,
      nome_sede: formData.nome_sede || null,
      indirizzo: formData.indirizzo || null,
      piano: formData.piano || null,
      mq_totali: formData.mq_totali ? parseFloat(formData.mq_totali) : null,
      note_accesso: formData.note_accesso || null,
      lat: formData.lat ?? null,
      lng: formData.lng ?? null,
    }
    let error
    if (formData.id) {
      ;({ error } = await supabase.from('sedi_cliente').update(fields).eq('id', formData.id))
    } else {
      ;({ error } = await supabase.from('sedi_cliente').insert(fields))
    }
    if (error) throw error
    showToast('Sede salvata', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio sede', 'error')
    console.error(err)
    return null
  }
}

export function initSedi() {
  try {
    const addBtn = document.getElementById('add-sede-button')
    const modal = document.getElementById('sede-modal')
    const modalClose = modal?.querySelector('.btn-secondary')
    const form = modal?.querySelector('form')

    addBtn?.addEventListener('click', () => openModalSede())
    modalClose?.addEventListener('click', () => modal?.classList.remove('active'))

    if (form) {
      form.addEventListener('submit', async e => {
        e.preventDefault()
        const geoCoords = form._getGeoCoords?.()
        const payload = {
          id: form.dataset.sedeId || undefined,
          contratto_id: form.querySelector('[name="contratto_id"]').value,
          nome_sede: form.querySelector('[name="nome_sede"]').value,
          indirizzo: form.querySelector('[name="indirizzo"]').value,
          piano: form.querySelector('[name="piano"]').value,
          mq_totali: form.querySelector('[name="mq_totali"]').value,
          note_accesso: form.querySelector('[name="note_accesso"]').value,
          lat: geoCoords?.lat ?? null,
          lng: geoCoords?.lng ?? null,
        }
        await saveSede(payload)
        form.reset()
        delete form.dataset.sedeId
        modal.classList.remove('active')
        window.dispatchEvent(new Event('anagrafica:reload'))
        loadSedi().then(renderTabellaSedi)
      })
    }

    document.getElementById('storico-sede-close')?.addEventListener('click', () => {
      document.getElementById('storico-sede-modal')?.classList.remove('active')
    })

    document.addEventListener('click', async e => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      if (t.dataset.action === 'edit-sede' && t.dataset.id) {
        await openModalSede(t.dataset.id)
      }
      if (t.dataset.action === 'storico-sede' && t.dataset.id) {
        await openStoricSede(t.dataset.id, t.dataset.nome || '')
      }
    })

    // ── Geocoding live — setup una sola volta ─────────────────────────────
    if (form) {
      const indirizzoInput = form.querySelector('[name="indirizzo"]')
      if (indirizzoInput) {
        const geofb = document.createElement('div')
        geofb.id = 'sede-indirizzo-geo-fb'
        geofb.style.cssText = 'margin-top:6px;font-size:12px;min-height:20px;line-height:1.5;'
        indirizzoInput.parentNode?.insertBefore(geofb, indirizzoInput.nextSibling)

        indirizzoInput.addEventListener('input', debounce(async e => {
          const val = e.target.value?.trim()
          if (!val || val.length < 6) { geofb.innerHTML = ''; form._geoResult = null; return }
          geofb.innerHTML = '<span style="color:#6b7280;">⏳ Verifica indirizzo...</span>'
          const result = await runGeoCheck(val)
          form._geoResult = result
          if (!result) {
            geofb.innerHTML = '<span style="color:#dc2626;">✗ Indirizzo non trovato — controlla via e comune</span>'
          } else if (result.found) {
            geofb.innerHTML = `<span style="color:#059669;">✓ Verificato: <em style="font-style:normal;">${result.displayName}</em></span>`
          } else {
            geofb.innerHTML = `<span style="color:#d97706;">⚠ Civico non trovato — indirizzo più vicino:</span><br>
              <button type="button" class="geo-suggest-btn" style="margin-top:4px;padding:3px 10px;background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;font-size:11px;color:#92400e;cursor:pointer;">
                ↩ Usa "${result.displayName}"
              </button>`
            geofb.querySelector('.geo-suggest-btn')?.addEventListener('click', () => {
              indirizzoInput.value = result.displayName
              indirizzoInput.dispatchEvent(new Event('input'))
            })
          }
        }, 800))

        form._getGeoCoords = () => form._geoResult?.found
          ? { lat: form._geoResult.lat, lng: form._geoResult.lng }
          : null
      }
    }

    loadSedi().then(renderTabellaSedi)
  } catch (err) {
    showToast('Errore inizializzazione sedi', 'error')
    console.error(err)
  }
}
