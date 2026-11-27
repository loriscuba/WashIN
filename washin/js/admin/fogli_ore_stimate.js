// Operatrici stimate sul contratto (v54): i minuti di una riga servizio sono "a testa",
// il lavoro di un intervento è minuti × operatrici_stimate e si divide tra chi quel giorno
// l'ha davvero fatto, contando tutti i fogli importati (personali e di squadra).
//   45' × 2 fatto da una sola → 1h30 a lei; fatto in due → 45' a testa.
// Si ricalcolano solo le X (righe senza variazione con un servizio del contratto):
// le variazioni hanno il tempo scritto dall'operatrice e restano com'è.
// Contratti senza operatrici_stimate: nessun cambio (ogni X vale i minuti della riga).
import supabase from '../supabase.js'

const chiave = r => `${r.contratto_id}|${r.servizio_id}|${r.data}`

// righe: record di ore_rendicontate appena inseriti (con id).
// Ritorna { righe: le stesse con i minuti ripartiti, altre: righe di altri fogli cambiate }
export async function ripartisciStimate(righe) {
  const cand = righe.filter(r => r.servizio_id && r.contratto_id)
  if (!cand.length) return { righe, altre: [] }
  const contratti = [...new Set(cand.map(r => r.contratto_id))]
  const { data: ks, error } = await supabase.from('contratti')
    .select('id, operatrici_stimate, contratti_servizi(id, minuti_intervento)').in('id', contratti)
  if (error) { console.warn('operatrici_stimate non disponibile (manca la v54?)', error.message); return { righe, altre: [] } }

  const stimate = new Map(), standard = new Map()
  for (const k of ks || []) {
    if (!k.operatrici_stimate) continue
    stimate.set(k.id, k.operatrici_stimate)
    for (const s of k.contratti_servizi || []) standard.set(s.id, s.minuti_intervento)
  }
  const usa = cand.filter(r => stimate.has(r.contratto_id) && standard.get(r.servizio_id) != null)
  if (!usa.length) return { righe, altre: [] }

  // Tutte le ore degli stessi contratti/servizi/giorni, anche da altri fogli
  const date = [...new Set(usa.map(r => r.data))].sort()
  const { data: tutte, error: e2 } = await supabase.from('ore_rendicontate')
    .select('id, contratto_id, servizio_id, operatore_id, data, minuti, minuti_previsti, variazione, foglio_id, riga, fonte')
    .in('contratto_id', [...new Set(usa.map(r => r.contratto_id))])
    .gte('data', date[0]).lte('data', date[date.length - 1])
  if (e2) throw e2
  const chiavi = new Set(usa.map(chiave))
  const persone = new Map() // chiave → Set operatrici
  for (const r of tutte || []) {
    if (!r.operatore_id || !chiavi.has(chiave(r))) continue
    persone.set(chiave(r), (persone.get(chiave(r)) || new Set()).add(r.operatore_id))
  }

  const nuovi = new Map() // id → minuti
  for (const r of tutte || []) {
    if (!chiavi.has(chiave(r)) || r.variazione || r.fonte !== 'foglio') continue
    const n = persone.get(chiave(r))?.size || 1
    const min = Math.round(standard.get(r.servizio_id) * stimate.get(r.contratto_id) / n)
    if (r.minuti !== min || r.minuti_previsti !== min) nuovi.set(r.id, min)
  }
  for (const [id, min] of nuovi) {
    const { error: e3 } = await supabase.from('ore_rendicontate').update({ minuti: min, minuti_previsti: min }).eq('id', id)
    if (e3) throw e3
  }

  const mie = new Set(righe.map(r => r.id))
  const out = righe.map(r => nuovi.has(r.id) ? { ...r, minuti: nuovi.get(r.id), minuti_previsti: nuovi.get(r.id) } : r)
  // Per le colleghe toccate servono tutte le loro ore di quel giorno/contratto (gli interventi
  // si riscrivono con la somma), non solo le righe cambiate
  const toccate = new Set((tutte || []).filter(r => nuovi.has(r.id) && !mie.has(r.id))
    .map(r => `${r.data}|${r.contratto_id}|${r.operatore_id}`))
  const altre = (tutte || []).filter(r => !mie.has(r.id) && toccate.has(`${r.data}|${r.contratto_id}|${r.operatore_id}`))
    .map(r => nuovi.has(r.id) ? { ...r, minuti: nuovi.get(r.id) } : r)
  return { righe: out, altre }
}
