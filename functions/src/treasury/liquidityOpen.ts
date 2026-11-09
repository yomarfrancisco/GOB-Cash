/**
 * Liquidity open window — normally 09:00 SAST.
 * TEMP test: 21:55 SAST so we can watch the residual drain live; flip back after.
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

/** TEMP — restore to hour 9, minute 0 after the live test. */
export const LIQUIDITY_OPEN_HOUR_SAST = 21
export const LIQUIDITY_OPEN_MINUTE_SAST = 55

export const DAILY_LIQUID_ZAR_CAP = 100_000

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
  let queueDocs: FirebaseFirestore.QueryDocumentSnapshot[] = []
  try {
    const snap = await db()
      .collectionGroup('wallets')
      .where('liquidityQueueMzn', '>', 0)
      .limit(80)
      .get()
    queueDocs = snap.docs.filter(
      (d: FirebaseFirestore.QueryDocumentSnapshot) =>
        d.id === 'cashMZN' || d.data()?.walletId === 'cashMZN'
    )
  } catch (error) {
    functions.logger.warn('[drainLiquidityQueues] collectionGroup query failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const rows = queueDocs
    .map((doc) => {
      const userId = doc.ref.parent.parent?.id || ''
      const data = doc.data() || {}
      return {
        userId,
        queueMzn: roundMajor(Number(data.liquidityQueueMzn || 0)),
        queuedAtMs: Number(data.liquidityQueuedAtMs || 0),
        fiatBalance: roundMajor(Number(data.fiatBalance || 0)),
      }
    })
    .filter((r) => r.userId && r.queueMzn > 0.005)
    .sort((a, b) => a.queuedAtMs - b.queuedAtMs || a.userId.localeCompare(b.userId))
    .slice(0, limit)

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
            body: `${zarLabel} from your queue is liquid now. ${
              residualMzn > 0.005
                ? `${fmtMzn(residualMzn)} remains queued for the next window.`
                : 'Queue cleared.'
            }`,
            deskSentence: `${zarLabel} from your queue is liquid now.`,
            dropdownTitle: 'Liquidity open',
            dropdownBody: `${zarLabel} · queue cleared`,
            deskLedgerRows: [
              { label: 'Converted', value: fmtMzn(split.instantSource) },
              { label: 'Rate', value: `${sellRate.toFixed(4)} MZN/ZAR` },
              { label: 'Liquid ZAR', value: zarLabel, valueStrong: true },
              ...(residualMzn > 0.005
                ? [{ label: 'Still queued', value: fmtMzn(residualMzn) }]
                : []),
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
    return null
  })
