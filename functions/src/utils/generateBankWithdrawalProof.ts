/**
 * Generate PDF proof of payment for bank withdrawal
 */

import * as admin from 'firebase-admin'
import PDFDocument from 'pdfkit'

const db = admin.firestore()

export interface BankWithdrawalProofData {
  bankWithdrawalId: string
  amountZAR: number
  country: string
  bankName: string
  accountHolderName: string
  accountNumber: string
  swiftBic: string
  userId: string
  userHandle: string | null
  timestamp: admin.firestore.Timestamp
}

/**
 * Fetch bank withdrawal data from Firestore
 */
export async function getBankWithdrawalData(bankWithdrawalId: string): Promise<BankWithdrawalProofData | null> {
  const withdrawalRef = db.collection('bankWithdrawals').doc(bankWithdrawalId)
  const withdrawalSnap = await withdrawalRef.get()
  
  if (!withdrawalSnap.exists) {
    return null
  }
  
  const withdrawalData = withdrawalSnap.data()!
  
  // Get user info
  const userRef = db.collection('users').doc(withdrawalData.userId)
  const userSnap = await userRef.get()
  const userData = userSnap.exists ? userSnap.data()! : {}
  
  return {
    bankWithdrawalId,
    amountZAR: withdrawalData.requestedAmountZAR || withdrawalData.amountZAR || 0, // Use requestedAmountZAR as source of truth
    country: withdrawalData.country || '',
    bankName: withdrawalData.bankName || '',
    accountHolderName: withdrawalData.accountHolderName || '',
    accountNumber: withdrawalData.accountNumber || '',
    swiftBic: withdrawalData.swiftBic || '',
    userId: withdrawalData.userId,
    userHandle: userData?.userHandle || userData?.handle || null,
    timestamp: withdrawalData.createdAt || admin.firestore.Timestamp.now(),
  }
}

/**
 * Generate PDF buffer for bank withdrawal proof
 */
export function generateBankWithdrawalProofPdf(data: BankWithdrawalProofData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      })
      
      const buffers: Buffer[] = []
      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers)
        resolve(pdfBuffer)
      })
      doc.on('error', reject)
      
      // Header
      doc.fontSize(24)
        .font('Helvetica-Bold')
        .text('GoBankless', 50, 50, { align: 'center' })
      
      doc.fontSize(18)
        .font('Helvetica-Bold')
        .text('Proof of Bank Withdrawal', 50, 90, { align: 'center' })
      
      // Line separator
      doc.moveTo(50, 130)
        .lineTo(550, 130)
        .stroke()
      
      // Content
      let yPos = 160
      const lineHeight = 25
      const leftMargin = 50
      const labelWidth = 200
      
      doc.fontSize(12)
        .font('Helvetica')
      
      // Withdrawal ID
      doc.font('Helvetica-Bold')
        .text('Withdrawal ID:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.bankWithdrawalId, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Amount
      doc.font('Helvetica-Bold')
        .text('Amount:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(`R${data.amountZAR.toFixed(2)}`, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Country
      doc.font('Helvetica-Bold')
        .text('Country:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.country, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Bank Name
      doc.font('Helvetica-Bold')
        .text('Bank:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.bankName, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Account Holder
      doc.font('Helvetica-Bold')
        .text('Account Holder:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.accountHolderName, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Account Number
      doc.font('Helvetica-Bold')
        .text('Account Number:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.accountNumber, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // SWIFT/BIC
      doc.font('Helvetica-Bold')
        .text('SWIFT/BIC:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.swiftBic, leftMargin + labelWidth, yPos)
      yPos += lineHeight * 2
      
      // User Handle/UID
      doc.font('Helvetica-Bold')
        .text('User:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.userHandle || data.userId, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Date/Time
      const date = data.timestamp.toDate()
      const formattedDate = date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
      
      doc.font('Helvetica-Bold')
        .text('Date & Time:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(formattedDate, leftMargin + labelWidth, yPos)
      yPos += lineHeight * 2
      
      // Footer
      doc.fontSize(10)
        .font('Helvetica')
        .text('This document serves as proof of payment for the above bank withdrawal request.', leftMargin, yPos, { width: 500 })
      yPos += lineHeight
      doc.text('Generated by GoBankless', leftMargin, yPos, { width: 500 })
      
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

