import supabase from '../supabase.js'
import { showToast } from './clienti.js'

const TIPI = [
  { v: 'lavoro',    l: 'L',  label: 'Lavoro',      color: '#0d9488', bg: '#f0fdfa' },
  { v: 'feria',     l: 'F',  label: 'Ferie',       color: '#3b82f6', bg: '#eff6ff' },
  { v: 'malattia',  l: 'M',  label: 'Malattia',    color: '#ef4444', bg: '#fef2f2' },
  { v: 'festivita', l: 'Fe', label: 'Festività',   color: '#f59e0b', bg: '#fffbeb' },
  { v: 'permesso',  l: 'P',  label: 'Permesso',    color: '#8b5cf6', bg: '#f5f3ff' },
  { v: 'assenza',   l: 'A',  label: 'Assenza ingiust.', color: '#6b7280', bg: '#f9fafb' },
]

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

const GIORNI_BREVI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

function pad(n) { return String(n).padStart(2,'0') }
function dateKey(y,m,d) { return `${y}-${pad(m)}-${pad(d)}` }
function isWeekend(y,m,d) { const dw = new Date(y,m-1,d).getDay(); return dw===0||dw===6 }
function giorniMese(y,m) { return new Date(y,m,0).getDate() }
function nomGiorno(y,m,d) { return GIORNI_BREVI[new Date(y,m-1,d).getDay()] }
function tipoMeta(v) { return TIPI.find(t=>t.v===v) || TIPI[0] }

function fmtOre(h) {
  if (!h) return '—'
  const hh=Math.floor(h), mm=Math.round((h-hh)*60)
  return mm ? `${hh}h ${pad(mm)}m` : `${hh}h`
}

// ─── Stato globale ───────────────────────────────────────────────────────────
let _anno, _mese, _operatori = [], _presenzeMap = {}, _mensiliMap = {}
let _drawerOpId = null, _drawerGiornalieri = {}, _drawerMensile = null

// ─── Load dati ───────────────────────────────────────────────────────────────
async function loadOperatori() {
  const { data } = await supabase
    .from('profili').select('id,nome,cognome,ruolo')
    .or('ruolo.eq.operatore,ruolo.is.null')
    .eq('attivo', true)
    .order('cognome')
  _operatori = data || []
}

async function loadMese() {
  const from = dateKey(_anno, _mese, 1)
  const to   = dateKey(_anno, _mese, giorniMese(_anno, _mese))

  const ids = _operatori.map(o=>o.id)
  if (!ids.length) return

  // Giornalieri
  const { data: g } = await supabase
    .from('presenze_giornaliere').select('*')
    .in('profilo_id', ids).gte('data',from).lte('data',to)
  _presenzeMap = {}
  ;(g||[]).forEach(r => {
    if (!_presenzeMap[r.profilo_id]) _presenzeMap[r.profilo_id] = {}
    _presenzeMap[r.profilo_id][r.data] = r
  })

  // Mensili
  const { data: m } = await supabase
    .from('presenze_mensili').select('*')
    .in('profilo_id', ids).eq('anno',_anno).eq('mese',_mese)
  _mensiliMap = {}
  ;(m||[]).forEach(r => { _mensiliMap[r.profilo_id] = r })
}

// ─── Calcolo totali da giornalieri ───────────────────────────────────────────
function calcolaTotali(profiloId) {
  const pg = _presenzeMap[profiloId] || {}
  let oreOrd=0, ferie=0, malattia=0, festività=0, permesso=0, assenza=0, straord=0
  Object.values(pg).forEach(r => {
    if (r.tipo==='lavoro') { oreOrd+=parseFloat(r.ore_ordinarie||0); straord+=parseFloat(r.ore_straordinario||0) }
    else if (r.tipo==='feria') ferie++
    else if (r.tipo==='malattia') malattia++
    else if (r.tipo==='festivita') festività++
    else if (r.tipo==='permesso') permesso++
    else if (r.tipo==='assenza') assenza++
  })
  return { oreOrd, ferie, malattia, festività, permesso, assenza, straord }
}

// ─── Render lista operatori ──────────────────────────────────────────────────
function renderLista() {
  const tbody = document.getElementById('pd-table-body')
  if (!tbody) return

  if (!_operatori.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--gray-400);">Nessun operatore trovato</td></tr>'
    return
  }

  tbody.innerHTML = _operatori.map(op => {
    const t = calcolaTotali(op.id)
    const m = _mensiliMap[op.id] || {}
    const nome = `${op.cognome||''} ${op.nome||''}`.trim()
    const oreNotturne = parseFloat(m.ore_notturne||0)
    const oreFestive = parseFloat(m.festivita_godute_ore||0) + parseFloat(m.ore_domenicali||0)
    const hasNote = m.note_commercialista || m.acconto_importo || m.premio_importo ||
                    m.finanziamento_importo || m.nuovo_iban || m.dimissioni_data
    return `<tr>
      <td><strong>${nome}</strong></td>
      <td>${fmtOre(t.oreOrd)}</td>
      <td>${oreNotturne ? fmtOre(oreNotturne) : '—'}</td>
      <td>${oreFestive ? fmtOre(oreFestive) : '—'}</td>
      <td>${t.ferie || '—'}</td>
      <td>${t.malattia || '—'}</td>
      <td>${hasNote ? '<span style="color:#f59e0b;font-weight:700;">●</span>' : '—'}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="window._pdOpen('${op.id}')">
          Modifica
        </button>
      </td>
    </tr>`
  }).join('')
}

// ─── Drawer ──────────────────────────────────────────────────────────────────
function openDrawer(profiloId) {
  _drawerOpId = profiloId
  const op = _operatori.find(o=>o.id===profiloId)
  if (!op) return

  _drawerGiornalieri = JSON.parse(JSON.stringify(_presenzeMap[profiloId] || {}))
  _drawerMensile = JSON.parse(JSON.stringify(_mensiliMap[profiloId] || {}))

  const nome = `${op.nome||''} ${op.cognome||''}`.trim()

  const overlay = document.createElement('div')
  overlay.id = 'pd-drawer-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;'
  overlay.innerHTML = `
    <div style="flex:1;background:rgba(0,0,0,.35);" id="pd-drawer-bg"></div>
    <div id="pd-drawer" style="
      width:min(720px,100vw);background:#fff;height:100vh;overflow-y:auto;
      box-shadow:-4px 0 32px rgba(0,0,0,.15);display:flex;flex-direction:column;">

      <!-- Header -->
      <div style="padding:20px 24px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;">
        <div>
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">${MESI[_mese-1]} ${_anno}</div>
          <h2 style="margin:4px 0 0;font-size:18px;font-weight:700;">${nome}</h2>
        </div>
        <button id="pd-drawer-close" style="background:#f3f4f6;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:16px;">✕</button>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;border-bottom:1px solid #f3f4f6;background:#fafafa;">
        <button class="pd-tab active" data-tab="giornaliero" style="flex:1;padding:12px;background:none;border:none;border-bottom:2px solid #0d9488;font-weight:600;font-size:13px;color:#0d9488;cursor:pointer;">📅 Ore giornaliere</button>
        <button class="pd-tab" data-tab="riepilogo" style="flex:1;padding:12px;background:none;border:none;border-bottom:2px solid transparent;font-weight:600;font-size:13px;color:#6b7280;cursor:pointer;">📊 Riepilogo</button>
        <button class="pd-tab" data-tab="note" style="flex:1;padding:12px;background:none;border:none;border-bottom:2px solid transparent;font-weight:600;font-size:13px;color:#6b7280;cursor:pointer;">📋 Note comm.</button>
      </div>

      <!-- Content area -->
      <div id="pd-drawer-content" style="flex:1;padding:20px 24px;"></div>

      <!-- Footer -->
      <div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:12px;position:sticky;bottom:0;background:#fff;">
        <button id="pd-save-btn" style="flex:1;padding:13px;background:#0d9488;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">
          Salva tutto
        </button>
        <button id="pd-drawer-cancel" style="padding:13px 20px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:15px;cursor:pointer;">
          Annulla
        </button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  renderTab('giornaliero')

  document.getElementById('pd-drawer-close').addEventListener('click', closeDrawer)
  document.getElementById('pd-drawer-cancel').addEventListener('click', closeDrawer)
  document.getElementById('pd-drawer-bg').addEventListener('click', closeDrawer)
  document.getElementById('pd-save-btn').addEventListener('click', saveAll)

  overlay.querySelectorAll('.pd-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      collectCurrentTab()
      overlay.querySelectorAll('.pd-tab').forEach(b => {
        b.style.borderBottom = '2px solid transparent'
        b.style.color = '#6b7280'
        b.classList.remove('active')
      })
      btn.style.borderBottom = '2px solid #0d9488'
      btn.style.color = '#0d9488'
      btn.classList.add('active')
      renderTab(btn.dataset.tab)
    })
  })
}

function closeDrawer() {
  document.getElementById('pd-drawer-overlay')?.remove()
  _drawerOpId = null
}

function currentTab() {
  return document.querySelector('.pd-tab.active')?.dataset.tab
}

// ─── Tab: Ore Giornaliere ─────────────────────────────────────────────────────
function renderTab(tab) {
  const content = document.getElementById('pd-drawer-content')
  if (!content) return

  if (tab === 'giornaliero') {
    content.innerHTML = renderOreGiornaliere()
    bindOreGiornaliereEvents()
  } else if (tab === 'riepilogo') {
    content.innerHTML = renderRiepilogo()
  } else if (tab === 'note') {
    content.innerHTML = renderNote()
  }
}

function renderOreGiornaliere() {
  const giorni = giorniMese(_anno, _mese)
  let html = `
    <div style="margin-bottom:16px;font-size:13px;color:#6b7280;">
      Registra le ore per ogni giorno lavorativo. Per i weekend puoi comunque inserire ore (straordinari, turni).
    </div>
    <div style="display:grid;grid-template-columns:auto 80px 80px 80px 1fr;gap:4px;align-items:center;margin-bottom:8px;padding:0 4px;">
      <span style="font-size:11px;color:#9ca3af;">Giorno</span>
      <span style="font-size:11px;color:#9ca3af;text-align:center;">Tipo</span>
      <span style="font-size:11px;color:#9ca3af;text-align:center;">Ore</span>
      <span style="font-size:11px;color:#9ca3af;text-align:center;">Min</span>
      <span style="font-size:11px;color:#9ca3af;">Cantiere/nota</span>
    </div>
  `

  for (let g=1; g<=giorni; g++) {
    const key = dateKey(_anno, _mese, g)
    const p = _drawerGiornalieri[key]
    const wd = isWeekend(_anno, _mese, g)
    const nomG = nomGiorno(_anno, _mese, g)
    const tipo = p?.tipo || (wd ? null : null)
    const meta = tipo ? tipoMeta(tipo) : null
    const oreH = p ? Math.floor(parseFloat(p.ore_ordinarie||0)) : ''
    const oreM = p ? Math.round((parseFloat(p.ore_ordinarie||0)-Math.floor(parseFloat(p.ore_ordinarie||0)))*60) : ''
    const oreMFmt = oreM ? pad(oreM) : (oreH !== '' ? '00' : '')

    html += `
      <div class="pg-row" data-key="${key}" style="
        display:grid;grid-template-columns:auto 80px 80px 80px 1fr;
        gap:6px;align-items:center;padding:6px 4px;
        border-radius:8px;margin-bottom:2px;
        background:${meta ? meta.bg : (wd ? '#f9fafb' : '#fff')};
        border:1px solid ${meta ? meta.color+'30' : (wd ? '#f3f4f6' : '#f3f4f6')};
      ">
        <span style="font-size:13px;font-weight:${wd?400:600};color:${wd?'#9ca3af':'#374151'};min-width:56px;">
          ${nomG} ${g}
        </span>
        <select class="pg-tipo" data-key="${key}" style="
          padding:5px 6px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;
          background:${meta ? meta.bg : '#fff'};color:${meta ? meta.color : '#374151'};
          font-weight:600;cursor:pointer;">
          <option value="">—</option>
          ${TIPI.map(t=>`<option value="${t.v}" ${tipo===t.v?'selected':''} style="color:${t.color}">${t.l} ${t.label}</option>`).join('')}
        </select>
        <input class="pg-ore" data-key="${key}" type="number" min="0" max="24" placeholder="0"
          value="${oreH}"
          style="padding:5px 8px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center;width:100%;box-sizing:border-box;${!tipo||tipo==='lavoro'?'':'opacity:.4;pointer-events:none;'}">
        <input class="pg-min" data-key="${key}" type="number" min="0" max="59" placeholder="00"
          value="${oreMFmt}"
          style="padding:5px 8px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center;width:100%;box-sizing:border-box;${!tipo||tipo==='lavoro'?'':'opacity:.4;pointer-events:none;'}">
        <input class="pg-nota" data-key="${key}" type="text" placeholder="cantiere..."
          value="${p?.nota_cantiere||''}"
          style="padding:5px 8px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:12px;width:100%;box-sizing:border-box;">
      </div>
    `
  }
  return html
}

function bindOreGiornaliereEvents() {
  document.querySelectorAll('.pg-tipo').forEach(sel => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.key
      const tipo = sel.value
      const row = sel.closest('.pg-row')
      const meta = tipo ? tipoMeta(tipo) : null
      row.style.background = meta ? meta.bg : '#fff'
      row.style.border = `1px solid ${meta ? meta.color+'30' : '#f3f4f6'}`
      sel.style.background = meta ? meta.bg : '#fff'
      sel.style.color = meta ? meta.color : '#374151'

      // Disable ore/min if not lavoro
      const oreEl = row.querySelector('.pg-ore')
      const minEl = row.querySelector('.pg-min')
      const isLavoro = !tipo || tipo==='lavoro'
      oreEl.style.opacity = isLavoro ? '1' : '.4'
      oreEl.style.pointerEvents = isLavoro ? '' : 'none'
      minEl.style.opacity = isLavoro ? '1' : '.4'
      minEl.style.pointerEvents = isLavoro ? '' : 'none'

      if (!_drawerGiornalieri[key]) _drawerGiornalieri[key] = { data: key, profilo_id: _drawerOpId }
      _drawerGiornalieri[key].tipo = tipo || null
    })
  })
  ;['pg-ore','pg-min','pg-nota'].forEach(cls => {
    document.querySelectorAll(`.${cls}`).forEach(el => {
      el.addEventListener('change', () => {
        const key = el.dataset.key
        if (!_drawerGiornalieri[key]) _drawerGiornalieri[key] = { data: key, profilo_id: _drawerOpId }
        const row = el.closest('.pg-row')
        const ore = parseFloat(row.querySelector('.pg-ore').value||0)
        const min = parseFloat(row.querySelector('.pg-min').value||0)
        _drawerGiornalieri[key].ore_ordinarie = ore + min/60
        _drawerGiornalieri[key].nota_cantiere = row.querySelector('.pg-nota').value.trim() || null
      })
    })
  })
}

// ─── Tab: Riepilogo ──────────────────────────────────────────────────────────
function renderRiepilogo() {
  const t = calcolaTotaliDaDrawer()
  const m = _drawerMensile

  function inp(id, val, label, placeholder='0', type='number', min=0) {
    return `
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">${label}</label>
        <input id="${id}" type="${type}" min="${min}" step="0.5" placeholder="${placeholder}"
          value="${val||''}"
          style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>`
  }

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:#f0fdfa;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#0d9488;">${fmtOre(t.oreOrd)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Ore lavoro (calcolate)</div>
      </div>
      <div style="background:#fffbeb;border-radius:10px;padding:14px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#f59e0b;">${t.ferie || 0} gg</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Ferie (da giornaliero)</div>
      </div>
    </div>

    <p style="font-size:12px;color:#9ca3af;margin:0 0 16px;">I valori "di cui" non sono calcolabili automaticamente — inseriscili manualmente dalla busta paga o dal foglio ore.</p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      ${inp('rd-notturne',  m.ore_notturne,           'Di cui notturne (h)')}
      ${inp('rd-domenicali',m.ore_domenicali,          'Di cui domenicali (h)')}
      ${inp('rd-festive',   m.festivita_godute_ore,    'Di cui festive (h)')}
      ${inp('rd-sabato',    m.ore_sabato,              'Di cui sabato (h)')}
      ${inp('rd-straord',   m.ore_straordinario_25,    'Straordinario 25% (h)')}
      ${inp('rd-suppl',     m.ore_supplementare,       'Supplementare 28% (h)')}
      ${inp('rd-malattia',  m.gg_malattia_inps,        'Gg malattia INPS')}
      ${inp('rd-carenza',   m.gg_carenza_malattia,     'Gg carenza malattia')}
      ${inp('rd-congedo',   m.gg_congedo_parentale,    'Gg congedo parentale')}
      ${inp('rd-ferie-ore', m.ferie_godute_ore,        'Ferie godute (h)')}
      ${inp('rd-exfest',    m.ex_festivita_ore,        'Ex festività (h)')}
    </div>
  `
}

function calcolaTotaliDaDrawer() {
  let oreOrd=0, ferie=0, malattia=0
  Object.values(_drawerGiornalieri).forEach(r => {
    if (r.tipo==='lavoro') oreOrd+=parseFloat(r.ore_ordinarie||0)
    else if (r.tipo==='feria') ferie++
    else if (r.tipo==='malattia') malattia++
  })
  return { oreOrd, ferie, malattia }
}

// ─── Tab: Note Commercialista ─────────────────────────────────────────────────
function renderNote() {
  const m = _drawerMensile

  function inp(id, val, label, placeholder='', type='text') {
    return `
      <div class="form-group" style="margin:0;">
        <label style="font-size:12px;">${label}</label>
        <input id="${id}" type="${type}" placeholder="${placeholder}"
          value="${val||''}"
          style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>`
  }

  function chk(id, val, label) {
    return `
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;">
        <input id="${id}" type="checkbox" ${val?'checked':''} style="width:16px;height:16px;accent-color:#0d9488;">
        <span style="font-size:14px;font-weight:500;">${label}</span>
      </label>`
  }

  return `
    <div style="display:flex;flex-direction:column;gap:20px;">

      <fieldset style="border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;">
        <legend style="font-size:12px;font-weight:600;color:#374151;padding:0 8px;">💶 Movimenti economici</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${inp('nc-acconto',      m.acconto_importo,      'Togliere acconto (€)', 'es. 100', 'number')}
          ${inp('nc-premio',       m.premio_importo,       'Premio (€)', 'es. 40', 'number')}
          ${inp('nc-rimborso',     m.rimborso_importo,     'Rimborso (€)', 'es. 100', 'number')}
          ${inp('nc-finanziamento',m.finanziamento_importo,'Rata finanziamento (€)','es. 268', 'number')}
          ${inp('nc-fin-ente',     m.finanziamento_ente,   'Ente finanziamento','es. Pitagora')}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          ${chk('nc-fin-flag', m.flag_finanziamento, 'VEDI FINANZIAMENTO (verificare)')}
        </div>
      </fieldset>

      <fieldset style="border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;">
        <legend style="font-size:12px;font-weight:600;color:#374151;padding:0 8px;">📎 Trattenute</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${chk('nc-cessione', m.cessione_quinto, 'Trattenuta 1/5 stipendio')}
          <div class="form-group" style="margin:0;">
            <label style="font-size:12px;">Ente cessione</label>
            <input id="nc-cess-ente" type="text" placeholder="es. SIGLA" value="${m.cessione_ente||''}"
              style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:12px;">Trattenuta sindacale</label>
            <select id="nc-sind" style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;">
              <option value="">Nessuna</option>
              <option value="CGIL" ${m.trattenuta_sindacale==='CGIL'?'selected':''}>CGIL (1%)</option>
              <option value="CISL" ${m.trattenuta_sindacale==='CISL'?'selected':''}>CISL</option>
              <option value="UIL"  ${m.trattenuta_sindacale==='UIL' ?'selected':''}>UIL</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset style="border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;">
        <legend style="font-size:12px;font-weight:600;color:#374151;padding:0 8px;">📋 LUL / Nuovo IBAN / Dimissioni</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${inp('nc-lul-data',  m.lul_data,     'Segna sul LUL — data','es. 2026-05-02','date')}
          ${inp('nc-lul-ore',   m.lul_ore,      'Segna LUL — ore','es. 6','number')}
          ${inp('nc-iban',      m.nuovo_iban,   'Nuovo IBAN','IT...')}
          ${inp('nc-dimissioni',m.dimissioni_data,'Data dimissioni','','date')}
        </div>
      </fieldset>

      <fieldset style="border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;">
        <legend style="font-size:12px;font-weight:600;color:#374151;padding:0 8px;">📝 Note libere per la commercialista</legend>
        <textarea id="nc-note" rows="4" placeholder="es. FARE CEDOLINO DA € 1.000 NETTI CHIUDENDO IL TFR..."
          style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;
                 box-sizing:border-box;resize:vertical;font-family:inherit;">${m.note_commercialista||''}</textarea>
      </fieldset>

    </div>
  `
}

// ─── Colleziona dati dal tab attivo prima di cambiare tab ────────────────────
function collectCurrentTab() {
  const tab = currentTab()
  if (tab === 'giornaliero') {
    document.querySelectorAll('.pg-row').forEach(row => {
      const key = row.querySelector('.pg-tipo').dataset.key
      const tipo = row.querySelector('.pg-tipo').value
      const ore  = parseFloat(row.querySelector('.pg-ore').value||0)
      const min  = parseFloat(row.querySelector('.pg-min').value||0)
      const nota = row.querySelector('.pg-nota').value.trim()
      if (tipo || ore || min || nota) {
        if (!_drawerGiornalieri[key]) _drawerGiornalieri[key] = { data: key, profilo_id: _drawerOpId }
        _drawerGiornalieri[key].tipo = tipo || 'lavoro'
        _drawerGiornalieri[key].ore_ordinarie = ore + min/60
        _drawerGiornalieri[key].nota_cantiere = nota || null
      } else {
        delete _drawerGiornalieri[key]
      }
    })
  } else if (tab === 'riepilogo') {
    const g = id => { const el=document.getElementById(id); return el?parseFloat(el.value)||null:null }
    _drawerMensile = {
      ..._drawerMensile,
      ore_notturne:         g('rd-notturne'),
      ore_domenicali:       g('rd-domenicali'),
      festivita_godute_ore: g('rd-festive'),
      ore_sabato:           g('rd-sabato'),
      ore_straordinario_25: g('rd-straord'),
      ore_supplementare:    g('rd-suppl'),
      gg_malattia_inps:     g('rd-malattia'),
      gg_carenza_malattia:  g('rd-carenza'),
      gg_congedo_parentale: g('rd-congedo'),
      ferie_godute_ore:     g('rd-ferie-ore'),
      ex_festivita_ore:     g('rd-exfest'),
    }
  } else if (tab === 'note') {
    const v = id => { const el=document.getElementById(id); return el?el.value.trim()||null:null }
    const n = id => { const el=document.getElementById(id); return el?parseFloat(el.value)||null:null }
    const c = id => { const el=document.getElementById(id); return el?el.checked:false }
    _drawerMensile = {
      ..._drawerMensile,
      acconto_importo:       n('nc-acconto'),
      premio_importo:        n('nc-premio'),
      rimborso_importo:      n('nc-rimborso'),
      finanziamento_importo: n('nc-finanziamento'),
      finanziamento_ente:    v('nc-fin-ente'),
      flag_finanziamento:    c('nc-fin-flag'),
      cessione_quinto:       c('nc-cessione'),
      cessione_ente:         v('nc-cess-ente'),
      trattenuta_sindacale:  v('nc-sind'),
      lul_data:              v('nc-lul-data'),
      lul_ore:               n('nc-lul-ore'),
      nuovo_iban:            v('nc-iban'),
      dimissioni_data:       v('nc-dimissioni'),
      note_commercialista:   v('nc-note'),
    }
  }
}

// ─── Salva ───────────────────────────────────────────────────────────────────
async function saveAll() {
  collectCurrentTab()

  const btn = document.getElementById('pd-save-btn')
  btn.disabled = true; btn.textContent = 'Salvataggio...'

  try {
    // 1. Upsert presenze giornaliere
    const giorni = giorniMese(_anno, _mese)
    const from = dateKey(_anno, _mese, 1)
    const to   = dateKey(_anno, _mese, giorni)

    // Elimina righe vuote, upsert righe con dati
    const toUpsert = Object.values(_drawerGiornalieri).filter(r => r.tipo)
    const toDelete = []
    for (let g=1; g<=giorni; g++) {
      const key = dateKey(_anno,_mese,g)
      if (!_drawerGiornalieri[key] || !_drawerGiornalieri[key].tipo) {
        const existing = _presenzeMap[_drawerOpId]?.[key]
        if (existing?.id) toDelete.push(existing.id)
      }
    }

    if (toDelete.length) {
      await supabase.from('presenze_giornaliere').delete().in('id', toDelete)
    }

    if (toUpsert.length) {
      const rows = toUpsert.map(r => ({
        profilo_id:      _drawerOpId,
        data:            r.data,
        tipo:            r.tipo || 'lavoro',
        ore_ordinarie:   parseFloat(r.ore_ordinarie||0),
        ore_straordinario: parseFloat(r.ore_straordinario||0),
        nota_cantiere:   r.nota_cantiere || null,
        note:            r.note || null,
      }))
      const { error } = await supabase.from('presenze_giornaliere')
        .upsert(rows, { onConflict: 'profilo_id,data' })
      if (error) throw error
    }

    // 2. Upsert presenze mensili
    const t = calcolaTotaliDaDrawer()
    const mensileRow = {
      profilo_id:            _drawerOpId,
      anno:                  _anno,
      mese:                  _mese,
      ore_ordinarie:         t.oreOrd,
      fonte:                 'admin',
      ..._drawerMensile,
      profilo_id:            _drawerOpId,
      anno:                  _anno,
      mese:                  _mese,
    }
    delete mensileRow.id
    const { error: em } = await supabase.from('presenze_mensili')
      .upsert(mensileRow, { onConflict: 'profilo_id,anno,mese' })
    if (em) throw em

    // Aggiorna stato locale
    if (!_presenzeMap[_drawerOpId]) _presenzeMap[_drawerOpId] = {}
    Object.assign(_presenzeMap[_drawerOpId], _drawerGiornalieri)
    const { data: newM } = await supabase.from('presenze_mensili').select('*')
      .eq('profilo_id',_drawerOpId).eq('anno',_anno).eq('mese',_mese).single()
    if (newM) _mensiliMap[_drawerOpId] = newM

    showToast('Presenze salvate', 'success')
    closeDrawer()
    renderLista()
  } catch (err) {
    console.error(err)
    showToast('Errore nel salvataggio', 'error')
    btn.disabled = false; btn.textContent = 'Salva tutto'
  }
}

// ─── Export riepilogo commercialista ─────────────────────────────────────────
function exportRiepilogo() {
  const mLabel = `${MESI[_mese-1]} ${_anno}`
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Riepilogo ${mLabel} — WashIN</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;padding:32px;color:#111;}
      h1{font-size:20px;margin-bottom:4px;}
      .sub{color:#666;margin-bottom:32px;font-size:12px;}
      .op{margin-bottom:24px;padding:16px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid;}
      .op-name{font-size:15px;font-weight:700;margin-bottom:8px;}
      .op-row{margin:3px 0;font-size:13px;}
      .note-box{background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:10px;margin-top:10px;font-size:12px;white-space:pre-wrap;}
      @media print{body{padding:16px;} .op{border:1px solid #aaa;}}
    </style></head><body>
    <h1>Riepilogo Presenze — ${mLabel}</h1>
    <div class="sub">Generato il ${new Date().toLocaleDateString('it-IT')} · WashIN</div>`

  _operatori.forEach(op => {
    const t = calcolaTotali(op.id)
    const m = _mensiliMap[op.id] || {}
    const nome = `${op.cognome||''} ${op.nome||''}`.trim()
    if (!t.oreOrd && !t.ferie && !t.malattia && !m.note_commercialista && !m.acconto_importo && !m.premio_importo) return

    let note = ''
    if (m.dimissioni_data) note += `DIMISSIONI AL ${new Date(m.dimissioni_data).toLocaleDateString('it-IT')}\n`
    const notturne = parseFloat(m.ore_notturne||0)
    const festive = parseFloat(m.festivita_godute_ore||0)
    const domenicali = parseFloat(m.ore_domenicali||0)
    const sabato = parseFloat(m.ore_sabato||0)
    const straord = parseFloat(m.ore_straordinario_25||0)

    let oreStr = t.oreOrd ? `TOTALE ORE: ${Math.round(t.oreOrd)}` : ''
    const diCui = []
    if (notturne) diCui.push(`${Math.round(notturne)} notturne`)
    if (festive) diCui.push(`${Math.round(festive)} festive`)
    if (domenicali) diCui.push(`${Math.round(domenicali)} domenicali`)
    if (sabato) diCui.push(`${Math.round(sabato)} sabato`)
    if (diCui.length) oreStr += ` di cui ${diCui.join(', ')}`
    if (t.ferie) oreStr += ` + ${t.ferie} ${t.ferie===1?'feria':'ferie'}`
    if (t.malattia) oreStr += ` + malattia (${t.malattia} gg)`
    if (straord) oreStr += ` + ${Math.round(straord)}h straordinario 25%`
    if (oreStr) note += oreStr + '\n'

    if (m.lul_data && m.lul_ore) note += `SEGNA SUL LUL ${new Date(m.lul_data).toLocaleDateString('it-IT')} ${m.lul_ore} ORE\n`
    if (m.cessione_quinto) note += `Trattenuta 1/5 stipendio${m.cessione_ente?' '+m.cessione_ente:''}\n`
    if (m.trattenuta_sindacale) note += `Trattenuta sindacale ${m.trattenuta_sindacale} 1%\n`
    if (m.acconto_importo) note += `Togliere acconto € ${m.acconto_importo}\n`
    if (m.premio_importo) note += `Premio € ${m.premio_importo}\n`
    if (m.rimborso_importo) note += `Rimborso € ${m.rimborso_importo}\n`
    if (m.finanziamento_importo) note += `Finanziamento${m.finanziamento_ente?' '+m.finanziamento_ente:''} € ${m.finanziamento_importo}\n`
    if (m.flag_finanziamento) note += `VEDI FINANZIAMENTO (verificare)\n`
    if (m.nuovo_iban) note += `NUOVO IBAN: ${m.nuovo_iban}\n`
    if (m.note_commercialista) note += m.note_commercialista + '\n'

    html += `<div class="op">
      <div class="op-name">${nome}</div>
      ${note ? `<div class="note-box">${note.trim()}</div>` : '<div style="color:#999;font-size:12px;">Nessuna nota</div>'}
    </div>`
  })

  html += `</body></html>`
  const win = window.open('', '_blank', 'width=900,height=700')
  win.document.write(html)
  win.document.close()
  win.print()
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initPresenzeDettagliate() {
  const section = document.getElementById('presenze-dettagliate')
  if (!section) return

  const now = new Date()
  _anno = now.getFullYear()
  _mese = now.getMonth() + 1

  const meseInput = document.getElementById('pd-mese')
  if (meseInput && !meseInput.value) {
    meseInput.value = `${_anno}-${pad(_mese)}`
  }

  // Espone funzione globale per onclick inline
  window._pdOpen = openDrawer

  async function refresh() {
    document.getElementById('pd-table-body').innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af;">Caricamento...</td></tr>'
    await loadOperatori()
    await loadMese()
    renderLista()
  }

  meseInput?.addEventListener('change', () => {
    const [y,m] = meseInput.value.split('-').map(Number)
    _anno = y; _mese = m
    refresh()
  })

  document.getElementById('pd-refresh-btn')?.addEventListener('click', refresh)
  document.getElementById('pd-export-btn')?.addEventListener('click', exportRiepilogo)

  await refresh()
}
