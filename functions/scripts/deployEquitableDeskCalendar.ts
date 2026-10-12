/**
 * Push the equitable Oct desk calendar into the live app window.
 *
 * - Fresh R619.7k run under absorbing-tickets-v8-equitable-cards
 * - Tickets + forced card×POS from tmp/october-2026-reallocated-calendar.json
 * - Pull to refresh, then Next 24h walks this book
 *
 * Run: cd functions && npx ts-node --transpile-only scripts/deployEquitableDeskCalendar.ts
 */
import * as admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import type { CoreTicket } from '../src/throughput/model/types'
import type { ProspectiveBook } from '../src/throughput/model/prospectiveBook'
import { DESK_MONTH_HORIZON_DAYS, DESK_MONTH_TARGET_ZAR } from '../src/routing/deskMonth'
import { roundMoney, sum } from '../src/throughput/model/math'
import type { TerminalId } from '../src/operatingCalendar/operatingPolicyV1'

const PROJECT = 'gobankless-dev'
const IN_JSON = path.resolve(process.cwd(), '../tmp/october-2026-reallocated-calendar.json')
const OUT = path.resolve(process.cwd(), '../tmp/october-2026-equitable-desk-deploy.json')

const CARD_TO_RESOURCE: Record<string, string> = {
  BRICS: 'card-1',
  Ginav: 'card-2',
  Vidrotec: 'card-3',
  Wolf: 'card-4',
  Goblin: 'card-5',
  Kayman: 'card-6',
  WolfMoza: 'card-7',
  GoblinMoza: 'card-8',
}

const TERMINAL_TO_POS: Record<TerminalId, string> = {
  BricsFNB: 'pos-1',
  Imani: 'pos-2',
  BricsCapitec: 'pos-3',
  WolfFNB: 'pos-4',
  Econometrica: 'pos-5',
}

type CalPayment = {
  date: string
  amountZar: number
  attemptMin: number
  economicPaymentId: string
  invoiceId?: string
  cardId: string
  terminalId: TerminalId
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function initAdmin() {
  if (admin.apps.length) return
  const adc =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(
      process.env.HOME || '',
      '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
    )
  if (fs.existsSync(adc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adc
  }
  admin.initializeApp({ projectId: PROJECT })
}

function engineDayFromIso(iso: string): number {
  const day = Number(iso.slice(8, 10))
  if (!Number.isFinite(day) || day < 1 || day > DESK_MONTH_HORIZON_DAYS) {
    throw new Error(`Bad calendar date ${iso}`)
  }
  return day
}

/** Desk hard rule: one purchase per card per day — reassign collisions to idle cards. */
function dedupeSameDayCards(payments: CalPayment[]): CalPayment[] {
  const liveCards = Object.keys(CARD_TO_RESOURCE).filter((c) => c !== 'Kayman')
  const byDate = new Map<string, CalPayment[]>()
  for (const p of payments) {
    byDate.set(p.date, [...(byDate.get(p.date) || []), { ...p }])
  }
  const out: CalPayment[] = []
  for (const [, rows] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const used = new Set<string>()
    for (const row of rows.sort((a, b) => a.attemptMin - b.attemptMin)) {
      if (!used.has(row.cardId)) {
        used.add(row.cardId)
        out.push(row)
        continue
      }
      const free = liveCards.find((c) => !used.has(c))
      if (!free) throw new Error(`No free card to dedupe ${row.date} ${row.economicPaymentId}`)
      used.add(free)
      out.push({ ...row, cardId: free })
    }
  }
  return out
}

function buildEquitableBook(payments: CalPayment[]): ProspectiveBook {
  const book: ProspectiveBook = {}
  for (let d = 1; d <= DESK_MONTH_HORIZON_DAYS; d++) book[d] = []
  for (const p of payments) {
    const day = engineDayFromIso(p.date)
    const forcedCardId = CARD_TO_RESOURCE[p.cardId]
    const forcedPosId = TERMINAL_TO_POS[p.terminalId]
    if (!forcedCardId || !forcedPosId) {
      throw new Error(`Unmapped route ${p.cardId}×${p.terminalId} (${p.economicPaymentId})`)
    }
    const ticket: CoreTicket = {
      amount: money(p.amountZar),
      timeMinutes: p.attemptMin,
      economicPaymentId: p.economicPaymentId,
      invoiceId: p.invoiceId,
      supportingInvoicePresent: true,
      forcedCardId,
      forcedPosId,
    }
    book[day] = [...(book[day] || []), ticket]
  }
  return book
}

async function main() {
  initAdmin()
  if (!fs.existsSync(IN_JSON)) {
    throw new Error(`Missing ${IN_JSON} — run makeLiveOctoberReallocatedCalendar first`)
  }
  const raw = JSON.parse(fs.readFileSync(IN_JSON, 'utf8')) as {
    payments?: CalPayment[]
    bookHash?: string
    assignmentHash?: string
    totalZar?: number
    equitableCardShares?: boolean
  }
  const payments = dedupeSameDayCards(raw.payments || [])
  if (!payments.length) throw new Error('No payments in equitable calendar JSON')
  const bookZar = money(sum(payments.map((p) => p.amountZar)))
  if (Math.abs(bookZar - DESK_MONTH_TARGET_ZAR) > 0.05) {
    console.warn(`Book ZAR ${bookZar} ≠ DESK_MONTH_TARGET_ZAR ${DESK_MONTH_TARGET_ZAR}`)
  }

  const absorbingBook = buildEquitableBook(payments)
  const day1 = absorbingBook[1] || []
  const { forceFreshDeskRun } = await import('../src/tx/adminConversionRouting')
  const summary = await forceFreshDeskRun({
    capitalZar: DESK_MONTH_TARGET_ZAR,
    absorbingBook,
    note: `Equitable card+POS desk · bookHash ${raw.bookHash || 'n/a'} · R${DESK_MONTH_TARGET_ZAR.toLocaleString('en-ZA')} · Next 24h walks this book`,
  })

  const report = {
    ok: true,
    summary,
    source: IN_JSON,
    bookHash: raw.bookHash,
    assignmentHash: raw.assignmentHash,
    equitableCardShares: raw.equitableCardShares === true,
    invoiceCount: payments.length,
    totalZar: bookZar,
    day1Tickets: day1.length,
    day1Zar: money(sum(day1.map((t) => t.amount))),
    day1Forced: day1.map((t) => ({
      id: t.economicPaymentId,
      amount: t.amount,
      route: `${t.forcedCardId}|${t.forcedPosId}`,
    })),
    instruction: 'Pull to refresh on all devices, then tap Next 24h through the month.',
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
