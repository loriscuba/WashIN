// Edge Function: crea-utente-operatore
// Crea un auth.user Supabase partendo da un profilo esistente (es. importato da INAIL).
// Richiede service_role key → può girare solo lato server (Edge Function).
//
// Deploy:
//   supabase functions deploy crea-utente-operatore --project-ref <REF>
//
// Body: { email: string, password: string, profilo_id: uuid }
// Risposta OK:  { success: true, user_id: uuid }
// Risposta KO:  { error: string }  (HTTP 400)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Verifica che il chiamante sia un admin autenticato ─────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non autorizzato')

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (!caller) throw new Error('Non autorizzato')

    const { data: callerProfile } = await supabaseAdmin
      .from('profili').select('ruolo').eq('id', caller.id).single()
    if (callerProfile?.ruolo !== 'admin') throw new Error('Accesso riservato agli amministratori')

    // ── Dati richiesta ─────────────────────────────────────────────────────────
    const { email, password, profilo_id } = await req.json()
    if (!email?.trim() || !password) throw new Error('Email e password obbligatori')
    if (password.length < 6)         throw new Error('Password: minimo 6 caratteri')
    if (!profilo_id)                  throw new Error('profilo_id mancante')

    // ── Controlla se il profilo ha già un auth user ────────────────────────────
    const { data: { user: existingAuthUser } } = await supabaseAdmin.auth.admin.getUserById(profilo_id)
    if (existingAuthUser) throw new Error('Questo operatore ha già un account attivo')

    // ── Legge il profilo esistente (importato) ─────────────────────────────────
    const { data: oldProfile, error: profileErr } = await supabaseAdmin
      .from('profili').select('*').eq('id', profilo_id).single()
    if (profileErr || !oldProfile) throw new Error('Profilo non trovato (id: ' + profilo_id + ')')

    // ── Crea l'utente auth (nessuna conferma email necessaria) ─────────────────
    const { data: { user: newUser }, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    })
    if (createErr) {
      const msg = createErr.message?.toLowerCase() || ''
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        throw new Error('Esiste già un account con questa email')
      }
      throw createErr
    }

    const newUserId = newUser!.id

    // ── Migra dati dal profilo importato al nuovo profilo (creato dal trigger) ──
    if (oldProfile.id !== newUserId) {
      // 1. Sposta i riferimenti buste_paga al nuovo id
      await supabaseAdmin
        .from('buste_paga')
        .update({ operatore_id: newUserId })
        .eq('operatore_id', profilo_id)

      // 2. Il trigger ha già creato un profili row per newUserId:
      //    lo aggiorniamo con tutti i dati del profilo importato
      const { id: _id, created_at: _ca, ...profileData } = oldProfile
      const { error: upsertErr } = await supabaseAdmin.from('profili').upsert({
        ...profileData,
        id:     newUserId,
        email:  email.trim(),
        attivo: true,
        ruolo:  profileData.ruolo || 'operatore',
      })
      if (upsertErr) throw new Error('Migrazione profilo fallita: ' + upsertErr.message)

      // 3. Elimina il vecchio profilo importato (non ha auth user collegato)
      await supabaseAdmin.from('profili').delete().eq('id', profilo_id)
    } else {
      // Caso raro: id già corretto, solo aggiorna email e attivo
      await supabaseAdmin
        .from('profili')
        .update({ email: email.trim(), attivo: true })
        .eq('id', newUserId)
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
