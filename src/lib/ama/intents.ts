/**
 * Deterministic Intent Classifier for Ama
 * Simple keyword-based rules (no ML) for predictable routing
 */

export type AmaIntent =
  | 'WALLET_BALANCE_SINGLE'
  | 'WALLETS_LIST'
  | 'CRYPTO_BALANCE_PAIR'
  | 'WALLET_APYS'
  | 'PROFILE_HANDLE_EMAIL'
  | 'USER_SNAPSHOT' // Portfolio snapshot, holdings, net worth
  | 'UNKNOWN' // Fall through to LLM

/**
 * Classify user message intent using simple keyword matching
 */
export function classifyIntent(messageText: string): AmaIntent {
  const lower = messageText.toLowerCase().trim()

  // USER_SNAPSHOT: portfolio snapshot, holdings, net worth, show everything
  if (
    lower.includes('portfolio snapshot') ||
    lower.includes('portfolio summary') ||
    lower.includes('holdings') ||
    lower.includes('net worth') ||
    lower.includes('what do i have') ||
    lower.includes('show everything') ||
    lower.includes('account summary') ||
    lower.includes('my portfolio')
  ) {
    return 'USER_SNAPSHOT'
  }

  // PROFILE_HANDLE_EMAIL: handle, email, profile fields, who am I logged in as
  if (
    (lower.includes('handle') && lower.includes('email')) ||
    (lower.includes('email') && (lower.includes('on file') || lower.includes('my email'))) ||
    (lower.includes('what') && lower.includes('email')) ||
    (lower.includes('my handle') || lower.includes('my email')) ||
    lower.includes('who am i logged in as') ||
    lower.includes('what account is this') ||
    lower.includes('who am i') ||
    (lower.includes('logged') && lower.includes('as'))
  ) {
    return 'PROFILE_HANDLE_EMAIL'
  }

  // WALLET_APYS: APY, yield, interest rate
  if (
    lower.includes('apy') ||
    lower.includes('apys') ||
    (lower.includes('yield') && lower.includes('wallet')) ||
    (lower.includes('interest') && lower.includes('rate'))
  ) {
    return 'WALLET_APYS'
  }

  // CRYPTO_BALANCE_PAIR: BTC and ETH together (messy variations)
  if (
    (lower.includes('btc') && lower.includes('eth')) ||
    (lower.includes('bitcoin') && lower.includes('ethereum')) ||
    (lower.includes('my btc') && lower.includes('eth')) ||
    (lower.includes('btc') && lower.includes('ethereum')) ||
    (lower.includes('bitcoin') && lower.includes('eth')) ||
    (lower.includes('btc') && lower.includes('ethereum balance'))
  ) {
    return 'CRYPTO_BALANCE_PAIR'
  }

  // WALLETS_LIST: list, all wallets, wallets and balances, crypto balances
  if (
    lower.includes('list my wallets') ||
    lower.includes('list wallets') ||
    (lower.includes('wallets') && (lower.includes('list') || lower.includes('all') || lower.includes('balances'))) ||
    lower.includes('show my wallets') ||
    lower.includes('all my wallets') ||
    lower.includes('crypto balances') ||
    (lower.includes('show') && lower.includes('balances'))
  ) {
    return 'WALLETS_LIST'
  }

  // WALLET_BALANCE_SINGLE: single currency balance query
  if (
    lower.includes('balance') ||
    lower.includes('how much') ||
    lower.includes('what\'s my') ||
    lower.includes('what is my')
  ) {
    // Check if it's asking for a specific currency
    const hasZar = lower.includes('zar') || lower.includes('rand') || lower.includes('cashzar')
    const hasBtc = lower.includes('btc') || lower.includes('bitcoin')
    const hasEth = lower.includes('eth') || lower.includes('ethereum')
    const hasUsdt = lower.includes('usdt') || lower.includes('tether')

    // If asking for multiple currencies, it's not a single balance query
    const currencyCount = [hasZar, hasBtc, hasEth, hasUsdt].filter(Boolean).length
    if (currencyCount > 1) {
      return 'UNKNOWN' // Let LLM handle multi-currency queries
    }

    return 'WALLET_BALANCE_SINGLE'
  }

  // Default: fall through to LLM
  return 'UNKNOWN'
}

/**
 * Extract currency from message (for WALLET_BALANCE_SINGLE)
 */
export function extractCurrency(messageText: string): string | null {
  const lower = messageText.toLowerCase()
  
  if (lower.includes('btc') || lower.includes('bitcoin')) return 'BTC'
  if (lower.includes('eth') || lower.includes('ethereum')) return 'ETH'
  if (lower.includes('usdt') || lower.includes('tether')) return 'USDT'
  if (lower.includes('zar') || lower.includes('rand') || lower.includes('cashzar')) return 'ZAR'
  
  return null // Default to ZAR if unspecified
}

