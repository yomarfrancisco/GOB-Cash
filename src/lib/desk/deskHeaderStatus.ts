import type { ActivityItem } from '@/store/activity'
import type { ConversionRoutingSummary } from '@/lib/transactions/clientFunctions'

export type DeskHeaderStatus = {
  dayLabel: string
  statusLabel: string
  statusTone: 'ok' | 'review' | 'restock' | 'muted'
  progressPct: number
  progressLabel: string
}

function latestCycle(items: ActivityItem[]): number {
  let max = 0
  for (const item of items) {
    if (typeof item.cycleNumber === 'number' && item.cycleNumber > max) max = item.cycleNumber
  }
  return max
}

function hasOpenAttention(items: ActivityItem[]): boolean {
  return items.some((item) => {
    if (item.thinking === true) return false
    if (item.status === 'completed' || item.status === 'cancelled' || item.status === 'superseded') return false
    const blob = `${item.title || ''} ${item.body || ''}`.toLowerCase()
    if (item.routingBlocked === true) return true
    if (blob.includes('pending') || blob.includes('on hold') || blob.includes('declined')) return true
    if (item.awaitingProposalAccept === true) return true
    return false
  })
}

function openKind(items: ActivityItem[]): string | null {
  const open = items.find(
    (item) =>
      item.thinking !== true &&
      item.awaitingConfirm === true &&
      item.status !== 'completed' &&
      item.status !== 'cancelled' &&
      item.status !== 'superseded'
  )
  return open?.routingAction || null
}

export function buildDeskHeaderStatus(
  summary: ConversionRoutingSummary | null | undefined,
  items: ActivityItem[]
): DeskHeaderStatus {
  const dayCount = Number(summary?.cycleCount) > 0 ? Number(summary?.cycleCount) : 14
  const day =
    Number(summary?.cycleNumber) > 0
      ? Number(summary?.cycleNumber)
      : latestCycle(items) || Number(summary?.completedCycles) || 0

  const converted = Number(summary?.cumulativeDeployed) || 0
  const residual = Number(summary?.availableCapital) || 0
  const windowTotal = converted + residual > 0 ? converted + residual : 0
  const progressPct = windowTotal > 0 ? Math.min(100, Math.max(0, (converted / windowTotal) * 100)) : 0

  if (!summary || summary.status === 'none') {
    return {
      dayLabel: day > 0 ? `Day ${day} of ${dayCount}` : `Day — of ${dayCount}`,
      statusLabel: 'Quiet',
      statusTone: 'muted',
      progressPct: 0,
      progressLabel: '0% of window',
    }
  }

  if (summary.status === 'completed' || summary.completed === true) {
    return {
      dayLabel: `Day ${dayCount} of ${dayCount}`,
      statusLabel: 'Window closed',
      statusTone: 'muted',
      progressPct: 100,
      progressLabel: '100% of window',
    }
  }

  let statusLabel = 'On track'
  let statusTone: DeskHeaderStatus['statusTone'] = 'ok'
  if (hasOpenAttention(items)) {
    statusLabel = 'Review'
    statusTone = 'review'
  } else {
    const kind = openKind(items)
    if (kind === 'replenish') {
      statusLabel = 'Restock'
      statusTone = 'restock'
    } else if (kind === 'deploy') {
      statusLabel = 'Send'
      statusTone = 'ok'
    } else if (kind === 'step') {
      statusLabel = 'On track'
      statusTone = 'ok'
    }
  }

  return {
    dayLabel: day > 0 ? `Day ${day} of ${dayCount}` : `Day — of ${dayCount}`,
    statusLabel,
    statusTone,
    progressPct,
    progressLabel: `${progressPct.toFixed(1)}% of window`,
  }
}
