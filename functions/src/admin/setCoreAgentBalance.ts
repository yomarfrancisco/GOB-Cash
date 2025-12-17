/**
 * One-time Cloud Function to set CoreAgent balance
 * Can be called from Firebase Console or CLI
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()
const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'

export const setCoreAgentBalance = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    // Only allow CoreAgent themselves
    const callerUid = context.auth.uid
    if (callerUid !== CORE_AGENT_UID) {
      throw new functions.https.HttpsError('permission-denied', 'Only CoreAgent can set their balance')
    }

    const { amountZAR } = data || {}
    if (!amountZAR || typeof amountZAR !== 'number' || amountZAR <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountZAR must be a positive number')
    }

    const now = admin.firestore.Timestamp.now()
    const walletRef = db.collection('users').doc(CORE_AGENT_UID).collection('wallets').doc('cashZAR')

    try {
      // Set balance directly (create or update)
      await walletRef.set({
        walletId: 'cashZAR',
        kind: 'cash',
        displayCurrency: 'ZAR',
        fiatBalance: amountZAR,
        usdtBalance: 0,
        apy: 9.38,
        updatedAt: now,
      }, { merge: true })

      // Verify it worked
      const verifySnap = await walletRef.get()
      const verifyData = verifySnap.data()

      console.log(`[setCoreAgentBalance] Set balance to R${amountZAR}`, {
        verified: verifyData?.fiatBalance === amountZAR,
        actualBalance: verifyData?.fiatBalance,
      })

      return {
        success: true,
        amountZAR,
        verifiedBalance: verifyData?.fiatBalance,
      }
    } catch (error: any) {
      console.error('[setCoreAgentBalance] Failed:', error)
      throw new functions.https.HttpsError('internal', 'Failed to set balance', error)
    }
  })

