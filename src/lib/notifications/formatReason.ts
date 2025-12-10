/**
 * Join action and reason text with proper punctuation
 * Avoids ". —" sequences by using either sentence style or dash style
 */
export function joinActionAndReason(action: string, reason?: string): string {
  if (!reason) return action

  const a = action.trim()
  const r = reason.trim()

  if (!a || !r) return a || r

  const endsWithPeriod = a.endsWith('.')

  // Option A: sentence style (preferred) - if action ends with period
  if (endsWithPeriod) {
    // Capitalize first letter of reason
    const capitalizedReason = r.charAt(0).toUpperCase() + r.slice(1)
    return `${a} ${capitalizedReason}`
  }

  // Option B: dash style if no period
  const capitalizedReason = r.charAt(0).toUpperCase() + r.slice(1)
  return `${a} — ${capitalizedReason}`
}

