/**
 * Compact relative age for desk / notification UI.
 * Coarse units only — rounds up within the shown unit.
 * - "Now" (≤ 15s)
 * - "Xm ago" up to 59m
 * - "Xh ago" up to 23h
 * - "Xd ago" up to 6d
 * - "Xw ago" thereafter
 */
export function formatRelativeShort(timestamp: number, nowMs: number = Date.now()): string {
  const diffMs = Math.max(0, nowMs - timestamp)
  if (diffMs <= 15_000) return 'Now'

  const minutes = Math.max(1, Math.ceil(diffMs / 60_000))
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.max(1, Math.ceil(diffMs / 3_600_000))
  if (hours < 24) return `${hours}h ago`

  const days = Math.max(1, Math.ceil(diffMs / 86_400_000))
  if (days <= 6) return `${days}d ago`

  const weeks = Math.max(1, Math.ceil(diffMs / (7 * 86_400_000)))
  return `${weeks}w ago`
}
