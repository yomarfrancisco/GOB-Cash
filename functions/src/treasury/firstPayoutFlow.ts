/**
 * First-fund → hold liquid ZAR → collect SA payout details → confirm payout.
 *
 * Instant slice = min(want, daily R100k left, reserve). Residual MZN stays on
 * cashMZN for the next 09:00 liquidity window (FCFS). Liquid ZAR is held
 * (firstPayoutHold) until PoP clears.
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
import { ensureReserveAtLeast, roundMajor } from './reserveBooks'
import { DAILY_LIQUID_ZAR_CAP as SUB_R100K_CAP } from './dailyLiquidZar'
import { readUserNextOpenBooking, refreshNextOpenBookings } from './nextOpenBooking'
import { assembleRoutingPlan } from './routingPlan'
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

/** Home-card major for titles: "Mt 2 023 000". */
function fmtMznMajor(n: number): string {
  const abs = Math.abs(roundMajor(n))
  if (abs > 999.99) {
    const major = Math.round(abs)
      .toFixed(0)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    return `${n < 0 ? '-' : ''}Mt ${major}`
  }
  return `${n < 0 ? '-' : ''}Mt ${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
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
  if (Array.isArray(banks) && banks.length > 0) {
    const sa = banks.filter((b) => /south\s*africa|^za$/i.test(String(b.country || '')))
    const pool = sa.length ? sa : banks
    const hit = pool.find((b) => b.isDefault) || pool[0] || null
    if (hit) return hit
  }
  // Fall back to Day-1 payout details stored on cashZAR (linkedBanks may be empty).
  const zarSnap = await db()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc('cashZAR')
    .get()
  const details = zarSnap.data()?.[FIRST_PAYOUT_DETAILS_FIELD] as
    | (LinkedBank & { accountNumber?: string; bankName?: string; accountHolderName?: string })
    | undefined
  if (details && (details.accountNumber || details.bankName)) {
    return {
      bankName: String(details.bankName || 'SA Bank'),
      accountHolderName: String(details.accountHolderName || ''),
      accountNumber: String(details.accountNumber || ''),
      country: 'ZA',
      isDefault: true,
    }
  }
  return null
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
  const title = `${fmtMznMajor(totalMzn)} received.`
  const body = 'At Moza Banco. Converting to rand now.'
  const payload = {
    id,
    kind: CONVERSION_ROUTING_KIND,
    title,
    body,
    deskSentence: body,
    dropdownTitle: title,
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

type LiquidNowMode = 'full' | 'partial' | 'none'

/** Routing Manager: liquid ZAR ready (or queued) — ask for payout account once. */
async function publishLiquidNow(params: {
  userId: string
  zarAmount: number
  mznReceived: number
  mznConverted: number
  mznResidual: number
  sellRate: number
  groupId: string
  mode: LiquidNowMode
}): Promise<void> {
  const zarLabel = fmtZar(params.zarAmount)
  const residualLabel = fmtMzn(params.mznResidual)
  const id = `liquid-now-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const mode = params.mode

  const booking = await readUserNextOpenBooking(params.userId)
  const linked = await readSaLinkedBank(params.userId)
  const bankTag =
    linked?.bankName && linked?.accountNumber
      ? `${linked.bankName} ${maskAccount(linked.accountNumber)}`
      : linked?.bankName
        ? String(linked.bankName)
        : null
  const routingPlan =
    mode !== 'full'
      ? assembleRoutingPlan({
          nowMs: Date.now(),
          fundedMzn: params.mznReceived,
          zarLiquid: params.zarAmount,
          mznResidual: params.mznResidual,
          rate: params.sellRate,
          nextOpenBookedZar: booking?.bookedZar ?? 0,
          nextOpenAtMs: booking?.openAtMs ?? null,
          reservePoolZar: booking?.reservePoolZar ?? null,
          queueAheadZar: booking?.queueAheadZar ?? 0,
          payoutBankTag: bankTag,
        })
      : null

  const title = routingPlan
    ? 'Your routing plan'
    : mode === 'none'
      ? 'Queued for liquidity'
      : mode === 'partial'
        ? 'Part liquid'
        : 'Liquid now'
  const body = routingPlan
    ? routingPlan.sentence
    : mode === 'none'
      ? `No instant liquidity left today. ${residualLabel} is queued for 09:00 tomorrow (first come, first served on the reserve). Add your South African account once so we can pay out as soon as it clears.`
      : mode === 'partial'
        ? `${zarLabel} is liquid and ready to pay out. ${residualLabel} is queued for 09:00 tomorrow. Add your South African account once and we’ll pay out straight away, every time.`
        : `${zarLabel} is liquid and ready to pay out. Add your South African account once and we’ll pay out straight away, every time.`
  const wantZar = params.sellRate > 0 ? roundMajor(params.mznReceived / params.sellRate) : 0
  const fillPct =
    mode === 'full'
      ? 100
      : mode === 'none'
        ? 0
        : wantZar > 0
          ? Math.max(0, Math.min(100, Math.round((params.zarAmount / wantZar) * 100)))
          : 0
  const mznTitle = mode === 'full' ? '0 MZN' : residualLabel
  const mznSubtitle =
    mode === 'full'
      ? `${fmtMzn(params.mznReceived)} in · all converted`
      : mode === 'partial'
        ? `${fmtMzn(params.mznConverted)} converted · ${residualLabel} queued`
        : `${fmtMzn(params.mznReceived)} in · waiting for liquidity`
  const zarSubtitle =
    mode === 'none' ? 'nothing instant today · queued 09:00' : 'liquid · ready to pay out'
  const caption =
    mode === 'full'
      ? `${fmtMzn(params.mznReceived)} converted at ${params.sellRate.toFixed(4)}. Full green bar: everything you sent is liquid.`
      : mode === 'partial'
        ? `${fmtMzn(params.mznConverted)} → ${zarLabel} at ${params.sellRate.toFixed(4)}. Green bar: liquid share today. ${residualLabel} ready 09:00 tomorrow.`
        : `No instant convert today. ${residualLabel} joins the liquidity queue for 09:00 tomorrow.`
  const ledgerRows: Array<{ label: string; value: string; valueStrong?: boolean }> = [
    { label: 'Received', value: fmtMzn(params.mznReceived) },
    { label: 'Rate', value: `${params.sellRate.toFixed(4)} MZN/ZAR` },
    { label: 'Liquid ZAR', value: zarLabel, valueStrong: mode !== 'none' },
  ]
  if (mode !== 'full') {
    ledgerRows.push({
      label: 'Queued',
      value: residualLabel,
      valueStrong: mode === 'none',
    })
    ledgerRows.push({ label: 'Ready', value: '09:00 SAST' })
  }
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title,
    body,
    deskSentence: body,
    dropdownTitle: title,
    dropdownBody:
      mode === 'none'
        ? `${residualLabel} · queued 09:00`
        : mode === 'partial'
          ? `${zarLabel} liquid · ${residualLabel} queued`
          : `${zarLabel} · add payout account`,
    deskPendingChip: 'Needs your payout account',
    deskLedgerRows: ledgerRows,
    deskPipes: [
      {
        id: 'mzn',
        label: 'MZN',
        title: mznTitle,
        subtitle: mznSubtitle,
        fillPct: mode === 'full' ? 0 : Math.max(0, 100 - fillPct),
        tone: 'mzn',
      },
      {
        id: 'zar',
        label: 'ZAR',
        title: zarLabel,
        subtitle: zarSubtitle,
        fillPct,
        tone: 'zar',
      },
    ],
    deskPipeCaption: caption,
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
    // Internal id `sam` → Routing Manager on the desk (not a named "Sam" agent).
    deskSpeaker: 'sam',
    liquidNowMode: mode,
    mznResidual: roundMajor(params.mznResidual),
    mznConverted: roundMajor(params.mznConverted),
    ...(routingPlan ? { routingPlan } : {}),
  })
}

/**
 * After auto-payout: Routing Manager plan for residual MZN still queued.
 * Uses routing_plan (not liquid_now) so we don't re-ask for a payout account.
 */
async function publishPostPayoutRoutingPlan(params: {
  userId: string
  fundedMzn: number
  zarLiquid: number
  mznResidual: number
  sellRate: number
  groupId: string
  bankTag: string | null
}): Promise<void> {
  if (!(params.mznResidual > 0.005)) return
  const booking = await readUserNextOpenBooking(params.userId)
  const routingPlan = assembleRoutingPlan({
    nowMs: Date.now(),
    fundedMzn: params.fundedMzn,
    zarLiquid: params.zarLiquid,
    mznResidual: params.mznResidual,
    rate: params.sellRate,
    nextOpenBookedZar: booking?.bookedZar ?? 0,
    nextOpenAtMs: booking?.openAtMs ?? null,
    reservePoolZar: booking?.reservePoolZar ?? null,
    queueAheadZar: booking?.queueAheadZar ?? 0,
    payoutBankTag: params.bankTag,
  })
  if (!routingPlan) return
  const id = `routing-plan-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title: 'Your routing plan',
    body: routingPlan.sentence,
    deskSentence: routingPlan.sentence,
    dropdownTitle: 'Routing plan',
    dropdownBody: routingPlan.sentence,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'MZN',
    amountValue: roundMajor(params.mznResidual),
    amountSign: 'debit',
    txId: id,
    groupId: params.groupId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'routing_plan',
    deskSpeaker: 'sam',
    mznResidual: roundMajor(params.mznResidual),
    mznConverted: roundMajor(Math.max(0, params.fundedMzn - params.mznResidual)),
    liquidNowMode: 'partial',
    routingPlan,
  })
}

/** Sum ZAR already paid out to a bank tag (Paid out / daily liquid, excluding scheduled). */
async function sumPaidZarToBank(userId: string, bankTag: string): Promise<number> {
  const tag = bankTag.trim()
  if (!tag) return 0
  const snap = await db()
    .collection('users')
    .doc(userId)
    .collection('activityEvents')
    .orderBy('createdAt', 'desc')
    .limit(80)
    .get()
  let total = 0
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const action = String(data.routingAction || '')
    if (action !== 'payout_confirmed' && action !== 'daily_liquid_zar_payout') continue
    if (data.payoutScheduled === true) continue
    if (/^scheduled$/i.test(String(data.deskPendingChip || ''))) continue
    const rowTag =
      String(data.payoutBankTag || '').trim() ||
      (Array.isArray(data.deskLedgerRows)
        ? String(
            data.deskLedgerRows.find(
              (r: { label?: string; value?: string }) =>
                /^Payout to$/i.test(String(r?.label || '')) || /^to$/i.test(String(r?.label || ''))
            )?.value || ''
          ).trim()
        : '') ||
      (Array.isArray(data.deskPipes)
        ? String(
            data.deskPipes.find(
              (p: { tone?: string; id?: string; title?: string }) =>
                p?.tone === 'bank' || p?.id === 'bank'
            )?.title || ''
          ).trim()
        : '')
    if (rowTag !== tag) continue
    const amt = roundMajor(Math.abs(Number(data.amountValue) || 0))
    if (amt > 0.005) total = roundMajor(total + amt)
  }
  return total
}

async function publishYoureSetUp(params: {
  userId: string
  bankName: string
  accountMasked: string
  paidZar: number
  groupId: string
}): Promise<void> {
  const tag = `${params.bankName} ${params.accountMasked}`.trim()
  const paid = roundMajor(params.paidZar)
  // Cumulative = all Paid out to this bank (includes the payout we just wrote).
  const cumulative = Math.max(paid, await sumPaidZarToBank(params.userId, tag))
  const id = `youre-set-up-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const body = `Send MZN any time. We pay ${tag} automatically.`
  await publishActivity(params.userId, id, {
    kind: CONVERSION_ROUTING_KIND,
    title: "You're set up",
    body,
    deskSentence: body,
    dropdownTitle: "You're set up",
    dropdownBody: `${tag} · auto payout`,
    deskLedgerRows: [{ label: 'Payout to', value: tag }],
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: cumulative,
    amountSign: 'credit',
    txId: id,
    groupId: params.groupId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'youre_set_up',
    deskSpeaker: 'sam',
    payoutBankTag: tag,
    payoutCumulativeZar: cumulative,
  })
}

/** Keep the latest You’re set up card’s cumulative paid-to-bank total current. */
export async function bumpYoureSetUpCumulative(params: {
  userId: string
  amountZar: number
  bankTag: string
}): Promise<void> {
  const amount = roundMajor(params.amountZar)
  const tag = params.bankTag.trim()
  if (!(amount > 0.005) || !tag) return
  const snap = await db()
    .collection('users')
    .doc(params.userId)
    .collection('activityEvents')
    .where('routingAction', '==', 'youre_set_up')
    .limit(8)
    .get()
  if (snap.empty) return
  const rows = snap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() || {} }))
    .filter((row) => {
      const rowTag = String(row.data.payoutBankTag || '').trim()
      if (rowTag) return rowTag === tag
      const ledger = Array.isArray(row.data.deskLedgerRows) ? row.data.deskLedgerRows : []
      const to = ledger.find(
        (r: { label?: string; value?: string }) =>
          /^Payout to$/i.test(String(r?.label || '')) || /^to$/i.test(String(r?.label || ''))
      )
      return String(to?.value || '').trim() === tag
    })
    .sort((a, b) => {
      const aMs = Number(a.data.createdAt?.toMillis?.() || a.data.createdAt || 0)
      const bMs = Number(b.data.createdAt?.toMillis?.() || b.data.createdAt || 0)
      return bMs - aMs
    })
  const latest = rows[0]
  if (!latest) return
  await latest.ref.set(
    {
      payoutBankTag: tag,
      payoutCumulativeZar: admin.firestore.FieldValue.increment(amount),
      amountValue: admin.firestore.FieldValue.increment(amount),
      deskSentence: `Send MZN any time. We pay ${tag} automatically.`,
      body: `Send MZN any time. We pay ${tag} automatically.`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

/**
 * After a cashMZN credit: Moz ack, then instant-convert
 * min(want, daily R100k left) against reserve. Residual MZN stays queued.
 * Day-1 without a SA payout account → Routing Manager "Liquid now" / partial / queued.
 */
export async function handleCashMznCredit(params: {
  userId: string
  deltaMzn: number
  afterBalanceMzn: number
  creditKey: string
  /** Catch-up / ops: skip adding another Moza "received" row. */
  skipDailyNotice?: boolean
}): Promise<{ converted: boolean; zarAmount: number; skipped?: string; mode?: LiquidNowMode }> {
  const delta = roundMajor(params.deltaMzn)
  if (!(delta > 0.005)) return { converted: false, zarAmount: 0, skipped: 'no_delta' }

  const atMs = Date.now()
  const { dayKey } = await sastDayAndClock(atMs)
  let totalMzn = roundMajor(params.afterBalanceMzn)
  if (!params.skipDailyNotice) {
    const upserted = await upsertDailyMznReceived({
      userId: params.userId,
      amountMzn: delta,
      atMs,
    })
    totalMzn = upserted.totalMzn
  }

  const costRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)
  const sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
  if (!(sellRate > 0) || !(costRate > 0)) {
    return { converted: false, zarAmount: 0, skipped: 'no_rate' }
  }

  const mznBalance = roundMajor(params.afterBalanceMzn)
  // Client quote = sell rate (spread stays with the desk). Cost is for books only.
  const wantZar = roundMajor(mznBalance / sellRate)
  if (!(wantZar > 0.005)) return { converted: false, zarAmount: 0, skipped: 'dust' }

  const zarRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashZAR')
  const mznRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashMZN')
  const zarSnap = await zarRef.get()
  const zarData = zarSnap.data() || {}
  const usedKey = String(zarData.dailyLiquidKey || '')
  const usedZar =
    usedKey === dayKey ? roundMajor(Number(zarData.dailyLiquidUsedZar || 0)) : 0
  const dailyLeft = roundMajor(Math.max(0, SUB_R100K_CAP - usedZar))
  const instantTarget = roundMajor(Math.min(wantZar, dailyLeft))
  const groupId = `first-payout-${params.creditKey}`.replace(/[^\w.-]+/g, '-').slice(0, 120)

  const finishDesk = async (args: {
    zarAmount: number
    mznConverted: number
    mznResidual: number
    mode: LiquidNowMode
  }) => {
    await zarRef.set(
      {
        firstPayoutMznLandedAtMs: atMs,
        firstPayoutSellRate: sellRate,
        firstPayoutMznReceived: totalMzn,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    if (args.mznResidual > 0.005) {
      await mznRef.set(
        {
          liquidityQueueMzn: args.mznResidual,
          liquidityQueuedAtMs: atMs,
          liquidityQueueDayKey: dayKey,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await db()
        .collection('liquidityQueueMzn')
        .doc(params.userId)
        .set(
          {
            uid: params.userId,
            queueMzn: args.mznResidual,
            queuedAtMs: atMs,
            dayKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
    } else {
      await mznRef.set(
        {
          liquidityQueueMzn: 0,
          liquidityQueuedAtMs: admin.firestore.FieldValue.delete(),
          liquidityQueueDayKey: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await db().collection('liquidityQueueMzn').doc(params.userId).delete().catch(() => undefined)
    }

    // Recompute FCFS next-open bookings against real zarReserve after queue change.
    try {
      await refreshNextOpenBookings({ sellRate })
    } catch (error) {
      functions.logger.warn('[handleCashMznCredit] next-open booking refresh failed', {
        userId: params.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const username = await readUsername(params.userId)
    const linked = await readSaLinkedBank(params.userId)
    const userSnap = await db().collection('users').doc(params.userId).get()
    const autoPayout = userSnap.data()?.payoutAuto !== false
    const zarFresh = (await zarRef.get()).data() || {}
    const existingStatus = String(zarFresh[FIRST_PAYOUT_STATUS_FIELD] || '')
    const hasDetailsOnWallet = Boolean(zarFresh[FIRST_PAYOUT_DETAILS_FIELD])
    const hasPayoutAccount = Boolean(
      (linked && (linked.accountNumber || linked.bankName)) || hasDetailsOnWallet
    )

    if (args.zarAmount > 0.005 && hasPayoutAccount && autoPayout) {
      await zarRef.set(
        {
          [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_payout' satisfies FirstPayoutStatus,
          [FIRST_PAYOUT_DETAILS_FIELD]: {
            bankName: String(linked?.bankName || 'SA Bank'),
            accountHolderName: String(linked?.accountHolderName || username),
            accountNumber: String(linked?.accountNumber || ''),
            accountType: String(
              (linked as (LinkedBank & { accountType?: string }) | null)?.accountType ||
                'Business current'
            ),
            source: linked ? 'linked_bank' : 'wallet_details',
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await confirmFirstPayout({
        userId: params.userId,
        proofNote: 'Payment confirmation',
      })
      // Auto-payout used to return here and skip the Routing Manager plan for residual
      // MZN. Still publish the plan when funds remain queued past today's instant slice.
      if (args.mode !== 'full' && args.mznResidual > 0.005) {
        await publishPostPayoutRoutingPlan({
          userId: params.userId,
          fundedMzn: totalMzn,
          zarLiquid: args.zarAmount,
          mznResidual: args.mznResidual,
          sellRate,
          groupId,
          bankTag:
            linked?.bankName && linked?.accountNumber
              ? `${linked.bankName} ${maskAccount(linked.accountNumber)}`
              : linked?.bankName
                ? String(linked.bankName)
                : null,
        })
      }
      return
    }

    // Never downgrade a completed / already-filed payout back to awaiting_details.
    if (existingStatus !== 'done' && !hasPayoutAccount) {
      await zarRef.set(
        {
          [FIRST_PAYOUT_STATUS_FIELD]: 'awaiting_details' satisfies FirstPayoutStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    await publishLiquidNow({
      userId: params.userId,
      zarAmount: args.zarAmount,
      mznReceived: totalMzn,
      mznConverted: args.mznConverted,
      mznResidual: args.mznResidual,
      sellRate,
      groupId,
      mode: args.mode,
    })
  }

  // Option 3: daily liquid already exhausted.
  if (!(instantTarget > 0.005)) {
    await finishDesk({
      zarAmount: 0,
      mznConverted: 0,
      mznResidual: mznBalance,
      mode: 'none',
    })
    return { converted: false, zarAmount: 0, skipped: 'daily_cap', mode: 'none' }
  }

  // Honour the daily liquid promise: refill reserve up to this slice (≤ R100k).
  const topped = await ensureReserveAtLeast('ZAR', instantTarget)
  if (topped.toppedUp > 0.005) {
    functions.logger.info('[handleCashMznCredit] topped ZAR reserve for liquid promise', {
      userId: params.userId,
      instantTarget,
      toppedUp: topped.toppedUp,
      balance: topped.balance,
    })
  }

  const sourceForSlice = roundMajor(instantTarget * sellRate)
  const split = await planReserveSplit({
    destCurrency: 'ZAR',
    wantDest: instantTarget,
    totalSource: Math.min(mznBalance, sourceForSlice),
  })

  const instantZar = roundMajor(split.instantDest)
  const instantMzn = roundMajor(split.instantSource)
  const residualMzn = roundMajor(Math.max(0, mznBalance - instantMzn))
  const mode: LiquidNowMode =
    instantZar > 0.005 && residualMzn <= 0.005
      ? 'full'
      : instantZar > 0.005
        ? 'partial'
        : 'none'

  if (!(instantZar > 0.005) || !(instantMzn > 0.005)) {
    await finishDesk({
      zarAmount: 0,
      mznConverted: 0,
      mznResidual: mznBalance,
      mode: 'none',
    })
    return { converted: false, zarAmount: 0, skipped: 'reserve_short', mode: 'none' }
  }

  const instant = await payInstantFromReserve({
    userId: params.userId,
    sourceCurrency: 'MZN',
    destCurrency: 'ZAR',
    sourceMajor: instantMzn,
    destMajor: instantZar,
    fxRateMZNperZar: sellRate,
    costRate,
    sellRate,
    groupId,
    skipLiquidAccrue: true,
    setFirstPayoutHold: true,
  })

  await zarRef.set(
    {
      dailyLiquidKey: dayKey,
      dailyLiquidUsedZar: roundMajor(usedZar + instant.destMajor),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await finishDesk({
    zarAmount: instant.destMajor,
    mznConverted: instantMzn,
    mznResidual: residualMzn,
    mode,
  })

  return { converted: true, zarAmount: instant.destMajor, mode }
}

async function attachUserReplyToLiquidNow(params: {
  userId: string
  rawMessage: string
}): Promise<void> {
  const events = db().collection('users').doc(params.userId).collection('activityEvents')
  const now = admin.firestore.Timestamp.now()
  const text = params.rawMessage.trim().slice(0, 2000)
  // Prefer equality queries (no composite index) over `in`.
  const [liquidSnap, legacySnap] = await Promise.all([
    events.where('routingAction', '==', 'liquid_now').limit(10).get(),
    events.where('routingAction', '==', 'payout_details_request').limit(10).get(),
  ])
  const newest = [...liquidSnap.docs, ...legacySnap.docs]
    .slice()
    .sort((a, b) => {
      const am = a.data()?.createdAt?.toMillis?.() || 0
      const bm = b.data()?.createdAt?.toMillis?.() || 0
      return bm - am
    })[0]
  if (newest) {
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
    // All reads before any writes (Firestore transaction rule). Sequential
    // gets avoid rare Promise.all + transaction quirks in admin SDK.
    const zarSnap = await t.get(zarRef)
    const mznSnap = await t.get(mznRef)
    if (!zarSnap.exists) return { ok: false, amountZar: 0, skipped: 'no_wallet' as const }
    const zarData = zarSnap.data() || {}
    const status = String(zarData[FIRST_PAYOUT_STATUS_FIELD] || '')
    const hold = zarData[FIRST_PAYOUT_HOLD_FIELD] === true
    // A later fund can re-open the hold after a prior Day-1 payout marked done.
    if (status === 'done' && !hold) {
      return { ok: false, amountZar: 0, skipped: 'already_paid' as const }
    }
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
    const sentence = `${zarLabel} is in your account. ${speedLine}`
    const instantLeft = roundMajor(Math.max(0, SUB_R100K_CAP - amount))
    void holder

    t.update(zarRef, {
      fiatBalance: 0,
      [FIRST_PAYOUT_HOLD_FIELD]: false,
      [FIRST_PAYOUT_STATUS_FIELD]: 'done' satisfies FirstPayoutStatus,
      [FIRST_PAYOUT_ZAR_FIELD]: 0,
      liquidCycleAccruedZar: 0,
      updatedAt: now,
    })

    // Keep residual / liquidity-queue MZN — Day-1 may only convert the liquid slice.
    // (Older all-or-nothing path wiped MZN here; that erased queued books.)
    void mznSnap

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
      ],
      deskStatusChip: 'Paid',
      deskPipes: [
        {
          id: 'mzn',
          label: 'MZN',
          title:
            Number(mznSnap.data()?.liquidityQueueMzn || mznSnap.data()?.fiatBalance || 0) > 0.005
              ? fmtMzn(
                  Number(mznSnap.data()?.liquidityQueueMzn || mznSnap.data()?.fiatBalance || 0)
                )
              : '0 MZN',
          subtitle:
            Number(mznSnap.data()?.liquidityQueueMzn || mznSnap.data()?.fiatBalance || 0) > 0.005
              ? 'residual · queued 09:00'
              : undefined,
          fillPct:
            Number(mznSnap.data()?.liquidityQueueMzn || mznSnap.data()?.fiatBalance || 0) > 0.005
              ? 100
              : 0,
          tone: 'mzn',
        },
        { id: 'zar', label: 'ZAR', title: 'R0 · paid out', fillPct: 0, tone: 'zar' },
        { id: 'bank', label: 'BANK', title: `${bankName} ${masked}`, fillPct: 0, tone: 'bank' },
      ],
      deskPipeCaption:
        Number(mznSnap.data()?.liquidityQueueMzn || mznSnap.data()?.fiatBalance || 0) > 0.005
          ? `${fmtMzn(Number(mznSnap.data()?.liquidityQueueMzn || mznSnap.data()?.fiatBalance || 0))} still queued for 09:00. Liquid ZAR is paid out.`
          : 'Pipes clear. Nothing waiting with us.',
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
      payoutBankTag: `${bankName} ${masked}`.trim(),
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
      paidZar: Number(result.amountZar) || 0,
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

  // Wallet hold first — payout must not depend on directory/profile side effects.
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

  try {
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
  } catch (error) {
    console.error('[savePayoutAccountAndPay] linkedBanks write failed (continuing payout)', {
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    await attachUserReplyToLiquidNow({
      userId: params.userId,
      rawMessage: `${bankName} · ${accountHolderName} · ${accountNumber}`,
    })
  } catch (error) {
    console.error('[savePayoutAccountAndPay] desk reply attach failed (continuing payout)', {
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return confirmFirstPayout({
    userId: params.userId,
    proofNote: 'Payment confirmation',
  })
}

function isHttpsError(error: unknown): error is functions.https.HttpsError {
  if (error instanceof functions.https.HttpsError) return true
  // instanceof can fail across duplicate firebase-functions bundles in Cloud Functions.
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; httpErrorCode?: unknown }
  return typeof candidate.code === 'string' && candidate.httpErrorCode != null
}

export const desk_savePayoutAccountAndPay = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    try {
      const result = await savePayoutAccountAndPay({
        userId: context.auth.uid,
        bankName: typeof data?.bankName === 'string' ? data.bankName : '',
        accountHolderName: typeof data?.accountHolderName === 'string' ? data.accountHolderName : '',
        accountNumber: typeof data?.accountNumber === 'string' ? data.accountNumber : '',
        accountType: typeof data?.accountType === 'string' ? data.accountType : undefined,
        autoPayout: data?.autoPayout !== false,
      })
      if (!result.ok) {
        if (result.skipped === 'invalid_fields') {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Check bank, holder, and account number'
          )
        }
        throw new functions.https.HttpsError(
          'failed-precondition',
          result.skipped === 'already_paid'
            ? 'This payout was already completed.'
            : result.skipped === 'empty' || result.skipped === 'no_hold'
              ? 'No liquid ZAR is waiting to pay out.'
              : `Could not pay out (${result.skipped || 'retry'}).`
        )
      }
      return { ok: true, amountZar: result.amountZar }
    } catch (error) {
      if (isHttpsError(error)) throw error
      console.error('[desk_savePayoutAccountAndPay] failed', {
        uid: context.auth.uid,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // failed-precondition (not internal) so the real message reaches the client.
      throw new functions.https.HttpsError(
        'failed-precondition',
        error instanceof Error && error.message
          ? error.message
          : 'Payout failed — try again in a moment.'
      )
    }
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
