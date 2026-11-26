// Dopo la conferma di un foglio ore: le ore lette finiscono anche sugli interventi
// (colonne ore_ordinarie / ore_ordinarie_op2) e sul cartellino (presenze_giornaliere),
// come se fossero state inserite con "Inserisci ore".
//
// Per ogni giorno, contratto e operatrice si sommano i minuti del foglio, poi:
//   - se c'è un intervento quel giorno su quel contratto in cui l'operatrice è
//     operatore 1 o 2, le ore vanno lì (sovrascritte: reimportare il foglio non raddoppia);
//   - altrimenti si crea un intervento "completato" con quelle ore (due operatrici per
//     intervento), così il giorno dopo un nuovo import lo ritrova e lo aggiorna.
// Le ore inserite a mano su interventi senza X nel foglio non vengono toccate.
import supabase from '../supabase.js'

const ore = min => Math.round((min / 60) * 100) / 100

let _colonne = null // servizio_id (v50) e squadra_id (v48) esistono?
async function colonne() {
  if (_colonne) return _colonne
  const [a, b] = await Promise.all([
    supabase.from('interventi').select('servizio_id').limit(1),
    supabase.from('interventi').select('squadra_id').limit(1),
  ])
  _colonne = { servizio: !a.error, squadra: !b.error }
  return _colonne
}

// righe: record di ore_rendicontate appena salvati; squadraId: squadra del foglio (o null)
export async function ribaltaSuInterventi(righe, squadraId = null) {
  if (!righe.length) return { aggiornati: 0, creati: 0 }
  const col = await colonne()

  // giorno|contratto|operatrice → { minuti, servizi }
  const gruppi = new Map()
  for (const r of righe) {
    if (!r.operatore_id) continue
    const k = `${r.data}|${r.contratto_id}|${r.operatore_id}`
    const g = gruppi.get(k) || { data: r.data, contratto_id: r.contratto_id, operatore_id: r.operatore_id, minuti: 0, servizi: new Set() }
    g.minuti += r.minuti || 0
    g.servizi.add(r.servizio_id || null)
    gruppi.set(k, g)
  }
  if (!gruppi.size) return { aggiornati: 0, creati: 0 }
  const date = [...new Set([...gruppi.values()].map(g => g.data))].sort()
  const contratti = [...new Set([...gruppi.values()].map(g => g.contratto_id))]

  const { data: ivs, error } = await supabase.from('interventi')
    .select('id, data_pianificata, contratto_id, operatore_id, operatore2_id, stato')
    .gte('data_pianificata', date[0]).lte('data_pianificata', date[date.length - 1])
    .in('contratto_id', contratti).neq('stato', 'annullato')
    .order('created_at', { ascending: true })
  if (error) throw error

  // Aggiornamenti per intervento: { ore_ordinarie?, ore_ordinarie_op2? }
  const update = new Map()
  const senza = [] // gruppi senza intervento
  for (const g of gruppi.values()) {
    const iv = (ivs || []).find(i => i.data_pianificata === g.data && i.contratto_id === g.contratto_id &&
      (i.operatore_id === g.operatore_id || i.operatore2_id === g.operatore_id))
    if (!iv) { senza.push(g); continue }
    const u = update.get(iv.id) || { iv, campi: {} }
    if (iv.operatore_id === g.operatore_id) Object.assign(u.campi, { ore_ordinarie: ore(g.minuti) })
    else Object.assign(u.campi, { ore_ordinarie_op2: ore(g.minuti) })
    update.set(iv.id, u)
  }

  for (const { iv, campi } of update.values()) {
    if (['pianificato', 'in_corso'].includes(iv.stato)) campi.stato = 'completato'
    const { error: e } = await supabase.from('interventi').update(campi).eq('id', iv.id)
    if (e) throw e
  }

  // Nuovi interventi: per giorno e contratto, due operatrici per intervento
  const perGiorno = new Map()
  for (const g of senza) {
    const k = `${g.data}|${g.contratto_id}`
    perGiorno.set(k, [...(perGiorno.get(k) || []), g])
  }
  const nuovi = []
  for (const lista of perGiorno.values()) {
    for (let i = 0; i < lista.length; i += 2) {
      const [a, b] = lista.slice(i, i + 2)
      const servizi = new Set([...a.servizi, ...(b ? b.servizi : [])])
      const rec = {
        contratto_id: a.contratto_id, data_pianificata: a.data, stato: 'completato', tipo_pulizia: 'ordinaria',
        operatore_id: a.operatore_id, ore_ordinarie: ore(a.minuti), ore_straordinario: 0,
        operatore2_id: b?.operatore_id || null, ore_ordinarie_op2: b ? ore(b.minuti) : null, ore_straordinario_op2: 0,
        note_ore: 'da foglio ore',
      }
      if (col.servizio && servizi.size === 1 && [...servizi][0]) rec.servizio_id = [...servizi][0]
      if (col.squadra && squadraId) rec.squadra_id = squadraId
      nuovi.push(rec)
    }
  }
  if (nuovi.length) {
    const { error: e } = await supabase.from('interventi').insert(nuovi)
    if (e) throw e
  }

  // Cartellino: totale ore degli interventi del giorno per ogni operatrice coinvolta
  const coppie = new Set([...gruppi.values()].map(g => `${g.operatore_id}|${g.data}`))
  for (const c of coppie) {
    const [op, data] = c.split('|')
    try {
      const { data: day } = await supabase.from('interventi')
        .select('operatore_id, operatore2_id, ore_ordinarie, ore_straordinario, ore_ordinarie_op2, ore_straordinario_op2, stato')
        .or(`operatore_id.eq.${op},operatore2_id.eq.${op}`).eq('data_pianificata', data)
      const lista = (day || []).filter(r => r.stato !== 'annullato')
      const somma = (k1, k2) => lista.reduce((s, r) => s + ((r.operatore2_id === op && r.operatore_id !== op ? r[k2] : r[k1]) || 0), 0)
      await supabase.from('presenze_giornaliere').upsert({
        profilo_id: op, data, tipo: 'lavoro',
        ore_ordinarie: Math.round(somma('ore_ordinarie', 'ore_ordinarie_op2') * 100) / 100,
        ore_straordinario: Math.round(somma('ore_straordinario', 'ore_straordinario_op2') * 100) / 100,
      }, { onConflict: 'profilo_id,data' })
    } catch (err) { console.warn('cartellino non aggiornato', err) }
  }

  return { aggiornati: update.size, creati: nuovi.length }
}
