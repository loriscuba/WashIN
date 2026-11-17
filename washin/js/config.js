// Configurazione pubblica di WashIN.
//
// Questo file È nel repo di proposito: GitHub Pages pubblica il sito dal repo,
// quindi senza config.js l'app non partirebbe. Qui vanno SOLO chiavi pensate
// per stare nel browser:
//
// - SUPABASE_ANON_KEY è la chiave "publishable" di Supabase: è pubblica per
//   natura. La protezione dei dati la fanno le policy RLS sul database.
// - GOOGLE_MAPS_KEY è visibile a chiunque apra il sito. Va limitata in
//   Google Cloud Console → API e servizi → Credenziali:
//     • Restrizioni applicazione: "Referrer HTTP" → https://loriscuba.github.io/*
//     • Restrizioni API: solo Maps JavaScript API e Geocoding API
//       (le uniche che usa l'app)
//
// Non mettere mai qui la service_role key di Supabase o password SMTP.

const SUPABASE_URL = 'https://yqpcltyumzytqwrstuvv.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_egNpno2yrS2XnnMtJ4zCvg_GeaBhEv8';

window.SUPABASE_URL = SUPABASE_URL
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY
window.GOOGLE_MAPS_KEY = 'AIzaSyAMTyde2dGMQjjFKHU3XfnQaL4PySBFNj0'
