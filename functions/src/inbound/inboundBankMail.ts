/**
 * Phase 1: Resend email.received → verified ingress → private archive.
 * Does not parse banks, match tickets, or touch the desk.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { archiveReceivedEmail } from './bankMailPure'
import { handleBankMailWebhook } from './bankMailPure'
import { resendReceivingClient } from './resendReceiving'
import { applyFnbEvent, liquidityDeltaZar, type CardFloat } from './fnbApply'
import { pdfText } from './fnbPdf'
import { bankNoticeCopy, isFnbSender, looksLikeFnbReceipt, parseFnbCardSpend, parseFnbReceipt, type FnbEvent } from './fnbParse'
import { imageText } from './mznImageText'
import { mznNoticeCopy, parseMznProof, type MznProof } from './mznProofParse'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import {
  EVIDENCE_COLLECTION,
  INGRESS_COLLECTION,
  REJECTED_COLLECTION,
  type EvidenceRecord,
  type IngressRecord,
  type SafeLog,
} from './bankMailTypes'

const inboundSecret = defineSecret('RESEND_INBOUND_SECRET')
const inboundApiKey = defineSecret('RESEND_INBOUND_API_KEY')

const safeLog: SafeLog = {
  info(event, fields) {
    const safe: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(fields || {})) {
      if (['status', 'reason', 'duplicate', 'retryable', 'emailId', 'rawBytes', 'attachments'].includes(key)) {
        safe[key] = value
      }
    }
    console.log(JSON.stringify({ event, ...safe }))
  },
}

function db() {
  return admin.firestore()
}

export const inbound_bankMail = functions
  .region('us-central1')
  .runWith({ secrets: [inboundSecret], timeoutSeconds: 20, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    const result = await handleBankMailWebhook({
      method: req.method,
      rawBody: req.rawBody,
      headers: req.headers as Record<string, unknown>,
      secret: inboundSecret.value(),
      log: safeLog,
      store: {
        async createIngress(record) {
          try {
            await db().collection(INGRESS_COLLECTION).doc(record.svixId).create(record)
            return 'created'
          } catch (error) {
            const code = (error as { code?: number }).code
            if (code === 6) return 'exists'
            throw error
          }
        },
        async createRejected(record) {
          try {
            await db().collection(REJECTED_COLLECTION).doc(record.svixId).create(record)
            return 'created'
          } catch (error) {
            const code = (error as { code?: number }).code
            if (code === 6) return 'exists'
            throw error
          }
        },
      },
    })
    res.status(result.status).json(result.body)
  })

export const inbound_archiveBankMail = functions
  .region('us-central1')
  .runWith({
    secrets: [inboundApiKey],
    timeoutSeconds: 120,
    memory: '512MB',
    failurePolicy: true,
  })
  .firestore.document(`${INGRESS_COLLECTION}/{svixId}`)
  .onCreate(async (snap) => {
    const ingress = snap.data() as IngressRecord
    if (ingress.status !== 'received') return
    const bucket = admin.storage().bucket()
    const outcome = await archiveReceivedEmail({
      ingress,
      log: safeLog,
      receiving: resendReceivingClient(inboundApiKey.value()),
      objects: {
        async putPrivateIfAbsent(path, bytes, contentType) {
          const file = bucket.file(path)
          const [exists] = await file.exists()
          if (exists) return 'exists'
          await file.save(bytes, {
            resumable: false,
            contentType,
            metadata: { metadata: { sha256: '' } },
            predefinedAcl: 'private',
          })
          return 'stored'
        },
      },
      evidence: {
        async get(emailId) {
          const doc = await db().collection(EVIDENCE_COLLECTION).doc(emailId).get()
          return doc.exists ? (doc.data() as EvidenceRecord) : null
        },
        async create(record) {
          try {
            await db().collection(EVIDENCE_COLLECTION).doc(record.resendEmailId).create(record)
            return 'created'
          } catch (error) {
            const code = (error as { code?: number }).code
            if (code === 6) return 'exists'
            throw error
          }
        },
      },
      ingressMutator: {
        async get(svixId) {
          const doc = await db().collection(INGRESS_COLLECTION).doc(svixId).get()
          return doc.exists ? (doc.data() as IngressRecord) : null
        },
        async update(svixId, patch) {
          await db().collection(INGRESS_COLLECTION).doc(svixId).set(patch, { merge: true })
        },
      },
    })
    if (!outcome.ok && outcome.retryable) {
      throw new Error('archive_retryable')
    }
    if (outcome.ok) {
      await recordFnbNotice(ingress.resendEmailId, bucket)
      await recordMznProof(ingress.resendEmailId, bucket)
    }
  })

async function recordFnbNotice(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const ref = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await ref.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  const fromBank = isFnbSender(evidence.from)
  const spend = evidence.subject ? parseFnbCardSpend(evidence.subject) : null
  let event: FnbEvent | null = spend
  if (!event && (fromBank || looksLikeFnbReceipt(evidence.subject))) {
    const pdf = (evidence.attachments || []).find((row) => /pdf/i.test(row.contentType) || /\.pdf$/i.test(row.safeFilename))
    if (!pdf) return
    const [bytes] = await bucket.file(pdf.storagePath).download()
    event = parseFnbReceipt(await pdfText(bytes))
  }
  if (!event) return
  const cardLast4 = event.cardLast4
  if (!cardLast4) return
  const eventRef = db().collection('bankFnbEvents').doc(emailId)
  const floatRef = db().collection('fnbCardFloat').doc(cardLast4)
  const walletRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('wallets').doc('cashZAR')
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    const floatSnap = await tx.get(floatRef)
    const walletSnap = await tx.get(walletRef)
    const prior = existing.exists ? (existing.data() as FnbEvent & { merchant?: string | null; liquidityApplied?: boolean }) : null
    if (prior?.kind === 'conversion_receipt' && !prior.merchant && event.kind === 'conversion_receipt' && event.merchant) {
      tx.set(eventRef, { merchant: event.merchant }, { merge: true })
    }
    const source = prior || event
    if (!prior?.liquidityApplied) {
      const delta = liquidityDeltaZar(source)
      if (delta !== 0) {
        const current = Number(walletSnap.exists ? walletSnap.data()?.fiatBalance || 0 : 0)
        tx.set(walletRef, {
          fiatBalance: Math.round((current + delta) * 100) / 100,
          updatedAt: new Date().toISOString(),
        }, { merge: true })
      }
    }
    if (prior) {
      if (!prior.liquidityApplied) tx.set(eventRef, { liquidityApplied: true }, { merge: true })
      return
    }
    const next = applyFnbEvent(floatSnap.exists ? (floatSnap.data() as CardFloat) : null, event, cardLast4)
    tx.set(eventRef, {
      ...event,
      forwarded: !fromBank,
      liquidityApplied: true,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    tx.set(floatRef, { ...next, updatedAt: new Date().toISOString() })
    tx.set(ref, { parseStatus: 'parsed', fnbKind: event.kind }, { merge: true })
  })
  safeLog.info('fnb_recorded', { emailId, reason: event.kind })
  await publishBankNotice(emailId, event, !fromBank)
}

async function publishBankNotice(emailId: string, event: FnbEvent, forwarded: boolean): Promise<void> {
  const id = `fnb-${emailId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = bankNoticeCopy(event, forwarded)
  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: copy.title,
    body: copy.body,
    dropdownTitle: copy.title,
    dropdownBody: copy.body,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: event.amountZar,
    amountSign: 'debit',
    txId: id,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'bank_notice',
    deskSpeaker: 'sam',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
}

async function recordMznProof(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  const image = (evidence.attachments || []).find(
    (row) => /^image\//i.test(row.contentType) || /\.(jpe?g|png|webp)$/i.test(row.safeFilename)
  )
  if (!image) return
  const [bytes] = await bucket.file(image.storagePath).download()
  const proof = parseMznProof(await imageText(bytes))
  if (!proof) return
  const docId = proof.operationNumber || `img-${image.sha256.slice(0, 32)}`
  const eventRef = db().collection('bankMznEvents').doc(docId)
  const walletRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('wallets').doc('cashMZN')
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    const walletSnap = await tx.get(walletRef)
    const current = Number(walletSnap.exists ? walletSnap.data()?.fiatBalance || 0 : 0)
    tx.set(walletRef, {
      fiatBalance: Math.round((current + proof.amountMzn) * 100) / 100,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
    tx.set(eventRef, {
      ...proof,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      imageSha256: image.sha256,
      createdAt: new Date().toISOString(),
    })
    tx.set(evidenceRef, { parseStatus: 'parsed', mznKind: proof.kind }, { merge: true })
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('mzn_recorded', { emailId, reason: proof.layout })
  await publishMznNotice(docId, proof)
}

async function publishMznNotice(docId: string, proof: MznProof): Promise<void> {
  const id = `mzn-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = mznNoticeCopy(proof)
  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: copy.title,
    body: copy.body,
    dropdownTitle: copy.title,
    dropdownBody: copy.body,
    actorType: 'ai_manager',
    avatarKind: 'convert_mzn',
    amountCurrency: 'MZN',
    amountValue: proof.amountMzn,
    amountSign: 'credit',
    txId: id,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'bank_notice',
    deskSpeaker: 'sam',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
}

/** One-shot: parse FNB mail already archived before this recorder existed. */
export const inbound_backfillFnb = functions
  .region('us-central1')
  .runWith({ secrets: [inboundSecret], timeoutSeconds: 120, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    const provided = req.get('x-inbound-secret') || ''
    if (!provided || provided !== inboundSecret.value()) {
      res.status(401).json({ ok: false })
      return
    }
    const bucket = admin.storage().bucket()
    const snap = await db().collection(EVIDENCE_COLLECTION).limit(50).get()
    let recorded = 0
    for (const doc of snap.docs) {
      await recordFnbNotice(doc.id, bucket)
      await recordMznProof(doc.id, bucket)
      const after = await db().collection('bankFnbEvents').doc(doc.id).get()
      if (after.exists) recorded += 1
    }
    res.status(200).json({ ok: true, scanned: snap.size, recorded })
  })
