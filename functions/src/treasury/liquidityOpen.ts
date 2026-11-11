/**
 * Liquidity open window — 09:00 SAST.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import {
  fetchQuotedMznPerZar,
  MZN_ZAR_MARKUP,
  MZN_ZAR_MARKUP_RECEIVE_MZN,
} from '../fx/quotedMznZar'
import { CONVERSION_ROUTING_KIND } from '../routing/conversionRouter'
import { ensureReserveAtLeast, roundMajor } from './reserveBooks'
import { planReserveSplit, payInstantFromReserve } from './reserveConvert'
import { DAILY_LIQUID_ZAR_CAP } from './dailyLiquidZar'
import { readUserNextOpenBooking, refreshNextOpenBookings } from './nextOpenBooking'
import { assembleRoutingPlan } from './routingPlan'
import { liquidCycleKeyAt } from './liquidZarCycle'

const FIRST_PAYOUT_DETAILS_FIELD = 'firstPayoutDetails'

export const LIQUIDITY_OPEN_HOUR_SAST = 9
export const LIQUIDITY_OPEN_MINUTE_SAST = 0

export { DAILY_LIQUID_ZAR_CAP }

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

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

function maskAccount(accountNumber: string): string {
  const digits = String(accountNumber || '').replace(/\s/g, '')
  if (digits.length <= 4) return `··${digits}`
  return `··${digits.slice(-4)}`
}

function formatOpenLabel(ms: number): string {
  const shifted = new Date(ms + SAST_OFFSET_MS)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = shifted.getUTCDate()
  const mon = months[shifted.getUTCMonth()]
  const hh = String(shifted.getUTCHours()).padStart(2, '0')
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${day} ${mon} ${hh}:${mm}`
}

async function publishScheduledLiquidPayout(params: {
  userId: string
  zarAmount: number
  openMs: number
  cycleKey: string
}): Promise<void> {
  const zarSnap = await db()
    .collection('users')
    .doc(params.userId)
    .collection('wallets')
    .doc('cashZAR')
    .get()
  const details = (zarSnap.data()?.[FIRST_PAYOUT_DETAILS_FIELD] || {}) as {
    bankName?: string
    accountNumber?: string
    accountHolderName?: string
  }
  const bankName = String(details.bankName || '').trim() || 'your bank'
  const masked = maskAccount(String(details.accountNumber || ''))
  const holder = String(details.accountHolderName || '').trim()
  const bankTag = masked && masked !== '··' ? `${bankName} ${masked}` : bankName
  const sendAtMs = params.openMs + 15 * 60 * 1000
  const zarLabel = fmtZar(params.zarAmount)
  const sentence = `${zarLabel} is liquid and goes to ${bankTag} at 09:15. Want it elsewhere? Change the account before then.`
  const eventId = `liquid-zar-payout-${params.cycleKey}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  await db()
    .collection('users')
    .doc(params.userId)
    .collection('activityEvents')
    .doc(eventId)
    .set(
      {
        id: eventId,
        kind: CONVERSION_ROUTING_KIND,
        title: 'Paying out at 09:15',
        body: sentence,
        deskSentence: sentence,
        dropdownTitle: 'Paying out',
        dropdownBody: `${zarLabel} · ${bankTag} · 09:15`,
        deskStatusChip: '',
        deskPendingChip: 'Scheduled',
        deskLedgerRows: [
          { label: 'Liquid', value: zarLabel, valueStrong: true },
          { label: 'To', value: bankTag },
          { label: 'Leaves', value: '09:15' },
        ],
        actorType: 'ai_manager',
        avatarKind: 'zar_withdrawn',
        amountCurrency: 'ZAR',
        amountValue: params.zarAmount,
        amountSign: 'credit',
        txId: eventId,
        groupId: eventId,
        hasDownloadButton: false,
        awaitingConfirm: false,
        routingBlocked: false,
        status: 'recorded',
        routingAction: 'daily_liquid_zar_payout',
        deskSpeaker: 'leo',
        liquidCycleKey: params.cycleKey,
        payoutScheduled: true,
        payoutSendAtMs: sendAtMs,
        payoutLiquidAtMs: params.openMs,
        payoutBankTag: bankTag,
        payoutBankHolder: holder,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        recordingSource: 'SYSTEM',
      },
      { merge: true }
    )
}

async function publishResidualQueueNotice(params: {
  userId: string
  residualMzn: number
  windowKey: string
  nextOpenAtMs: number | null
}): Promise<void> {
  if (!(params.residualMzn > 0.005)) return
  const when =
    params.nextOpenAtMs && params.nextOpenAtMs > 0
      ? formatOpenLabel(params.nextOpenAtMs)
      : 'the next 09:00 open'
  const mznLabel = fmtMzn(params.residualMzn)
  const fallbackSentence = `${mznLabel} queued for ${when} · waiting on reserve`
  const eventId = `liquidity-queue-residual-${params.windowKey}-${params.userId}`
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 180)

  const booking = await readUserNextOpenBooking(params.userId)
  const zarSnap = await db()
    .collection('users')
    .doc(params.userId)
    .collection('wallets')
    .doc('cashZAR')
    .get()
  const details = (zarSnap.data()?.[FIRST_PAYOUT_DETAILS_FIELD] || {}) as {
    bankName?: string
    accountNumber?: string
  }
  const bankName = String(details.bankName || '').trim()
  const masked = maskAccount(String(details.accountNumber || ''))
  const bankTag =
    bankName && masked && masked !== '··' ? `${bankName} ${masked}` : bankName || null

  let sellRate = 0
  try {
    sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
  } catch {
    sellRate = 0
  }

  const routingPlan = assembleRoutingPlan({
    nowMs: Date.now(),
    fundedMzn: params.residualMzn,
    zarLiquid: 0,
    mznResidual: params.residualMzn,
    rate: sellRate > 0 ? sellRate : 4.47,
    nextOpenBookedZar: booking?.bookedZar ?? 0,
    nextOpenAtMs: booking?.openAtMs ?? params.nextOpenAtMs,
    reservePoolZar: booking?.reservePoolZar ?? null,
    queueAheadZar: booking?.queueAheadZar ?? 0,
    payoutBankTag: bankTag,
  })
  const sentence = routingPlan?.sentence || fallbackSentence

  await db()
    .collection('users')
    .doc(params.userId)
    .collection('activityEvents')
    .doc(eventId)
    .set(
      {
        id: eventId,
        kind: CONVERSION_ROUTING_KIND,
        title: routingPlan ? 'Your routing plan' : 'Still queued',
        body: sentence,
        deskSentence: sentence,
        dropdownTitle: routingPlan ? 'Routing plan' : 'Queued',
        dropdownBody: sentence,
        deskLedgerRows: [
          { label: 'Queued', value: mznLabel, valueStrong: true },
          { label: 'Next open', value: when },
          { label: 'Why', value: 'Waiting on zarReserve' },
        ],
        actorType: 'ai_manager',
        avatarKind: 'convert_zar',
        amountCurrency: 'MZN',
        amountValue: params.residualMzn,
        amountSign: 'debit',
        txId: eventId,
        groupId: eventId,
        hasDownloadButton: false,
        awaitingConfirm: false,
        routingBlocked: false,
        status: 'recorded',
        routingAction: routingPlan ? 'routing_plan' : 'liquidity_queue_residual',
        deskSpeaker: 'sam',
        mznResidual: params.residualMzn,
        liquidNowMode: 'none',
        ...(routingPlan ? { routingPlan } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        recordingSource: 'SYSTEM',
      },
      { merge: true }
    )
}

function sastParts(ms: number): { year: number; month: number; day: number; hour: number; minute: number } {
  const shifted = new Date(ms + SAST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

function sastToUtcMs(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0) - SAST_OFFSET_MS
}

/** Previous liquidity open at or before nowMs. */
export function lastLiquidityOpenMs(nowMs: number = Date.now()): number {
  const p = sastParts(nowMs)
  const todayOpen = sastToUtcMs(
    p.year,
    p.month,
    p.day,
    LIQUIDITY_OPEN_HOUR_SAST,
    LIQUIDITY_OPEN_MINUTE_SAST
  )
  if (nowMs >= todayOpen) return todayOpen
  return todayOpen - 24 * 60 * 60 * 1000
}

/** Next liquidity open strictly after nowMs. */
export function nextLiquidityOpenMs(nowMs: number = Date.now()): number {
  const p = sastParts(nowMs)
  const todayOpen = sastToUtcMs(
    p.year,
    p.month,
    p.day,
    LIQUIDITY_OPEN_HOUR_SAST,
    LIQUIDITY_OPEN_MINUTE_SAST
  )
  if (nowMs < todayOpen) return todayOpen
  return todayOpen + 24 * 60 * 60 * 1000
}

export function liquidityWindowKey(openMs: number): string {
  const p = sastParts(openMs)
  const hh = String(LIQUIDITY_OPEN_HOUR_SAST).padStart(2, '0')
  const mm = String(LIQUIDITY_OPEN_MINUTE_SAST).padStart(2, '0')
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}-${hh}${mm}`
}

export type QueueDrainResult = {
  userId: string
  zarAmount: number
  mznConverted: number
  mznResidual: number
  skipped?: string
}

/**
 * FCFS drain of liquidityQueueMzn at the current open window.
 * Converts up to DAILY_LIQUID_ZAR_CAP per user against reserve; leaves ZAR liquid (no hold).
 */
export async function drainLiquidityQueues(params?: {
  nowMs?: number
  limit?: number
}): Promise<QueueDrainResult[]> {
  const nowMs = params?.nowMs ?? Date.now()
  const openMs = lastLiquidityOpenMs(nowMs)
  // Only run once we're at/after open, and within 30 minutes of this open
  // (keeps the every-minute sweeper from replaying all night).
  if (nowMs < openMs || nowMs - openMs > 30 * 60 * 1000) {
    return []
  }
  const windowKey = liquidityWindowKey(openMs)
  const markerRef = db().collection('treasury').doc(`liquidityOpen-${windowKey}`)
  const marker = await markerRef.get()
  if (marker.exists && marker.data()?.status === 'done') {
    return []
  }
  // Claim the window so concurrent sweeps don't double-pay.
  try {
    await markerRef.create({
      status: 'running',
      windowKey,
      openMs,
      startedAt: admin.firestore.Timestamp.fromMillis(nowMs),
    })
  } catch {
    const again = await markerRef.get()
    if (again.exists) return []
  }

  const limit = Math.max(1, Math.min(40, params?.limit ?? 20))
  type QueueRow = {
    userId: string
    queueMzn: number
    queuedAtMs: number
    fiatBalance: number
  }
  const byUser = new Map<string, QueueRow>()

  const ingestWalletDoc = (doc: FirebaseFirestore.DocumentSnapshot) => {
    if (!(doc.id === 'cashMZN' || doc.data()?.walletId === 'cashMZN')) return
    const userId = doc.ref.parent.parent?.id || ''
    const data = doc.data() || {}
    const queueMzn = roundMajor(Number(data.liquidityQueueMzn || 0))
    if (!userId || !(queueMzn > 0.005)) return
    byUser.set(userId, {
      userId,
      queueMzn,
      queuedAtMs: Number(data.liquidityQueuedAtMs || 0),
      fiatBalance: roundMajor(Number(data.fiatBalance || 0)),
    })
  }

  try {
    const snap = await db()
      .collectionGroup('wallets')
      .where('liquidityQueueMzn', '>', 0)
      .limit(80)
      .get()
    for (const doc of snap.docs) ingestWalletDoc(doc)
  } catch (error) {
    functions.logger.warn('[drainLiquidityQueues] collectionGroup query failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Fallback / merge: top-level queue pointers (works before the collection-group index is ready).
  try {
    const pointers = await db().collection('liquidityQueueMzn').limit(80).get()
    for (const pointer of pointers.docs) {
      const userId = String(pointer.data()?.uid || pointer.id || '')
      if (!userId || byUser.has(userId)) continue
      const mznSnap = await db()
        .collection('users')
        .doc(userId)
        .collection('wallets')
        .doc('cashMZN')
        .get()
      ingestWalletDoc(mznSnap)
    }
  } catch (error) {
    functions.logger.warn('[drainLiquidityQueues] pointer fallback failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const rows = Array.from(byUser.values())
    .filter((r) => r.userId && r.queueMzn > 0.005)
    .sort((a, b) => a.queuedAtMs - b.queuedAtMs || a.userId.localeCompare(b.userId))
    .slice(0, limit)

  if (!rows.length) {
    // Leave unlocked so the next minute can retry if wallets are still indexing.
    await markerRef.delete().catch(() => undefined)
    return []
  }

  const sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
  const costRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)
  if (!(sellRate > 0) || !(costRate > 0)) {
    await markerRef.set({ status: 'error', error: 'no_rate', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    return []
  }

  const results: QueueDrainResult[] = []
  for (const row of rows) {
    const zarRef = db().collection('users').doc(row.userId).collection('wallets').doc('cashZAR')
    const mznRef = db().collection('users').doc(row.userId).collection('wallets').doc('cashMZN')
    const zarSnap = await zarRef.get()
    const zarData = zarSnap.data() || {}
    const used =
      String(zarData.liquidityWindowKey || '') === windowKey
        ? roundMajor(Number(zarData.liquidityWindowUsedZar || 0))
        : 0
    const dailyLeft = roundMajor(Math.max(0, DAILY_LIQUID_ZAR_CAP - used))
    const mznBalance = roundMajor(Math.max(row.queueMzn, row.fiatBalance))
    const wantZar = roundMajor(mznBalance / sellRate)
    const instantTarget = roundMajor(Math.min(wantZar, dailyLeft))
    if (!(instantTarget > 0.005)) {
      results.push({
        userId: row.userId,
        zarAmount: 0,
        mznConverted: 0,
        mznResidual: mznBalance,
        skipped: 'daily_cap',
      })
      continue
    }

    await ensureReserveAtLeast('ZAR', instantTarget)
    const sourceForSlice = roundMajor(Math.min(mznBalance, instantTarget * sellRate))
    const split = await planReserveSplit({
      destCurrency: 'ZAR',
      wantDest: instantTarget,
      totalSource: sourceForSlice,
    })
    if (!(split.instantDest > 0.005) || !(split.instantSource > 0.005)) {
      results.push({
        userId: row.userId,
        zarAmount: 0,
        mznConverted: 0,
        mznResidual: mznBalance,
        skipped: 'reserve_short',
      })
      continue
    }

    const groupId = `liquidity-open-${windowKey}-${row.userId}`.replace(/[^\w.-]+/g, '-').slice(0, 120)
    try {
      const instant = await payInstantFromReserve({
        userId: row.userId,
        sourceCurrency: 'MZN',
        destCurrency: 'ZAR',
        sourceMajor: split.instantSource,
        destMajor: split.instantDest,
        fxRateMZNperZar: sellRate,
        costRate,
        sellRate,
        groupId,
        skipLiquidAccrue: false,
        setFirstPayoutHold: false,
      })
      const residualMzn = roundMajor(Math.max(0, mznBalance - split.instantSource))
      await zarRef.set(
        {
          liquidityWindowKey: windowKey,
          liquidityWindowUsedZar: roundMajor(used + instant.destMajor),
          dailyLiquidKey: windowKey.slice(0, 10),
          dailyLiquidUsedZar: roundMajor(used + instant.destMajor),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await mznRef.set(
        {
          liquidityQueueMzn: residualMzn,
          ...(residualMzn > 0.005
            ? {}
            : {
                liquidityQueuedAtMs: admin.firestore.FieldValue.delete(),
                liquidityQueueDayKey: admin.firestore.FieldValue.delete(),
              }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      const pointerRef = db().collection('liquidityQueueMzn').doc(row.userId)
      if (residualMzn > 0.005) {
        await pointerRef.set(
          {
            uid: row.userId,
            queueMzn: residualMzn,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      } else {
        await pointerRef.delete().catch(() => undefined)
      }

      const zarLabel = fmtZar(instant.destMajor)
      const eventId = `liquidity-open-${groupId}`.slice(0, 180)
      await db()
        .collection('users')
        .doc(row.userId)
        .collection('activityEvents')
        .doc(eventId)
        .set(
          {
            id: eventId,
            kind: CONVERSION_ROUTING_KIND,
            title: 'Liquidity open',
            body: `${zarLabel} from your queue is liquid now.`,
            deskSentence: `${zarLabel} from your queue is liquid now.`,
            dropdownTitle: 'Liquidity open',
            dropdownBody: `${zarLabel} · liquid`,
            deskLedgerRows: [
              { label: 'Converted', value: fmtMzn(split.instantSource) },
              { label: 'Rate', value: `${sellRate.toFixed(4)} MZN/ZAR` },
              { label: 'Liquid ZAR', value: zarLabel, valueStrong: true },
            ],
            actorType: 'ai_manager',
            avatarKind: 'convert_zar',
            amountCurrency: 'ZAR',
            amountValue: instant.destMajor,
            amountSign: 'credit',
            txId: eventId,
            groupId,
            hasDownloadButton: false,
            awaitingConfirm: false,
            routingBlocked: false,
            status: 'recorded',
            routingAction: 'liquidity_open',
            deskSpeaker: 'sam',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            recordingSource: 'SYSTEM',
          },
          { merge: true }
        )

      // SA Bank Liaison: scheduled 09:15 sweep (same event id the payout job completes).
      const cycleKey = liquidCycleKeyAt(openMs)
      try {
        await publishScheduledLiquidPayout({
          userId: row.userId,
          zarAmount: instant.destMajor,
          openMs,
          cycleKey,
        })
      } catch (error) {
        functions.logger.warn('[drainLiquidityQueues] scheduled payout notice failed', {
          userId: row.userId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      results.push({
        userId: row.userId,
        zarAmount: instant.destMajor,
        mznConverted: split.instantSource,
        mznResidual: residualMzn,
      })
    } catch (error) {
      functions.logger.error('[drainLiquidityQueues] convert failed', {
        userId: row.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      results.push({
        userId: row.userId,
        zarAmount: 0,
        mznConverted: 0,
        mznResidual: mznBalance,
        skipped: 'convert_error',
      })
    }
  }

  // After all converts: refresh FCFS bookings, then tell each residual claimant why.
  let planNextOpenAt: number | null = null
  try {
    const plan = await refreshNextOpenBookings()
    planNextOpenAt = plan.openAtMs
  } catch (error) {
    functions.logger.warn('[drainLiquidityQueues] post-drain booking refresh failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  for (const r of results) {
    if (!(r.mznResidual > 0.005)) continue
    try {
      await publishResidualQueueNotice({
        userId: r.userId,
        residualMzn: r.mznResidual,
        windowKey,
        nextOpenAtMs: planNextOpenAt,
      })
    } catch (error) {
      functions.logger.warn('[drainLiquidityQueues] residual queue notice failed', {
        userId: r.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await markerRef.set(
    {
      status: 'done',
      windowKey,
      openMs,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      results: results.map((r) => ({
        userId: r.userId,
        zarAmount: r.zarAmount,
        skipped: r.skipped || null,
      })),
    },
    { merge: true }
  )
  return results
}

/** Every minute around the open — converts queued residual FCFS. */
export const tx_drainLiquidityQueues = functions
  .region('us-central1')
  .pubsub.schedule('every 1 minutes')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    const results = await drainLiquidityQueues({ limit: 20 })
    const paid = results.filter((r) => r.zarAmount > 0)
    if (results.length || paid.length) {
      console.log('[tx_drainLiquidityQueues]', {
        considered: results.length,
        paid: paid.length,
        totalZar: roundMajor(paid.reduce((s, r) => s + r.zarAmount, 0)),
      })
    }
    // Always refresh next-open bookings (even outside the drain window) so
    // drip + liquidity report stay aligned with real zarReserve + FCFS queue.
    try {
      await refreshNextOpenBookings()
    } catch (error) {
      functions.logger.warn('[tx_drainLiquidityQueues] next-open booking refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  })
