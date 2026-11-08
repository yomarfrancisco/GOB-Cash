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

/** Client-facing amounts: 45,000.00 MZN / R11,072.05 (en-US). */
function fmtMzn(n: number): string {
  return `${roundMajor(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
}

function fmtZar(n: number): string {
  return `R${roundMajor(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

async function sastDayAndClock(ms: number): Promise<{ dayKey: string; clock: string }> {
  const { sastParts } = await import('../routing/routingTime')
  const p = sastParts(ms)
  return {
    dayKey: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`,
    clock: `${pad2(p.hour)}:${pad2(p.minute)}`,
  }
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
  if (digits.length <= 4) return `··${digits}`
  return `··${digits.slice(-4)}`
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

/** One Moz "MZN received" card per SAST day — rows update in place. */
export async function upsertDailyMznReceived(params: {
  userId: string
  amountMzn: number
  atMs?: number
}): Promise<{ dayKey: string; totalMzn: number }> {
  const atMs = params.atMs ?? Date.now()
  const { dayKey, clock } = await sastDayAndClock(atMs)
  const id = `mzn-recv-day-${dayKey}`
  const ref = db().collection('users').doc(params.userId).collection('activityEvents').doc(id)
  const amount = roundMajor(params.amountMzn)
  const snap = await ref.get()
  const prevRows = Array.isArray(snap.data()?.deskLedgerRows)
    ? (snap.data()!.deskLedgerRows as Array<{ label: string; value: string; valueStrong?: boolean }>)
    : []
  const transferRows = prevRows.filter((row) => !/^Total today$/i.test(row.label))
  transferRows.push({
    label: `${clock} Transfer · ref ..${String(atMs).slice(-4)}`,
    value: fmtMzn(amount),
  })
  const totalMzn = roundMajor(
    transferRows.reduce((sum, row) => {
      const n = Number(String(row.value).replace(/[^\d.-]/g, ''))
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
  )
  const rows = [
    ...transferRows,
    { label: 'Total today', value: fmtMzn(totalMzn), valueStrong: true },
  ]
  const body = `${fmtMzn(totalMzn)} received at Moza Banco. Converting now.`
  const payload = {
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: 'MZN received',
    body,
    deskSentence: body,
    dropdownTitle: 'MZN received',
    dropdownBody: `${fmtMzn(amount)} · Moza`,
    deskLedgerRows: rows,
    actorType: 'ai_manager',
    avatarKind: 'convert_mzn',
    amountCurrency: 'MZN',
    amountValue: totalMzn,
    amountSign: 'credit',
    txId: id,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'bank_notice',
    deskSpeaker: 'amina',
    dayKey,
    recordingSource: 'SYSTEM',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  if (snap.exists) {
    await ref.set(payload, { merge: true })
  } else {
    await ref.set({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  return { dayKey, totalMzn }
}

/** RM: liquid ZAR ready — ask for payout account once (pending dashed chip). */
async function publishLiquidNow(params: {
  userId: string
  zarAmount: number
  mznReceived: number
  sellRate: number
  groupId: string
}): Promise<void> {
  const zarLabel = fmtZar(params.zarAmount)
  const id = `liquid-now-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const body = `${zarLabel} is liquid and ready to pay out. Add your South African account once and we’ll pay out straight away, every time.`
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title: 'Liquid now',
    body,
    deskSentence: body,
    dropdownTitle: 'Liquid now',
    dropdownBody: `${zarLabel} · add payout account`,
    deskPendingChip: 'Needs your payout account',
    deskLedgerRows: [
      { label: 'Received', value: fmtMzn(params.mznReceived) },
      { label: 'Rate', value: `${params.sellRate.toFixed(4)} MZN/ZAR` },
      { label: 'Liquid ZAR', value: zarLabel, valueStrong: true },
    ],
    deskPipes: [
      {
        id: 'mzn',
        label: 'MZN',
        title: '0 MZN',
        subtitle: 'all converted',
        fillPct: 100,
        tone: 'mzn',
      },
      {
        id: 'zar',
        label: 'ZAR',
        title: `R${Math.round(params.zarAmount).toLocaleString('en-US')}`,
        subtitle: 'liquid',
        fillPct: 100,
        tone: 'zar',
      },
    ],
    deskPipeCaption: '',
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
    routingAction: 'liquid_now',
    deskSpeaker: 'sam',
  })
}

async function publishYoureSetUp(params: {
  userId: string
  bankName: string
  accountMasked: string
  instantLeftZar: number
  groupId: string
}): Promise<void> {
  const left = fmtZar(params.instantLeftZar)
  const id = `youre-set-up-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const body = `From now on: send MZN, and liquid ZAR lands in ${params.bankName} ${params.accountMasked} automatically. ${left} instant left today.`
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title: "You're set up",
    body,
    deskSentence: body,
    dropdownTitle: "You're set up",
    dropdownBody: `${params.bankName} ${params.accountMasked} · auto payout`,
    deskLedgerRows: [
      { label: 'Payout to', value: `${params.bankName} ${params.accountMasked}` },
      { label: 'Instant left today', value: left, valueStrong: true },
    ],
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: roundMajor(params.instantLeftZar),
    amountSign: 'credit',
    txId: id,
    groupId: params.groupId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'youre_set_up',
    deskSpeaker: 'sam',
  })
}

/**
 * After a cashMZN credit: one daily Moz ack, then auto-convert at the client sell
 * rate when ≤ R100k vs reserve. Day-1 without a SA payout account → "Liquid now".
 */
export async function handleCashMznCredit(params: {
  userId: string
  deltaMzn: number
  afterBalanceMzn: number
  creditKey: string
}): Promise<{ converted: boolean; zarAmount: number; skipped?: string }> {
  const delta = roundMajor(params.deltaMzn)
  if (!(delta > 0.005)) return { converted: false, zarAmount: 0, skipped: 'no_delta' }

  const atMs = Date.now()
  const { totalMzn } = await upsertDailyMznReceived({
    userId: params.userId,
    amountMzn: delta,
    atMs,
  })

  const costRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)
  const sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
  if (!(sellRate > 0) || !(costRate > 0)) {
    return { converted: false, zarAmount: 0, skipped: 'no_rate' }
  }

  const mznBalance = roundMajor(params.afterBalanceMzn)
  // Client quote = sell rate (spread stays with the desk). Cost is for books only.
  const wantZar = roundMajor(mznBalance / sellRate)
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
    fxRateMZNperZar: sellRate,
    costRate,
    sellRate,
    groupId,
    skipLiquidAccrue: true,
    setFirstPayoutHold: true,
  })

  const zarRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashZAR')
  await zarRef.set(
    {
      firstPayoutMznLandedAtMs: atMs,
      firstPayoutSellRate: sellRate,
      firstPayoutMznReceived: totalMzn,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  const username = await readUsername(params.userId)
  const linked = await readSaLinkedBank(params.userId)
  const userSnap = await db().collection('users').doc(params.userId).get()
  const autoPayout = userSnap.data()?.payoutAuto !== false
  const hasPayoutAccount = Boolean(linked && (linked.accountNumber || linked.bankName))

  if (hasPayoutAccount && autoPayout) {
    await zarRef.set(
      {
        [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_payout' satisfies FirstPayoutStatus,
        [FIRST_PAYOUT_DETAILS_FIELD]: {
          bankName: String(linked!.bankName || 'SA Bank'),
          accountHolderName: String(linked!.accountHolderName || username),
          accountNumber: String(linked!.accountNumber || ''),
          accountType: String((linked as LinkedBank & { accountType?: string }).accountType || 'Business current'),
          source: 'linked_bank',
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    await confirmFirstPayout({
      userId: params.userId,
      proofNote: 'Payment confirmation',
    })
  } else {
    await zarRef.set(
      {
        [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_details' satisfies FirstPayoutStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    await publishLiquidNow({
      userId: params.userId,
      zarAmount: instant.destMajor,
      mznReceived: totalMzn,
      sellRate,
      groupId,
    })
  }

  return { converted: true, zarAmount: instant.destMajor }
}

async function attachUserReplyToLiquidNow(params: {
  userId: string
  rawMessage: string
}): Promise<void> {
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const snap = await events
    .where('routingAction', 'in', ['liquid_now', 'payout_details_request'])
    .limit(10)
    .get()
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
        deskStatusChip: 'Payout account saved',
      },
      { merge: true }
    )
    return
  }
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
    routingAction: 'liquid_now',
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
  const proofNote = 'Payment confirmation'

  // Stuck awaiting payout — finish on any follow-up message.
  if (status === 'awaiting_payout') {
    if (params.source === 'chat' && text) {
      await attachUserReplyToLiquidNow({ userId: params.userId, rawMessage: text })
    }
    try {
      const paid = await confirmFirstPayout({ userId: params.userId, proofNote })
      if (!paid.ok) {
        return {
          handled: true,
          acknowledgement: `Payout still pending (${paid.skipped || 'retry'}). Send your bank details again.`,
          skipped: paid.skipped || 'confirm_failed',
        }
      }
      return {
        handled: true,
        acknowledgement: `Paid out · ${fmtZar(paid.amountZar)}.`,
      }
    } catch (error) {
      console.error('[submitPayoutBankDetails] confirm retry failed', error)
      return {
        handled: true,
        acknowledgement: 'Payout still pending — try sending your bank details once more.',
        skipped: 'confirm_threw',
      }
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

  if (params.source === 'chat' || params.source === 'email') {
    await attachUserReplyToLiquidNow({ userId: params.userId, rawMessage: text })
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

  try {
    const paid = await confirmFirstPayout({ userId: params.userId, proofNote })
    if (!paid.ok) {
      return {
        handled: true,
        acknowledgement: `Payout account saved for ${fmtZar(zarAmount)}. Payout pending — ${paid.skipped || 'retry'}.`,
        skipped: paid.skipped,
      }
    }
    return {
      handled: true,
      acknowledgement: `Paid out · ${fmtZar(paid.amountZar)}.`,
    }
  } catch (error) {
    console.error('[submitPayoutBankDetails] confirm after details failed', error)
    return {
      handled: true,
      acknowledgement: `Payout account saved for ${fmtZar(zarAmount)}. Payout pending — send again to retry.`,
      skipped: 'confirm_threw',
    }
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
    // All reads before any writes (Firestore transaction rule).
    const [zarSnap, mznSnap] = await Promise.all([t.get(zarRef), t.get(mznRef)])
    if (!zarSnap.exists) return { ok: false, amountZar: 0, skipped: 'no_wallet' as const }
    const zarData = zarSnap.data() || {}
    const status = String(zarData[FIRST_PAYOUT_STATUS_FIELD] || '')
    if (status === 'done') {
      return { ok: false, amountZar: 0, skipped: 'already_paid' as const }
    }
    const hold = zarData[FIRST_PAYOUT_HOLD_FIELD] === true
    const hasDetails = Boolean(zarData[FIRST_PAYOUT_DETAILS_FIELD])
    // Allow payout whenever funds are on a first-payout hold (or details already filed).
    if (!hold && !hasDetails && status !== 'awaiting_payout') {
      return { ok: false, amountZar: 0, skipped: 'no_hold' as const }
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
    const nowMs = now.toMillis()
    const amountMinor = Math.round(amount * 100)
    const zarLabel = fmtZar(amount)
    const bankName = String(details.bankName || 'SA Bank')
    const holder = String(details.accountHolderName || 'account holder')
    const masked = maskAccount(String(details.accountNumber || '****'))
    const landedAt = Number(zarData.firstPayoutMznLandedAtMs || 0)
    const lagMinutes =
      landedAt > 0 ? Math.max(1, Math.round((nowMs - landedAt) / 60_000)) : null
    const speedLine =
      lagMinutes != null
        ? `Instant, ${lagMinutes} minute${lagMinutes === 1 ? '' : 's'} after your MZN landed.`
        : 'Instant.'
    const sentence = `${zarLabel} paid to ${holder}, ${bankName} ${masked}. ${speedLine}`
    const instantLeft = roundMajor(Math.max(0, SUB_R100K_CAP - amount))

    t.update(zarRef, {
      fiatBalance: 0,
      [FIRST_PAYOUT_HOLD_FIELD]: false,
      [FIRST_PAYOUT_STATUS_FIELD]: 'done' satisfies FirstPayoutStatus,
      [FIRST_PAYOUT_ZAR_FIELD]: 0,
      liquidCycleAccruedZar: 0,
      updatedAt: now,
    })

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

    // One SA Bank Liaison payout card — no separate "details received".
    const deskRef = db()
      .collection('users')
      .doc(params.userId)
      .collection('activityEvents')
      .doc(`payout-confirmed-${paidId}`.slice(0, 180))
    t.set(deskRef, {
      id: deskRef.id,
      kind: CONVERSION_ROUTING_KIND,
      title: 'Paid out',
      body: sentence,
      deskSentence: sentence,
      dropdownTitle: 'Paid out',
      dropdownBody: `${zarLabel} · ${bankName} ${masked}`,
      deskLedgerRows: [
        { label: 'Paid', value: zarLabel },
        { label: 'To', value: `${bankName} ${masked}` },
        {
          label: 'Proof',
          value: 'Payment confirmation',
          secondLine: 'bank POP to follow',
        },
      ],
      deskStatusChip: 'Paid',
      deskPipes: [
        { id: 'mzn', label: 'MZN', title: '0 MZN', fillPct: 0, tone: 'mzn' },
        { id: 'zar', label: 'ZAR', title: 'R0', fillPct: 0, tone: 'zar' },
        { id: 'bank', label: 'BANK', title: masked, fillPct: 0, tone: 'bank' },
      ],
      deskPipeCaption: 'Pipes clear. Nothing waiting.',
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
      deskSpeaker: 'leo',
      createdAt: now,
      recordingSource: 'SYSTEM',
    })

    return {
      ok: true as const,
      amountZar: amount,
      bankName,
      accountMasked: masked,
      instantLeftZar: instantLeft,
      groupId: paidId,
    }
  })

  if (
    result.ok &&
    typeof result.bankName === 'string' &&
    typeof result.accountMasked === 'string' &&
    typeof result.instantLeftZar === 'number' &&
    typeof result.groupId === 'string'
  ) {
    await publishYoureSetUp({
      userId: params.userId,
      bankName: result.bankName,
      accountMasked: result.accountMasked,
      instantLeftZar: result.instantLeftZar,
      groupId: result.groupId,
    })
  }

  return {
    ok: result.ok,
    amountZar: result.amountZar,
    skipped: result.ok ? undefined : result.skipped,
  }
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

/** Day-1 sheet: save SA payout account once, then pay out held ZAR. */
export async function savePayoutAccountAndPay(params: {
  userId: string
  bankName: string
  accountHolderName: string
  accountNumber: string
  accountType?: string
  autoPayout?: boolean
}): Promise<{ ok: boolean; amountZar: number; skipped?: string }> {
  const bankName = params.bankName.trim()
  const accountHolderName = params.accountHolderName.trim()
  const accountNumber = params.accountNumber.replace(/\s/g, '')
  if (!bankName || !accountHolderName || !/^\d{8,16}$/.test(accountNumber)) {
    return { ok: false, amountZar: 0, skipped: 'invalid_fields' }
  }

  const userRef = db().collection('users').doc(params.userId)
  const zarRef = userRef.collection('wallets').doc('cashZAR')
  const autoPayout = params.autoPayout !== false
  const accountType = (params.accountType || 'Business current').trim() || 'Business current'

  const userSnap = await userRef.get()
  const existingBanks = Array.isArray(userSnap.data()?.linkedBanks)
    ? (userSnap.data()!.linkedBanks as Array<Record<string, unknown>>)
    : []
  const nextBank = {
    id: `sa-${accountNumber.slice(-4)}-${Date.now().toString(36)}`,
    country: 'South Africa',
    bankName,
    accountHolderName,
    accountNumber,
    accountType,
    isDefault: true,
  }
  const linkedBanks = [
    ...existingBanks
      .filter((bank) => String(bank.accountNumber || '') !== accountNumber)
      .map((bank) => ({ ...bank, isDefault: false })),
    nextBank,
  ]
  await userRef.set(
    {
      payoutAuto: autoPayout,
      linkedBanks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await zarRef.set(
    {
      [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_payout' satisfies FirstPayoutStatus,
      [FIRST_PAYOUT_DETAILS_FIELD]: {
        bankName,
        accountHolderName,
        accountNumber,
        accountType,
        source: 'payout_sheet',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await attachUserReplyToLiquidNow({
    userId: params.userId,
    rawMessage: `${bankName} · ${accountHolderName} · ${accountNumber}`,
  })

  return confirmFirstPayout({
    userId: params.userId,
    proofNote: 'Payment confirmation',
  })
}

export const desk_savePayoutAccountAndPay = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const result = await savePayoutAccountAndPay({
      userId: context.auth.uid,
      bankName: typeof data?.bankName === 'string' ? data.bankName : '',
      accountHolderName: typeof data?.accountHolderName === 'string' ? data.accountHolderName : '',
      accountNumber: typeof data?.accountNumber === 'string' ? data.accountNumber : '',
      accountType: typeof data?.accountType === 'string' ? data.accountType : undefined,
      autoPayout: data?.autoPayout !== false,
    })
    if (!result.ok && result.skipped === 'invalid_fields') {
      throw new functions.https.HttpsError('invalid-argument', 'Check bank, holder, and account number')
    }
    return result
  })

export const ops_confirmFirstPayout = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    const actor = context.auth.uid
    const userId =
      typeof data?.userId === 'string' && data.userId.trim()
        ? data.userId.trim()
        : actor
    // Ops can confirm any user; every account can confirm its own first payout.
    if (
      userId !== actor &&
      actor !== CORE_AGENT_UID &&
      actor !== ROUTING_ADMIN_UID
    ) {
      throw new functions.https.HttpsError('permission-denied', 'Ops only')
    }
    const proofNote = typeof data?.proofNote === 'string' ? data.proofNote.trim() : undefined
    return confirmFirstPayout({ userId, proofNote, actorUid: actor })
  })
