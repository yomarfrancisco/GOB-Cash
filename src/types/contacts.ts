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
}

