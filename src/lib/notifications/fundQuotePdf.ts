'use client'

import { jsPDF } from 'jspdf'
import {
  formatDeskMajorMzn,
  formatDeskMajorZar,
  formatDeskMinorZar,
} from '@/lib/desk/deskMoneyFormat'
import {
  buildWolfMozaPaymentReference,
  FUND_MZN_ACCOUNT_NUMBER,
  FUND_MZN_BANK,
  FUND_MZN_RECIPIENT,
} from '@/lib/notifications/welcomeSignIn'

const PAGE_W = 210
const MARGIN = 22

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function row(
  doc: jsPDF,
  y: number,
  label: string,
  value: string,
  opts?: { strong?: boolean }
): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(94, 94, 102)
  doc.text(label, MARGIN, y)
  doc.setFont('helvetica', opts?.strong ? 'bold' : 'normal')
  doc.setFontSize(12)
  doc.setTextColor(24, 24, 27)
  doc.text(value, PAGE_W - MARGIN, y, { align: 'right' })
  return y + 10
}

/**
 * Fund calculator → quote PDF (wire instructions). No desk message.
 */
export async function downloadFundQuotePdf(params: {
  amountMZN: number
  amountZAR: number
}): Promise<void> {
  const amountMZN = Math.round(Number(params.amountMZN) * 100) / 100
  const amountZAR = Math.round(Number(params.amountZAR) * 100) / 100
  if (!(amountMZN > 0.005) || !(amountZAR > 0.005)) return

  const paymentReference = buildWolfMozaPaymentReference()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(24, 24, 27)
  doc.text('PAGA fund quote', MARGIN, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(94, 94, 102)
  doc.text('Send MZN to Moza. Quote at today’s sell rate.', MARGIN, y)
  y += 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(24, 24, 27)
  doc.text(formatDeskMajorMzn(amountMZN), MARGIN, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(94, 94, 102)
  doc.text(`About ${formatDeskMinorZar(amountZAR)} · ${formatDeskMajorZar(amountZAR)}`, MARGIN, y)
  y += 16

  doc.setDrawColor(230, 228, 220)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 12

  y = row(doc, y, 'Recipient', FUND_MZN_RECIPIENT, { strong: true })
  y = row(doc, y, 'Bank', FUND_MZN_BANK)
  y = row(doc, y, 'NIB', FUND_MZN_ACCOUNT_NUMBER, { strong: true })
  y = row(doc, y, 'Reference', paymentReference, { strong: true })
  y += 8

  doc.setDrawColor(230, 228, 220)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(94, 94, 102)
  const note = doc.splitTextToSize(
    'Always include the reference. The first R100,000 a day is instant; the rest follows by 09:00 on the plan we show you.',
    PAGE_W - MARGIN * 2
  )
  doc.text(note, MARGIN, y)

  const stamp = new Date()
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`
  const blob = doc.output('blob')
  triggerDownload(blob, `PAGA-fund-quote-${ymd}-${Math.round(amountZAR)}.pdf`)
}
