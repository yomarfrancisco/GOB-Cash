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
  const dateStr = timestamp.toDate().toISOString()
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Deposit Marked as SENT</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Deposit Marked as SENT</h2>
        <p><strong>Transaction ID:</strong> ${txId}</p>
        <p><strong>User ID:</strong> ${userId}</p>
        ${userHandle ? `<p><strong>Handle:</strong> @${userHandle}</p>` : ''}
        ${userEmail ? `<p><strong>Email:</strong> ${userEmail}</p>` : ''}
        <p><strong>Amount:</strong> ${currency} ${amountZar.toFixed(2)}</p>
        ${country ? `<p><strong>Country:</strong> ${country}</p>` : ''}
        ${bankName ? `<p><strong>Bank:</strong> ${bankName}</p>` : ''}
        ${reference ? `<p><strong>Reference:</strong> ${reference}</p>` : ''}
        <p><strong>Timestamp:</strong> ${dateStr}</p>
      </body>
    </html>
  `
}

/**
 * Firestore trigger: Process transaction actions
 * Handles MARK_DEPOSIT_SENT actions by appending messages, updating status, and sending email
 */
export const onTxActionCreate = functions.firestore
  .document('transactions/{txId}/actions/{actionId}')
  .onCreate(async (snap, context) => {
    const action = snap.data()
    const { txId, actionId } = context.params

    // Top-of-handler log to confirm trigger fired
    console.log('[onTxActionCreate] fired', {
      path: context.resource.name,
      actionId,
      txId,
      actionType: action.type,
    })

    console.log(`[onTxActionCreate] Processing action ${actionId} of type ${action.type} for tx ${txId}`)

    // Only process MARK_DEPOSIT_SENT actions
    if (action.type !== 'MARK_DEPOSIT_SENT') {
      console.log(`[onTxActionCreate] Ignoring action type ${action.type}`)
      await snap.ref.update({ status: 'DONE', processedAt: admin.firestore.Timestamp.now() })
      return
    }

    const userId = action.createdBy
    if (!userId) {
      console.error(`[onTxActionCreate] Action ${actionId} missing createdBy`)
      await snap.ref.update({
        status: 'FAILED',
        errorMessage: 'Missing createdBy field',
        processedAt: admin.firestore.Timestamp.now(),
      })
      return
    }

    const now = admin.firestore.Timestamp.now()
    const txRef = db.collection('transactions').doc(txId)

    try {
      // Load transaction
      const txSnap = await txRef.get()
      if (!txSnap.exists) {
        throw new Error('Transaction not found')
      }

      const tx = txSnap.data()!

      // Verify user is the transaction owner
      if (tx.userId !== userId) {
        throw new Error('Not authorized for this transaction')
      }

      // Idempotency check: if already marked as sent, mark action as DONE and return
      if (tx.status === 'DEPOSIT_SENT' && tx.chatStep === 'WAITING_FOR_SENT_PROOF') {
        console.log(`[onTxActionCreate] Transaction ${txId} already marked as sent, marking action as DONE`)
        await snap.ref.update({
          status: 'DONE',
          processedAt: now,
          metadata: { alreadyProcessed: true },
        })
        return
      }

      // Assert valid transition
      assertTransition(tx.status, 'DEPOSIT_SENT')

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
        text: `Customer marked deposit as sent.`,
        metadata: {
          status: 'DEPOSIT_SENT',
        },
      }

      // Create acknowledgement message from Ama (if needed, idempotent)
      // Terminal message - no further wallet address prompts
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
          text: 'Thanks — deposit confirmation received ✅\n\nWe\'re verifying it with our bank now. Your GoBankless balance should update within a few minutes (often sooner).\n\nImportant: seeing your balance update doesn\'t mean withdrawals are enabled yet. Withdrawals are handled separately via the Withdraw flow once verification is complete.',
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
          console.log('[EMAIL] Attempting send', {
            from: emailFrom,
            to: emailTo,
            hasApiKey: Boolean(apiKey),
            txId,
            subject: emailSubject,
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
        } catch (error) {
          console.error('[EMAIL] Error sending email (non-blocking)', {
            txId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
          // Don't throw - function already succeeded
        }
      }

      // Mark action as DONE
      await snap.ref.update({
        status: 'DONE',
        processedAt: now,
        metadata: {
          sentMessageAdded: shouldAddSentMessage,
          ackMessageAdded: shouldAddAck,
          emailSent: shouldSendEmail,
        },
      })

      console.log(`[onTxActionCreate] Successfully processed MARK_DEPOSIT_SENT action ${actionId} for tx ${txId}`)
    } catch (error: any) {
      console.error(`[onTxActionCreate] Error processing action ${actionId}:`, error)
      // Mark action as FAILED
      await snap.ref.update({
        status: 'FAILED',
        errorMessage: error.message || 'Unknown error',
        processedAt: admin.firestore.Timestamp.now(),
      })
      // Don't throw - we've handled the error by marking the action as failed
    }
  })

