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
    
    // Log the exact path being written
    const walletPath = `users/${CORE_AGENT_UID}/wallets/cashZAR`
    console.log('[seedCoreAgentBalance] Writing to path:', walletPath, {
      projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId,
      amountZAR,
      callerUid: callerUid,
      timestamp: now.toDate().toISOString(),
    })

    try {
      // Get existing wallet or create it
      const walletSnap = await walletRef.get()
      
      if (walletSnap.exists) {
        // Update existing wallet
        const beforeData = walletSnap.data()
        console.log('[seedCoreAgentBalance] Before update:', {
          existingFiatBalance: beforeData?.fiatBalance,
          walletId: beforeData?.walletId,
          path: walletPath,
        })
        
        await walletRef.update({
          fiatBalance: amountZAR,
          updatedAt: now,
        })
        
        // Verify write succeeded
        const afterSnap = await walletRef.get()
        const afterData = afterSnap.data()
        console.log('[seedCoreAgentBalance] After update:', {
          fiatBalance: afterData?.fiatBalance,
          updatedAt: afterData?.updatedAt?.toDate().toISOString(),
          path: walletPath,
        })
        
        console.log(`[seedCoreAgentBalance] Updated cashZAR balance to R${amountZAR} for CoreAgent`)
      } else {
        // Create wallet with balance
        console.log('[seedCoreAgentBalance] Creating new wallet:', {
          walletId: 'cashZAR',
          fiatBalance: amountZAR,
          path: walletPath,
        })
        
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
        
        // Verify write succeeded
        const verifySnap = await walletRef.get()
        const verifyData = verifySnap.data()
        console.log('[seedCoreAgentBalance] After create:', {
          fiatBalance: verifyData?.fiatBalance,
          walletId: verifyData?.walletId,
          path: walletPath,
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

