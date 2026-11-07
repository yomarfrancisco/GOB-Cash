/**
 * Instant reserve payouts + FCFS early-clear of EN_ROUTE when reserve is topped up.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import {
  allocateAndDebitReserve,
  getOrInitReserve,
  roundMajor,
  splitDestAgainstReserve,
  type ReserveCurrency,
} from './reserveBooks'

export type { ReserveCurrency }
import { reserveSplitDeskCopy } from './reserveDeskCopy'
import { CONVERSION_ROUTING_KIND } from '../routing/conversionRouter'

const db = admin.firestore()

export type ReserveSplitPlan = {
  destCurrency: ReserveCurrency
  wantDest: number
  totalSource: number
  instantDest: number
  routedDest: number
  instantSource: number
  routedSource: number
  reserveAvailable: number
}

/** Peek + plan a split without mutating (caller debits inside its own txn). */
export async function planReserveSplit(params: {
  destCurrency: ReserveCurrency
  wantDest: number
  totalSource: number
}): Promise<ReserveSplitPlan> {
  const book = await getOrInitReserve(params.destCurrency)
  const parts = splitDestAgainstReserve({
    wantDest: params.wantDest,
    reserveAvailable: book.fiatBalance,
    totalSource: params.totalSource,
  })
  return {
    destCurrency: params.destCurrency,
    wantDest: roundMajor(params.wantDest),
    totalSource: roundMajor(params.totalSource),
    reserveAvailable: book.fiatBalance,
    ...parts,
  }
}

export type InstantReservePayoutParams = {
  userId: string
  sourceCurrency: ReserveCurrency
  destCurrency: ReserveCurrency
  sourceMajor: number
  destMajor: number
  /** FX rate MZN per ZAR used on the ticket. */
  fxRateMZNperZar: number
  costRate: number
  sellRate: number
  groupId: string
  namedClient?: { handle: string; userId: string } | null
  suppressDeskActivity?: boolean
  /** Skip daily liquid accrual (first-payout hold branch). */
  skipLiquidAccrue?: boolean
  /** Mark cashZAR as held until SA details + PoP. */
  setFirstPayoutHold?: boolean
}

export type InstantReservePayoutResult = {
  txId: string
  destMajor: number
  sourceMajor: number
}

/**
 * Debit user source wallet, debit destination reserve, credit user dest wallet.
 * Marks tx SETTLED with settlementPath reserve_instant.
 */
export async function payInstantFromReserve(
  params: InstantReservePayoutParams
): Promise<InstantReservePayoutResult> {
  const sourceMajor = roundMajor(params.sourceMajor)
  const destMajor = roundMajor(params.destMajor)
  const sourceMinor = Math.round(sourceMajor * 100)
  const destMinor = Math.round(destMajor * 100)
  if (!(sourceMinor > 0) || !(destMinor > 0)) {
    throw new functions.https.HttpsError('invalid-argument', 'instant reserve amounts must be positive')
  }

  const userRef = db.collection('users').doc(params.userId)
  const sourceWalletId = params.sourceCurrency === 'ZAR' ? 'cashZAR' : 'cashMZN'
  const destWalletId = params.destCurrency === 'ZAR' ? 'cashZAR' : 'cashMZN'
  const sourceRef = userRef.collection('wallets').doc(sourceWalletId)
  const destRef = userRef.collection('wallets').doc(destWalletId)
  const txRef = db.collection('transactions').doc()
  const txId = txRef.id
  const now = admin.firestore.Timestamp.now()

  await db.runTransaction(async (t) => {
    const sourceSnap = await t.get(sourceRef)
    const destSnap = await t.get(destRef)
    const sourceData = sourceSnap.exists ? sourceSnap.data()! : { fiatBalance: 0 }
    const destData = destSnap.exists ? destSnap.data()! : { fiatBalance: 0 }
    const availableMinor = Math.round(Number(sourceData.fiatBalance || 0) * 100)
    if (!sourceSnap.exists || sourceMinor > availableMinor) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient ${params.sourceCurrency} balance.`
      )
    }

    const funded = await allocateAndDebitReserve(t, params.destCurrency, destMajor)
    if (Math.round(funded * 100) < destMinor) {
      throw new functions.https.HttpsError(
        'aborted',
        'Reserve drained concurrently — retry conversion.'
      )
    }

    t.update(sourceRef, {
      fiatBalance: (availableMinor - sourceMinor) / 100,
      updatedAt: now,
    })

    const destNext = (Math.round(Number(destData.fiatBalance || 0) * 100) + destMinor) / 100
    const holdPatch =
      params.setFirstPayoutHold && params.destCurrency === 'ZAR'
        ? {
            firstPayoutHold: true,
            firstPayoutStatus: 'awaiting_details',
            firstPayoutHoldZar: destNext,
          }
        : {}
    if (!destSnap.exists) {
      t.set(destRef, {
        walletId: destWalletId,
        kind: 'cash',
        displayCurrency: params.destCurrency,
        fiatBalance: destNext,
        usdtBalance: 0,
        updatedAt: now,
        ...holdPatch,
      })
    } else {
      t.update(destRef, { fiatBalance: destNext, updatedAt: now, ...holdPatch })
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
      status: 'SETTLED',
      instructionStatus: 'SETTLED',
      settlementPath: 'reserve_instant',
      sourceCurrency: params.sourceCurrency,
      destinationCurrency: params.destCurrency,
      currency: params.sourceCurrency,
      sourceAmountMinor: sourceMinor,
      expectedDestinationAmountMinor: destMinor,
      actualDestinationAmountMinor: destMinor,
      quotedRate: params.fxRateMZNperZar,
      buyRateMZNperZAR: params.costRate,
      costRateMZNperZAR: params.costRate,
      sellRateMZNperZAR: params.sellRate,
      amountMzn: params.sourceCurrency === 'MZN' ? sourceMajor : destMajor,
      amountZar: params.sourceCurrency === 'ZAR' ? sourceMajor : destMajor,
      fxRateMZNperZAR: params.fxRateMZNperZar,
      counterpartyHandle: params.namedClient?.handle || null,
      counterpartyUserId: params.namedClient?.userId || null,
      groupId: params.groupId,
      settledAt: now,
      createdAt: now,
      statusUpdatedAt: now,
      updatedAt: now,
    })
  })

  // Instant ZAR from reserve is liquid now — counts toward the daily bank payout,
  // unless this is a first-payout hold (awaiting SA details + PoP).
  if (params.destCurrency === 'ZAR' && destMajor > 0 && !params.skipLiquidAccrue) {
    try {
      const { accrueLiquidZar } = await import('./liquidZarCycle')
      await accrueLiquidZar({ userId: params.userId, amountMajor: destMajor })
    } catch (error) {
      console.warn('[payInstantFromReserve] liquid accrue skipped', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { txId, destMajor, sourceMajor }
}

export async function publishReserveSplitNotice(params: {
  userId: string
  groupId: string
  destCurrency: ReserveCurrency
  fundedDest: number
  instantDest: number
  routedDest: number
  settleAtMs?: number | null
  suppressDeskActivity?: boolean
}): Promise<void> {
  if (params.suppressDeskActivity) return
  if (!(params.instantDest > 0) && !(params.routedDest > 0)) return

  const copy = reserveSplitDeskCopy({
    destCurrency: params.destCurrency,
    fundedDest: params.fundedDest,
    instantDest: params.instantDest,
    routedDest: params.routedDest,
    settleAtMs: params.settleAtMs,
  })
  const id = `reserve-split-${params.groupId}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const ref = db.collection('users').doc(params.userId).collection('activityEvents').doc(id)
  if ((await ref.get()).exists) return

  const now = admin.firestore.FieldValue.serverTimestamp()
  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: copy.title,
    body: copy.body,
    deskSentence: copy.deskSentence,
    dropdownTitle: copy.dropdownTitle,
    dropdownBody: copy.dropdownBody,
    deskLedgerRows: copy.deskLedgerRows,
    deskStep: copy.deskStep,
    deskStatusChip: params.instantDest > 0 && params.routedDest > 0 ? 'Split' : params.instantDest > 0 ? 'Paid' : 'Booked',
    actorType: 'ai_manager',
    avatarKind: params.destCurrency === 'ZAR' ? 'convert_zar' : 'convert_mzn',
    amountCurrency: params.destCurrency,
    amountValue: params.fundedDest,
    amountSign: 'credit',
    txId: id,
    groupId: params.groupId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'reserve_split',
    deskSpeaker: params.destCurrency === 'ZAR' ? 'leo' : 'amina',
    createdAt: now,
    recordingSource: 'SYSTEM',
  })
}

/**
 * When reserve is topped up, early-clear oldest EN_ROUTE lots whose destination
 * matches the funded currency (FCFS across users).
 */
export async function drainEnRouteQueueFromReserve(
  currency: ReserveCurrency,
  limit = 20
): Promise<number> {
  const book = await getOrInitReserve(currency)
  let available = book.fiatBalance
  if (!(available > 0)) return 0

  // Oldest open lots landing in this currency.
  const snap = await db
    .collection('transactions')
    .where('status', '==', 'EN_ROUTE')
    .where('destinationCurrency', '==', currency)
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get()

  let cleared = 0
  for (const doc of snap.docs) {
    if (!(available > 0)) break
    const tx = doc.data()
    if (tx.simulated === true) continue
    const destMinor = Math.round(Number(tx.expectedDestinationAmountMinor || 0))
    const sourceMinor = Math.round(Number(tx.sourceAmountMinor || 0))
    if (!(destMinor > 0)) continue
    const need = destMinor / 100
    if (need > available + 0.001) continue

    const userId = String(tx.userId || '')
    if (!userId) continue
    const clearsToZar = currency === 'ZAR'
    const earningsDebitMinor = clearsToZar ? destMinor : sourceMinor
    if (!(earningsDebitMinor > 0)) continue

    const userRef = db.collection('users').doc(userId)
    const earningsRef = userRef.collection('wallets').doc('earnings')
    const landRef = userRef.collection('wallets').doc(clearsToZar ? 'cashZAR' : 'cashMZN')
    const now = admin.firestore.Timestamp.now()

    const ok = await db.runTransaction(async (t) => {
      const fresh = await t.get(doc.ref)
      if (!fresh.exists || fresh.data()?.status !== 'EN_ROUTE') return false
      const reserveSnap = await t.get(
        db.collection('treasury').doc(currency === 'ZAR' ? 'zarReserve' : 'mznReserve')
      )
      const reserveBal = roundMajor(Number(reserveSnap.data()?.fiatBalance || 0))
      if (reserveBal + 0.001 < need) return false

      const earningsSnap = await t.get(earningsRef)
      const landSnap = await t.get(landRef)
      const earningsMinor = Math.round(Number(earningsSnap.data()?.fiatBalance || 0) * 100)
      if (earningsMinor < earningsDebitMinor) return false

      const funded = await allocateAndDebitReserve(t, currency, need)
      if (Math.round(funded * 100) < destMinor) return false

      t.update(earningsRef, {
        fiatBalance: (earningsMinor - earningsDebitMinor) / 100,
        updatedAt: now,
      })
      const landData = landSnap.exists ? landSnap.data()! : { fiatBalance: 0 }
      const landNext = (Math.round(Number(landData.fiatBalance || 0) * 100) + destMinor) / 100
      if (!landSnap.exists) {
        t.set(landRef, {
          walletId: clearsToZar ? 'cashZAR' : 'cashMZN',
          kind: 'cash',
          displayCurrency: currency,
          fiatBalance: landNext,
          usdtBalance: 0,
          updatedAt: now,
        })
      } else {
        t.update(landRef, { fiatBalance: landNext, updatedAt: now })
      }
      t.update(doc.ref, {
        status: 'SETTLED',
        instructionStatus: 'SETTLED',
        actualDestinationAmountMinor: destMinor,
        settlementPath: 'reserve_early_clear',
        statusUpdatedAt: now,
        updatedAt: now,
        settledAt: now,
      })
      return true
    })

    if (ok) {
      cleared += 1
      available = roundMajor(available - need)
      if (clearsToZar) {
        try {
          const { accrueLiquidZar } = await import('./liquidZarCycle')
          await accrueLiquidZar({ userId, amountMajor: need })
        } catch (error) {
          console.warn('[drainEnRouteQueueFromReserve] liquid accrue skipped', {
            txId: doc.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }
  return cleared
}
