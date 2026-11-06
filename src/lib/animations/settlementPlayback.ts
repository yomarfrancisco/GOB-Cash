import type { CardType } from '@/components/CardStack'
import type { ConversionStory } from '@/lib/animations/conversionStory'
import { roundMajor } from '@/lib/animations/conversionStory'

export type SettlementBalances = {
  cashZAR: number
  cashMZN: number
  earnings: number
}

export type SettlementPlayback = {
  affectedCard: CardType
}

const CENT_EPSILON = 0.005

/**
 * Recognize a real EN ROUTE settlement from wallet state, rather than
 * manufacturing a balance change for the animation.
 */
export function settlementPlaybackForTransition(
  previous: SettlementBalances,
  current: SettlementBalances
): SettlementPlayback | null {
  const story = conversionStoryFromWalletTransition(previous, current)
  if (!story) return null
  if (story.kind === 'clear_to_zar') return { affectedCard: 'savings' }
  if (story.kind === 'clear_to_mzn') return { affectedCard: 'mzn' }
  if (story.kind === 'route_only') return { affectedCard: 'yieldSurprise' }
  if (story.instant) return { affectedCard: story.instant.card }
  return { affectedCard: story.sourceCard }
}

/** Infer a conversion/clear story from a wallet balance transition. */
export function conversionStoryFromWalletTransition(
  previous: SettlementBalances,
  current: SettlementBalances
): ConversionStory | null {
  const earningsCredit = current.earnings - previous.earnings
  const zarDebit = previous.cashZAR - current.cashZAR
  const mznDebit = previous.cashMZN - current.cashMZN
  const earningsDebit = previous.earnings - current.earnings
  const zarCredit = current.cashZAR - previous.cashZAR
  const mznCredit = current.cashMZN - previous.cashMZN

  // Book ZAR → ROUTE
  if (earningsCredit >= CENT_EPSILON && zarDebit >= CENT_EPSILON) {
    return {
      kind: 'route_only',
      sourceCard: 'savings',
      routed: { amount: roundMajor(earningsCredit) },
    }
  }

  // Book MZN → ROUTE (buy ZAR en route)
  if (earningsCredit >= CENT_EPSILON && mznDebit >= CENT_EPSILON) {
    return {
      kind: 'route_only',
      sourceCard: 'mzn',
      routed: { amount: roundMajor(earningsCredit) },
    }
  }

  // Clear ROUTE → MZN
  if (earningsDebit >= CENT_EPSILON && mznCredit >= CENT_EPSILON) {
    return {
      kind: 'clear_to_mzn',
      sourceCard: 'yieldSurprise',
      instant: { card: 'mzn', amount: roundMajor(mznCredit) },
    }
  }

  // Clear ROUTE → ZAR
  if (earningsDebit >= CENT_EPSILON && zarCredit >= CENT_EPSILON) {
    return {
      kind: 'clear_to_zar',
      sourceCard: 'yieldSurprise',
      instant: { card: 'savings', amount: roundMajor(zarCredit) },
    }
  }

  // Reserve instant buy ZAR (MZN → ZAR, no earnings)
  if (zarCredit >= CENT_EPSILON && mznDebit >= CENT_EPSILON && Math.abs(earningsCredit) < CENT_EPSILON) {
    return {
      kind: 'reserve_only',
      sourceCard: 'mzn',
      instant: { card: 'savings', amount: roundMajor(zarCredit) },
    }
  }

  // Reserve instant sell ZAR (ZAR → MZN, no earnings)
  if (mznCredit >= CENT_EPSILON && zarDebit >= CENT_EPSILON && Math.abs(earningsCredit) < CENT_EPSILON) {
    return {
      kind: 'reserve_only',
      sourceCard: 'savings',
      instant: { card: 'mzn', amount: roundMajor(mznCredit) },
    }
  }

  return null
}
