// Validatori riutilizzabili — tutti restituiscono true se il valore è vuoto/null
// (il campo è opzionale; se obbligatorio usa required nell'HTML)

export const RE_CF    = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/i
export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const RE_IBAN  = /^IT\d{2}[A-Z0-9]{23}$/i

export const validaCF    = v => !v || RE_CF.test(v.replace(/\s/g, ''))
export const validaEmail = v => !v || RE_EMAIL.test(v.trim())
export const validaIBAN  = v => !v || RE_IBAN.test(v.replace(/\s/g, '').toUpperCase())
export const validaPW    = v => v && v.length >= 8

/**
 * Esegue una lista di controlli e restituisce il primo messaggio di errore,
 * oppure null se tutto è valido.
 * checks: [ [condizione_ok, messaggio_errore], ... ]
 */
export function primoErrore(checks) {
  for (const [ok, msg] of checks) {
    if (!ok) return msg
  }
  return null
}
