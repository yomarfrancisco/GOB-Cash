/**
 * Handle normalization utility
 * Matches client-side logic: $ prefix + lowercase
 */

/**
 * Normalizes a handle to the canonical format: $prefix + lowercase
 * @param handle - Raw handle string (may or may not have $ prefix)
 * @returns Normalized handle or undefined if invalid
 */
export function normalizeHandle(handle: string | null | undefined): string | undefined {
  if (!handle) return undefined
  let h = handle.trim()
  if (!h) return undefined
  if (!h.startsWith('$')) h = `$${h}`
  return h.toLowerCase()
}

/**
 * Derives a handle from contact data
 * Priority: contact.handle -> email prefix -> displayName -> phone
 * @param contact - Contact document data
 * @returns Normalized handle or undefined if cannot be derived
 */
export function deriveHandleFromContact(contact: {
  handle?: string | null
  primaryEmail?: string | null
  displayName?: string | null
  primaryPhone?: string | null
}): string | undefined {
  // First try explicit handle
  if (contact.handle) {
    const normalized = normalizeHandle(contact.handle)
    if (normalized) return normalized
  }

  // Try email prefix
  if (contact.primaryEmail) {
    const emailPrefix = contact.primaryEmail.split('@')[0]
    if (emailPrefix) {
      const normalized = normalizeHandle(emailPrefix)
      if (normalized) return normalized
    }
  }

  // Try displayName
  if (contact.displayName) {
    // Clean displayName: lowercase, remove spaces/special chars, take first 18 chars
    const cleaned = contact.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 18)
    if (cleaned) {
      return normalizeHandle(cleaned) || '$friend'
    }
  }

  // Try phone (last resort, use as-is)
  if (contact.primaryPhone) {
    const phoneStr = contact.primaryPhone.toString().replace(/\D/g, '')
    if (phoneStr) {
      return normalizeHandle(phoneStr) || '$friend'
    }
  }

  return undefined
}

