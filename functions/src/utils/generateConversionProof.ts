/**
 * Generate MozPay confirmation PDF for an internal MZN↔ZAR exchange.
 * App confirmation, not an external bank proof of payment.
 */

import * as admin from 'firebase-admin'
import PDFDocument from 'pdfkit'

const db = admin.firestore()

const DISCLAIMER =
  'MozPay transaction confirmation — this document is not an external bank proof of payment.'

export interface ConversionProofData {
  txId: string
  userId: string
  userHandle: string | null
  sourceCurrency: 'MZN' | 'ZAR'
  destinationCurrency: 'MZN' | 'ZAR'
  sourceAmount: number
  destinationAmount: number
  quotedRate: number
  buyRate: number | null
  sellRate: number | null
  rewardsMzn: number
  status: string
  timestamp: admin.firestore.Timestamp
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

function formatAmount(currency: 'MZN' | 'ZAR', amount: number): string {
  const value = Number(amount || 0).toFixed(2)
  return currency === 'MZN' ? `Mt ${value}` : `R${value}`
}

function majorFromMinor(minor: unknown): number {
  const n = Number(minor)
  if (!Number.isFinite(n)) return 0
  return Math.round(n) / 100
}

export async function getConversionData(txId: string): Promise<ConversionProofData | null> {
  const txSnap = await db.collection('transactions').doc(txId).get()
  if (!txSnap.exists) return null

  const data = txSnap.data()!
  const type = String(data.type || data.transactionType || '')
  if (type !== 'CONVERSION') return null

  const sourceCurrency = data.sourceCurrency === 'ZAR' ? 'ZAR' : 'MZN'
  const destinationCurrency = data.destinationCurrency === 'ZAR' ? 'ZAR' : 'MZN'
  const sourceAmount =
    majorFromMinor(data.sourceAmountMinor) ||
    Number(sourceCurrency === 'MZN' ? data.amountMzn : data.amountZar) ||
    0
  const destinationAmount =
    majorFromMinor(data.expectedDestinationAmountMinor) ||
    Number(destinationCurrency === 'MZN' ? data.amountMzn : data.amountZar) ||
    0

  const userSnap = await db.collection('users').doc(String(data.userId || '')).get()
  const userData = userSnap.exists ? userSnap.data()! : {}

  return {
    txId,
    userId: String(data.userId || ''),
    userHandle: userData?.userHandle || userData?.handle || null,
    sourceCurrency,
    destinationCurrency,
    sourceAmount,
    destinationAmount,
    quotedRate: Number(data.quotedRate || data.fxRateMZNperZAR || 0),
    buyRate: Number.isFinite(Number(data.buyRateMZNperZAR)) ? Number(data.buyRateMZNperZAR) : null,
    sellRate: Number.isFinite(Number(data.sellRateMZNperZAR)) ? Number(data.sellRateMZNperZAR) : null,
    rewardsMzn: majorFromMinor(data.rewardsMznMinor),
    status: String(data.instructionStatus || data.status || 'INITIATED'),
    timestamp: data.createdAt || admin.firestore.Timestamp.now(),
  }
}

export function generateConversionProofPdf(data: ConversionProofData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      })

      const buffers: Buffer[] = []
      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)

      doc.fontSize(24).font('Helvetica-Bold').text('MozPay', 50, 50, { align: 'center' })
      doc.fontSize(18).font('Helvetica-Bold').text('Proof of Payment', 50, 90, { align: 'center' })

      doc.moveTo(50, 130).lineTo(550, 130).stroke()

      let yPos = 160
      const lineHeight = 25
      const leftMargin = 50
      const labelWidth = 200
      const status = data.status.toUpperCase() === 'INITIATED' ? 'Instructed' : data.status

      doc.fontSize(12).font('Helvetica')

      const rows: Array<[string, string]> = [
        ['Document type:', 'APP_CONFIRMATION'],
        ['Issuer:', 'MozPay'],
        ['Transaction ID:', data.txId],
        ['Status:', status],
        ['From:', formatAmount(data.sourceCurrency, data.sourceAmount)],
        ['To:', formatAmount(data.destinationCurrency, data.destinationAmount)],
        ['Rate:', data.quotedRate > 0 ? `${data.quotedRate.toFixed(2)} Mt/R` : '—'],
      ]

      if (data.sellRate && data.buyRate && data.sellRate !== data.buyRate) {
        rows.push(['Sell:', `${data.sellRate.toFixed(2)} Mt/R`])
        rows.push(['Buy:', `${data.buyRate.toFixed(2)} Mt/R`])
      }

      if (data.rewardsMzn > 0) {
        rows.push(['Rewards:', formatAmount('MZN', data.rewardsMzn)])
      }
      rows.push(['User:', data.userHandle || data.userId])
      rows.push(['Instructed at:', formatTimestamp(data.timestamp)])

      for (const [label, value] of rows) {
        doc.font('Helvetica-Bold').text(label, leftMargin, yPos, { width: labelWidth })
        doc.font('Helvetica').text(value || '—', leftMargin + labelWidth, yPos, { width: 300 })
        yPos += lineHeight
      }

      yPos += lineHeight
      doc.fontSize(10).font('Helvetica').text(DISCLAIMER, leftMargin, yPos, { width: 500 })
      yPos += lineHeight + 8
      doc.text('Generated by MozPay', leftMargin, yPos, { width: 500 })

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
