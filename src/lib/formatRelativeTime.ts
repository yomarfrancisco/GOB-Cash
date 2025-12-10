/**
 * Format timestamp as relative short string
 * Rules:
 * - "Now" (≤ 15s)
 * - "Xm" up to 59m
 * - "Xh" up to 23h
 * - "Xd" up to 6d
 * - "Xw" thereafter
 */
export function formatRelativeShort(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)

  if (diffSeconds <= 15) {
    return 'Now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`
  }

  if (diffHours < 24) {
    return `${diffHours}h`
  }

  if (diffDays <= 6) {
    return `${diffDays}d`
  }

  return `${diffWeeks}w`
}

