/**
 * OperatingPolicyV1 — canonical production operating-calendar policy.
 * Source of truth: docs/PAGA-Operating-Calendar-Rulebook-v1.0.md
 *
 * Analysis scripts and Confirm gates must consume this module.
 * Do not duplicate stronger shadow limits elsewhere.
 */
export const OPERATING_POLICY_VERSION = 'OperatingPolicyV1' as const

export const OPERATING_POLICY_V1 = {
  version: OPERATING_POLICY_VERSION,
  timezone: 'Africa/Johannesburg',

  payment: {
    maxAmountZar: 8_000,
  },

  network: {
    coldDailyCeilingZar: 25_000,
    establishedDailyCeilingZar: 30_000,
    coldNetworkDays: 3,
    maxAttemptsPerOperatingDay: 5,
    sundayNewIntake: 0,
  },

  card: {
    coldAttemptsPerDay: 1,
    establishedAttemptsPerDay: 2,
    maxValuePerDayZar: 15_000,
    maxAttemptsRolling7Days: 6,
    sameCardSpacingMinutes: 120,
  },

  cardPrincipal: {
    maxPerLocalDay: 1,
    maxRolling7Days: 3,
  },

  pos: {
    coldAttemptsPerDay: 2,
    establishedAttemptsPerDay: 3,
    coldPosNetworkDays: 7,
    maxValuePerDayZar: 15_000,
    samePosSpacingMinutes: 120,
    maxShareCount: 0.35,
    maxShareValue: 0.35,
  },

  acquirer: {
    /** Live guardrail (hard max). */
    maxShare: 0.35,
    /** Reference-fixture only balancing band for clean Month 1. */
    referenceCapitecMinShare: 0.25,
    referenceCapitecMaxShare: 0.35,
  },

  continuity: {
    minTerminals: 3,
    minPrincipals: 2,
    minAcquirers: 2,
    /** Clean Month 1 fixture target (stronger than operational minimum). */
    referenceTerminals: 5,
    referencePrincipals: 4,
    referenceAcquirers: 2,
    minPaymentsPerCardTerminalMonth1: 2,
    maxRouteShareOfCardHistory: 0.5,
  },

  timing: {
    operatingHourStart: 9,
    operatingHourEnd: 16,
    operatingMinuteEnd: 30,
    maxDayBucketShareOfAttempts: 0.2,
    /** Monthly planned-value share per 30-minute bucket (rulebook §4.7). */
    maxMonthBucketShareOfValue: 0.2,
  },

  liquidity: {
    /** Explicit single policy parameter — replaces competing 40k/55k constants. */
    defaultOperatingBufferPct: 0.15,
  },

  growth: {
    defaultAuthorisedGrowthRate: 0,
    maxAuthorisedGrowthRate: 0.1,
  },

  newCard: {
    stageA: {
      maxCleanOutcomesExclusive: 3,
      attemptsPerDay: 1,
      maxAttemptZar: 5_000,
      waitForUsableBeforeNext: true,
    },
    stageB: {
      maxCleanOutcomesExclusive: 7,
      attemptsPerDay: 2,
      maxAttemptZar: 6_500,
      maxDayZar: 12_000,
      sameCardSpacingMinutes: 120,
    },
    /** Stage C: standard card rules after ≥7 clean across ≥2 principals and ≥2 acquirers. */
  },
} as const

export type OperatingPolicyV1 = typeof OPERATING_POLICY_V1

export type LifecycleState =
  | 'planned'
  | 'authorised'
  | 'captured'
  | 'settlement_credited'
  | 'zar_available'
  | 'declined'
  | 'delayed'
  | 'under_review'
  | 'reversed'
  | 'recovered'

export type AcquirerId = 'fnb' | 'capitec'

export type MerchantPrincipalId = 'wolf_and_sons' | 'lemon_economics' | 'imani' | 'econometrica'

export type TerminalId = 'WolfFNB' | 'BricsFNB' | 'BricsCapitec' | 'Imani' | 'Econometrica'

export type CardId = 'BRICS' | 'Ginav' | 'Goblin' | 'Kayman' | 'Vidrotec' | 'Wolf' | 'NEW_CARD_M2'

export type NetworkColdState = 'cold_start' | 'established'

export function networkDailyCeilingZar(
  networkDayIndex1Based: number,
  networkState: NetworkColdState,
  policy = OPERATING_POLICY_V1
): number {
  if (networkState === 'cold_start' && networkDayIndex1Based <= policy.network.coldNetworkDays) {
    return policy.network.coldDailyCeilingZar
  }
  return policy.network.establishedDailyCeilingZar
}

export function merchantPrincipalOfTerminal(terminalId: TerminalId): MerchantPrincipalId {
  if (terminalId === 'WolfFNB') return 'wolf_and_sons'
  if (terminalId === 'BricsFNB' || terminalId === 'BricsCapitec') return 'lemon_economics'
  if (terminalId === 'Imani') return 'imani'
  return 'econometrica'
}

export function acquirerOfTerminal(terminalId: TerminalId): AcquirerId {
  return terminalId === 'BricsCapitec' || terminalId === 'Econometrica' ? 'capitec' : 'fnb'
}
