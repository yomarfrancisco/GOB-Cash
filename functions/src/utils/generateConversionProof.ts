/**
 * FX Conversion Confirmation for MozPay wholesale ZAR flow.
 * App confirmation, not an external bank proof of payment.
 */

import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import PDFDocument from 'pdfkit'

const db = admin.firestore()

const DISCLAIMER =
  'This confirmation records an FX conversion facilitated through MozPay. It is not a bank proof of payment.'

const SELLER = 'MozPay'
const BUYER = 'Moz Corridor Trader'

function mozLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, '../../assets/MoZ-logo.png'),
    path.join(process.cwd(), 'assets/MoZ-logo.png'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

export interface ConversionProofData {
  txId: string
  userId: string
  userHandle: string | null
  sourceCurrency: 'MZN' | 'ZAR'
  destinationCurrency: 'MZN' | 'ZAR'
  sourceAmount: number
  destinationAmount: number
  quotedRate: number
  costRate: number
  sellRate: number
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

function formatNumber(amount: number): string {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatMzn(amount: number): string {
  return `MT ${formatNumber(amount)}`
}

function formatZar(amount: number): string {
  return `R ${formatNumber(amount)}`
}

function majorFromMinor(minor: unknown): number {
  const n = Number(minor)
  if (!Number.isFinite(n)) return 0
  return Math.round(n) / 100
}

function roundMajor(value: number): number {
  return Math.round(value * 100) / 100
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
  const sellRate = Number(data.sellRateMZNperZAR || 0)
  const costRate = Number(data.costRateMZNperZAR || data.buyRateMZNperZAR || 0)
  const clientDest = majorFromMinor(data.clientDestinationAmountMinor)
  const destinationAmount =
    sourceCurrency === 'ZAR' && sellRate > 0
      ? clientDest || roundMajor(sourceAmount * sellRate) || Number(data.amountMzn || 0)
      : majorFromMinor(data.expectedDestinationAmountMinor) ||
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
    costRate,
    sellRate,
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

      const isZarSale = data.sourceCurrency === 'ZAR'
      const costRate = data.costRate > 0 ? data.costRate : data.quotedRate
      const sellRate = data.sellRate > 0 ? data.sellRate : data.quotedRate
      const spread = Math.max(0, sellRate - costRate)
      const marginPct = costRate > 0 ? (spread / costRate) * 100 : 0
      const zarSold = isZarSale ? data.sourceAmount : data.destinationAmount
      const mznReceived = isZarSale
        ? data.destinationAmount || roundMajor(zarSold * sellRate)
        : data.sourceAmount
      const costValue = roundMajor(zarSold * costRate)
      const reward = isZarSale
        ? data.rewardsMzn || roundMajor(zarSold * spread)
        : 0

      const logoPath = mozLogoPath()
      if (logoPath) {
        const logoWidth = 88
        doc.image(logoPath, (doc.page.width - logoWidth) / 2, 48, { width: logoWidth })
        doc.y = 48 + 52
      }
      doc.fontSize(16).font('Helvetica-Bold').text('FX Conversion Confirmation', { align: 'center' })
      doc.moveDown(0.8)

      const headline = isZarSale
        ? `${formatZar(zarSold)} to ${formatMzn(mznReceived)}`
        : `${formatMzn(data.sourceAmount)} to ${formatZar(data.destinationAmount)}`
      doc.fontSize(14).font('Helvetica-Bold').text(headline, { align: 'center' })
      doc.moveDown(1)

      const lineHeight = 22
      const leftMargin = 50
      const labelWidth = 220
      let yPos = doc.y

      const addRow = (label: string, value: string, boldValue = false) => {
        doc.font('Helvetica-Bold').fontSize(11).text(label, leftMargin, yPos, { width: labelWidth })
        doc.font(boldValue ? 'Helvetica-Bold' : 'Helvetica').text(value, leftMargin + labelWidth, yPos, {
          width: 280,
        })
        yPos += lineHeight
      }

      addRow('Direction:', `${data.sourceCurrency} to ${data.destinationCurrency}`)
      addRow(
        'Conversion type:',
        isZarSale ? 'Client sale' : 'Own-position / ZAR sourced'
      )
      if (isZarSale) {
        addRow('ZAR sold:', formatZar(zarSold))
        addRow('MZN received:', formatMzn(mznReceived), true)
        addRow('Client rate:', `${sellRate.toFixed(2)} MZN/ZAR`, true)
        addRow('Seller:', SELLER)
        addRow('Buyer:', BUYER)
        addRow('Asset sold:', 'ZAR')
        addRow('Settlement currency:', 'MZN')
      } else {
        addRow('MZN spent:', formatMzn(data.sourceAmount))
        addRow('ZAR sourced:', formatZar(data.destinationAmount), true)
        addRow('Cost rate:', `${costRate.toFixed(2)} MZN/ZAR`, true)
        addRow('Seller:', 'Your MZN balance')
        addRow('Buyer:', 'Your ZAR balance')
      }

      yPos += 8
      doc.font('Helvetica-Bold').fontSize(12).text('Rate & margin', leftMargin, yPos)
      yPos += lineHeight

      addRow('Source / cost rate:', `${costRate.toFixed(2)} MZN/ZAR`)
      addRow('Client sell rate:', `${sellRate.toFixed(2)} MZN/ZAR`)
      addRow('Spread:', `${spread.toFixed(2)} MZN/ZAR`)
      addRow('Margin on cost:', `${marginPct.toFixed(2)}%`, true)
      addRow('Reward / gross spread:', formatMzn(reward), true)
      if (isZarSale) {
        addRow('Underlying cost value:', formatMzn(costValue))
      }

      yPos += 8
      addRow('Status:', 'Completed')
      addRow('Transaction ID:', data.txId)
      addRow('Date:', formatTimestamp(data.timestamp))
      if (data.userHandle) addRow('Account:', data.userHandle)

      yPos += lineHeight
      doc.fontSize(10).font('Helvetica').text(DISCLAIMER, leftMargin, yPos, { width: 500 })
      yPos += lineHeight + 6
      doc.text('Generated by MozPay', leftMargin, yPos, { width: 500 })

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
