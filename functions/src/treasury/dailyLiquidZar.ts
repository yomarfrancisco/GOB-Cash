/**
 * Shared daily instant-ZAR liquidity cap (SAST calendar day).
 * First-fund, residual drain, and keypad/internal MZN→ZAR all share this budget.
 */

import * as admin from 'firebase-admin'
import { roundMajor } from './reserveBooks'
import type { ReserveSplitPlan } from './reserveConvert'

export const DAILY_LIQUID_ZAR_CAP = 100_000

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

export function sastDayKey(nowMs: number = Date.now()): string {
  const shifted = new Date(nowMs + SAST_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type DailyLiquidState = {
  dayKey: string
  usedZar: number
  leftZar: number
}

export async function readDailyLiquidState(
  userId: string,
  nowMs: number = Date.now()
): Promise<DailyLiquidState> {
  const dayKey = sastDayKey(nowMs)
  const zarSnap = await db()
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .doc('cashZAR')
    .get()
  const data = zarSnap.data() || {}
  const usedKey = String(data.dailyLiquidKey || '')
  const usedZar =
    usedKey === dayKey ? roundMajor(Number(data.dailyLiquidUsedZar || 0)) : 0
  const leftZar = roundMajor(Math.max(0, DAILY_LIQUID_ZAR_CAP - usedZar))
  return { dayKey, usedZar, leftZar }
}

/** Move any instant ZAR above today's remaining cap onto the routed leg. */
export function clipReserveSplitToDailyLiquid(
  split: ReserveSplitPlan,
  dailyLeftZar: number
): ReserveSplitPlan {
  const left = roundMajor(Math.max(0, dailyLeftZar))
  if (!(split.instantDest > left + 0.005)) return split

  if (!(left > 0.005)) {
    return {
      ...split,
      instantDest: 0,
      instantSource: 0,
      routedDest: roundMajor(split.instantDest + split.routedDest),
      routedSource: roundMajor(split.instantSource + split.routedSource),
    }
  }

  const rate =
    split.instantDest > 0.005 ? split.instantSource / split.instantDest : 0
  const instantDest = left
  const instantSource = roundMajor(instantDest * rate)
  const overflowDest = roundMajor(split.instantDest - instantDest)
  const overflowSource = roundMajor(split.instantSource - instantSource)
  return {
    ...split,
    instantDest,
    instantSource,
    routedDest: roundMajor(split.routedDest + overflowDest),
    routedSource: roundMajor(split.routedSource + overflowSource),
  }
}

export async function bumpDailyLiquidUsed(params: {
  userId: string
  dayKey: string
  previousUsedZar: number
  addZar: number
}): Promise<void> {
  const add = roundMajor(params.addZar)
  if (!(add > 0.005)) return
  await db()
    .collection('users')
    .doc(params.userId)
    .collection('wallets')
    .doc('cashZAR')
    .set(
      {
        dailyLiquidKey: params.dayKey,
        dailyLiquidUsedZar: roundMajor(params.previousUsedZar + add),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
}
