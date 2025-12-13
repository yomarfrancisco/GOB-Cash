export type ContactTag =
  | 'gobankless-contact'
  | 'cash-agent'
  | 'friend'
  | 'family'
  | 'work'
  | 'ai-agent'
  | 'other'

export interface ContactDoc {
  contactId: string // stable, derived from email/phone/handle
  displayName: string | null
  handle: string | null // if we can infer a handle; otherwise null
  primaryEmail: string | null
  primaryPhone: string | null
  source: 'device' // or 'device-ranked', etc.
  createdAt: any // Firestore Timestamp
  updatedAt: any // Firestore Timestamp
}

// Legacy directory doc (deprecated - use PublicDirectoryDoc instead)
export interface DirectoryDoc {
  handle: string
  ownerUserId: string | null // if we know which user owns it
  displayName: string | null
  createdAt: any // Firestore Timestamp
  updatedAt: any // Firestore Timestamp
  // Ghost metrics (pre-claim) - optional for backward compatibility
  inboundEdgeCount?: number // how many users have this handle
  avgContactCompleteness?: number // 0..1
  ghostQuality?: number // 0..1
  // Claimed metrics - optional for backward compatibility
  trustGlobal?: number | null // mirror of owner's trustGlobal when claimed
  isAgent?: boolean // existing or new flag
  claimedAt?: any | null // Firebase Timestamp
  // Location metadata - inferred from contact phone numbers
  phoneCountry?: string | null // ISO2 country code (e.g., 'ZA', 'MZ', 'ZW')
}

/**
 * Public directory document - readable by anyone (pre-auth included)
 * Stored in /publicDirectory/{handle}
 */
export interface PublicDirectoryDoc {
  handle: string
  displayName: string | null
  avatarUrl?: string | null
  phoneCountry?: string | null // ISO2 country code (e.g., 'ZA', 'MZ', 'ZW')
  isAgent: boolean
  ownerUserId: string // REQUIRED - never null for real users
  ghostQuality?: number // 0..1
  trustGlobal?: number | null // mirror of owner's trustGlobal when claimed
  updatedAt: any // Firestore Timestamp
  createdAt: any // Firestore Timestamp
}

/**
 * Private directory document - readable only when authenticated
 * Stored in /directoryPrivate/{handle}
 */
export interface DirectoryPrivateDoc {
  handle: string
  ownerUserId: string // REQUIRED - never null
  email: string // from user doc
  phoneE164: string // e.g. +2760...
  phoneCountry?: string | null // ISO2 country code
  updatedAt: any // Firestore Timestamp
  createdAt: any // Firestore Timestamp
}

