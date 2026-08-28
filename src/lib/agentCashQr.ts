const CASH_OR_PAY_PATH = /^\/(cash|pay)\/([^/]+)\/?$/i

/** Build the URL encoded in an agent/user cash QR. */
export function buildAgentCashUrl(handle: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gobankless.app'
  return `${origin}/cash/${handle.replace(/^@/, '')}`
}

/**
 * Returns the handle (no @) if `raw` is an agent cash QR payload.
 * Accepts current `/cash/{handle}` codes and older `/pay/{handle}` codes.
 */
export function parseAgentCashQr(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  try {
    const url = new URL(text)
    const match = url.pathname.match(CASH_OR_PAY_PATH)
    if (!match) return null
    return decodeURIComponent(match[2]).replace(/^@/, '') || null
  } catch {
    return null
  }
}

/** Keypad title after scanning a Cash ID, e.g. Cash@ama */
export function formatAgentCashTitle(handle?: string | null): string {
  if (!handle) return 'Cash'
  const name = handle.replace(/^@/, '').trim()
  return name ? `Cash@${name}` : 'Cash'
}
