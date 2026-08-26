/**
 * Cloud Function: tx_createInternalConversion
 *
 * Immediately converts the caller's own MZN↔ZAR wallets at the quoted rate.
 * Status stays INITIATED until an operator confirms evidence. Cards move now.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()
const FX_RATE_MZN_PER_ZAR = 4.5

function roundMajor(value: number): number {
  return Math.round(value * 100) / 100
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

    const sourceAmountMajor = roundMajor(sourceAmount)
    const sourceAmountMinor = Math.round(sourceAmountMajor * 100)
    const expectedDestinationMajor =
      sourceCurrency === 'MZN'
        ? roundMajor(sourceAmountMajor / FX_RATE_MZN_PER_ZAR)
        : roundMajor(sourceAmountMajor * FX_RATE_MZN_PER_ZAR)
    const expectedDestinationMinor = Math.round(expectedDestinationMajor * 100)

    const sourceWalletId = sourceCurrency === 'MZN' ? 'cashMZN' : 'cashZAR'
    const destinationWalletId = destinationCurrency === 'MZN' ? 'cashMZN' : 'cashZAR'
    const sourceWalletRef = db.collection('users').doc(userId).collection('wallets').doc(sourceWalletId)
    const destinationWalletRef = db.collection('users').doc(userId).collection('wallets').doc(destinationWalletId)
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id
    const now = admin.firestore.Timestamp.now()
    const groupId = typeof data?.groupId === 'string' && data.groupId.trim() ? data.groupId.trim() : txId

    const sourceLabel = sourceCurrency === 'MZN' ? `Mt ${sourceAmountMajor.toFixed(2)}` : `R${sourceAmountMajor.toFixed(2)}`
    const destLabel = destinationCurrency === 'MZN' ? `Mt ${expectedDestinationMajor.toFixed(2)}` : `R${expectedDestinationMajor.toFixed(2)}`
    const activityTitle = 'Conversion instructed'
    const activityBody = `${sourceLabel} → ${destLabel} · pending confirmation`

    await db.runTransaction(async (t) => {
      const sourceSnap = await t.get(sourceWalletRef)
      const destSnap = await t.get(destinationWalletRef)
      const sourceData = sourceSnap.exists ? sourceSnap.data()! : { fiatBalance: 0 }
      const destData = destSnap.exists ? destSnap.data()! : { fiatBalance: 0 }
      const available = Number(sourceData.fiatBalance || 0)
      const availableMinor = Math.round(available * 100)

      if (!sourceSnap.exists || sourceAmountMinor > availableMinor) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          sourceCurrency === 'MZN' ? 'Insufficient MZN balance.' : 'Insufficient ZAR balance.'
        )
      }

      t.update(sourceWalletRef, {
        fiatBalance: (availableMinor - sourceAmountMinor) / 100,
        updatedAt: now,
      })
      if (!destSnap.exists) {
        t.set(destinationWalletRef, {
          walletId: destinationWalletId,
          kind: 'cash',
          displayCurrency: destinationCurrency,
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
        quotedRate: FX_RATE_MZN_PER_ZAR,
        amountMzn: sourceCurrency === 'MZN' ? sourceAmountMajor : expectedDestinationMajor,
        amountZar: sourceCurrency === 'ZAR' ? sourceAmountMajor : expectedDestinationMajor,
        fxRateMZNperZAR: FX_RATE_MZN_PER_ZAR,
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
        avatarKind: 'proof_of_payment',
        amountCurrency: sourceCurrency,
        amountValue: sourceAmountMajor,
        amountSign: 'debit',
        txId,
        createdAt: now,
        recordingSource: 'USER_UI',
      })
    })

    return { txId }
  })
