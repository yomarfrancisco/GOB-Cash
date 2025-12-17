/**
 * Cloud Function: tx_userMarkDepositSent
 * 
 * User marks deposit as sent.
 * Transitions: AWAITING_DEPOSIT -> DEPOSIT_SENT
 * 
 * Adds acknowledgement message and email notification.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { assertTransition } from './state'

const db = admin.firestore()

// Email configuration - will be read from functions.config() at runtime

/**
 * Generate email HTML content
 */
function generateEmailContent(
  txId: string,
  userHandle: string | null,
  userEmail: string | null,
  userId: string,
  amountZar: number,
  currency: string,
  country: string | null,
  bankName: string | null,
  reference: string | null,
  timestamp: admin.firestore.Timestamp
): string {
  const formattedDate = timestamp.toDate().toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #000; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .detail-row { margin: 12px 0; padding: 8px; background: #fff; border-radius: 4px; }
        .label { font-weight: 600; color: #666; }
        .value { color: #000; margin-top: 4px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Deposit Marked as SENT</h1>
        </div>
        <div class="content">
          <p>A user has marked their deposit as sent. Details below:</p>
          
          <div class="detail-row">
            <div class="label">Transaction ID</div>
            <div class="value">${txId}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">User</div>
            <div class="value">
              ${userHandle ? `@${userHandle}` : 'No handle'}<br>
              ${userEmail || 'No email'}<br>
              UID: ${userId}
            </div>
          </div>
          
          <div class="detail-row">
            <div class="label">Deposit Amount</div>
            <div class="value">${currency} ${amountZar.toFixed(2)}</div>
          </div>
          
          ${country ? `
          <div class="detail-row">
            <div class="label">Country</div>
            <div class="value">${country}</div>
          </div>
          ` : ''}
          
          ${bankName ? `
          <div class="detail-row">
            <div class="label">Bank</div>
            <div class="value">${bankName}</div>
          </div>
          ` : ''}
          
          ${reference ? `
          <div class="detail-row">
            <div class="label">Reference</div>
            <div class="value">${reference}</div>
          </div>
          ` : ''}
          
          <div class="detail-row">
            <div class="label">Timestamp</div>
            <div class="value">${formattedDate}</div>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from GoBankless.</p>
            <p>Transaction: <a href="https://console.firebase.google.com/project/gobankless-dev/firestore/data/transactions/${txId}">View in Firebase Console</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

export const tx_userMarkDepositSent = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const { txId, reference } = data

    if (!txId || typeof txId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'txId is required')
    }

    const txRef = db.collection('transactions').doc(txId)
    const txSnap = await txRef.get()

    if (!txSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found')
    }

    const tx = txSnap.data()!

    // Verify user is the transaction owner
    if (tx.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized for this transaction')
    }

    // Idempotency check: if already marked as sent, return early
    if (tx.status === 'DEPOSIT_SENT' && tx.chatStep === 'WAITING_FOR_SENT_PROOF') {
      console.log(`[tx_userMarkDepositSent] Transaction ${txId} already marked as sent, returning early`)
      return { ok: true, status: 'DEPOSIT_SENT', chatStep: 'WAITING_FOR_SENT_PROOF', alreadyProcessed: true }
    }

    // Assert valid transition
    assertTransition(tx.status, 'DEPOSIT_SENT')

    const now = admin.firestore.Timestamp.now()
    
    // Set expiration time (4 hours for DEPOSIT_SENT)
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 4 * 60 * 60 * 1000 // 4 hours
    )

    // Format currency for user message: MZN X,XXX.XX or ZAR X,XXX.XX
    const currency = tx.depositCurrency || (tx.bankCountry === 'MZ' ? 'MZN' : 'ZAR')
    const formattedAmount = tx.amountZar.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    const depositMessageText = `I've deposited ${currency} ${formattedAmount}`

    // Check idempotency: check if deposit confirmation message already exists
    // Look for either old "SENT" format or new "I've deposited MZN X,XXX.XX" format
    const existingSentMessages = await txRef.collection('messages')
      .where('senderType', '==', 'USER')
      .where('text', 'in', ['SENT', depositMessageText])
      .limit(1)
      .get()

    const shouldAddSentMessage = existingSentMessages.empty

    // Check if acknowledgement message already exists (idempotency)
    const existingAckMessages = await txRef.collection('messages')
      .where('senderType', '==', 'SAMBA')
      .where('metadata.chatStep', '==', 'WAITING_FOR_SENT_PROOF')
      .limit(1)
      .get()

    const shouldAddAck = existingAckMessages.empty

    // Check idempotency: only send email if not already sent
    const shouldSendEmail = !tx.emailNotifiedSent

    // Load user document for email and acknowledgement
    const userRef = db.collection('users').doc(userId)
    const userSnap = await userRef.get()
    const userData = userSnap.data()
    const userHandle = userData?.userHandle || null
    const userEmail = userData?.email || null

    // Create "I've deposited MZN X,XXX.XX" user message (if needed, idempotent)
    let sentMsgRef: admin.firestore.DocumentReference | null = null
    let sentMessage: any = null
    if (shouldAddSentMessage) {
      sentMsgRef = txRef.collection('messages').doc()
      sentMessage = {
        id: sentMsgRef.id,
        txId,
        createdAt: now,
        senderType: 'USER' as const,
        senderId: userId,
        text: depositMessageText, // "I've deposited MZN X,XXX.XX"
      }
    }

    // Create SYSTEM message (internal log)
    const systemMsgRef = txRef.collection('messages').doc()
    const systemMessage = {
      id: systemMsgRef.id,
      txId,
      createdAt: now,
      senderType: 'SYSTEM' as const,
      text: reference
        ? `Customer marked deposit as sent. Reference: ${reference}.`
        : `Customer marked deposit as sent.`,
      metadata: {
        status: 'DEPOSIT_SENT',
        reference: reference || null,
      },
    }

    // Create acknowledgement message from Ama (if needed, idempotent)
    let ackMsgRef: admin.firestore.DocumentReference | null = null
    let ackMessage: any = null
    if (shouldAddAck) {
      ackMsgRef = txRef.collection('messages').doc()
      ackMessage = {
        id: ackMsgRef.id,
        txId,
        createdAt: now,
        senderType: 'SAMBA' as const,
        senderUid: 'samba',
        text: 'Got it ✅ I\'ve notified our team. Please upload proof of payment here when ready.',
        metadata: {
          chatStep: 'WAITING_FOR_SENT_PROOF',
        },
      }
    }

    // Update transaction and create messages atomically
    await db.runTransaction(async (t) => {
      const updateData: any = {
        status: 'DEPOSIT_SENT',
        statusUpdatedAt: now,
        expiresAt, // Timeout for DEPOSIT_SENT state
        chatStep: 'WAITING_FOR_SENT_PROOF', // Update chatStep for deposit flow
        updatedAt: now, // Update timestamp
      }

      // Mark email as sent (idempotency)
      if (shouldSendEmail) {
        updateData.emailNotifiedSent = true
      }

      t.update(txRef, updateData)
      
      // Add "SENT" user message if needed
      if (sentMsgRef && sentMessage) {
        t.set(sentMsgRef, sentMessage)
      }
      
      t.set(systemMsgRef, systemMessage)
      
      // Add acknowledgement message if needed
      if (ackMsgRef && ackMessage) {
        t.set(ackMsgRef, ackMessage)
      }
    })

    // Send email notification (non-blocking, after transaction succeeds)
    // Read config inside handler (not module-level) to avoid cold start issues
    if (shouldSendEmail) {
      try {
        // Get config inside function handler (v1 functions support this)
        const apiKey = functions.config().resend?.api_key
        const emailFrom = functions.config().email?.from
        const emailTo = functions.config().email?.to

        // Explicit config validation and logging
        if (!apiKey) {
          console.warn('[EMAIL] Skipping send - resend.api_key not configured', { txId })
          return
        }
        if (!emailFrom) {
          console.warn('[EMAIL] Skipping send - email.from not configured', { txId })
          return
        }
        if (!emailTo) {
          console.warn('[EMAIL] Skipping send - email.to not configured', { txId })
          return
        }

        if (apiKey) {
          const amountZar = tx.amountZar || 0
          const currency = tx.depositCurrency || 'ZAR'
          const country = tx.bankCountry === 'MZ' ? 'Mozambique' : tx.bankCountry === 'ZA' ? 'South Africa' : null
          const bankName = tx.bankId || null
          const reference = tx.depositReference || null

          const emailSubject = `Deposit Marked as SENT - ${currency} ${amountZar.toFixed(2)}${userHandle ? ` (@${userHandle})` : ''}`
          const emailHtml = generateEmailContent(
            txId,
            userHandle,
            userEmail,
            userId,
            amountZar,
            currency,
            country,
            bankName,
            reference,
            now
          )

          // Log email attempt with all config values
          console.log('[EMAIL] attempt', {
            txId,
            from: emailFrom,
            to: emailTo,
            hasApiKey: !!apiKey,
          })

          // Send email using Resend API
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: emailFrom,
              to: [emailTo],
              subject: emailSubject,
              html: emailHtml,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('[EMAIL] Resend API error', {
              txId,
              status: response.status,
              statusText: response.statusText,
              error: errorText,
              from: emailFrom,
              to: emailTo,
            })
            // Don't throw - function already succeeded
          } else {
            const result = await response.json()
            console.log('[EMAIL] Email notification sent', {
              txId,
              emailId: result.id,
              from: emailFrom,
              to: emailTo,
            })
          }
        }
      } catch (error) {
        console.error('[tx_userMarkDepositSent] Error sending email (non-blocking):', error)
        // Don't throw - function already succeeded
      }
    } else {
      console.log(`[tx_userMarkDepositSent] Email already sent for transaction ${txId}, skipping`)
    }

    console.log(`[tx_userMarkDepositSent] Transaction ${txId} marked as sent by user ${userId}, updated chatStep to WAITING_FOR_SENT_PROOF`)

    return { ok: true, status: 'DEPOSIT_SENT', chatStep: 'WAITING_FOR_SENT_PROOF' }
  })

