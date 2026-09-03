/**
 * Generate MozPaga confirmation PDF for a recorded bank withdrawal.
 * This is an app confirmation, not an external bank proof of payment.
 */

import * as admin from 'firebase-admin'
import PDFDocument from 'pdfkit'

const db = admin.firestore()

const DISCLAIMER =
  'MozPaga transaction confirmation — this document is not an external bank proof of payment.'

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
  documentType: 'APP_CONFIRMATION'
  issuer: 'MOZPAGA'
  instructionStatus: string | null
  bankWithdrawalStatus: string | null
  externalReference: string | null
  confirmedAt: admin.firestore.Timestamp | null
}

function isBankConfirmed(data: BankWithdrawalProofData): boolean {
  const statuses = [data.instructionStatus, data.bankWithdrawalStatus]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase())
  return statuses.some((status) =>
    status === 'BANK_CONFIRMED' ||
    status === 'WITHDRAWAL_CONFIRMED' ||
    status === 'CONFIRMED'
  )
}

function formatTimestamp(timestamp: admin.firestore.Timestamp): string {
  return timestamp.toDate().toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

/**
 * Fetch bank withdrawal data from Firestore
 */
export async function getBankWithdrawalData(bankWithdrawalId: string): Promise<BankWithdrawalProofData | null> {
  const withdrawalRef = db.collection('bankWithdrawals').doc(bankWithdrawalId)
  const txRef = db.collection('transactions').doc(bankWithdrawalId)
  const [withdrawalSnap, txSnap] = await Promise.all([withdrawalRef.get(), txRef.get()])

  if (!withdrawalSnap.exists) {
    return null
  }

  const withdrawalData = withdrawalSnap.data()!
  const txData = txSnap.exists ? txSnap.data()! : {}

  const userRef = db.collection('users').doc(withdrawalData.userId)
  const userSnap = await userRef.get()
  const userData = userSnap.exists ? userSnap.data()! : {}

  const confirmedAt = txData.confirmedAt || withdrawalData.confirmedAt || null

  return {
    bankWithdrawalId,
    amountZAR: withdrawalData.requestedAmountZAR || withdrawalData.amountZAR || 0,
    country: withdrawalData.country || '',
    bankName: withdrawalData.bankName || '',
    accountHolderName: withdrawalData.accountHolderName || '',
    accountNumber: withdrawalData.accountNumber || '',
    swiftBic: withdrawalData.swiftBic || '',
    userId: withdrawalData.userId,
    userHandle: userData?.userHandle || userData?.handle || null,
    timestamp: withdrawalData.createdAt || admin.firestore.Timestamp.now(),
    documentType: 'APP_CONFIRMATION',
    issuer: 'MOZPAGA',
    instructionStatus: txData.instructionStatus || null,
    bankWithdrawalStatus: withdrawalData.status || null,
    externalReference: txData.externalReference || withdrawalData.externalReference || null,
    confirmedAt: confirmedAt && typeof confirmedAt.toDate === 'function' ? confirmedAt : null,
  }
}

/**
 * Stamp MozPaga confirmation metadata on the linked transaction if missing.
 * Existing withdrawals created before this field still become APP_CONFIRMATION on download.
 */
export async function stampAppConfirmationOnTransaction(txId: string): Promise<void> {
  const txRef = db.collection('transactions').doc(txId)
  const txSnap = await txRef.get()
  if (!txSnap.exists) return

  const data = txSnap.data() || {}
  const patch: Record<string, string> = {}
  if (data.documentType !== 'APP_CONFIRMATION') patch.documentType = 'APP_CONFIRMATION'
  if (data.issuer !== 'MOZPAGA') patch.issuer = 'MOZPAGA'
  if (Object.keys(patch).length === 0) return

  await txRef.update(patch)
}

/**
 * Generate PDF buffer for MozPaga withdrawal confirmation
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

      const bankConfirmed = isBankConfirmed(data)

      doc.fontSize(24)
        .font('Helvetica-Bold')
        .text('MozPaga', 50, 50, { align: 'center' })

      doc.fontSize(18)
        .font('Helvetica-Bold')
        .text('Settlement Confirmation', 50, 90, { align: 'center' })

      doc.moveTo(50, 130)
        .lineTo(550, 130)
        .stroke()

      let yPos = 160
      const lineHeight = 25
      const leftMargin = 50
      const labelWidth = 200

      doc.fontSize(12)
        .font('Helvetica')

      const rows: Array<[string, string]> = [
        ['Document type:', data.documentType],
        ['Issuer:', 'MozPaga'],
        ['Transaction ID:', data.bankWithdrawalId],
        ['Status:', bankConfirmed ? 'Bank confirmed' : 'Instructed'],
        ['Amount:', `R${Number(data.amountZAR || 0).toFixed(2)}`],
        ['Country:', data.country],
        ['Bank:', data.bankName],
        ['Account holder:', data.accountHolderName],
        ['Account number:', data.accountNumber],
        ['SWIFT/BIC:', data.swiftBic],
        ['User:', data.userHandle || data.userId],
        ['Instructed at:', formatTimestamp(data.timestamp)],
      ]

      if (data.externalReference) {
        rows.push(['External reference:', String(data.externalReference)])
      }
      if (data.confirmedAt) {
        rows.push(['Confirmed at:', formatTimestamp(data.confirmedAt)])
      }

      for (const [label, value] of rows) {
        doc.font('Helvetica-Bold')
          .text(label, leftMargin, yPos, { width: labelWidth })
        doc.font('Helvetica')
          .text(value || '—', leftMargin + labelWidth, yPos, { width: 300 })
        yPos += lineHeight
      }

      yPos += lineHeight
      doc.fontSize(10)
        .font('Helvetica')
        .text(DISCLAIMER, leftMargin, yPos, { width: 500 })
      yPos += lineHeight + 8
      doc.text('Generated by MozPaga', leftMargin, yPos, { width: 500 })

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
