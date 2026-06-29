// Edge Function: c  (link breve per il download del cedolino WhatsApp)
// Riceve l'id della busta paga, genera al volo un signed URL del PDF cifrato
// e reindirizza (302) al download. Permette link corti tipo:
//   https://<progetto>.supabase.co/functions/v1/c?b=<busta_paga_id>
//
// IMPORTANTE: questa funzione deve essere PUBBLICA.
// In fase di deploy dalla Dashboard, disattivare "Verify JWT".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  try {
    const id = new URL(req.url).searchParams.get('b')
    if (!id) return new Response('Link non valido', { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: busta, error } = await admin
      .from('buste_paga')
      .select('operatore_id, anno, mese')
      .eq('id', id)
      .single()
    if (error || !busta) return new Response('Cedolino non trovato', { status: 404 })

    const path = `whatsapp/${busta.operatore_id}/${busta.anno}-${busta.mese}.pdf`
    const { data: signed, error: sErr } = await admin.storage
      .from('buste-paga')
      .createSignedUrl(path, 300)   // valido 5 minuti, il tempo di scaricare
    if (sErr || !signed?.signedUrl) {
      return new Response('File non disponibile o scaduto', { status: 404 })
    }

    return Response.redirect(signed.signedUrl, 302)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[c]', msg)
    return new Response('Errore', { status: 500 })
  }
})
