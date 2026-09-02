/**
 * Cloud Function: getConversionProof
 *
 * Returns a MozPay proof-of-payment PDF for an internal exchange.
 * Requires authentication and verifies the conversion belongs to the caller.
 */

import * as functions from 'firebase-functions'
import { getConversionData, generateConversionProofPdf } from '../utils/generateConversionProof'

export const getConversionProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId } = data || {}

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }

    const conversionData = await getConversionData(txId)

    if (!conversionData) {
      throw new functions.https.HttpsError('not-found', 'Conversion not found')
    }

    if (conversionData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'This conversion does not belong to you')
    }

    const pdfBuffer = await generateConversionProofPdf(conversionData)

    return {
      pdfBase64: pdfBuffer.toString('base64'),
      filename: `mozpay-exchange-${txId}.pdf`,
      mimeType: 'application/pdf',
    }
  })
