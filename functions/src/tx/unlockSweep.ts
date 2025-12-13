/**
 * Cloud Function: tx_unlockSweep
 * 
 * Scheduled function that unlocks transactions after lock period expires.
 * Transitions: LOCKED -> READY_FOR_WITHDRAWAL
 * Moves funds from locked to available balance
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

export const tx_unlockSweep = functions
  .region('us-central1')
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now()

    // Find all LOCKED transactions where unlockAt <= now
    const q = db.collection('transactions')
      .where('status', '==', 'LOCKED')
      .where('unlockAt', '<=', now)
      .limit(50)

    const snapshot = await q.get()

    if (snapshot.empty) {
      console.log('[tx_unlockSweep] No transactions to unlock')
      return null
    }

    console.log(`[tx_unlockSweep] Found ${snapshot.size} transactions to unlock`)

    const batch = db.batch()
    const walletUpdates: Map<string, { userId: string; amount: number }> = new Map()

    snapshot.docs.forEach((doc) => {
      const tx = doc.data()
      const txRef = doc.ref
      const txId = doc.id

      // Collect wallet updates (group by userId)
      const userId = tx.userId
      const amount = tx.amountZar || 0
      const walletKey = userId

      if (!walletUpdates.has(walletKey)) {
        walletUpdates.set(walletKey, { userId, amount: 0 })
      }
      const walletUpdate = walletUpdates.get(walletKey)!
      walletUpdate.amount += amount

      // Update transaction status
      batch.update(txRef, {
        status: 'READY_FOR_WITHDRAWAL',
        statusUpdatedAt: now,
      })

      // Create SYSTEM message
      const msgRef = txRef.collection('messages').doc()
      batch.set(msgRef, {
        id: msgRef.id,
        txId,
        createdAt: now,
        senderType: 'SYSTEM',
        text: `✅ Funds are now available for withdrawal.`,
        metadata: {
          status: 'READY_FOR_WITHDRAWAL',
        },
      })
    })

    // Read wallet states first (before batch operations)
    const walletRefs: Map<string, admin.firestore.DocumentReference> = new Map()
    const walletData: Map<string, any> = new Map()
    
    for (const { userId } of walletUpdates.values()) {
      const walletRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
      walletRefs.set(userId, walletRef)
      const walletSnap = await walletRef.get()
      walletData.set(userId, walletSnap.exists ? walletSnap.data()! : { fiatBalance: 0, lockedBalance: 0 })
    }

    // Update wallets: move from locked to available
    for (const { userId, amount } of walletUpdates.values()) {
      const walletRef = walletRefs.get(userId)!
      const wallet = walletData.get(userId)!

      // Move from locked to available
      batch.set(walletRef, {
        ...wallet,
        fiatBalance: (wallet.fiatBalance || 0) + amount,
        lockedBalance: Math.max(0, (wallet.lockedBalance || 0) - amount),
        updatedAt: now,
      }, { merge: true })
    }

    await batch.commit()

    console.log(`[tx_unlockSweep] Unlocked ${snapshot.size} transactions`)

    return null
  })

