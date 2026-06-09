import supabase from '../supabase.js'
import { loadMagazzino } from '../admin/magazzino.js'

function createToastContainer() {
  let container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.style.position = 'fixed'
    container.style.right = '20px'
    container.style.bottom = '20px'
    container.style.display = 'grid'
    container.style.gap = '10px'
    container.style.zIndex = '9999'
    document.body.appendChild(container)
  }
  return container
}

function showToast(message, type = 'success') {
  const container = createToastContainer()
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.padding = '12px 16px'
  toast.style.borderRadius = '12px'
  toast.style.boxShadow = '0 10px 24px rgba(0,0,0,0.12)'
  toast.style.color = '#fff'
  toast.style.opacity = '0'
  toast.style.transform = 'translateY(10px)'
  toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
  toast.style.maxWidth = '320px'
  toast.style.fontSize = '14px'
  toast.style.background = type === 'error' ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#0D9488'
  container.appendChild(toast)
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0)'
  })
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(10px)'
    toast.addEventListener('transitionend', () => toast.remove(), { once: true })
  }, 3000)
}

const VOCI_DEFAULT = [
  { label: 'Pulizia Scale', checked: false },
  { label: 'Pulizia Portone', checked: false },
  { label: 'Pulizia Box', checked: false }
]

let currentInterventoId = null
let currentTemplateId = null
let currentChecklistId = null
let _prodottiMagazzino = []

function addMaterialeRowOperatore(m = {}) {
  const list = document.getElementById('checklist-materiali-list')
  if (!list) return
  const row = document.createElement('div')
  row.className = 'materiale-row'
  row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 80px 32px;gap:6px;align-items:center;'

  const selectProdotto = document.createElement('select')
  selectProdotto.className = 'form-control'
  selectProdotto.style.cssText = 'font-size:13px;padding:6px 8px;'
  selectProdotto.innerHTML = '<option value="">— Prodotto —</option>'
  _prodottiMagazzino.forEach(p => {
    const opt = document.createElement('option')
    opt.value = p.nome
    opt.textContent = p.nome
    opt.dataset.unita = p.unita_misura || ''
    if (m.prodotto && p.nome === m.prodotto) opt.selected = true
    selectProdotto.appendChild(opt)
  })

  const inputQta = document.createElement('input')
  inputQta.type = 'number'
  inputQta.min = '0'
  inputQta.step = 'any'
  inputQta.placeholder = 'Qtà'
  inputQta.className = 'form-control'
  inputQta.style.cssText = 'font-size:13px;padding:6px 8px;'
  if (m.quantita != null) inputQta.value = m.quantita

  const inputUnita = document.createElement('input')
  inputUnita.type = 'text'
  inputUnita.placeholder = 'Um'
  inputUnita.className = 'form-control'
  inputUnita.style.cssText = 'font-size:13px;padding:6px 8px;'
  if (m.unita) inputUnita.value = m.unita

  selectProdotto.addEventListener('change', () => {
    const opt = selectProdotto.selectedOptions[0]
    if (opt?.dataset.unita) inputUnita.value = opt.dataset.unita
  })

  const btnRimuovi = document.createElement('button')
  btnRimuovi.type = 'button'
  btnRimuovi.textContent = '×'
  btnRimuovi.style.cssText = 'background:none;border:none;color:#ef4444;font-size:18px;cursor:pointer;line-height:1;padding:0;'
  btnRimuovi.dataset.action = 'remove-materiale'

  row.appendChild(selectProdotto)
  row.appendChild(inputQta)
  row.appendChild(inputUnita)
  row.appendChild(btnRimuovi)
  list.appendChild(row)
}

async function loadMaterialiIntervento(interventoId) {
  try {
    const { data, error } = await supabase
      .from('materiali_intervento')
      .select('*')
      .eq('intervento_id', interventoId)
    if (error) throw error
    return data || []
  } catch (err) {
    console.error(err)
    return []
  }
}

async function saveMaterialiOperatore(interventoId) {
  try {
    const list = document.getElementById('checklist-materiali-list')
    if (!list) return
    const rows = Array.from(list.querySelectorAll('.materiale-row'))
    const materiali = rows.map(row => {
      const selects = row.querySelectorAll('select, input')
      return {
        intervento_id: interventoId,
        prodotto: selects[0]?.value || '',
        quantita: parseFloat(selects[1]?.value) || null,
        unita: selects[2]?.value || ''
      }
    }).filter(r => r.prodotto)

    await supabase.from('materiali_intervento').delete().eq('intervento_id', interventoId)
    if (materiali.length > 0) {
      const { error } = await supabase.from('materiali_intervento').insert(materiali)
      if (error) throw error
    }
  } catch (err) {
    console.error('Errore salvataggio materiali:', err)
  }
}

function normalizeVoci(voci) {
  if (Array.isArray(voci)) {
    return voci.map((text) => ({ label: text, checked: false }))
  }
  if (typeof voci === 'object' && voci !== null) {
    return Object.entries(voci).map(([label, checked]) => ({ label, checked: !!checked }))
  }
  return []
}

export function aggiornaPct(voci) {
  const totale = voci.length
  const complete = voci.filter((item) => item.checked).length
  const pct = totale ? Math.round((complete / totale) * 100) : 0
  const badge = document.getElementById('checklist-progress')
  if (badge) badge.textContent = `${pct}%`
  const bar = document.getElementById('checklist-progress-bar')
  if (bar) bar.style.width = `${pct}%`
  return pct
}

function renderChecklistItems(voci) {
  const container = document.getElementById('checklist-items')
  if (!container) return
  container.innerHTML = ''
  voci.forEach((item, index) => {
    const label = document.createElement('label')
    label.className = `cl-item${item.checked ? ' done' : ''}`

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = !!item.checked
    checkbox.dataset.index = String(index)

    const span = document.createElement('span')
    span.className = 'cl-label'
    span.textContent = item.label

    label.appendChild(checkbox)
    label.appendChild(span)
    container.appendChild(label)
  })
}

async function loadTemplate(tipoPulizia) {
  if (!tipoPulizia) return { id: null, voci: [] }
  const { data, error } = await supabase
    .from('checklist_template')
    .select('*')
    .eq('tipo_pulizia', tipoPulizia)
    .eq('attivo', true)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const template = (data && data[0]) || null
  return template ? { id: template.id, voci: template.voci || [] } : { id: null, voci: [] }
}

async function loadIntervento(interventoId) {
  const { data, error } = await supabase
    .from('interventi')
    .select('*, sedi_cliente(nome_sede,indirizzo,clienti(ragione_sociale))')
    .eq('id', interventoId)
    .single()
  if (error) throw error
  return data
}

export async function loadChecklistPerIntervento(interventoId) {
  try {
    currentInterventoId = interventoId
    const intervento = await loadIntervento(interventoId)
    if (!intervento) {
      showToast('Intervento non trovato', 'error')
      return null
    }

    const cliente = intervento.sedi_cliente?.clienti?.ragione_sociale || 'Cliente'
    // Fix timezone: aggiungi T00:00:00 per evitare shift UTC
    const dataFmt = intervento.data_pianificata
      ? new Date(intervento.data_pianificata + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
    const titleEl = document.getElementById('checklist-title')
    if (titleEl) titleEl.textContent = `${cliente} — ${dataFmt}`

    const { data: compiled, error: compiledError } = await supabase
      .from('checklist_compilate')
      .select('*')
      .eq('intervento_id', interventoId)
      .maybeSingle()
    if (compiledError) throw compiledError

    let voci = []
    if (compiled && compiled.voci_compilate) {
      currentChecklistId = compiled.id
      voci = normalizeVoci(compiled.voci_compilate)
      currentTemplateId = compiled.template_id
      const notesEl = document.getElementById('checklist-notes')
      if (notesEl) notesEl.value = compiled.note || ''
    } else {
      const template = await loadTemplate(intervento.tipo_pulizia)
      currentTemplateId = template.id
      currentChecklistId = null
      const templateVoci = normalizeVoci(template.voci)
      voci = templateVoci.length > 0 ? templateVoci : VOCI_DEFAULT.map(v => ({ ...v }))
      const notesEl = document.getElementById('checklist-notes')
      if (notesEl) notesEl.value = ''
    }

    renderChecklistItems(voci)
    aggiornaPct(voci)

    _prodottiMagazzino = await loadMagazzino({ attivo: true }).catch(() => [])
    const materialiList = document.getElementById('checklist-materiali-list')
    if (materialiList) {
      materialiList.innerHTML = ''
      const materialiEsistenti = await loadMaterialiIntervento(interventoId)
      materialiEsistenti.forEach(m => addMaterialeRowOperatore(m))
    }

    return voci
  } catch (error) {
    showToast('Errore caricamento checklist', 'error')
    console.error(error)
    return []
  }
}

function gatherChecklistItems() {
  const container = document.getElementById('checklist-items')
  if (!container) return []
  return Array.from(container.querySelectorAll('input[type="checkbox"]')).map((input) => ({
    label: input.nextElementSibling?.textContent || '',
    checked: input.checked
  }))
}

export async function saveChecklist(interventoId, voci, note, definitivo = false) {
  try {
    if (!interventoId) {
      showToast('Intervento non impostato', 'error')
      return null
    }
    const completamento_pct = aggiornaPct(voci)
    const voci_compilate = voci.reduce((acc, item) => {
      acc[item.label] = !!item.checked
      return acc
    }, {})

    let savedData = null

    if (currentChecklistId) {
      // Aggiorna riga esistente per ID
      const { data, error } = await supabase
        .from('checklist_compilate')
        .update({
          voci_compilate,
          completamento_pct,
          note: note || '',
          template_id: currentTemplateId || null
        })
        .eq('id', currentChecklistId)
        .select()
        .single()
      if (error) throw error
      savedData = data
    } else {
      // Prima scrittura: upsert per intervento_id (evita duplicati)
      const { data, error } = await supabase
        .from('checklist_compilate')
        .upsert({
          intervento_id: interventoId,
          template_id: currentTemplateId || null,
          voci_compilate,
          completamento_pct,
          note: note || ''
        }, { onConflict: 'intervento_id' })
        .select()
        .single()
      if (error) throw error
      savedData = data
      if (savedData?.id) currentChecklistId = savedData.id
    }

    await saveMaterialiOperatore(interventoId)

    if (definitivo) {
      // Segna completato e salva orario di fine effettivo
      const { error: updateError } = await supabase
        .from('interventi')
        .update({
          stato: 'completato',
          fine_effettivo: new Date().toISOString()
        })
        .eq('id', interventoId)
      if (updateError) throw updateError
      showToast('Intervento completato', 'success')
      window.dispatchEvent(new CustomEvent('checklist:completata'))
    } else {
      showToast('Bozza salvata', 'success')
    }

    return savedData
  } catch (error) {
    showToast('Errore salvataggio checklist', 'error')
    console.error(error)
    return null
  }
}

export function initChecklist() {
  const container = document.getElementById('checklist-items')
  const saveBtn = document.getElementById('checklist-save-draft')
  const submitBtn = document.getElementById('checklist-submit')
  const notesEl = document.getElementById('checklist-notes')
  const addMaterialeBtn = document.getElementById('checklist-add-materiale')
  const materialiList = document.getElementById('checklist-materiali-list')

  container?.addEventListener('change', (e) => {
    const cb = e.target
    if (cb.type === 'checkbox') cb.closest('.cl-item')?.classList.toggle('done', cb.checked)
    const voci = gatherChecklistItems()
    aggiornaPct(voci)
  })

  addMaterialeBtn?.addEventListener('click', () => addMaterialeRowOperatore())

  materialiList?.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'remove-materiale') {
      e.target.closest('.materiale-row')?.remove()
    }
  })

  saveBtn?.addEventListener('click', async () => {
    const voci = gatherChecklistItems()
    const note = notesEl?.value || ''
    await saveChecklist(currentInterventoId, voci, note, false)
  })

  submitBtn?.addEventListener('click', async () => {
    const voci = gatherChecklistItems()
    const note = notesEl?.value || ''
    await saveChecklist(currentInterventoId, voci, note, true)
  })
}
