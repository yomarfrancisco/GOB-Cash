/**
 * Dual-channel replacement split: full ZAR sale → EN ROUTE;
 * card + EFT schedule how pre-funded MZN recycles to replace it.
 */
import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'

export type DeskChannel = 'card' | 'eft'

/** EFT corridor policy — not a clone of POS concentration rules. */
export const EFT_POLICY_V1 = {
  version: 'EftPolicyV1' as const,
  /** Soft warn banking-day deadline (hours after instruct, approx T+1 16:00). */
  softClearBankingDays: 1,
  /** Hard expected clearance (T+2). */
  hardClearBankingDays: 2,
  softClearHourSast: 16,
  hardClearHourSast: 16,
  /** Max single EFT replacement ticket (ZAR equivalent). */
  maxTicketZar: 500_000,
  /** Prefer leaving at least this much on cards when shock is large enough. */
  minCardShareZar: 15_000,
  /** Card day headroom used when sizing the card book from a shock. */
  cardDayHeadroomZar: OPERATING_POLICY_V1.network.establishedDailyCeilingZar,
  /** Horizon days for card absorbing book from a shock. */
  cardHorizonDays: 31,
}

export type ChannelTicket = {
  channel: DeskChannel
  amountZar: number
  /** When settlement / recycle evidence is expected. */
  expectedSettledBy: string
  status: 'open' | 'submitted' | 'settled' | 'delayed' | 'failed'
  economicPaymentId: string
  instructedAt: string
  notes?: string[]
}

export type ChannelSplitResult = {
  /** Full ZAR sale amount — books onto EN ROUTE unchanged. */
  enRouteZar: number
  /** MZN replacement target at COST (caller supplies rate). */
  replacementZar: number
  cardZar: number
  eftZar: number
  cardTickets: ChannelTicket[]
  eftTickets: ChannelTicket[]
  summary: string
}

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
const DAY_MS = 86_400_000

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Next N banking days (Mon–Fri SAST) at hourSast:00. */
export function bankingDeadlineIso(fromMs: number, bankingDays: number, hourSast: number): string {
  let cursor = fromMs
  let remaining = Math.max(0, bankingDays)
  while (remaining > 0) {
    cursor += DAY_MS
    const sast = new Date(cursor + SAST_OFFSET_MS)
    const dow = sast.getUTCDay() // 0 Sun … 6 Sat in SAST-shifted UTC
    if (dow !== 0 && dow !== 6) remaining -= 1
  }
  const sast = new Date(cursor + SAST_OFFSET_MS)
  const y = sast.getUTCFullYear()
  const m = sast.getUTCMonth()
  const d = sast.getUTCDate()
  const at = Date.UTC(y, m, d, hourSast, 0, 0) - SAST_OFFSET_MS
  return new Date(at).toISOString()
}

/** Card recycle expected by next 09:00 SAST. */
export function nextCardSettleByIso(fromMs: number): string {
  const shifted = new Date(fromMs + SAST_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  const todayNine = Date.UTC(y, m, d, 9, 0, 0) - SAST_OFFSET_MS
  const settle = fromMs < todayNine ? todayNine : todayNine + DAY_MS
  return new Date(settle).toISOString()
}

/**
 * Deterministic split of replacement work after a ZAR sale (or add).
 * Full amount is enRouteZar; cardZar + eftZar = replacementZar (= amountZar).
 */
export function splitReplacementChannels(input: {
  amountZar: number
  nowMs?: number
  cardHeadroomZar?: number
  shockId?: string
}): ChannelSplitResult {
  const amount = roundMoney(Math.max(0, input.amountZar))
  const nowMs = input.nowMs ?? Date.now()
  const headroom = roundMoney(
    Math.max(0, input.cardHeadroomZar ?? EFT_POLICY_V1.cardDayHeadroomZar * 3)
  )
  const cardCap = OPERATING_POLICY_V1.payment.maxAmountZar
  const shockId = input.shockId || `shock-${nowMs}`

  let cardZar = 0
  let eftZar = 0
  if (amount <= cardCap) {
    cardZar = amount
  } else {
    // Fill legal multi-day card headroom; remainder EFT. Never pack only cards.
    cardZar = roundMoney(Math.min(amount, headroom))
    // Keep a meaningful EFT slice on large shocks.
    if (amount >= EFT_POLICY_V1.minCardShareZar * 2 && cardZar > amount * 0.45) {
      cardZar = roundMoney(Math.min(cardZar, Math.max(EFT_POLICY_V1.minCardShareZar, amount * 0.35)))
    }
    eftZar = roundMoney(amount - cardZar)
  }

  const instructedAt = new Date(nowMs).toISOString()
  const cardTickets: ChannelTicket[] = []
  if (cardZar > 0) {
    let left = cardZar
    let i = 0
    while (left > 0.009 && i < 80) {
      const chunk = roundMoney(Math.min(left, cardCap))
      cardTickets.push({
        channel: 'card',
        amountZar: chunk,
        expectedSettledBy: nextCardSettleByIso(nowMs + i * DAY_MS),
        status: 'open',
        economicPaymentId: `${shockId}-card-${i}`,
        instructedAt,
      })
      left = roundMoney(left - chunk)
      i += 1
    }
  }

  const eftTickets: ChannelTicket[] = []
  if (eftZar > 0) {
    let left = eftZar
    let i = 0
    while (left > 0.009 && i < 40) {
      const chunk = roundMoney(Math.min(left, EFT_POLICY_V1.maxTicketZar))
      eftTickets.push({
        channel: 'eft',
        amountZar: chunk,
        expectedSettledBy: bankingDeadlineIso(
          nowMs,
          EFT_POLICY_V1.hardClearBankingDays,
          EFT_POLICY_V1.hardClearHourSast
        ),
        status: 'open',
        economicPaymentId: `${shockId}-eft-${i}`,
        instructedAt,
        notes: [
          `Soft warn ${bankingDeadlineIso(nowMs, EFT_POLICY_V1.softClearBankingDays, EFT_POLICY_V1.softClearHourSast)}`,
        ],
      })
      left = roundMoney(left - chunk)
      i += 1
    }
  }

  const summary =
    eftZar > 0 && cardZar > 0
      ? `EN ROUTE ${formatZar(amount)}. Replace via card ${formatZar(cardZar)} + EFT ${formatZar(eftZar)}.`
      : eftZar > 0
        ? `EN ROUTE ${formatZar(amount)}. Replace via EFT ${formatZar(eftZar)}.`
        : `EN ROUTE ${formatZar(amount)}. Replace via card ${formatZar(cardZar)}.`

  return {
    enRouteZar: amount,
    replacementZar: amount,
    cardZar,
    eftZar,
    cardTickets,
    eftTickets,
    summary,
  }
}

function formatZar(value: number): string {
  return `R${Math.round(value).toLocaleString('en-ZA')}`
}

/** Persistable open EFT book on the desk test doc. */
export type EftDeskBook = {
  tickets: ChannelTicket[]
  lastSplitSummary: string | null
  updatedAt: string
}

export function mergeEftBook(existing: EftDeskBook | null | undefined, split: ChannelSplitResult): EftDeskBook {
  const prior = Array.isArray(existing?.tickets) ? existing!.tickets.filter((t) => t.status === 'open' || t.status === 'submitted' || t.status === 'delayed') : []
  return {
    tickets: [...prior, ...split.eftTickets],
    lastSplitSummary: split.summary,
    updatedAt: new Date().toISOString(),
  }
}

export function openEftZar(book: EftDeskBook | null | undefined): number {
  if (!book?.tickets?.length) return 0
  return roundMoney(
    book.tickets
      .filter((t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed'))
      .reduce((s, t) => s + t.amountZar, 0)
  )
}

export function channelMixOf(split: { cardZar: number; eftZar: number }): 'card' | 'eft' | 'mixed' {
  if (split.cardZar > 0 && split.eftZar > 0) return 'mixed'
  if (split.eftZar > 0) return 'eft'
  return 'card'
}

/** Planned-mode one-day EFT advance: open→submitted, submitted→settled (synthetic cover). */
export function advanceEftBookPlannedDay(
  book: EftDeskBook | null | undefined,
  nowMs: number
): { book: EftDeskBook; steps: string[]; settledZar: number } {
  const tickets = Array.isArray(book?.tickets) ? book!.tickets.map((t) => ({ ...t })) : []
  const steps: string[] = []
  let settledZar = 0
  for (const t of tickets) {
    if (t.channel !== 'eft') continue
    if (t.status === 'open') {
      t.status = 'submitted'
      steps.push(`eft-submit:${t.economicPaymentId}`)
    } else if (t.status === 'submitted' || t.status === 'delayed') {
      const due = Date.parse(t.expectedSettledBy)
      // Soft progress: settle when Planned day reaches/passes hard deadline, else keep pending.
      if (!Number.isFinite(due) || nowMs + DAY_MS >= due) {
        t.status = 'settled'
        settledZar = roundMoney(settledZar + t.amountZar)
        steps.push(`eft-settle:${t.economicPaymentId}`)
      } else {
        steps.push(`eft-pending:${t.economicPaymentId}`)
      }
    }
  }
  return {
    book: {
      tickets,
      lastSplitSummary: book?.lastSplitSummary || null,
      updatedAt: new Date(nowMs).toISOString(),
    },
    steps,
    settledZar,
  }
}

/** Mark open/submitted EFT past expectedSettledBy as delayed. */
export function markOverdueEftTickets(
  book: EftDeskBook | null | undefined,
  nowMs: number
): { book: EftDeskBook; overdue: ChannelTicket[] } {
  const tickets = Array.isArray(book?.tickets) ? book!.tickets.map((t) => ({ ...t })) : []
  const overdue: ChannelTicket[] = []
  for (const t of tickets) {
    if (t.channel !== 'eft') continue
    if (t.status !== 'open' && t.status !== 'submitted') continue
    const due = Date.parse(t.expectedSettledBy)
    if (Number.isFinite(due) && nowMs > due) {
      t.status = 'delayed'
      overdue.push(t)
    }
  }
  return {
    book: {
      tickets,
      lastSplitSummary: book?.lastSplitSummary || null,
      updatedAt: new Date(nowMs).toISOString(),
    },
    overdue,
  }
}

/** Settle a matched EFT ticket by economicPaymentId (live bank_transfer). */
export function settleEftTicket(
  book: EftDeskBook | null | undefined,
  economicPaymentId: string,
  nowMs = Date.now()
): EftDeskBook {
  const tickets = Array.isArray(book?.tickets)
    ? book!.tickets.map((t) =>
        t.economicPaymentId === economicPaymentId && t.channel === 'eft'
          ? { ...t, status: 'settled' as const }
          : t
      )
    : []
  return {
    tickets,
    lastSplitSummary: book?.lastSplitSummary || null,
    updatedAt: new Date(nowMs).toISOString(),
  }
}

export function defaultEftCorridorId(issuerBankId = 'fnb_mozambique', beneficiary = 'sa_corridor'): string {
  return `${issuerBankId}__${beneficiary}`
}
