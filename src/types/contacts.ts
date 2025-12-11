export type ContactTag =
  | 'gobankless-contact'
  | 'cash-agent'
  | 'friend'
  | 'family'
  | 'work'
  | 'ai-agent'
  | 'other'

export interface ContactDoc {
  contactId: string
  displayName: string
  handle?: string
  phone?: string
  email?: string
  avatarUrl?: string
  tags: ContactTag[]
  isGoBanklessUser?: boolean
  isCashAgent?: boolean
  lastSeenAt?: number | null
  lastUpdatedAt: number
}

export interface DirectoryDoc {
  handle: string // `$handle`, lowercased
  displayName: string
  avatarUrl?: string
  summaryTags?: ContactTag[]
  userId?: string
  lastActiveAt?: number | null
}

