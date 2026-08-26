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
import { fetchQuotedMznPerZar } from '../fx/quotedMznZar'

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
      amountMzn,
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
    if (!amountMzn || typeof amountMzn !== 'number' || amountMzn <= 0) {
      console.error('[tx_createBankDepositRequest] Invalid amountMzn', { amountMzn, type: typeof amountMzn })
      throw new functions.https.HttpsError('invalid-argument', 'amountMzn must be a positive number')
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

    const fxRateMZNperZAR = await fetchQuotedMznPerZar()
    const amountZar = Math.round((amountMzn / fxRateMZNperZAR) * 100) / 100
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
      amountMzn,
      amountZar,
      fxRateMZNperZAR,
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
    const requestCurrency = depositCurrency || (bankCountry === 'MZ' ? 'MZN' : 'ZAR')
    const requestAmount = requestCurrency === 'MZN' ? amountMzn : amountZar
    const message = {
      id: msgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: `Bank deposit request created for ${requestCurrency} ${requestAmount.toFixed(2)}. Please deposit the funds and mark as sent.`,
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
        amountMzn,
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
          
          // Format currency: MZN X,XXX.XX or ZAR X,XXX.XX
          const currency = depositCurrency || (bankCountry === 'MZ' ? 'MZN' : 'ZAR')
          const depositAmount = currency === 'MZN' ? amountMzn : amountZar
          const formattedAmount = depositAmount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
          const amountDisplay = `${currency} ${formattedAmount}`
          
          const countryName = bankCountry === 'MZ' ? 'Mozambique' : bankCountry === 'ZA' ? 'South Africa' : ''
          const bankName = bankId || 'your bank'

          // Generate Ama intro message with compact formatting and button reference
          // Use single \n only - will be rendered as single block with white-space: pre-line
          // Three compact paragraphs with line gaps between them
          const walletCurrency = currency === 'MZN' ? 'MZN balance' : 'ZAR balance'
          const introText = `Hi ${handleCustomer} — I'm Ama from GoBankless.\n\nTo confirm:\n• Deposit amount: **${amountDisplay}**\n• Deposit method: Direct bank transfer\n• Country: ${countryName}\n• Bank: ${bankName}\n• You will receive: ${walletCurrency}\n• Next step: After you send the bank transfer, confirm by tapping the button below **"I've deposited"** and upload proof of payment (screenshot, PDF or reference).\n\nWhen you're ready, **tap the button below**.`

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

