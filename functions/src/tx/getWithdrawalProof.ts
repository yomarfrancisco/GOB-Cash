/**
 * Cloud Function: getWithdrawalProof
 * 
 * Returns a PDF proof of payment for a withdrawal.
 * Requires authentication and verifies the withdrawal belongs to the caller.
 * Callable function for easier frontend integration.
 */

import * as functions from 'firebase-functions'
import { getWithdrawalData, generateWithdrawalProofPdf } from '../utils/generateWithdrawalProof'

export const getWithdrawalProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    
    const userId = context.auth.uid
    const { withdrawalId } = data || {}
    
    if (!withdrawalId || typeof withdrawalId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'withdrawalId is required')
    }
    
    // Fetch withdrawal data
    const withdrawalData = await getWithdrawalData(withdrawalId)
    
    if (!withdrawalData) {
      throw new functions.https.HttpsError('not-found', 'Withdrawal not found')
    }
    
    // Verify withdrawal belongs to caller
    if (withdrawalData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'This withdrawal does not belong to you')
    }
    
    // Generate PDF
    const pdfBuffer = await generateWithdrawalProofPdf(withdrawalData)
    
    // Convert buffer to base64 for return
    const pdfBase64 = pdfBuffer.toString('base64')
    
    return {
      pdfBase64,
      filename: `withdrawal-proof-${withdrawalId}.pdf`,
      mimeType: 'application/pdf',
    }
  })

