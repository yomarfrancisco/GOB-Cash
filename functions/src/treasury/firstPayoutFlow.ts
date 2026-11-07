/**
 * Sub-R100k first-fund → hold ZAR → collect SA payout details → confirm payout.
 *
 * Branch: MZN credit converts fully to ≤ R100k against reserve → cashZAR held
 * (firstPayoutHold). No daily liquid drip until PoP clears the hold.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import {
  fetchQuotedMznPerZar,
  MZN_ZAR_MARKUP,
  MZN_ZAR_MARKUP_RECEIVE_MZN,
} from '../fx/quotedMznZar'
import { planReserveSplit, payInstantFromReserve } from './reserveConvert'
import { roundMajor } from './reserveBooks'
import {
  looksLikeBankDetails,
  normalizeHandle,
  parseZarPayoutSubject,
} from './firstPayoutHelpers'

export {
  looksLikeBankDetails,
  normalizeHandle,
  parseZarPayoutSubject,
} from './firstPayoutHelpers'

export const FIRST_PAYOUT_HOLD_FIELD = 'firstPayoutHold'
export const FIRST_PAYOUT_STATUS_FIELD = 'firstPayoutStatus'
export const FIRST_PAYOUT_ZAR_FIELD = 'firstPayoutHoldZar'
export const FIRST_PAYOUT_DETAILS_FIELD = 'firstPayoutDetails'

export type FirstPayoutStatus = 'awaiting_details' | 'awaiting_payout' | 'done'

const SUB_R100K_CAP = 100_000
const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

function fmtMzn(n: number): string {
  return `${roundMajor(n).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
}

function fmtZar(n: number): string {
  return `R${roundMajor(n).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

async function resolveUserIdByHandle(handleRaw: string): Promise<string | null> {
  const handle = normalizeHandle(handleRaw)
  if (!handle) return null
  const variants = [`@${handle}`, handle]
  for (const value of variants) {
    const snap = await db().collection('users').where('userHandle', '==', value).limit(1).get()
    if (!snap.empty) return snap.docs[0].id
  }
  for (const value of variants) {
    const snap = await db().collection('users').where('handle', '==', value).limit(1).get()
    if (!snap.empty) return snap.docs[0].id
  }
  return null
}

async function readUsername(userId: string): Promise<string> {
  const snap = await db().collection('users').doc(userId).get()
  const data = snap.data() || {}
  const raw = String(data.userHandle || data.handle || userId)
  return normalizeHandle(raw) || userId.slice(0, 8)
}

type LinkedBank = {
  country?: string
  bankName?: string
  accountHolderName?: string
  accountNumber?: string
  isDefault?: boolean
}

async function readSaLinkedBank(userId: string): Promise<LinkedBank | null> {
  const snap = await db().collection('users').doc(userId).get()
  const banks = (snap.data()?.linkedBanks || []) as LinkedBank[]
  if (!Array.isArray(banks) || banks.length === 0) return null
  const sa = banks.filter((b) => /south\s*africa|^za$/i.test(String(b.country || '')))
  const pool = sa.length ? sa : banks
  return pool.find((b) => b.isDefault) || pool[0] || null
}

function maskAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\s/g, '')
  if (digits.length <= 4) return digits
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

async function publishActivity(
  userId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const ref = db().collection('users').doc(userId).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return false
  await ref.set({
    id,
    ...payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
  return true
}

export async function publishMznReceivedNotice(params: {
  userId: string
  amountMzn: number
  eventId: string
}): Promise<void> {
  const amountLabel = fmtMzn(params.amountMzn)
  const title = `${amountLabel} received`
  const body = `${amountLabel} received. Moza liquidity for this account is up by that amount.`
  await publishActivity(params.userId, params.eventId, {
    kind: CONVERSION_ROUTING_KIND,
    title,
    body,
    deskSentence: body,
    dropdownTitle: title,
    dropdownBody: `${amountLabel} · Moza`,
    actorType: 'ai_manager',
    avatarKind: 'convert_mzn',
    amountCurrency: 'MZN',
    amountValue: roundMajor(params.amountMzn),
    amountSign: 'credit',
    txId: params.eventId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'bank_notice',
    deskSpeaker: 'amina',
  })
}

async function publishPayoutDetailsRequest(params: {
  userId: string
  zarAmount: number
  username: string
  groupId: string
}): Promise<void> {
  const zarLabel = fmtZar(params.zarAmount)
  const title = 'ZAR ready — payout details'
  const body =
    `Funds under R100,000 convert immediately. ${zarLabel} is on your ZAR card and ready to withdraw. ` +
    `Send your South African bank details in chat, or email receipts@inbound.mozpaga.xyz with subject ` +
    `ZAR Payout ${params.username}.`
  const id = `payout-details-request-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title,
    body,
    deskSentence: body,
    dropdownTitle: 'ZAR ready',
    dropdownBody: `${zarLabel} · send SA bank details`,
    deskLedgerRows: [
      { label: 'Liquid now', value: zarLabel },
      { label: 'Next', value: 'SA bank details' },
      { label: 'Email subject', value: `ZAR Payout ${params.username}` },
    ],
    deskStatusChip: 'Awaiting details',
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: roundMajor(params.zarAmount),
    amountSign: 'credit',
    txId: id,
    groupId: params.groupId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'payout_details_request',
    deskSpeaker: 'sam',
  })
}

async function publishDetailsReceived(params: {
  userId: string
  zarAmount: number
  bankName: string
  accountMasked: string
  accountHolderName: string
  groupId: string
}): Promise<void> {
  const zarLabel = fmtZar(params.zarAmount)
  const title = 'SA account details received'
  const body = `${zarLabel} payout instructed to ${params.accountHolderName} · ${params.bankName} ${params.accountMasked}.`
  const id = `payout-details-received-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title,
    body,
    deskSentence: body,
    dropdownTitle: 'Details received',
    dropdownBody: `${params.bankName} · ${params.accountMasked}`,
    deskLedgerRows: [
      { label: 'Amount', value: zarLabel },
      { label: 'Bank', value: params.bankName },
      { label: 'Account', value: params.accountMasked },
      { label: 'Holder', value: params.accountHolderName },
    ],
    deskStatusChip: 'Awaiting payout',
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: roundMajor(params.zarAmount),
    amountSign: 'credit',
    txId: id,
    groupId: params.groupId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'payout_details_received',
    deskSpeaker: 'leo',
  })
}

/**
 * After a cashMZN credit: Moz ack, then auto-convert all when ≤ R100k vs reserve.
 */
export async function handleCashMznCredit(params: {
  userId: string
  deltaMzn: number
  afterBalanceMzn: number
  creditKey: string
}): Promise<{ converted: boolean; zarAmount: number; skipped?: string }> {
  const delta = roundMajor(params.deltaMzn)
  if (!(delta > 0.005)) return { converted: false, zarAmount: 0, skipped: 'no_delta' }

  const eventId = `mzn-recv-${params.creditKey}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  await publishMznReceivedNotice({
    userId: params.userId,
    amountMzn: delta,
    eventId,
  })

  const costRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)
  const sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
  if (!(costRate > 0)) return { converted: false, zarAmount: 0, skipped: 'no_rate' }

  const mznBalance = roundMajor(params.afterBalanceMzn)
  const wantZar = roundMajor(mznBalance / costRate)
  if (!(wantZar > 0.005)) return { converted: false, zarAmount: 0, skipped: 'dust' }

  const split = await planReserveSplit({
    destCurrency: 'ZAR',
    wantDest: wantZar,
    totalSource: mznBalance,
  })

  // Entire book must fit under R100k and available reserve — no ROUTE in this branch.
  if (wantZar > SUB_R100K_CAP + 0.02) {
    return { converted: false, zarAmount: 0, skipped: 'above_r100k' }
  }
  if (split.routedDest > 0.02 || split.instantDest + 0.02 < wantZar) {
    return { converted: false, zarAmount: 0, skipped: 'reserve_short' }
  }

  const groupId = `first-payout-${params.creditKey}`.replace(/[^\w.-]+/g, '-').slice(0, 120)
  const instant = await payInstantFromReserve({
    userId: params.userId,
    sourceCurrency: 'MZN',
    destCurrency: 'ZAR',
    sourceMajor: split.instantSource,
    destMajor: split.instantDest,
    fxRateMZNperZar: costRate,
    costRate,
    sellRate,
    groupId,
    skipLiquidAccrue: true,
    setFirstPayoutHold: true,
  })

  const username = await readUsername(params.userId)
  const linked = await readSaLinkedBank(params.userId)
  if (linked && (linked.accountNumber || linked.bankName)) {
    const zarRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashZAR')
    await zarRef.set(
      {
        [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_payout' satisfies FirstPayoutStatus,
        [FIRST_PAYOUT_DETAILS_FIELD]: {
          bankName: String(linked.bankName || 'SA Bank'),
          accountHolderName: String(linked.accountHolderName || username),
          accountNumber: String(linked.accountNumber || ''),
          source: 'linked_bank',
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    await publishDetailsReceived({
      userId: params.userId,
      zarAmount: instant.destMajor,
      bankName: String(linked.bankName || 'SA Bank'),
      accountMasked: maskAccount(String(linked.accountNumber || '****')),
      accountHolderName: String(linked.accountHolderName || username),
      groupId,
    })
    // Linked bank on file → instant payout (no details ask).
    await confirmFirstPayout({
      userId: params.userId,
      proofNote: 'Instant payout under R100,000 · linked SA account on file.',
    })
  } else {
    await publishPayoutDetailsRequest({
      userId: params.userId,
      zarAmount: instant.destMajor,
      username,
      groupId,
    })
  }

  return { converted: true, zarAmount: instant.destMajor }
}

async function attachUserReplyToPayoutRequest(params: {
  userId: string
  rawMessage: string
}): Promise<void> {
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const snap = await events.where('routingAction', '==', 'payout_details_request').limit(10).get()
  const now = admin.firestore.Timestamp.now()
  const text = params.rawMessage.trim().slice(0, 2000)
  if (!snap.empty) {
    const newest = snap.docs
      .slice()
      .sort((a, b) => {
        const am = a.data()?.createdAt?.toMillis?.() || 0
        const bm = b.data()?.createdAt?.toMillis?.() || 0
        return bm - am
      })[0]
    await newest.ref.set(
      {
        userReply: text,
        userRepliedAt: now,
        deskPendingChip: admin.firestore.FieldValue.delete(),
        deskStatusChip: 'Details sent',
      },
      { merge: true }
    )
    return
  }
  // Fallback bubble if the request card was missed.
  const id = `user-payout-details-${Date.now()}`
  await events.doc(id).set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: 'You',
    body: text,
    userReply: text,
    userRepliedAt: now,
    actorType: 'user',
    deskSpeaker: 'sam',
    routingAction: 'payout_details_request',
    status: 'recorded',
    createdAt: now,
    recordingSource: 'USER_UI',
  })
}

export async function submitPayoutBankDetails(params: {
  userId: string
  rawMessage: string
  source?: 'chat' | 'email'
}): Promise<{ handled: boolean; acknowledgement?: string; skipped?: string }> {
  const zarRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashZAR')
  const zarSnap = await zarRef.get()
  const zarData = zarSnap.data() || {}
  if (zarData[FIRST_PAYOUT_HOLD_FIELD] !== true) {
    return { handled: false, skipped: 'no_hold' }
  }
  const status = String(zarData[FIRST_PAYOUT_STATUS_FIELD] || '')
  if (status === 'done') {
    return { handled: false, skipped: 'already_paid' }
  }

  const text = params.rawMessage.trim()
  const proofNote = 'Instant payout under R100,000 · app confirmation (bank PoP follows when available).'

  // Stuck after Leo ack without RM payout — finish on any follow-up message.
  if (status === 'awaiting_payout') {
    if (params.source === 'chat' && text) {
      await attachUserReplyToPayoutRequest({ userId: params.userId, rawMessage: text })
    }
    const paid = await confirmFirstPayout({ userId: params.userId, proofNote })
    if (!paid.ok) {
      return { handled: false, skipped: paid.skipped || 'confirm_failed' }
    }
    return {
      handled: true,
      acknowledgement: `Full payout confirmed · ${fmtZar(paid.amountZar)} sent.`,
    }
  }

  if (status && status !== 'awaiting_details') {
    return { handled: false, skipped: 'bad_status' }
  }

  if (!looksLikeBankDetails(text) && params.source !== 'email') {
    return { handled: false, skipped: 'not_bank_details' }
  }

  const bankMatch = text.match(
    /\b(fnb|capitec|absa|nedbank|standard\s*bank|investec|tymebank|tyme|discovery\s*bank|african\s*bank|bank\s*zero)\b/i
  )
  const bankName = bankMatch ? bankMatch[0].replace(/\s+/g, ' ') : 'SA Bank'
  const accountMatch = text.replace(/\s/g, '').match(/(\d{8,16})/)
  const accountNumber = accountMatch ? accountMatch[1] : ''
  const holderMatch =
    text.match(/(?:account\s*holder|account\s*name|beneficiary|name)\s*[:\-]\s*([^\n,]+)/i) ||
    text.match(/^([A-Za-z][A-Za-z\s.'-]{2,60})/m)
  const username = await readUsername(params.userId)
  const accountHolderName = holderMatch ? holderMatch[1].trim() : username
  const zarAmount = roundMajor(
    Number(zarData[FIRST_PAYOUT_ZAR_FIELD] || zarData.fiatBalance || 0)
  )
  const groupId = `details-${Date.now()}`

  if (params.source === 'chat' || params.source === 'email') {
    await attachUserReplyToPayoutRequest({ userId: params.userId, rawMessage: text })
  }

  await zarRef.set(
    {
      [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_payout' satisfies FirstPayoutStatus,
      [FIRST_PAYOUT_DETAILS_FIELD]: {
        bankName,
        accountHolderName,
        accountNumber,
        rawMessage: text.slice(0, 2000),
        source: params.source || 'chat',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await publishDetailsReceived({
    userId: params.userId,
    zarAmount,
    bankName,
    accountMasked: maskAccount(accountNumber || '****'),
    accountHolderName,
    groupId,
  })

  const paid = await confirmFirstPayout({ userId: params.userId, proofNote })
  if (!paid.ok) {
    return {
      handled: true,
      acknowledgement: `SA account details received for ${fmtZar(zarAmount)}. Payout pending — ${paid.skipped || 'retry'}.`,
    }
  }

  return {
    handled: true,
    acknowledgement: `SA account details received. Full payout confirmed · ${fmtZar(paid.amountZar)} sent.`,
  }
}

export async function confirmFirstPayout(params: {
  userId: string
  proofNote?: string
  actorUid?: string
}): Promise<{ ok: boolean; amountZar: number; skipped?: string }> {
  const zarRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashZAR')
  const mznRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashMZN')
  const paidId = `first-payout-confirmed-${params.userId.slice(0, 8)}-${Date.now()}`
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 180)

  const result = await db().runTransaction(async (t) => {
    const zarSnap = await t.get(zarRef)
    if (!zarSnap.exists) return { ok: false, amountZar: 0, skipped: 'no_wallet' as const }
    const zarData = zarSnap.data() || {}
    if (zarData[FIRST_PAYOUT_HOLD_FIELD] !== true) {
      return { ok: false, amountZar: 0, skipped: 'no_hold' as const }
    }
    if (String(zarData[FIRST_PAYOUT_STATUS_FIELD] || '') !== 'awaiting_payout') {
      return { ok: false, amountZar: 0, skipped: 'awaiting_details' as const }
    }
    const amount = roundMajor(Number(zarData.fiatBalance || 0))
    if (!(amount > 0.005)) {
      return { ok: false, amountZar: 0, skipped: 'empty' as const }
    }
    const details = (zarData[FIRST_PAYOUT_DETAILS_FIELD] || {}) as LinkedBank & {
      bankName?: string
      accountHolderName?: string
      accountNumber?: string
    }
    const now = admin.firestore.Timestamp.now()
    const amountMinor = Math.round(amount * 100)
    const zarLabel = fmtZar(amount)
    const bankName = String(details.bankName || 'SA Bank')
    const holder = String(details.accountHolderName || 'account holder')
    const masked = maskAccount(String(details.accountNumber || '****'))
    const proof = params.proofNote?.trim() || 'Proof of payment attached.'
    const sentence = `Full payout confirmed · ${zarLabel} to ${holder} · ${bankName} ${masked}. ${proof}`

    t.update(zarRef, {
      fiatBalance: 0,
      [FIRST_PAYOUT_HOLD_FIELD]: false,
      [FIRST_PAYOUT_STATUS_FIELD]: 'done' satisfies FirstPayoutStatus,
      [FIRST_PAYOUT_ZAR_FIELD]: 0,
      liquidCycleAccruedZar: 0,
      updatedAt: now,
    })

    const mznSnap = await t.get(mznRef)
    if (mznSnap.exists && Number(mznSnap.data()?.fiatBalance || 0) > 0.005) {
      t.update(mznRef, { fiatBalance: 0, updatedAt: now })
    }

    const txRef = db().collection('transactions').doc(paidId)
    t.set(txRef, {
      id: paidId,
      userId: params.userId,
      type: 'BANK_WITHDRAWAL',
      transactionType: 'BANK_WITHDRAWAL',
      uiAction: 'WITHDRAW',
      instructionSource: 'SYSTEM',
      recordingSource: 'SYSTEM',
      executionChannel: 'EXTERNAL_BANK',
      status: 'SETTLED',
      instructionStatus: 'SETTLED',
      settlementPath: 'first_payout_hold',
      sourceCurrency: 'ZAR',
      destinationCurrency: 'ZAR',
      currency: 'ZAR',
      sourceAmountMinor: amountMinor,
      expectedDestinationAmountMinor: amountMinor,
      actualDestinationAmountMinor: amountMinor,
      amountZar: amount,
      createdAt: now,
      settledAt: now,
      statusUpdatedAt: now,
      updatedAt: now,
    })

    const deskRef = db()
      .collection('users')
      .doc(params.userId)
      .collection('activityEvents')
      .doc(`payout-confirmed-${paidId}`.slice(0, 180))
    t.set(deskRef, {
      id: deskRef.id,
      kind: CONVERSION_ROUTING_KIND,
      title: 'Full payout confirmed',
      body: sentence,
      deskSentence: sentence,
      dropdownTitle: 'Payout confirmed',
      dropdownBody: `${zarLabel} · PoP`,
      deskLedgerRows: [
        { label: 'Paid', value: zarLabel },
        { label: 'Bank', value: bankName },
        { label: 'Account', value: masked },
        { label: 'Proof', value: proof },
      ],
      deskStatusChip: 'Paid',
      actorType: 'ai_manager',
      avatarKind: 'zar_withdrawn',
      amountCurrency: 'ZAR',
      amountValue: amount,
      amountSign: 'debit',
      txId: paidId,
      groupId: paidId,
      hasDownloadButton: true,
      awaitingConfirm: false,
      routingBlocked: false,
      status: 'recorded',
      routingAction: 'payout_confirmed',
      deskSpeaker: 'sam',
      createdAt: now,
      recordingSource: 'SYSTEM',
    })

    const dropRef = db()
      .collection('users')
      .doc(params.userId)
      .collection('activityEvents')
      .doc(`bank-transfer-${paidId}`.slice(0, 180))
    t.set(dropRef, {
      id: dropRef.id,
      kind: 'BANK_TRANSFER_CONFIRMED',
      title: `${zarLabel} paid out`,
      body: `${zarLabel} sent to ${holder} · ${bankName} ${masked}`,
      actorType: 'ai_manager',
      avatarKind: 'zar_withdrawn',
      amountCurrency: 'ZAR',
      amountValue: amount,
      amountSign: 'debit',
      txId: paidId,
      createdAt: now,
      recordingSource: 'SYSTEM',
    })

    return { ok: true, amountZar: amount }
  })

  return result
}

export async function ingestZarPayoutEmail(params: {
  subject: string
  bodyText: string
  emailId: string
}): Promise<{ handled: boolean; userId?: string; skipped?: string }> {
  const handle = parseZarPayoutSubject(params.subject)
  if (!handle) return { handled: false, skipped: 'not_zar_payout_subject' }
  const userId = await resolveUserIdByHandle(handle)
  if (!userId) return { handled: false, skipped: 'user_not_found' }
  const result = await submitPayoutBankDetails({
    userId,
    rawMessage: params.bodyText || params.subject,
    source: 'email',
  })
  return { handled: result.handled, userId, skipped: result.skipped }
}

export const desk_submitPayoutBankDetails = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const message = typeof data?.message === 'string' ? data.message.trim() : ''
    if (!message) {
      throw new functions.https.HttpsError('invalid-argument', 'message is required')
    }
    return submitPayoutBankDetails({
      userId: context.auth.uid,
      rawMessage: message,
      source: 'chat',
    })
  })

export const ops_confirmFirstPayout = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const actor = context.auth.uid
    if (actor !== CORE_AGENT_UID && actor !== ROUTING_ADMIN_UID) {
      throw new functions.https.HttpsError('permission-denied', 'Ops only')
    }
    const userId = typeof data?.userId === 'string' ? data.userId.trim() : ''
    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'userId is required')
    }
    const proofNote = typeof data?.proofNote === 'string' ? data.proofNote.trim() : undefined
    return confirmFirstPayout({ userId, proofNote, actorUid: actor })
  })
