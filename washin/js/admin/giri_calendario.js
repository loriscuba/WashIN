// Giri (v52): quando passa un giro in una settimana. Usato da Giri, Agenda squadre e fogli ore.
import supabase from '../supabase.js'

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d) }
const lunediIso = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d) }

export const GIORNI_GIRO = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
export const SETTIMANE_MESE = { 1: '1ª', 2: '2ª', 3: '3ª', 4: '4ª', 5: 'ultima' }

// Il giro passa in questa data?
export function giroPassa(g, iso) {
  if (!g || g.attivo === false) return false
  const d = new Date(iso + 'T12:00:00')
  const gs = d.getDay() // 0 dom … 6 sab
  if (!gs || !(g.giorni || []).includes(gs)) return false
  if (g.dal && iso < g.dal) return false
  if (g.al && iso > g.al) return false
  if (g.cadenza === 'mese') {
    const n = Math.ceil(d.getDate() / 7)
    const ultima = d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const sm = g.settimane_mese || []
    return (n <= 4 && sm.includes(n)) || (sm.includes(5) && ultima)
  }
  const ogni = Number(g.ogni_settimane) || 1
  if (ogni === 1) return true
  const sett = Math.round((new Date(lunediIso(iso) + 'T12:00:00') - new Date(lunediIso(g.dal || iso) + 'T12:00:00')) / 604800000)
  return ((sett % ogni) + ogni) % ogni === 0
}

// Giorni della settimana (0 = lunedì … 5 = sabato) in cui passa il giro
export const giroGiorni = (g, lun) => [0, 1, 2, 3, 4, 5].filter(d => giroPassa(g, addDaysIso(lun, d)))

// Prossimi passaggi da una data (per l'anteprima nella scheda del giro)
export function prossimiPassaggi(g, da, n = 6) {
  const out = []
  for (let i = 0; i < 400 && out.length < n; i++) {
    const iso = addDaysIso(da, i)
    if (giroPassa(g, iso)) out.push(iso)
  }
  return out
}

export function descriviGiro(g) {
  const gg = (g.giorni || []).slice().sort().map(x => GIORNI_GIRO[x - 1]).join(', ') || 'nessun giorno'
  if (g.cadenza === 'mese') {
    const sm = (g.settimane_mese || []).slice().sort().map(x => SETTIMANE_MESE[x]).join(', ')
    return `Mensile · ${gg} · ${sm || 'nessuna settimana'} sett. del mese`
  }
  const o = Number(g.ogni_settimane) || 1
  return `${o === 1 ? 'Ogni settimana' : `Ogni ${o} settimane`} · ${gg}`
}

// Giri con squadra e contratti (null se manca la v52)
export async function caricaGiri(selectContratto = 'id, numero_contratto, stato, clienti(nome_breve, ragione_sociale), contratti_servizi(id, ordine, descrizione, minuti_intervento, interventi_numero, interventi_periodo)') {
  const { data, error } = await supabase.from('giri')
    .select(`*, squadre(nome, colore), giri_contratti(id, contratto_id, servizio_id, ordine, contratti(${selectContratto}))`)
    .order('nome')
  if (error) { console.warn('giri non disponibili (v52?)', error.message); return null }
  for (const g of data || []) (g.giri_contratti || []).sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
  return data || []
}

// Passaggi dei giri in una settimana, già assegnati alla squadra che li fa: una copertura
// temporanea (squadre_contratti con data "al") di un'altra squadra prevale su quella del giro.
// Ritorna [{ giro, riga (giri_contratti), squadra_id, giorni: [0 = lunedì … 5 = sabato] }]
export function passaggiSettimana(giri, coperture, lun) {
  const out = new Map()
  for (const g of giri || []) {
    if (!g.attivo || !g.squadra_id) continue
    for (const d of giroGiorni(g, lun)) {
      const iso = addDaysIso(lun, d)
      for (const r of g.giri_contratti || []) {
        const cop = (coperture || []).find(a => a.contratto_id === r.contratto_id && a.al && a.squadra_id !== g.squadra_id && iso >= a.dal && iso <= a.al)
        const sq = cop ? cop.squadra_id : g.squadra_id
        const k = `${r.id}|${sq}`
        if (!out.has(k)) out.set(k, { giro: g, riga: r, squadra_id: sq, giorni: [] })
        out.get(k).giorni.push(d)
      }
    }
  }
  return [...out.values()]
}
