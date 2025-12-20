/**
 * Strict Intent Router for Ama
 * Deterministic intent classification with structured output
 */

export type IntentType = 'wallets' | 'profile' | 'payments' | 'general'

export type ToolName =
  | null
  | 'get_user_wallets'
  | 'get_user_profile'
  | 'list_recent_payments'
  | 'get_payment_by_ref'
  | 'get_user_snapshot'

export type IntentFilters = {
  cryptoOnly?: boolean
  walletIds?: string[]
  limit?: number
  offset?: number
  paymentRef?: string
}

export type IntentResult = {
  intent: IntentType
  tool: ToolName
  filters?: IntentFilters
}

/**
 * Route user message to intent with structured output
 */
export function routeIntent(message: string): IntentResult {
  const lower = message.toLowerCase().trim()

  // Check for ambiguous "snapshot" or "portfolio" without other keywords
  const hasSnapshot = lower.includes('snapshot') || lower.includes('portfolio')
  const hasBalanceKeywords = lower.includes('balance') || lower.includes('wallet') || lower.includes('holdings')
  const hasPaymentKeywords = lower.includes('payment') || lower.includes('transaction')
  const hasCryptoKeywords = lower.includes('crypto') || lower.includes('btc') || lower.includes('eth')
  
  if (hasSnapshot && !hasBalanceKeywords && !hasPaymentKeywords && !hasCryptoKeywords) {
    // Ambiguous - return general intent (will trigger clarification)
    return {
      intent: 'general',
      tool: null,
    }
  }

  // PAYMENTS intent
  if (
    lower.includes('payment') ||
    lower.includes('transaction') ||
    lower.includes('transfer') ||
    lower.includes('deposit') ||
    lower.includes('withdrawal') ||
    lower.includes('last') ||
    lower.includes('second') ||
    lower.includes('previous') ||
    lower.includes('reference') ||
    lower.includes('ref')
  ) {
    const filters: IntentFilters = {}
    
    // Extract payment reference if present (UUID pattern or "ref: ...")
    const refMatch = lower.match(/(?:ref|reference)[:\s]+([a-f0-9-]{36})/i) || 
                     lower.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
    if (refMatch) {
      return {
        intent: 'payments',
        tool: 'get_payment_by_ref',
        filters: {
          paymentRef: refMatch[1],
        },
      }
    }
    
    // Extract limit (e.g., "last 3", "last three", "recent 5")
    const limitMatch = lower.match(/(?:last|recent|previous)\s+(?:(\d+)|three|four|five|six|seven|eight|nine|ten)/i)
    if (limitMatch) {
      const num = limitMatch[1] ? parseInt(limitMatch[1], 10) : 
                  lower.includes('three') ? 3 :
                  lower.includes('four') ? 4 :
                  lower.includes('five') ? 5 :
                  lower.includes('six') ? 6 :
                  lower.includes('seven') ? 7 :
                  lower.includes('eight') ? 8 :
                  lower.includes('nine') ? 9 :
                  lower.includes('ten') ? 10 : 3
      filters.limit = Math.min(num, 50) // Cap at 50
    }
    
    // Extract offset (e.g., "2nd last", "second last", "third last")
    const offsetMatch = lower.match(/(?:(\d+)(?:st|nd|rd|th)|first|second|third|fourth|fifth)\s+last/i)
    if (offsetMatch) {
      const num = offsetMatch[1] ? parseInt(offsetMatch[1], 10) :
                  lower.includes('first') ? 1 :
                  lower.includes('second') ? 2 :
                  lower.includes('third') ? 3 :
                  lower.includes('fourth') ? 4 :
                  lower.includes('fifth') ? 5 : 1
      filters.offset = num - 1 // Convert to 0-based offset
    }
    
    return {
      intent: 'payments',
      tool: 'list_recent_payments',
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    }
  }

  // PROFILE intent
  if (
    lower.includes('who am i') ||
    lower.includes('logged in') ||
    lower.includes('handle') ||
    lower.includes('email') ||
    lower.includes('account') ||
    (lower.includes('my') && (lower.includes('profile') || lower.includes('info')))
  ) {
    return {
      intent: 'profile',
      tool: 'get_user_profile',
    }
  }

  // WALLETS intent
  if (
    lower.includes('balance') ||
    lower.includes('wallet') ||
    lower.includes('holdings') ||
    lower.includes('crypto') ||
    lower.includes('btc') ||
    lower.includes('eth') ||
    lower.includes('zar') ||
    lower.includes('apy') ||
    lower.includes('yield') ||
    lower.includes('interest') ||
    lower.includes('what do i have') ||
    lower.includes('how much')
  ) {
    const filters: IntentFilters = {}
    
    // Check for cryptoOnly flag
    if (lower.includes('crypto') || lower.includes('btc') || lower.includes('eth') || lower.includes('bitcoin') || lower.includes('ethereum')) {
      filters.cryptoOnly = true
    }
    
    // Extract specific wallet IDs if mentioned
    const walletIds: string[] = []
    if (lower.includes('btc') || lower.includes('bitcoin')) walletIds.push('btc')
    if (lower.includes('eth') || lower.includes('ethereum')) walletIds.push('eth')
    if (lower.includes('zar') || lower.includes('rand') || lower.includes('cashzar')) walletIds.push('cashZAR')
    if (lower.includes('usdt') || lower.includes('tether')) walletIds.push('usdt')
    
    if (walletIds.length > 0) {
      filters.walletIds = walletIds
    }
    
    return {
      intent: 'wallets',
      tool: 'get_user_wallets',
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    }
  }

  // Default: general (no tool)
  return {
    intent: 'general',
    tool: null,
  }
}

