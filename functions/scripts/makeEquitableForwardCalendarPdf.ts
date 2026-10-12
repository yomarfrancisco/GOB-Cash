/**
 * Forward calendar PDF · 13 Oct – 13 Nov 2026
 * from the latest equitable-card / POS-band reallocated book.
 *
 * Oct 13–31: frozen equitable assignments from october-2026-reallocated-calendar.json
 * Nov 1–13: forward continuation via allocateDeskRoutes({ equitableCardShares: true })
 *
 * Run: cd functions && npx ts-node --transpile-only scripts/makeEquitableForwardCalendarPdf.ts
 */
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { OPERATING_POLICY_V1 } from '../src/operatingCalendar/operatingPolicyV1'
import {
  allocateDeskRoutes,
  cardsForOctoberDesk,
  type PlannedPayment,
} from '../src/operatingCalendar/allocateDeskRoutes'
import type { UnsignedSlot } from '../src/operatingCalendar/paymentBook'
import type { DayTarget } from '../src/operatingCalendar/monthFixtures'
import type { TerminalId } from '../src/operatingCalendar/operatingPolicyV1'
import { validateOperatingCalendar } from '../src/operatingCalendar/validateCalendar'
import { assertFinalDeskLedger } from '../src/operatingCalendar/finalLedgerConstraints'
import { roundMoney, sum } from '../src/throughput/model/math'
import { generateModeledInvoiceStream, allocateInvoicesToDays } from '../src/throughput/model/prospectiveBook'
import { prospectiveScenario } from '../src/throughput/prospective/runDay'
import { DESK_MONTH_TARGET_ZAR } from '../src/routing/deskMonth'

const IN_JSON = path.resolve(process.cwd(), '../tmp/october-2026-reallocated-calendar.json')
const OUT_PDF = path.resolve(process.cwd(), '../tmp/oct13-nov13-2026-equitable-calendar.pdf')
const OUT_JSON = path.resolve(process.cwd(), '../tmp/oct13-nov13-2026-equitable-calendar.json')
const RANGE_START = '2026-10-13'
const RANGE_END = '2026-11-13'
const NOV_SEED = 20261113
const NOV_MONTH_END = '2026-11-30'

const TERMINAL_LABEL: Record<TerminalId, string> = {
  WolfFNB: 'Wolf FNB',
  BricsFNB: 'Lemon FNB',
  BricsCapitec: 'Lemon Capitec',
  Imani: 'Imani FNB',
  Econometrica: 'Econometrica',
}

type DayCell = {
  iso: string
  sunday: boolean
  source: 'equitable-oct' | 'forward-nov' | 'sunday' | 'empty'
  totalZar: number
  payments: Array<{ timeLabel: string; amountZar: number; card: string; pos: string }>
  periodLabel: string
}

function money(n: number) {
  return Math.round(n * 100) / 100
}
function zar(n: number) {
  return `R${money(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}
function zarExact(n: number) {
  return `R${money(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function fmtMin(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
}
function eachIso(start: string, end: string): string[] {
  const out: string[] = []
  let cur = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10))
    cur = new Date(cur.getTime() + 86_400_000)
  }
  return out
}
function isSundayIso(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() === 0
}
function shortCard(name: string): string {
  if (name === 'WolfMoza') return 'WolfMz'
  if (name === 'GoblinMoza') return 'GobMz'
  return name.length > 8 ? name.slice(0, 7) : name
}
function compactPos(term: TerminalId): string {
  if (term === 'BricsCapitec') return 'LemonCap'
  if (term === 'BricsFNB') return 'LemonFNB'
  if (term === 'Econometrica') return 'ECM'
  if (term === 'WolfFNB') return 'Wolf'
  if (term === 'Imani') return 'Imani'
  return term
}

function cellsFromPayments(
  payments: PlannedPayment[],
  source: DayCell['source'],
  start: string,
  end: string
): Map<string, DayCell> {
  const map = new Map<string, DayCell>()
  for (const iso of eachIso(start, end)) {
    if (isSundayIso(iso)) {
      map.set(iso, {
        iso,
        sunday: true,
        source: 'sunday',
        totalZar: 0,
        payments: [],
        periodLabel: '',
      })
      continue
    }
    const list = payments
      .filter((p) => p.date === iso)
      .sort((a, b) => a.attemptMin - b.attemptMin)
    const rows = list.map((p) => ({
      timeLabel: fmtMin(p.attemptMin),
      amountZar: p.amountZar,
      card: shortCard(p.cardId),
      pos: compactPos(p.terminalId),
    }))
    const times = rows.map((r) => r.timeLabel)
    map.set(iso, {
      iso,
      sunday: false,
      source: list.length ? source : 'empty',
      totalZar: money(sum(rows.map((r) => r.amountZar))),
      payments: rows,
      periodLabel:
        times.length === 0 ? '' : times.length === 1 ? times[0]! : `${times[0]}–${times[times.length - 1]}`,
    })
  }
  return map
}

/** Full November operating days — month bands need a full month, not a 13-day slice. */
function novemberFullOperatingIsos(): string[] {
  return eachIso('2026-11-01', NOV_MONTH_END).filter((iso) => !isSundayIso(iso))
}

function buildNovemberMonthPayments(targetZar: number): PlannedPayment[] {
  const novIsos = novemberFullOperatingIsos()
  const horizon = novIsos.length
  const scenario = prospectiveScenario({
    seed: NOV_SEED,
    availableZar: targetZar,
    initialCards: 8,
    initialPos: 5,
    horizonDays: Math.max(horizon, 14),
  })
  const invoices = generateModeledInvoiceStream({
    scenario,
    authorisedZar: targetZar,
    includeColdRouteStages: false,
    mozaColdStartLadders: 0,
  })
  const { book } = allocateInvoicesToDays({
    invoices,
    horizonDays: horizon,
    startDay: 1,
  })

  const slots: UnsignedSlot[] = []
  const patterns = [
    [9 * 60 + 5, 12 * 60 + 35, 15 * 60 + 10],
    [9 * 60 + 40, 13 * 60 + 5, 15 * 60 + 55],
    [10 * 60 + 15, 13 * 60 + 40, 16 * 60 + 10],
  ]
  novIsos.forEach((iso, dayIndex0) => {
    const engineDay = dayIndex0 + 1
    const tickets = book[engineDay] || []
    if (!tickets.length) return
    const amounts = tickets.map((t) => t.amount)
    const pattern = patterns[dayIndex0 % patterns.length]!
    amounts.forEach((amountZar, slotIndex) => {
      const attemptMin = pattern[Math.min(slotIndex, pattern.length - 1)]!
      slots.push({
        date: iso,
        dayIndex0,
        slotIndex,
        amountZar,
        attemptMin,
        timeSast: `${String(Math.floor(attemptMin / 60)).padStart(2, '0')}:${String(attemptMin % 60).padStart(2, '0')}`,
      })
    })
  })

  return allocateDeskRoutes({
    slots,
    networkState: 'established',
    cards: cardsForOctoberDesk(),
    monthLabel: '202611',
    requireLiveExecutable: true,
    equitableCardShares: true,
  })
}

function drawMonthGrid(
  doc: PDFKit.PDFDocument,
  year: number,
  month: number,
  cells: Map<string, DayCell>,
  meta: { banner: string; subtitle: string }
) {
  const margin = 28
  const pageW = doc.page.width - 56
  const pageH = doc.page.height - 56
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  doc.fillColor('#111').font('Helvetica-Bold').fontSize(14)
  doc.text(meta.banner, margin, 16, { width: pageW })
  doc.font('Helvetica').fontSize(8).fillColor('#444')
  doc.text(meta.subtitle, margin, 34, { width: pageW })

  doc.fontSize(7)
  doc.fillColor('#1a5f3a').text('Equitable Oct book', margin, 50)
  doc.fillColor('#1a4a7a').text('Forward Nov (same rules)', 140, 50)
  doc.fillColor('#666').text('Sunday · settlement only', 300, 50)

  const firstWd = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const lead = (firstWd + 6) % 7
  const cols = 7
  const rows = Math.ceil((lead + daysInMonth) / 7)
  const headerH = 12
  const gridTop = 62
  const gridH = pageH - 48
  const cellW = pageW / cols
  const cellH = (gridH - headerH) / rows

  ;['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#222').text(h, margin + i * cellW + 3, gridTop + 1, {
      width: cellW - 6,
    })
  })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dayNum = row * 7 + col - lead + 1
      const x = margin + col * cellW
      const y = gridTop + headerH + row * cellH
      doc.strokeColor('#ddd').lineWidth(0.5).rect(x, y, cellW, cellH).stroke()
      if (dayNum < 1 || dayNum > daysInMonth) continue

      const iso = `${year}-${pad2(month)}-${pad2(dayNum)}`
      const inRange = iso >= RANGE_START && iso <= RANGE_END
      const cell = cells.get(iso)

      if (!inRange) {
        doc.save()
        doc.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1).fillColor('#fafafa').fill()
        doc.restore()
        doc.font('Helvetica').fontSize(8).fillColor('#bbb').text(String(dayNum), x + 3, y + 2)
        continue
      }

      const sunday = cell?.sunday || isSundayIso(iso)
      if (sunday) {
        doc.save()
        doc.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1).fillColor('#f5f5f5').fill()
        doc.restore()
      } else if (cell?.source === 'equitable-oct' && cell.payments.length) {
        doc.save()
        doc.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1).fillColor('#f3faf6').fill()
        doc.restore()
      } else if (cell?.source === 'forward-nov' && cell.payments.length) {
        doc.save()
        doc.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1).fillColor('#f0f5fb').fill()
        doc.restore()
      }

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
      doc.text(String(dayNum), x + 3, y + 2, { width: cellW - 6 })

      let ty = y + 12
      if (sunday) {
        doc.font('Helvetica').fontSize(5.5).fillColor('#666')
        doc.text('Settlement only', x + 3, ty, { width: cellW - 6 })
        continue
      }
      if (!cell || !cell.payments.length) {
        doc.font('Helvetica').fontSize(5.5).fillColor('#999').text('No intake', x + 3, ty)
        continue
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(cell.source === 'forward-nov' ? '#1a4a7a' : '#1a5f3a')
      doc.text(`${zar(cell.totalZar)} · ${cell.payments.length} pay`, x + 3, ty, {
        width: cellW - 6,
        ellipsis: true,
      })
      ty += 8
      doc.font('Helvetica').fontSize(5.5).fillColor('#333')
      doc.text(`Window ${cell.periodLabel}`, x + 3, ty, { width: cellW - 6, ellipsis: true })
      ty += 7
      doc.font('Helvetica').fontSize(5).fillColor('#222')
      const lines = cell.payments.map(
        (p) => `${p.timeLabel}  ${zarExact(p.amountZar)}  ${p.card}→${p.pos}`
      )
      doc.text(lines.join('\n'), x + 3, ty, {
        width: cellW - 6,
        height: Math.max(8, y + cellH - ty - 3),
        lineGap: 0.4,
        ellipsis: true,
      })
    }
  }

  doc.font('Helvetica').fontSize(5.5).fillColor('#666')
  doc.text(
    'Equitable card shares · POS ≥15% (ECM ≥16%) · Lemon ≤35% · Capitec 25–35% · zero unrouted',
    margin,
    doc.page.height - 16,
    { width: pageW }
  )
}

function drawRegister(doc: PDFKit.PDFDocument, cells: DayCell[]) {
  const margin = 28
  const pageW = doc.page.width - 56
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
  let y = 28
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111')
  doc.text('Daily payment register · 13 Oct – 13 Nov 2026 · equitable', margin, y)
  y += 16
  const colW = [72, 36, 70, 78, 95, 110, 180, 80]
  const headers = ['Date', 'N', 'Day total', 'Period', 'Time', 'Amount', 'Card → POS', 'Source']
  const drawHeader = () => {
    let x = margin
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#222')
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colW[i]! - 2 })
      x += colW[i]!
    })
    y += 12
    doc.strokeColor('#ccc').moveTo(margin, y - 2).lineTo(margin + pageW, y - 2).stroke()
  }
  drawHeader()
  for (const cell of cells) {
    if (cell.sunday) {
      if (y > doc.page.height - 40) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
        y = 28
        drawHeader()
      }
      doc.font('Helvetica').fontSize(7).fillColor('#888')
      doc.text(cell.iso, margin, y, { width: colW[0]! - 2 })
      doc.text('Sunday · settlement only', margin + colW[0]!, y)
      y += 12
      continue
    }
    if (!cell.payments.length) continue
    for (let i = 0; i < cell.payments.length; i++) {
      if (y > doc.page.height - 36) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
        y = 28
        drawHeader()
      }
      const p = cell.payments[i]!
      const src = cell.source === 'equitable-oct' ? 'eq Oct' : cell.source === 'forward-nov' ? 'fwd Nov' : ''
      const row =
        i === 0
          ? [
              cell.iso,
              String(cell.payments.length),
              zarExact(cell.totalZar),
              cell.periodLabel,
              p.timeLabel,
              zarExact(p.amountZar),
              `${p.card} → ${p.pos}`,
              src,
            ]
          : ['', '', '', '', p.timeLabel, zarExact(p.amountZar), `${p.card} → ${p.pos}`, '']
      let x = margin
      doc.font('Helvetica').fontSize(7).fillColor('#222')
      row.forEach((c, j) => {
        doc.text(c, x, y, { width: colW[j]! - 2, ellipsis: true })
        x += colW[j]!
      })
      y += 11
    }
    y += 3
  }
}

function shareTable(
  payments: PlannedPayment[],
  keyOf: (p: PlannedPayment) => string
): Array<{ key: string; n: number; zar: number; shareN: number; shareV: number }> {
  const totN = payments.length
  const totV = money(sum(payments.map((p) => p.amountZar)))
  const map = new Map<string, { n: number; zar: number }>()
  for (const p of payments) {
    const k = keyOf(p)
    const cur = map.get(k) || { n: 0, zar: 0 }
    cur.n += 1
    cur.zar = money(cur.zar + p.amountZar)
    map.set(k, cur)
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      n: v.n,
      zar: v.zar,
      shareN: totN ? v.n / totN : 0,
      shareV: totV ? v.zar / totV : 0,
    }))
    .sort((a, b) => b.zar - a.zar)
}

async function main() {
  if (!fs.existsSync(IN_JSON)) throw new Error(`Missing ${IN_JSON} — run makeLiveOctoberReallocatedCalendar first`)
  const prev = JSON.parse(fs.readFileSync(IN_JSON, 'utf8')) as {
    payments: PlannedPayment[]
    bookHash?: string
    assignmentHash?: string
    equitableCardShares?: boolean
    totalZar?: number
    invoiceCount?: number
  }
  const octAll = prev.payments || []
  if (!octAll.length) throw new Error('No payments in reallocated calendar JSON')
  if (!prev.equitableCardShares) {
    console.warn('Warning: source JSON was not marked equitableCardShares=true')
  }

  const octForward = octAll.filter((p) => p.date >= RANGE_START && p.date <= '2026-10-31')
  const octZar = money(sum(octForward.map((p) => p.amountZar)))
  const novTarget = DESK_MONTH_TARGET_ZAR

  // Full November month under equitable rules (bands need a month, not a 13-day cut).
  const novMonthPayments = buildNovemberMonthPayments(novTarget)
  assertFinalDeskLedger(novMonthPayments, {
    enforceReferenceCapitecBand: true,
    label: 'november-month-equitable',
  })
  const novWindowPayments = novMonthPayments.filter((p) => p.date >= '2026-11-01' && p.date <= RANGE_END)

  const novDays: DayTarget[] = []
  const byNovDate = new Map<string, PlannedPayment[]>()
  for (const p of novMonthPayments) {
    byNovDate.set(p.date, [...(byNovDate.get(p.date) || []), p])
  }
  for (const [date, list] of [...byNovDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    novDays.push({
      date,
      targetZar: money(sum(list.map((p) => p.amountZar))),
      paymentCount: list.length,
    })
  }
  const novValidation = validateOperatingCalendar({
    payments: novMonthPayments,
    days: novDays,
    networkState: 'established',
    expectedTotalZar: money(sum(novMonthPayments.map((p) => p.amountZar))),
    expectedPaymentCount: novMonthPayments.length,
    requireFullMeshContinuity: false,
    enforceReferenceCapitecBand: true,
    enforcePosMonthFloors: true,
  })

  const octCells = cellsFromPayments(octForward, 'equitable-oct', RANGE_START, '2026-10-31')
  const novCells = cellsFromPayments(novWindowPayments, 'forward-nov', '2026-11-01', RANGE_END)
  const all = new Map<string, DayCell>()
  for (const [k, v] of octCells) all.set(k, v)
  for (const [k, v] of novCells) all.set(k, v)
  const sorted = [...all.values()]
    .filter((c) => c.iso >= RANGE_START && c.iso <= RANGE_END)
    .sort((a, b) => a.iso.localeCompare(b.iso))

  const windowPayments = [...octForward, ...novWindowPayments]
  const byPos = shareTable(windowPayments, (p) => TERMINAL_LABEL[p.terminalId] || p.terminalId)
  const byCard = shareTable(windowPayments, (p) => p.cardId)
  const novMonthZar = money(sum(novMonthPayments.map((p) => p.amountZar)))
  const novWindowZar = money(sum(novWindowPayments.map((p) => p.amountZar)))

  fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true })
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 })
  const stream = fs.createWriteStream(OUT_PDF)
  doc.pipe(stream)

  drawMonthGrid(doc, 2026, 10, all, {
    banner: 'PAGA forward calendar · 13 Oct – 13 Nov 2026 · equitable cards + POS bands',
    subtitle: `Source bookHash ${prev.bookHash || 'n/a'} · Oct live equitable · Nov from full-month equitable book · R619.7k targets`,
  })
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
  drawMonthGrid(doc, 2026, 11, all, {
    banner: 'PAGA forward calendar · November slice (through 13 Nov)',
    subtitle: `Full Nov month ${zarExact(novMonthZar)} under equitable rules · showing 1–13 only · validator ${novValidation.ok ? 'ok' : 'FAIL'}`,
  })
  drawRegister(doc, sorted)

  // Summary page
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
  let y = 28
  const margin = 28
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111')
  doc.text('Window summary · equitable forward', margin, y)
  y += 18
  doc.font('Helvetica').fontSize(9).fillColor('#222')
  const winZar = money(sum(sorted.filter((c) => c.payments.length).map((c) => c.totalZar)))
  const winPays = sorted.reduce((n, c) => n + c.payments.length, 0)
  for (const line of [
    `Range ${RANGE_START} → ${RANGE_END}`,
    `Payments ${winPays} · Booked ${zarExact(winZar)} (Oct ${zarExact(octZar)} · Nov window ${zarExact(novWindowZar)} · Nov full month ${zarExact(novMonthZar)})`,
    `Oct source: equitable reallocated book · Nov: full-month allocateDeskRoutes equitableCardShares`,
    `Nov month validator: ${novValidation.ok ? 'ok' : novValidation.gates.filter((g) => !g.pass).map((g) => g.id).join(',')}`,
  ]) {
    doc.text(line, margin, y)
    y += 14
  }
  y += 8
  doc.font('Helvetica-Bold').fontSize(11).text('POS', margin, y)
  y += 14
  doc.font('Helvetica').fontSize(8)
  for (const r of byPos) {
    doc.text(
      `${r.key}: n=${r.n} (${(r.shareN * 100).toFixed(1)}%) · ${zarExact(r.zar)} (${(r.shareV * 100).toFixed(1)}%)`,
      margin,
      y
    )
    y += 12
  }
  y += 8
  doc.font('Helvetica-Bold').fontSize(11).text('Card', margin, y)
  y += 14
  doc.font('Helvetica').fontSize(8)
  for (const r of byCard) {
    doc.text(
      `${r.key}: n=${r.n} (${(r.shareN * 100).toFixed(1)}%) · ${zarExact(r.zar)} (${(r.shareV * 100).toFixed(1)}%)`,
      margin,
      y
    )
    y += 12
  }

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  const report = {
    ok: novValidation.ok,
    outPdf: OUT_PDF,
    range: { start: RANGE_START, end: RANGE_END },
    sourceBookHash: prev.bookHash,
    sourceAssignmentHash: prev.assignmentHash,
    october: { n: octForward.length, zar: octZar },
    november: {
      windowN: novWindowPayments.length,
      windowZar: novWindowZar,
      monthN: novMonthPayments.length,
      monthZar: novMonthZar,
      targetZar: novTarget,
      validatorOk: novValidation.ok,
    },
    window: { n: winPays, zar: winZar },
    byPos,
    byCard,
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
