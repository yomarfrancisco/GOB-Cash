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
import { capitecNoticeCopy, isCapitecSender, parseCapitecReceipt, type CapitecReceipt } from './capitecParse'
import { capitecSettlementCopy, parseCapitecSettlement, type CapitecSettlement } from './capitecSettlement'
import { parseFnbSettlement, fnbSettlementCopy } from '../settlement/fnbSettlement'
import { applyCapitecPayoutToInvoices, applyFnbGrossSettlementToInvoices } from '../settlement/issueInvoices'
import { imageText } from './mznImageText'
import { mznNoticeCopy, parseMznProof, type MznProof } from './mznProofParse'
import { isMozaSender, mozaWithdrawalNoticeCopy, parseMozaCashWithdrawal, type MozaCashWithdrawal } from './mozaParse'
import { fnbMzTransferNoticeCopy, isFnbMzSender, parseFnbMzBankTransfer, type FnbMzBankTransfer } from './fnbMzParse'
import { canSettlePosTicket, isCardLifecycleEvent } from './bankEventKinds'
import { extractMimeText } from './mimeText'
import { resolveBuyerCardLast4 } from '../settlement/register'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import { stepTitle } from '../routing/continuousCycle'
import { tryAutoConfirmOpenRestock, tryAdvanceContinuousCycle } from '../tx/adminConversionRouting'
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
const capitecPdfPassword = defineSecret('CAPITEC_PDF_PASSWORD')

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
    secrets: [inboundApiKey, capitecPdfPassword],
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
      await recordMozaWithdrawal(ingress.resendEmailId, bucket)
      await recordFnbMzTransfer(ingress.resendEmailId, bucket)
      await recordFnbNotice(ingress.resendEmailId, bucket)
      await recordMznProof(ingress.resendEmailId, bucket)
      await recordCapitecReceipt(ingress.resendEmailId, bucket)
      await recordCapitecSettlement(ingress.resendEmailId, bucket, capitecPdfPassword.value())
    }
  })

function evidenceIsAuthenticated(evidence: EvidenceRecord): boolean {
  return evidence.status === 'authenticated'
}

async function loadEvidenceText(
  evidence: EvidenceRecord,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<string> {
  if (evidence.raw?.storagePath) {
    try {
      const [bytes] = await bucket.file(evidence.raw.storagePath).download()
      return extractMimeText(bytes)
    } catch {
      // fall through
    }
  }
  return evidence.subject || ''
}

async function recordMozaWithdrawal(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  if (!isMozaSender(evidence.from)) return
  if (!evidenceIsAuthenticated(evidence)) {
    safeLog.info('moza_skipped', { emailId, reason: evidence.reason || 'not_authenticated' })
    return
  }
  const text = await loadEvidenceText(evidence, bucket)
  const event = parseMozaCashWithdrawal(text, evidence.subject)
  if (!event) return

  // Withdrawals never settle POS / usable ZAR — fail closed if someone remaps kinds later.
  if (canSettlePosTicket(event.eventType) || isCardLifecycleEvent(event.eventType)) {
    await evidenceRef.set(
      { parseStatus: 'quarantined', reason: 'moza_withdrawal_misclassified' },
      { merge: true }
    )
    return
  }

  const resolved = resolveBuyerCardLast4(event.cardLast4)
  if (!resolved.ok) {
    await evidenceRef.set(
      {
        parseStatus: 'quarantined',
        reason: resolved.reason,
        mozaKind: event.kind,
      },
      { merge: true }
    )
    safeLog.info('moza_quarantined', { emailId, reason: resolved.reason })
    return
  }

  const docId = (event.bankReference || `moza-${emailId}`).replace(/[^\w.-]+/g, '-')
  const eventRef = db().collection('bankMozaEvents').doc(docId)
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    tx.set(eventRef, {
      ...event,
      // Never persist a full PAN — last4 + canonical ids only.
      cardLast4: resolved.buyer.cardLast4,
      canonicalCardId: resolved.buyer.canonicalCardId,
      deskCardId: resolved.buyer.deskCardId,
      payerFamilyId: resolved.buyer.payerFamilyId,
      issuingBank: resolved.buyer.issuingBank,
      canSettlePosTicket: false,
      canEmitUsableZar: false,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    tx.set(
      evidenceRef,
      {
        parseStatus: 'parsed',
        mozaKind: event.kind,
        linkedCanonicalCardId: resolved.buyer.canonicalCardId,
      },
      { merge: true }
    )
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('moza_recorded', { emailId, reason: event.kind })
  await publishMozaWithdrawalNotice(docId, event)
}

async function publishMozaWithdrawalNotice(docId: string, event: MozaCashWithdrawal): Promise<void> {
  const id = `moza-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = mozaWithdrawalNoticeCopy(event)
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
    amountValue: event.amountMzn,
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

async function recordFnbMzTransfer(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  if (!isFnbMzSender(evidence.from)) return
  if (!evidenceIsAuthenticated(evidence)) {
    safeLog.info('fnb_mz_skipped', { emailId, reason: evidence.reason || 'not_authenticated' })
    return
  }
  const text = await loadEvidenceText(evidence, bucket)
  const event = parseFnbMzBankTransfer(text, evidence.subject)
  if (!event) return

  // Sender relating to BRICS/FNB must not promote this to a card event.
  if (isCardLifecycleEvent(event.eventType) || canSettlePosTicket(event.eventType)) {
    await evidenceRef.set(
      { parseStatus: 'quarantined', reason: 'fnb_mz_transfer_misclassified' },
      { merge: true }
    )
    return
  }

  let linkedCard: {
    cardLast4: string
    canonicalCardId: string
    deskCardId: number
    payerFamilyId: string
  } | null = null
  if (event.cardLast4) {
    const resolved = resolveBuyerCardLast4(event.cardLast4)
    if (!resolved.ok) {
      await evidenceRef.set(
        { parseStatus: 'quarantined', reason: resolved.reason, fnbMzKind: event.kind },
        { merge: true }
      )
      safeLog.info('fnb_mz_quarantined', { emailId, reason: resolved.reason })
      return
    }
    linkedCard = {
      cardLast4: resolved.buyer.cardLast4,
      canonicalCardId: resolved.buyer.canonicalCardId,
      deskCardId: resolved.buyer.deskCardId,
      payerFamilyId: resolved.buyer.payerFamilyId,
    }
  }

  const docId = (event.bankReference || `fnbmz-${emailId}`).replace(/[^\w.-]+/g, '-')
  const eventRef = db().collection('bankFnbMzEvents').doc(docId)
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    tx.set(eventRef, {
      ...event,
      cardLast4: linkedCard?.cardLast4 || null,
      canonicalCardId: linkedCard?.canonicalCardId || null,
      deskCardId: linkedCard?.deskCardId || null,
      payerFamilyId: linkedCard?.payerFamilyId || null,
      isCardEvent: false,
      canSettlePosTicket: false,
      canEmitUsableZar: false,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    tx.set(
      evidenceRef,
      {
        parseStatus: 'parsed',
        fnbMzKind: event.kind,
        linkedCanonicalCardId: linkedCard?.canonicalCardId || null,
      },
      { merge: true }
    )
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('fnb_mz_recorded', { emailId, reason: event.kind })
  await publishFnbMzTransferNotice(docId, event)
}

async function publishFnbMzTransferNotice(docId: string, event: FnbMzBankTransfer): Promise<void> {
  const id = `fnbmz-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = fnbMzTransferNoticeCopy(event)
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
    amountValue: event.amountMzn,
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

async function recordFnbNotice(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const ref = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await ref.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  // FNB ZA card notices require authenticated bank mail. Spoofed From is quarantined upstream.
  if (isFnbSender(evidence.from) && !evidenceIsAuthenticated(evidence)) {
    safeLog.info('fnb_skipped', { emailId, reason: evidence.reason || 'not_authenticated' })
    return
  }
  const fromBank = isFnbSender(evidence.from) && evidenceIsAuthenticated(evidence)
  const spend = evidence.subject ? parseFnbCardSpend(evidence.subject) : null
  let event: FnbEvent | null = spend
  if (!event && (fromBank || looksLikeFnbReceipt(evidence.subject))) {
    const pdf = (evidence.attachments || []).find((row) => /pdf/i.test(row.contentType) || /\.pdf$/i.test(row.safeFilename))
    if (!pdf) return
    const [bytes] = await bucket.file(pdf.storagePath).download()
    const text = await pdfText(bytes)
    event = parseFnbReceipt(text)
    if (!event) {
      await recordFnbSettlement(emailId, evidence, text, pdf.sha256)
      return
    }
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
  if (event.kind === 'conversion_receipt' && event.status === 'approved') await tryAutoConfirmOpenRestock()
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
  const ocr = await imageText(bytes)
  const proof = parseMznProof(ocr)
  if (!proof) {
    await evidenceRef.set({ mznOcr: ocr.slice(0, 1500) }, { merge: true })
    return
  }
  const docId = proof.operationNumber || `img-${image.sha256.slice(0, 32)}`
  const eventRef = db().collection('bankMznEvents').doc(docId)
  const walletRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('wallets').doc('cashMZN')
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) {
      const prior = existing.data() as { beneficiary?: string | null }
      if (!prior.beneficiary && proof.beneficiary) tx.set(eventRef, { beneficiary: proof.beneficiary }, { merge: true })
      return
    }
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
  await tryAutoConfirmOpenRestock()
  await tryAdvanceContinuousCycle()
}

async function publishMznNotice(docId: string, proof: MznProof): Promise<void> {
  const id = `mzn-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = mznNoticeCopy(proof)
  const title = stepTitle(3)
  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title,
    body: copy.body,
    dropdownTitle: title,
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
    deskSpeaker: 'amina',
    deskStep: 3,
    cyclePhase: 'awaiting_mzn',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
}

async function recordCapitecReceipt(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  if (!isCapitecSender(evidence.from) && !/receipt from/i.test(evidence.subject || '')) return
  if (isCapitecSender(evidence.from) && !evidenceIsAuthenticated(evidence)) {
    safeLog.info('capitec_skipped', { emailId, reason: evidence.reason || 'not_authenticated' })
    return
  }
  const pdf = (evidence.attachments || []).find((row) => /pdf/i.test(row.contentType) || /\.pdf$/i.test(row.safeFilename))
  if (!pdf) return
  const [bytes] = await bucket.file(pdf.storagePath).download()
  const receipt = parseCapitecReceipt(await pdfText(bytes))
  if (!receipt) return
  const docId = receipt.transactionNumber || `pdf-${pdf.sha256.slice(0, 32)}`
  const eventRef = db().collection('bankCapitecEvents').doc(docId)
  const walletRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('wallets').doc('cashZAR')
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    if (receipt.status === 'approved') {
      const walletSnap = await tx.get(walletRef)
      const current = Number(walletSnap.exists ? walletSnap.data()?.fiatBalance || 0 : 0)
      tx.set(walletRef, {
        fiatBalance: Math.round((current + receipt.amountZar) * 100) / 100,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    }
    tx.set(eventRef, {
      ...receipt,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    tx.set(evidenceRef, { parseStatus: 'parsed', capitecKind: receipt.kind }, { merge: true })
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('capitec_recorded', { emailId, reason: receipt.status })
  await publishCapitecNotice(docId, receipt)
  if (receipt.status === 'approved') await tryAutoConfirmOpenRestock()
}

async function recordCapitecSettlement(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } },
  password: string
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  const pdf = (evidence.attachments || []).find((row) => /pdf/i.test(row.contentType) || /\.pdf$/i.test(row.safeFilename))
  if (!pdf) return
  const [bytes] = await bucket.file(pdf.storagePath).download()
  let text = ''
  try {
    text = await pdfText(bytes, password || undefined)
  } catch (error) {
    const locked = /password/i.test(error instanceof Error ? error.message : '')
    if (locked) safeLog.info('capitec_pdf_locked', { emailId, reason: 'password' })
    return
  }
  const settlement = parseCapitecSettlement(text)
  if (!settlement) return
  const docId = (settlement.reference || `pdf-${pdf.sha256.slice(0, 32)}`).replace(/[^\w.-]+/g, '-')
  const eventRef = db().collection('bankCapitecEvents').doc(docId)
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    tx.set(eventRef, {
      ...settlement,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    tx.set(evidenceRef, { parseStatus: 'parsed', capitecKind: settlement.kind }, { merge: true })
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('capitec_settlement_recorded', { emailId, reason: 'paid_out' })
  await publishCapitecSettlementNotice(docId, settlement)
  try {
    const marked = await applyCapitecPayoutToInvoices(settlement, docId)
    safeLog.info('capitec_settlement_recorded', { emailId, reason: `zar_available_${marked}` })
  } catch (error) {
    safeLog.info('capitec_settlement_recorded', { emailId, reason: 'zar_available_failed' })
  }
}

async function recordFnbSettlement(
  emailId: string,
  evidence: EvidenceRecord,
  text: string,
  sha256: string
): Promise<void> {
  const settlement = parseFnbSettlement(text)
  if (!settlement) return
  const docId = (
    settlement.merchantNumber
      ? `fnb-settle-${settlement.merchantNumber}-${settlement.statementDate || sha256.slice(0, 12)}`
      : `fnb-settle-${sha256.slice(0, 24)}`
  ).replace(/[^\w.-]+/g, '-')
  const eventRef = db().collection('bankFnbEvents').doc(docId)
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    tx.set(eventRef, {
      ...settlement,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    tx.set(evidenceRef, { parseStatus: 'parsed', fnbKind: settlement.kind }, { merge: true })
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('fnb_recorded', { emailId, reason: 'fnb_settlement' })
  const id = `fnb-${docId}`
  const noticeRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  if (!(await noticeRef.get()).exists) {
    const copy = fnbSettlementCopy(settlement)
    await noticeRef.set({
      id,
      kind: CONVERSION_ROUTING_KIND,
      title: copy.title,
      body: copy.body,
      dropdownTitle: copy.title,
      dropdownBody: copy.body,
      actorType: 'ai_manager',
      avatarKind: 'convert_zar',
      amountCurrency: 'ZAR',
      amountValue: settlement.zarAvailableZar,
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
  try {
    const marked = await applyFnbGrossSettlementToInvoices(settlement, docId)
    safeLog.info('fnb_recorded', { emailId, reason: `zar_available_${marked}` })
  } catch {
    safeLog.info('fnb_recorded', { emailId, reason: 'zar_available_failed' })
  }
}

async function publishCapitecSettlementNotice(docId: string, settlement: CapitecSettlement): Promise<void> {
  const id = `capitec-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  if ((await ref.get()).exists) return
  const copy = capitecSettlementCopy(settlement)
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
    amountValue: settlement.paidOutZar,
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

async function publishCapitecNotice(docId: string, receipt: CapitecReceipt): Promise<void> {
  const id = `capitec-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  if ((await ref.get()).exists) return
  const copy = capitecNoticeCopy(receipt)
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
    amountValue: receipt.amountZar,
    amountSign: receipt.status === 'approved' ? 'credit' : 'debit',
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
  .runWith({ secrets: [inboundSecret, capitecPdfPassword], timeoutSeconds: 120, memory: '512MB' })
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
      await recordCapitecReceipt(doc.id, bucket)
      await recordCapitecSettlement(doc.id, bucket, capitecPdfPassword.value())
      const after = await db().collection('bankFnbEvents').doc(doc.id).get()
      if (after.exists) recorded += 1
    }
    res.status(200).json({ ok: true, scanned: snap.size, recorded })
  })
