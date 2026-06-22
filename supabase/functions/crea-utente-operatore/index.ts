// Edge Function: crea-utente-operatore
// Crea un auth.user e lo collega al profilo esistente tramite user_id.
// Il profilo NON viene migrato: mantiene il suo UUID originale.
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
      .from('profili').select('ruolo').eq('user_id', caller.id).single()
    if (callerProfile?.ruolo !== 'admin') throw new Error('Accesso riservato agli amministratori')

    // ── Dati richiesta ─────────────────────────────────────────────────────────
    const { email, password, profilo_id } = await req.json()
    if (!email?.trim() || !password) throw new Error('Email e password obbligatori')
    if (password.length < 6)         throw new Error('Password: minimo 6 caratteri')
    if (!profilo_id)                  throw new Error('profilo_id mancante')

    // ── Verifica che il profilo esista e non abbia già un account ──────────────
    const { data: profilo, error: profileErr } = await supabaseAdmin
      .from('profili').select('id, user_id').eq('id', profilo_id).single()
    if (profileErr || !profilo) throw new Error('Profilo non trovato (id: ' + profilo_id + ')')
    if (profilo.user_id)        throw new Error('Questo operatore ha già un account attivo')

    // ── Crea l'utente auth ─────────────────────────────────────────────────────
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

    // ── Il trigger ha creato un profilo vuoto per newUserId: eliminalo ─────────
    await supabaseAdmin.from('profili').delete().eq('id', newUserId)

    // ── Collega il profilo originale al nuovo auth user ────────────────────────
    const { error: linkErr } = await supabaseAdmin
      .from('profili')
      .update({ user_id: newUserId, email: email.trim(), attivo: true })
      .eq('id', profilo_id)
    if (linkErr) throw new Error('Collegamento profilo fallito: ' + linkErr.message)

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
