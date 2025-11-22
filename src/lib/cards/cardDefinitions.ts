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
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
  },
  mzn: {
    id: 'mzn',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
  },
  pepe: {
    id: 'pepe',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
  },
  yield: {
    id: 'yield',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
  },
  btc: {
    id: 'btc',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
  },
}

/**
 * Get card definition by type
 */
export function getCardDefinition(cardType: CardType): CardDefinition {
  return CARD_DEFINITIONS[cardType]
}

