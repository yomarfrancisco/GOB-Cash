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

// Bulk/system sender detection
function isLikelyBulkSender(email?: string, name?: string): boolean {
  if (!email) return false

  const emailLower = email.toLowerCase()
  const localPart = emailLower.split('@')[0]
  const domain = emailLower.split('@')[1] || ''

  // Check local part for bulk keywords
  const bulkKeywords = [
    'no-reply',
    'noreply',
    'donotreply',
    'do-not-reply',
    'notifications',
    'notification',
    'support',
    'help',
    'info',
    'billing',
    'sales',
    'newsletter',
    'updates',
    'receipts',
    'receipt',
    'alerts',
    'noreply+',
  ]

  if (bulkKeywords.some((keyword) => localPart.includes(keyword))) {
    return true
  }

  // Check domain for platform/marketing services
  const bulkDomains = [
    'facebookmail.com',
    'linkedin.com',
    'twitter.com',
    'slack.com',
    'asana.com',
    'notion.so',
    'github.com',
    'stripe.com',
    'paypal.com',
    'mailchimp.com',
    'substack.com',
    'sendgrid.net',
    'amazonses.com',
  ]

  if (bulkDomains.some((bulkDomain) => domain.includes(bulkDomain))) {
    return true
  }

  // Empty/whitespace name AND no phone AND no photo = likely system
  const hasName = name && name.trim().length > 0
  // Note: we don't have phone/photo here, so we'll check this in the caller

  return false
}

// Check if contact is a human candidate
function isHumanCandidate(contact: BasicContact): boolean {
  // First check bulk sender heuristics
  if (isLikelyBulkSender(contact.email, contact.name)) {
    return false
  }

  // Additional check: empty name AND no phone AND no photo = likely system
  const hasName = contact.name && contact.name.trim().length > 0 && contact.name !== 'Unknown'
  const hasPhone = !!contact.phone
  const hasPhoto = !!contact.photoUrl

  if (!hasName && !hasPhone && !hasPhoto) {
    return false
  }

  return true
}

// Helper: check if name has at least 2 tokens (full name)
function hasFullName(name?: string): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed === 'Unknown' || trimmed.length === 0) return false
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0)
  return tokens.length >= 2
}

// Helper: normalize phone (basic check)
function hasPhone(phone?: string): boolean {
  return !!phone && phone.trim().length > 0
}

// Helper: normalize email
function hasEmail(email?: string): boolean {
  return !!email && email.trim().length > 0
}

// Helper: check if has photo
function hasPhoto(photoUrl?: string): boolean {
  return !!photoUrl && photoUrl.trim().length > 0
}

// Helper: get normalized name for sorting
function getNormalizedName(contact: BasicContact): string {
  const name = contact.name?.trim() && contact.name !== 'Unknown' ? contact.name.trim() : ''
  const email = contact.email || ''
  const phone = contact.phone || ''
  return (name || email || phone).toLowerCase()
}

// Tier 1 scoring (saved contacts / connections)
function scoreTier1(contact: BasicContact): number {
  let score = 0

  if (hasPhone(contact.phone)) score += 4 // phone is strong signal
  if (hasPhoto(contact.photoUrl)) score += 3 // avatar suggests "real person"
  if (hasFullName(contact.name)) score += 2 // at least two tokens in name
  if (hasEmail(contact.email)) score += 1 // good but weaker than phone

  // Optional: recency bonus would go here if we had timestamps
  // For now, we'll skip it

  return score
}

// Tier 2 scoring (otherContacts)
function scoreTier2(contact: BasicContact): number {
  let score = 0

  if (hasPhone(contact.phone)) score += 3 // phone is rare in Other Contacts
  if (hasFullName(contact.name)) score += 2
  if (hasPhoto(contact.photoUrl)) score += 1
  if (hasEmail(contact.email)) score += 1

  // Domain bonus for freemail (more often individuals)
  if (contact.email) {
    const domain = contact.email.toLowerCase().split('@')[1] || ''
    const freemailDomains = [
      'gmail.com',
      'googlemail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'icloud.com',
      'live.com',
      'proton.me',
    ]

    if (freemailDomains.includes(domain)) {
      score += 1
    }
  }

  // Optional: recency bonus would go here if we had timestamps

  return score
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

export function getRankedContacts(
  contacts: BasicContact[],
  max = 25
): RankedContact[] {
  // Step 1: Filter to human candidates only
  const humanCandidates = contacts.filter((c) => isHumanCandidate(c))

  // Step 2: Split into Tier 1 (saved contacts) and Tier 2 (other contacts)
  // Note: saved contacts use source 'contacts' (from fetchGoogleContacts)
  const tier1 = humanCandidates.filter((c) => c.source === 'contacts')
  const preFilteredTier2 = humanCandidates.filter((c) => c.source === 'otherContacts')

  // Step 3: Score each tier
  const scoredTier1: Array<BasicContact & { score: number }> = tier1.map((c) => ({
    ...c,
    score: scoreTier1(c),
  }))

  const scoredTier2: Array<BasicContact & { score: number }> = preFilteredTier2
    .map((c) => ({
      ...c,
      score: scoreTier2(c),
    }))
    .filter((c) => c.score >= 4) // Throw away Tier 2 contacts with score < 4

  // Step 4: Sort each tier
  // Primary: score descending
  // Secondary: normalized name ascending
  const sortedTier1 = scoredTier1.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    const aName = getNormalizedName(a)
    const bName = getNormalizedName(b)
    return aName.localeCompare(bName)
  })

  const sortedTier2 = scoredTier2.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    const aName = getNormalizedName(a)
    const bName = getNormalizedName(b)
    return aName.localeCompare(bName)
  })

  // Step 5: Merge final ranked list (Tier 1 first, then Tier 2)
  const mergedContacts = [...sortedTier1, ...sortedTier2]

  // Step 6: Map to RankedContact format and slice
  const rankedContacts: RankedContact[] = mergedContacts.slice(0, max).map((c) => ({
    ...c,
    qualityScore: c.score,
    handle: computeHandle(c),
    subtitle: computeSubtitle(c),
  }))

  // Debug logging
  console.log('[ContactsRank] Tier1 saved contacts', { count: tier1.length })
  console.log('[ContactsRank] Tier2 human otherContacts (pre-threshold)', {
    count: preFilteredTier2.length,
  })
  console.log('[ContactsRank] Tier2 kept after threshold', { count: sortedTier2.length })
  console.log('[ContactsRank] Final ranked contacts', { count: rankedContacts.length })

  return rankedContacts
}
