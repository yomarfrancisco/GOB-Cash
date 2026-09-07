export const USER_PLACEHOLDER_AVATAR = '/assets/avatar-profile 2.png'
export const MOZPAGA_ADMIN_AVATAR = '/assets/mozpaga-admin.png'
export const GOB_ADMIN_AVATAR = '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'

export function isUserPlaceholderAvatar(url?: string | null): boolean {
  if (!url) return false
  const normalized = decodeURIComponent(url)
  return (
    normalized.includes('avatar-profile 2') ||
    normalized.endsWith('/assets/avatar-profile.png')
  )
}
