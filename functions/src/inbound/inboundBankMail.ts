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
import { evaluateBankAuthentication } from './bankAuth'
import {
  bankNoticeCopy,
  isFnbSender,
  looksLikeFnbReceipt,
  looksLikeMerchantPosMail,
  parseFnbCardSpend,
  parseFnbPosCredit,
  parseFnbReceipt,
  parseMerchantPosReceipt,
  type FnbEvent,
} from './fnbParse'
import { capitecNoticeCopy, isCapitecSender, parseCapitecReceipt, type CapitecReceipt } from './capitecParse'
import { capitecSettlementCopy, parseCapitecSettlement, type CapitecSettlement } from './capitecSettlement'
import { parseFnbSettlement, fnbSettlementCopy } from '../settlement/fnbSettlement'
import { applyCapitecPayoutToInvoices, applyFnbGrossSettlementToInvoices } from '../settlement/issueInvoices'
import { imageText } from './mznImageText'
import { mznNoticeCopy, parseMznProof, type MznProof } from './mznProofParse'
import {
  isMozaSender,
  mozaPurchaseNoticeCopy,
  mozaWithdrawalNoticeCopy,
  parseMozaCardPurchase,
  parseMozaCashWithdrawal,
  type MozaCardPurchase,
  type MozaCashWithdrawal,
} from './mozaParse'
import { fnbMzTransferNoticeCopy, isFnbMzSender, parseFnbMzBankTransfer, type FnbMzBankTransfer } from './fnbMzParse'
import { canEmitUsableZarEvidence, canSettlePosTicket, isCardLifecycleEvent } from './bankEventKinds'
import { extractMimeText } from './mimeText'
import { resolveBuyerCardLast4, resolveBuyerCardRef } from '../settlement/register'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import { stepTitle } from '../routing/continuousCycle'
import {
  recordBankReceiptDecline,
  tryAutoConfirmOpenRestock,
  tryAdvanceContinuousCycle,
} from '../tx/adminConversionRouting'
import { issuingBankLabelFromBankId, parseObservedAtLoose, recordRealisedRate } from '../fx/realisedRates'
import { parseRealisedRateNote } from '../fx/realisedRateNoteParse'
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

async function resumeAutonomousSettlement(emailId: string): Promise<void> {
  try {
    const { resumeAutonomousSettlementFromBankEvidence } = await import(
      '../settlement/autonomousDailySettlement'
    )
    await resumeAutonomousSettlementFromBankEvidence(emailId)
  } catch (error) {
    // Evidence remains durable; the settlement watchdog can recover independently.
    console.warn('[bankMail] autonomous settlement resume skipped', {
      emailId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
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
      await recordMozaCardPurchase(ingress.resendEmailId, bucket)
      await recordMozaWithdrawal(ingress.resendEmailId, bucket)
      await recordFnbMzTransfer(ingress.resendEmailId, bucket)
      await recordFnbNotice(ingress.resendEmailId, bucket)
      await recordMznProof(ingress.resendEmailId, bucket)
      await recordCapitecReceipt(ingress.resendEmailId, bucket)
      await recordCapitecSettlement(ingress.resendEmailId, bucket, capitecPdfPassword.value())
      // Balance photos / Cursor rate notes may not be bank-authenticated.
      await recordRealisedRateNote(ingress.resendEmailId, bucket)
      await resumeAutonomousSettlement(ingress.resendEmailId)
    }
  })

function evidenceIsAuthenticated(evidence: EvidenceRecord): boolean {
  return evidence.status === 'authenticated'
}

/**
 * Re-evaluate bank auth for evidence quarantined before a sender was allow-listed.
 * Updates the evidence doc when the new allow-list + stored DKIM headers now pass.
 */
async function reauthenticateEvidenceIfNeeded(evidence: EvidenceRecord): Promise<EvidenceRecord> {
  if (evidence.status === 'authenticated') return evidence
  if (evidence.reason !== 'sender_not_allowlisted') return evidence
  const auth = evaluateBankAuthentication({
    from: evidence.from,
    headers: evidence.headers || null,
    authentication: evidence.authentication || null,
  })
  if (!auth.ok) return evidence
  const stamp = new Date().toISOString()
  const patch = {
    status: 'authenticated' as const,
    parseStatus: evidence.parseStatus === 'quarantined' ? ('unparsed' as const) : evidence.parseStatus,
    reason: 'bank_authenticated',
    bankIssuer: auth.issuer,
    bankSenderEmail: auth.senderEmail,
    dkimDomain: auth.dkimDomain,
    updatedAt: stamp,
  }
  await db().collection(EVIDENCE_COLLECTION).doc(evidence.resendEmailId).set(patch, { merge: true })
  return { ...evidence, ...patch }
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

async function recordMozaCardPurchase(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  if (!isMozaSender(evidence.from)) return
  if (!evidenceIsAuthenticated(evidence)) {
    safeLog.info('moza_purchase_skipped', { emailId, reason: evidence.reason || 'not_authenticated' })
    return
  }
  const text = await loadEvidenceText(evidence, bucket)
  const event = parseMozaCardPurchase(text, evidence.subject)
  if (!event) return

  if (!canEmitUsableZarEvidence(event.eventType) || !canSettlePosTicket(event.eventType)) {
    await evidenceRef.set(
      { parseStatus: 'quarantined', reason: 'moza_purchase_misclassified' },
      { merge: true }
    )
    return
  }

  const resolved = resolveBuyerCardRef(event.cardToken || event.cardLast4)
  if (!resolved.ok) {
    await evidenceRef.set(
      {
        parseStatus: 'quarantined',
        reason: resolved.reason,
        mozaKind: event.kind,
      },
      { merge: true }
    )
    safeLog.info('moza_purchase_quarantined', { emailId, reason: resolved.reason })
    return
  }

  const docId = (
    event.bankReference ||
    `moza-purchase-${event.terminalId || 'term'}-${event.occurredAt || emailId}-${event.amountZar}`
  ).replace(/[^\w.-]+/g, '-')
  const eventRef = db().collection('bankMozaEvents').doc(docId)
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    tx.set(eventRef, {
      ...event,
      // Never persist a full PAN — last4 + issuer ref + canonical ids only.
      cardLast4: resolved.buyer.cardLast4,
      cardToken: event.cardToken,
      canonicalCardId: resolved.buyer.canonicalCardId,
      deskCardId: resolved.buyer.deskCardId,
      payerFamilyId: resolved.buyer.payerFamilyId,
      issuingBank: resolved.buyer.issuingBank,
      canSettlePosTicket: true,
      canEmitUsableZar: true,
      status: 'approved',
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
        processedZar: event.amountZar,
      },
      { merge: true }
    )
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('moza_purchase_recorded', { emailId, reason: event.kind })
  await publishMozaPurchaseNotice(docId, event)
  if (event.amountMzn != null && event.amountMzn > 0) {
    try {
      const rate = await recordRealisedRate(db(), {
        issuingBank: resolved.buyer.issuingBank,
        bankId: 'moza',
        amountZar: event.amountZar,
        amountMzn: event.amountMzn,
        source: 'moza_visa_email',
        observedAt: parseObservedAtLoose(event.occurredAt),
        canonicalCardId: resolved.buyer.canonicalCardId,
        deskCardId: resolved.buyer.deskCardId,
        evidenceId: emailId,
        eventId: docId,
        terminalId: event.terminalId,
        merchant: event.merchant,
        id: `moza-${docId}`,
      })
      safeLog.info('moza_purchase_recorded', {
        emailId,
        reason: rate.created ? 'realised_rate_created' : 'realised_rate_exists',
      })
    } catch (err) {
      safeLog.info('moza_purchase_recorded', {
        emailId,
        reason: 'realised_rate_failed',
      })
      console.warn('moza_realised_rate_failed', err)
    }
  }
  await tryAutoConfirmOpenRestock()
}

async function publishMozaPurchaseNotice(docId: string, event: MozaCardPurchase): Promise<void> {
  const id = `moza-purchase-${docId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = mozaPurchaseNoticeCopy(event)
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
    deskSpeaker: 'amina',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
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
  // Purchase path owns foreign VISA templates — do not mis-classify as withdrawal.
  if (parseMozaCardPurchase(text, evidence.subject)) return
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

  const resolved = resolveBuyerCardRef(event.cardToken || event.cardLast4)
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
      cardToken: event.cardToken,
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
  // EFT corridor belief — never card×POS. Approximate ZAR as MZN/4.1 COST band.
  try {
    const { recordEftFromBankTransfer } = await import('../belief/recordProduction')
    const amountZar = Math.round((event.amountMzn / 4.1) * 100) / 100
    await recordEftFromBankTransfer({
      evidenceId: docId,
      amountZar,
      destinationNib: event.destinationNib,
      bankReference: event.bankReference,
      eventAt: new Date().toISOString(),
    })
  } catch (error) {
    safeLog.info('fnb_mz_eft_belief_skipped', {
      emailId,
      reason: error instanceof Error ? error.message : 'failed',
    })
  }
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
  let evidence = snap.data() as EvidenceRecord
  if (isFnbSender(evidence.from)) {
    evidence = await reauthenticateEvidenceIfNeeded(evidence)
  }
  // FNB ZA card notices require authenticated bank mail. Spoofed From is quarantined upstream.
  if (isFnbSender(evidence.from) && !evidenceIsAuthenticated(evidence)) {
    safeLog.info('fnb_skipped', { emailId, reason: evidence.reason || 'not_authenticated' })
    return
  }
  const fromBank = isFnbSender(evidence.from) && evidenceIsAuthenticated(evidence)
  const subject = evidence.subject || ''
  let event: FnbEvent | null =
    parseFnbCardSpend(subject) || parseFnbPosCredit(subject)
  const tryPdf =
    !event &&
    (fromBank || looksLikeFnbReceipt(evidence.subject) || looksLikeMerchantPosMail(evidence.subject))
  if (tryPdf) {
    const pdf = (evidence.attachments || []).find((row) => /pdf/i.test(row.contentType) || /\.pdf$/i.test(row.safeFilename))
    if (!pdf) return
    const [bytes] = await bucket.file(pdf.storagePath).download()
    const text = await pdfText(bytes)
    event = parseFnbReceipt(text) || parseMerchantPosReceipt(text)
    if (!event) {
      if (fromBank || looksLikeFnbReceipt(evidence.subject)) {
        await recordFnbSettlement(emailId, evidence, text, pdf.sha256)
      }
      return
    }
  }
  if (!event) return
  const floatKey =
    event.kind === 'pos_credit'
      ? `acct-${event.accountLast4}`
      : event.cardLast4
  // Conversion receipts without a card last4 can still publish a desk notice (esp. declines).
  const eventDocId =
    event.kind === 'conversion_receipt' && (event.uti || event.rrn || event.transactionNumber)
      ? `rcpt-${(event.uti || event.rrn || event.transactionNumber || '').replace(/[^\w.-]+/g, '-')}`
      : emailId
  const eventRef = db().collection('bankFnbEvents').doc(eventDocId)
  const floatRef = floatKey ? db().collection('fnbCardFloat').doc(floatKey) : null
  const walletRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('wallets').doc('cashZAR')
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    const floatSnap = floatRef ? await tx.get(floatRef) : null
    const walletSnap = await tx.get(walletRef)
    const prior = existing.exists
      ? (existing.data() as FnbEvent & { merchant?: string | null; liquidityApplied?: boolean })
      : null
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
    tx.set(eventRef, {
      ...event,
      forwarded: !fromBank,
      liquidityApplied: true,
      resendEmailId: emailId,
      from: evidence.from,
      subject: evidence.subject,
      createdAt: new Date().toISOString(),
    })
    if (floatRef && floatKey) {
      const next = applyFnbEvent(
        floatSnap?.exists ? (floatSnap.data() as CardFloat) : null,
        event,
        floatKey
      )
      tx.set(floatRef, { ...next, updatedAt: new Date().toISOString() })
    }
    tx.set(
      ref,
      {
        parseStatus: 'parsed',
        fnbKind: event.kind,
        fnbStatus: 'status' in event ? event.status : null,
      },
      { merge: true }
    )
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('fnb_recorded', {
    emailId,
    reason: event.kind === 'conversion_receipt' ? event.status : event.kind,
  })
  await publishBankNotice(eventDocId, event, !fromBank)
  if (event.kind === 'conversion_receipt' && event.status === 'declined') {
    await recordBankReceiptDecline({
      evidenceId: emailId,
      amountZar: event.amountZar,
      cardLast4: event.cardLast4,
      merchant: event.merchant,
      bankLabel: event.noticeBank === 'POS' ? 'POS' : 'FNB',
    })
  }
  if (
    (event.kind === 'conversion_receipt' && event.status === 'approved') ||
    event.kind === 'pos_credit'
  ) {
    await tryAutoConfirmOpenRestock()
  }
}

async function publishBankNotice(eventDocId: string, event: FnbEvent, forwarded: boolean): Promise<void> {
  const id = `fnb-${eventDocId}`
  const ref = db().collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const copy = bankNoticeCopy(event, forwarded)
  const amountSign =
    event.kind === 'pos_credit' || (event.kind === 'conversion_receipt' && event.status === 'approved')
      ? 'credit'
      : 'debit'
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
    amountSign,
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

/**
 * Free-form realised-rate notes: balance-photo deltas or Cursor/operator mail
 * to receipts@. Does not require bank DKIM — amounts must parse as ZAR+MZN.
 */
async function recordRealisedRateNote(
  emailId: string,
  bucket: { file(path: string): { download(): Promise<[Buffer]> } }
): Promise<void> {
  const evidenceRef = db().collection(EVIDENCE_COLLECTION).doc(emailId)
  const snap = await evidenceRef.get()
  if (!snap.exists) return
  const evidence = snap.data() as EvidenceRecord
  let text = await loadEvidenceText(evidence, bucket)
  const image = (evidence.attachments || []).find((row) =>
    /image\//i.test(row.contentType) || /\.(jpe?g|png|webp)$/i.test(row.safeFilename)
  )
  if (image) {
    try {
      const [bytes] = await bucket.file(image.storagePath).download()
      const ocr = await imageText(bytes)
      if (ocr) text = `${text}\n${ocr}`
    } catch {
      // keep text-only
    }
  }
  const note = parseRealisedRateNote(text, evidence.subject)
  if (!note) return
  // Skip if Moza VISA purchase already owns this evidence (avoid double-count).
  const evidenceExtras = evidence as EvidenceRecord & { mozaKind?: string; processedZar?: number }
  if (evidenceExtras.mozaKind === 'card_purchase' || evidenceExtras.processedZar) return

  try {
    const rate = await recordRealisedRate(db(), {
      issuingBank: note.issuingBankHint || issuingBankLabelFromBankId(note.bankId),
      bankId: note.bankId,
      amountZar: note.amountZar,
      amountMzn: note.amountMzn,
      source: image ? 'balance_photo' : note.source,
      observedAt: parseObservedAtLoose(note.observedAtHint),
      evidenceId: emailId,
      notes: note.notes,
      id: `note-${emailId}`,
      confidence: image ? 'medium' : undefined,
    })
    await evidenceRef.set(
      {
        parseStatus: 'parsed',
        realisedRateId: rate.observation.id,
        realisedRateBankId: rate.observation.bankId,
      },
      { merge: true }
    )
    safeLog.info('realised_rate_note_recorded', {
      emailId,
      reason: rate.created ? rate.observation.bankId : 'exists',
    })
  } catch (err) {
    safeLog.info('realised_rate_note_recorded', { emailId, reason: 'failed' })
    console.warn('realised_rate_note_failed', err)
  }
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
  const text = await pdfText(bytes)
  const receipt = parseCapitecReceipt(text)
  if (!receipt) return
  const docId = receipt.transactionNumber || `pdf-${pdf.sha256.slice(0, 32)}`
  const eventRef = db().collection('bankCapitecEvents').doc(docId)
  const walletRef = db().collection('users').doc(ROUTING_ADMIN_UID).collection('wallets').doc('cashZAR')
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    const walletSnap = await tx.get(walletRef)
    if (receipt.status === 'approved') {
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
    tx.set(evidenceRef, { parseStatus: 'parsed', capitecKind: receipt.kind, capitecStatus: receipt.status }, { merge: true })
  })
  const written = await eventRef.get()
  if (!written.exists || written.data()?.resendEmailId !== emailId) return
  safeLog.info('capitec_recorded', { emailId, reason: receipt.status })
  await publishCapitecNotice(docId, receipt)
  if (receipt.status === 'declined') {
    await recordBankReceiptDecline({
      evidenceId: emailId,
      amountZar: receipt.amountZar,
      cardLast4: receipt.cardLast4,
      merchant: receipt.merchant,
      bankLabel: 'Capitec',
    })
  }
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

/** One-shot: parse bank mail already archived before recorders existed / were extended. */
export const inbound_backfillFnb = functions
  .region('us-central1')
  .runWith({ secrets: [inboundSecret, capitecPdfPassword], timeoutSeconds: 300, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    const provided = req.get('x-inbound-secret') || ''
    if (!provided || provided !== inboundSecret.value()) {
      res.status(401).json({ ok: false })
      return
    }
    const bucket = admin.storage().bucket()
    const recent = await db().collection(EVIDENCE_COLLECTION).orderBy('createdAt', 'desc').limit(120).get()
    const quarantined = await db()
      .collection(EVIDENCE_COLLECTION)
      .where('reason', '==', 'sender_not_allowlisted')
      .limit(80)
      .get()
    const byId = new Map<string, admin.firestore.QueryDocumentSnapshot>()
    for (const doc of [...recent.docs, ...quarantined.docs]) byId.set(doc.id, doc)
    let recorded = 0
    let mozaPurchases = 0
    let reauthed = 0
    for (const doc of byId.values()) {
      const before = doc.data() as EvidenceRecord
      await recordMozaCardPurchase(doc.id, bucket)
      await recordMozaWithdrawal(doc.id, bucket)
      await recordFnbMzTransfer(doc.id, bucket)
      await recordFnbNotice(doc.id, bucket)
      await recordMznProof(doc.id, bucket)
      await recordCapitecReceipt(doc.id, bucket)
      await recordCapitecSettlement(doc.id, bucket, capitecPdfPassword.value())
      await resumeAutonomousSettlement(doc.id)
      const after = await db().collection('bankFnbEvents').doc(doc.id).get()
      if (after.exists) recorded += 1
      const evidence = await db().collection(EVIDENCE_COLLECTION).doc(doc.id).get()
      const row = evidence.data()
      if (row?.mozaKind === 'card_purchase') mozaPurchases += 1
      if (before.status === 'quarantined' && row?.status === 'authenticated') reauthed += 1
    }
    res.status(200).json({ ok: true, scanned: byId.size, recorded, mozaPurchases, reauthed })
  })
