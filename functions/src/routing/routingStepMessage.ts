/**
 * Routing Manager step card — Steps 1 and 6 plan card payload.
 */
import { cardShortName, machineShortName, DEFAULT_CARDS } from './inventory'
import type { ChannelTicket } from './channelSplit'
import {
  formatMznMoney,
  formatRate4,
  formatZarMoney,
  type OrderLedger,
} from './orderLedger'

export type StepStatus = 'done' | 'planned' | 'pending'

export type RailStep = {
  status: StepStatus
  title: string
  subline: string
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
  cycleNumber: number
  sentAt: string
  rails: Rail[]
  next: { stepNumber: number; stepName: string; opensIn: string; dayLabel?: string }
  clientTotal: number
  summary: string
  settlement?: {
    settledZar: number
    pendingZar: number
    totalZar: number
  }
  orderLedger?: OrderLedger
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export { formatZarMoney, formatMznMoney, formatRate4 } from './orderLedger'

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

/** "Wed 28 Oct" from ISO, SAST-friendly. */
export function formatDueShort(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(new Date(ms))
  const weekday = parts.find((p) => p.type === 'weekday')?.value || ''
  const day = parts.find((p) => p.type === 'day')?.value || ''
  const month = parts.find((p) => p.type === 'month')?.value || ''
  return `${weekday} ${day} ${month}`
}

export function clientTotalOf(rails: Rail[]): number {
  return roundMoney(rails.reduce((sum, rail) => sum + rail.total, 0))
}

export function buildSummarySentence(
  rails: Rail[],
  clientTotal: number,
  cardLaneComplete?: boolean
): string {
  if (cardLaneComplete) {
    const card = rails.find((r) => r.kind === 'card')
    const eft = rails.find((r) => r.kind === 'eft')
    const parts: string[] = []
    if (card) parts.push(`${formatZarMoney(card.total)} settled on card today.`)
    if (eft) parts.push(`${formatZarMoney(eft.total)} EFT pending, lands ${eft.settlementTerm}.`)
    return parts.join(' ')
  }
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
  orderLedger?: OrderLedger | null
  sellRate?: number
  mznInventory?: number
  cardLaneComplete?: boolean
  invoicesRaised?: boolean
  swipeTimeLabel?: string | null
  next?: { stepNumber: number; stepName: string; opensIn: string; dayLabel?: string }
}

export function buildOrderStepMessage(input: BuildOrderStepInput): RoutingStepMessage {
  const ledger = input.orderLedger || null
  const assignmentZar = roundMoney(input.cardAssignments.reduce((s, row) => s + (row.amount || 0), 0))
  const cardZar = roundMoney(
    assignmentZar > 0.009
      ? assignmentZar
      : ledger && ledger.cardZar > 0
        ? ledger.cardZar
        : ledger && ledger.zar > 0
          ? ledger.zar
          : 0
  )
  const eftSource = eftTicketsForPlan(input.eftTickets)
  const eftZar = roundMoney(
    eftSource.reduce((s, t) => s + t.amountZar, 0) || (ledger && ledger.eftZar > 0 ? ledger.eftZar : 0)
  )

  const rails: Rail[] = []

  if (cardZar > 0.009) {
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
    const primary = ranked[0]
    const primarySa = ranked[0]

    const steps: RailStep[] = primary
      ? [
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
          {
            status: swipeDone ? 'done' : 'planned',
            title: swipeDone ? 'Swiped' : 'Swipe planned',
            subline: swipeDone
              ? `${machineShortName(primarySa!.machineId)}${input.swipeTimeLabel ? ` · ${input.swipeTimeLabel}` : ''}`
              : `${machineShortName(primarySa!.machineId)} · SA bank`,
            amount: roundMoney(primarySa!.amount),
            amountKind: 'ZAR',
          },
        ]
      : [
          {
            status: mznDone ? 'done' : 'planned',
            title: mznDone ? 'MZN sourced' : 'MZN source planned',
            subline: 'Moz card',
            amount: mznNeeded,
            amountKind: 'MZN',
            secondary: `@ ${fx}`,
          },
          {
            status: invoiceDone ? 'done' : 'planned',
            title: invoiceDone ? 'Desk pack raised' : 'Desk pack planned',
            subline: 'Invoice',
            amount: cardZar,
            amountKind: 'ZAR',
          },
          {
            status: swipeDone ? 'done' : 'planned',
            title: swipeDone ? 'Swiped' : 'Swipe planned',
            subline: swipeDone
              ? input.swipeTimeLabel
                ? `Card · ${input.swipeTimeLabel}`
                : 'Card'
              : 'SA bank',
            amount: cardZar,
            amountKind: 'ZAR',
          },
        ]

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
      const due = formatDueShort(ticket.expectedSettledBy)
      return {
        status: settled ? 'done' : 'pending',
        title: settled
          ? `Instruction ${index + 1} settled`
          : delayed
            ? `Instruction ${index + 1} delayed`
            : `Instruction ${index + 1} pending`,
        subline: settled
          ? 'Moz↔SA recycle'
          : due
            ? `Moz↔SA recycle · due ${due}`
            : 'Moz↔SA recycle · due T+2',
        amount: roundMoney(ticket.amountZar),
        amountKind: 'ZAR' as const,
      }
    })
    if (eftSource.length > show.length) {
      const rest = roundMoney(eftSource.slice(3).reduce((s, t) => s + t.amountZar, 0))
      steps.push({
        status: 'pending',
        title: `${eftSource.length - 3} more instructions`,
        subline: 'Collapsed',
        amount: rest,
        amountKind: 'ZAR',
      })
    }
    rails.push({
      kind: 'eft',
      label: 'EFT',
      chip: {
        text: `T+2 · ${eftSource.length} ticket${eftSource.length === 1 ? '' : 's'}`,
        variant: 'outline',
      },
      settlementTerm: 'T+2',
      total: eftZar,
      steps,
    })
  }

  const clientTotal = clientTotalOf(rails)
  const stepNumber = input.cardLaneComplete ? 6 : 1
  const stepName = input.cardLaneComplete ? 'What happened' : 'Order'
  const next =
    input.next ||
    (input.cardLaneComplete
      ? {
          stepNumber: 1,
          stepName: 'Order',
          opensIn: 'tomorrow',
          dayLabel: `Day ${input.cycleNumber + 1}`,
        }
      : { stepNumber: 2, stepName: 'Invoice', opensIn: '24h' })

  const settlement = input.cardLaneComplete
    ? { settledZar: cardZar, pendingZar: eftZar, totalZar: clientTotal }
    : undefined

  return {
    schemaVersion: 1,
    stepNumber,
    stepName,
    cycleNumber: input.cycleNumber,
    sentAt: input.sentAt,
    rails,
    next,
    clientTotal,
    summary: buildSummarySentence(rails, clientTotal, input.cardLaneComplete),
    ...(settlement ? { settlement } : {}),
    ...(ledger ? { orderLedger: ledger } : {}),
  }
}
