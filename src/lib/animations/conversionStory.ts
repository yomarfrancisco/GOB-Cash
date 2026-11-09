import type { CardType } from '@/components/CardStack'

export type ConversionStoryKind =
  | 'reserve_only'
  | 'partial_liquid'
  | 'queued_liquid'
  | 'route_only'
  | 'split'
  | 'clear_to_zar'
  | 'clear_to_mzn'

export type ConversionStory = {
  kind: ConversionStoryKind
  /** Source card that debits first (flash down). */
  sourceCard: CardType
  /** Instant land card + amount to hold until flipped there. */
  instant?: { card: CardType; amount: number }
  /** ROUTE remainder to hold until flipped there. */
  routed?: { amount: number }
}

const EPS = 0.005

export function roundMajor(n: number): number {
  return Math.round(n * 100) / 100
}

/** Build story from tx_createInternalConversion / capital-shock result. */
export function storyFromConversionResult(params: {
  destination: 'ZAR' | 'MZN'
  amountZAR: number
  amountMZN: number
  reserveInstantZar?: number
  reserveRoutedZar?: number
  reserveInstantMzn?: number
  reserveRoutedMzn?: number
  enRoute?: boolean
}): ConversionStory | null {
  const dest = params.destination
  if (dest === 'ZAR') {
    const instant = roundMajor(Number(params.reserveInstantZar || 0))
    const routed = roundMajor(
      Number(
        params.reserveRoutedZar != null
          ? params.reserveRoutedZar
          : params.enRoute
            ? Math.max(0, params.amountZAR - instant)
            : 0
      )
    )
    if (instant > EPS && routed > EPS) {
      return {
        kind: 'split',
        sourceCard: 'mzn',
        instant: { card: 'savings', amount: instant },
        routed: { amount: routed },
      }
    }
    if (instant > EPS) {
      return {
        kind: 'reserve_only',
        sourceCard: 'mzn',
        instant: { card: 'savings', amount: instant },
      }
    }
    if (routed > EPS || params.enRoute) {
      return {
        kind: 'route_only',
        sourceCard: 'mzn',
        // ROUTE collapsed into ZAR card — still track routed R for hold/flash.
        routed: { amount: routed > EPS ? routed : roundMajor(params.amountZAR) },
      }
    }
    return null
  }

  // destination MZN (sell ZAR)
  const instant = roundMajor(Number(params.reserveInstantMzn || 0))
  const routed = roundMajor(
    Number(
      params.reserveRoutedMzn != null
        ? params.reserveRoutedMzn
        : params.enRoute
          ? Math.max(0, params.amountMZN - instant)
          : 0
    )
  )
  if (instant > EPS && routed > EPS) {
    return {
      kind: 'split',
      sourceCard: 'savings',
      instant: { card: 'mzn', amount: instant },
      routed: { amount: routed },
    }
  }
  if (instant > EPS) {
    return {
      kind: 'reserve_only',
      sourceCard: 'savings',
      instant: { card: 'mzn', amount: instant },
    }
  }
  if (routed > EPS || params.enRoute) {
    return {
      kind: 'route_only',
      sourceCard: 'savings',
      routed: { amount: routed > EPS ? routed : roundMajor(params.amountMZN) },
    }
  }
  return null
}

export function clearStoryForDest(dest: 'ZAR' | 'MZN'): ConversionStory {
  return dest === 'ZAR'
    ? { kind: 'clear_to_zar', sourceCard: 'yieldSurprise', instant: { card: 'savings', amount: 0 } }
    : { kind: 'clear_to_mzn', sourceCard: 'yieldSurprise', instant: { card: 'mzn', amount: 0 } }
}
