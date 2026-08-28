const CASH_OR_PAY_PATH = /^\/(cash|pay)\/([^/]+)\/?$/i
const CASH_PAY_INTENT_KEY = 'gb.cashPayIntent'

/** Canonical origin encoded in every Cash ID so phone cameras open production. */
export const CASH_ID_PUBLIC_ORIGIN = 'https://www.gobankless.app'

export function normalizeCashHandle(raw?: string | null): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim().replace(/^[@$]+/, '')
  } catch {
    return raw.trim().replace(/^[@$]+/, '')
  }
}

/** Build the URL encoded in an agent/user cash QR. */
export function buildAgentCashUrl(handle: string): string {
  const slug = normalizeCashHandle(handle)
  return `${CASH_ID_PUBLIC_ORIGIN}/cash/${encodeURIComponent(slug)}`
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
    return normalizeCashHandle(match[2]) || null
  } catch {
    return null
  }
}

/** Keypad title after scanning a Cash ID, e.g. Cash@ama */
export function formatAgentCashTitle(handle?: string | null): string {
  const name = normalizeCashHandle(handle)
  return name ? `Cash@${name}` : 'Cash'
}

export function saveCashPayIntent(handle: string): void {
  const slug = normalizeCashHandle(handle)
  if (!slug || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CASH_PAY_INTENT_KEY, slug)
  } catch {
    // Private mode / blocked storage — URL ?cash= is the fallback.
  }
}

export function readCashPayIntent(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeCashHandle(sessionStorage.getItem(CASH_PAY_INTENT_KEY)) || null
  } catch {
    return null
  }
}

export function clearCashPayIntent(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(CASH_PAY_INTENT_KEY)
  } catch {
    // ignore
  }
}

export function resolveCashPayIntent(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const fromQuery = new URLSearchParams(search).get('cash')
  return normalizeCashHandle(fromQuery) || readCashPayIntent() || null
}
