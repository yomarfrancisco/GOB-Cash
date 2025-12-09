export type BasicContact = {
  id: string
  name?: string
  email?: string
  phone?: string
  photoUrl?: string
  source?: 'connections' | 'otherContacts' | string
}

export type RankedContact = BasicContact & {
  qualityScore: number
  handle: string
  subtitle: string
}

function computeHandle(contact: BasicContact): string {
  // Treat empty string or 'Unknown' as missing name
  const name = contact.name?.trim() && contact.name !== 'Unknown' ? contact.name.trim() : null
  
  const base =
    name ||
    contact.email?.split('@')[0] ||
    contact.phone?.toString() ||
    'friend'

  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // strip spaces and symbols

  const safe = normalized.slice(0, 18) || 'friend'

  return `$${safe}`
}

function computeSubtitle(contact: BasicContact): string {
  if (contact.phone && contact.email) {
    return `${contact.phone} · ${contact.email}`
  }

  if (contact.phone) return contact.phone
  if (contact.email) return contact.email

  return ''
}

function computeQualityScore(contact: BasicContact): number {
  let score = 0

  if (contact.photoUrl) score += 4
  // Treat empty string or 'Unknown' as missing name
  if (contact.name && contact.name.trim() && contact.name !== 'Unknown') score += 3
  if (contact.phone) score += 2
  if (contact.email) score += 1

  // Bonus for saved Contacts (not "Other contacts")
  // Note: source might be 'contacts' (from fetchGoogleContacts) or 'connections' (from user prompt)
  if (contact.source === 'connections' || contact.source === 'contacts') score += 4

  return score
}

export function getRankedContacts(
  contacts: BasicContact[],
  max = 25
): RankedContact[] {
  return contacts
    .map((c) => ({
      ...c,
      qualityScore: computeQualityScore(c),
      handle: computeHandle(c),
      subtitle: computeSubtitle(c),
    }))
    .sort((a, b) => {
      // Primary sort: quality score (descending)
      if (b.qualityScore !== a.qualityScore) {
        return b.qualityScore - a.qualityScore
      }

      // Tiebreaker: alphabetical by name/email/phone
      const aLabel = (a.name || a.email || a.phone || '').toLowerCase()
      const bLabel = (b.name || b.email || b.phone || '').toLowerCase()

      if (!aLabel && !bLabel) return 0
      if (!aLabel) return 1
      if (!bLabel) return -1

      return aLabel.localeCompare(bLabel)
    })
    .slice(0, max)
}

