import supabase from '../supabase.js'
import { showToast } from './clienti.js'

async function getCurrentRole() {
  const { data } = await supabase.auth.getSession()
  const uid = data?.session?.user?.id
  if (!uid) return null
  const { data: p } = await supabase.from('profili').select('ruolo').eq('id', uid).single()
  return p?.ruolo || null
}

export async function loadUtenti() {
  try {
    const { data, error } = await supabase.from('profili').select('*').order('nome', { ascending: true })
    if (error) throw error
    // Carica gli ID presenti in auth.users per sapere chi ha un account di login
    const { data: authIds } = await supabase.rpc('get_auth_user_ids')
    const authSet = new Set((authIds || []).map(r => r.id))
    return (data || []).map(u => ({ ...u, _hasAuthAccount: authSet.has(u.id) }))
  } catch (err) {
    showToast('Errore caricamento utenti', 'error')
    console.error(err)
    return []
  }
}

const ROLE_BADGE = {
  admin: { cls: 'badge-danger', label: 'Admin' },
  operatore: { cls: 'badge-info', label: 'Operatore' }
}

function createUtenteRow(u) {
  const tr = document.createElement('tr')
  const rb = ROLE_BADGE[u.ruolo] || { cls: 'badge-warning', label: u.ruolo || '-' }
  const statoHtml = u.attivo
    ? '<span style="color:#059669;font-weight:600;">Attivo</span>'
    : '<span style="color:#dc2626;font-weight:600;">Inattivo</span>'
  const loginBadge = u._hasAuthAccount
    ? '<span class="badge badge-success" title="Ha un account di accesso">Login ✓</span>'
    : '<span class="badge badge-warning" title="Solo profilo, nessun account di accesso">Solo profilo</span>'
  const resetBtn = u._hasAuthAccount
    ? `<button class="btn btn-sm btn-secondary" data-action="reset-pw-utente" data-id="${u.id}" data-nome="${[u.nome, u.cognome].filter(Boolean).join(' ') || u.email || ''}">Reset PW</button>`
    : `<button class="btn btn-sm" style="background:#f1f5f9;color:#94a3b8;border:none;border-radius:6px;cursor:not-allowed;padding:4px 10px;font-size:12px;" title="Crea prima un account da Nuovo utente" disabled>Reset PW</button>`
  tr.innerHTML = `
    <td><strong>${[u.nome, u.cognome].filter(Boolean).join(' ') || '-'}</strong></td>
    <td>${u.email || '-'}</td>
    <td><span class="badge ${rb.cls}">${rb.label}</span></td>
    <td>${u.telefono || '-'}</td>
    <td>${loginBadge}</td>
    <td>${statoHtml}</td>
    <td style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-secondary" data-action="edit-utente" data-id="${u.id}">Modifica</button>
      <button class="btn btn-sm" style="background:${u.attivo ? '#fee2e2' : '#d1fae5'};color:${u.attivo ? '#dc2626' : '#059669'};border:none;border-radius:6px;cursor:pointer;padding:4px 10px;font-size:12px;"
        data-action="toggle-utente" data-id="${u.id}" data-active="${u.attivo}">
        ${u.attivo ? 'Disattiva' : 'Attiva'}
      </button>
      ${resetBtn}
    </td>
  `
  return tr
}

export function renderTabellaUtenti(utenti) {
  const tbody = document.getElementById('utenti-table-body')
  if (!tbody) return
  tbody.innerHTML = ''
  if (!utenti.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px;">Nessun utente</td></tr>'
    return
  }
  utenti.forEach(u => tbody.appendChild(createUtenteRow(u)))
}

export async function openModalUtente(id) {
  try {
    const modal = document.getElementById('utente-modal')
    const form = modal?.querySelector('form')
    if (!modal || !form) return

    const { data, error } = await supabase.from('profili').select('*').eq('id', id).single()
    if (error) throw error

    Object.entries(data).forEach(([k, v]) => {
      const el = form.querySelector(`[name="${k}"]`)
      if (el) el.value = v ?? ''
    })
    const activeCheck = form.querySelector('[name="attivo"]')
    if (activeCheck) activeCheck.checked = !!data.attivo

    form.dataset.utenteId = id
    modal.querySelector('h2').textContent = 'Modifica Utente'
    modal.classList.add('active')
  } catch (err) {
    showToast('Errore apertura modal utente', 'error')
    console.error(err)
  }
}

async function saveUtente(payload) {
  try {
    const fields = {
      nome: payload.nome || null,
      cognome: payload.cognome || null,
      email: payload.email || null,
      telefono: payload.telefono || null,
      qualifica: payload.qualifica || null,
      ruolo: payload.ruolo || 'operatore',
      attivo: payload.attivo !== undefined ? payload.attivo : true,
      costo_mensile: payload.costo_mensile ? parseFloat(payload.costo_mensile) : 0,
      ore_mensili_contratto: payload.ore_mensili_contratto ? parseFloat(payload.ore_mensili_contratto) : 160,
    }
    const { error } = await supabase.from('profili').update(fields).eq('id', payload.id)
    if (error) throw error
    showToast('Utente aggiornato', 'success')
    return true
  } catch (err) {
    showToast('Errore salvataggio utente', 'error')
    console.error(err)
    return null
  }
}

async function createNuovoUtente(payload) {
  try {
    // Salva la sessione admin corrente prima del signup
    const { data: { session: adminSession } } = await supabase.auth.getSession()

    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password
    })

    if (error) {
      if (error.status === 500) {
        throw new Error('Errore server (500). Probabile causa: la conferma email è attiva ma lo SMTP non è configurato. Vai su Supabase → Authentication → Configuration e disabilita "Enable email confirmations".')
      }
      if (error.message?.toLowerCase().includes('signup') || error.message?.toLowerCase().includes('disabled')) {
        throw new Error('Signup disabilitato. Vai su Supabase → Authentication → Configuration → abilita "Allow new users to sign up".')
      }
      throw error
    }

    const userId = data.user?.id
    if (!userId) throw new Error('ID utente non ricevuto.')

    // Se la sessione è cambiata (email confirmation off), ripristina quella admin
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (adminSession && currentSession?.user?.id !== adminSession.user.id) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token
      })
    }

    // Conferma l'email dell'utente tramite RPC (evita blocco login se email confirmation è attiva)
    await supabase.rpc('admin_confirm_user', { target_user_id: userId })

    const fields = {
      nome: payload.nome || null,
      cognome: payload.cognome || null,
      email: payload.email,
      telefono: payload.telefono || null,
      qualifica: payload.qualifica || null,
      ruolo: payload.ruolo || 'operatore',
      attivo: true,
      costo_mensile: payload.costo_mensile ? parseFloat(payload.costo_mensile) : 0,
      ore_mensili_contratto: payload.ore_mensili_contratto ? parseFloat(payload.ore_mensili_contratto) : 160,
    }
    // upsert: il trigger potrebbe aver già creato la riga
    const { error: upsertErr } = await supabase.from('profili').upsert({ id: userId, ...fields })
    if (upsertErr) throw upsertErr

    showToast('Utente creato con successo.', 'success')
    return true
  } catch (err) {
    showToast(err.message || 'Errore creazione utente', 'error')
    console.error(err)
    return null
  }
}

export function initUtenti() {
  (async () => {
    try {
      const addBtn = document.getElementById('add-utente-button')
      const modal = document.getElementById('utente-modal')
      const nuovoModal = document.getElementById('nuovo-utente-modal')
      const form = modal?.querySelector('form')
      const nuovoForm = nuovoModal?.querySelector('form')
      const resetPwModal = document.getElementById('reset-pw-modal')
      const resetPwForm = resetPwModal?.querySelector('form')

      // Chiudi modal edit
      modal?.querySelector('.modal-close-btn')?.addEventListener('click', () => modal.classList.remove('active'))
      nuovoModal?.querySelector('.modal-close-btn')?.addEventListener('click', () => nuovoModal.classList.remove('active'))
      resetPwModal?.querySelector('.modal-close-btn')?.addEventListener('click', () => resetPwModal.classList.remove('active'))

      // Submit reset password
      resetPwForm?.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(resetPwForm)
        const pw = fd.get('new_password')
        const pw2 = fd.get('confirm_password')
        if (pw !== pw2) { showToast('Le password non coincidono', 'warning'); return }
        if (pw.length < 6) { showToast('Password minimo 6 caratteri', 'warning'); return }
        const targetId = resetPwModal.dataset.targetId
        const { error } = await supabase.rpc('admin_set_user_password', {
          target_user_id: targetId,
          new_password: pw
        })
        if (error) {
          showToast('Errore reset password: ' + error.message, 'error')
        } else {
          showToast('Password aggiornata con successo', 'success')
          resetPwModal.classList.remove('active')
          resetPwForm.reset()
        }
      })

      // Apri modal nuovo utente
      addBtn?.addEventListener('click', () => {
        nuovoForm?.reset()
        nuovoModal?.classList.add('active')
      })

      // Salva modifica utente
      form?.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(form)
        await saveUtente({
          id: form.dataset.utenteId,
          nome: fd.get('nome'),
          cognome: fd.get('cognome'),
          email: fd.get('email'),
          telefono: fd.get('telefono'),
          qualifica: fd.get('qualifica'),
          ruolo: fd.get('ruolo'),
          attivo: form.querySelector('[name="attivo"]').checked,
          costo_mensile: fd.get('costo_mensile'),
          ore_mensili_contratto: fd.get('ore_mensili_contratto'),
        })
        modal.classList.remove('active')
        loadUtenti().then(renderTabellaUtenti)
      })

      // Crea nuovo utente
      nuovoForm?.addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(nuovoForm)
        const pw = fd.get('password')
        const pw2 = fd.get('confirm_password')
        if (pw !== pw2) { showToast('Le password non coincidono', 'warning'); return }
        if (pw.length < 6) { showToast('Password minimo 6 caratteri', 'warning'); return }
        const ok = await createNuovoUtente({
          email: fd.get('email'),
          password: pw,
          nome: fd.get('nome'),
          cognome: fd.get('cognome'),
          ruolo: fd.get('ruolo'),
          qualifica: fd.get('qualifica'),
          telefono: fd.get('telefono'),
          costo_mensile: fd.get('costo_mensile'),
          ore_mensili_contratto: fd.get('ore_mensili_contratto'),
        })
        if (ok) {
          nuovoModal.classList.remove('active')
          nuovoForm.reset()
          loadUtenti().then(renderTabellaUtenti)
        }
      })

      // Delegazione click tabella
      document.addEventListener('click', async e => {
        const t = e.target
        if (!(t instanceof HTMLElement)) return
        const action = t.dataset.action
        const id = t.dataset.id

        if (action === 'edit-utente' && id) {
          await openModalUtente(id)
        }
        if (action === 'toggle-utente' && id) {
          const isActive = t.dataset.active === 'true'
          const { error } = await supabase.from('profili').update({ attivo: !isActive }).eq('id', id)
          if (error) { showToast('Errore aggiornamento stato', 'error'); return }
          showToast(`Utente ${!isActive ? 'attivato' : 'disattivato'}`, 'success')
          loadUtenti().then(renderTabellaUtenti)
        }
        if (action === 'reset-pw-utente' && id) {
          const nome = t.dataset.nome || 'utente'
          const resetModal = document.getElementById('reset-pw-modal')
          if (resetModal) {
            resetModal.dataset.targetId = id
            resetModal.dataset.targetNome = nome
            resetModal.querySelector('h2').textContent = `Reset password — ${nome}`
            resetModal.querySelector('form')?.reset()
            resetModal.classList.add('active')
          }
        }
      })

      loadUtenti().then(renderTabellaUtenti)

      document.addEventListener('section:active', e => {
        if (e.detail === 'utenti') loadUtenti().then(renderTabellaUtenti)
      })
    } catch (err) {
      showToast('Errore inizializzazione utenti', 'error')
      console.error(err)
    }
  })()
}
