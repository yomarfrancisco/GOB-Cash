/**
 * Cloud Function: tx_createBankDepositRequest
 * 
 * Creates a new bank deposit transaction request.
 * Initializes transaction with AWAITING_DEPOSIT status.
 * 
 * IMPORTANT: This is a CALLABLE function (.https.onCall)
 * - CORS is automatically handled by Firebase infrastructure
 * - Must be called via httpsCallable() from client SDK
 * - Does NOT support direct HTTP fetch() calls
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import type { TxStatus } from './state'

const db = admin.firestore()

// CRITICAL: Must use .https.onCall (not .https.onRequest)
// This ensures proper CORS handling and callable endpoint resolution
export const tx_createBankDepositRequest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Log function invocation for debugging
    console.log('[tx_createBankDepositRequest] Function invoked', {
      hasAuth: !!context.auth,
      userId: context.auth?.uid,
      timestamp: new Date().toISOString(),
    })

    if (!context.auth) {
      console.error('[tx_createBankDepositRequest] Unauthenticated request')
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid

    // Extract and validate inputs
    const {
      receiverId,
      amountZar,
      bankCountry,
      bankId,
      depositCurrency,
      depositReference,
      depositDetails,
      chatStep,
    } = data || {}

    if (!receiverId || typeof receiverId !== 'string') {
      console.error('[tx_createBankDepositRequest] Invalid receiverId', { receiverId, type: typeof receiverId })
      throw new functions.https.HttpsError('invalid-argument', 'receiverId is required')
    }
    if (!amountZar || typeof amountZar !== 'number' || amountZar <= 0) {
      console.error('[tx_createBankDepositRequest] Invalid amountZar', { amountZar, type: typeof amountZar })
      throw new functions.https.HttpsError('invalid-argument', 'amountZar must be a positive number')
    }
    if (bankCountry && typeof bankCountry !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'bankCountry must be a string')
    }
    if (bankId && typeof bankId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'bankId must be a string')
    }
    if (depositCurrency && typeof depositCurrency !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'depositCurrency must be a string')
    }
    if (depositReference && typeof depositReference !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'depositReference must be a string')
    }
    if (depositDetails && typeof depositDetails !== 'object') {
      throw new functions.https.HttpsError('invalid-argument', 'depositDetails must be an object')
    }

    const now = admin.firestore.Timestamp.now()
    const participants = [userId, receiverId, 'samba'] // lock participants server-side
    
    // Set expiration time (4 hours for AWAITING_DEPOSIT)
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 4 * 60 * 60 * 1000 // 4 hours
    )

    // Create transaction document
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id

    const transaction = {
      id: txId,
      type: 'BANK_DEPOSIT_TO_USDT_TRON' as const,
      userId,
      receiverId,
      participants,
      status: 'AWAITING_DEPOSIT' as TxStatus,
      createdAt: now,
      statusUpdatedAt: now,
      updatedAt: now,
      expiresAt, // Timeout for AWAITING_DEPOSIT state
      amountZar,
      unlockAt: null,
      withdrawal: {},
      // Enrichment fields (optional, provided by client)
      bankCountry: bankCountry || null,
      bankId: bankId || null,
      depositCurrency: depositCurrency || null,
      depositReference: depositReference || null,
      depositDetails: depositDetails || null,
      chatStep: chatStep || 'INTRO_CONFIRM_INTENT',
    }

    // Create initial SYSTEM message
    const msgRef = txRef.collection('messages').doc()
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: `Bank deposit request created for R${amountZar.toFixed(2)}. Please deposit the funds and mark as sent.`,
      metadata: {
        status: 'AWAITING_DEPOSIT',
      },
    }

    // Write transaction and message atomically
    try {
      await db.runTransaction(async (t) => {
        t.set(txRef, transaction)
        t.set(msgRef, message)
      })

      console.log(`[tx_createBankDepositRequest] Successfully created transaction ${txId} for user ${userId}`, {
        txId,
        userId,
        receiverId,
        amountZar,
        status: 'AWAITING_DEPOSIT',
      })

      // Create Samba intro message server-side with idempotency check
      if (chatStep === 'INTRO_CONFIRM_INTENT') {
        // Check if intro message already exists (prevents duplicates on refresh/double-tap)
        const existingIntro = await txRef.collection('messages')
          .where('senderType', '==', 'SAMBA')
          .where('metadata.chatStep', '==', 'INTRO_CONFIRM_INTENT')
          .limit(1)
          .get()

        if (existingIntro.empty) {
          // Get user profile for personalized greeting
          const userRef = db.collection('users').doc(userId)
          const userSnap = await userRef.get()
          const userData = userSnap.data()
          
          // Extract user name (handle, fullName, or fallback)
          const handleCustomer = userData?.userHandle || 
                                userData?.fullName?.split(' ')[0] || 
                                'there'
          const amount = `${amountZar.toFixed(2)}`
          const countryName = bankCountry === 'MZ' ? 'Mozambique' : bankCountry === 'ZA' ? 'South Africa' : ''
          const bankName = bankId || 'your bank'

          // Generate Ema intro message (matching client-side template)
          const introText = `Hi ${handleCustomer} — I'm Ema from GoBankless.\n\nTo confirm:\n\n• Deposit amount: ${amount}\n• Deposit method: Direct bank transfer\n• Country: ${countryName}\n• Bank: ${bankName}\n• You will receive: USDT (TRC-20)\n• Next step: After you send the bank transfer, reply "SENT" and upload proof of payment (screenshot or reference).\n\nWhen you're ready, send "SENT" + proof.`

          const introMsgRef = txRef.collection('messages').doc()
          const introMessage = {
            id: introMsgRef.id,
            txId,
            createdAt: now,
            senderType: 'SAMBA' as const,
            senderUid: 'samba',
            text: introText,
            metadata: {
              chatStep: 'INTRO_CONFIRM_INTENT',
            },
          }
          
          // Append intro message
          await introMsgRef.set(introMessage)
          
          console.log(`[tx_createBankDepositRequest] Intro message created for tx ${txId}`)
        } else {
          console.log(`[tx_createBankDepositRequest] Intro message already exists for tx ${txId}, skipping`)
        }
      }

      // Return response - onCall functions automatically handle CORS
      return { txId, status: 'AWAITING_DEPOSIT' }
    } catch (error: any) {
      console.error(`[tx_createBankDepositRequest] Failed to create transaction for user ${userId}`, {
        error: error.message,
        errorCode: error.code,
        userId,
        receiverId,
        amountZar,
      })
      throw new functions.https.HttpsError('internal', 'Failed to create transaction', error)
    }
  })

