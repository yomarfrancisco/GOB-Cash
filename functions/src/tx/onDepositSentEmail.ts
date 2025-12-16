/**
 * Firestore Trigger: onDepositSentEmail
 * 
 * Sends email notification to info@brics.ninja when user marks deposit as SENT.
 * 
 * Trigger: transactions/{txId}/messages/{msgId}.onCreate
 * Conditions:
 * - message.senderType === 'USER' or 'CUSTOMER'
 * - message.text normalized equals "SENT"
 * - transaction.type === 'BANK_DEPOSIT_TO_USDT_TRON'
 * 
 * Email includes: txId, user info, deposit amount, bank details, reference, timestamp
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const db = admin.firestore()

// Email configuration from environment
const EMAIL_TO = 'info@brics.ninja'
const EMAIL_FROM = functions.config().email?.from || 'noreply@gobankless.com'

/**
 * Send email using Resend API
 */
async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = functions.config().resend?.api_key
  if (!apiKey) {
    console.error('[onDepositSentEmail] RESEND_API_KEY not configured')
    throw new Error('Email service not configured')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[onDepositSentEmail] Resend API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    })
    throw new Error(`Resend API error: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  console.log('[onDepositSentEmail] Email sent successfully:', result.id)
}

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
            <p>Transaction: <a href="https://console.firebase.google.com/project/${functions.config().project?.id || 'gobankless-dev'}/firestore/data/transactions/${txId}">View in Firebase Console</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Firestore trigger: onMessageCreate
 * Triggers when a new message is created in transactions/{txId}/messages
 */
export const onDepositSentEmail = functions.firestore
  .document('transactions/{txId}/messages/{msgId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data()
    const txId = context.params.txId

    // Check if this is a USER/CUSTOMER message with text "SENT"
    if (
      (message.senderType !== 'USER' && message.senderType !== 'CUSTOMER') ||
      message.text?.trim().toUpperCase() !== 'SENT'
    ) {
      return null // Not a SENT message, skip
    }

    try {
      // Load transaction document
      const txRef = db.collection('transactions').doc(txId)
      const txSnap = await txRef.get()

      if (!txSnap.exists) {
        console.error('[onDepositSentEmail] Transaction not found:', txId)
        return null
      }

      const tx = txSnap.data()!

      // Check if this is a bank deposit transaction
      if (tx.type !== 'BANK_DEPOSIT_TO_USDT_TRON') {
        return null // Not a bank deposit, skip
      }

      // Check idempotency: only send email if not already sent
      if (tx.depositSentEmailAt) {
        console.log('[onDepositSentEmail] Email already sent for transaction:', txId)
        return null
      }

      // Load user document to get handle and email
      const userRef = db.collection('users').doc(tx.userId)
      const userSnap = await userRef.get()
      const userData = userSnap.data()

      const userHandle = userData?.userHandle || null
      const userEmail = userData?.email || null

      // Extract deposit details
      const amountZar = tx.amountZar || 0
      const currency = tx.depositCurrency || 'ZAR'
      const country = tx.bankCountry === 'MZ' ? 'Mozambique' : tx.bankCountry === 'ZA' ? 'South Africa' : null
      const bankName = tx.bankId || null
      const reference = tx.depositReference || null
      const timestamp = message.createdAt || admin.firestore.Timestamp.now()

      // Generate email content
      const emailSubject = `Deposit Marked as SENT - ${currency} ${amountZar.toFixed(2)}${userHandle ? ` (@${userHandle})` : ''}`
      const emailHtml = generateEmailContent(
        txId,
        userHandle,
        userEmail,
        tx.userId,
        amountZar,
        currency,
        country,
        bankName,
        reference,
        timestamp
      )

      // Send email
      await sendEmailViaResend(EMAIL_TO, emailSubject, emailHtml)

      // Mark email as sent (idempotency)
      await txRef.update({
        depositSentEmailAt: admin.firestore.Timestamp.now(),
      })

      console.log(`[onDepositSentEmail] Email notification sent for transaction ${txId}`)

      return null
    } catch (error) {
      console.error('[onDepositSentEmail] Error sending email notification:', {
        txId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw - allow message creation to succeed even if email fails
      return null
    }
  })

