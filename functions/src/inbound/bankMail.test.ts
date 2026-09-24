import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'crypto'
import { describe, it } from 'node:test'
import { Webhook } from 'svix'
import {
  archiveReceivedEmail,
  attachmentPath,
  handleBankMailWebhook,
  mapReceivingPayload,
  rawMimePath,
  sha256Hex,
  verifyResendWebhook,
  type IngressStore,
  type ObjectStore,
  type ReceivingClient,
} from './bankMailPure'
import { EVIDENCE_COLLECTION, INGRESS_COLLECTION, REJECTED_COLLECTION, type EvidenceRecord, type IngressRecord } from './bankMailTypes'

const SECRET_BYTES = randomBytes(24)
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`

function sign(raw: string, id = 'msg_1', timestamp = `${Math.floor(Date.now() / 1000)}`): Record<string, string> {
  const digest = createHmac('sha256', SECRET_BYTES).update(`${id}.${timestamp}.${raw}`).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${digest}` }
}

function eventBody(emailId = 'email_1', to: string[] = ['receipts@inbound.mozpaga.xyz']) {
  return JSON.stringify({
    type: 'email.received',
    data: { email_id: emailId, to, from: 'Ada <ada@gmail.com>', subject: 'hi', created_at: '2026-09-24T07:00:00.000Z' },
  })
}

function memoryStore() {
  const ingress = new Map<string, IngressRecord>()
  const rejected = new Map<string, IngressRecord & { reason: string }>()
  const writes: string[] = []
  const store: IngressStore = {
    async createIngress(record) {
      writes.push(`${INGRESS_COLLECTION}/${record.svixId}`)
      if (ingress.has(record.svixId)) return 'exists'
      ingress.set(record.svixId, record)
      return 'created'
    },
    async createRejected(record) {
      writes.push(`${REJECTED_COLLECTION}/${record.svixId}`)
      if (rejected.has(record.svixId)) return 'exists'
      rejected.set(record.svixId, record)
      return 'created'
    },
  }
  return { ingress, rejected, writes, store }
}

function logSink() {
  const lines: string[] = []
  return {
    lines,
    log: {
      info(event: string, fields?: Record<string, string | number | boolean | null>) {
        lines.push(JSON.stringify({ event, ...fields }))
      },
    },
  }
}

describe('inbound bank mail webhook', () => {
  it('creates one ingress record for a correctly signed email.received event', async () => {
    const raw = eventBody()
    const mem = memoryStore()
    const result = await handleBankMailWebhook({
      method: 'POST',
      rawBody: raw,
      headers: sign(raw),
      secret: SECRET,
      store: mem.store,
      log: logSink().log,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.accepted, true)
    assert.equal(mem.ingress.size, 1)
    assert.equal(mem.ingress.get('msg_1')?.resendEmailId, 'email_1')
    assert.equal(mem.ingress.get('msg_1')?.status, 'received')
  })

  it('writes nothing when the signature header is missing', async () => {
    const mem = memoryStore()
    const result = await handleBankMailWebhook({
      method: 'POST',
      rawBody: eventBody(),
      headers: {},
      secret: SECRET,
      store: mem.store,
      log: logSink().log,
    })
    assert.equal(result.status, 401)
    assert.equal(mem.writes.length, 0)
  })

  it('writes nothing when the signature is invalid', async () => {
    const raw = eventBody()
    const headers = sign(raw)
    headers['svix-signature'] = 'v1,aaaaaaaa'
    const mem = memoryStore()
    const result = await handleBankMailWebhook({
      method: 'POST',
      rawBody: raw,
      headers,
      secret: SECRET,
      store: mem.store,
      log: logSink().log,
    })
    assert.equal(result.status, 401)
    assert.equal(mem.writes.length, 0)
  })

  it('verifies the raw body, not a re-stringified JSON object', () => {
    const raw = '{ "type" : "email.received" , "data" : { "email_id" : "email_1" } }'
    const headers = sign(raw, 'msg_raw')
    assert.doesNotThrow(() => verifyResendWebhook(raw, headers, SECRET))
    const restrung = JSON.stringify(JSON.parse(raw))
    assert.notEqual(restrung, raw)
    assert.throws(() => verifyResendWebhook(restrung, headers, SECRET))
    const wh = new Webhook(SECRET)
    assert.throws(() =>
      wh.verify(restrung, {
        'svix-id': headers['svix-id'],
        'svix-timestamp': headers['svix-timestamp'],
        'svix-signature': headers['svix-signature'],
      })
    )
  })

  it('ignores an unrelated event type without writing', async () => {
    const raw = JSON.stringify({ type: 'email.sent', data: { email_id: 'email_1', to: ['receipts@inbound.mozpaga.xyz'] } })
    const mem = memoryStore()
    const result = await handleBankMailWebhook({
      method: 'POST',
      rawBody: raw,
      headers: sign(raw, 'msg_other'),
      secret: SECRET,
      store: mem.store,
      log: logSink().log,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.ignored, true)
    assert.equal(mem.writes.length, 0)
  })

  it('quarantines an unexpected recipient outside the bank-evidence ingress', async () => {
    const raw = eventBody('email_2', ['other@inbound.mozpaga.xyz'])
    const mem = memoryStore()
    const result = await handleBankMailWebhook({
      method: 'POST',
      rawBody: raw,
      headers: sign(raw, 'msg_other_rcpt'),
      secret: SECRET,
      store: mem.store,
      log: logSink().log,
    })
    assert.equal(result.body.quarantined, true)
    assert.equal(mem.ingress.size, 0)
    assert.equal(mem.rejected.size, 1)
    assert.equal(mem.writes[0].startsWith(REJECTED_COLLECTION), true)
    assert.equal(mem.writes.some((row) => row.startsWith(INGRESS_COLLECTION)), false)
  })

  it('does not create a second ingress record when the same svix-id is replayed', async () => {
    const raw = eventBody()
    const mem = memoryStore()
    const headers = sign(raw, 'msg_replay')
    await handleBankMailWebhook({ method: 'POST', rawBody: raw, headers, secret: SECRET, store: mem.store, log: logSink().log })
    const again = await handleBankMailWebhook({ method: 'POST', rawBody: raw, headers, secret: SECRET, store: mem.store, log: logSink().log })
    assert.equal(again.body.duplicate, true)
    assert.equal(mem.ingress.size, 1)
    assert.equal(mem.writes.length, 2)
  })

  it('does not log the signing secret or the message body', async () => {
    const raw = eventBody()
    const sink = logSink()
    const headers = sign(raw)
    headers['svix-signature'] = 'v1,bad'
    await handleBankMailWebhook({ method: 'POST', rawBody: raw, headers, secret: SECRET, store: memoryStore().store, log: sink.log })
    const blob = sink.lines.join('\n')
    assert.equal(blob.includes(SECRET), false)
    assert.equal(blob.includes('whsec_'), false)
    assert.equal(blob.includes('ada@gmail.com'), false)
    assert.equal(blob.includes('email_1'), false)
  })
})

describe('inbound archive worker', () => {
  const mime = Buffer.from('From: ada@gmail.com\r\nSubject: hi\r\n\r\nHello secret body')
  const pdf = Buffer.from('%PDF-1.4 receipt')

  function harness(overrides?: Partial<ReceivingClient>) {
    const objects = new Map<string, Buffer>()
    const puts: string[] = []
    const evidence = new Map<string, EvidenceRecord>()
    const ingress = new Map<string, IngressRecord>()
    const record: IngressRecord = {
      svixId: 'msg_1',
      resendEmailId: 'email_1',
      eventType: 'email.received',
      from: 'Ada <ada@gmail.com>',
      to: ['receipts@inbound.mozpaga.xyz'],
      subject: 'hi',
      receivedAt: '2026-09-24T07:00:00.000Z',
      status: 'received',
      attemptCount: 0,
      lastError: null,
      createdAt: '2026-09-24T07:00:00.000Z',
      updatedAt: '2026-09-24T07:00:00.000Z',
    }
    ingress.set(record.svixId, { ...record })
    const client: ReceivingClient = {
      async get(emailId) {
        assert.equal(emailId, 'email_1')
        return mapReceivingPayload(
          {
            id: 'email_1',
            message_id: '<rfc@gmail.com>',
            from: 'Ada <ada@gmail.com>',
            to: ['receipts@inbound.mozpaga.xyz'],
            cc: [],
            reply_to: [],
            subject: 'hi',
            created_at: '2026-09-24T07:00:00.000Z',
            text: 'Hello secret body',
            html: '<p>Hello secret body</p>',
            headers: { 'Arc-Authentication-Results': 'i=1; mx.google.com; dkim=pass' },
            authentication: { spf: { result: 'pass' }, dkim: { result: 'none' }, dmarc: { result: 'none' } },
            raw: { download_url: 'https://files.example/raw' },
            attachments: [{ id: 'att_1', filename: 'receipt.pdf', content_type: 'application/pdf' }],
          },
          emailId
        )
      },
      async download(url) {
        if (url.includes('raw')) return mime
        if (url.includes('att')) return pdf
        throw new Error('download_failed')
      },
      async attachmentDownloadUrl(_emailId, attachmentId) {
        assert.equal(attachmentId, 'att_1')
        return 'https://files.example/att'
      },
      ...overrides,
    }
    const objectStore: ObjectStore = {
      async putPrivateIfAbsent(path, bytes) {
        puts.push(path)
        if (objects.has(path)) return 'exists'
        objects.set(path, Buffer.from(bytes))
        return 'stored'
      },
    }
    const sink = logSink()
    return {
      objects,
      puts,
      evidence,
      ingress,
      sink,
      run: () =>
        archiveReceivedEmail({
          ingress: ingress.get('msg_1') as IngressRecord,
          receiving: client,
          objects: objectStore,
          evidence: {
            async get(id) {
              return evidence.get(id) || null
            },
            async create(row) {
              if (evidence.has(row.resendEmailId)) return 'exists'
              evidence.set(row.resendEmailId, row)
              return 'created'
            },
          },
          ingressMutator: {
            async get(id) {
              return ingress.get(id) || null
            },
            async update(id, patch) {
              ingress.set(id, { ...(ingress.get(id) as IngressRecord), ...patch })
            },
          },
          log: sink.log,
        }),
    }
  }

  it('retrieves by the verified email_id and stores the raw MIME hash', async () => {
    const box = harness()
    const outcome = await box.run()
    assert.equal(outcome.ok, true)
    const stored = box.evidence.get('email_1')
    assert.ok(stored)
    assert.equal(stored?.raw?.sha256, sha256Hex(mime))
    assert.equal(stored?.raw?.storagePath, rawMimePath('email_1'))
    assert.equal(stored?.raw?.byteSize, mime.length)
    assert.equal(stored?.parseStatus, 'unparsed')
    assert.equal(stored?.status, 'quarantined')
    assert.equal(stored?.authentication.spf && (stored.authentication.spf as { result: string }).result, 'pass')
    assert.equal('html' in (stored as object), false)
    assert.equal('text' in (stored as object), false)
  })

  it('stores attachment hashes at deterministic paths', async () => {
    const box = harness()
    await box.run()
    const stored = box.evidence.get('email_1')
    const path = attachmentPath('email_1', 'att_1', 'receipt.pdf')
    assert.equal(stored?.attachments[0].storagePath, path)
    assert.equal(stored?.attachments[0].sha256, sha256Hex(pdf))
    assert.equal(box.objects.get(path)?.equals(pdf), true)
  })

  it('does not duplicate evidence or objects when the worker retries', async () => {
    const box = harness()
    await box.run()
    const firstPuts = box.puts.length
    box.ingress.set('msg_1', { ...(box.ingress.get('msg_1') as IngressRecord), status: 'archive_failed' })
    const again = await box.run()
    assert.equal(again.ok, true)
    if (again.ok) assert.equal(again.duplicate, true)
    assert.equal(box.evidence.size, 1)
    assert.equal(box.puts.length, firstPuts)
  })

  it('leaves a retryable ingress record when retrieval fails', async () => {
    const box = harness({
      async get() {
        throw new Error('down')
      },
    })
    const outcome = await box.run()
    assert.equal(outcome.ok, false)
    if (!outcome.ok) assert.equal(outcome.retryable, true)
    assert.equal(box.ingress.get('msg_1')?.status, 'archive_failed')
    assert.equal(box.ingress.get('msg_1')?.lastError, 'receiving_get_failed')
    assert.equal(box.ingress.get('msg_1')?.attemptCount, 1)
    assert.equal(box.evidence.size, 0)
  })

  it('does not log raw content, secrets, or mutate anything outside evidence', async () => {
    const box = harness()
    await box.run()
    const blob = box.sink.lines.join('\n')
    assert.equal(blob.includes('Hello secret body'), false)
    assert.equal(blob.includes('re_'), false)
    assert.equal(blob.includes(SECRET), false)
    const collections = [...box.evidence.keys()].map((id) => `${EVIDENCE_COLLECTION}/${id}`)
    assert.deepEqual(collections, [`${EVIDENCE_COLLECTION}/email_1`])
    assert.equal(box.ingress.get('msg_1')?.status, 'archived')
  })
})
