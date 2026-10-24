/** EN ROUTE settlement clock: ~18h window from book → expected bank clear. */

export const EN_ROUTE_SETTLEMENT_WINDOW_MS = 18 * 60 * 60 * 1000

export type EnRouteTimerState = 'idle' | 'on_time' | 'delayed'

export type EnRouteTimerView = {
  state: EnRouteTimerState
  /** Remaining ms while on time; overdue ms while delayed; 0 when idle. */
  elapsedMs: number
  remainingMs: number
  overdueMs: number
  /** Track fill 0–100: full at book, drains to 0 at expected settlement. */
  fillPercent: number
  label: string
  ariaLabel: string
}

export function parseWalletUpdatedAtMs(updatedAt: unknown): number | null {
  if (updatedAt == null) return null
  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt) && updatedAt > 0) {
    return updatedAt
  }
  if (typeof updatedAt === 'string') {
    const ms = Date.parse(updatedAt)
    return Number.isFinite(ms) && ms > 0 ? ms : null
  }
  if (typeof updatedAt === 'object') {
    const withMillis = updatedAt as { toMillis?: () => number; seconds?: number }
    if (typeof withMillis.toMillis === 'function') {
      const ms = withMillis.toMillis()
      return Number.isFinite(ms) && ms > 0 ? ms : null
    }
    if (typeof withMillis.seconds === 'number' && Number.isFinite(withMillis.seconds)) {
      const ms = withMillis.seconds * 1000
      return ms > 0 ? ms : null
    }
  }
  return null
}

export function formatEnRouteDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export function enRouteSettlementTimer(params: {
  balanceCents: number
  bookedAtMs: number | null
  nowMs: number
  windowMs?: number
}): EnRouteTimerView {
  const windowMs = params.windowMs ?? EN_ROUTE_SETTLEMENT_WINDOW_MS
  const idle: EnRouteTimerView = {
    state: 'idle',
    elapsedMs: 0,
    remainingMs: 0,
    overdueMs: 0,
    fillPercent: 0,
    label: '',
    ariaLabel: 'No funds en route',
  }

  if (params.balanceCents <= 0 || params.bookedAtMs == null || params.bookedAtMs <= 0) {
    return idle
  }

  const elapsedMs = Math.max(0, params.nowMs - params.bookedAtMs)
  if (elapsedMs < windowMs) {
    const remainingMs = windowMs - elapsedMs
    const fillPercent = Math.max(0, Math.min(100, (remainingMs / windowMs) * 100))
    const label = formatEnRouteDuration(remainingMs)
    return {
      state: 'on_time',
      elapsedMs,
      remainingMs,
      overdueMs: 0,
      fillPercent,
      label,
      ariaLabel: `Settlement expected in ${label}`,
    }
  }

  const overdueMs = elapsedMs - windowMs
  const label = `+${formatEnRouteDuration(overdueMs)}`
  return {
    state: 'delayed',
    elapsedMs,
    remainingMs: 0,
    overdueMs,
    fillPercent: 8,
    label,
    ariaLabel: `Settlement delayed by ${formatEnRouteDuration(overdueMs)}`,
  }
}
