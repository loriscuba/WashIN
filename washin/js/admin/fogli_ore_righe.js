// Righe dei fogli ore per una settimana: contratti delle operatrici (contratti_operatori)
// e delle squadre. I fogli di squadra (e dei suoi componenti) nascono SOLO dai giri (v52)
// che passano nella settimana; un'assegnazione squadre_contratti con data "al" è una
// copertura temporanea che sposta i giorni del giro a un'altra squadra.
// Una squadra SOSTITUISCE gli operatori fissi del contratto: se lo copre tutta la
// settimana il contratto sparisce dal foglio personale; se ne copre solo una parte
// compare su entrambi i fogli con l'indicazione dei giorni.
import supabase from '../supabase.js'
import { caricaGiri, passaggiSettimana, GIORNI_GIRO } from './giri_calendario.js'

const PERIODO = { settimana: 'settimana', mese: 'mese', anno: 'anno', giorno: 'giorno', a_richiesta: 'a richiesta' }
const CONTRATTO = 'id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo)'

const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtMin = m => {
  if (m == null) return '—'
  const h = Math.floor(m / 60), mm = m % 60
  return (h ? `${h}h` : '') + (mm ? ` ${String(mm).padStart(2, '0')}'` : (h ? '' : "0'"))
}

// Servizi del contratto senza doppioni: righe identiche (stessa descrizione, tempo e
// frequenza), come quelle importate due volte dall'elenco condomini, contano una volta sola
export function serviziUnici(servizi) {
  const visti = new Set()
  return (servizi || []).filter(s => s.interventi_periodo !== 'a_richiesta')
    .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
    .filter(s => {
      const k = [String(s.descrizione || '').trim().toLowerCase(), s.minuti_intervento ?? '', s.interventi_numero ?? '', s.interventi_periodo || ''].join('|')
      if (visti.has(k)) return false
      visti.add(k)
      return true
    })
}

// Una riga per servizio del contratto (i servizi "a richiesta" non vanno sul foglio)
export function righeContratto(k, nota = '') {
  if (!k || (k.stato && k.stato !== 'attivo')) return []
  const nome = k.clienti?.nome_breve || k.clienti?.ragione_sociale || 'Contratto'
  const servizi = serviziUnici(k.contratti_servizi)
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

// Passaggi dei giri nella settimana, con la squadra che li fa (null se manca la v48/v52)
async function passaggiDellaSettimana(lun) {
  const dom = addDaysIso(lun, 6)
  const { data, error } = await supabase.from('squadre_contratti')
    .select('squadra_id, contratto_id, dal, al')
    .lte('dal', dom).or(`al.is.null,al.gte.${lun}`)
  if (error) { console.warn('squadre_contratti non disponibile', error.message); return null }
  const giri = await caricaGiri(CONTRATTO)
  if (giri === null) return null
  return passaggiSettimana(giri, data || [], lun)
    .filter(p => p.riga.contratti && (!p.riga.contratti.stato || p.riga.contratti.stato === 'attivo'))
}

const giorniTesto = gg => [...new Set(gg)].sort((a, b) => a - b).map(d => GIORNI_GIRO[d].toLowerCase()).join(', ')

// Righe personali di ogni operatrice: contratti flaggati, tolti quelli coperti da una squadra
export async function righePerOperatori(ids, lun) {
  const [{ data, error }, pass] = await Promise.all([
    supabase.from('contratti_operatori').select(`operatore_id, contratti(${CONTRATTO})`).in('operatore_id', ids),
    passaggiDellaSettimana(lun),
  ])
  if (error) throw error
  // i contratti dei giri che passano in settimana vanno sul foglio della squadra
  const coperti = new Set((pass || []).map(p => p.riga.contratto_id))
  const per = new Map(ids.map(id => [id, []]))
  for (const row of data || []) {
    if (coperti.has(row.contratti?.id)) continue
    per.get(row.operatore_id).push(...righeContratto(row.contratti))
  }
  for (const list of per.values()) ordina(list)
  return per
}

// Righe dei giri di ogni squadra nella settimana: una riga per servizio del contratto
// (solo quello scelto nel giro, se indicato), con il giro e i giorni in cui passa
export async function righePerSquadre(ids, lun) {
  const pass = await passaggiDellaSettimana(lun)
  if (pass === null) throw new Error('Tabelle squadre o giri mancanti: applica le migrazioni v48 e v52')
  const per = new Map(ids.map(id => [id, []]))
  // stesso contratto in più giri della squadra: una riga sola con tutti i giri e i giorni
  const gruppi = new Map()
  for (const p of pass) {
    if (!per.has(p.squadra_id)) continue
    const k = `${p.squadra_id}|${p.riga.contratto_id}`
    const gr = gruppi.get(k) || { squadra_id: p.squadra_id, contratto: p.riga.contratti, intero: false, servizi: new Set(), note: [] }
    if (p.riga.servizio_id) gr.servizi.add(p.riga.servizio_id)
    else gr.intero = true
    gr.note.push(`${p.giro.nome} · ${giorniTesto(p.giorni)}`)
    gruppi.set(k, gr)
  }
  for (const gr of gruppi.values()) {
    let righe = righeContratto(gr.contratto, [...new Set(gr.note)].join(' + '))
    if (!gr.intero) {
      const solo = righe.filter(r => gr.servizi.has(r.servizio_id))
      if (solo.length) righe = solo
    }
    per.get(gr.squadra_id).push(...righe)
  }
  for (const list of per.values()) ordina(list)
  return per
}

// Numero di contratti dei giri per squadra nella settimana (per l'elenco in Stampa)
export async function contrattiSquadreSettimana(lun) {
  const pass = await passaggiDellaSettimana(lun)
  if (pass === null) return null
  const n = new Map()
  for (const p of pass) n.set(p.squadra_id, (n.get(p.squadra_id) || new Set()).add(p.riga.contratto_id))
  return new Map([...n].map(([k, s]) => [k, s.size]))
}
