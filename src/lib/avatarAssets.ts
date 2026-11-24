export const USER_PLACEHOLDER_AVATAR = '/assets/avatar-profile 2.png'
/** Admin / system / co-op face — same grey Benjamin as Routing Manager. */
export const MOZPAGA_ADMIN_AVATAR = '/assets/benjamin_grey_square.png'
export const GOB_ADMIN_AVATAR = '/assets/aa2b32f2dc3e3a159949cb59284abddef5683b05.png'

/** Older toast/dropdown assets still stored on some activity docs. */
const LEGACY_ADMIN_AVATAR_MARKERS = ['mozpaga-admin'] as const

export function isLegacyAdminAvatar(url?: string | null): boolean {
  if (!url) return false
  const normalized = decodeURIComponent(url)
  return LEGACY_ADMIN_AVATAR_MARKERS.some((marker) => normalized.includes(marker))
}

/** Map legacy admin art onto the current admin avatar. */
export function resolveAdminAvatarUrl(url?: string | null): string {
  if (!url || isLegacyAdminAvatar(url)) return MOZPAGA_ADMIN_AVATAR
  return url
}

export function isUserPlaceholderAvatar(url?: string | null): boolean {
  if (!url) return false
  const normalized = decodeURIComponent(url)
  return (
    normalized.includes('avatar-profile 2') ||
    normalized.endsWith('/assets/avatar-profile.png')
  )
}
