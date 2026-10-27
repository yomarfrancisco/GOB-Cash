/**
 * Cloud Function: tx_createInternalConversion
 *
 * ZAR→MZN sales book onto EN ROUTE (earnings) until the next 09:00 SAST clear,
 * then cashMZN rises. MZN→ZAR restocks still credit cashZAR immediately at COST.
 * Admin `$` capitalShock still opens/resizes the desk window and, for ZAR sales,
 * also books EN ROUTE.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  fetchQuotedMznPerZar,
  mznRewardsFromZar,
  MZN_ZAR_MARKUP,
  MZN_ZAR_MARKUP_RECEIVE_MZN,
} from '../fx/quotedMznZar'
import { normalizeHandle } from '../utils/handleNormalization'
import { sendAgentConversionProofEmail } from './sendConversionProofEmail'

const db = admin.firestore()

function roundMajor(value: number): number {
  return Math.round(value * 100) / 100
}

function displayUserHandle(raw?: string | null, fallbackSlug = ''): string {
  const fromUser = (raw || '').trim()
  if (fromUser) {
    const slug = fromUser.replace(/^[@$]+/, '')
    return slug ? `@${slug}` : ''
  }
  const slug = fallbackSlug.replace(/^[@$]+/, '')
  return slug ? `@${slug}` : ''
}

/** Named client only when the payment-link handle is a different existing user. */
async function resolveNamedClient(
  rawHandle: unknown,
  payerUid: string
): Promise<{ handle: string; userId: string } | null> {
  if (typeof rawHandle !== 'string') return null
  const slug = rawHandle.trim().replace(/^[@$]+/, '').toLowerCase()
  if (!slug) return null

  const candidates = Array.from(
    new Set([normalizeHandle(slug), `$${slug}`, slug].filter(Boolean) as string[])
  )

  for (const id of candidates) {
    const snap = await db.collection('publicDirectory').doc(id).get()
    if (!snap.exists) continue
    const ownerUserId = snap.data()?.ownerUserId
    if (typeof ownerUserId !== 'string' || !ownerUserId || ownerUserId === payerUid) {
      return null
    }
    const userSnap = await db.collection('users').doc(ownerUserId).get()
    const userData = userSnap.exists ? userSnap.data() : undefined
    const handle = displayUserHandle(userData?.userHandle || userData?.handle, slug)
    return handle ? { handle, userId: ownerUserId } : null
  }
  return null
}

export const tx_createInternalConversion = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const sourceCurrency = data?.sourceCurrency === 'ZAR' ? 'ZAR' : data?.sourceCurrency === 'MZN' ? 'MZN' : null
    const destinationCurrency =
      data?.destinationCurrency === 'ZAR' ? 'ZAR' : data?.destinationCurrency === 'MZN' ? 'MZN' : null
    const sourceAmount = Number(data?.sourceAmount)

    if (!sourceCurrency || !destinationCurrency || sourceCurrency === destinationCurrency) {
      throw new functions.https.HttpsError('invalid-argument', 'sourceCurrency and destinationCurrency must be MZN and ZAR')
    }
    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'sourceAmount must be a positive number')
    }

    const isZarSale = sourceCurrency === 'ZAR' && destinationCurrency === 'MZN'

    const { ROUTING_ADMIN_UID } = await import('../routing/conversionRouter')
    const isRoutingAdmin = userId === ROUTING_ADMIN_UID

    const namedClient = await resolveNamedClient(data?.agentCashHandle, userId)
    const sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
    const costRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)

    // `$` on the admin desk sets window capital. ZAR sales also book EN ROUTE.
    if (isRoutingAdmin && data?.capitalShock === true) {
      const { applyAdminCapitalShock } = await import('./adminConversionRouting')
      let shockZar: number
      let shockMzn: number
      let bookedTxId: string | null = null
      if (isZarSale) {
        shockZar = roundMajor(sourceAmount)
        shockMzn = 0
        const { bookZarSaleToEnRoute } = await import('./enRouteSettle')
        const rewardsMznMajor = mznRewardsFromZar(shockZar, sellRate, costRate)
        const booked = await bookZarSaleToEnRoute({
          userId,
          sourceAmountZar: shockZar,
          sellRate,
          costRate,
          rewardsMznMinor: Math.round(rewardsMznMajor * 100),
          namedClient,
          suppressDeskActivity: data?.suppressDeskActivity === true,
        })
        bookedTxId = booked.txId
      } else {
        shockZar = roundMajor(sourceAmount / costRate)
        shockMzn = roundMajor(sourceAmount)
      }
      await applyAdminCapitalShock({
        adminUid: userId,
        kind: isZarSale ? 'sell_zar' : 'add_zar',
        amountZar: shockZar,
        amountMzn: shockMzn,
      })
      return {
        txId: bookedTxId || `shock-${Date.now()}`,
        capitalShock: true,
        amountZar: shockZar,
        enRoute: isZarSale,
      }
    }

    // A desk play must be the current step and must match the ticket total before
    // anything is recorded. Restocks are anchored on the ZAR tickets, not on MZN
    // at a rate that may have moved since the card was printed.
    let anchoredZar: number | null = null
    let anchoredMzn: number | null = null
    if (isRoutingAdmin && data?.routingPlay) {
      const { assertRoutingPlayMatches, parseRoutingPlay } = await import('./adminConversionRouting')
      const play = parseRoutingPlay(data.routingPlay)
      if (play) {
        const destinationAmount = Number(data?.destinationAmount)
        const enteredZar = isZarSale
          ? roundMajor(sourceAmount)
          : Number.isFinite(destinationAmount) && destinationAmount > 0
            ? roundMajor(destinationAmount)
            : roundMajor(sourceAmount / costRate)
        const matched = await assertRoutingPlayMatches(
          userId,
          play,
          enteredZar,
          isZarSale ? undefined : sourceAmount
        )
        anchoredZar = matched.expectedZar
        anchoredMzn = matched.expectedMzn
      }
    }

    // Restock uses the bank-weighted ticket MZN (Σ ZAR × bank COST), not a single mid×1.05 reprice.
    const sourceAmountMajor =
      anchoredZar != null && sourceCurrency === 'MZN'
        ? anchoredMzn != null && anchoredMzn > 0
          ? roundMajor(anchoredMzn)
          : roundMajor(anchoredZar * costRate)
        : roundMajor(sourceAmount)
    const sourceAmountMinor = Math.round(sourceAmountMajor * 100)
    const settlementMajor =
      sourceCurrency === 'MZN'
        ? anchoredZar != null
          ? anchoredZar
          : roundMajor(sourceAmountMajor / costRate)
        : roundMajor(sourceAmountMajor * costRate)
    const reportedDestMajor = isZarSale
      ? roundMajor(sourceAmountMajor * sellRate)
      : settlementMajor
    const restockBlendedCost =
      !isZarSale && anchoredZar != null && anchoredZar > 0
        ? roundMajor(sourceAmountMajor / anchoredZar)
        : costRate
    const fxRateMZNperZAR = isZarSale ? sellRate : restockBlendedCost
    const expectedDestinationMajor = isZarSale ? reportedDestMajor : settlementMajor
    const expectedDestinationMinor = Math.round(expectedDestinationMajor * 100)
    const rewardsMznMajor = isZarSale
      ? mznRewardsFromZar(sourceAmountMajor, sellRate, costRate)
      : 0
    const rewardsMznMinor = Math.round(rewardsMznMajor * 100)
    const suppressDesk =
      data?.suppressDeskActivity === true || Boolean(data?.routingPlay)

    // ZAR sales book EN ROUTE until next 09:00 SAST; restocks credit cashZAR now.
    if (isZarSale) {
      const { bookZarSaleToEnRoute } = await import('./enRouteSettle')
      // Desk Send already has Step 4 — still post Part 2 "ZAR booked" (not CONVERSION_INSTRUCTED).
      let plannedMeta: { simulated?: true; planRunId?: string } = {}
      let expectedDestinationMzn: number | undefined
      if (data?.routingPlay) {
        try {
          const currentSnap = await db.collection('adminConversionCurrent').doc(userId).get()
          const testRunId = currentSnap.data()?.testRunId
          if (typeof testRunId === 'string' && testRunId) {
            const testSnap = await db.collection('adminConversionTests').doc(testRunId).get()
            const td = testSnap.data() || {}
            if (td.deskMode === 'planned') {
              plannedMeta = {
                simulated: true,
                ...(typeof td.planRunId === 'string' && td.planRunId
                  ? { planRunId: td.planRunId }
                  : {}),
              }
            }
            const { parseOrderLedger, sellMznForZar } = await import('../routing/orderLedger')
            const ledger = parseOrderLedger(td.orderLedger)
            if (ledger && ledger.sellRate > 0) {
              // Prefer stamped mznAtSell when ZAR matches the day order; else same formula.
              expectedDestinationMzn =
                Math.abs(ledger.zar - sourceAmountMajor) < 0.05 && ledger.mznAtSell > 0
                  ? ledger.mznAtSell
                  : sellMznForZar(sourceAmountMajor, ledger.sellRate)
            }
          }
        } catch {
          /* treat as live */
        }
      }
      const booked = await bookZarSaleToEnRoute({
        userId,
        sourceAmountZar: sourceAmountMajor,
        sellRate,
        costRate,
        rewardsMznMinor,
        namedClient,
        groupId: typeof data?.groupId === 'string' && data.groupId.trim() ? data.groupId.trim() : undefined,
        suppressDeskActivity: data?.routingPlay ? false : suppressDesk,
        simulated: plannedMeta.simulated === true,
        planRunId: plannedMeta.planRunId,
        settleImmediately: plannedMeta.simulated === true,
        expectedDestinationMzn,
      })
      try {
        await sendAgentConversionProofEmail(booked.txId)
      } catch (error) {
        console.error('[tx_createInternalConversion] Agent proof email failed (non-blocking)', {
          txId: booked.txId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return { txId: booked.txId, enRoute: true, settleAtMs: booked.settleAtMs }
    }

    const sourceWalletRef = db.collection('users').doc(userId).collection('wallets').doc('cashMZN')
    const destinationWalletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id
    const now = admin.firestore.Timestamp.now()
    const groupId = typeof data?.groupId === 'string' && data.groupId.trim() ? data.groupId.trim() : txId
    const sourceLabel = `Mt ${sourceAmountMajor.toFixed(2)}`
    const destLabel = `R${settlementMajor.toFixed(2)}`

    await db.runTransaction(async (t) => {
      const sourceSnap = await t.get(sourceWalletRef)
      const destSnap = await t.get(destinationWalletRef)
      const sourceData = sourceSnap.exists ? sourceSnap.data()! : { fiatBalance: 0 }
      const destData = destSnap.exists ? destSnap.data()! : { fiatBalance: 0 }
      const availableMinor = Math.round(Number(sourceData.fiatBalance || 0) * 100)

      if (!sourceSnap.exists || sourceAmountMinor > availableMinor) {
        throw new functions.https.HttpsError('failed-precondition', 'Insufficient MZN balance.')
      }

      t.update(sourceWalletRef, {
        fiatBalance: (availableMinor - sourceAmountMinor) / 100,
        updatedAt: now,
      })
      if (!destSnap.exists) {
        t.set(destinationWalletRef, {
          walletId: 'cashZAR',
          kind: 'cash',
          displayCurrency: 'ZAR',
          fiatBalance: expectedDestinationMinor / 100,
          usdtBalance: 0,
          updatedAt: now,
        })
      } else {
        t.update(destinationWalletRef, {
          fiatBalance: (Math.round(Number(destData.fiatBalance || 0) * 100) + expectedDestinationMinor) / 100,
          updatedAt: now,
        })
      }

      t.set(txRef, {
        id: txId,
        userId,
        type: 'CONVERSION',
        transactionType: 'CONVERSION',
        uiAction: 'PAY',
        instructionSource: 'USER_INSTRUCTED',
        recordingSource: 'USER_UI',
        executionChannel: 'INTERNAL',
        status: 'INITIATED',
        instructionStatus: 'INITIATED',
        sourceCurrency,
        destinationCurrency,
        currency: sourceCurrency,
        sourceAmountMinor,
        expectedDestinationAmountMinor: expectedDestinationMinor,
        actualDestinationAmountMinor: null,
        quotedRate: fxRateMZNperZAR,
        buyRateMZNperZAR: restockBlendedCost,
        costRateMZNperZAR: restockBlendedCost,
        sellRateMZNperZAR: sellRate,
        rewardsMznMinor: null,
        clientDestinationAmountMinor: Math.round(reportedDestMajor * 100),
        amountMzn: sourceAmountMajor,
        amountZar: expectedDestinationMajor,
        fxRateMZNperZAR,
        counterpartyHandle: namedClient?.handle || null,
        counterpartyUserId: namedClient?.userId || null,
        groupId,
        createdAt: now,
        statusUpdatedAt: now,
        updatedAt: now,
      })

      if (!suppressDesk) {
        t.set(db.collection('users').doc(userId).collection('activityEvents').doc(txId), {
          id: txId,
          kind: 'CONVERSION_INSTRUCTED',
          title: 'ZAR sourced at COST',
          body: `${sourceLabel} to ${destLabel} · COST ${costRate.toFixed(2)} Mt/R`,
          actorType: 'ai_manager',
          avatarKind: 'convert_mzn',
          amountCurrency: sourceCurrency,
          amountValue: sourceAmountMajor,
          amountSign: 'debit',
          txId,
          hasDownloadButton: true,
          createdAt: now,
          recordingSource: 'USER_UI',
        })
      }
    })

    try {
      await sendAgentConversionProofEmail(txId)
    } catch (error) {
      console.error('[tx_createInternalConversion] Agent proof email failed (non-blocking)', {
        txId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return { txId }
  })
