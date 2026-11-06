/**
 * Desk "Status" → Liquidity status lookback.
 * Same card anatomy as Step 6 · Day lookback (sentence + ledger rows).
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { CONVERSION_ROUTING_KIND, ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import { formatVisibleSast } from '../routing/routingTime'
import { nextSettleAt09hSast } from '../tx/enRouteSettle'
import { roundMajor } from './reserveBooks'

const db = admin.firestore()
const LOOKBACK_MS = 72 * 60 * 60 * 1000

function fmtZar(n: number): string {
  return `R${roundMajor(n).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtMzn(n: number): string {
  return `Mt ${roundMajor(n).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtRate(n: number): string {
  if (!(n > 0)) return '—'
  return `${n.toFixed(4)} MZN/ZAR`
}

function hoursUntil(targetMs: number, nowMs: number): string {
  const ms = Math.max(0, targetMs - nowMs)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function tsMillis(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (raw as { toMillis: () => number }).toMillis()
    return Number.isFinite(ms) && ms > 0 ? ms : null
  }
  if (typeof raw === 'number' && raw > 0) return raw
  return null
}

export type LiquidityStatusReport = {
  eventId: string
  receivedMzn: number
  liquidZar: number
  clearingZar: number
  nextClearMs: number | null
  sentence: string
}

/**
 * Snapshot wallets + open EN_ROUTE + recent clears, publish a desk lookback card.
 */
export async function publishLiquidityStatus(adminUid: string): Promise<LiquidityStatusReport> {
  const nowMs = Date.now()
  const now = admin.firestore.Timestamp.fromMillis(nowMs)
  const since = admin.firestore.Timestamp.fromMillis(nowMs - LOOKBACK_MS)
  const userRef = db.collection('users').doc(adminUid)

  const [mznSnap, zarSnap, earnSnap] = await Promise.all([
    userRef.collection('wallets').doc('cashMZN').get(),
    userRef.collection('wallets').doc('cashZAR').get(),
    userRef.collection('wallets').doc('earnings').get(),
  ])
  const receivedMzn = roundMajor(Number(mznSnap.data()?.fiatBalance || 0))
  const liquidZar = roundMajor(Number(zarSnap.data()?.fiatBalance || 0))
  const earningsZar = roundMajor(Number(earnSnap.data()?.fiatBalance || 0))

  // Open lots still clearing into ZAR (or selling out of ZAR book).
  const openSnap = await db
    .collection('transactions')
    .where('userId', '==', adminUid)
    .where('status', '==', 'EN_ROUTE')
    .limit(80)
    .get()

  let clearingZar = 0
  let earliestSettleMs: number | null = null
  let openWeightedRate = 0
  let openRateWeight = 0
  for (const doc of openSnap.docs) {
    const tx = doc.data() || {}
    const dest = String(tx.destinationCurrency || '')
    const destMinor = Math.round(Number(tx.expectedDestinationAmountMinor || 0))
    const sourceMinor = Math.round(Number(tx.sourceAmountMinor || 0))
    // Buy ZAR / MZN→ZAR: dest is ZAR on earnings until clear.
    // Sell ZAR: source is ZAR already left cash — still "in route" until MZN lands.
    const zarInLot =
      dest === 'ZAR'
        ? destMinor / 100
        : String(tx.sourceCurrency || '') === 'ZAR'
          ? sourceMinor / 100
          : 0
    if (zarInLot > 0) clearingZar = roundMajor(clearingZar + zarInLot)
    const settleMs = tsMillis(tx.settleAt)
    if (settleMs != null) {
      earliestSettleMs =
        earliestSettleMs == null ? settleMs : Math.min(earliestSettleMs, settleMs)
    }
    const rate = Number(tx.costRateMZNperZAR || tx.sellRateMZNperZAR || tx.quotedRate || 0)
    if (rate > 0 && zarInLot > 0) {
      openWeightedRate += rate * zarInLot
      openRateWeight += zarInLot
    }
  }
  // Prefer wallet earnings as the clearing book when present (ROUTE collapsed into ZAR).
  if (earningsZar > clearingZar) clearingZar = earningsZar

  // Recent ZAR clears (became liquid) in the lookback window.
  // Prefer createdAt index (userId + createdAt) — filter dest/status in memory.
  let clearedZarLookback = 0
  let clearedWeightedRate = 0
  let clearedRateWeight = 0
  let lastClearedMs: number | null = null
  try {
    const recentSnap = await db
      .collection('transactions')
      .where('userId', '==', adminUid)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(80)
      .get()
    for (const doc of recentSnap.docs) {
      const tx = doc.data() || {}
      if (tx.status !== 'SETTLED' && tx.instructionStatus !== 'SETTLED') continue
      if (String(tx.destinationCurrency || '') !== 'ZAR') continue
      if (tx.settlementPath === 'daily_liquid_zar') continue
      const settledMs = tsMillis(tx.settledAt) || tsMillis(tx.updatedAt) || tsMillis(tx.createdAt)
      const destMinor = Math.round(
        Number(tx.actualDestinationAmountMinor || tx.expectedDestinationAmountMinor || 0)
      )
      const zar = destMinor / 100
      if (!(zar > 0)) continue
      clearedZarLookback = roundMajor(clearedZarLookback + zar)
      const rate = Number(tx.costRateMZNperZAR || tx.quotedRate || 0)
      if (rate > 0) {
        clearedWeightedRate += rate * zar
        clearedRateWeight += zar
      }
      if (settledMs != null && (lastClearedMs == null || settledMs > lastClearedMs)) {
        lastClearedMs = settledMs
      }
    }
  } catch (error) {
    console.warn('[publishLiquidityStatus] recent clears scan skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Last MZN credit signal from wallet updatedAt (best-effort when no inbound ledger).
  const mznUpdatedMs = tsMillis(mznSnap.data()?.updatedAt)

  const nextClearMs =
    earliestSettleMs != null && earliestSettleMs > nowMs
      ? earliestSettleMs
      : clearingZar > 0.005
        ? nextSettleAt09hSast(nowMs)
        : null

  const clearedRate = clearedRateWeight > 0 ? clearedWeightedRate / clearedRateWeight : 0
  const openRate = openRateWeight > 0 ? openWeightedRate / openRateWeight : 0

  const receivedWhen =
    mznUpdatedMs != null ? formatVisibleSast(mznUpdatedMs, nowMs) : 'on book'
  const liquidWhen =
    lastClearedMs != null
      ? `${formatVisibleSast(lastClearedMs, nowMs)} · ${fmtRate(clearedRate)}`
      : liquidZar > 0.005
        ? 'on wallet'
        : '—'
  const clearingWhen =
    nextClearMs != null
      ? `clears ~${formatVisibleSast(nextClearMs, nowMs)}${openRate > 0 ? ` · ${fmtRate(openRate)}` : ''}`
      : clearingZar > 0.005
        ? 'awaiting clear window'
        : 'nothing on ROUTE'
  const fullWhen =
    nextClearMs != null
      ? `${hoursUntil(nextClearMs, nowMs)} · ~${formatVisibleSast(nextClearMs, nowMs)}`
      : liquidZar > 0.005 && !(clearingZar > 0.005)
        ? 'book already liquid'
        : 'no clearing lot'

  const sentenceParts: string[] = []
  sentenceParts.push(`${fmtMzn(receivedMzn)} received`)
  if (clearedZarLookback > 0.005) {
    sentenceParts.push(`${fmtZar(clearedZarLookback)} cleared to liquid in the last 72h`)
  } else if (liquidZar > 0.005) {
    sentenceParts.push(`${fmtZar(liquidZar)} liquid now`)
  } else {
    sentenceParts.push('no liquid ZAR on wallet')
  }
  if (clearingZar > 0.005) {
    sentenceParts.push(`${fmtZar(clearingZar)} still clearing`)
  }
  if (nextClearMs != null) {
    sentenceParts.push(`full clear in ${hoursUntil(nextClearMs, nowMs)}`)
  }
  const sentence = `${sentenceParts.join(' · ')}.`

  const deskLedgerRows = [
    {
      label: 'Received',
      value: fmtMzn(receivedMzn),
      secondLine: receivedWhen,
    },
    {
      label: 'Liquid ZAR',
      value: fmtZar(liquidZar),
      valueStrong: liquidZar > 0.005,
      secondLine:
        clearedZarLookback > 0.005
          ? `${fmtZar(clearedZarLookback)} cleared · ${liquidWhen}`
          : liquidWhen,
    },
    {
      label: 'Still clearing',
      value: fmtZar(clearingZar),
      secondLine: clearingWhen,
    },
    {
      label: 'Full liquidity',
      value: nextClearMs != null ? hoursUntil(nextClearMs, nowMs) : '—',
      valueStrong: true,
      secondLine: fullWhen,
    },
  ]

  const dayKey = formatVisibleSast(nowMs, nowMs).replace(/[^\w.-]+/g, '-').slice(0, 24)
  const eventId = `liquidity-status-${dayKey}-${nowMs}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const title = 'Liquidity status'

  const mznAsZarRate = openRate > 0 ? openRate : clearedRate
  const deskChart = {
    title: 'Book split',
    unit: 'ZAR' as const,
    series: [
      {
        label: 'ZAR',
        points: [
          { label: 'Liquid', value: liquidZar },
          { label: 'Clearing', value: clearingZar },
          {
            label: 'MZN',
            value: mznAsZarRate > 0 ? roundMajor(receivedMzn / mznAsZarRate) : 0,
          },
        ],
      },
    ],
  }

  await userRef.collection('activityEvents').doc(eventId).set(
    {
      id: eventId,
      kind: CONVERSION_ROUTING_KIND,
      title,
      body: sentence,
      deskSentence: sentence,
      deskStatusChip: 'Status',
      deskLedgerRows,
      deskChart,
      dropdownTitle: title,
      dropdownBody: sentence,
      actorType: 'ai_manager',
      avatarKind: 'convert_zar',
      amountCurrency: 'ZAR',
      amountValue: liquidZar,
      amountSign: 'credit',
      txId: eventId,
      hasDownloadButton: false,
      awaitingConfirm: false,
      routingBlocked: false,
      status: 'recorded',
      routingAction: 'liquidity_status',
      deskSpeaker: 'sam',
      deskStep: 6,
      createdAt: now,
      updatedAt: now,
      recordingSource: 'SYSTEM',
      liquidityStatus: {
        receivedMzn,
        liquidZar,
        clearingZar,
        clearedZarLookback,
        clearedRate: roundMajor(clearedRate),
        openRate: roundMajor(openRate),
        nextClearMs,
      },
    },
    { merge: true }
  )

  return {
    eventId,
    receivedMzn,
    liquidZar,
    clearingZar,
    nextClearMs,
    sentence,
  }
}

export const admin_publishLiquidityStatus = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    if (context.auth.uid !== ROUTING_ADMIN_UID) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Liquidity status is limited to the designated admin user'
      )
    }
    return publishLiquidityStatus(context.auth.uid)
  })
