import { OPERATING_POLICY_V1 } from '../../operatingCalendar/operatingPolicyV1'
import { withTicketIdentity } from './bankRules'
import { drawTicketSize, drawTriangularZar, isOperatingWeekday, streamRng } from './demand'
import { roundMoney, sum } from './math'
import type { CoreTicket, Scenario } from './types'

/**
 * Retained-margin headroom used only by the legacy 14-day golden packer.
 * Month prospective books fill the authorised amount exactly (trim final invoice).
 */
export const ABSORBING_BOOK_HEADROOM = 0.1

export const PROSPECTIVE_PAYMENT_PREFIX = 'pro'

/** Mature modeled invoices for established cards/routes (prospective book only). */
export const MATURE_MODELED_INVOICE = {
  minZar: 8_000,
  modeZar: 11_500,
  maxZar: 15_000,
} as const

export type ProspectiveBook = Record<number, CoreTicket[]>

function dayNetworkCeilingZar(day: number): number {
  if (day <= OPERATING_POLICY_V1.network.coldNetworkDays) {
    return OPERATING_POLICY_V1.network.coldDailyCeilingZar
  }
  return OPERATING_POLICY_V1.network.establishedDailyCeilingZar
}

function ticket(
  amount: number,
  day: number,
  slot: number
): CoreTicket {
  return {
    amount: roundMoney(amount),
    timeMinutes: 9 * 60 + ((slot * 17) % (8 * 60)),
    economicPaymentId: `${PROSPECTIVE_PAYMENT_PREFIX}:${day}:${slot + 1}`,
    supportingInvoicePresent: true,
  }
}

/**
 * Card cold-start inventory (Moza / NEW_CARD), not POS staging.
 * Econometrica is fully eligible at the R15k ceiling.
 * Default: one full seven-clean ladder per Moza twin (WolfMoza + GoblinMoza).
 */
function buildStagedColdInvoices(rng: () => number, ladders = 2): number[] {
  const stageA = OPERATING_POLICY_V1.newCard.stageA
  const stageB = OPERATING_POLICY_V1.newCard.stageB
  const out: number[] = []
  for (let ladder = 0; ladder < ladders; ladder++) {
    for (let i = 0; i < stageA.maxCleanOutcomesExclusive; i++) {
      out.push(drawTriangularZar(rng, 3_500, 4_500, stageA.maxAttemptZar))
    }
    for (let i = stageA.maxCleanOutcomesExclusive; i < stageB.maxCleanOutcomesExclusive; i++) {
      out.push(
        drawTriangularZar(rng, stageA.maxAttemptZar + 100, 6_000, stageB.maxAttemptZar)
      )
    }
  }
  return out.map((a) => roundMoney(a))
}

/**
 * Generate a prospective modeled invoice stream covering `authorisedZar`.
 * Mature draws use R8k–R15k triangular (mode R11.5k). Final invoice is trimmed
 * to the residual — never splitting a prior invoice.
 */
export function generateModeledInvoiceStream(input: {
  scenario: Scenario
  authorisedZar: number
  /** When true (default for month books), reserve Moza cold-start ladders (2×7 cleans). */
  includeColdRouteStages?: boolean
  /** Number of Moza-style seven-clean ladders to front-load (default 2). */
  mozaColdStartLadders?: number
}): number[] {
  const authorised = roundMoney(Math.max(0, input.authorisedZar))
  if (!(authorised > 0)) return []
  const rng = streamRng(input.scenario, 0, `modeled-invoices:${authorised}`)
  const ladders = Math.max(0, input.mozaColdStartLadders ?? 2)
  const staged =
    input.includeColdRouteStages === false ? [] : buildStagedColdInvoices(rng, ladders)
  const invoices: number[] = [...staged]
  let filled = roundMoney(sum(invoices))
  let guard = 0
  while (filled < authorised - 1e-9 && guard < 5_000) {
    guard += 1
    const remaining = roundMoney(authorised - filled)
    if (remaining <= MATURE_MODELED_INVOICE.maxZar + 1e-9) {
      // Trim only the final generated invoice to the genuine residual.
      if (remaining >= 1) invoices.push(remaining)
      filled = authorised
      break
    }
    let amount = drawTriangularZar(
      rng,
      MATURE_MODELED_INVOICE.minZar,
      MATURE_MODELED_INVOICE.modeZar,
      Math.min(MATURE_MODELED_INVOICE.maxZar, OPERATING_POLICY_V1.payment.maxAmountZar)
    )
    if (amount > remaining) amount = remaining
    invoices.push(amount)
    filled = roundMoney(filled + amount)
  }
  return invoices
}

/**
 * Pack whole modeled invoices onto operating days under network ceilings.
 * Does not target a payment count — mostly two/day falls out of R8k–R15k sizes vs R25k/R30k caps.
 * Residual that cannot fit continues to later days (never forced into a day).
 */
export function allocateInvoicesToDays(input: {
  invoices: number[]
  horizonDays: number
  startDay?: number
}): { book: ProspectiveBook; unscheduled: number[] } {
  const horizon = Math.max(1, input.horizonDays)
  const startDay = Math.max(1, input.startDay ?? 1)
  const book: ProspectiveBook = {}
  for (let day = 1; day <= horizon; day += 1) book[day] = []
  const weekdays = Array.from({ length: horizon }, (_, i) => i + 1).filter(
    (day) => day >= startDay && isOperatingWeekday(day)
  )
  const maxAttempts = OPERATING_POLICY_V1.network.maxAttemptsPerOperatingDay
  const stageCeiling = OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar
  /** Front-load up to two Moza seven-clean ladders (14) before mature fill. */
  const mozaRampCap = OPERATING_POLICY_V1.newCard.stageB.maxCleanOutcomesExclusive * 2
  const staged: number[] = []
  const mature: number[] = []
  for (const amount of input.invoices) {
    if (amount <= stageCeiling + 1e-9 && staged.length < mozaRampCap) {
      staged.push(amount)
    } else {
      mature.push(amount)
    }
  }

  // Preserve draw order — never largest-first (that produced a descending R13.6k→R9.5k calendar).
  // Keep any staged (card cold-start) invoices at the front of the queue.
  const queue = [...staged, ...mature]
  const unscheduled: number[] = []

  /**
   * Spread across the full horizon: mostly two/day; enough threes for residual.
   * Soft-cap only — never pad a day to force a pattern.
   */
  const caps = new Map<number, number>()
  for (const day of weekdays) caps.set(day, 2)
  const threeNeed = Math.max(0, queue.length - 2 * weekdays.length)
  const established = weekdays.filter((d) => d > OPERATING_POLICY_V1.network.coldNetworkDays)
  for (let i = 0; i < threeNeed && i < established.length; i++) {
    const idx = Math.floor(((i + 0.5) * established.length) / Math.max(1, threeNeed))
    caps.set(established[Math.min(established.length - 1, idx)]!, 3)
  }

  while (queue.length) {
    const next = queue.shift()!
    let bestDay: number | null = null
    let bestRoom = -1
    for (let pass = 0; pass < 2 && bestDay == null; pass++) {
      for (const day of weekdays) {
        const dayTickets = book[day]!
        const limit = pass === 0 ? Math.min(maxAttempts, caps.get(day) ?? 2) : maxAttempts
        if (dayTickets.length >= limit) continue
        const room = dayNetworkCeilingZar(day) - roundMoney(sum(dayTickets.map((t) => t.amount)))
        if (room + 1e-9 < next) continue
        if (room > bestRoom) {
          bestRoom = room
          bestDay = day
        }
      }
    }
    if (bestDay == null) {
      unscheduled.push(next)
      continue
    }
    book[bestDay]!.push(ticket(next, bestDay, book[bestDay]!.length))
  }

  for (const day of weekdays) {
    book[day] = withTicketIdentity(
      (book[day] ?? []).sort((a, b) => a.timeMinutes - b.timeMinutes || a.amount - b.amount),
      day
    )
  }
  return { book, unscheduled }
}

/**
 * Whole-payment book sized to absorb `availableZar`.
 * Month-length books use the mature R8k–R15k prospective generator.
 * 14-day goldens keep the legacy free pack (+ headroom).
 */
export function buildAbsorbingPaymentBook(input: {
  scenario: Scenario
  availableZar: number
  horizonDays: number
  startDay?: number
}): ProspectiveBook {
  const horizon = Math.max(1, input.horizonDays)
  const startDay = Math.max(1, input.startDay ?? 1)

  // Production month prospective book.
  if (horizon >= 27) {
    const authorised = roundMoney(Math.max(0, input.availableZar))
    const invoices = generateModeledInvoiceStream({
      scenario: input.scenario,
      authorisedZar: authorised,
      // Econometrica is fully eligible; staged amounts are Moza card cold-start inventory only.
      includeColdRouteStages: true,
      mozaColdStartLadders: 2,
    })
    const { book } = allocateInvoicesToDays({
      invoices,
      horizonDays: horizon,
      startDay,
    })
    return book
  }

  // Legacy 14-day golden packer (unchanged distribution contract for tests).
  return buildLegacyAbsorbingPaymentBook(input)
}

/**
 * Prior free-pack prospective book (scenario triangular draw + 10% headroom).
 * Retained for comparison against the mature R8k–R15k month generator and for
 * 14-day goldens. Never mutates live receivables.
 */
export function buildLegacyAbsorbingPaymentBook(input: {
  scenario: Scenario
  availableZar: number
  horizonDays: number
  startDay?: number
}): ProspectiveBook {
  const horizon = Math.max(1, input.horizonDays)
  const startDay = Math.max(1, input.startDay ?? 1)
  const target = roundMoney(Math.max(0, input.availableZar) * (1 + ABSORBING_BOOK_HEADROOM))
  const book: ProspectiveBook = {}
  for (let day = 1; day <= horizon; day += 1) book[day] = []
  if (!(target > 0)) return book

  const weekdays = Array.from({ length: horizon }, (_, i) => i + 1).filter(
    (day) => day >= startDay && isOperatingWeekday(day)
  )
  const rng = streamRng(input.scenario, 0, `prospective-book:${target}:${startDay}`)
  let filled = 0
  let index = 0
  while (filled < target - 1e-9 && index < 2_000 && weekdays.length > 0) {
    const day = weekdays[index % weekdays.length]!
    index += 1
    const tickets = book[day]!
    const amount = drawTicketSize(rng, input.scenario)
    tickets.push(ticket(amount, day, tickets.length))
    filled = roundMoney(filled + amount)
  }
  for (const day of weekdays) {
    book[day] = withTicketIdentity(
      (book[day] ?? []).sort((a, b) => a.timeMinutes - b.timeMinutes || a.amount - b.amount),
      day
    )
  }
  return book
}

/** Keep days before `fromDay`; replace the rest with a book sized to the new stock. */
export function rebuildRemainingBook(input: {
  scenario: Scenario
  availableZar: number
  horizonDays: number
  fromDay: number
  existing: ProspectiveBook
}): ProspectiveBook {
  const fromDay = Math.max(1, input.fromDay)
  const rebuilt = buildAbsorbingPaymentBook({
    scenario: input.scenario,
    availableZar: input.availableZar,
    horizonDays: input.horizonDays,
    startDay: fromDay,
  })
  const next: ProspectiveBook = {}
  for (let day = 1; day <= input.horizonDays; day += 1) {
    next[day] = day < fromDay ? [...(input.existing[day] ?? [])] : [...(rebuilt[day] ?? [])]
  }
  return next
}

export function bookTotalZar(book: ProspectiveBook): number {
  return roundMoney(sum(Object.values(book).flatMap((tickets) => tickets.map((ticket) => ticket.amount))))
}
