import supabase from '../supabase.js'
import { showToast } from './clienti.js'

// ── Modelli ──────────────────────────────────────────────────────────────────

async function loadModelliContratto() {
  const { data, error } = await supabase.from('modelli_contratto').select('*').order('tipo_cliente')
  if (error) { showToast('Errore caricamento modelli', 'error'); return [] }
  return data || []
}

const TIPO_ICON = { condominio: '🏢', azienda: '🏭', privato: '🏠' }

function renderModelliList(modelli) {
  const el = document.getElementById('modelli-list')
  if (!el) return
  el.innerHTML = ''
  if (!modelli.length) {
    el.innerHTML = '<p style="color:var(--gray-500);padding:24px;">Nessun modello presente.</p>'
    return
  }
  modelli.forEach(m => {
    const card = document.createElement('div')
    card.className = 'card'
    card.style.cssText = 'padding:18px 20px;display:flex;align-items:center;gap:16px;margin-bottom:12px;'
    card.innerHTML = `
      <div style="font-size:30px;flex-shrink:0;">${TIPO_ICON[m.tipo_cliente] || '📄'}</div>
      <div style="flex:1;min-width:0;">
        <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:var(--gray-900);">${m.nome}</p>
        <p style="margin:0 0 6px;font-size:12px;color:var(--gray-500);">${m.descrizione || ''}</p>
        <span class="badge ${m.attivo ? 'badge-success' : 'badge-danger'}">${m.attivo ? 'Attivo' : 'Inattivo'}</span>
        <span class="badge badge-info" style="margin-left:6px;">${m.tipo_cliente}</span>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" data-action="config-modello" data-id="${m.id}">Configura dati</button>
      </div>
    `
    el.appendChild(card)
  })
}

async function openModalModello(id) {
  const modal = document.getElementById('modello-config-modal')
  if (!modal) return
  const form = modal.querySelector('form')
  if (!form) return

  const { data, error } = await supabase.from('modelli_contratto').select('*').eq('id', id).single()
  if (error) { showToast('Errore apertura modello', 'error'); return }

  form.dataset.modelloId = id
  const mcNome = modal.querySelector('#mc-nome')
  if (mcNome) mcNome.textContent = data.nome
  const mcTipo = modal.querySelector('#mc-tipo')
  if (mcTipo) mcTipo.textContent = data.tipo_cliente

  const cfg = data.configurazione || {}
  form.querySelectorAll('[name]').forEach(el => {
    const v = cfg[el.name]
    el.value = v !== undefined ? v : ''
  })

  modal.classList.add('active')
}

async function saveModelloConfig(id, form) {
  const fd = new FormData(form)
  const cfg = {}
  fd.forEach((v, k) => {
    cfg[k] = ['giorni_pagamento', 'giorni_preavviso_disdetta', 'giorni_preavviso_recesso', 'giorni_termine_diffida'].includes(k)
      ? parseInt(v) || 0
      : v
  })
  const { error } = await supabase.from('modelli_contratto').update({ configurazione: cfg }).eq('id', id)
  if (error) { showToast('Errore salvataggio configurazione', 'error'); return false }
  showToast('Configurazione salvata', 'success')
  return true
}

// ── Scheda Contratto ─────────────────────────────────────────────────────────

export async function openSchedaContratto(contrattoId) {
  const modal = document.getElementById('scheda-contratto-modal')
  if (!modal) return

  const { data: contratto, error: errC } = await supabase
    .from('contratti')
    .select('*, clienti(ragione_sociale, tipo, citta, indirizzo, piva, provincia, referente, telefono)')
    .eq('id', contrattoId)
    .single()
  if (errC) { showToast('Errore caricamento contratto', 'error'); return }

  const tipoCliente = contratto.clienti?.tipo || 'condominio'
  const { data: modelli } = await supabase
    .from('modelli_contratto')
    .select('*')
    .eq('tipo_cliente', tipoCliente)
    .eq('attivo', true)
    .limit(1)
  const cfg = modelli?.[0]?.configurazione || {}

  const form = modal.querySelector('form')
  form.dataset.contrattoId = contrattoId
  form.reset()

  const scheda = contratto.scheda_dati || {}
  const c = contratto.clienti || {}

  const set = (name, ...vals) => {
    const el = form.querySelector(`[name="${name}"]`)
    if (!el) return
    for (const v of vals) {
      if (v !== null && v !== undefined && v !== '') { el.value = v; return }
    }
  }

  // Committente
  set('nome_condominio',       scheda.nome_condominio,       c.ragione_sociale)
  set('comune_condominio',     scheda.comune_condominio,     c.citta)
  set('indirizzo_condominio',  scheda.indirizzo_condominio,  c.indirizzo)
  set('cf_condominio',         scheda.cf_condominio,         c.piva)
  set('nome_amministratore',   scheda.nome_amministratore,   c.referente)

  // Immobile / Servizio
  set('indirizzo_stabile',     scheda.indirizzo_stabile,     c.indirizzo)
  set('interventi_settimanali',scheda.interventi_settimanali)
  set('giorni_intervento',     scheda.giorni_intervento)
  set('orario_intervento',     scheda.orario_intervento)

  // Corrispettivo
  set('corrispettivo_mensile', scheda.corrispettivo_mensile, contratto.importo_mensile)
  set('giorni_pagamento',      scheda.giorni_pagamento,      cfg.giorni_pagamento, 30)
  set('iban',                  scheda.iban,                  cfg.iban)

  // Durata
  set('durata_anni',              scheda.durata_anni)
  set('data_inizio_contratto',    scheda.data_inizio_contratto,    contratto.data_inizio)
  set('data_fine_contratto',      scheda.data_fine_contratto,      contratto.data_fine)
  set('giorni_preavviso_disdetta',scheda.giorni_preavviso_disdetta,cfg.giorni_preavviso_disdetta, 60)

  // Condizioni
  set('massimale_polizza',        scheda.massimale_polizza,       cfg.massimale_polizza)
  set('giorni_preavviso_recesso', scheda.giorni_preavviso_recesso,cfg.giorni_preavviso_recesso, 30)
  set('giorni_termine_diffida',   scheda.giorni_termine_diffida,  cfg.giorni_termine_diffida, 15)
  set('foro_competente',          scheda.foro_competente,         cfg.foro_competente)

  // Firma
  set('luogo_firma', scheda.luogo_firma)
  set('data_firma',  scheda.data_firma)

  modal.dataset.cfg = JSON.stringify(cfg)
  modal.dataset.contrattoId = contrattoId
  const title = modal.querySelector('#scheda-title')
  if (title) title.textContent = `Scheda — ${c.ragione_sociale || 'Contratto'}`
  modal.classList.add('active')
}

async function saveScheda(contrattoId, form) {
  const fd = new FormData(form)
  const dati = {}
  fd.forEach((v, k) => { dati[k] = v })
  const { error } = await supabase.from('contratti').update({ scheda_dati: dati }).eq('id', contrattoId)
  if (error) { showToast('Errore salvataggio scheda', 'error'); return false }
  showToast('Scheda salvata', 'success')
  return true
}

// ── Genera contratto HTML ─────────────────────────────────────────────────────

function generaContratto(form, cfg) {
  const fd = new FormData(form)
  const d = {}
  fd.forEach((v, k) => { d[k] = v })

  const val = k => d[k] || `___________`
  const euroFmt = v => v
    ? `Euro ${parseFloat(v).toLocaleString('it-IT', { minimumFractionDigits: 2 })} (oltre IVA di legge)`
    : `Euro ___________`

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <title>Contratto — ${val('nome_condominio')}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.7; max-width: 820px; margin: 40px auto; padding: 0 48px; color: #111; }
    h1 { text-align:center; font-size:14pt; text-transform:uppercase; letter-spacing:.5px; margin-bottom:2px; }
    h2 { text-align:center; font-size:13pt; text-transform:uppercase; margin-top:0; margin-bottom:20px; }
    .parti { margin:16px 0; }
    .art { margin-top:18px; }
    .art-title { font-weight:bold; }
    ul { margin:6px 0 6px 20px; }
    li { margin-bottom:3px; }
    .firme { display:flex; justify-content:space-between; margin-top:48px; gap:40px; }
    .firma-box { flex:1; text-align:center; }
    .firma-line { border-top:1px solid #000; padding-top:4px; font-size:11pt; }
    @media print {
      body { margin:20mm; padding:0; max-width:100%; }
      .no-print { display:none; }
    }
  </style>
</head>
<body>
<div class="no-print" style="text-align:right;margin-bottom:20px;">
  <button onclick="window.print()" style="padding:8px 18px;background:#0d9488;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">🖨 Stampa / Salva PDF</button>
</div>

<h1>Contratto di Appalto per Servizio di Pulizia</h1>
<h2>di Parti Comuni Condominiali</h2>

<p>Con la presente scrittura privata, da valersi ad ogni effetto di legge, tra:</p>

<div class="parti">
<p>Il Condominio <strong>"${val('nome_condominio')}"</strong>, con sede in ${val('comune_condominio')}, ${val('indirizzo_condominio')}, C.F. ${val('cf_condominio')}, in persona dell'Amministratore <strong>${val('nome_amministratore')}</strong>, di seguito denominato <em>"Committente"</em>;</p>
</div>

<p style="text-align:center;"><strong>e</strong></p>

<div class="parti">
<p><strong>${cfg.ragione_sociale_appaltatore || '___________'}</strong>, con sede legale in ${cfg.comune_appaltatore || '___________'}, ${cfg.indirizzo_appaltatore || '___________'}, P.IVA/C.F. ${cfg.piva_appaltatore || '___________'}, iscritta al Registro Imprese di ${cfg.registro_imprese || '___________'}, in persona del legale rappresentante <strong>${cfg.legale_rappresentante || '___________'}</strong>, di seguito denominata <em>"Appaltatore"</em>;</p>
</div>

<p>di seguito, congiuntamente, le "Parti";</p>

<p><strong>Premesso che</strong></p>
<ul>
  <li>il Committente intende affidare in appalto il servizio di pulizia delle parti comuni dello stabile sito in ${val('indirizzo_stabile')};</li>
  <li>l'Appaltatore è in possesso dei requisiti tecnici, organizzativi e professionali necessari per l'esecuzione del servizio e dichiara di operare nel rispetto del CCNL Multiservizi/Imprese di Pulizia e dei relativi obblighi contributivi e assicurativi;</li>
  <li>le Parti intendono regolare i rapporti reciproci come segue;</li>
</ul>
<p>si conviene e si stipula quanto segue:</p>

<div class="art">
  <p class="art-title">Art. 1 – Oggetto del contratto</p>
  <p>L'Appaltatore si impegna a svolgere, in favore del Committente, il servizio di pulizia delle parti comuni dello stabile sito in ${val('indirizzo_stabile')}, comprendente in particolare:</p>
  <ul>
    <li>scale, pianerottoli e ballatoi;</li>
    <li>ingresso, atrio e zona citofoni/cassette postali;</li>
    <li>ascensore (cabina, specchi, pulsantiera);</li>
    <li>vetrate e infissi delle parti comuni;</li>
    <li>aree esterne pertinenziali, cortile e marciapiedi di competenza;</li>
    <li>locali tecnici e box/cantine comuni (se previsti);</li>
    <li>gestione e pulizia dei locali raccolta rifiuti, con movimentazione cassonetti nei giorni di raccolta.</li>
  </ul>
</div>

<div class="art">
  <p class="art-title">Art. 2 – Durata</p>
  <p>Il presente contratto ha durata di <strong>${val('durata_anni')} anni</strong>, con decorrenza dal <strong>${val('data_inizio_contratto')}</strong> e scadenza il <strong>${val('data_fine_contratto')}</strong>, e si intenderà tacitamente rinnovato per pari periodo, salvo disdetta da comunicarsi da una delle Parti all'altra mediante lettera raccomandata A/R o PEC, con un preavviso di almeno <strong>${val('giorni_preavviso_disdetta')} giorni</strong> rispetto alla scadenza.</p>
</div>

<div class="art">
  <p class="art-title">Art. 3 – Modalità e frequenza del servizio</p>
  <p>Il servizio sarà svolto con la frequenza di n. <strong>${val('interventi_settimanali')} interventi settimanali</strong>, nei giorni <strong>${val('giorni_intervento')}</strong>, in orario <strong>${val('orario_intervento')}</strong>, salvo diversa intesa tra le Parti. L'Appaltatore si impegna a garantire la presenza di personale qualificato in numero adeguato e a fornire, a propria cura e spese, le attrezzature, i macchinari e i materiali di consumo necessari.</p>
</div>

<div class="art">
  <p class="art-title">Art. 4 – Corrispettivo e modalità di pagamento</p>
  <p>Per le prestazioni di cui al presente contratto, il Committente corrisponderà all'Appaltatore un corrispettivo mensile di <strong>${euroFmt(d['corrispettivo_mensile'])}</strong>. Il pagamento dovrà avvenire entro <strong>${val('giorni_pagamento')} giorni</strong> dalla data di emissione della fattura, mediante bonifico bancario sull'IBAN: <strong>${val('iban')}</strong>. In caso di ritardato pagamento decorreranno gli interessi moratori nella misura di legge. Il corrispettivo potrà essere aggiornato annualmente sulla base della variazione dell'indice ISTAT FOI.</p>
</div>

<div class="art">
  <p class="art-title">Art. 5 – Obblighi dell'Appaltatore</p>
  <p>L'Appaltatore si obbliga a: eseguire il servizio con personale proprio regolarmente assunto secondo il CCNL di settore; impiegare personale dotato di tesserino identificativo, divisa e DPI idonei; mantenere la massima riservatezza sui dati acquisiti; segnalare prontamente eventuali guasti o anomalie; garantire la sostituzione del personale in caso di assenza senza interruzione del servizio. L'Appaltatore stipulerà e manterrà in vigore una polizza di responsabilità civile verso terzi (RCT/RCO) con massimale non inferiore a <strong>${val('massimale_polizza')}</strong>.</p>
</div>

<div class="art">
  <p class="art-title">Art. 6 – Obblighi del Committente</p>
  <p>Il Committente si obbliga a: consentire l'accesso del personale dell'Appaltatore alle parti comuni; garantire la disponibilità di acqua e corrente elettrica ove necessario; corrispondere il pagamento del corrispettivo alle scadenze convenute; comunicare tempestivamente eventuali variazioni agli spazi o agli orari.</p>
</div>

<div class="art">
  <p class="art-title">Art. 7 – Responsabilità e danni</p>
  <p>L'Appaltatore risponderà di eventuali danni a persone o cose causati dal proprio personale nell'esecuzione del servizio, fatta salva l'operatività della polizza assicurativa di cui all'art. 5. Resta esclusa qualsiasi responsabilità dell'Appaltatore per danni derivanti da vizi strutturali o manutentivi dell'immobile.</p>
</div>

<div class="art">
  <p class="art-title">Art. 8 – Subappalto e cessione del contratto</p>
  <p>È fatto divieto all'Appaltatore di cedere, in tutto o in parte, il presente contratto ovvero di subappaltare il servizio a terzi senza il preventivo consenso scritto del Committente.</p>
</div>

<div class="art">
  <p class="art-title">Art. 9 – Risoluzione e recesso</p>
  <p>Ciascuna delle Parti potrà recedere anticipatamente dal contratto con un preavviso scritto di almeno <strong>${val('giorni_preavviso_recesso')} giorni</strong>. Il Committente potrà risolvere il contratto in caso di grave e reiterato inadempimento dell'Appaltatore, previa diffida scritta rimasta senza esito entro <strong>${val('giorni_termine_diffida')} giorni</strong>.</p>
</div>

<div class="art">
  <p class="art-title">Art. 10 – Trattamento dei dati personali</p>
  <p>Le Parti si impegnano a trattare i dati personali reciprocamente acquisiti in conformità al Regolamento (UE) 2016/679 (GDPR) e alla normativa nazionale vigente, esclusivamente per le finalità connesse all'esecuzione del presente accordo.</p>
</div>

<div class="art">
  <p class="art-title">Art. 11 – Controversie e foro competente</p>
  <p>Per qualsiasi controversia derivante dall'interpretazione, esecuzione o risoluzione del presente contratto sarà competente in via esclusiva il Foro di <strong>${val('foro_competente')}</strong>.</p>
</div>

<div class="art">
  <p class="art-title">Art. 12 – Disposizioni finali</p>
  <p>Per quanto non espressamente previsto dal presente contratto, si applicano le disposizioni del Codice Civile e della normativa di settore vigente. Eventuali modifiche dovranno essere effettuate in forma scritta e sottoscritte da entrambe le Parti.</p>
</div>

<p style="margin-top:20px;"><em>Allegati: Allegato A – Capitolato/Piano di Pulizia.</em></p>
<p>Letto, confermato e sottoscritto.</p>
<p>Luogo e data: <strong>${val('luogo_firma')}, ${val('data_firma')}</strong></p>

<div class="firme">
  <div class="firma-box">
    <div style="height:60px;"></div>
    <div class="firma-line">Il Committente (Amministratore)</div>
  </div>
  <div class="firma-box">
    <div style="height:60px;"></div>
    <div class="firma-line">L'Appaltatore</div>
  </div>
</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { showToast('Popup bloccato — consenti i popup per questa pagina', 'warning'); return }
  win.document.write(html)
  win.document.close()
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initModelliContratti() {
  // Load modelli when section becomes visible
  const maybeLoad = () => {
    if (document.getElementById('modelli-list')) {
      loadModelliContratto().then(renderModelliList)
    }
  }
  maybeLoad()

  // Re-load on section activate
  document.querySelectorAll('[data-target="modelli-contratti"]').forEach(el => {
    el.addEventListener('click', maybeLoad)
  })

  // Config modal
  const cfgModal = document.getElementById('modello-config-modal')
  cfgModal?.querySelector('.mc-close')?.addEventListener('click', () => cfgModal.classList.remove('active'))
  cfgModal?.querySelector('form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    const ok = await saveModelloConfig(form.dataset.modelloId, form)
    if (ok) cfgModal.classList.remove('active')
  })

  // Scheda modal
  const schedaModal = document.getElementById('scheda-contratto-modal')
  schedaModal?.querySelector('.scheda-close')?.addEventListener('click', () => schedaModal.classList.remove('active'))
  schedaModal?.querySelector('#scheda-salva-btn')?.addEventListener('click', async () => {
    const form = schedaModal.querySelector('form')
    const id = schedaModal.dataset.contrattoId
    await saveScheda(id, form)
  })
  schedaModal?.querySelector('#scheda-genera-btn')?.addEventListener('click', () => {
    const form = schedaModal.querySelector('form')
    const cfg = JSON.parse(schedaModal.dataset.cfg || '{}')
    generaContratto(form, cfg)
  })
  schedaModal?.querySelector('form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    const id = schedaModal.dataset.contrattoId
    const ok = await saveScheda(id, form)
    if (ok) schedaModal.classList.remove('active')
  })

  // Global delegation
  document.addEventListener('click', async e => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t.dataset.action === 'config-modello' && t.dataset.id) {
      await openModalModello(t.dataset.id)
    }
    if (t.dataset.action === 'scheda-contratto' && t.dataset.id) {
      await openSchedaContratto(t.dataset.id)
    }
  })
}
