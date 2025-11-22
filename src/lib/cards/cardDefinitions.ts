/**
 * Card definitions - single source of truth for card titles and subtitles
 * Used by both Autonomous and Manual modes
 */
export type CardType = 'pepe' | 'savings' | 'yield' | 'mzn' | 'btc'

export interface CardDefinition {
  id: CardType
  title: string
  subtitle: string
  annualYieldBps?: number // yield in basis points, optional for now
}

export const CARD_DEFINITIONS: Record<CardType, CardDefinition> = {
  savings: {
    id: 'savings',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
    annualYieldBps: 938, // 9.38%
  },
  mzn: {
    id: 'mzn',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
    annualYieldBps: 812, // 8.12%
  },
  pepe: {
    id: 'pepe',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
    annualYieldBps: 2134, // 21.34%
  },
  yield: {
    id: 'yield',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
    annualYieldBps: 1245, // 12.45%
  },
  btc: {
    id: 'btc',
    title: 'Adaptive wallet',
    subtitle: '', // Subtitle is calculated dynamically in page.tsx
    annualYieldBps: 1567, // 15.67%
  },
}

/**
 * Get card definition by type
 */
export function getCardDefinition(cardType: CardType): CardDefinition {
  return CARD_DEFINITIONS[cardType]
}

