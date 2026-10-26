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
        body: `R${sourceAmountMajor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} booked at SELL ${params.sellRate.toFixed(4)} MZN/ZAR · clears ~${settleLabel} SAST next window`,
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
        deskSpeaker: 'wallet',
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

    try {
      await db.runTransaction(async (t) => {
        const fresh = await t.get(doc.ref)
        if (!fresh.exists || fresh.data()?.status !== 'EN_ROUTE') return

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

        const clearId = `clear-${doc.id}`
        t.set(userRef.collection('activityEvents').doc(clearId), {
          id: clearId,
          kind: 'EN_ROUTE_CLEARED',
          title: 'ZAR cleared',
          body: `R${(debit / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${(mznMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MZN on the Moz card`,
          actorType: 'ai_manager',
          avatarKind: 'convert_mzn',
          amountCurrency: 'MZN',
          amountValue: mznMinor / 100,
          amountSign: 'credit',
          pairedAmountValue: debit / 100,
          txId: doc.id,
          hasDownloadButton: false,
          status: 'recorded',
          routingAction: 'en_route_clear',
          deskSpeaker: 'wallet',
          createdAt: now,
          recordingSource: 'SYSTEM',
        })
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
