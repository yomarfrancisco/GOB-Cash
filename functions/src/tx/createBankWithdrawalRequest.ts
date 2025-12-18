/**
 * Cloud Function: tx_createBankWithdrawalRequest
 * 
 * Creates a bank withdrawal request transaction and chat messages.
 * Similar to deposit flow but for withdrawals.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import type { TxStatus } from './state'

const db = admin.firestore()

export const tx_createBankWithdrawalRequest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }

    const userId = context.auth.uid
    const {
      amountZAR,
      country,
      bankName,
      accountHolderName,
      accountNumber,
      swiftBic,
    } = data

    // Validate input
    if (!amountZAR || typeof amountZAR !== 'number' || amountZAR <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amountZAR must be a positive number')
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

    const now = admin.firestore.Timestamp.now()
    
    // Generate transaction ID
    const txRef = db.collection('transactions').doc()
    const txId = txRef.id

    // Note: User handle is not needed for bank withdrawal creation
    // It will be fetched when generating the PDF proof if needed

    // Create bank withdrawal record
    const bankWithdrawalRef = db.collection('bankWithdrawals').doc(txId)
    const bankWithdrawal = {
      id: txId,
      userId,
      amountZAR,
      country: country.trim(),
      bankName: (bankName || `${country} Bank`).trim(),
      accountHolderName: accountHolderName.trim(),
      accountNumber: accountNumber.trim(),
      swiftBic: swiftBic.trim(),
      status: 'PENDING',
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
      amountZar: amountZAR,
      bankWithdrawalId: txId, // Link to /bankWithdrawals/{txId}
      bankWithdrawal: {
        country: country.trim(),
        bankName: (bankName || `${country} Bank`).trim(),
        accountHolderName: accountHolderName.trim(),
        accountNumber: accountNumber.trim(),
        swiftBic: swiftBic.trim(),
      },
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

    // Write transaction, bank withdrawal record, and message atomically
    await db.runTransaction(async (t) => {
      t.set(txRef, transaction)
      t.set(bankWithdrawalRef, bankWithdrawal)
      t.set(sambaMsgRef, sambaMessage)
    })

    console.log(`[tx_createBankWithdrawalRequest] Created transaction ${txId} for bank withdrawal`)

    return {
      txId,
      bankWithdrawalId: txId,
    }
  })

