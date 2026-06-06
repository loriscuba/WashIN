import supabase from '../supabase.js'

const toastContainerId = 'toast-container'

function createToastContainer() {
	let container = document.getElementById(toastContainerId)
	if (!container) {
		container = document.createElement('div')
		container.id = toastContainerId
		container.style.position = 'fixed'
		container.style.right = '20px'
		container.style.bottom = '20px'
		container.style.display = 'grid'
		container.style.gap = '10px'
		container.style.zIndex = '9999'
		document.body.appendChild(container)
	}
	return container
}

export function showToast(message, type = 'success') {
	const container = createToastContainer()
	const toast = document.createElement('div')
	toast.textContent = message
	toast.style.padding = '12px 16px'
	toast.style.borderRadius = '12px'
	toast.style.boxShadow = '0 10px 24px rgba(0,0,0,0.12)'
	toast.style.color = '#fff'
	toast.style.opacity = '0'
	toast.style.transform = 'translateY(10px)'
	toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
	toast.style.maxWidth = '320px'
	toast.style.fontSize = '14px'
	if (type === 'error') {
		toast.style.background = '#EF4444'
	} else if (type === 'warning') {
		toast.style.background = '#F59E0B'
	} else {
		toast.style.background = '#0D9488'
	}
	container.appendChild(toast)
	requestAnimationFrame(() => {
		toast.style.opacity = '1'
		toast.style.transform = 'translateY(0)'
	})
	setTimeout(() => {
		toast.style.opacity = '0'
		toast.style.transform = 'translateY(10px)'
		toast.addEventListener('transitionend', () => toast.remove(), { once: true })
	}, 3000)
}

export async function loadClienti(filtri = {}) {
	try {
		let query = supabase.from('clienti').select('*')
		if (filtri.tipo && filtri.tipo !== 'tutti') {
			query = query.eq('tipo', filtri.tipo.toLowerCase())
		}
		if (filtri.attivo !== undefined && filtri.attivo !== 'tutti') {
			const attivo = filtri.attivo === true || filtri.attivo === 'attivi'
			query = query.eq('attivo', attivo)
		}
		if (filtri.ricerca) {
			query = query.ilike('ragione_sociale', `%${filtri.ricerca}%`)
		}
		const { data, error } = await query.order('ragione_sociale', { ascending: true })
		if (error) throw error
		return data || []
	} catch (error) {
		showToast('Errore durante il caricamento dei clienti', 'error')
		console.error(error)
		return []
	}
}

function createClienteRow(cliente) {
	const tr = document.createElement('tr')
	tr.innerHTML = `
		<td>${cliente.ragione_sociale || ''}</td>
		<td>${cliente.tipo || ''}</td>
		<td>${cliente.citta || ''}</td>
		<td>${cliente.referente || ''}</td>
		<td>${cliente.telefono || ''}</td>
		<td>${cliente.contratti_attivi ?? '-'}</td>
		<td>
			<button class="btn btn-sm btn-secondary" data-action="edit-cliente" data-id="${cliente.id}">Modifica</button>
			<button class="btn btn-sm btn-danger" data-action="toggle" data-id="${cliente.id}" data-active="${cliente.attivo}">${cliente.attivo ? 'Disattiva' : 'Attiva'}</button>
		</td>
	`
	return tr
}

export function renderTabellaClienti(clienti) {
	try {
		const container = document.querySelector('#clienti-table-body')
		if (!container) return
		container.innerHTML = ''
		clienti.forEach((cliente) => {
			const row = createClienteRow(cliente)
			container.appendChild(row)
		})
	} catch (error) {
		showToast('Errore durante la renderizzazione della tabella clienti', 'error')
		console.error(error)
	}
}

export async function openModalCliente(id = null) {
	try {
		const modal = document.getElementById('cliente-modal')
		const form = modal?.querySelector('form')
		if (!modal || !form) return
		if (id) {
			const { data, error } = await supabase.from('clienti').select('*').eq('id', id).single()
			if (error) throw error
			Object.entries(data).forEach(([key, value]) => {
				const field = form.querySelector(`[name="${key}"]`)
				if (field) field.value = value ?? ''
			})
			form.dataset.clientId = id
		} else {
			form.reset()
			delete form.dataset.clientId
		}
		modal.classList.add('active')
	} catch (error) {
		showToast('Errore durante l apertura del cliente', 'error')
		console.error(error)
	}
}

export async function saveCliente(formData) {
	try {
		const fields = {
			ragione_sociale: formData.ragione_sociale,
			tipo: formData.tipo,
			indirizzo: formData.indirizzo,
			citta: formData.citta,
			cap: formData.cap,
			referente: formData.referente,
			telefono: formData.telefono,
			email: formData.email,
			note: formData.note,
			attivo: formData.attivo !== undefined ? formData.attivo : true,
		}
		let error
		if (formData.id) {
			;({ error } = await supabase.from('clienti').update(fields).eq('id', formData.id))
		} else {
			;({ error } = await supabase.from('clienti').insert(fields))
		}
		if (error) throw error
		showToast('Cliente salvato con successo', 'success')
		return true
	} catch (error) {
		showToast('Errore durante il salvataggio del cliente', 'error')
		console.error(error)
		return null
	}
}

export async function toggleAttivoCliente(id, attivo) {
	try {
		const { error } = await supabase.from('clienti').update({ attivo }).eq('id', id)
		if (error) throw error
		showToast(`Cliente ${attivo ? 'attivato' : 'disattivato'} con successo`, 'success')
	} catch (error) {
		showToast('Errore durante l aggiornamento dello stato cliente', 'error')
		console.error(error)
	}
}

export async function loadSediCliente(clienteId) {
	try {
		const { data, error } = await supabase.from('sedi_cliente').select('*').eq('cliente_id', clienteId)
		if (error) throw error
		return data || []
	} catch (error) {
		showToast('Errore durante il caricamento delle sedi cliente', 'error')
		console.error(error)
		return []
	}
}

export async function addSede(clienteId, datiSede) {
	try {
		const payload = {
			cliente_id: clienteId,
			nome_sede: datiSede.nome_sede,
			indirizzo: datiSede.indirizzo,
			piano: datiSede.piano,
			mq_totali: datiSede.mq_totali,
			note_accesso: datiSede.note_accesso,
		}
		const { error } = await supabase.from('sedi_cliente').insert(payload)
		if (error) throw error
		showToast('Sede aggiunta con successo', 'success')
	} catch (error) {
		showToast('Errore durante l aggiunta della sede', 'error')
		console.error(error)
	}
}

export function initClienti() {
	try {
		const filterForm = document.getElementById('clienti-filters-form')
		const addButton = document.getElementById('add-cliente-button')
		const modalClose = document.querySelector('#cliente-modal .btn-secondary')
		const form = document.querySelector('#cliente-modal form')

		if (filterForm) {
			filterForm.addEventListener('submit', async (event) => {
				event.preventDefault()
				const filtri = {
					ricerca: filterForm.querySelector('[name="search"]').value,
					tipo: filterForm.querySelector('[name="tipo"]').value,
					attivo: filterForm.querySelector('[name="stato"]').value,
				}
				const clienti = await loadClienti(filtri)
				renderTabellaClienti(clienti)
			})
		}

		if (addButton) {
			addButton.addEventListener('click', () => openModalCliente())
		}

		if (modalClose) {
			modalClose.addEventListener('click', () => {
				const modal = document.getElementById('cliente-modal')
				modal?.classList.remove('active')
			})
		}

		if (form) {
			form.addEventListener('submit', async (event) => {
				event.preventDefault()
				const formData = {
					id: form.dataset.clientId || undefined,
					ragione_sociale: form.querySelector('[name="ragione_sociale"]').value,
					tipo: form.querySelector('[name="tipo"]').value,
					indirizzo: form.querySelector('[name="indirizzo"]').value,
					citta: form.querySelector('[name="citta"]').value,
					cap: form.querySelector('[name="cap"]').value,
					referente: form.querySelector('[name="referente"]').value,
					telefono: form.querySelector('[name="telefono"]').value,
					email: form.querySelector('[name="email"]').value,
					note: form.querySelector('[name="note"]').value,
					attivo: form.querySelector('[name="attivo"]').checked,
				}
				await saveCliente(formData)
				form.reset()
				delete form.dataset.clientId
				document.getElementById('cliente-modal')?.classList.remove('active')
				const clienti = await loadClienti()
				renderTabellaClienti(clienti)
			})
		}

		document.addEventListener('click', async (event) => {
			const target = event.target
			if (!(target instanceof HTMLElement)) return
			const action = target.dataset.action
			const id = target.dataset.id
			if (action === 'edit-cliente' && id) {
				await openModalCliente(id)
			}
			if (action === 'toggle' && id) {
				const isActive = target.dataset.active === 'true'
				await toggleAttivoCliente(id, !isActive)
				const clienti = await loadClienti()
				renderTabellaClienti(clienti)
			}
		})

		// caricamento iniziale
		loadClienti().then(renderTabellaClienti)
	} catch (error) {
		showToast('Errore durante l inizializzazione sezione clienti', 'error')
		console.error(error)
	}
}
