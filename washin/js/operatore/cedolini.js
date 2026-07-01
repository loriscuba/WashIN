import supabase from '../supabase.js'

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

const STATO_BADGE = { caricata: 'badge-warning', verificata: 'badge-info', pagata: 'badge-success' }
const STATO_LABEL = { caricata: 'In attesa', verificata: 'Verificata', pagata: 'Pagata' }

function fmt(v) { return v != null ? '€ ' + Number(v).toFixed(2) : '—' }

let _loaded = false

export async function initCedolini(userId) {
  const list = document.getElementById('cedolini-list')
  if (!list || _loaded) return
  _loaded = true

  list.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:24px 0;">Caricamento...</p>'

  const { data, error } = await supabase
    .from('buste_paga')
    .select('id, anno, mese, ore_lavorate, ore_straordinario, totale_netto, stato, file_path')
    .eq('operatore_id', userId)
    .order('anno', { ascending: false })
    .order('mese', { ascending: false })

  if (error) {
    list.innerHTML = '<p style="color:var(--red-500,#ef4444);text-align:center;padding:24px 0;">Errore nel caricamento.</p>'
    console.error(error)
    return
  }

  if (!data?.length) {
    list.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:24px 0;">Nessun cedolino disponibile.</p>'
    return
  }

  list.innerHTML = ''
  data.forEach(b => {
    const row = document.createElement('div')
    row.className = 'cedolino-row'
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <p style="font-weight:700;margin:0 0 4px;">${MESI[b.mese - 1]} ${b.anno}</p>
          <p style="margin:0;color:var(--gray-500);font-size:14px;">
            Ore ${b.ore_lavorate ?? '—'}${b.ore_straordinario ? ' + ' + b.ore_straordinario + ' str.' : ''}&nbsp;·&nbsp;Netto ${fmt(b.totale_netto)}
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span class="badge ${STATO_BADGE[b.stato] || 'badge-warning'}">${STATO_LABEL[b.stato] || b.stato}</span>
          ${b.file_path
            ? `<button class="btn btn-secondary btn-sm" data-action="download-cedolino" data-path="${b.file_path}">⬇ PDF</button>`
            : '<span style="font-size:12px;color:var(--gray-400);">PDF non disponibile</span>'}
        </div>
      </div>
    `
    list.appendChild(row)
  })

  list.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="download-cedolino"]')
    if (!btn) return
    const path = btn.dataset.path
    if (!path) return
    btn.disabled = true
    btn.textContent = '...'
    const { data: signed, error: signErr } = await supabase.storage.from('buste-paga').createSignedUrl(path, 3600)
    btn.disabled = false
    btn.textContent = '⬇ PDF'
    if (signErr || !signed?.signedUrl) { alert('Errore nel download del cedolino.'); return }
    window.open(signed.signedUrl, '_blank')
  })
}
