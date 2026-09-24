/** Phase 1 inbound capture. Evidence only — never a ticket, mandate, or belief. */

export const RECEIPTS_ADDRESS = 'receipts@inbound.mozpaga.xyz'
export const INGRESS_COLLECTION = 'bankEvidenceIngress'
export const REJECTED_COLLECTION = 'bankEvidenceRejected'
export const EVIDENCE_COLLECTION = 'bankEvidence'

export const MAX_RAW_BYTES = 15 * 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 20

export type IngressStatus = 'received' | 'archiving' | 'archived' | 'quarantined' | 'archive_failed'

export type IngressRecord = {
  svixId: string
  resendEmailId: string
  eventType: string
  from: string | null
  to: string[]
  subject: string | null
  receivedAt: string
  status: IngressStatus
  attemptCount: number
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type ArtifactRecord = {
  storagePath: string
  sha256: string
  byteSize: number
  contentType: string
}

export type AttachmentRecord = ArtifactRecord & {
  resendAttachmentId: string
  originalFilename: string
  safeFilename: string
}

export type EvidenceRecord = {
  resendEmailId: string
  ingressSvixId: string
  rfcMessageId: string | null
  from: string | null
  to: string[]
  cc: string[]
  replyTo: string[]
  subject: string | null
  receivedAt: string | null
  hasText: boolean
  hasHtml: boolean
  headers: Record<string, string> | null
  headersStoragePath: string | null
  authentication: { spf: unknown; dkim: unknown; dmarc: unknown }
  raw: ArtifactRecord | null
  attachments: AttachmentRecord[]
  /** Bytes are stored, but this slice never treats mail as bank-authenticated. */
  status: 'quarantined' | 'archive_failed'
  parseStatus: 'unparsed'
  reason: string
  createdAt: string
  updatedAt: string
}

export type SafeLog = {
  info(event: string, fields?: Record<string, string | number | boolean | null>): void
}
