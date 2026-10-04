import type { ActivityItem } from '@/store/activity'
import type { ConversionRoutingSummary } from '@/lib/transactions/clientFunctions'

export type DeskHeaderStatus = {
  dayLabel: string
  statusLabel: string
  statusTone: 'ok' | 'review' | 'restock' | 'muted'
  progressPct: number
  progressLabel: string
  /** Calendar day for the focused bubble (ms). */
  focusAt: number | null
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

/** Window progress at a point in the replay/scroll timeline. */
export function progressThroughFocus(
  items: ActivityItem[],
  focusAt: number | null,
  focusCycle: number | null,
  dayCount: number
): number {
  const routing = items
    .filter((item) => item.thinking !== true && item.kind === 'CONVERSION_ROUTING_INSTRUCTION')
    .sort((a, b) => a.createdAt - b.createdAt)
  if (!routing.length) return 0

  const at = focusAt ?? routing[routing.length - 1]!.createdAt
  const day =
    (focusCycle && focusCycle > 0
      ? focusCycle
      : routing.filter((item) => item.createdAt <= at).slice(-1)[0]?.cycleNumber) || 1

  const sameDay = routing.filter((item) => item.cycleNumber === day)
  const throughDay = sameDay.filter((item) => item.createdAt <= at)
  const dayFrac = sameDay.length ? throughDay.length / sameDay.length : 1
  const pct = ((Math.max(0, day - 1) + Math.min(1, dayFrac)) / Math.max(1, dayCount)) * 100
  return Math.min(100, Math.max(0, pct))
}

export function buildDeskHeaderStatus(
  summary: ConversionRoutingSummary | null | undefined,
  items: ActivityItem[],
  focus?: { focusAt: number | null; focusCycle: number | null }
): DeskHeaderStatus {
  const dayCount = Number(summary?.cycleCount) > 0 ? Number(summary?.cycleCount) : 14
  const focusAt = focus?.focusAt ?? null
  const focusCycle = focus?.focusCycle ?? null

  const dayFromFocus =
    focusCycle && focusCycle > 0
      ? focusCycle
      : focusAt
        ? items
            .filter((item) => item.createdAt <= focusAt && typeof item.cycleNumber === 'number')
            .sort((a, b) => b.createdAt - a.createdAt)[0]?.cycleNumber || 0
        : 0

  const day =
    dayFromFocus ||
    (Number(summary?.cycleNumber) > 0
      ? Number(summary?.cycleNumber)
      : latestCycle(items) || Number(summary?.completedCycles) || 0)

  const progressPct = progressThroughFocus(items, focusAt, focusCycle || day || null, dayCount)

  if (!summary || summary.status === 'none') {
    return {
      dayLabel: day > 0 ? `Day ${day} of ${dayCount}` : `Day — of ${dayCount}`,
      statusLabel: 'Quiet',
      statusTone: 'muted',
      progressPct: 0,
      progressLabel: '',
      focusAt,
    }
  }

  if (summary.status === 'completed' || summary.completed === true) {
    return {
      dayLabel: `Day ${dayCount} of ${dayCount}`,
      statusLabel: 'Window closed',
      statusTone: 'muted',
      progressPct: focusAt ? progressPct : 100,
      progressLabel: '',
      focusAt,
    }
  }

  // Status reflects the live desk, not the scrolled historical bubble.
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
    progressLabel: '',
    focusAt,
  }
}
