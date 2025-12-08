/**
 * Development and Feature Flags
 */

export const DEV_CARD_FLIP_DEBUG = process.env.NEXT_PUBLIC_DEV_CARD_FLIP_DEBUG === '1'

// Earnings Surprise Animation feature flag
export const EARNINGS_SURPRISE_ENABLED = process.env.NEXT_PUBLIC_EARNINGS_SURPRISE_ENABLED !== 'false' // Default: true

