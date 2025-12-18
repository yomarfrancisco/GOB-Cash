/**
 * Generate PDF proof of payment for withdrawal
 * Server-side generation for credibility
 */

import * as admin from 'firebase-admin'
import PDFDocument from 'pdfkit'

const db = admin.firestore()

export interface WithdrawalProofData {
  withdrawalId: string
  chainTxId: string
  amountUSDT: number
  amountZAR_debited: number
  fxRate: number
  network: string
  toAddress: string
  userId: string
  userHandle: string | null
  timestamp: admin.firestore.Timestamp
}

/**
 * Fetch withdrawal data from Firestore
 */
export async function getWithdrawalData(withdrawalId: string): Promise<WithdrawalProofData | null> {
  const withdrawalRef = db.collection('withdrawals').doc(withdrawalId)
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
    withdrawalId,
    chainTxId: withdrawalData.txId || '',
    amountUSDT: withdrawalData.sentAmountUSDT || withdrawalData.requestedAmountUSDT || 0,
    amountZAR_debited: withdrawalData.amountZAR_debited || 0,
    fxRate: withdrawalData.fxRate || 18.1,
    network: withdrawalData.network || 'TRON',
    toAddress: withdrawalData.toAddress || '',
    userId: withdrawalData.userId,
    userHandle: userData?.userHandle || userData?.handle || null,
    timestamp: withdrawalData.createdAt || admin.firestore.Timestamp.now(),
  }
}

/**
 * Generate PDF buffer for withdrawal proof
 */
export function generateWithdrawalProofPdf(data: WithdrawalProofData): Promise<Buffer> {
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
        .text('Proof of Payment', 50, 90, { align: 'center' })
      
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
        .text(data.withdrawalId, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Transaction Hash
      doc.font('Helvetica-Bold')
        .text('Transaction Hash:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.chainTxId || 'N/A', leftMargin + labelWidth, yPos, { width: 300 })
      yPos += lineHeight
      
      // Amount
      doc.font('Helvetica-Bold')
        .text('Amount:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(`${data.amountUSDT.toFixed(6)} USDT`, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Amount in ZAR
      doc.font('Helvetica-Bold')
        .text('Amount (ZAR):', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(`R${data.amountZAR_debited.toFixed(2)}`, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Exchange Rate
      doc.font('Helvetica-Bold')
        .text('Exchange Rate:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(`${data.fxRate} ZAR/USDT`, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Network
      doc.font('Helvetica-Bold')
        .text('Network:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.network, leftMargin + labelWidth, yPos)
      yPos += lineHeight
      
      // Recipient Address
      doc.font('Helvetica-Bold')
        .text('Recipient Address:', leftMargin, yPos, { width: labelWidth })
      doc.font('Helvetica')
        .text(data.toAddress, leftMargin + labelWidth, yPos, { width: 300 })
      yPos += lineHeight * 2
      
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
        .text('This document serves as proof of payment for the above withdrawal transaction.', leftMargin, yPos, { width: 500 })
      yPos += lineHeight
      doc.text('Generated by GoBankless', leftMargin, yPos, { width: 500 })
      
      // TronScan link
      if (data.chainTxId) {
        yPos += lineHeight
        doc.text(`View on TronScan: https://tronscan.org/#/transaction/${data.chainTxId}`, leftMargin, yPos, { width: 500 })
      }
      
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

