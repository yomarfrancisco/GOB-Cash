/**
 * Cloud Function: tx_createInternalConversion
 *
 * Live conversions draw a shared ZAR/MZN treasury reserve FCFS for an instant
 * leg; any remainder books EN ROUTE until the next 09:00 SAST clear.
 * `$` capital shocks still book full EN ROUTE (buy-desk narrative).
 * Planned desk skips reserve (deterministic).
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

    // `$` keypad capital shock: shared reserve pays instant FCFS; remainder EN_ROUTE.
    // Desk window re-solve stays admin-only on sell-side.
    if (data?.capitalShock === true) {
      const { bookZarSaleToEnRoute, bookMznSaleToEnRoute } = await import('./enRouteSettle')
      const {
        planReserveSplit,
        payInstantFromReserve,
        publishReserveSplitNotice,
      } = await import('../treasury/reserveConvert')
      const groupId = db.collection('transactions').doc().id

      if (isZarSale) {
        const shockZar = roundMajor(sourceAmount)
        const wantMzn = roundMajor(shockZar * sellRate)
        const split = await planReserveSplit({
          destCurrency: 'MZN',
          wantDest: wantMzn,
          totalSource: shockZar,
        })
        let instantTxId: string | null = null
        let routedTxId: string | null = null
        let settleAtMs: number | null = null

        if (split.instantDest > 0 && split.instantSource > 0) {
          const instant = await payInstantFromReserve({
            userId,
            sourceCurrency: 'ZAR',
            destCurrency: 'MZN',
            sourceMajor: split.instantSource,
            destMajor: split.instantDest,
            fxRateMZNperZar: sellRate,
            costRate,
            sellRate,
            groupId,
            namedClient,
          })
          instantTxId = instant.txId
        }
        if (split.routedSource > 0) {
          const rewardsMznMajor = mznRewardsFromZar(split.routedSource, sellRate, costRate)
          const booked = await bookZarSaleToEnRoute({
            userId,
            sourceAmountZar: split.routedSource,
            sellRate,
            costRate,
            rewardsMznMinor: Math.round(rewardsMznMajor * 100),
            namedClient,
            groupId,
            suppressDeskActivity: true,
            expectedDestinationMzn: split.routedDest > 0 ? split.routedDest : undefined,
          })
          routedTxId = booked.txId
          settleAtMs = booked.settleAtMs
        }
        await publishReserveSplitNotice({
          userId,
          groupId,
          destCurrency: 'MZN',
          fundedDest: wantMzn,
          instantDest: split.instantDest,
          routedDest: split.routedDest,
          settleAtMs,
        })
        if (isRoutingAdmin) {
          const { applyAdminCapitalShock } = await import('./adminConversionRouting')
          await applyAdminCapitalShock({
            adminUid: userId,
            kind: 'sell_zar',
            amountZar: shockZar,
            amountMzn: wantMzn,
          })
        }
        return {
          txId: routedTxId || instantTxId || groupId,
          groupId,
          capitalShock: true,
          amountZar: shockZar,
          enRoute: split.routedDest > 0,
          settleAtMs,
          reserveInstantMzn: split.instantDest,
          reserveRoutedMzn: split.routedDest,
        }
      }

      // Buy ZAR: pink keypad Mt → draw ZAR reserve, remainder on ROUTE.
      const shockMzn = roundMajor(sourceAmount)
      const wantZar = roundMajor(shockMzn / costRate)
      const split = await planReserveSplit({
        destCurrency: 'ZAR',
        wantDest: wantZar,
        totalSource: shockMzn,
      })
      let instantTxId: string | null = null
      let routedTxId: string | null = null
      let settleAtMs: number | null = null
      let shockZar = wantZar

      if (split.instantDest > 0 && split.instantSource > 0) {
        const instant = await payInstantFromReserve({
          userId,
          sourceCurrency: 'MZN',
          destCurrency: 'ZAR',
          sourceMajor: split.instantSource,
          destMajor: split.instantDest,
          fxRateMZNperZar: costRate,
          costRate,
          sellRate,
          groupId,
          namedClient,
        })
        instantTxId = instant.txId
      }
      if (split.routedSource > 0) {
        const booked = await bookMznSaleToEnRoute({
          userId,
          sourceAmountMzn: split.routedSource,
          sellRate,
          costRate,
          expectedDestinationZar: split.routedDest,
          namedClient,
          groupId,
          suppressDeskActivity: true,
        })
        routedTxId = booked.txId
        settleAtMs = booked.settleAtMs
        shockZar = roundMajor(split.instantDest + booked.expectedZar)
        try {
          const { seedBuyZarDeskDay } = await import('./buyZarDeskDay')
          await seedBuyZarDeskDay({
            userId,
            txId: booked.txId,
            amountMzn: split.routedSource,
            amountZar: split.routedDest,
            costRate,
            sellRate,
            settleAtMs: booked.settleAtMs,
          })
        } catch (error) {
          console.warn('[createInternalConversion] buy desk day seed failed', error)
        }
      }
      await publishReserveSplitNotice({
        userId,
        groupId,
        destCurrency: 'ZAR',
        fundedDest: wantZar,
        instantDest: split.instantDest,
        routedDest: split.routedDest,
        settleAtMs,
      })
      return {
        txId: routedTxId || instantTxId || groupId,
        groupId,
        capitalShock: true,
        amountZar: shockZar,
        enRoute: split.routedDest > 0,
        settleAtMs,
        reserveInstantZar: split.instantDest,
        reserveRoutedZar: split.routedDest,
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

    // Planned desk stays full EN_ROUTE (deterministic). Live uses shared reserve FCFS.
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
          if (isZarSale) {
            const { parseOrderLedger, sellMznForZar } = await import('../routing/orderLedger')
            const ledger = parseOrderLedger(td.orderLedger)
            if (ledger && ledger.sellRate > 0) {
              expectedDestinationMzn =
                Math.abs(ledger.zar - sourceAmountMajor) < 0.05 && ledger.mznAtSell > 0
                  ? ledger.mznAtSell
                  : sellMznForZar(sourceAmountMajor, ledger.sellRate)
            }
          }
        }
      } catch {
        /* treat as live */
      }
    }

    const skipReserve = plannedMeta.simulated === true
    const groupId =
      typeof data?.groupId === 'string' && data.groupId.trim()
        ? data.groupId.trim()
        : db.collection('transactions').doc().id
    const deskSuppress = data?.routingPlay ? false : suppressDesk

    const { bookZarSaleToEnRoute, bookMznSaleToEnRoute } = await import('./enRouteSettle')
    const {
      planReserveSplit,
      payInstantFromReserve,
      publishReserveSplitNotice,
    } = await import('../treasury/reserveConvert')

    // —— ZAR → MZN: draw MZN reserve for instant leg; remainder EN_ROUTE ——
    if (isZarSale) {
      const wantMzn =
        typeof expectedDestinationMzn === 'number' && expectedDestinationMzn > 0
          ? roundMajor(expectedDestinationMzn)
          : roundMajor(sourceAmountMajor * sellRate)
      const split = skipReserve
        ? {
            instantDest: 0,
            routedDest: wantMzn,
            instantSource: 0,
            routedSource: sourceAmountMajor,
          }
        : await planReserveSplit({
            destCurrency: 'MZN',
            wantDest: wantMzn,
            totalSource: sourceAmountMajor,
          })

      let instantTxId: string | null = null
      let routedTxId: string | null = null
      let settleAtMs: number | null = null

      if (split.instantDest > 0 && split.instantSource > 0) {
        const instant = await payInstantFromReserve({
          userId,
          sourceCurrency: 'ZAR',
          destCurrency: 'MZN',
          sourceMajor: split.instantSource,
          destMajor: split.instantDest,
          fxRateMZNperZar: sellRate,
          costRate,
          sellRate,
          groupId,
          namedClient,
          suppressDeskActivity: deskSuppress,
        })
        instantTxId = instant.txId
      }

      if (split.routedSource > 0) {
        const routedRewards =
          split.routedSource >= sourceAmountMajor - 0.001
            ? rewardsMznMinor
            : Math.round((rewardsMznMinor * split.routedSource) / Math.max(sourceAmountMajor, 0.01))
        const booked = await bookZarSaleToEnRoute({
          userId,
          sourceAmountZar: split.routedSource,
          sellRate,
          costRate,
          rewardsMznMinor: routedRewards,
          namedClient,
          groupId,
          suppressDeskActivity: true,
          simulated: plannedMeta.simulated === true,
          planRunId: plannedMeta.planRunId,
          settleImmediately: plannedMeta.simulated === true,
          expectedDestinationMzn: split.routedDest > 0 ? split.routedDest : undefined,
        })
        routedTxId = booked.txId
        settleAtMs = booked.settleAtMs
      }

      await publishReserveSplitNotice({
        userId,
        groupId,
        destCurrency: 'MZN',
        fundedDest: wantMzn,
        instantDest: split.instantDest,
        routedDest: split.routedDest,
        settleAtMs,
        suppressDeskActivity: deskSuppress,
      })

      const txId = routedTxId || instantTxId || groupId
      try {
        await sendAgentConversionProofEmail(txId)
      } catch (error) {
        console.error('[tx_createInternalConversion] Agent proof email failed (non-blocking)', {
          txId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return {
        txId,
        groupId,
        enRoute: split.routedDest > 0,
        settleAtMs,
        reserveInstantMzn: split.instantDest,
        reserveRoutedMzn: split.routedDest,
      }
    }

    // —— MZN → ZAR: draw ZAR reserve for instant leg; remainder EN_ROUTE ——
    const wantZar = expectedDestinationMajor
    const split = skipReserve
      ? {
          instantDest: 0,
          routedDest: wantZar,
          instantSource: 0,
          routedSource: sourceAmountMajor,
        }
      : await planReserveSplit({
          destCurrency: 'ZAR',
          wantDest: wantZar,
          totalSource: sourceAmountMajor,
        })

    let instantTxId: string | null = null
    let routedTxId: string | null = null
    let settleAtMs: number | null = null

    if (split.instantDest > 0 && split.instantSource > 0) {
      const instant = await payInstantFromReserve({
        userId,
        sourceCurrency: 'MZN',
        destCurrency: 'ZAR',
        sourceMajor: split.instantSource,
        destMajor: split.instantDest,
        fxRateMZNperZar: fxRateMZNperZAR,
        costRate: restockBlendedCost,
        sellRate,
        groupId,
        namedClient,
        suppressDeskActivity: deskSuppress,
      })
      instantTxId = instant.txId
    }

    if (split.routedSource > 0) {
      const booked = await bookMznSaleToEnRoute({
        userId,
        sourceAmountMzn: split.routedSource,
        sellRate,
        costRate: restockBlendedCost,
        expectedDestinationZar: split.routedDest,
        namedClient,
        groupId,
        suppressDeskActivity: true,
        simulated: plannedMeta.simulated === true,
        planRunId: plannedMeta.planRunId,
        settleImmediately: plannedMeta.simulated === true,
      })
      routedTxId = booked.txId
      settleAtMs = booked.settleAtMs
    }

    await publishReserveSplitNotice({
      userId,
      groupId,
      destCurrency: 'ZAR',
      fundedDest: wantZar,
      instantDest: split.instantDest,
      routedDest: split.routedDest,
      settleAtMs,
      suppressDeskActivity: deskSuppress,
    })

    const txId = routedTxId || instantTxId || groupId
    try {
      await sendAgentConversionProofEmail(txId)
    } catch (error) {
      console.error('[tx_createInternalConversion] Agent proof email failed (non-blocking)', {
        txId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return {
      txId,
      groupId,
      enRoute: split.routedDest > 0,
      settleAtMs,
      reserveInstantZar: split.instantDest,
      reserveRoutedZar: split.routedDest,
    }
  })

