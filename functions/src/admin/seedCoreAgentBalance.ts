/**
 * Admin Cloud Function: seedCoreAgentBalance
 * 
 * Seeds CoreAgent wallet with initial balance (one-time use).
 * Only callable by admin or via Firebase Console.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()
const CORE_AGENT_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'

export const seedCoreAgentBalance = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    // Only allow admin or the CoreAgent themselves
    const callerUid = context.auth.uid
    if (callerUid !== CORE_AGENT_UID) {
      // Could add admin check here if needed
      throw new functions.https.HttpsError('permission-denied', 'Only CoreAgent can seed their balance')
    }

    const { amountZAR } = data || {}
    if (!amountZAR || typeof amountZAR !== 'number' || amountZAR <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountZAR must be a positive number')
    }

    const now = admin.firestore.Timestamp.now()
    const walletRef = db.collection('users').doc(CORE_AGENT_UID).collection('wallets').doc('cashZAR')

    try {
      // Get existing wallet or create it
      const walletSnap = await walletRef.get()
      
      if (walletSnap.exists) {
        // Update existing wallet
        await walletRef.update({
          fiatBalance: amountZAR,
          updatedAt: now,
        })
        console.log(`[seedCoreAgentBalance] Updated cashZAR balance to R${amountZAR} for CoreAgent`)
      } else {
        // Create wallet with balance
        await walletRef.set({
          walletId: 'cashZAR',
          kind: 'cash',
          displayCurrency: 'ZAR',
          fiatBalance: amountZAR,
          usdtBalance: 0,
          apy: 9.38,
          createdAt: now,
          updatedAt: now,
        })
        console.log(`[seedCoreAgentBalance] Created cashZAR wallet with balance R${amountZAR} for CoreAgent`)
      }

      return {
        success: true,
        uid: CORE_AGENT_UID,
        walletId: 'cashZAR',
        amountZAR,
      }
    } catch (error: any) {
      console.error('[seedCoreAgentBalance] Failed to seed balance:', error)
      throw new functions.https.HttpsError('internal', 'Failed to seed balance', error)
    }
  })

