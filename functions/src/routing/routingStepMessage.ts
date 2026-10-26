/**
 * Routing Manager step card payload — total-first Card + EFT peer rails.
 * Spec: routing-manager-step-card-spec.md
 */
import { cardShortName, machineShortName, DEFAULT_CARDS } from './inventory'
import type { ChannelTicket } from './channelSplit'
import {
  formatMznMoney,
  formatRate4,
  formatZarMoney,
  type OrderLedger,
} from './orderLedger'

export type StepStatus = 'done' | 'planned' | 'en_route'

export type RailStep = {
  status: StepStatus
  title: string
  subline: string
  /** ZAR amount, or MZN for the sourcing row (see amountKind). */
  amount: number
  amountKind: 'ZAR' | 'MZN'
  secondary?: string
}

export type Rail = {
  kind: 'card' | 'eft'
  label: 'CARD' | 'EFT'
  chip: { text: string; variant: 'today' | 'outline' | 'settled' }
  settlementTerm: 'today' | 'T+1' | 'T+2'
  total: number
  steps: RailStep[]
}

export type RoutingStepMessage = {
  schemaVersion: 1
  stepNumber: number
  stepName: string
  sentAt: string
  rails: Rail[]
  next: { stepNumber: number; stepName: string; opensIn: string; dayLabel?: string }
  /** Derived — sum of rail totals. */
  clientTotal: number
  summary: string
  /** Step 6 — settled card vs pending EFT. */
  settlement?: {
    settledZar: number
    pendingZar: number
    totalZar: number
  }
  /** Frozen ledger figures when available. */
  orderLedger?: OrderLedger
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export { formatZarMoney, formatMznMoney } from './orderLedger'

function mozBankLabel(cardId: number): string {
  const card = DEFAULT_CARDS.find((row) => row.id === cardId)
  return card?.mozBank || 'Mozambique bank'
}

function openEftTickets(tickets: ChannelTicket[] | undefined): ChannelTicket[] {
  if (!Array.isArray(tickets)) return []
  return tickets.filter(
    (t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed')
  )
}

function eftTicketsForPlan(tickets: ChannelTicket[] | undefined): ChannelTicket[] {
  const open = openEftTickets(tickets)
  if (open.length) return open
  if (!Array.isArray(tickets)) return []
  return tickets.filter((t) => t.channel === 'eft' && t.status === 'settled')
}

export function clientTotalOf(rails: Rail[]): number {
  return roundMoney(rails.reduce((sum, rail) => sum + rail.total, 0))
}

export function buildSummarySentence(rails: Rail[], clientTotal: number): string {
  const phrases: string[] = []
  for (const rail of rails) {
    if (rail.kind === 'card') phrases.push('Card settles today')
    else phrases.push(`EFT lands ${rail.settlementTerm}`)
  }
  const railCount = rails.length
  const railWord = railCount === 1 ? 'rail' : 'rails'
  return `${formatZarMoney(clientTotal)} routing to client on ${railCount} ${railWord}. ${phrases.join('; ')}.`
}

export function railSumLine(rails: Rail[]): string {
  return rails.map((rail) => `${formatZarMoney(rail.total)} ${rail.kind}`).join(' + ')
}

export type BuildOrderStepInput = {
  cycleNumber: number
  sentAt: string
  cardAssignments: Array<{ cardId: number; machineId: number; amount: number }>
  eftTickets?: ChannelTicket[]
  /** Prefer orderLedger when present — no recomputed MZN/rate. */
  orderLedger?: OrderLedger | null
  /** Sell Mt/R — used for MZN fill display when ledger absent. */
  sellRate?: number
  mznInventory?: number
  /** When true, card swipe / recycle already completed (Step 6). */
  cardLaneComplete?: boolean
  /** When true, desk invoices already raised. */
  invoicesRaised?: boolean
  next?: { stepNumber: number; stepName: string; opensIn: string; dayLabel?: string }
}

/**
 * Step 1 · Order (or Step 6 · What happened with cardLaneComplete).
 * Does not emit a separate residual line — EFT rail is the pending figure.
 */
export function buildOrderStepMessage(input: BuildOrderStepInput): RoutingStepMessage {
  const cardZar = roundMoney(input.cardAssignments.reduce((s, row) => s + (row.amount || 0), 0))
  const eftSource = eftTicketsForPlan(input.eftTickets)
  const eftZar = roundMoney(eftSource.reduce((s, t) => s + t.amountZar, 0))
  const ledger = input.orderLedger || null

  const rails: Rail[] = []

  if (cardZar > 0.009 && input.cardAssignments.length) {
    const primary = input.cardAssignments[0]!
    const sellRate =
      ledger && ledger.sellRate > 0
        ? ledger.sellRate
        : input.sellRate && input.sellRate > 0
          ? input.sellRate
          : 4.44
    const mznNeeded =
      ledger && ledger.mznAtSell > 0 ? ledger.mznAtSell : roundMoney(cardZar * sellRate)
    const fx = formatRate4(sellRate)
    const mznCovered =
      typeof input.mznInventory === 'number' ? input.mznInventory + 0.01 >= mznNeeded : true
    const mznDone = input.cardLaneComplete || mznCovered
    const invoiceDone = input.cardLaneComplete || input.invoicesRaised === true
    const swipeDone = input.cardLaneComplete === true

    const ranked = input.cardAssignments.slice().sort((a, b) => b.amount - a.amount)
    const saLines = ranked.length <= 4 ? ranked : ranked.slice(0, 3)

    const steps: RailStep[] = [
      {
        status: mznDone ? 'done' : 'planned',
        title: mznDone ? 'MZN sourced' : 'MZN source planned',
        subline: `${mozBankLabel(primary.cardId)} · ${cardShortName(primary.cardId)}`,
        amount: mznNeeded,
        amountKind: 'MZN',
        secondary: `@ ${fx}`,
      },
      {
        status: invoiceDone ? 'done' : 'planned',
        title: invoiceDone ? 'Desk pack raised' : 'Desk pack planned',
        subline:
          input.cardAssignments.length > 1
            ? `${input.cardAssignments.length} invoices`
            : 'Invoice',
        amount: cardZar,
        amountKind: 'ZAR',
      },
    ]

    if (saLines.length === 1) {
      const row = saLines[0]!
      steps.push({
        status: swipeDone ? 'done' : 'planned',
        title: swipeDone ? 'Swipe settled' : 'Swipe planned',
        subline: `${machineShortName(row.machineId)} · SA bank`,
        amount: roundMoney(row.amount),
        amountKind: 'ZAR',
      })
    } else {
      for (const row of saLines) {
        steps.push({
          status: swipeDone ? 'done' : 'planned',
          title: swipeDone
            ? `Swipe settled · ${machineShortName(row.machineId)}`
            : `Swipe planned · ${machineShortName(row.machineId)}`,
          subline: `${cardShortName(row.cardId)} · SA bank`,
          amount: roundMoney(row.amount),
          amountKind: 'ZAR',
        })
      }
      if (ranked.length > saLines.length) {
        const rest = roundMoney(ranked.slice(3).reduce((s, r) => s + r.amount, 0))
        steps.push({
          status: swipeDone ? 'done' : 'planned',
          title: `${ranked.length - 3} more rails`,
          subline: 'Collapsed',
          amount: rest,
          amountKind: 'ZAR',
        })
      }
    }

    rails.push({
      kind: 'card',
      label: 'CARD',
      chip: input.cardLaneComplete
        ? { text: 'Settled', variant: 'settled' }
        : { text: 'Today', variant: 'today' },
      settlementTerm: 'today',
      total: cardZar,
      steps,
    })
  }

  if (eftZar > 0.009 && eftSource.length) {
    const show = eftSource.length <= 3 ? eftSource : eftSource.slice(0, 3)
    const steps: RailStep[] = show.map((ticket, index) => {
      const settled = ticket.status === 'settled'
      const delayed = ticket.status === 'delayed'
      return {
        status: settled ? 'done' : 'en_route',
        title: settled
          ? `Instruction ${index + 1} settled`
          : delayed
            ? `Instruction ${index + 1} delayed`
            : `Instruction ${index + 1} pending`,
        subline: settled ? 'Moz↔SA recycle' : 'Moz↔SA recycle · due T+2',
        amount: roundMoney(ticket.amountZar),
        amountKind: 'ZAR' as const,
      }
    })
    if (eftSource.length > show.length) {
      const rest = roundMoney(eftSource.slice(3).reduce((s, t) => s + t.amountZar, 0))
      steps.push({
        status: 'en_route',
        title: `${eftSource.length - 3} more instructions`,
        subline: 'Collapsed',
        amount: rest,
        amountKind: 'ZAR',
      })
    }
    const allSettled = eftSource.every((t) => t.status === 'settled')
    rails.push({
      kind: 'eft',
      label: 'EFT',
      chip: {
        text: allSettled
          ? `Settled · ${eftSource.length} ticket${eftSource.length === 1 ? '' : 's'}`
          : `T+2 · ${eftSource.length} ticket${eftSource.length === 1 ? '' : 's'}`,
        variant: allSettled ? 'settled' : 'outline',
      },
      settlementTerm: 'T+2',
      total: eftZar,
      steps,
    })
  }

  const clientTotal = clientTotalOf(rails)
  const stepNumber = input.cardLaneComplete ? 6 : 1
  const stepName = input.cardLaneComplete ? 'What happened' : 'Order'
  const nextDay = input.cycleNumber + 1
  const next =
    input.next ||
    (input.cardLaneComplete
      ? {
          stepNumber: 1,
          stepName: 'Order',
          opensIn: 'tomorrow',
          dayLabel: `Day ${nextDay}`,
        }
      : { stepNumber: 2, stepName: 'Invoice', opensIn: '24h' })

  const settlement = input.cardLaneComplete
    ? {
        settledZar: cardZar,
        pendingZar: eftZar,
        totalZar: clientTotal,
      }
    : undefined

  return {
    schemaVersion: 1,
    stepNumber,
    stepName,
    sentAt: input.sentAt,
    rails,
    next,
    clientTotal,
    summary: buildSummarySentence(rails, clientTotal),
    ...(settlement ? { settlement } : {}),
    ...(ledger ? { orderLedger: ledger } : {}),
  }
}
