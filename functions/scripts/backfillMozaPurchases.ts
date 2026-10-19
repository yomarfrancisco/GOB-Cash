/**
 * Re-parse archived Moza bankEvidence for foreign VISA purchases and register processed ZAR.
 *   cd functions && npx ts-node --transpile-only scripts/backfillMozaPurchases.ts
 */
import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { evaluateBankAuthentication } from '../src/inbound/bankAuth'
import { isMozaSender, parseMozaCardPurchase, mozaPurchaseNoticeCopy } from '../src/inbound/mozaParse'
import { canEmitUsableZarEvidence, canSettlePosTicket } from '../src/inbound/bankEventKinds'
import { extractMimeText } from '../src/inbound/mimeText'
import { resolveBuyerCardRef } from '../src/settlement/register'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../src/routing/conversionRouter'

const PROJECT = 'gobankless-dev'

function ensureAdc() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return
  const adc = path.join(
    os.homedir(),
    '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
  )
  if (fs.existsSync(adc)) process.env.GOOGLE_APPLICATION_CREDENTIALS = adc
}

ensureAdc()
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT,
    storageBucket: `${PROJECT}.firebasestorage.app`,
  })
}
const db = admin.firestore()
const bucket = admin.storage().bucket()

async function loadText(evidence: FirebaseFirestore.DocumentData): Promise<string> {
  const storagePath = evidence.raw?.storagePath as string | undefined
  if (storagePath) {
    try {
      const [bytes] = await bucket.file(storagePath).download()
      return extractMimeText(bytes)
    } catch (err) {
      console.warn('download_failed', storagePath, err instanceof Error ? err.message : err)
    }
  }
  return String(evidence.subject || '')
}

async function recordOne(emailId: string, evidence: FirebaseFirestore.DocumentData): Promise<'recorded' | 'skip' | 'quarantine'> {
  if (!isMozaSender(evidence.from || null)) return 'skip'

  const auth = evaluateBankAuthentication({
    from: evidence.from || null,
    headers: (evidence.headers || null) as Record<string, string | string[]> | null,
    authentication: evidence.authentication || null,
  })
  if (!auth.ok) return 'skip'

  // Promote previously quarantined mail that now passes auth (e.g. Gmail ARC header.i=).
  if (evidence.status !== 'authenticated') {
    await db.collection('bankEvidence').doc(emailId).set(
      {
        status: 'authenticated',
        reason: 'ok',
        bankIssuer: auth.issuer,
        bankSenderEmail: auth.senderEmail,
        dkimDomain: auth.dkimDomain,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )
  }

  const text = await loadText(evidence)
  const event = parseMozaCardPurchase(text, evidence.subject || null)
  if (!event) return 'skip'
  if (!canEmitUsableZarEvidence(event.eventType) || !canSettlePosTicket(event.eventType)) return 'quarantine'

  const resolved = resolveBuyerCardRef(event.cardToken || event.cardLast4)
  if (!resolved.ok) {
    await db.collection('bankEvidence').doc(emailId).set(
      { parseStatus: 'quarantined', reason: resolved.reason, mozaKind: event.kind },
      { merge: true }
    )
    return 'quarantine'
  }

  const docId = (
    event.bankReference ||
    `moza-purchase-${event.terminalId || 'term'}-${event.occurredAt || emailId}-${event.amountZar}`
  ).replace(/[^\w.-]+/g, '-')
  const eventRef = db.collection('bankMozaEvents').doc(docId)
  const evidenceRef = db.collection('bankEvidence').doc(emailId)

  let wrote = false
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef)
    if (existing.exists) return
    wrote = true
    tx.set(eventRef, {
      ...event,
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

  if (!wrote) {
    const snap = await eventRef.get()
    if (snap.exists && snap.data()?.resendEmailId === emailId) return 'skip'
    return 'skip'
  }

  const noticeId = `moza-purchase-${docId}`
  const noticeRef = db.collection('users').doc(ROUTING_ADMIN_UID).collection('activityEvents').doc(noticeId)
  if (!(await noticeRef.get()).exists) {
    const copy = mozaPurchaseNoticeCopy(event)
    await noticeRef.set({
      id: noticeId,
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
      txId: noticeId,
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

  console.log(
    JSON.stringify({
      emailId,
      docId,
      amountZar: event.amountZar,
      amountMzn: event.amountMzn,
      card: resolved.buyer.canonicalCardId,
      merchant: event.merchant,
    })
  )
  return 'recorded'
}

async function main() {
  const snap = await db.collection('bankEvidence').orderBy('createdAt', 'desc').limit(100).get()
  let scanned = 0
  let moza = 0
  let recorded = 0
  let quarantine = 0
  for (const doc of snap.docs) {
    scanned += 1
    const data = doc.data()
    if (!isMozaSender(data.from || null)) continue
    moza += 1
    const result = await recordOne(doc.id, data)
    if (result === 'recorded') recorded += 1
    if (result === 'quarantine') quarantine += 1
  }
  console.log(JSON.stringify({ scanned, moza, recorded, quarantine }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
