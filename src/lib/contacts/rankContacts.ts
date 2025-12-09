export type BasicContact = {
  id: string
  name?: string
  email?: string
  phone?: string
  photoUrl?: string
  source?: 'connections' | 'otherContacts' | string
}

// Extended contact type for ranking with payment-focused fields
export type RankedContactInput = {
  id: string
  name: string
  givenName?: string
  familyName?: string
  primaryEmail?: string
  primaryPhone?: string
  emailCount: number
  phoneCount: number
  hasPhoto: boolean
  hasAddress: boolean
  contactAgeDays?: number
  source: 'contacts' | 'otherContacts'
  mutualContact?: boolean
}

export type RankedContact = {
  id: string
  name: string
  email?: string
  phone?: string
  photoUrl?: string
  source?: 'connections' | 'otherContacts' | string
  qualityScore: number
  handle: string
  subtitle: string
  score?: number // Keep for debug logging
}

// Simple bulk contact detection
function isBulkContact(email?: string, name?: string): boolean {
  const s = `${email || ''} ${name || ''}`.toLowerCase()

  const bad = [
    'noreply',
    'no-reply',
    'do-not-reply',
    'donotreply',
    'notification',
    'notifications',
    'mailer',
    'newsletter',
    'support',
    'help@',
    'billing',
    'payments@',
    'team@',
  ]

  return bad.some((k) => s.includes(k))
}

// Payment-focused scoring function
function scoreForPayments(c: RankedContactInput): number {
  let score = 0

  // Tier by source
  if (c.source === 'contacts') {
    score += 200
  }

  // Day-zero trust (stub for now, but keep in logic)
  if (c.mutualContact) {
    score += 200
  }

  // Payability & "real person" signals
  if (c.phoneCount > 0) score += 120
  if (c.hasPhoto) score += 40
  if (c.hasAddress) score += 40
  if (c.givenName) score += 30
  if (c.familyName) score += 30
  if (c.givenName && c.familyName) score += 20 // nice full name bonus
  if (c.emailCount > 1) score += 10
  if (c.phoneCount > 1) score += 10

  if (typeof c.contactAgeDays === 'number') {
    if (c.contactAgeDays >= 365) score += 20
    if (c.contactAgeDays >= 3 * 365) score += 20
  }

  return score
}

// Helper: compute contact age in days from metadata
function computeContactAgeDays(person: any): number | undefined {
  try {
    const sources = person.metadata?.sources || []
    for (const source of sources) {
      if (source.updateTime) {
        const updateTime = new Date(source.updateTime)
        const now = new Date()
        const diffMs = now.getTime() - updateTime.getTime()
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        return diffDays
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return undefined
}

// Map raw Google People API contact to RankedContactInput
function mapToRankedContactInput(person: any, source: 'contacts' | 'otherContacts'): RankedContactInput | null {
  const name = person.names?.[0]?.displayName || 'Unknown'
  const givenName = person.names?.[0]?.givenName
  const familyName = person.names?.[0]?.familyName
  const primaryEmail = person.emailAddresses?.[0]?.value
  const primaryPhone = person.phoneNumbers?.[0]?.value
  const emailCount = person.emailAddresses?.length || 0
  const phoneCount = person.phoneNumbers?.length || 0
  const hasPhoto = !!(person.photos?.[0]?.url)
  const hasAddress = !!(person.addresses?.[0])
  const contactAgeDays = computeContactAgeDays(person)

  // Filter out contacts with no email and no phone
  if (emailCount === 0 && phoneCount === 0) {
    return null
  }

  // Filter out bulk contacts
  if (isBulkContact(primaryEmail, name)) {
    return null
  }

  return {
    id: person.resourceName || primaryEmail || name || crypto.randomUUID(),
    name,
    givenName,
    familyName,
    primaryEmail,
    primaryPhone,
    emailCount,
    phoneCount,
    hasPhoto,
    hasAddress,
    contactAgeDays,
    source,
    mutualContact: false, // Stub for now
  }
}

function computeHandle(contact: RankedContactInput | BasicContact): string {
  const name =
    'name' in contact && contact.name?.trim() && contact.name !== 'Unknown'
      ? contact.name.trim()
      : null

  const email = 'primaryEmail' in contact ? contact.primaryEmail : 'email' in contact ? contact.email : undefined
  const phone = 'primaryPhone' in contact ? contact.primaryPhone : 'phone' in contact ? contact.phone : undefined

  const base = name || email?.split('@')[0] || phone?.toString() || 'friend'

  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // strip spaces and symbols

  const safe = normalized.slice(0, 18) || 'friend'

  return `$${safe}`
}

function computeSubtitle(contact: RankedContactInput | BasicContact): string {
  const phone = 'primaryPhone' in contact ? contact.primaryPhone : 'phone' in contact ? contact.phone : undefined
  const email = 'primaryEmail' in contact ? contact.primaryEmail : 'email' in contact ? contact.email : undefined

  if (phone && email) {
    return `${phone} · ${email}`
  }

  if (phone) return phone
  if (email) return email

  return ''
}

// Helper: get normalized name for sorting
function getSortName(contact: RankedContactInput): string {
  const name = contact.name?.trim() && contact.name !== 'Unknown' ? contact.name.trim() : ''
  const email = contact.primaryEmail || ''
  const phone = contact.primaryPhone || ''
  return (name || email || phone).toLowerCase()
}

export function getRankedContacts(
  contacts: BasicContact[],
  max = 25
): RankedContact[] {
  // Map BasicContact (from store) to RankedContactInput
  // The store now includes extended fields if available
  const rankedInputs: RankedContactInput[] = contacts
    .map((c): RankedContactInput | null => {
      // Use extended fields if available, otherwise compute from basic fields
      const emailCount = (c as any).emailCount ?? (c.email ? 1 : 0)
      const phoneCount = (c as any).phoneCount ?? (c.phone ? 1 : 0)

      // Filter out contacts with no email and no phone
      if (emailCount === 0 && phoneCount === 0) {
        return null
      }

      // Filter out bulk contacts
      if (isBulkContact(c.email, c.name)) {
        return null
      }

      // Use extended fields if available, otherwise extract from name
      const givenName = (c as any).givenName
      const familyName = (c as any).familyName
      const hasAddress = (c as any).hasAddress ?? false
      const contactAgeDays = (c as any).contactAgeDays

      // Determine source - handle both 'contacts' and 'connections' for backward compatibility
      const source = c.source === 'contacts' || c.source === 'connections' ? 'contacts' : 'otherContacts'

      return {
        id: c.id,
        name: c.name || 'Unknown',
        givenName,
        familyName,
        primaryEmail: c.email,
        primaryPhone: c.phone,
        emailCount,
        phoneCount,
        hasPhoto: !!c.photoUrl,
        hasAddress,
        contactAgeDays,
        source: source as 'contacts' | 'otherContacts',
        mutualContact: false,
      }
    })
    .filter((c): c is RankedContactInput => c !== null)

  // Score each contact
  const scored = rankedInputs.map((c) => ({
    ...c,
    score: scoreForPayments(c),
  }))

  // Sort: score descending, then source (contacts before otherContacts), then name
  const sorted = scored.sort((a, b) => {
    // Primary: score descending
    if (b.score !== a.score) {
      return b.score - a.score
    }

    // Secondary: source (contacts before otherContacts)
    if (a.source !== b.source) {
      if (a.source === 'contacts') return -1
      if (b.source === 'contacts') return 1
    }

    // Tertiary: name alphabetically
    const aName = getSortName(a)
    const bName = getSortName(b)
    return aName.localeCompare(bName)
  })

  // Map to RankedContact format
  // Find original contact to preserve photoUrl
  const contactMap = new Map(contacts.map((c) => [c.id, c]))
  const rankedContacts: RankedContact[] = sorted.slice(0, max).map((c) => {
    const original = contactMap.get(c.id)
    return {
      id: c.id,
      name: c.name,
      email: c.primaryEmail,
      phone: c.primaryPhone,
      photoUrl: original?.photoUrl,
      source: c.source === 'contacts' ? 'connections' : 'otherContacts',
      qualityScore: c.score,
      handle: computeHandle(c),
      subtitle: computeSubtitle(c),
      score: c.score, // Keep for debug
    }
  })

  // Debug logging
  console.log(
    '[Contacts] Ranked payment contacts',
    rankedContacts.slice(0, 25).map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      source: c.source,
      score: c.score,
    }))
  )

  return rankedContacts
}
