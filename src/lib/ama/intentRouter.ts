/**
 * Strict Intent Router for Ama
 * Deterministic intent classification with structured output
 */

export type IntentType = 'wallets_all' | 'wallets_crypto' | 'wallets_apy' | 'profile' | 'payments' | 'ambiguous' | 'unknown'

export type ToolName =
  | null
  | 'get_user_wallets'
  | 'get_user_profile'
  | 'list_recent_payments'
  | 'get_payment_by_ref'

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
  clarification?: string // For ambiguous intents
}

/**
 * Classify user intent (lightweight, not brittle)
 */
export function classifyIntent(message: string): IntentResult {
  const lower = message.toLowerCase().trim()

  // Check for ambiguous queries (portfolio snapshot / "how am I doing")
  const hasSnapshot = lower.includes('snapshot') || lower.includes('portfolio') || lower.includes('how am i doing')
  const hasBalanceKeywords = lower.includes('balance') || lower.includes('wallet') || lower.includes('holdings') || lower.includes('money')
  const hasPaymentKeywords = lower.includes('payment') || lower.includes('transaction') || lower.includes('deposit') || lower.includes('withdrawal')
  const hasCryptoKeywords = lower.includes('crypto') || lower.includes('btc') || lower.includes('eth') || lower.includes('bitcoin') || lower.includes('ethereum')
  
  if (hasSnapshot && !hasBalanceKeywords && !hasPaymentKeywords && !hasCryptoKeywords) {
    // Ambiguous - return clarification
    return {
      intent: 'ambiguous',
      tool: null,
      clarification: "Do you want (1) balances, (2) crypto balances, or (3) recent payments?",
    }
  }

  // WALLETS_APY intent (must check before wallets_all)
  if (
    lower.includes('apy') ||
    lower.includes('apys') ||
    (lower.includes('yield') && lower.includes('wallet')) ||
    (lower.includes('interest') && lower.includes('rate'))
  ) {
    return {
      intent: 'wallets_apy',
      tool: 'get_user_wallets',
    }
  }

  // WALLETS_CRYPTO intent (must check before wallets_all)
  if (
    lower.includes('crypto') ||
    (lower.includes('btc') && lower.includes('eth')) ||
    (lower.includes('bitcoin') && lower.includes('ethereum')) ||
    (lower.includes('crypto') && lower.includes('balance'))
  ) {
    return {
      intent: 'wallets_crypto',
      tool: 'get_user_wallets',
      filters: {
        cryptoOnly: true,
        walletIds: ['btc', 'eth'],
      },
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

  // WALLETS_ALL intent (list wallets / balances / "how much money")
  if (
    lower.includes('balance') ||
    lower.includes('wallet') ||
    lower.includes('holdings') ||
    lower.includes('what do i have') ||
    lower.includes('how much') ||
    lower.includes('list') ||
    lower.includes('show') ||
    lower.includes('all')
  ) {
    return {
      intent: 'wallets_all',
      tool: 'get_user_wallets',
    }
  }

  // PROFILE intent (whoami/email/handle)
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

  // PAYMENTS intent (transactions/payments/deposits/withdrawals)
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
                  lower.includes('ten') ? 10 : 1
      filters.limit = Math.min(num, 50) // Cap at 50
    } else {
      filters.limit = 1 // Default to 1 for "last payment"
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

  // Default: unknown (fall through to LLM)
  return {
    intent: 'unknown',
    tool: null,
  }
}

/**
 * Route user message to intent with structured output (alias for classifyIntent)
 */
export function routeIntent(message: string): IntentResult {
  return classifyIntent(message)
}

