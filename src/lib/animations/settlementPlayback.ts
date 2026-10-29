import type { CardType } from '@/components/CardStack'

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
  const earningsCredit = current.earnings - previous.earnings
  const zarDebit = previous.cashZAR - current.cashZAR
  if (earningsCredit >= CENT_EPSILON && zarDebit >= CENT_EPSILON) {
    return { affectedCard: 'yieldSurprise' }
  }

  const earningsDebit = previous.earnings - current.earnings
  const mznCredit = current.cashMZN - previous.cashMZN
  if (earningsDebit >= CENT_EPSILON && mznCredit >= CENT_EPSILON) {
    return { affectedCard: 'mzn' }
  }

  const zarCredit = current.cashZAR - previous.cashZAR
  const mznDebit = previous.cashMZN - current.cashMZN
  if (zarCredit >= CENT_EPSILON && mznDebit >= CENT_EPSILON) {
    return { affectedCard: 'savings' }
  }

  return null
}
