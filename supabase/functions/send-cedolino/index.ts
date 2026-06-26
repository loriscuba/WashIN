// Edge Function: send-cedolino
// Invia la busta paga di un operatore via email SMTP aziendale.
//
// Body:    { busta_paga_id: uuid }
// OK:      { success: true, to: string }
// Errore:  { error: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function eur(n: number | null): string {
  if (n == null || n === 0) return '—'
  return '€ ' + Number(n).toFixed(2).replace('.', ',')
}

function htmlCedolino(busta: Record<string, unknown>, nomeOperatore: string, fromName: string): string {
  const mese = MESI[(busta.mese as number) - 1]
  const anno = busta.anno as number
  const row = (label: string, val: number | null, neg = false) =>
    val && val !== 0
      ? `<tr><td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${label}</td>
           <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${neg ? '− ' : ''}${eur(val)}</td></tr>`
      : ''

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:14px;color:#1f2937;margin:0;background:#f3f4f6;}
  .wrap{max-width:600px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);}
  .hd{background:#1e40af;color:#fff;padding:22px 28px;}
  .hd h1{margin:0;font-size:20px;}
  .hd p{margin:4px 0 0;opacity:.8;font-size:13px;}
  .body{padding:24px 28px;}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  thead tr{background:#f9fafb;}
  th{padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:600;}
  th:last-child{text-align:right;}
  .subtot td{font-weight:700;background:#f3f4f6;}
  .netto td{font-weight:700;background:#dbeafe;font-size:16px;}
  .small td{font-size:12px;color:#6b7280;}
  .ft{padding:14px 28px;background:#f9fafb;font-size:11px;color:#9ca3af;text-align:center;}
</style></head><body>
<div class="wrap">
  <div class="hd">
    <h1>${fromName}</h1>
    <p>Cedolino paga — ${mese} ${anno}</p>
  </div>
  <div class="body">
    <p>Gentile <strong>${nomeOperatore}</strong>,<br>
    di seguito il riepilogo della busta paga di <strong>${mese} ${anno}</strong>.</p>

    <table>
      <thead><tr><th>Competenze</th><th style="text-align:right">Importo</th></tr></thead>
      <tbody>
        ${row('Paga base', busta.paga_base as number)}
        ${row('Contingenza', busta.contingenza as number)}
        ${row('EDR', busta.edr as number)}
        ${row('Scatti di anzianità', busta.scatti_anzianita as number)}
        ${row('Superminimo', busta.superminimo as number)}
        ${row('Straordinari', busta.straordinari_imp as number)}
        ${row('Indennità varie', busta.indennita_varie as number)}
        ${row('Altri elementi', busta.altri_elementi as number)}
        <tr class="subtot">
          <td style="padding:7px 12px;">Totale lordo</td>
          <td style="padding:7px 12px;text-align:right;">${eur(busta.totale_lordo as number)}</td>
        </tr>
      </tbody>
    </table>

    <table>
      <thead><tr><th>Ritenute</th><th style="text-align:right">Importo</th></tr></thead>
      <tbody>
        ${row('Contributi INPS dipendente', busta.contributi_inps_dip as number, true)}
        ${row('IRPEF', busta.irpef as number, true)}
        ${row('Addizionali regionali/comunali', busta.addizionali as number, true)}
        ${row('Altre ritenute', busta.altre_ritenute as number, true)}
        <tr class="subtot">
          <td style="padding:7px 12px;">Totale ritenute</td>
          <td style="padding:7px 12px;text-align:right;">− ${eur(busta.totale_ritenute as number)}</td>
        </tr>
      </tbody>
    </table>

    <table>
      <tbody>
        <tr class="netto">
          <td style="padding:10px 12px;">Netto da pagare</td>
          <td style="padding:10px 12px;text-align:right;">${eur(busta.totale_netto as number)}</td>
        </tr>
        ${(busta.tfr_mese as number) > 0 ? `<tr class="small">
          <td style="padding:6px 12px;">TFR accantonato mese</td>
          <td style="padding:6px 12px;text-align:right;">${eur(busta.tfr_mese as number)}</td>
        </tr>` : ''}
      </tbody>
    </table>

    ${(busta.ore_lavorate as number) > 0 ? `<p style="font-size:12px;color:#6b7280;">
      Ore lavorate: <strong>${busta.ore_lavorate}h</strong>
      ${(busta.ore_straordinario as number) > 0 ? ` &nbsp;·&nbsp; Straordinario: <strong>${busta.ore_straordinario}h</strong>` : ''}
    </p>` : ''}
    ${busta.note ? `<p style="font-size:12px;color:#6b7280;font-style:italic;">Note: ${busta.note}</p>` : ''}
  </div>
  <div class="ft">Documento generato automaticamente. Per informazioni contatta l'ufficio paghe.</div>
</div>
</body></html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: CORS })

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verifica JWT utente
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers: CORS })

    const body = await req.json()
    const { busta_paga_id, _test, test_to } = body

    // Modalità test: invia un'email di prova senza busta paga reale
    if (_test) {
      const { data: rows } = await supabaseAdmin.from('impostazioni').select('chiave,valore')
        .in('chiave', ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_secure'])
      const cfg: Record<string,string> = Object.fromEntries((rows ?? []).map((r: {chiave:string;valore:string}) => [r.chiave, r.valore]))
      const smtpPass = Deno.env.get('SMTP_PASS') || cfg.smtp_pass
      if (!cfg.smtp_host || !cfg.smtp_user || !smtpPass)
        return new Response(JSON.stringify({ error: 'Configurazione SMTP incompleta' }), { status: 400, headers: CORS })
      const tr = nodemailer.createTransport({ host: cfg.smtp_host, port: parseInt(cfg.smtp_port ?? '465'), secure: cfg.smtp_secure !== 'false', auth: { user: cfg.smtp_user, pass: smtpPass }, tls: { rejectUnauthorized: false } })
      await tr.sendMail({ from: `"${cfg.smtp_from_name || 'WashIN'}" <${cfg.smtp_user}>`, to: test_to || cfg.smtp_user, subject: 'WashIN — Email di test', html: '<p>La configurazione SMTP è corretta. Puoi inviare i cedolini agli operatori.</p>' })
      return new Response(JSON.stringify({ success: true, to: test_to || cfg.smtp_user }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (!busta_paga_id) return new Response(JSON.stringify({ error: 'busta_paga_id obbligatorio' }), { status: 400, headers: CORS })

    // Legge busta paga + dati operatore
    const { data: busta, error: bustaErr } = await supabaseAdmin
      .from('buste_paga')
      .select('*, profili(nome, cognome, email)')
      .eq('id', busta_paga_id)
      .single()
    if (bustaErr || !busta) return new Response(JSON.stringify({ error: 'Busta paga non trovata' }), { status: 404, headers: CORS })

    const op = busta.profili as { nome: string; cognome: string; email: string }
    if (!op?.email) return new Response(JSON.stringify({ error: 'Operatore senza email — impostala in Anagrafica' }), { status: 400, headers: CORS })

    // Legge configurazione SMTP da impostazioni
    const { data: rows } = await supabaseAdmin
      .from('impostazioni')
      .select('chiave,valore')
      .in('chiave', ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_secure'])
    const cfg: Record<string, string> = Object.fromEntries((rows ?? []).map((r: {chiave:string;valore:string}) => [r.chiave, r.valore]))

    // La password può venire dai Secrets Supabase (priorità) o dall'impostazione
    const smtpPass = Deno.env.get('SMTP_PASS') || cfg.smtp_pass
    if (!cfg.smtp_host || !cfg.smtp_user || !smtpPass) {
      return new Response(JSON.stringify({ error: 'Configurazione SMTP incompleta — vai in Configurazioni → Email Cedolini' }), { status: 400, headers: CORS })
    }

    const nomeOp = `${op.cognome ?? ''} ${op.nome ?? ''}`.trim()
    const fromName = cfg.smtp_from_name || 'Cedolino Paga'
    const mese = MESI[(busta.mese as number) - 1]

    const transporter = nodemailer.createTransport({
      host:   cfg.smtp_host,
      port:   parseInt(cfg.smtp_port ?? '465'),
      secure: cfg.smtp_secure !== 'false',   // true per porta 465 (SSL), false per 587 (STARTTLS)
      auth:   { user: cfg.smtp_user, pass: smtpPass },
      tls:    { rejectUnauthorized: false },  // necessario con alcuni provider italiani
    })

    await transporter.sendMail({
      from:    `"${fromName}" <${cfg.smtp_user}>`,
      to:      op.email,
      subject: `Cedolino ${mese} ${busta.anno} — ${nomeOp}`,
      html:    htmlCedolino(busta, nomeOp, fromName),
    })

    return new Response(JSON.stringify({ success: true, to: op.email }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[send-cedolino]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
