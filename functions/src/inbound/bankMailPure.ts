import { createHash } from 'crypto'
import { Webhook } from 'svix'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_RAW_BYTES,
  RECEIPTS_ADDRESS,
  type AttachmentRecord,
  type EvidenceRecord,
  type IngressRecord,
  type SafeLog,
} from './bankMailTypes'

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function safeFilename(name: string, fallback: string): string {
  const base = (name.split(/[/\\]/).pop() || fallback).trim()
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120)
  return cleaned || fallback
}

export function rawMimePath(resendEmailId: string): string {
  return `bankEvidence/inbound/${safeFilename(resendEmailId, 'email')}/raw.eml`
}

export function attachmentPath(resendEmailId: string, attachmentId: string, filename: string): string {
  const email = safeFilename(resendEmailId, 'email')
  const id = safeFilename(attachmentId, 'attachment')
  return `bankEvidence/inbound/${email}/attachments/${id}/${safeFilename(filename, 'file')}`
}

export function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue
    const picked = Array.isArray(value) ? value[0] : value
    if (typeof picked === 'string' && picked.trim()) return picked.trim()
  }
  return undefined
}

export function emailAddresses(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const angled = item.match(/<([^>]+)>/)
    const email = (angled ? angled[1] : item).trim().toLowerCase()
    if (email.includes('@')) out.push(email)
  }
  return out
}

export function recipientSet(data: Record<string, unknown>): string[] {
  return [...emailAddresses(data.to), ...emailAddresses(data.cc), ...emailAddresses(data.bcc)]
}

export function isReceiptsRecipient(data: Record<string, unknown>): boolean {
  return recipientSet(data).includes(RECEIPTS_ADDRESS)
}

/** Verify against the exact bytes Resend signed. Never JSON.stringify first. */
export function verifyResendWebhook(
  rawBody: string | Buffer,
  headers: Record<string, unknown>,
  secret: string
): unknown {
  const id = headerValue(headers, 'svix-id')
  const timestamp = headerValue(headers, 'svix-timestamp')
  const signature = headerValue(headers, 'svix-signature')
  if (!id || !timestamp || !signature || !secret) {
    throw new Error('missing_signature')
  }
  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const wh = new Webhook(secret)
  const verified = wh.verify(payload, {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': signature,
  })
  if (verified && typeof verified === 'object') return verified
  if (typeof verified === 'string') return JSON.parse(verified) as unknown
  return JSON.parse(payload) as unknown
}

export type IngressStore = {
  createIngress(record: IngressRecord): Promise<'created' | 'exists'>
  createRejected(record: IngressRecord & { reason: string }): Promise<'created' | 'exists'>
}

export type WebhookResult = { status: number; body: Record<string, unknown> }

export async function handleBankMailWebhook(input: {
  method: string
  rawBody: Buffer | string | undefined
  headers: Record<string, unknown>
  secret: string
  store: IngressStore
  log: SafeLog
  now?: Date
}): Promise<WebhookResult> {
  const log = input.log
  if (input.method.toUpperCase() !== 'POST') {
    log.info('inbound_rejected', { status: 405, reason: 'method' })
    return { status: 405, body: { ok: false, error: 'method_not_allowed' } }
  }
  if (!input.rawBody || (typeof input.rawBody !== 'string' && !Buffer.isBuffer(input.rawBody))) {
    log.info('inbound_rejected', { status: 400, reason: 'raw_body' })
    return { status: 400, body: { ok: false, error: 'raw_body_required' } }
  }
  if (!input.secret) {
    log.info('inbound_rejected', { status: 500, reason: 'secret_missing' })
    return { status: 500, body: { ok: false, error: 'not_configured' } }
  }

  let verified: unknown
  try {
    verified = verifyResendWebhook(input.rawBody, input.headers, input.secret)
  } catch {
    log.info('inbound_rejected', { status: 401, reason: 'signature' })
    return { status: 401, body: { ok: false, error: 'invalid_signature' } }
  }

  const event = verified && typeof verified === 'object' ? (verified as Record<string, unknown>) : {}
  const svixId = headerValue(input.headers, 'svix-id') || ''
  const eventType = typeof event.type === 'string' ? event.type : ''
  if (eventType !== 'email.received') {
    log.info('inbound_ignored', { status: 200, reason: 'event_type' })
    return { status: 200, body: { ok: true, ignored: true } }
  }

  const data = event.data && typeof event.data === 'object' ? (event.data as Record<string, unknown>) : {}
  const resendEmailId = typeof data.email_id === 'string' ? data.email_id : ''
  if (!svixId || !resendEmailId) {
    log.info('inbound_rejected', { status: 400, reason: 'envelope' })
    return { status: 400, body: { ok: false, error: 'incomplete_event' } }
  }

  const now = (input.now || new Date()).toISOString()
  const record: IngressRecord = {
    svixId,
    resendEmailId,
    eventType,
    from: typeof data.from === 'string' ? data.from.slice(0, 320) : null,
    to: recipientSet(data).slice(0, 20),
    subject: typeof data.subject === 'string' ? data.subject.slice(0, 500) : null,
    receivedAt: typeof data.created_at === 'string' ? data.created_at : now,
    status: 'received',
    attemptCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }

  if (!isReceiptsRecipient(data)) {
    const outcome = await input.store.createRejected({ ...record, status: 'quarantined', reason: 'unexpected_recipient' })
    log.info('inbound_quarantined', { status: 200, duplicate: outcome === 'exists' })
    return { status: 200, body: { ok: true, quarantined: true, duplicate: outcome === 'exists' } }
  }

  const outcome = await input.store.createIngress(record)
  log.info('inbound_accepted', { status: 200, duplicate: outcome === 'exists', emailId: resendEmailId })
  return { status: 200, body: { ok: true, accepted: true, duplicate: outcome === 'exists' } }
}

export type ReceivedAttachmentMeta = {
  id: string
  filename: string
  contentType: string
}

export type ReceivedEmail = {
  id: string
  messageId: string | null
  from: string | null
  to: string[]
  cc: string[]
  replyTo: string[]
  subject: string | null
  receivedAt: string | null
  hasText: boolean
  hasHtml: boolean
  headers: Record<string, string>
  authentication: { spf: unknown; dkim: unknown; dmarc: unknown }
  rawDownloadUrl: string | null
  attachments: ReceivedAttachmentMeta[]
}

export type ReceivingClient = {
  get(emailId: string): Promise<ReceivedEmail>
  download(url: string, maxBytes: number): Promise<Buffer>
  attachmentDownloadUrl(emailId: string, attachmentId: string): Promise<string>
}

export type ObjectStore = {
  putPrivateIfAbsent(path: string, bytes: Buffer, contentType: string): Promise<'stored' | 'exists'>
}

export type EvidenceStore = {
  get(emailId: string): Promise<EvidenceRecord | null>
  create(record: EvidenceRecord): Promise<'created' | 'exists'>
}

export type IngressMutator = {
  get(svixId: string): Promise<IngressRecord | null>
  update(svixId: string, patch: Partial<IngressRecord>): Promise<void>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function headerMap(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    const out: Record<string, string> = {}
    for (const row of value) {
      const item = asRecord(row)
      const name = typeof item.name === 'string' ? item.name : ''
      const header = typeof item.value === 'string' ? item.value : ''
      if (name) out[name] = header
    }
    return out
  }
  const record = asRecord(value)
  const out: Record<string, string> = {}
  for (const [key, header] of Object.entries(record)) {
    if (typeof header === 'string') out[key] = header
  }
  return out
}

export function mapReceivingPayload(json: unknown, fallbackId: string): ReceivedEmail {
  const root = asRecord(json)
  const data = root.data && typeof root.data === 'object' ? asRecord(root.data) : root
  const auth = asRecord(data.authentication)
  const raw = asRecord(data.raw)
  const attachments = Array.isArray(data.attachments) ? data.attachments : []
  return {
    id: typeof data.id === 'string' ? data.id : fallbackId,
    messageId: typeof data.message_id === 'string' ? data.message_id : null,
    from: typeof data.from === 'string' ? data.from : null,
    to: emailAddresses(data.to),
    cc: emailAddresses(data.cc),
    replyTo: emailAddresses(data.reply_to),
    subject: typeof data.subject === 'string' ? data.subject : null,
    receivedAt: typeof data.created_at === 'string' ? data.created_at : null,
    hasText: typeof data.text === 'string' && data.text.length > 0,
    hasHtml: typeof data.html === 'string' && data.html.length > 0,
    headers: headerMap(data.headers),
    authentication: {
      spf: auth.spf ?? null,
      dkim: auth.dkim ?? null,
      dmarc: auth.dmarc ?? null,
    },
    rawDownloadUrl: typeof raw.download_url === 'string' ? raw.download_url : null,
    attachments: attachments.flatMap((row) => {
      const item = asRecord(row)
      if (typeof item.id !== 'string' || !item.id) return []
      return [
        {
          id: item.id,
          filename: typeof item.filename === 'string' ? item.filename : 'attachment',
          contentType: typeof item.content_type === 'string' ? item.content_type : 'application/octet-stream',
        },
      ]
    }),
  }
}

export type ArchiveOutcome =
  | { ok: true; duplicate: boolean }
  | { ok: false; retryable: boolean; reason: string }

export async function archiveReceivedEmail(input: {
  ingress: IngressRecord
  receiving: ReceivingClient
  objects: ObjectStore
  evidence: EvidenceStore
  ingressMutator: IngressMutator
  log: SafeLog
  now?: Date
}): Promise<ArchiveOutcome> {
  const { ingress, log } = input
  const now = () => (input.now || new Date()).toISOString()
  if (ingress.status === 'archived' || ingress.status === 'quarantined') {
    log.info('archive_skip', { status: ingress.status })
    return { ok: true, duplicate: true }
  }
  const existing = await input.evidence.get(ingress.resendEmailId)
  if (existing) {
    await input.ingressMutator.update(ingress.svixId, { status: 'archived', updatedAt: now(), lastError: null })
    log.info('archive_skip', { status: 'evidence_exists' })
    return { ok: true, duplicate: true }
  }

  const attempt = ingress.attemptCount + 1
  await input.ingressMutator.update(ingress.svixId, {
    status: 'archiving',
    attemptCount: attempt,
    updatedAt: now(),
  })

  const fail = async (reason: string, retryable: boolean): Promise<ArchiveOutcome> => {
    await input.ingressMutator.update(ingress.svixId, {
      status: retryable ? 'archive_failed' : 'quarantined',
      lastError: reason,
      updatedAt: now(),
    })
    log.info('archive_failed', { retryable, reason })
    return { ok: false, retryable, reason }
  }

  let email: ReceivedEmail
  try {
    email = await input.receiving.get(ingress.resendEmailId)
  } catch {
    return fail('receiving_get_failed', true)
  }
  if (email.id !== ingress.resendEmailId) {
    return fail('email_id_mismatch', false)
  }
  if (!email.rawDownloadUrl) return fail('raw_unavailable', true)

  let raw: Buffer
  try {
    raw = await input.receiving.download(email.rawDownloadUrl, MAX_RAW_BYTES)
  } catch (error) {
    const reason = error instanceof Error && error.message === 'too_large' ? 'raw_too_large' : 'raw_download_failed'
    return fail(reason, reason !== 'raw_too_large')
  }

  const rawPath = rawMimePath(email.id)
  const attachments: AttachmentRecord[] = []
  const listed = email.attachments.slice(0, MAX_ATTACHMENTS)
  for (const item of listed) {
    let url: string
    try {
      url = await input.receiving.attachmentDownloadUrl(email.id, item.id)
      const bytes = await input.receiving.download(url, MAX_ATTACHMENT_BYTES)
      const path = attachmentPath(email.id, item.id, item.filename)
      await input.objects.putPrivateIfAbsent(path, bytes, item.contentType || 'application/octet-stream')
      attachments.push({
        resendAttachmentId: item.id,
        originalFilename: item.filename.slice(0, 240),
        safeFilename: safeFilename(item.filename, 'file'),
        storagePath: path,
        sha256: sha256Hex(bytes),
        byteSize: bytes.length,
        contentType: item.contentType || 'application/octet-stream',
      })
    } catch (error) {
      const reason = error instanceof Error && error.message === 'too_large' ? 'attachment_too_large' : 'attachment_download_failed'
      return fail(reason, reason !== 'attachment_too_large')
    }
  }

  await input.objects.putPrivateIfAbsent(rawPath, raw, 'message/rfc822')
  const stamp = now()
  const headersJson = JSON.stringify(email.headers)
  const headersInline = headersJson.length <= 80_000
  const evidence: EvidenceRecord = {
    resendEmailId: email.id,
    ingressSvixId: ingress.svixId,
    rfcMessageId: email.messageId,
    from: email.from,
    to: email.to,
    cc: email.cc,
    replyTo: email.replyTo,
    subject: email.subject,
    receivedAt: email.receivedAt,
    hasText: email.hasText,
    hasHtml: email.hasHtml,
    headers: headersInline ? email.headers : null,
    headersStoragePath: headersInline ? null : `bankEvidence/inbound/${safeFilename(email.id, 'email')}/headers.json`,
    authentication: email.authentication,
    raw: {
      storagePath: rawPath,
      sha256: sha256Hex(raw),
      byteSize: raw.length,
      contentType: 'message/rfc822',
    },
    attachments,
    status: 'quarantined',
    parseStatus: 'unparsed',
    reason: 'bank_authentication_not_evaluated',
    createdAt: stamp,
    updatedAt: stamp,
  }
  if (!headersInline) {
    await input.objects.putPrivateIfAbsent(
      evidence.headersStoragePath as string,
      Buffer.from(headersJson),
      'application/json'
    )
  }
  await input.evidence.create(evidence)
  await input.ingressMutator.update(ingress.svixId, { status: 'archived', lastError: null, updatedAt: stamp })
  log.info('archive_stored', {
    emailId: email.id,
    rawBytes: raw.length,
    attachments: attachments.length,
  })
  return { ok: true, duplicate: false }
}
