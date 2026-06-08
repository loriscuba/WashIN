import supabase from '../supabase.js'

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
  return pct
}

function renderChecklistItems(voci) {
  const container = document.getElementById('checklist-items')
  if (!container) return
  container.innerHTML = ''
  voci.forEach((item, index) => {
    const label = document.createElement('label')
    label.className = 'card'
    label.style.display = 'flex'
    label.style.alignItems = 'center'
    label.style.gap = '12px'
    label.style.padding = '12px 16px'
    label.style.borderRadius = '12px'
    label.style.border = '1px solid var(--gray-200)'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = !!item.checked
    checkbox.dataset.index = String(index)

    const span = document.createElement('span')
    span.textContent = item.label
    span.style.color = 'var(--gray-700)'

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
    const data = intervento.data_pianificata ? new Date(intervento.data_pianificata).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
    const title = `${cliente} — ${data}`
    const titleEl = document.getElementById('checklist-title')
    if (titleEl) titleEl.textContent = title

    const { data: compiled, error: compiledError } = await supabase
      .from('checklist_compilate')
      .select('*')
      .eq('intervento_id', interventoId)
      .single()
    if (compiledError && compiledError.code !== 'PGRST116') {
      throw compiledError
    }

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
    const payload = {
      id: currentChecklistId || undefined,
      intervento_id: interventoId,
      template_id: currentTemplateId || null,
      voci_compilate: voci.reduce((acc, item) => {
        acc[item.label] = !!item.checked
        return acc
      }, {}),
      completamento_pct,
      note: note || ''
    }

    const { data, error } = await supabase.from('checklist_compilate').upsert(payload, { returning: 'representation' })
    if (error) throw error
    if (data && data[0]) {
      currentChecklistId = data[0].id
    }

    if (definitivo) {
      const { error: updateError } = await supabase.from('interventi').update({ stato: 'completato' }).eq('id', interventoId)
      if (updateError) throw updateError
      showToast('Checklist salvata e intervento completato', 'success')
    } else {
      showToast('Checklist salvata come bozza', 'success')
    }

    return data?.[0] || null
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

  container?.addEventListener('change', () => {
    const voci = gatherChecklistItems()
    aggiornaPct(voci)
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
