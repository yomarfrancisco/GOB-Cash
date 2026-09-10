/**
 * Cloud Function: tx_createInternalConversion
 *
 * Immediately converts the caller's own MZN↔ZAR wallets at the quoted rate.
 * ZAR→MZN credits COST plus SELL−COST spread onto cashMZN. rewardsMzn stays on the tx
 * for activity. Status stays INITIATED until an operator confirms evidence. Cards move now.
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

    const namedClient = await resolveNamedClient(data?.agentCashHandle, userId)
    const sourceAmountMajor = roundMajor(sourceAmount)
    const sourceAmountMinor = Math.round(sourceAmountMajor * 100)
    const sellRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
    const costRate = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)
    const isZarSale = sourceCurrency === 'ZAR' && destinationCurrency === 'MZN'
    const settlementMajor =
      sourceCurrency === 'MZN'
        ? roundMajor(sourceAmountMajor / costRate)
        : roundMajor(sourceAmountMajor * costRate)
    const reportedDestMajor = isZarSale
      ? roundMajor(sourceAmountMajor * sellRate)
      : settlementMajor
    const fxRateMZNperZAR = isZarSale ? sellRate : costRate
    const expectedDestinationMajor = settlementMajor
    const expectedDestinationMinor = Math.round(expectedDestinationMajor * 100)
    const rewardsMznMajor = isZarSale
      ? mznRewardsFromZar(sourceAmountMajor, sellRate, costRate)
      : 0
    const rewardsMznMinor = Math.round(rewardsMznMajor * 100)

    const sourceWalletId = sourceCurrency === 'MZN' ? 'cashMZN' : 'cashZAR'
    const destinationWalletId = destinationCurrency === 'MZN' ? 'cashMZN' : 'cashZAR'
    const sourceWalletRef = db.collection('users').doc(userId).collection('wallets').doc(sourceWalletId)
    const destinationWalletRef = db.collection('users').doc(userId).collection('wallets').doc(destinationWalletId)
    const earningsWalletRef = db.collection('users').doc(userId).collection('wallets').doc('earnings')
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id
    const now = admin.firestore.Timestamp.now()
    const groupId = typeof data?.groupId === 'string' && data.groupId.trim() ? data.groupId.trim() : txId

    const sourceLabel = sourceCurrency === 'MZN' ? `Mt ${sourceAmountMajor.toFixed(2)}` : `R${sourceAmountMajor.toFixed(2)}`
    const destLabel = destinationCurrency === 'MZN' ? `Mt ${reportedDestMajor.toFixed(2)}` : `R${reportedDestMajor.toFixed(2)}`
    const activityTitle = isZarSale ? 'ZAR sold at SELL' : 'ZAR sourced at COST'
    const activityBody = isZarSale
      ? `${sourceLabel} to ${destLabel} · SELL ${sellRate.toFixed(2)} Mt/R`
      : `${sourceLabel} to ${destLabel} · COST ${costRate.toFixed(2)} Mt/R`

    await db.runTransaction(async (t) => {
      const sourceSnap = await t.get(sourceWalletRef)
      const destSnap = await t.get(destinationWalletRef)
      const earningsSnap = await t.get(earningsWalletRef)
      const sourceData = sourceSnap.exists ? sourceSnap.data()! : { fiatBalance: 0 }
      const destData = destSnap.exists ? destSnap.data()! : { fiatBalance: 0 }
      const available = Number(sourceData.fiatBalance || 0)
      const availableMinor = Math.round(available * 100)
      const leftoverEarningsMinor = Math.round(
        Number(earningsSnap.exists ? earningsSnap.data()?.fiatBalance || 0 : 0) * 100
      )

      if (!sourceSnap.exists || sourceAmountMinor > availableMinor) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          sourceCurrency === 'MZN' ? 'Insufficient MZN balance.' : 'Insufficient ZAR balance.'
        )
      }

      const destExistingMinor = destSnap.exists ? Math.round(Number(destData.fiatBalance || 0) * 100) : 0
      const spreadIntoMznMinor = destinationWalletId === 'cashMZN' ? rewardsMznMinor : 0
      const foldIntoMznMinor = leftoverEarningsMinor > 0 ? leftoverEarningsMinor : 0
      let sourceNextMinor = availableMinor - sourceAmountMinor
      let destNextMinor = destExistingMinor + expectedDestinationMinor
      if (sourceWalletId === 'cashMZN') sourceNextMinor += foldIntoMznMinor
      if (destinationWalletId === 'cashMZN') destNextMinor += spreadIntoMznMinor + foldIntoMznMinor

      t.update(sourceWalletRef, {
        fiatBalance: sourceNextMinor / 100,
        updatedAt: now,
      })
      if (!destSnap.exists) {
        t.set(destinationWalletRef, {
          walletId: destinationWalletId,
          kind: 'cash',
          displayCurrency: destinationCurrency,
          fiatBalance: destNextMinor / 100,
          usdtBalance: 0,
          updatedAt: now,
        })
      } else {
        t.update(destinationWalletRef, {
          fiatBalance: destNextMinor / 100,
          updatedAt: now,
        })
      }

      if (earningsSnap.exists && leftoverEarningsMinor > 0) {
        t.update(earningsWalletRef, {
          fiatBalance: 0,
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
        buyRateMZNperZAR: costRate,
        costRateMZNperZAR: costRate,
        sellRateMZNperZAR: sellRate,
        rewardsMznMinor: rewardsMznMinor || null,
        clientDestinationAmountMinor: Math.round(reportedDestMajor * 100),
        amountMzn: sourceCurrency === 'MZN' ? sourceAmountMajor : reportedDestMajor,
        amountZar: sourceCurrency === 'ZAR' ? sourceAmountMajor : expectedDestinationMajor,
        fxRateMZNperZAR,
        counterpartyHandle: namedClient?.handle || null,
        counterpartyUserId: namedClient?.userId || null,
        groupId,
        createdAt: now,
        statusUpdatedAt: now,
        updatedAt: now,
      })

      t.set(db.collection('users').doc(userId).collection('activityEvents').doc(txId), {
        id: txId,
        kind: 'CONVERSION_INSTRUCTED',
        title: activityTitle,
        body: activityBody,
        actorType: 'ai_manager',
        avatarKind: sourceCurrency === 'ZAR' ? 'convert_zar' : 'convert_mzn',
        amountCurrency: sourceCurrency,
        amountValue: sourceAmountMajor,
        amountSign: 'debit',
        txId,
        hasDownloadButton: true,
        createdAt: now,
        recordingSource: 'USER_UI',
      })
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
