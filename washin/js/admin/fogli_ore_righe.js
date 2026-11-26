// Righe dei fogli ore per una settimana: contratti delle operatrici (contratti_operatori)
// e delle squadre (squadre_contratti, v48). Una squadra assegnata a un contratto
// SOSTITUISCE gli operatori fissi del contratto nel suo periodo: se copre tutta la
// settimana il contratto sparisce dal foglio personale; se ne copre solo una parte
// compare su entrambi i fogli con l'indicazione dei giorni.
import supabase from '../supabase.js'

const PERIODO = { settimana: 'settimana', mese: 'mese', anno: 'anno', giorno: 'giorno', a_richiesta: 'a richiesta' }
const CONTRATTO = 'id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo)'

const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const gm = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()}/${d.getMonth() + 1}` }
const fmtMin = m => {
  if (m == null) return '—'
  const h = Math.floor(m / 60), mm = m % 60
  return (h ? `${h}h` : '') + (mm ? ` ${String(mm).padStart(2, '0')}'` : (h ? '' : "0'"))
}

// Testo del periodo di un'assegnazione dentro la settimana ('' se la copre tutta)
function periodoInSettimana(a, lun) {
  const dom = addDaysIso(lun, 6)
  const da = a.dal > lun ? a.dal : null
  const fino = a.al && a.al < dom ? a.al : null
  if (da && fino) return `dal ${gm(da)} al ${gm(fino)}`
  if (da) return `dal ${gm(da)}`
  if (fino) return `fino al ${gm(fino)}`
  return ''
}

// Una riga per servizio del contratto (i servizi "a richiesta" non vanno sul foglio)
export function righeContratto(k, nota = '') {
  if (!k || (k.stato && k.stato !== 'attivo')) return []
  const nome = k.clienti?.nome_breve || k.clienti?.ragione_sociale || 'Contratto'
  const servizi = (k.contratti_servizi || []).filter(s => s.interventi_periodo !== 'a_richiesta')
    .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
  const base = { contratto_id: k.id, codice: k.numero_contratto || '', etichetta: nome }
  const conNota = t => nota ? `${nota} · ${t}` : t
  if (!servizi.length) return [{ ...base, servizio_id: null, dettaglio: conNota('tempo da definire sul contratto'), minuti_previsti: null }]
  return servizi.map(s => {
    const freq = s.interventi_numero != null && s.interventi_periodo
      ? `${String(s.interventi_numero).replace('.', ',')} v/${PERIODO[s.interventi_periodo] || s.interventi_periodo}` : ''
    const dettaglio = [s.descrizione ? s.descrizione[0].toUpperCase() + s.descrizione.slice(1) : 'Servizio',
      s.minuti_intervento != null ? fmtMin(s.minuti_intervento).trim() : 'tempo da definire', freq].filter(Boolean).join(' · ')
    return { ...base, servizio_id: s.id, dettaglio: conNota(dettaglio), minuti_previsti: s.minuti_intervento }
  })
}

const ordina = list => list.sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it', { numeric: true }))

// Assegnazioni squadra ↔ contratto che toccano la settimana (null se manca la v48)
async function assegnazioniSettimana(lun) {
  const dom = addDaysIso(lun, 6)
  const { data, error } = await supabase.from('squadre_contratti')
    .select(`squadra_id, contratto_id, dal, al, squadre(nome), contratti(${CONTRATTO})`)
    .lte('dal', dom).or(`al.is.null,al.gte.${lun}`)
  if (error) { console.warn('squadre_contratti non disponibile', error.message); return null }
  return data || []
}

// Righe personali di ogni operatrice: contratti flaggati, tolti quelli coperti da una squadra
export async function righePerOperatori(ids, lun) {
  const [{ data, error }, assegn] = await Promise.all([
    supabase.from('contratti_operatori').select(`operatore_id, contratti(${CONTRATTO})`).in('operatore_id', ids),
    assegnazioniSettimana(lun),
  ])
  if (error) throw error
  const coperti = new Map() // contratto_id → nota (o '' se coperto tutta la settimana)
  for (const a of assegn || []) {
    const p = periodoInSettimana(a, lun)
    const prima = coperti.get(a.contratto_id)
    if (prima === '') continue
    coperti.set(a.contratto_id, p ? `squadra ${a.squadre?.nome || ''} ${p}`.replace(/\s+/g, ' ') : '')
  }
  const per = new Map(ids.map(id => [id, []]))
  for (const row of data || []) {
    const nota = coperti.get(row.contratti?.id)
    if (nota === '') continue // la squadra copre tutta la settimana
    per.get(row.operatore_id).push(...righeContratto(row.contratti, nota || ''))
  }
  for (const list of per.values()) ordina(list)
  return per
}

// Righe dei contratti assegnati a ogni squadra nella settimana
export async function righePerSquadre(ids, lun) {
  const assegn = await assegnazioniSettimana(lun)
  if (assegn === null) throw new Error('Tabelle squadre mancanti: applica la migrazione v48')
  const per = new Map(ids.map(id => [id, []]))
  const visti = new Set()
  for (const a of assegn) {
    if (!per.has(a.squadra_id)) continue
    const key = `${a.squadra_id}|${a.contratto_id}`
    if (visti.has(key)) continue
    visti.add(key)
    per.get(a.squadra_id).push(...righeContratto(a.contratti, periodoInSettimana(a, lun)))
  }
  for (const list of per.values()) ordina(list)
  return per
}

// Numero di contratti attivi per squadra nella settimana (per l'elenco in Stampa)
export async function contrattiSquadreSettimana(lun) {
  const assegn = await assegnazioniSettimana(lun)
  if (assegn === null) return null
  const n = new Map()
  for (const a of assegn) {
    if (a.contratti?.stato && a.contratti.stato !== 'attivo') continue
    n.set(a.squadra_id, (n.get(a.squadra_id) || new Set()).add(a.contratto_id))
  }
  return new Map([...n].map(([k, s]) => [k, s.size]))
}
