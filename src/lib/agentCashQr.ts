const CASH_OR_PAY_PATH = /^\/(cash|pay)\/([^/]+)\/?$/i
const CASH_PAY_INTENT_KEY = 'gb.cashPayIntent'
const CASH_PAY_RESUME_KEY = 'gb.cashPayResume'

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

/** Keypad title for a payment link, e.g. @ama */
export function formatAgentCashTitle(handle?: string | null): string {
  const name = normalizeCashHandle(handle)
  return name ? `@${name}` : '@'
}

function writeSession(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Private mode / blocked storage.
  }
}

function readSession(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function removeSession(key: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function cashHandleFromQuery(
  search: string = typeof window === 'undefined' ? '' : window.location.search
): string | null {
  return normalizeCashHandle(new URLSearchParams(search).get('cash')) || null
}

/** Set only when a signed-out user starts auth from the Cash ID keypad. */
export function saveCashPayResume(handle: string): void {
  const slug = normalizeCashHandle(handle)
  if (!slug) return
  writeSession(CASH_PAY_RESUME_KEY, slug)
}

export function readCashPayResume(): string | null {
  return normalizeCashHandle(readSession(CASH_PAY_RESUME_KEY)) || null
}

export function clearCashPaySession(): void {
  removeSession(CASH_PAY_INTENT_KEY)
  removeSession(CASH_PAY_RESUME_KEY)
}
