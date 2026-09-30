/**
 * Route evidence + hierarchical beliefs for PAGA's partially observable corridors.
 * Observations are append-only. Beliefs are inferred from outcomes — never bank balances.
 *
 * Identity fields are explicit: merchant principal ≠ card-issuing bank ≠ invoice issuer entity.
 */

export const BELIEF_SCHEMA_VERSION = 2 as const

export type EvidenceSource = 'production' | 'simulation'

export type RouteEvidenceKind =
  | 'authorised'
  | 'captured'
  | 'settlement_credited'
  | 'zar_available'
  | 'under_review'
  | 'delayed'
  | 'reversed'
  | 'recovered'
  | 'declined'

export type AttemptEligibility = 'eligible_submitted' | 'ineligible' | 'unknown'

export type CauseClass =
  | 'unknown'
  | 'issuer_control_or_liquidity'
  | 'card_limit'
  | 'credentials'
  | 'merchant_category'
  | 'documentation'
  | 'operator_cancel'
  | 'acquirer_outage'
  | 'technical_timeout'
  /** Reversal / decline unrelated to route liquidity (e.g. buyer cancelled). */
  | 'unrelated_to_route'

export type EvidenceProvenance =
  | 'bank_mail'
  | 'desk_confirm'
  | 'operator_report'
  | 'timeout_rule'
  | 'acquirer_pos'
  | 'invoice_transition'
  | 'backfill'
  | 'simulation'

/** Trust class: operator reports are observations, not verified bank facts. */
export type EvidenceTrustClass = 'verified_bank' | 'verified_match' | 'operator_observation' | 'rule_derived' | 'simulation'

export type BeliefMaturity = 'cold' | 'thin' | 'established'

/**
 * Distinct lifecycle states. Delay is not recovery.
 * recovering = explicit recovery evidence or post-interruption success in progress.
 */
export type ReviewState =
  | 'clear'
  | 'pending'
  | 'delayed'
  | 'under_review'
  | 'recovering'
  | 'recovered'

export type BeliefLevel = 'issuer' | 'acquirer' | 'pair' | 'card' | 'pos'

export type PlannerActionKind =
  | 'execute'
  | 'reduce_to'
  | 'reroute'
  | 'bounded_exploration'
  | 'wait'
  | 'stop_day'

export type PlannerActKind = 'accept_recommendation' | 'wait_override' | 'wait_as_recommended'

/**
 * Explicit route identity. Do not overload issuerId for merchant invoice issuer.
 *
 * Merchant principals (examples): lemon_economics, wolf_and_sons, imani_beauty.
 * Card-issuing banks (examples): bim, bci, fnb_mozambique, vista, standard_bank_mozambique.
 */
export type RouteKeys = {
  merchantPrincipalId: string | null
  invoiceIssuerEntityId: string | null
  mozambiqueBuyerId: string | null
  cardId: string | null
  cardIssuerBankId: string | null
  posTerminalId: string | null
  acquirerBankId: string | null
  issuerAcquirerPairId: string | null
}

export type RouteEvidence = RouteKeys & {
  observationId: string
  kind: RouteEvidenceKind
  schemaVersion: typeof BELIEF_SCHEMA_VERSION
  source: EvidenceSource
  provenance: EvidenceProvenance
  trustClass: EvidenceTrustClass
  attemptEligibility: AttemptEligibility
  causeClass: CauseClass
  invoiceId: string | null
  economicPaymentId: string | null
  testRunId: string | null
  cycleNumber: number | null
  requestedZar: number
  settledZar: number | null
  eventAt: string
  ingestedAt: string
  settledAt: string | null
  latencyMs: number | null
  /** Links settlement_credited ↔ zar_available when same bank artifact proves both. */
  linkedObservationId: string | null
  operatorUid: string | null
  evidenceRef: string | null
  notes: string[]
}

export type RouteBeliefSnapshot = {
  schemaVersion: typeof BELIEF_SCHEMA_VERSION
  beliefKey: string
  level: BeliefLevel
  /** Inferred from eligible authorisations — not a bank balance. */
  authorisationAcceptance: number | null
  /** Inferred from terminal settlement successes among eligible attempts. */
  finalSettlementRate: number | null
  settlementLatencyMs: number | null
  largestRecentSuccessfulTicketZar: number | null
  rollingSettledVolumeZar: number
  pendingExposureZar: number
  reviewState: ReviewState
  reversalExposure: number
  /** Total observations (auth/capture/delay/etc). */
  evidenceCount: number
  /** Only zar_available / settlement_credited terminals that count as success. */
  settlementEvidenceCount: number
  /** Maturity for settlement performance — capture must not inflate this. */
  settlementMaturity: BeliefMaturity
  evidenceFreshnessDays: number | null
  maturity: BeliefMaturity
  recentAttemptCount: number
  recentSettlementCount: number
  observedCadenceDays: number | null
  lastEventAt: string | null
  operatorObservationCount: number
}

export type ExplanationFact = {
  kind: 'observation' | 'inference'
  text: string
  evidenceIds?: string[]
}

export type NotAttemptedRoute = {
  issuerAcquirerPairId: string | null
  cardId: string | null
  posTerminalId: string | null
  reason: string
}

export type PlannerAction = {
  kind: PlannerActionKind
  amountZar: number | null
  cardId: string | null
  posTerminalId: string | null
  issuerAcquirerPairId: string | null
  invoiceId: string | null
  economicPaymentId: string | null
  legalCheckPass: true
}

export type DecisionState = {
  schemaVersion: typeof BELIEF_SCHEMA_VERSION
  assembledAt: string
  windowDay: number | null
  usableZar: number
  pendingExposureZar: number
  unsettledAcquiringZar: number
  authorisedResidualZar: number
  beliefs: RouteBeliefSnapshot[]
  recentEvidenceIds: string[]
  forecastCompletionAt: string | null
}

export type DecisionRecord = {
  decisionId: string
  schemaVersion: typeof BELIEF_SCHEMA_VERSION
  policyId: string
  policyVersion: string
  decisionStateHash: string
  action: PlannerAction
  constraintTrace: string[]
  objectiveBreakdown: Record<string, number>
  evidenceRefs: string[]
  explanationFacts: ExplanationFact[]
  notAttemptedRoutes: NotAttemptedRoute[]
  createdAt: string
}

/** Authenticated bounded command — LLM remains read-only. */
export type PlannerAct = {
  actId: string
  actKind: PlannerActKind
  operatorUid: string
  decisionId: string
  decisionStateHash: string
  expectedWindowDay: number | null
  idempotencyKey: string
  createdAt: string
  status: 'accepted' | 'rejected_stale' | 'rejected_unauthorised' | 'rejected_duplicate'
  rejectReason: string | null
}

export type NewRouteEvidenceInput = Omit<
  RouteEvidence,
  | 'observationId'
  | 'schemaVersion'
  | 'ingestedAt'
  | 'latencyMs'
  | 'issuerAcquirerPairId'
  | 'trustClass'
  | 'linkedObservationId'
  | 'operatorUid'
  | 'evidenceRef'
> & {
  ingestedAt?: string
  issuerAcquirerPairId?: string | null
  trustClass?: EvidenceTrustClass
  linkedObservationId?: string | null
  operatorUid?: string | null
  evidenceRef?: string | null
}

/** Demo / documentation principals vs card-issuing banks. */
export const MERCHANT_PRINCIPALS = {
  lemon_economics: 'Lemon Economics',
  wolf_and_sons: 'Wolf & Sons',
  imani_beauty: 'Imani Beauty Distributors',
} as const

export const CARD_ISSUING_BANKS = {
  bim: 'BIM',
  bci: 'BCI',
  fnb_mozambique: 'FNB Mozambique',
  vista: 'Vista',
  standard_bank_mozambique: 'Standard Bank Mozambique',
} as const
