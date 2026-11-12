/**
 * Next liquidity-open booking from pure reserve + FCFS queue.
 *
 * Does NOT invent reserve top-ups (unlike ensureReserveAtLeast at drain time).
 * UI drip + liquidity report use this so “where is my money” matches the till.
 * AI-routing acceleration is intentionally out of scope here.
 */

import * as admin from 'firebase-admin'
import { fetchQuotedMznPerZar, MZN_ZAR_MARKUP } from '../fx/quotedMznZar'
import { DAILY_LIQUID_ZAR_CAP, sastDayKey } from './dailyLiquidZar'
import { getOrInitReserve, roundMajor } from './reserveBooks'

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
const OPEN_HOUR = 9
const OPEN_MINUTE = 0

function sastParts(ms: number): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const shifted = new Date(ms + SAST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

function sastToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0) - SAST_OFFSET_MS
}

function nextLiquidityOpenMs(nowMs: number): number {
  const p = sastParts(nowMs)
  const todayOpen = sastToUtcMs(p.year, p.month, p.day, OPEN_HOUR, OPEN_MINUTE)
  if (nowMs < todayOpen) return todayOpen
  return todayOpen + 24 * 60 * 60 * 1000
}

export type QueueClaimInput = {
  userId: string
  queueMzn: number
  queuedAtMs: number
  dailyLiquidUsedZar: number
  dailyLiquidKey: string
}

export type NextOpenBooking = {
  userId: string
  bookedZar: number
  bookedMzn: number
  wantZar: number
  queueRank: number
  queueAheadZar: number
  dailyLeftZar: number
  skipped?: 'empty' | 'daily_cap' | 'reserve_short'
}

export type NextOpenPlan = {
  openAtMs: number
  dayKey: string
  reservePoolZar: number
  sellRate: number
  bookings: NextOpenBooking[]
}

/** Pure FCFS allocation against a finite reserve pool + per-user daily cap. */
export function planNextOpenBookings(params: {
  claims: QueueClaimInput[]
  reservePoolZar: number
  sellRate: number
  dayKey: string
  openAtMs: number
  dailyCapZar?: number
}): NextOpenPlan {
  const sellRate = Number(params.sellRate) || 0
  const dailyCap = Math.max(0, Number(params.dailyCapZar ?? DAILY_LIQUID_ZAR_CAP) || 0)
  const dayKey = params.dayKey
  let pool = roundMajor(Math.max(0, params.reservePoolZar))

  const ordered = [...params.claims]
    .map((c) => ({
      ...c,
      queueMzn: roundMajor(Math.max(0, c.queueMzn)),
      queuedAtMs: Number(c.queuedAtMs) || 0,
    }))
    .filter((c) => c.userId && c.queueMzn > 0.005)
    .sort(
      (a, b) =>
        a.queuedAtMs - b.queuedAtMs || a.userId.localeCompare(b.userId)
    )

  const bookings: NextOpenBooking[] = []
  let aheadZar = 0

  for (let i = 0; i < ordered.length; i++) {
    const claim = ordered[i]
    const used =
      String(claim.dailyLiquidKey || '') === dayKey
        ? roundMajor(Number(claim.dailyLiquidUsedZar) || 0)
        : 0
    const dailyLeft = roundMajor(Math.max(0, dailyCap - used))
    const wantZar =
      sellRate > 0 ? roundMajor(claim.queueMzn / sellRate) : 0

    if (!(wantZar > 0.005)) {
      bookings.push({
        userId: claim.userId,
        bookedZar: 0,
        bookedMzn: 0,
        wantZar: 0,
        queueRank: i + 1,
        queueAheadZar: aheadZar,
        dailyLeftZar: dailyLeft,
        skipped: 'empty',
      })
      continue
    }

    if (!(dailyLeft > 0.005)) {
      bookings.push({
        userId: claim.userId,
        bookedZar: 0,
        bookedMzn: 0,
        wantZar,
        queueRank: i + 1,
        queueAheadZar: aheadZar,
        dailyLeftZar: 0,
        skipped: 'daily_cap',
      })
      continue
    }

    if (!(pool > 0.005)) {
      bookings.push({
        userId: claim.userId,
        bookedZar: 0,
        bookedMzn: 0,
        wantZar,
        queueRank: i + 1,
        queueAheadZar: aheadZar,
        dailyLeftZar: dailyLeft,
        skipped: 'reserve_short',
      })
      continue
    }

    const bookedZar = roundMajor(Math.min(wantZar, dailyLeft, pool))
    const bookedMzn =
      sellRate > 0 ? roundMajor(Math.min(claim.queueMzn, bookedZar * sellRate)) : 0
    pool = roundMajor(Math.max(0, pool - bookedZar))
    bookings.push({
      userId: claim.userId,
      bookedZar,
      bookedMzn,
      wantZar,
      queueRank: i + 1,
      queueAheadZar: aheadZar,
      dailyLeftZar: dailyLeft,
    })
    aheadZar = roundMajor(aheadZar + bookedZar)
  }

  return {
    openAtMs: params.openAtMs,
    dayKey,
    reservePoolZar: roundMajor(Math.max(0, params.reservePoolZar)),
    sellRate,
    bookings,
  }
}

async function loadQueueClaims(): Promise<QueueClaimInput[]> {
  const byUser = new Map<string, QueueClaimInput>()

  try {
    const snap = await db()
      .collectionGroup('wallets')
      .where('liquidityQueueMzn', '>', 0)
      .limit(80)
      .get()
    for (const doc of snap.docs) {
      if (!(doc.id === 'cashMZN' || doc.data()?.walletId === 'cashMZN')) continue
      const userId = doc.ref.parent.parent?.id || ''
      if (!userId) continue
      const data = doc.data() || {}
      byUser.set(userId, {
        userId,
        queueMzn: roundMajor(Number(data.liquidityQueueMzn || 0)),
        queuedAtMs: Number(data.liquidityQueuedAtMs || 0),
        dailyLiquidUsedZar: 0,
        dailyLiquidKey: '',
      })
    }
  } catch {
    // Fall through to pointer collection.
  }

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
      const data = mznSnap.data() || {}
      const queueMzn = roundMajor(
        Number(data.liquidityQueueMzn || pointer.data()?.queueMzn || 0)
      )
      if (!(queueMzn > 0.005)) continue
      byUser.set(userId, {
        userId,
        queueMzn,
        queuedAtMs: Number(
          data.liquidityQueuedAtMs || pointer.data()?.queuedAtMs || 0
        ),
        dailyLiquidUsedZar: 0,
        dailyLiquidKey: '',
      })
    }
  } catch {
    /* ignore */
  }

  const claims = Array.from(byUser.values())
  await Promise.all(
    claims.map(async (claim) => {
      const zarSnap = await db()
        .collection('users')
        .doc(claim.userId)
        .collection('wallets')
        .doc('cashZAR')
        .get()
      const zar = zarSnap.data() || {}
      claim.dailyLiquidUsedZar = roundMajor(Number(zar.dailyLiquidUsedZar || 0))
      claim.dailyLiquidKey = String(zar.dailyLiquidKey || '')
    })
  )
  return claims
}

/** Persist bookings onto each queued cashMZN wallet (and clear stale fields). */
export async function refreshNextOpenBookings(params?: {
  nowMs?: number
  sellRate?: number
}): Promise<NextOpenPlan> {
  const nowMs = params?.nowMs ?? Date.now()
  const openAtMs = nextLiquidityOpenMs(nowMs)
  // Day key for the open window (SAST day of that open).
  const dayKey = sastDayKey(openAtMs)
  const reserve = await getOrInitReserve('ZAR')
  const sellRate =
    params?.sellRate && params.sellRate > 0
      ? params.sellRate
      : await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)

  const claims = await loadQueueClaims()
  const plan = planNextOpenBookings({
    claims,
    reservePoolZar: reserve.fiatBalance,
    sellRate,
    dayKey,
    openAtMs,
  })

  const bookedIds = new Set(plan.bookings.map((b) => b.userId))
  const batch = db().batch()
  let ops = 0

  for (const booking of plan.bookings) {
    const ref = db()
      .collection('users')
      .doc(booking.userId)
      .collection('wallets')
      .doc('cashMZN')
    // Booking used to create a cashMZN doc with only nextOpen* fields (no fiatBalance).
    // Keep the wallet shape intact whenever we touch the doc.
    const existing = await ref.get()
    const data = existing.data() || {}
    const patch: Record<string, unknown> = {
      nextOpenBookedZar: booking.bookedZar,
      nextOpenBookedMzn: booking.bookedMzn,
      nextOpenWantZar: booking.wantZar,
      nextOpenQueueRank: booking.queueRank,
      nextOpenQueueAheadZar: booking.queueAheadZar,
      nextOpenReservePoolZar: plan.reservePoolZar,
      nextOpenAtMs: plan.openAtMs,
      nextOpenDayKey: plan.dayKey,
      nextOpenSellRate: plan.sellRate,
      nextOpenSkipReason: booking.skipped || null,
      nextOpenComputedAtMs: nowMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    if (!existing.exists || data.fiatBalance == null || data.walletId == null) {
      patch.walletId = 'cashMZN'
      patch.kind = 'cash'
      patch.displayCurrency = 'MZN'
      patch.fiatBalance =
        typeof data.fiatBalance === 'number' && Number.isFinite(data.fiatBalance)
          ? data.fiatBalance
          : 0
      patch.usdtBalance =
        typeof data.usdtBalance === 'number' && Number.isFinite(data.usdtBalance)
          ? data.usdtBalance
          : 0
    }
    batch.set(ref, patch, { merge: true })
    ops++
  }

  // Clear booking fields for wallets that left the queue since last plan.
  // Best-effort: only clear users we still know about via pointer collection.
  try {
    const pointers = await db().collection('liquidityQueueMzn').limit(80).get()
    for (const pointer of pointers.docs) {
      const userId = String(pointer.data()?.uid || pointer.id || '')
      if (!userId || bookedIds.has(userId)) continue
      const ref = db()
        .collection('users')
        .doc(userId)
        .collection('wallets')
        .doc('cashMZN')
      batch.set(
        ref,
        {
          nextOpenBookedZar: 0,
          nextOpenBookedMzn: 0,
          nextOpenWantZar: 0,
          nextOpenQueueRank: admin.firestore.FieldValue.delete(),
          nextOpenSkipReason: 'not_queued',
          nextOpenComputedAtMs: nowMs,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      ops++
    }
  } catch {
    /* ignore */
  }

  if (ops > 0) await batch.commit()

  // Marker for ops / debugging.
  await db()
    .collection('treasury')
    .doc('nextOpenBooking')
    .set(
      {
        openAtMs: plan.openAtMs,
        dayKey: plan.dayKey,
        reservePoolZar: plan.reservePoolZar,
        sellRate: plan.sellRate,
        bookingCount: plan.bookings.length,
        totalBookedZar: roundMajor(
          plan.bookings.reduce((s, b) => s + b.bookedZar, 0)
        ),
        computedAtMs: nowMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

  return plan
}

/** Read one user's persisted booking (after refresh). */
export async function readUserNextOpenBooking(
  userId: string
): Promise<{
  bookedZar: number
  bookedMzn: number
  wantZar: number
  queueRank: number | null
  queueAheadZar: number
  reservePoolZar: number
  openAtMs: number | null
  skipReason: string | null
} | null> {
  const snap = await db()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc('cashMZN')
    .get()
  if (!snap.exists) return null
  const data = snap.data() || {}
  return {
    bookedZar: roundMajor(Number(data.nextOpenBookedZar || 0)),
    bookedMzn: roundMajor(Number(data.nextOpenBookedMzn || 0)),
    wantZar: roundMajor(Number(data.nextOpenWantZar || 0)),
    queueRank:
      typeof data.nextOpenQueueRank === 'number' ? data.nextOpenQueueRank : null,
    queueAheadZar: roundMajor(Number(data.nextOpenQueueAheadZar || 0)),
    reservePoolZar: roundMajor(Number(data.nextOpenReservePoolZar || 0)),
    openAtMs:
      typeof data.nextOpenAtMs === 'number' && data.nextOpenAtMs > 0
        ? data.nextOpenAtMs
        : null,
    skipReason:
      typeof data.nextOpenSkipReason === 'string' ? data.nextOpenSkipReason : null,
  }
}
