/**
 * Weekly ZAR→MZN settlement statement PDF.
 * Instructed conversions are treated as completed. Not a bank proof of payment.
 */

import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import PDFDocument from 'pdfkit'

const db = admin.firestore()
const TZ = 'Africa/Johannesburg'

export const WEEKLY_SETTLEMENT_KIND = 'WEEKLY_SETTLEMENT_STATEMENT'

const DISCLAIMER =
  'How to read this statement: ZAR sold is the rand amount supplied during each conversion. MZN received is the corresponding metical settlement value at the client sell rate. Spread earned is the difference between the source / cost rate and the client sell rate, applied to the ZAR amount. Instructed conversions are shown as completed. This statement is a MozPaga account record and is not a bank proof of payment.'

function assetPath(filename: string): string | null {
  const candidates = [
    path.join(__dirname, '../../assets', filename),
    path.join(process.cwd(), 'assets', filename),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function drawCircularAvatar(
  doc: PDFKit.PDFDocument,
  imagePath: string,
  x: number,
  y: number,
  size: number
) {
  doc.save()
  doc.circle(x + size / 2, y + size / 2, size / 2).clip()
  doc.image(imagePath, x, y, { width: size, height: size })
  doc.restore()
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

function weekdayIndex(short: string): number {
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[short] ?? 1
}

function johannesburgYmd(date: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    y: Number(read('year')),
    m: Number(read('month')),
    d: Number(read('day')),
    weekday: weekdayIndex(read('weekday')),
  }
}

/** SAST is UTC+2 year-round. */
function utcFromJohannesburg(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, -2, 0, 0, 0))
}

function addDays(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

export type WeekWhich = 'current' | 'previous'

export type WeeklyPeriod = {
  id: string
  start: Date
  end: Date
  label: string
}

export function weeklyPeriod(which: WeekWhich, now = new Date()): WeeklyPeriod {
  const today = johannesburgYmd(now)
  const daysFromMonday = today.weekday === 0 ? 6 : today.weekday - 1
  let monday = addDays(today.y, today.m, today.d, -daysFromMonday)
  if (which === 'previous') monday = addDays(monday.y, monday.m, monday.d, -7)
  return periodFromMonday(monday.y, monday.m, monday.d)
}

export function periodFromId(periodId: string): WeeklyPeriod | null {
  const match = /^weekly-(\d{4})(\d{2})(\d{2})$/.exec(periodId)
  if (!match) return null
  return periodFromMonday(Number(match[1]), Number(match[2]), Number(match[3]))
}

function periodFromMonday(y: number, m: number, d: number): WeeklyPeriod {
  const nextMonday = addDays(y, m, d, 7)
  const lastDay = addDays(nextMonday.y, nextMonday.m, nextMonday.d, -1)
  const start = utcFromJohannesburg(y, m, d)
  const end = utcFromJohannesburg(nextMonday.y, nextMonday.m, nextMonday.d)
  const startLabel = formatDayMonth(y, m, d)
  const endLabel = formatDayMonth(lastDay.y, lastDay.m, lastDay.d)
  const sameMonth = m === lastDay.m && y === lastDay.y
  const monthYear = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(utcFromJohannesburg(lastDay.y, lastDay.m, lastDay.d))
  const label = sameMonth
    ? `${d}–${lastDay.d} ${monthYear}`
    : `${startLabel} – ${endLabel}`
  return {
    id: `weekly-${String(y)}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`,
    start,
    end,
    label,
  }
}

function formatDayMonth(y: number, m: number, d: number): string {
  const dt = utcFromJohannesburg(y, m, d)
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  }).format(dt)
}

function formatRowDate(timestamp: admin.firestore.Timestamp): string {
  return timestamp.toDate().toLocaleString('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
  })
}

export type WeeklyConversionRow = {
  txId: string
  timestamp: admin.firestore.Timestamp
  zarSold: number
  mznReceived: number
  sellRate: number
  costRate: number
  spreadEarned: number
}

export type WeeklySettlementData = {
  userId: string
  userHandle: string | null
  period: WeeklyPeriod
  rows: WeeklyConversionRow[]
  zarSold: number
  mznReceived: number
  spreadEarned: number
  avgSellRate: number
  avgCostRate: number
  avgSpread: number
  avgMarginPct: number
}

export function weeklySettlementFilename(data: WeeklySettlementData): string {
  const handle = (data.userHandle || 'account').replace(/^@/, '')
  return `MozPaga_Weekly_Settlement_${handle}_${data.period.id}.pdf`
}

export function weeklySettlementBody(data: WeeklySettlementData): string {
  return `${formatZar(data.zarSold)} sold · ${formatMzn(data.mznReceived)} received · ${data.period.label}`
}

function isZarSaleActivity(data: FirebaseFirestore.DocumentData): boolean {
  if (String(data.kind || '') !== 'CONVERSION_INSTRUCTED') return false
  if (data.amountCurrency === 'ZAR' || data.avatarKind === 'convert_zar') return true
  return String(data.title || '').includes('ZAR sold')
}

function parseActivityBody(body: string): { mznReceived: number; sellRate: number } {
  const mzn = /Mt\s*([\d,.]+)/i.exec(body)
  const rate = /SELL\s*([\d.]+)/i.exec(body)
  return {
    mznReceived: mzn ? Number(mzn[1].replace(/,/g, '')) : 0,
    sellRate: rate ? Number(rate[1]) : 0,
  }
}

function rowFromTx(
  txId: string,
  data: FirebaseFirestore.DocumentData
): WeeklyConversionRow | null {
  const type = String(data.type || data.transactionType || '')
  if (type && type !== 'CONVERSION') return null
  if (data.sourceCurrency && data.sourceCurrency !== 'ZAR') return null

  const zarSold =
    majorFromMinor(data.sourceAmountMinor) || Number(data.amountZar) || 0
  const sellRate = Number(data.sellRateMZNperZAR || data.quotedRate || 0)
  const costRate = Number(data.costRateMZNperZAR || data.buyRateMZNperZAR || 0)
  const clientDest = majorFromMinor(data.clientDestinationAmountMinor)
  const mznReceived =
    clientDest ||
    (sellRate > 0 ? roundMajor(zarSold * sellRate) : 0) ||
    Number(data.amountMzn || 0)
  const spreadPerZar = Math.max(0, sellRate - costRate)
  const spreadEarned =
    majorFromMinor(data.rewardsMznMinor) || roundMajor(zarSold * spreadPerZar)

  return {
    txId,
    timestamp: data.createdAt || admin.firestore.Timestamp.now(),
    zarSold,
    mznReceived,
    sellRate,
    costRate,
    spreadEarned,
  }
}

function rowFromActivity(
  eventId: string,
  data: FirebaseFirestore.DocumentData
): WeeklyConversionRow {
  const parsed = parseActivityBody(String(data.body || ''))
  const zarSold = Number(data.amountValue) || 0
  return {
    txId: String(data.txId || eventId),
    timestamp: data.createdAt || admin.firestore.Timestamp.now(),
    zarSold,
    mznReceived: parsed.mznReceived,
    sellRate: parsed.sellRate,
    costRate: 0,
    spreadEarned: 0,
  }
}

export async function loadWeeklySettlementData(
  userId: string,
  period: WeeklyPeriod
): Promise<WeeklySettlementData | null> {
  const start = admin.firestore.Timestamp.fromDate(period.start)
  const end = admin.firestore.Timestamp.fromDate(period.end)
  const eventsSnap = await db
    .collection('users')
    .doc(userId)
    .collection('activityEvents')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get()

  const conversionEvents = eventsSnap.docs.filter((docSnap) => isZarSaleActivity(docSnap.data()))
  const rows: WeeklyConversionRow[] = []

  for (const eventDoc of conversionEvents) {
    const eventData = eventDoc.data()
    const txId = String(eventData.txId || eventDoc.id)
    let row: WeeklyConversionRow | null = null
    const txSnap = await db.collection('transactions').doc(txId).get()
    if (txSnap.exists) {
      row = rowFromTx(txId, txSnap.data()!)
    }
    rows.push(row || rowFromActivity(eventDoc.id, eventData))
  }

  rows.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis())

  if (rows.length === 0) return null

  const zarSold = roundMajor(rows.reduce((sum, row) => sum + row.zarSold, 0))
  const mznReceived = roundMajor(rows.reduce((sum, row) => sum + row.mznReceived, 0))
  const spreadEarned = roundMajor(rows.reduce((sum, row) => sum + row.spreadEarned, 0))
  const avgSellRate = zarSold > 0 ? roundMajor(mznReceived / zarSold) : 0
  const costWeighted = rows.reduce((sum, row) => sum + row.zarSold * row.costRate, 0)
  const avgCostRate = zarSold > 0 ? roundMajor(costWeighted / zarSold) : 0
  const avgSpread = roundMajor(avgSellRate - avgCostRate)
  const avgMarginPct = avgCostRate > 0 ? roundMajor((avgSpread / avgCostRate) * 100) : 0

  const userSnap = await db.collection('users').doc(userId).get()
  const userData = userSnap.exists ? userSnap.data()! : {}

  return {
    userId,
    userHandle: userData?.userHandle || userData?.handle || null,
    period,
    rows,
    zarSold,
    mznReceived,
    spreadEarned,
    avgSellRate,
    avgCostRate,
    avgSpread,
    avgMarginPct,
  }
}

export async function loadWeeklySettlementUserIds(period: WeeklyPeriod): Promise<string[]> {
  const start = admin.firestore.Timestamp.fromDate(period.start)
  const end = admin.firestore.Timestamp.fromDate(period.end)
  const snap = await db
    .collection('transactions')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get()

  const ids = new Set<string>()
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (String(data.type || data.transactionType || '') !== 'CONVERSION') continue
    if (data.sourceCurrency !== 'ZAR') continue
    const userId = String(data.userId || '')
    if (userId) ids.add(userId)
  }
  return [...ids]
}

export function generateWeeklySettlementPdf(data: WeeklySettlementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 56, left: 50, right: 50 },
      })
      const buffers: Buffer[] = []
      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)

      const left = 50
      const width = 495
      let y = 48
      const logoPath = assetPath('MoZ-logo.png')
      if (logoPath) {
        doc.image(logoPath, left, y, { width: 88 })
        y += 58
      }

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#666666').text('MOZPAGA', left, y)
      y = doc.y + 4
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text('Weekly Settlement Statement', left, y)
      y = doc.y + 6
      const account = data.userHandle || 'MozPaga account'
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
        .text(`Account: ${account}  |  Period: ${data.period.label}`, left, y, { width })
      y = doc.y + 10
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
        .text('This statement summarises your ZAR sales for MZN during the reporting period.', left, y, { width })
      y = doc.y + 16

      const tileW = (width - 18) / 2
      const tileH = 52
      const tiles: Array<[string, string]> = [
        ['ZAR SOLD', formatZar(data.zarSold)],
        ['MZN RECEIVED', formatMzn(data.mznReceived)],
        ['AVG SELL RATE', `${data.avgSellRate.toFixed(4)} MZN/ZAR`],
        ['SPREAD EARNED', formatMzn(data.spreadEarned)],
      ]
      tiles.forEach((tile, index) => {
        const col = index % 2
        const row = Math.floor(index / 2)
        const x = left + col * (tileW + 18)
        const ty = y + row * (tileH + 10)
        doc.save()
        doc.roundedRect(x, ty, tileW, tileH, 6).fill('#F4F4F4')
        doc.restore()
        doc.font('Helvetica').fontSize(8).fillColor('#666666').text(tile[0], x + 10, ty + 10, { width: tileW - 20 })
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(tile[1], x + 10, ty + 24, { width: tileW - 20 })
      })
      y += tileH * 2 + 28

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Your conversions', left, y)
      y = doc.y + 8

      const cols = [
        { label: 'Date', x: left, w: 58 },
        { label: 'ZAR sold', x: left + 58, w: 88 },
        { label: 'Rate', x: left + 146, w: 58 },
        { label: 'MZN received', x: left + 204, w: 100 },
        { label: 'Spread earned', x: left + 304, w: 100 },
        { label: 'Status', x: left + 404, w: 90 },
      ]
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#666666')
      cols.forEach((col) => doc.text(col.label, col.x, y, { width: col.w }))
      y += 14
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#DDDDDD').lineWidth(0.5).stroke()
      y += 6

      const drawRow = (cells: string[], bold = false) => {
        if (y > 720) {
          doc.addPage()
          y = 50
        }
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#111111')
        cells.forEach((cell, index) => doc.text(cell, cols[index].x, y, { width: cols[index].w }))
        y += 16
      }

      for (const row of data.rows) {
        drawRow([
          formatRowDate(row.timestamp),
          formatZar(row.zarSold),
          row.sellRate.toFixed(2),
          formatMzn(row.mznReceived),
          formatMzn(row.spreadEarned),
          'Completed',
        ])
      }
      drawRow(
        [
          'TOTAL',
          formatZar(data.zarSold),
          data.avgSellRate.toFixed(4),
          formatMzn(data.mznReceived),
          formatMzn(data.spreadEarned),
          '',
        ],
        true
      )

      y += 10
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Weekly rate summary', left, y)
      y = doc.y + 8
      const summary = [
        ['Average source / cost rate', `${data.avgCostRate.toFixed(4)} MZN/ZAR`],
        ['Average sell rate', `${data.avgSellRate.toFixed(4)} MZN/ZAR`],
        ['Average spread', `${data.avgSpread.toFixed(4)} MZN/ZAR`],
        ['Average margin on cost', `${data.avgMarginPct.toFixed(2)}%`],
      ]
      summary.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(9).fillColor('#666666').text(label, left, y, { width: 240 })
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(value, left + 250, y, { width: 240 })
        y += 16
      })

      y += 8
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Settlement status', left, y)
      y = doc.y + 8
      const status = [
        ['Completed conversions', String(data.rows.length)],
        ['Pending conversions', '0'],
        ['Total conversions', String(data.rows.length)],
      ]
      status.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(9).fillColor('#666666').text(label, left, y, { width: 240 })
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(value, left + 250, y, { width: 240 })
        y += 16
      })

      y += 10
      doc.font('Helvetica').fontSize(8).fillColor('#666666').text(DISCLAIMER, left, y, { width, align: 'left' })
      y = doc.y + 16
      const avatarPath = assetPath('avatar-ariel.png')
      if (avatarPath) {
        if (y > 740) {
          doc.addPage()
          y = 50
        }
        drawCircularAvatar(doc, avatarPath, left, y, 48)
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
