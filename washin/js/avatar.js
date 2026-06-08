import supabase from './supabase.js'

export function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return '?'
}

export function applyAvatar(containerEl, avatarUrl, name) {
  if (!containerEl) return
  const img = containerEl.querySelector('img')
  const ini = containerEl.querySelector('.avatar-initials')
  if (avatarUrl) {
    if (img) { img.src = avatarUrl; img.style.display = 'block' }
    if (ini) ini.style.display = 'none'
  } else {
    if (img) img.style.display = 'none'
    if (ini) { ini.textContent = getInitials(name); ini.style.display = 'flex' }
  }
}

export async function uploadAvatar(userId, file) {
  const path = `${userId}/avatar`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const urlWithTs = data.publicUrl + '?t=' + Date.now()
  await supabase.from('profili').update({ avatar_url: data.publicUrl }).eq('id', userId)
  return urlWithTs
}
