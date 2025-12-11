/**
 * Color palette for contact avatars
 * Used to assign deterministic colors to contacts without profile photos
 * Colors are semi-transparent overlays on top of the Benjamin avatar
 */

export const CONTACT_AVATAR_COLORS = [
  'rgba(76, 175, 80, 0.35)',   // Green
  'rgba(255, 152, 0, 0.35)',   // Orange
  'rgba(156, 39, 176, 0.35)',  // Purple
  'rgba(33, 150, 243, 0.35)',  // Blue
  'rgba(0, 188, 212, 0.35)',   // Teal
  'rgba(244, 67, 54, 0.35)',   // Red (6th color for variety)
] as const

/**
 * Get a deterministic color for a contact based on their handle or name
 * Uses a simple hash function to consistently assign colors
 */
export function getAvatarColorForHandle(handle: string | undefined, name?: string): string {
  // Use handle if available, otherwise fall back to name
  const identifier = (handle || name || '').toLowerCase().trim()
  
  if (!identifier) {
    // Fallback to first color if no identifier
    return CONTACT_AVATAR_COLORS[0]!
  }
  
  // Simple hash function: sum character codes
  let hash = 0
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash) + identifier.charCodeAt(i)
    hash = hash | 0 // Convert to 32-bit integer
  }
  
  // Use absolute value and modulo to get palette index
  const index = Math.abs(hash) % CONTACT_AVATAR_COLORS.length
  return CONTACT_AVATAR_COLORS[index]!
}

/**
 * Get the first initial letter from a contact's name or handle
 */
export function getContactInitial(handle?: string, name?: string): string {
  // Try name first
  const fromName = (name || '').trim()
  if (fromName) {
    return fromName[0]!.toUpperCase()
  }
  
  // Try handle (remove $ prefix if present)
  const handleClean = (handle || '').replace(/^\$/, '').trim()
  if (handleClean) {
    return handleClean[0]!.toUpperCase()
  }
  
  // Fallback
  return '?'
}

