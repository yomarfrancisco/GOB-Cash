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
 * Cold-route staged invoices so Econometrica (and similar) can graduate through
 * R5k / R6.5k before receiving mature R8k–R15k modeled amounts.
 */
function buildStagedColdInvoices(rng: () => number): number[] {
  const stageA = OPERATING_POLICY_V1.newCard.stageA
  const stageB = OPERATING_POLICY_V1.newCard.stageB
  const out: number[] = []
  for (let i = 0; i < stageA.maxCleanOutcomesExclusive; i++) {
    out.push(drawTriangularZar(rng, 3_500, 4_500, stageA.maxAttemptZar))
  }
  for (let i = stageA.maxCleanOutcomesExclusive; i < stageB.maxCleanOutcomesExclusive; i++) {
    out.push(
      drawTriangularZar(rng, stageA.maxAttemptZar + 100, 6_000, stageB.maxAttemptZar)
    )
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
  includeColdRouteStages?: boolean
}): number[] {
  const authorised = roundMoney(Math.max(0, input.authorisedZar))
  if (!(authorised > 0)) return []
  const rng = streamRng(input.scenario, 0, `modeled-invoices:${authorised}`)
  const staged = input.includeColdRouteStages === false ? [] : buildStagedColdInvoices(rng)
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
  const staged: number[] = []
  const mature: number[] = []
  for (const amount of input.invoices) {
    if (amount <= stageCeiling + 1e-9 && staged.length < OPERATING_POLICY_V1.newCard.stageB.maxCleanOutcomesExclusive) {
      staged.push(amount)
    } else {
      mature.push(amount)
    }
  }

  // Spread stage A/B invoices across early operating days (≤2/day) so Econometrica can ramp
  // without dumping five small payments onto Day 1.
  let stageIdx = 0
  for (const day of weekdays) {
    if (stageIdx >= staged.length) break
    if (day > OPERATING_POLICY_V1.network.coldNetworkDays + 4) break
    const ceiling = dayNetworkCeilingZar(day)
    const dayTickets = book[day]!
    let daySum = 0
    let placed = 0
    while (stageIdx < staged.length && placed < 2 && dayTickets.length < maxAttempts) {
      const next = staged[stageIdx]!
      if (daySum + next > ceiling + 1e-9) break
      dayTickets.push(ticket(next, day, dayTickets.length))
      daySum = roundMoney(daySum + next)
      stageIdx += 1
      placed += 1
    }
  }
  // Largest mature first so R14k-class invoices claim day capacity before smaller ones fill the gaps.
  const queue = [...staged.slice(stageIdx), ...[...mature].sort((a, b) => b - a)]
  const unscheduled: number[] = []

  // Fill each day under its ceiling. Skip a head invoice that will not fit and try a smaller one
  // on the same day (residual continues later — never split, never pad a third payment for pattern).
  for (const day of weekdays) {
    if (!queue.length) break
    const ceiling = dayNetworkCeilingZar(day)
    const dayTickets = book[day]!
    let daySum = roundMoney(sum(dayTickets.map((t) => t.amount)))
    let guarded = 0
    while (queue.length && dayTickets.length < maxAttempts && guarded < queue.length) {
      const next = queue[0]!
      if (daySum + next > ceiling + 1e-9) {
        queue.push(queue.shift()!)
        guarded += 1
        continue
      }
      queue.shift()
      dayTickets.push(ticket(next, day, dayTickets.length))
      daySum = roundMoney(daySum + next)
      guarded = 0
    }
  }

  // Gap fill: place leftovers into earlier residual capacity (whole invoice only — never split).
  while (queue.length) {
    const next = queue[0]!
    let placed = false
    for (const day of weekdays) {
      const dayTickets = book[day]!
      if (dayTickets.length >= maxAttempts) continue
      const daySum = roundMoney(sum(dayTickets.map((t) => t.amount)))
      if (daySum + next > dayNetworkCeilingZar(day) + 1e-9) continue
      queue.shift()
      dayTickets.push(ticket(next, day, dayTickets.length))
      placed = true
      break
    }
    if (!placed) unscheduled.push(queue.shift()!)
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
      includeColdRouteStages: true,
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
