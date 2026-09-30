/**
 * Route evidence + hierarchical beliefs for PAGA's partially observable corridors.
 * Observations are append-only. Beliefs are inferred from outcomes — never bank balances.
 */

export const BELIEF_SCHEMA_VERSION = 1 as const

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

export type EvidenceProvenance =
  | 'bank_mail'
  | 'desk_confirm'
  | 'operator_report'
  | 'timeout_rule'
  | 'backfill'
  | 'simulation'

export type BeliefMaturity = 'cold' | 'thin' | 'established'

export type ReviewState = 'open' | 'clear' | 'recovering'

export type BeliefLevel = 'issuer' | 'acquirer' | 'pair' | 'card' | 'pos'

export type PlannerActionKind =
  | 'execute'
  | 'reduce_to'
  | 'reroute'
  | 'bounded_exploration'
  | 'wait'
  | 'stop_day'

export type PlannerActKind = 'accept_recommendation' | 'wait_override' | 'wait_as_recommended'

export type RouteKeys = {
  issuerId: string | null
  cardId: string | null
  buyerId: string | null
  merchantId: string | null
  posId: string | null
  terminalId: string | null
  acquirerId: string | null
  issuerAcquirerPairId: string | null
}

export type RouteEvidence = RouteKeys & {
  observationId: string
  kind: RouteEvidenceKind
  schemaVersion: typeof BELIEF_SCHEMA_VERSION
  source: EvidenceSource
  provenance: EvidenceProvenance
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
  notes: string[]
}

export type RouteBeliefSnapshot = {
  schemaVersion: typeof BELIEF_SCHEMA_VERSION
  beliefKey: string
  level: BeliefLevel
  /** Inferred from eligible authorisations — not a bank balance. */
  authorisationAcceptance: number | null
  /** Inferred from zar_available / settlement_credited among eligible attempts. */
  finalSettlementRate: number | null
  settlementLatencyMs: number | null
  largestRecentSuccessfulTicketZar: number | null
  rollingSettledVolumeZar: number
  pendingExposureZar: number
  reviewState: ReviewState
  reversalExposure: number
  evidenceCount: number
  evidenceFreshnessDays: number | null
  maturity: BeliefMaturity
  recentAttemptCount: number
  recentSettlementCount: number
  observedCadenceDays: number | null
  lastEventAt: string | null
}

export type ExplanationFact = {
  kind: 'observation' | 'inference'
  text: string
  evidenceIds?: string[]
}

export type NotAttemptedRoute = {
  issuerAcquirerPairId: string | null
  cardId: string | null
  posId: string | null
  reason: string
}

export type PlannerAction = {
  kind: PlannerActionKind
  amountZar: number | null
  cardId: string | null
  posId: string | null
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
  'observationId' | 'schemaVersion' | 'ingestedAt' | 'latencyMs' | 'issuerAcquirerPairId'
> & {
  ingestedAt?: string
  issuerAcquirerPairId?: string | null
}
