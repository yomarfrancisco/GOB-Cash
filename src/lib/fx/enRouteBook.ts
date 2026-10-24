/** Resolve EN ROUTE book time from earnings wallet or a confirmed desk restock. */

import { nextSettleAt09hSast } from './enRouteSettlementTimer'

export type EnRouteActivityHint = {
  routingAction?: string | null
  title?: string | null
  status?: string | null
  awaitingConfirm?: boolean | null
  pairedAmountValue?: number | null
  amountValue?: number | null
  createdAt?: number | null
  userRepliedAt?: number | null
}

export type EnRouteBook = {
  bookedAtMs: number
  settleAtMs: number
  /** Cents used only to arm the timer (not necessarily the card balance). */
  amountCents: number
  source: 'earnings' | 'desk_restock'
}

const MAX_OVERDUE_MS = 7 * 86_400_000

function isConfirmedRestock(item: EnRouteActivityHint): boolean {
  if (item.awaitingConfirm === true) return false
  const status = String(item.status || '').toLowerCase()
  if (status === 'awaiting_execution' || status === 'cancelled' || status === 'superseded') {
    return false
  }
  const action = String(item.routingAction || '')
  const title = String(item.title || '')
  if (action === 'replenish') return true
  if (/^Step\s*5\b/i.test(title) || /^Restock ZAR\b/i.test(title)) return true
  return false
}

function restockAmountCents(item: EnRouteActivityHint): number {
  const zar =
    typeof item.pairedAmountValue === 'number' && item.pairedAmountValue > 0
      ? item.pairedAmountValue
      : typeof item.amountValue === 'number' && item.amountValue > 0
        ? item.amountValue
        : 0
  return Math.round(zar * 100)
}

function restockBookedAtMs(item: EnRouteActivityHint): number | null {
  const replied =
    typeof item.userRepliedAt === 'number' && item.userRepliedAt > 0 ? item.userRepliedAt : null
  const created = typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : null
  return replied ?? created
}

/**
 * Prefer the earnings wallet when it holds in-transit ZAR.
 * Otherwise arm from the newest confirmed desk restock still inside the track window.
 */
export function resolveEnRouteBook(params: {
  earningsCents: number
  earningsUpdatedAtMs: number | null
  earningsSettleAtMs?: number | null
  activity: EnRouteActivityHint[]
  nowMs: number
}): EnRouteBook | null {
  if (params.earningsCents > 0 && params.earningsUpdatedAtMs != null && params.earningsUpdatedAtMs > 0) {
    const settleAtMs =
      params.earningsSettleAtMs != null && params.earningsSettleAtMs > 0
        ? params.earningsSettleAtMs
        : nextSettleAt09hSast(params.earningsUpdatedAtMs)
    if (params.nowMs - settleAtMs > MAX_OVERDUE_MS) return null
    return {
      bookedAtMs: params.earningsUpdatedAtMs,
      settleAtMs,
      amountCents: params.earningsCents,
      source: 'earnings',
    }
  }

  let best: EnRouteBook | null = null
  for (const item of params.activity) {
    if (!isConfirmedRestock(item)) continue
    const bookedAtMs = restockBookedAtMs(item)
    const amountCents = restockAmountCents(item)
    if (bookedAtMs == null || amountCents <= 0) continue
    const settleAtMs = nextSettleAt09hSast(bookedAtMs)
    if (params.nowMs - settleAtMs > MAX_OVERDUE_MS) continue
    if (!best || bookedAtMs > best.bookedAtMs) {
      best = { bookedAtMs, settleAtMs, amountCents, source: 'desk_restock' }
    }
  }
  return best
}
