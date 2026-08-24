/**
 * Cloud Function: tx_creditAndLock
 * 
 * Credits user wallet and locks funds for settlement period.
 * Transitions: DEPOSIT_RECEIVED -> CREDITED -> LOCKED
 * Updates user wallet balances
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

export const tx_creditAndLock = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const uid = context.auth.uid
    const { txId } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!
    
    // Allow receiver OR internal ops user (for now, receiver can trigger)
    if (tx.receiverId !== uid && tx.userId !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized for this transaction')
    }

    // Assert valid transition (must be DEPOSIT_RECEIVED, going directly to LOCKED)
    assertTransition(tx.status, 'LOCKED')

    const now = admin.firestore.Timestamp.now()
    const lockSeconds = 86400 // 24 hours
    const unlockAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + lockSeconds * 1000)

    const isMznDeposit = tx.depositCurrency === 'MZN'
    const walletId = isMznDeposit ? 'cashMZN' : 'cashZAR'
    const currencyLabel = isMznDeposit ? 'Mt' : 'R'
    const walletRef = db.collection('users').doc(tx.userId).collection('wallets').doc(walletId)
    const walletSnap = await walletRef.get()

    const amount = isMznDeposit ? (tx.amountMzn || 0) : (tx.amountZar || 0)

    // Create SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: `💳 Credited ${currencyLabel}${amount.toFixed(2)}. Funds locked for 24h until settlement clears. Available for withdrawal after ${unlockAt.toDate().toLocaleString()}.`,
      metadata: {
        status: 'LOCKED',
        unlockAt: unlockAt.toMillis(),
      },
    }

    // Update transaction, wallet, and create message atomically
    await db.runTransaction(async (t) => {
      // Get wallet data
      const wallet = walletSnap.exists ? walletSnap.data()! : { fiatBalance: 0, lockedBalance: 0 }

      // Credit locked balance
      t.set(walletRef, {
        ...wallet,
        fiatBalance: (wallet.fiatBalance || 0),
        lockedBalance: (wallet.lockedBalance || 0) + amount,
        updatedAt: now,
      }, { merge: true })

      // Update transaction status to LOCKED (skipping CREDITED intermediate state for simplicity)
      // Also update chatStep to DEPOSIT_CONFIRMED_LOCKED_DONE
      t.update(txRef, {
        status: 'LOCKED',
        statusUpdatedAt: now,
        unlockAt,
        chatStep: 'DEPOSIT_CONFIRMED_LOCKED_DONE',
        updatedAt: now,
        'audit.lastActorId': uid,
      })

      t.set(msgRef, message)
    })

    console.log(`[tx_creditAndLock] Transaction ${txId} credited and locked for user ${tx.userId}`)

    return { ok: true, status: 'LOCKED', unlockAt: unlockAt.toMillis() }
  })

