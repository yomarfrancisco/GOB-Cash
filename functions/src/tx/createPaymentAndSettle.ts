/**
 * Cloud Function: tx_createPaymentAndSettle
 * 
 * Creates a payment transaction and settles balances atomically.
 * - Validates sender has sufficient balance
 * - Resolves receiver handle to UID
 * - Updates both wallets atomically
 * - Creates transaction and messages
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

// MVP restriction: Only this UID can send payments
const ALLOWED_SENDER_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'

// Exchange rate (hardcoded for MVP)
const FX_RATE_ZAR_PER_USDT = 18.1

export const tx_createPaymentAndSettle = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Log function invocation
    console.log('[tx_createPaymentAndSettle] Function invoked', {
      hasAuth: !!context.auth,
      userId: context.auth?.uid,
      timestamp: new Date().toISOString(),
    })

    // Require authentication
    if (!context.auth) {
      console.error('[tx_createPaymentAndSettle] Unauthenticated request')
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const senderId = context.auth.uid

    // MVP restriction: Only allowed UID can send payments
    if (senderId !== ALLOWED_SENDER_UID) {
      console.error('[tx_createPaymentAndSettle] Unauthorized sender', { senderId, allowed: ALLOWED_SENDER_UID })
      throw new functions.https.HttpsError('permission-denied', 'Payment sending is restricted for MVP')
    }

    // Extract and validate inputs
    const { receiverHandle, amountZAR } = data || {}

    if (!receiverHandle || typeof receiverHandle !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'receiverHandle is required')
    }
    if (!amountZAR || typeof amountZAR !== 'number' || amountZAR <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountZAR must be a positive number')
    }

    // Normalize handle (remove @ prefix if present, lowercase)
    const normalizedHandle = receiverHandle.replace(/^@+/, '').toLowerCase().trim()
    if (!normalizedHandle) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid receiverHandle')
    }

    const now = admin.firestore.Timestamp.now()

    // Resolve receiver handle → UID via publicDirectory
    const directoryRef = db.collection('publicDirectory').doc(normalizedHandle)
    const directorySnap = await directoryRef.get()

    if (!directorySnap.exists) {
      console.error('[tx_createPaymentAndSettle] Receiver not found', { normalizedHandle })
      throw new functions.https.HttpsError('not-found', 'Recipient not found')
    }

    const directoryData = directorySnap.data()!
    const receiverId = directoryData.ownerUserId

    if (!receiverId || typeof receiverId !== 'string') {
      console.error('[tx_createPaymentAndSettle] Receiver has no ownerUserId', { normalizedHandle })
      throw new functions.https.HttpsError('not-found', 'Recipient UID not found')
    }

    // Prevent self-payment
    if (senderId === receiverId) {
      throw new functions.https.HttpsError('invalid-argument', 'Cannot send payment to yourself')
    }

    // Calculate USDT amount
    const amountUSDT = amountZAR / FX_RATE_ZAR_PER_USDT

    // Get sender and receiver wallet references
    const senderWalletRef = db.collection('users').doc(senderId).collection('wallets').doc('cashZAR')
    const receiverWalletRef = db.collection('users').doc(receiverId).collection('wallets').doc('cashZAR')

    // Create transaction document reference
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id

    // Atomic transaction: check balance, update wallets, create transaction and messages
    try {
      await db.runTransaction(async (t) => {
        // Read sender wallet
        const senderWalletSnap = await t.get(senderWalletRef)
        const senderWallet = senderWalletSnap.exists ? senderWalletSnap.data()! : { fiatBalance: 0, lockedBalance: 0 }

        // Check sender balance
        const senderBalance = (senderWallet.fiatBalance || 0) + (senderWallet.lockedBalance || 0)
        if (senderBalance < amountZAR) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Insufficient balance. Available: R${senderBalance.toFixed(2)}, Required: R${amountZAR.toFixed(2)}`
          )
        }

        // Read receiver wallet
        const receiverWalletSnap = await t.get(receiverWalletRef)
        const receiverWallet = receiverWalletSnap.exists ? receiverWalletSnap.data()! : { fiatBalance: 0, lockedBalance: 0 }

        // Update sender wallet (decrement fiatBalance, prefer fiatBalance over lockedBalance)
        const senderFiat = senderWallet.fiatBalance || 0
        const deductionFromFiat = Math.min(senderFiat, amountZAR)
        const deductionFromLocked = amountZAR - deductionFromFiat

        // Use set to create or overwrite wallet (we've already read it, so we have all fields)
        t.set(senderWalletRef, {
          ...senderWallet,
          fiatBalance: senderFiat - deductionFromFiat,
          lockedBalance: (senderWallet.lockedBalance || 0) - deductionFromLocked,
          updatedAt: now,
        })

        // Update receiver wallet (increment fiatBalance)
        const receiverFiat = receiverWallet.fiatBalance || 0
        t.set(receiverWalletRef, {
          ...receiverWallet,
          fiatBalance: receiverFiat + amountZAR,
          updatedAt: now,
        })

        // Create transaction document
        const participants = [senderId, receiverId, 'samba']
        const transaction = {
          id: txId,
          type: 'PAYMENT_TO_USER' as const,
          status: 'COMPLETED' as const, // Payment is immediately completed (no pending state)
          senderId,
          receiverId,
          participants,
          amountZar: amountZAR,
          amountUSDT: amountUSDT,
          fxRateZARperUSDT: FX_RATE_ZAR_PER_USDT,
          receiverHandle: normalizedHandle,
          createdAt: now,
          updatedAt: now,
          statusUpdatedAt: now,
        }

        t.set(txRef, transaction)

        // Note: We could fetch user data for personalized messages, but for MVP we'll use the handle from directory

        // Create messages
        // 1. SYSTEM message
        const systemMsgRef = txRef.collection('messages').doc()
        const systemMessage = {
          id: systemMsgRef.id,
          txId,
          createdAt: now,
          senderType: 'SYSTEM' as const,
          text: `Payment initiated`,
          metadata: {
            status: 'COMPLETED',
          },
        }
        t.set(systemMsgRef, systemMessage)

        // 2. AI message: Payment sent confirmation
        const aiMsg1Ref = txRef.collection('messages').doc()
        const aiMessage1 = {
          id: aiMsg1Ref.id,
          txId,
          createdAt: now,
          senderType: 'SAMBA' as const,
          senderUid: 'samba',
          text: `Payment sent ✅`,
        }
        t.set(aiMsg1Ref, aiMessage1)

        // 3. AI message: Payment details
        const aiMsg2Ref = txRef.collection('messages').doc()
        const formattedAmount = amountZAR.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        const aiMessage2 = {
          id: aiMsg2Ref.id,
          txId,
          createdAt: now,
          senderType: 'SAMBA' as const,
          senderUid: 'samba',
          text: `Your payment of R${formattedAmount} to @${normalizedHandle} was delivered.`,
        }
        t.set(aiMsg2Ref, aiMessage2)
      })

      console.log(`[tx_createPaymentAndSettle] Successfully created payment ${txId}`, {
        txId,
        senderId,
        receiverId,
        receiverHandle: normalizedHandle,
        amountZAR,
        amountUSDT,
      })

      return {
        txId,
        receiverId,
        amountZAR,
        amountUSDT,
      }
    } catch (error: any) {
      // Re-throw HttpsError as-is
      if (error instanceof functions.https.HttpsError) {
        throw error
      }

      console.error(`[tx_createPaymentAndSettle] Failed to create payment`, {
        error: error.message,
        senderId,
        receiverHandle: normalizedHandle,
        amountZAR,
      })
      throw new functions.https.HttpsError('internal', 'Failed to create payment', error)
    }
  })

