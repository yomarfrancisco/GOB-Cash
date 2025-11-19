/**
 * Format BabyCDO intro message from trade context
 * Creates deterministic, personalized messages for AI portfolio actions
 */

export type TradeContext = {
  action: string // e.g., "Rebalanced: sold 10.11 PEPE (R183.09)"
  reason: string // e.g., "Short-term volatility in PEPE; shifting risk to cash"
  amountZar: number
  asset: 'ETH' | 'PEPE' | 'CASH'
  direction: 'buy' | 'sell'
  timestamp: number
}

/**
 * Format a BabyCDO intro message from trade context
 */
export function formatBabyCdoIntroFromTradeContext(context: TradeContext): string {
  const { action, reason, amountZar } = context
  
  // Extract user name if available (for future personalization)
  const userName = typeof window !== 'undefined' 
    ? localStorage.getItem('gb.userName') || undefined
    : undefined

  const greeting = userName ? `Hi ${userName},` : 'Hi,'
  
  // Build the message - keep it concise and natural
  let message = `${greeting} ${action}`
  if (reason) {
    message += ` ${reason}`
  }
  message += ' Tap if you want details.'
  
  return message
}

