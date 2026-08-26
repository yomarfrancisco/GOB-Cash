/**
 * Cloud Function: tx_createBankWithdrawalRequest
 * 
 * Creates a bank withdrawal request transaction and chat messages.
 * Similar to deposit flow but for withdrawals.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import type { TxStatus } from './state'
import { sendEmailViaResend, getCoreAgentEmail } from '../utils/resendEmail'
import { fetchQuotedMznPerZar } from '../fx/quotedMznZar'

const db = admin.firestore()

export const tx_createBankWithdrawalRequest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const {
      amountMZN,
      country,
      bankName,
      accountHolderName,
      accountNumber,
      swiftBic,
    } = data

    // Validate input
    if (!amountMZN || typeof amountMZN !== 'number' || amountMZN <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountMZN must be a positive number')
    }

    if (!country || typeof country !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'country is required')
    }

    if (!accountHolderName || typeof accountHolderName !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'accountHolderName is required')
    }

    if (!accountNumber || typeof accountNumber !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'accountNumber is required')
    }

    if (!swiftBic || typeof swiftBic !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'swiftBic is required')
    }

    const fxRateMZNperZAR = await fetchQuotedMznPerZar()
    const amountZARFromMzn = Math.round((amountMZN / fxRateMZNperZAR) * 100) / 100
    const amountZAR = typeof data.amountZAR === 'number' && data.amountZAR > 0
      ? Math.round(data.amountZAR * 100) / 100
      : amountZARFromMzn
    const amountMinor = Math.round(amountZAR * 100)
    const now = admin.firestore.Timestamp.now()
    const linkedBankId = typeof data.linkedBankId === 'string' && data.linkedBankId.trim()
      ? data.linkedBankId.trim()
      : null
    const groupId = typeof data.groupId === 'string' && data.groupId.trim()
      ? data.groupId.trim()
      : null
    const destinationAccountMasked = maskAccountNumber(accountNumber)
    
    // Generate transaction ID
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id

    // Create bank withdrawal record with requestedAmountZAR
    const bankWithdrawalRef = db.collection('bankWithdrawals').doc(txId)
    const bankWithdrawal = {
      id: txId,
      userId,
      requestedAmountMZN: amountMZN,
      requestedAmountZAR: amountZAR, // Use requestedAmountZAR as source of truth
      amountMZN,
      amountZAR: amountZAR, // Keep for backward compatibility
      fxRateMZNperZAR,
      country: country.trim(),
      bankName: (bankName || `${country} Bank`).trim(),
      accountHolderName: accountHolderName.trim(),
      accountNumber: accountNumber.trim(),
      swiftBic: swiftBic.trim(),
      status: 'REQUESTED',
      createdAt: now,
      updatedAt: now,
    }

    const participants = [userId, 'samba']

    // Create transaction document
    const transaction = {
      id: txId,
      type: 'WITHDRAWAL_BANK' as const,
      userId,
      participants,
      status: 'WITHDRAWAL_REQUESTED' as TxStatus,
      createdAt: now,
      statusUpdatedAt: now,
      updatedAt: now,
      amountMzn: amountMZN,
      amountZar: amountZAR,
      fxRateMZNperZAR,
      bankWithdrawalId: txId, // Link to /bankWithdrawals/{txId}
      bankWithdrawal: {
        country: country.trim(),
        bankName: (bankName || `${country} Bank`).trim(),
        accountHolderName: accountHolderName.trim(),
        accountNumber: accountNumber.trim(),
        swiftBic: swiftBic.trim(),
      },
      // Corridor instruction (manual confirmation still happens in Firebase)
      transactionType: 'WITHDRAWAL',
      uiAction: 'WITHDRAW',
      instructionSource: 'USER_INSTRUCTED',
      recordingSource: 'USER_UI',
      executionChannel: 'EXTERNAL_BANK',
      currency: 'ZAR',
      amountMinor,
      linkedBankId,
      counterpartyName: accountHolderName.trim(),
      destinationBankName: (bankName || `${country} Bank`).trim(),
      destinationCountry: country.trim(),
      destinationAccountMasked,
      instructionStatus: 'INITIATED',
      documentType: 'APP_CONFIRMATION',
      issuer: 'MOZPAY',
      groupId: groupId || txId,
    }

    // Format message content
    const formattedAmount = `R${amountZAR.toFixed(2)}`
    const bankDisplayName = bankName || `${country} Bank`
    
    // Create SAMBA confirmation message with button metadata
    const sambaMsgRef = txRef.collection('messages').doc()
    const sambaMessage = {
      id: sambaMsgRef.id,
      txId,
      createdAt: now,
      senderType: 'SAMBA' as const,
      senderUid: 'samba',
      text: `Bank withdrawal request received ✅\n\n**Amount:** ${formattedAmount}\n**Method:** Bank transfer\n**Country:** ${country}\n**Bank:** ${bankDisplayName}\n**Account holder:** ${accountHolderName}\n\nYou will receive ${formattedAmount} in your bank account.\n\n*Note: Bank payouts typically take 24–72 hours depending on your bank/network.*`,
      metadata: {
        bankWithdrawalId: txId, // Store for PDF download button
        hasDownloadButton: true, // Flag to show download button in UI
      },
    }

    const activityTitle = 'Withdrawal instructed'
    const activityBody = `R${amountZAR.toFixed(2)} to ${accountHolderName.trim()} · ${bankDisplayName}`
    const activityEventRef = db.collection('users').doc(userId).collection('activityEvents').doc(txId)
    const activityEvent = {
      id: txId,
      kind: 'WITHDRAWAL_INSTRUCTED',
      title: activityTitle,
      body: activityBody,
      actorType: 'ai_manager',
      avatarKind: 'zar_withdrawn',
      amountCurrency: 'ZAR',
      amountValue: amountZAR,
      amountSign: 'debit',
      counterpartyName: accountHolderName.trim(),
      destinationBankName: bankDisplayName,
      txId,
      createdAt: now,
      recordingSource: 'USER_UI',
    }

    // Reserve ZAR and write transaction, bank withdrawal record, and message atomically
    const cashZarRef = db.collection('users').doc(userId).collection('wallets').doc('cashZAR')
    
    // Guard against oversized ZAR withdrawals before any documents are written.
    const preflightZarSnap = await cashZarRef.get()
    const preflightZar = Number(preflightZarSnap.exists ? preflightZarSnap.data()?.fiatBalance || 0 : 0)
    if (amountMinor > Math.round(preflightZar * 100)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Insufficient ZAR balance.'
      )
    }

    await db.runTransaction(async (t) => {
      // Reads must happen before writes
      const cashZarSnap = await t.get(cashZarRef)
      const cashZarData = cashZarSnap.exists ? cashZarSnap.data()! : {}
      const availableZar = Number(cashZarData?.fiatBalance || 0)
      const availableZarMinor = Math.round(availableZar * 100)
      const currentLockedZar = Number(cashZarData?.bankWithdrawLockedZar || 0)
      const currentLockedZarMinor = Math.round(currentLockedZar * 100)

      if (amountMinor > availableZarMinor) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient ZAR balance.'
        )
      }

      if (!cashZarSnap.exists) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Insufficient ZAR balance.'
        )
      }

      t.update(cashZarRef, {
        fiatBalance: (availableZarMinor - amountMinor) / 100,
        bankWithdrawLockedZar: (currentLockedZarMinor + amountMinor) / 100,
        updatedAt: now,
      })
      
      // Write transaction, bank withdrawal record, and message
      t.set(txRef, transaction)
      t.set(bankWithdrawalRef, bankWithdrawal)
      t.set(sambaMsgRef, sambaMessage)
      t.set(activityEventRef, activityEvent)
    })

    console.log(`[tx_createBankWithdrawalRequest] Created transaction ${txId} for bank withdrawal`)

    return {
      txId,
      bankWithdrawalId: txId,
    }
  })

export const onBankWithdrawalCreated = functions
  .region('us-central1')
  .firestore.document('bankWithdrawals/{withdrawalId}')
  .onCreate(async (snapshot) => {
    const data = snapshot.data()
    if (!data || data.emailSent) return

    const withdrawalId = snapshot.id
    const userId = data.userId as string
    const amountZAR = Number(data.requestedAmountZAR ?? data.amountZAR ?? 0)
    const country = String(data.country || '')
    const bankName = String(data.bankName || `${country} Bank`)
    const accountHolderName = String(data.accountHolderName || '')
    const accountNumber = String(data.accountNumber || '')
    const swiftBic = String(data.swiftBic || '')
    const createdAt = data.createdAt || admin.firestore.Timestamp.now()

    try {
      const userSnap = await db.collection('users').doc(userId).get()
      const userData = userSnap.exists ? userSnap.data()! : {}
      const userHandle = userData?.userHandle || userData?.handle || null
      const userEmail = userData?.email || null

      const emailSubject = `Bank Withdrawal Requested — ZAR ${amountZAR.toFixed(2)}${userHandle ? ` (@${userHandle})` : ''}`
      const emailHtml = generateBankWithdrawalEmailContent(
        withdrawalId,
        userHandle,
        userEmail,
        userId,
        amountZAR,
        country,
        bankName,
        accountHolderName,
        accountNumber,
        swiftBic,
        createdAt
      )

      await sendEmailViaResend(getCoreAgentEmail(), emailSubject, emailHtml)
      await snapshot.ref.update({
        emailSent: true,
        emailSentAt: admin.firestore.Timestamp.now(),
      })
      console.log(`[onBankWithdrawalCreated] Email notification sent for bank withdrawal ${withdrawalId}`)
    } catch (error) {
      console.error('[onBankWithdrawalCreated] Error sending email (non-blocking):', error)
    }
  })

function maskAccountNumber(accountNumber: string): string {
  const digits = String(accountNumber || '').replace(/\s+/g, '')
  if (digits.length <= 4) return '****'
  const visibleStart = Math.min(2, digits.length - 4)
  return `${digits.slice(0, visibleStart)}****${digits.slice(-4)}`
}

/**
 * Generate email HTML content for bank withdrawal notification
 * Mirrors the deposit email template style
 */
function generateBankWithdrawalEmailContent(
  withdrawalId: string,
  userHandle: string | null,
  userEmail: string | null,
  userId: string,
  amountZAR: number,
  country: string,
  bankName: string,
  accountHolderName: string,
  accountNumber: string,
  swiftBic: string,
  timestamp: admin.firestore.Timestamp
): string {
  const formattedDate = timestamp.toDate().toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const isoDate = timestamp.toDate().toISOString()

  // Note: MozPay confirmation PDF is available via getBankWithdrawalProof

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
        .button { display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 4px; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Bank Withdrawal Requested</h1>
        </div>
        <div class="content">
          <p>A user has requested a bank withdrawal. Details below:</p>
          
          <div class="detail-row">
            <div class="label">Withdrawal Request ID</div>
            <div class="value">${withdrawalId}</div>
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
            <div class="label">Amount (ZAR)</div>
            <div class="value">R${amountZAR.toFixed(2)}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">Method</div>
            <div class="value">Bank transfer</div>
          </div>
          
          <div class="detail-row">
            <div class="label">Country</div>
            <div class="value">${country}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">Bank Name</div>
            <div class="value">${bankName}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">Account Holder Name</div>
            <div class="value">${accountHolderName}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">SWIFT/BIC</div>
            <div class="value">${swiftBic}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">Account Number / IBAN</div>
            <div class="value">${accountNumber}</div>
          </div>
          
          <div class="detail-row">
            <div class="label">Timestamp</div>
            <div class="value">
              ${formattedDate}<br>
              <small style="color: #666;">ISO: ${isoDate}</small>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from GoBankless.</p>
            <p><strong>Confirmation PDF:</strong> Available via getBankWithdrawalProof callable function (withdrawalId: ${withdrawalId})</p>
            <p>Transaction: <a href="https://console.firebase.google.com/project/gobankless-dev/firestore/data/transactions/${withdrawalId}">View in Firebase Console</a></p>
            <p>Withdrawal: <a href="https://console.firebase.google.com/project/gobankless-dev/firestore/data/bankWithdrawals/${withdrawalId}">View Withdrawal Record</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

