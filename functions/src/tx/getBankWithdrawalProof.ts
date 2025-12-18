/**
 * Cloud Function: getBankWithdrawalProof
 * 
 * Returns a PDF proof of payment for a bank withdrawal.
 * Requires authentication and verifies the withdrawal belongs to the caller.
 */

import * as functions from 'firebase-functions'
import { getBankWithdrawalData, generateBankWithdrawalProofPdf } from '../utils/generateBankWithdrawalProof'

export const getBankWithdrawalProof = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    
    const userId = context.auth.uid
    const { bankWithdrawalId } = data || {}
    
    if (!bankWithdrawalId || typeof bankWithdrawalId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'bankWithdrawalId is required')
    }
    
    // Fetch withdrawal data
    const withdrawalData = await getBankWithdrawalData(bankWithdrawalId)
    
    if (!withdrawalData) {
      throw new functions.https.HttpsError('not-found', 'Bank withdrawal not found')
    }
    
    // Verify withdrawal belongs to caller
    if (withdrawalData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'This withdrawal does not belong to you')
    }
    
    // Generate PDF
    const pdfBuffer = await generateBankWithdrawalProofPdf(withdrawalData)
    
    // Convert buffer to base64 for return
    const pdfBase64 = pdfBuffer.toString('base64')
    
    return {
      pdfBase64,
      filename: `bank-withdrawal-proof-${bankWithdrawalId}.pdf`,
      mimeType: 'application/pdf',
    }
  })

