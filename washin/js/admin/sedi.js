import supabase from '../supabase.js'
import { showToast } from './clienti.js'

// ── Geocoding live check ──────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}

let _gmLoadPromise = null

async function ensureGeocoder() {
  if (window.google?.maps?.Geocoder) return new window.google.maps.Geocoder()
  if (_gmLoadPromise) return _gmLoadPromise
  const key = window.GOOGLE_MAPS_KEY
  if (!key) return null
  _gmLoadPromise = new Promise(resolve => {
    const cb = '_gmsedi_' + Date.now()
    window[cb] = () => { _gmLoadPromise = null; resolve(new window.google.maps.Geocoder()) }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=${cb}&loading=async&libraries=marker`
    s.async = true
    s.onerror = () => { _gmLoadPromise = null; resolve(null) }
    document.head.appendChild(s)
  })
  return _gmLoadPromise
}


// Estrae il civico dall'indirizzo completo (supporta formati "Via X 5", "Via X, 5", "Via X, 5/A")
function extractInputNum(address) {
  const m = address.match(/[,\s]+(\d{1,4}[A-Za-z]?(?:\/\d{1,3})?)\s*(?:[,\s]|$)/)
  return m ? m[1].toUpperCase() : null
}

async function googleGeocodeAll(query) {
  const geocoder = await ensureGeocoder()
  if (!geocoder) return []
  return new Promise(resolve => {
    geocoder.geocode({ address: query + ', Italia', region: 'IT', language: 'it' }, (results, status) => {
      if (status === 'REQUEST_DENIED') { resolve([{ _denied: true }]); return }
      if (status !== 'OK' || !results?.length) { resolve([]); return }
      resolve(results.slice(0, 5).map(r => {
        const comps = r.address_components || []
        const get = (...types) => comps.find(c => types.every(t => c.types.includes(t)))?.long_name || ''
        const houseNumber = get('street_number') || null
        const road = get('route')
        const city = get('locality') || get('administrative_area_level_3') || get('administrative_area_level_2') || ''
        // Senza CAP: spesso Google lo sbaglia per frazioni italiane
        const streetOnly = road + (houseNumber ? ' ' + houseNumber : '')
        const displayName = [streetOnly, city].filter(Boolean).join(', ')
        // streetBase = solo via+città senza civico, per il click del suggerimento
        const streetBase = [road, city].filter(Boolean).join(', ')
        return {
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
          displayName: displayName || r.formatted_address,
          streetBase,
          houseNumber,
        }
      }))
    })
  })
}

async function runGeoCheck(address) {
  const t = address?.trim()
  if (!t || t.length < 6) return null
  const inputNum = extractInputNum(t)
  const all = await googleGeocodeAll(t)
  if (!all.length) return null
  if (all[0]?._denied) return { _denied: true }
  const best = all[0]
  const returnedNum = best.houseNumber?.toUpperCase() || null
  const civicOk = !inputNum || (!!returnedNum && (
    returnedNum === inputNum || returnedNum.includes(inputNum)
  ))
  return { found: true, civicOk, inputNum, candidates: all, ...best }
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
      interno: formData.interno || null,
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
          interno: form.querySelector('[name="interno"]').value || null,
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
          form._geoResult = (result && !result._denied) ? result : null

          const renderCandidates = (msg, color, candidates) => {
            // data-base = via+città senza civico: l'utente aggiunge il suo numero
            const btns = (candidates || []).map(c =>
              `<button type="button" class="geo-suggest-btn"
                data-base="${(c.streetBase || c.displayName).replace(/"/g,'&quot;')}"
                data-label="${c.displayName.replace(/"/g,'&quot;')}"
                style="margin:3px 4px 0 0;padding:3px 10px;background:#f0f9ff;border:1px solid #93c5fd;border-radius:6px;font-size:11px;color:#1e40af;cursor:pointer;">
                ↩ ${c.displayName}
              </button>`
            ).join('')
            geofb.innerHTML = `<span style="color:${color};">${msg}</span>${btns ? '<br>' + btns : ''}`
            geofb.querySelectorAll('.geo-suggest-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                // Inserisce via+città senza civico e posiziona il cursore per aggiungere il numero
                indirizzoInput.value = btn.dataset.base + ' '
                indirizzoInput.focus()
                indirizzoInput.setSelectionRange(indirizzoInput.value.length, indirizzoInput.value.length)
                // Non rilancia subito la geocode: l'utente deve aggiungere il civico
                geofb.innerHTML = `<span style="color:#6b7280;">↩ Aggiungi il numero civico e attendi la verifica…</span>`
              })
            })
          }

          if (result?._denied) {
            geofb.innerHTML = '<span style="color:#dc2626;">✗ Chiave API Google non autorizzata — aggiungi <strong>https://loriscuba.github.io/*</strong> nelle restrizioni HTTP referrer (Google Cloud Console → Credenziali → modifica chiave API)</span>'
          } else if (!result) {
            geofb.innerHTML = '<span style="color:#dc2626;">✗ Indirizzo non trovato — controlla via e comune</span>'
          } else if (result.found && result.civicOk && result.inputNum) {
            geofb.innerHTML = `<span style="color:#059669;">✓ Via e civico verificati: <em style="font-style:normal;">${result.displayName}</em></span>`
          } else if (result.found && !result.inputNum) {
            renderCandidates(`ℹ Nessun civico nell'indirizzo — seleziona o aggiungi il numero:`, '#2563eb', result.candidates)
          } else {
            renderCandidates(`⚠ Civico <strong>${result.inputNum}</strong> non trovato — indirizzi simili:`, '#d97706', result.candidates)
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
