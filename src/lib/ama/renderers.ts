/**
 * Deterministic Renderers for Ama
 * Code-based formatting (no LLM interpretation)
 */

export type WalletData = {
  walletId: string
  displayCurrency: string
  fiatBalance: number
  usdtBalance: number
  apy?: number | null
  updatedAt?: string | null
  kind?: string | null
}

export type ProfileData = {
  userId?: string
  handle?: string
  email?: string
  [key: string]: any
}

export type PaymentData = {
  ref: string
  status: string
  amountZAR?: number
  currency?: string
  createdAt?: string | null
  [key: string]: any
}

export type IntentFilters = {
  cryptoOnly?: boolean
  walletIds?: string[]
  limit?: number
  offset?: number
  paymentRef?: string
}

/**
 * Format timestamp to human-readable
 */
function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Unknown'
  
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Unknown'
    
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return timestamp
  }
}

/**
 * Render wallets data deterministically
 * Always includes all wallets when asked (never only ZAR)
 */
export function renderWallets(
  wallets: WalletData[] | Record<string, any>,
  intent?: 'wallets_all' | 'wallets_crypto' | 'wallets_apy',
  filters?: IntentFilters
): string {
  // Convert object map to array if needed
  let walletsArray: WalletData[] = Array.isArray(wallets)
    ? wallets
    : Object.entries(wallets).map(([walletId, data]) => ({
        walletId,
        displayCurrency: data.displayCurrency || walletId,
        fiatBalance: data.fiatBalance || 0,
        usdtBalance: data.usdtBalance || 0,
        apy: data.apy || null,
        updatedAt: data.updatedAt || null,
        kind: data.kind || null,
      }))

  // Apply filters based on intent
  if (intent === 'wallets_crypto' || filters?.cryptoOnly) {
    // Only include BTC and ETH (even if 0)
    walletsArray = walletsArray.filter(w => 
      (w.displayCurrency === 'BTC' || w.walletId.toLowerCase() === 'btc') ||
      (w.displayCurrency === 'ETH' || w.walletId.toLowerCase() === 'eth')
    )
    
    // Ensure BTC and ETH exist (add zeros if missing)
    const hasBtc = walletsArray.some(w => w.displayCurrency === 'BTC' || w.walletId.toLowerCase() === 'btc')
    const hasEth = walletsArray.some(w => w.displayCurrency === 'ETH' || w.walletId.toLowerCase() === 'eth')
    
    if (!hasBtc) {
      walletsArray.push({
        walletId: 'btc',
        displayCurrency: 'BTC',
        fiatBalance: 0,
        usdtBalance: 0,
        apy: null,
        updatedAt: null,
        kind: null,
      })
    }
    
    if (!hasEth) {
      walletsArray.push({
        walletId: 'eth',
        displayCurrency: 'ETH',
        fiatBalance: 0,
        usdtBalance: 0,
        apy: null,
        updatedAt: null,
        kind: null,
      })
    }
  } else if (intent === 'wallets_apy') {
    // Include all wallets for APY queries
    // (no filtering)
  } else {
    // wallets_all: Include ALL wallets (never filter to only ZAR)
    // (no filtering)
  }

  // Sort by walletId for consistency
  walletsArray.sort((a, b) => a.walletId.localeCompare(b.walletId))

  if (walletsArray.length === 0) {
    return "You don't have any wallets set up yet."
  }

  // Format each wallet (always include all fields)
  const lines = walletsArray.map(w => {
    const currency = w.displayCurrency || w.walletId
    const balance = currency === 'ZAR'
      ? new Intl.NumberFormat('en-ZA', {
          style: 'currency',
          currency: 'ZAR',
          minimumFractionDigits: 2,
        }).format(w.fiatBalance || 0)
      : `${w.usdtBalance || 0} ${currency}`
    
    const apy = w.apy ? ` | APY: ${w.apy}%` : ''
    const updatedAt = formatTimestamp(w.updatedAt)
    
    return `${currency}: ${balance}${apy} | Updated: ${updatedAt}`
  })

  if (intent === 'wallets_apy') {
    return `Your wallet APYs:\n${lines.map(l => l.split(' | ')[0] + (l.includes('APY:') ? ' | ' + l.split('APY:')[1].split(' | ')[0] : ' | APY: N/A')).join('\n')}`
  }

  return `Your wallets:\n${lines.join('\n')}`
}

/**
 * Render profile data deterministically
 */
export function renderProfile(profile: ProfileData | null): string {
  if (!profile) {
    return "I couldn't find your profile information."
  }

  const parts: string[] = []
  
  if (profile.email) {
    parts.push(`Email: ${profile.email}`)
  }
  
  if (profile.handle) {
    parts.push(`Handle: ${profile.handle}`)
  }
  
  if (profile.userId) {
    parts.push(`User ID: ${profile.userId}`)
  }

  if (parts.length === 0) {
    return "Your profile information is not available."
  }

  return parts.join('\n')
}

/**
 * Render payments data deterministically
 */
export function renderPayments(
  payments: PaymentData[],
  filters?: IntentFilters
): string {
  if (!payments || payments.length === 0) {
    return "I don't see any transactions yet in your account history.\n\nWas it a deposit? If you tell me an approximate amount, date, or reference, I can try a narrower lookup.\n\nYou can also check your account directly."
  }

  // Apply offset if specified
  let displayPayments = payments
  if (filters?.offset !== undefined && filters.offset > 0) {
    displayPayments = payments.slice(filters.offset, filters.offset + 1)
  } else if (filters?.limit) {
    displayPayments = payments.slice(0, filters.limit)
  }

  if (displayPayments.length === 0) {
    return "No payments found matching that criteria."
  }

  // Format each payment
  const lines = displayPayments.map(p => {
    const ref = p.ref ? p.ref.substring(0, 8) : 'Unknown'
    const status = p.status || 'Unknown'
    const amount = p.amountZAR
      ? new Intl.NumberFormat('en-ZA', {
          style: 'currency',
          currency: 'ZAR',
          minimumFractionDigits: 2,
        }).format(p.amountZAR)
      : 'N/A'
    const date = formatTimestamp(p.createdAt)
    
    return `Ref: ${ref} | Status: ${status} | Amount: ${amount} | Date: ${date}`
  })

  return `Your payments:\n${lines.join('\n')}`
}

/**
 * Render single payment data
 */
export function renderPayment(payment: PaymentData | null): string {
  if (!payment) {
    return "I couldn't find that payment."
  }

  const ref = payment.ref || 'Unknown'
  const status = payment.status || 'Unknown'
  const amount = payment.amountZAR
    ? new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
      }).format(payment.amountZAR)
    : 'N/A'
  const date = formatTimestamp(payment.createdAt)
  const currency = payment.currency || 'ZAR'

  return `Payment ${ref}:\nStatus: ${status}\nAmount: ${amount} ${currency}\nDate: ${date}`
}

