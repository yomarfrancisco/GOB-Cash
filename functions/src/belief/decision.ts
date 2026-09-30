import { createHash } from 'crypto'
import type {
  DecisionRecord,
  DecisionState,
  ExplanationFact,
  NotAttemptedRoute,
  PlannerAct,
  PlannerAction,
  PlannerActKind,
  RouteBeliefSnapshot,
  RouteEvidence,
} from './types'
import { BELIEF_SCHEMA_VERSION } from './types'
import { foldEvidence } from './fold'

export function hashDecisionState(state: DecisionState): string {
  const payload = JSON.stringify({
    usableZar: state.usableZar,
    pendingExposureZar: state.pendingExposureZar,
    unsettledAcquiringZar: state.unsettledAcquiringZar,
    authorisedResidualZar: state.authorisedResidualZar,
    windowDay: state.windowDay,
    beliefs: state.beliefs.map((b) => ({
      k: b.beliefKey,
      a: b.authorisationAcceptance,
      f: b.finalSettlementRate,
      t: b.largestRecentSuccessfulTicketZar,
      r: b.reviewState,
      m: b.maturity,
      n: b.evidenceCount,
    })),
    recentEvidenceIds: state.recentEvidenceIds,
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 24)
}

export function assembleDecisionState(input: {
  evidence: RouteEvidence[]
  usableZar: number
  pendingExposureZar?: number
  unsettledAcquiringZar?: number
  authorisedResidualZar?: number
  windowDay?: number | null
  asOf?: string
  forecastCompletionAt?: string | null
}): DecisionState {
  const asOf = input.asOf || new Date().toISOString()
  const beliefs = foldEvidence(input.evidence, asOf)
  const recentEvidenceIds = [...input.evidence]
    .sort((a, b) => b.eventAt.localeCompare(a.eventAt))
    .slice(0, 12)
    .map((e) => e.observationId)
  return {
    schemaVersion: BELIEF_SCHEMA_VERSION,
    assembledAt: asOf,
    windowDay: input.windowDay ?? null,
    usableZar: input.usableZar,
    pendingExposureZar: input.pendingExposureZar ?? 0,
    unsettledAcquiringZar: input.unsettledAcquiringZar ?? 0,
    authorisedResidualZar: input.authorisedResidualZar ?? 0,
    beliefs,
    recentEvidenceIds,
    forecastCompletionAt: input.forecastCompletionAt ?? null,
  }
}

export function buildDecisionRecord(input: {
  policyId: string
  policyVersion: string
  state: DecisionState
  action: PlannerAction
  constraintTrace?: string[]
  objectiveBreakdown?: Record<string, number>
  evidenceRefs?: string[]
  explanationFacts: ExplanationFact[]
  notAttemptedRoutes?: NotAttemptedRoute[]
  createdAt?: string
}): DecisionRecord {
  const createdAt = input.createdAt || new Date().toISOString()
  const decisionStateHash = hashDecisionState(input.state)
  const decisionId = createHash('sha256')
    .update([input.policyId, input.policyVersion, decisionStateHash, input.action.kind, String(input.action.amountZar)].join('|'))
    .digest('hex')
    .slice(0, 28)
  return {
    decisionId,
    schemaVersion: BELIEF_SCHEMA_VERSION,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    decisionStateHash,
    action: input.action,
    constraintTrace: input.constraintTrace || [],
    objectiveBreakdown: input.objectiveBreakdown || {},
    evidenceRefs: input.evidenceRefs || input.state.recentEvidenceIds,
    explanationFacts: input.explanationFacts,
    notAttemptedRoutes: input.notAttemptedRoutes || [],
    createdAt,
  }
}

/** Stubs for Accept / Wait authority — live wiring in Stage E. */
export function evaluatePlannerAct(input: {
  actKind: PlannerActKind
  operatorUid: string
  authorisedUids: string[]
  decision: DecisionRecord
  submittedDecisionStateHash: string
  expectedWindowDay: number | null
  idempotencyKey: string
  seenIdempotencyKeys: Set<string>
  createdAt?: string
}): PlannerAct {
  const createdAt = input.createdAt || new Date().toISOString()
  const actId = createHash('sha256')
    .update([input.idempotencyKey, input.actKind, input.decision.decisionId].join('|'))
    .digest('hex')
    .slice(0, 24)

  if (input.seenIdempotencyKeys.has(input.idempotencyKey)) {
    return {
      actId,
      actKind: input.actKind,
      operatorUid: input.operatorUid,
      decisionId: input.decision.decisionId,
      decisionStateHash: input.submittedDecisionStateHash,
      expectedWindowDay: input.expectedWindowDay,
      idempotencyKey: input.idempotencyKey,
      createdAt,
      status: 'rejected_duplicate',
      rejectReason: 'Idempotency key already used',
    }
  }
  if (!input.authorisedUids.includes(input.operatorUid)) {
    return {
      actId,
      actKind: input.actKind,
      operatorUid: input.operatorUid,
      decisionId: input.decision.decisionId,
      decisionStateHash: input.submittedDecisionStateHash,
      expectedWindowDay: input.expectedWindowDay,
      idempotencyKey: input.idempotencyKey,
      createdAt,
      status: 'rejected_unauthorised',
      rejectReason: 'Operator not authorised for planner acts',
    }
  }
  if (input.submittedDecisionStateHash !== input.decision.decisionStateHash) {
    return {
      actId,
      actKind: input.actKind,
      operatorUid: input.operatorUid,
      decisionId: input.decision.decisionId,
      decisionStateHash: input.submittedDecisionStateHash,
      expectedWindowDay: input.expectedWindowDay,
      idempotencyKey: input.idempotencyKey,
      createdAt,
      status: 'rejected_stale',
      rejectReason: 'Decision state hash mismatch',
    }
  }
  return {
    actId,
    actKind: input.actKind,
    operatorUid: input.operatorUid,
    decisionId: input.decision.decisionId,
    decisionStateHash: input.submittedDecisionStateHash,
    expectedWindowDay: input.expectedWindowDay,
    idempotencyKey: input.idempotencyKey,
    createdAt,
    status: 'accepted',
    rejectReason: null,
  }
}

export function beliefForPair(
  beliefs: RouteBeliefSnapshot[],
  pairId: string | null
): RouteBeliefSnapshot | null {
  if (!pairId) return null
  return beliefs.find((b) => b.beliefKey === `pair:${pairId}`) || null
}
