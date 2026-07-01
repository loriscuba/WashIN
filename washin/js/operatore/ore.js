import supabase from '../supabase.js'

const TIPI = [
  { value: 'lavoro',    label: 'Lavoro' },
  { value: 'feria',     label: 'Ferie' },
  { value: 'malattia',  label: 'Malattia' },
  { value: 'festivita', label: 'Festività' },
  { value: 'permesso',  label: 'Permesso' },
  { value: 'assenza',   label: 'Assenza' },
]

const TIPO_COLOR = {
  lavoro:    '#0d9488',
  feria:     '#3b82f6',
  malattia:  '#ef4444',
  festivita: '#f59e0b',
  permesso:  '#8b5cf6',
  assenza:   '#6b7280',
}

let _profiloId = null
let _presenze = {}   // 'YYYY-MM-DD' → row

function _pad(n) { return String(n).padStart(2, '0') }

function _dateKey(y, m, d) {
  return `${y}-${_pad(m)}-${_pad(d)}`
}

function _oggi() {
  const d = new Date()
  return _dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function _nomeMese(mese) {
  return ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
          'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][mese - 1]
}

function _giorniDelMese(anno, mese) {
  return new Date(anno, mese, 0).getDate()
}

function _nomGiorno(anno, mese, giorno) {
  const d = new Date(anno, mese - 1, giorno)
  return ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][d.getDay()]
}

function _isWeekend(anno, mese, giorno) {
  const day = new Date(anno, mese - 1, giorno).getDay()
  return day === 0 || day === 6
}

function _formatOre(h) {
  if (!h || h === 0) return ''
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm ? `${hh}h${_pad(mm)}` : `${hh}h`
}

function _renderCalendario(anno, mese, presenze, oggi) {
  const giorni = _giorniDelMese(anno, mese)
  let html = ''
  for (let g = 1; g <= giorni; g++) {
    const key = _dateKey(anno, mese, g)
    const p = presenze[key]
    const isOggi = key === oggi
    const weekend = _isWeekend(anno, mese, g)
    const nomG = _nomGiorno(anno, mese, g)
    const tipo = p?.tipo || (weekend ? 'assenza' : null)
    const color = tipo ? TIPO_COLOR[tipo] : '#e5e7eb'
    const oreOrd = p?.ore_ordinarie || 0
    const oreStr = p?.ore_straordinario || 0
    const tipoLabel = TIPI.find(t => t.value === tipo)?.label || ''

    html += `
      <div class="giorno-card${isOggi ? ' giorno-oggi' : ''}${weekend ? ' giorno-weekend' : ''}"
           data-key="${key}" data-giorno="${g}"
           style="border-left:3px solid ${color};">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:13px;font-weight:${isOggi ? 700 : 500};color:${isOggi ? '#0d9488' : '#374151'};">
            ${nomG} ${g}${isOggi ? ' · oggi' : ''}
          </span>
          ${tipo ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${color}20;color:${color};font-weight:600;">${tipoLabel}</span>` : ''}
        </div>
        ${oreOrd || oreStr ? `
          <div style="display:flex;gap:12px;margin-top:4px;font-size:12px;color:#6b7280;">
            ${oreOrd ? `<span>⏱ ${_formatOre(oreOrd)} ordinarie</span>` : ''}
            ${oreStr ? `<span style="color:#f59e0b;">+ ${_formatOre(oreStr)} straordinario</span>` : ''}
          </div>
        ` : (!weekend && !tipo) ? `<div style="font-size:12px;color:#d1d5db;margin-top:4px;">Non registrato</div>` : ''}
        ${p?.note ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${p.note}</div>` : ''}
      </div>
    `
  }
  return html
}

function _renderModal(key, p) {
  const [y, m, d] = key.split('-').map(Number)
  const nomG = _nomGiorno(y, m, d)
  const tipo = p?.tipo || 'lavoro'
  const oreOrd = p?.ore_ordinarie || ''
  const oreStr = p?.ore_straordinario || ''
  const note = p?.note || ''

  return `
    <div id="ore-modal-overlay" style="
      position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;
      display:flex;align-items:flex-end;justify-content:center;">
      <div style="
        background:#fff;border-radius:16px 16px 0 0;padding:24px;
        width:100%;max-width:480px;box-shadow:0 -4px 24px rgba(0,0,0,.15);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;font-size:17px;font-weight:700;color:#111827;">
            ${nomG} ${d} ${_nomeMese(m)} ${y}
          </h3>
          <button id="ore-modal-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">✕</button>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:8px;">Tipo giornata</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${TIPI.map(t => `
              <label style="cursor:pointer;">
                <input type="radio" name="ore-tipo" value="${t.value}" ${tipo === t.value ? 'checked' : ''}
                  style="display:none;" class="ore-tipo-radio">
                <span class="ore-tipo-chip" data-value="${t.value}" style="
                  display:inline-block;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:500;
                  border:2px solid ${tipo === t.value ? TIPO_COLOR[t.value] : '#e5e7eb'};
                  background:${tipo === t.value ? TIPO_COLOR[t.value] + '15' : '#fff'};
                  color:${tipo === t.value ? TIPO_COLOR[t.value] : '#6b7280'};">
                  ${t.label}
                </span>
              </label>
            `).join('')}
          </div>
        </div>

        <div id="ore-ore-fields" style="${tipo !== 'lavoro' ? 'display:none;' : ''}">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div>
              <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Ore ordinarie</label>
              <input id="ore-ordinarie" type="number" min="0" max="24" step="0.25"
                value="${oreOrd}"
                placeholder="es. 7.5"
                style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;box-sizing:border-box;">
            </div>
            <div>
              <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Straordinario</label>
              <input id="ore-straordinario" type="number" min="0" max="12" step="0.25"
                value="${oreStr}"
                placeholder="es. 1"
                style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:15px;box-sizing:border-box;">
            </div>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Note (opzionale)</label>
          <input id="ore-note" type="text" value="${note}" placeholder="es. cantiere Genova"
            style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
        </div>

        <div style="display:flex;gap:12px;">
          <button id="ore-modal-save" style="
            flex:1;padding:14px;background:#0d9488;color:#fff;border:none;
            border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">
            Salva
          </button>
          ${p ? `<button id="ore-modal-delete" style="
            padding:14px 18px;background:#fee2e2;color:#ef4444;border:none;
            border-radius:10px;font-size:15px;cursor:pointer;">
            🗑
          </button>` : ''}
        </div>
      </div>
    </div>
  `
}

async function _loadPresenze(anno, mese) {
  if (!_profiloId) return {}
  const from = _dateKey(anno, mese, 1)
  const to = _dateKey(anno, mese, _giorniDelMese(anno, mese))
  const { data } = await supabase
    .from('presenze_giornaliere')
    .select('*')
    .eq('profilo_id', _profiloId)
    .gte('data', from)
    .lte('data', to)
  const map = {}
  ;(data || []).forEach(r => { map[r.data] = r })
  return map
}

function _renderRiepilogo(presenze, anno, mese) {
  const giorni = _giorniDelMese(anno, mese)
  let oreOrd = 0, oreStr = 0, ferie = 0, malattia = 0, nonReg = 0
  for (let g = 1; g <= giorni; g++) {
    const key = _dateKey(anno, mese, g)
    const weekend = _isWeekend(anno, mese, g)
    if (weekend) continue
    const p = presenze[key]
    if (!p) { nonReg++; continue }
    if (p.tipo === 'lavoro') {
      oreOrd += parseFloat(p.ore_ordinarie || 0)
      oreStr += parseFloat(p.ore_straordinario || 0)
    } else if (p.tipo === 'feria') ferie++
    else if (p.tipo === 'malattia') malattia++
  }
  return `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px;">
      <div style="background:#f0fdfa;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#0d9488;">${_formatOre(oreOrd) || '0h'}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Ore ordinarie</div>
      </div>
      <div style="background:#fffbeb;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#f59e0b;">${_formatOre(oreStr) || '0h'}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Straordinario</div>
      </div>
      ${ferie ? `<div style="background:#eff6ff;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#3b82f6;">${ferie}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Giorni ferie</div>
      </div>` : ''}
      ${malattia ? `<div style="background:#fef2f2;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#ef4444;">${malattia}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Giorni malattia</div>
      </div>` : ''}
      ${nonReg ? `<div style="background:#f9fafb;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#9ca3af;">${nonReg}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Da registrare</div>
      </div>` : ''}
    </div>
  `
}

export async function initOreOperatore(profiloId) {
  _profiloId = profiloId
  const container = document.getElementById('ore-section')
  if (!container) return

  const now = new Date()
  let anno = now.getFullYear()
  let mese = now.getMonth() + 1

  async function render() {
    _presenze = await _loadPresenze(anno, mese)
    const oggi = _oggi()

    container.innerHTML = `
      <div style="padding:0 0 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <button id="ore-prev" style="background:#f3f4f6;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:16px;">‹</button>
          <h2 style="margin:0;font-size:17px;font-weight:700;color:#111827;">${_nomeMese(mese)} ${anno}</h2>
          <button id="ore-next" style="background:#f3f4f6;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:16px;">›</button>
        </div>

        ${_renderRiepilogo(_presenze, anno, mese)}

        <div id="ore-giorni" style="display:flex;flex-direction:column;gap:6px;">
          ${_renderCalendario(anno, mese, _presenze, oggi)}
        </div>
      </div>
    `

    document.getElementById('ore-prev').addEventListener('click', () => {
      mese--; if (mese < 1) { mese = 12; anno-- }
      render()
    })
    document.getElementById('ore-next').addEventListener('click', () => {
      mese++; if (mese > 12) { mese = 1; anno++ }
      render()
    })

    document.getElementById('ore-giorni').addEventListener('click', e => {
      const card = e.target.closest('.giorno-card')
      if (!card) return
      openModal(card.dataset.key)
    })
  }

  function openModal(key) {
    const p = _presenze[key]
    const overlay = document.createElement('div')
    overlay.innerHTML = _renderModal(key, p)
    document.body.appendChild(overlay.firstElementChild)

    const modal = document.getElementById('ore-modal-overlay')

    // Toggle tipo chips
    modal.querySelectorAll('.ore-tipo-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        const tipo = radio.value
        modal.querySelectorAll('.ore-tipo-chip').forEach(chip => {
          const c = TIPO_COLOR[chip.dataset.value]
          const sel = chip.dataset.value === tipo
          chip.style.borderColor = sel ? c : '#e5e7eb'
          chip.style.background = sel ? c + '15' : '#fff'
          chip.style.color = sel ? c : '#6b7280'
        })
        const oreFields = document.getElementById('ore-ore-fields')
        if (oreFields) oreFields.style.display = tipo === 'lavoro' ? '' : 'none'
      })
    })

    modal.getElementById?.('ore-modal-close')
    document.getElementById('ore-modal-close').addEventListener('click', () => modal.remove())
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })

    document.getElementById('ore-modal-save').addEventListener('click', async () => {
      const tipo = modal.querySelector('input[name="ore-tipo"]:checked')?.value || 'lavoro'
      const oreOrd = tipo === 'lavoro' ? parseFloat(document.getElementById('ore-ordinarie').value || 0) : 0
      const oreStr = tipo === 'lavoro' ? parseFloat(document.getElementById('ore-straordinario').value || 0) : 0
      const note = document.getElementById('ore-note').value.trim()

      const btn = document.getElementById('ore-modal-save')
      btn.disabled = true
      btn.textContent = 'Salvataggio...'

      const { error } = await supabase.from('presenze_giornaliere').upsert({
        profilo_id: _profiloId,
        data: key,
        tipo,
        ore_ordinarie: oreOrd,
        ore_straordinario: oreStr,
        note: note || null,
      }, { onConflict: 'profilo_id,data' })

      if (error) {
        alert('Errore nel salvataggio: ' + error.message)
        btn.disabled = false
        btn.textContent = 'Salva'
        return
      }

      modal.remove()
      render()
    })

    const delBtn = document.getElementById('ore-modal-delete')
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!_presenze[key]?.id) return
        await supabase.from('presenze_giornaliere').delete().eq('id', _presenze[key].id)
        modal.remove()
        render()
      })
    }
  }

  render()
}
