/**
 * Book ZAR sales onto the EN ROUTE (earnings) wallet until next 09:00 SAST,
 * then clear them into cashMZN at the booked SELL rate.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

export function nextSettleAt09hSast(fromMs: number): number {
  const shifted = new Date(fromMs + SAST_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  const todayNine = Date.UTC(y, m, d, 9, 0, 0) - SAST_OFFSET_MS
  if (fromMs < todayNine) return todayNine
  return todayNine + 24 * 60 * 60 * 1000
}

function roundMajor(value: number): number {
  return Math.round(value * 100) / 100
}

export type BookZarEnRouteParams = {
  userId: string
  sourceAmountZar: number
  sellRate: number
  costRate: number
  rewardsMznMinor: number
  namedClient?: { handle: string; userId: string } | null
  groupId?: string
  suppressDeskActivity?: boolean
  /** Planned desk run — bubble is tagged and wiped on Real time. */
  simulated?: boolean
  planRunId?: string
}

export type BookZarEnRouteResult = {
  txId: string
  settleAtMs: number
  expectedMzn: number
}

/** Debit cashZAR, credit earnings (ZAR), open EN_ROUTE tx until next 09:00 SAST. */
export async function bookZarSaleToEnRoute(
  params: BookZarEnRouteParams
): Promise<BookZarEnRouteResult> {
  const sourceAmountMajor = roundMajor(params.sourceAmountZar)
  const sourceAmountMinor = Math.round(sourceAmountMajor * 100)
  if (!(sourceAmountMinor > 0)) {
    throw new functions.https.HttpsError('invalid-argument', 'sourceAmount must be a positive number')
  }

  const expectedMzn = roundMajor(sourceAmountMajor * params.sellRate)
  const expectedDestinationMinor = Math.round(expectedMzn * 100)
  const nowMs = Date.now()
  const settleAtMs = nextSettleAt09hSast(nowMs)
  const now = admin.firestore.Timestamp.fromMillis(nowMs)
  const settleAt = admin.firestore.Timestamp.fromMillis(settleAtMs)

  const userRef = db.collection('users').doc(params.userId)
  const zarRef = userRef.collection('wallets').doc('cashZAR')
  const earningsRef = userRef.collection('wallets').doc('earnings')
  const txRef = db.collection('transactions').doc()
  const txId = txRef.id
  const groupId = params.groupId || txId

  await db.runTransaction(async (t) => {
    const zarSnap = await t.get(zarRef)
    const earningsSnap = await t.get(earningsRef)
    const zarData = zarSnap.exists ? zarSnap.data()! : { fiatBalance: 0 }
    const earningsData = earningsSnap.exists ? earningsSnap.data()! : { fiatBalance: 0 }
    const availableMinor = Math.round(Number(zarData.fiatBalance || 0) * 100)
    if (!zarSnap.exists || sourceAmountMinor > availableMinor) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient ZAR balance.')
    }

    const earningsMinor = Math.round(Number(earningsData.fiatBalance || 0) * 100) + sourceAmountMinor
    const existingSettle = earningsData.nextSettleAt?.toMillis?.() ?? earningsData.nextSettleAt
    const existingSettleMs =
      typeof existingSettle === 'number' && existingSettle > 0 ? existingSettle : null
    const nextSettleAtMs =
      existingSettleMs != null ? Math.min(existingSettleMs, settleAtMs) : settleAtMs

    t.update(zarRef, {
      fiatBalance: (availableMinor - sourceAmountMinor) / 100,
      updatedAt: now,
    })

    if (!earningsSnap.exists) {
      t.set(earningsRef, {
        walletId: 'earnings',
        kind: 'earnings',
        displayCurrency: 'ZAR',
        fiatBalance: earningsMinor / 100,
        usdtBalance: 0,
        nextSettleAt: admin.firestore.Timestamp.fromMillis(nextSettleAtMs),
        bookedSellRate: params.sellRate,
        updatedAt: now,
      })
    } else {
      t.update(earningsRef, {
        fiatBalance: earningsMinor / 100,
        nextSettleAt: admin.firestore.Timestamp.fromMillis(nextSettleAtMs),
        bookedSellRate: params.sellRate,
        updatedAt: now,
      })
    }

    t.set(txRef, {
      id: txId,
      userId: params.userId,
      type: 'CONVERSION',
      transactionType: 'CONVERSION',
      uiAction: 'PAY',
      instructionSource: 'USER_INSTRUCTED',
      recordingSource: 'USER_UI',
      executionChannel: 'INTERNAL',
      status: 'EN_ROUTE',
      instructionStatus: 'EN_ROUTE',
      sourceCurrency: 'ZAR',
      destinationCurrency: 'MZN',
      currency: 'ZAR',
      sourceAmountMinor,
      expectedDestinationAmountMinor: expectedDestinationMinor,
      actualDestinationAmountMinor: null,
      quotedRate: params.sellRate,
      buyRateMZNperZAR: params.costRate,
      costRateMZNperZAR: params.costRate,
      sellRateMZNperZAR: params.sellRate,
      rewardsMznMinor: params.rewardsMznMinor || null,
      clientDestinationAmountMinor: expectedDestinationMinor,
      amountMzn: expectedMzn,
      amountZar: sourceAmountMajor,
      fxRateMZNperZAR: params.sellRate,
      settleAt,
      counterpartyHandle: params.namedClient?.handle || null,
      counterpartyUserId: params.namedClient?.userId || null,
      groupId,
      suppressDeskActivity: params.suppressDeskActivity === true,
      simulated: params.simulated === true,
      planRunId: params.planRunId || null,
      createdAt: now,
      statusUpdatedAt: now,
      updatedAt: now,
    })

    if (!params.suppressDeskActivity) {
      const settleLabel = new Date(settleAtMs + SAST_OFFSET_MS)
        .toISOString()
        .slice(11, 16)
      t.set(userRef.collection('activityEvents').doc(txId), {
        id: txId,
        kind: 'EN_ROUTE_BOOKED',
        title: 'ZAR booked',
        deskStatusChip: 'Booked',
        body: `≈ ${expectedMzn.toFixed(2)} MZN @ ${params.sellRate.toFixed(4)} (sell)`,
        dropdownBody: `Booked ${settleLabel} · clears ~09:00 next window`,
        actorType: 'ai_manager',
        avatarKind: 'convert_zar',
        amountCurrency: 'ZAR',
        amountValue: sourceAmountMajor,
        amountSign: 'debit',
        pairedAmountValue: expectedMzn,
        txId,
        hasDownloadButton: false,
        status: 'recorded',
        routingAction: 'en_route',
        deskSpeaker: 'leo',
        ...(params.simulated === true
          ? { simulated: true, ...(params.planRunId ? { planRunId: params.planRunId } : {}) }
          : {}),
        createdAt: now,
        recordingSource: 'USER_UI',
      })
    }
  })

  return { txId, settleAtMs, expectedMzn }
}

/** Clear due EN_ROUTE lots into cashMZN and reduce earnings. */
export async function settleDueEnRouteLots(limit = 40): Promise<number> {
  const now = admin.firestore.Timestamp.now()
  const snap = await db
    .collection('transactions')
    .where('status', '==', 'EN_ROUTE')
    .where('settleAt', '<=', now)
    .limit(limit)
    .get()

  if (snap.empty) return 0

  let settled = 0
  for (const doc of snap.docs) {
    const tx = doc.data()
    const userId = typeof tx.userId === 'string' ? tx.userId : ''
    const zarMinor = Math.round(Number(tx.sourceAmountMinor || 0))
    const mznMinor = Math.round(Number(tx.expectedDestinationAmountMinor || 0))
    if (!userId || !(zarMinor > 0) || !(mznMinor > 0)) continue

    const userRef = db.collection('users').doc(userId)
    const earningsRef = userRef.collection('wallets').doc('earnings')
    const mznRef = userRef.collection('wallets').doc('cashMZN')

    // Planned desk must not mutate live wallets / earnings — checkpoint rewind is incomplete.
    let plannedDesk = false
    let planRunId: string | null =
      typeof tx.planRunId === 'string' && tx.planRunId ? tx.planRunId : null
    try {
      const currentSnap = await db.collection('adminConversionCurrent').doc(userId).get()
      const testRunId = currentSnap.data()?.testRunId
      if (typeof testRunId === 'string' && testRunId) {
        const testSnap = await db.collection('adminConversionTests').doc(testRunId).get()
        const testData = testSnap.data() || {}
        plannedDesk = testData.deskMode === 'planned'
        if (!planRunId && typeof testData.planRunId === 'string') planRunId = testData.planRunId
      }
    } catch {
      /* treat as live if mode lookup fails */
    }

    const simulatedLot = tx.simulated === true || plannedDesk
    const suppressDesk =
      tx.suppressDeskActivity === true || simulatedLot

    try {
      await db.runTransaction(async (t) => {
        const fresh = await t.get(doc.ref)
        if (!fresh.exists || fresh.data()?.status !== 'EN_ROUTE') return

        const bookingEventRef = userRef.collection('activityEvents').doc(doc.id)
        const bookingSnap = await t.get(bookingEventRef)
        const bookingData = bookingSnap.exists ? bookingSnap.data() || {} : null
        // One clear per booking id — never write a sibling clear-* event.
        if (bookingData?.kind === 'EN_ROUTE_CLEARED' || fresh.data()?.status === 'SETTLED') {
          if (fresh.data()?.status === 'EN_ROUTE') {
            t.update(doc.ref, {
              status: 'SETTLED',
              instructionStatus: 'SETTLED',
              actualDestinationAmountMinor: mznMinor,
              statusUpdatedAt: now,
              updatedAt: now,
              settledAt: now,
            })
          }
          return
        }

        // Simulated lots: mark settled without touching live wallets.
        if (simulatedLot) {
          t.update(doc.ref, {
            status: 'SETTLED',
            instructionStatus: 'SETTLED',
            actualDestinationAmountMinor: mznMinor,
            statusUpdatedAt: now,
            updatedAt: now,
            settledAt: now,
            simulated: true,
            ...(planRunId ? { planRunId } : {}),
          })
          if (bookingSnap.exists && !suppressDesk) {
            t.update(bookingEventRef, {
              kind: 'EN_ROUTE_CLEARED',
              title: 'ZAR cleared',
              deskStatusChip: 'Cleared',
              body: `${(mznMinor / 100).toFixed(2)} MZN @ ${Number(fresh.data()?.sellRateMZNperZAR || 0).toFixed(4)}`,
              status: 'recorded',
              routingAction: 'en_route_clear',
              simulated: true,
              ...(planRunId ? { planRunId } : {}),
              updatedAt: now,
              clearedAt: now,
            })
          }
          return
        }

        const earningsSnap = await t.get(earningsRef)
        const mznSnap = await t.get(mznRef)
        const earningsData = earningsSnap.exists ? earningsSnap.data()! : { fiatBalance: 0 }
        const mznData = mznSnap.exists ? mznSnap.data()! : { fiatBalance: 0 }
        const earningsMinor = Math.round(Number(earningsData.fiatBalance || 0) * 100)
        const debit = Math.min(earningsMinor, zarMinor)
        if (!(debit > 0)) {
          t.update(doc.ref, { status: 'EN_ROUTE_VOID', statusUpdatedAt: now, updatedAt: now })
          return
        }

        t.update(earningsRef, {
          fiatBalance: (earningsMinor - debit) / 100,
          updatedAt: now,
        })

        const mznNext =
          (Math.round(Number(mznData.fiatBalance || 0) * 100) + mznMinor) / 100
        if (!mznSnap.exists) {
          t.set(mznRef, {
            walletId: 'cashMZN',
            kind: 'cash',
            displayCurrency: 'MZN',
            fiatBalance: mznNext,
            usdtBalance: 0,
            updatedAt: now,
          })
        } else {
          t.update(mznRef, { fiatBalance: mznNext, updatedAt: now })
        }

        t.update(doc.ref, {
          status: 'SETTLED',
          instructionStatus: 'SETTLED',
          actualDestinationAmountMinor: mznMinor,
          statusUpdatedAt: now,
          updatedAt: now,
          settledAt: now,
        })

        // Live: update the booking bubble in place (same id as the conversion tx).
        if (!suppressDesk && fresh.data()?.suppressDeskActivity !== true) {
          const sellRate = Number(fresh.data()?.sellRateMZNperZAR || 0)
          const clearFields = {
            kind: 'EN_ROUTE_CLEARED',
            title: 'ZAR cleared',
            deskStatusChip: 'Cleared',
            body: `${(mznMinor / 100).toFixed(2)} MZN @ ${sellRate.toFixed(4)}`,
            actorType: 'ai_manager',
            avatarKind: 'convert_mzn',
            amountCurrency: 'ZAR',
            amountValue: debit / 100,
            amountSign: 'debit' as const,
            pairedAmountValue: mznMinor / 100,
            txId: doc.id,
            hasDownloadButton: false,
            status: 'recorded',
            routingAction: 'en_route_clear',
            deskSpeaker: 'amina',
            updatedAt: now,
            clearedAt: now,
            recordingSource: 'SYSTEM',
          }
          if (bookingSnap.exists) {
            t.update(bookingEventRef, clearFields)
          } else {
            t.set(bookingEventRef, {
              id: doc.id,
              ...clearFields,
              createdAt: now,
            })
          }
        }
      })

      // Refresh nextSettleAt from remaining open lots.
      const remaining = await db
        .collection('transactions')
        .where('userId', '==', userId)
        .where('status', '==', 'EN_ROUTE')
        .limit(50)
        .get()
      let nextMs: number | null = null
      for (const row of remaining.docs) {
        const at = row.data()?.settleAt?.toMillis?.() ?? null
        if (typeof at === 'number' && at > 0) {
          nextMs = nextMs == null ? at : Math.min(nextMs, at)
        }
      }
      await earningsRef.set(
        {
          nextSettleAt: nextMs != null ? admin.firestore.Timestamp.fromMillis(nextMs) : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      settled += 1
    } catch (error) {
      console.error('[settleDueEnRouteLots] lot failed', {
        txId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return settled
}

export const tx_settleEnRouteSweep = functions
  .region('us-central1')
  .pubsub.schedule('every 5 minutes')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    const n = await settleDueEnRouteLots(40)
    console.log(`[tx_settleEnRouteSweep] settled ${n} en-route lot(s)`)
    return null
  })
