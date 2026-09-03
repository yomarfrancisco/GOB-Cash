/**
 * Cloud Function: getBankWithdrawalProof
 *
 * Returns a MozPaga confirmation PDF for a recorded bank withdrawal.
 * This is an app confirmation, not an external bank proof of payment.
 * Requires authentication and verifies the withdrawal belongs to the caller.
 */

import * as functions from 'firebase-functions'
import {
  getBankWithdrawalData,
  generateBankWithdrawalProofPdf,
  stampAppConfirmationOnTransaction,
} from '../utils/generateBankWithdrawalProof'

export const getBankWithdrawalProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { bankWithdrawalId } = data || {}

    if (!bankWithdrawalId || typeof bankWithdrawalId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'bankWithdrawalId is required')
    }

    const withdrawalData = await getBankWithdrawalData(bankWithdrawalId)

    if (!withdrawalData) {
      throw new functions.https.HttpsError('not-found', 'Bank withdrawal not found')
    }

    if (withdrawalData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'This withdrawal does not belong to you')
    }

    try {
      await stampAppConfirmationOnTransaction(bankWithdrawalId)
    } catch (error) {
      console.warn('[getBankWithdrawalProof] Could not stamp documentType on transaction:', error)
    }

    const pdfBuffer = await generateBankWithdrawalProofPdf(withdrawalData)
    const pdfBase64 = pdfBuffer.toString('base64')

    return {
      pdfBase64,
      filename: `mozpaga-confirmation-${bankWithdrawalId}.pdf`,
      mimeType: 'application/pdf',
    }
  })
