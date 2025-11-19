/**
 * Card definitions - single source of truth for card titles and subtitles
 * Used by both Autonomous and Manual modes
 */
export type CardType = 'pepe' | 'savings' | 'yield' | 'mzn' | 'btc'

export interface CardDefinition {
  id: CardType
  title: string
  subtitle: string
}

export const CARD_DEFINITIONS: Record<CardType, CardDefinition> = {
  savings: {
    id: 'savings',
    title: 'ZAR wallet',
    subtitle: 'South African business account',
  },
  mzn: {
    id: 'mzn',
    title: 'MZN wallet',
    subtitle: 'Mozambique business account',
  },
  pepe: {
    id: 'pepe',
    title: 'PEPE wallet',
    subtitle: 'PEPE investment account',
  },
  yield: {
    id: 'yield',
    title: 'ETH wallet',
    subtitle: 'ETH investment account',
  },
  btc: {
    id: 'btc',
    title: 'BTC wallet',
    subtitle: 'BTC investment account',
  },
}

/**
 * Get card definition by type
 */
export function getCardDefinition(cardType: CardType): CardDefinition {
  return CARD_DEFINITIONS[cardType]
}

