import { assembleDecisionState, beliefForPair, buildDecisionRecord } from './decision'
import { resolveRouteBelief } from './fold'
import type {
  DecisionRecord,
  DecisionState,
  ExplanationFact,
  NotAttemptedRoute,
  PlannerAction,
  RouteBeliefSnapshot,
  RouteEvidence,
} from './types'

export const POLICY_CONTROL = { id: 'control_absorbing_v4', version: '1' } as const
export const POLICY_BELIEF_THRESHOLD = { id: 'belief_threshold', version: '1' } as const
export const POLICY_LOOKAHEAD = { id: 'lookahead_mpc_short', version: '1' } as const

/** Hard concentration / pending exposure envelope (ZAR). Soft penalty approaches this. */
export const HARD_PENDING_EXPOSURE_CAP_ZAR = 40_000

export type CandidatePayment = {
  amountZar: number
  cardId: string
  posId: string
  issuerId: string
  acquirerId: string
  issuerAcquirerPairId: string
  invoiceId: string | null
  economicPaymentId: string | null
  /** When set, candidate is rejected by every policy before scoring. */
  illegalReason?: string | null
}

export type PolicyInput = {
  evidence: RouteEvidence[]
  usableZar: number
  authorisedResidualZar: number
  pendingExposureZar: number
  candidates: CandidatePayment[]
  /** Control policy's precomputed choice (current absorbing planner). */
  controlAction?: PlannerAction | null
  asOf?: string
  windowDay?: number | null
  hardExposureCapZar?: number
}

function legalCandidates(
  candidates: CandidatePayment[],
  pendingExposureZar: number,
  hardCap: number
): { legal: CandidatePayment[]; skipped: NotAttemptedRoute[] } {
  const legal: CandidatePayment[] = []
  const skipped: NotAttemptedRoute[] = []
  for (const c of candidates) {
    if (c.illegalReason) {
      skipped.push({
        issuerAcquirerPairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posId: c.posId,
        reason: c.illegalReason,
      })
      continue
    }
    if (c.amountZar <= 0) {
      skipped.push({
        issuerAcquirerPairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posId: c.posId,
        reason: 'Non-positive amount',
      })
      continue
    }
    if (pendingExposureZar + c.amountZar > hardCap) {
      skipped.push({
        issuerAcquirerPairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posId: c.posId,
        reason: `Would exceed hard pending exposure cap R${hardCap}`,
      })
      continue
    }
    legal.push(c)
  }
  return { legal, skipped }
}

function actionFromCandidate(
  kind: PlannerAction['kind'],
  c: CandidatePayment,
  amountZar = c.amountZar
): PlannerAction {
  return {
    kind,
    amountZar,
    cardId: c.cardId,
    posId: c.posId,
    issuerAcquirerPairId: c.issuerAcquirerPairId,
    invoiceId: c.invoiceId,
    economicPaymentId: c.economicPaymentId,
    legalCheckPass: true,
  }
}

function waitAction(): PlannerAction {
  return {
    kind: 'wait',
    amountZar: null,
    cardId: null,
    posId: null,
    issuerAcquirerPairId: null,
    invoiceId: null,
    economicPaymentId: null,
    legalCheckPass: true,
  }
}

function stopAction(): PlannerAction {
  return {
    kind: 'stop_day',
    amountZar: null,
    cardId: null,
    posId: null,
    issuerAcquirerPairId: null,
    invoiceId: null,
    economicPaymentId: null,
    legalCheckPass: true,
  }
}

function scoreCandidate(
  c: CandidatePayment,
  belief: RouteBeliefSnapshot | null,
  pendingExposureZar: number,
  hardCap: number
): number {
  const margin = c.amountZar * 0.1
  const settle = belief?.finalSettlementRate ?? belief?.authorisationAcceptance ?? 0.55
  const reviewPenalty = belief?.reviewState === 'open' ? 0.45 : belief?.reviewState === 'recovering' ? 0.15 : 0
  const approach = pendingExposureZar / hardCap
  const softConcentration = approach > 0.7 ? (approach - 0.7) * c.amountZar * 0.05 : 0
  const ticketFit =
    belief?.largestRecentSuccessfulTicketZar != null
      ? c.amountZar <= belief.largestRecentSuccessfulTicketZar * 1.05
        ? 1
        : 0.7
      : 0.85
  return margin * settle * ticketFit - reviewPenalty * margin - softConcentration
}

function factsFor(
  action: PlannerAction,
  belief: RouteBeliefSnapshot | null,
  lastEvidence: RouteEvidence[]
): ExplanationFact[] {
  const facts: ExplanationFact[] = []
  const lastSettle = [...lastEvidence]
    .reverse()
    .find((e) => e.kind === 'zar_available' || e.kind === 'settlement_credited')
  const lastAuth = [...lastEvidence].reverse().find((e) => e.kind === 'authorised')
  const lastReview = [...lastEvidence].reverse().find((e) => e.kind === 'under_review')

  if (lastSettle) {
    const amt = lastSettle.settledZar ?? lastSettle.requestedZar
    facts.push({
      kind: 'observation',
      text: `The last R${amt.toLocaleString('en-ZA')} payment settled on this route.`,
      evidenceIds: [lastSettle.observationId],
    })
  } else if (lastAuth) {
    facts.push({
      kind: 'observation',
      text: 'Payment authorised; settlement not yet credited as usable ZAR.',
      evidenceIds: [lastAuth.observationId],
    })
  }
  if (lastReview) {
    facts.push({
      kind: 'observation',
      text: 'A payment on this route was placed under review.',
      evidenceIds: [lastReview.observationId],
    })
  }

  if (action.kind === 'wait') {
    facts.push({
      kind: 'inference',
      text: 'Waiting: another attempt’s expected contribution is below waiting.',
    })
  } else if (action.kind === 'bounded_exploration' && action.amountZar != null) {
    facts.push({
      kind: 'inference',
      text: `Bounded exploration: proposing a smaller genuine ticket of R${action.amountZar.toLocaleString('en-ZA')}.`,
    })
  } else if (belief?.largestRecentSuccessfulTicketZar != null && action.amountZar != null) {
    facts.push({
      kind: 'inference',
      text: `Keeping the next payment within that recently observed ticket size (R${belief.largestRecentSuccessfulTicketZar.toLocaleString('en-ZA')}).`,
    })
  } else if (action.kind === 'execute' || action.kind === 'reduce_to') {
    facts.push({
      kind: 'inference',
      text: 'Little eligible settled history on this issuer–acquirer pair; starting with a bounded genuine ticket.',
    })
  }
  if (belief) {
    facts.push({
      kind: 'observation',
      text: `Evidence maturity ${belief.maturity}; ${belief.evidenceCount} observations; review state ${belief.reviewState}.`,
    })
  }
  return facts
}

/** Control: echo the current absorbing planner choice when provided. */
export function decideControl(input: PolicyInput): DecisionRecord {
  const state = assembleDecisionState({
    evidence: input.evidence,
    usableZar: input.usableZar,
    authorisedResidualZar: input.authorisedResidualZar,
    pendingExposureZar: input.pendingExposureZar,
    asOf: input.asOf,
    windowDay: input.windowDay,
  })
  const action = input.controlAction || waitAction()
  return buildDecisionRecord({
    policyId: POLICY_CONTROL.id,
    policyVersion: POLICY_CONTROL.version,
    state,
    action,
    constraintTrace: ['control:absorbing-tickets-v4'],
    explanationFacts: [
      { kind: 'inference', text: 'Using the current absorbing-ticket planner as control.' },
    ],
    notAttemptedRoutes: [],
    createdAt: input.asOf,
  })
}

/**
 * Belief-threshold heuristic (seed-free). Prefer amounts near largest recent successful ticket;
 * wait/reroute on open review; bounded_exploration only as a smaller genuine legal payment.
 */
export function decideBeliefThreshold(input: PolicyInput): DecisionRecord {
  const hardCap = input.hardExposureCapZar ?? HARD_PENDING_EXPOSURE_CAP_ZAR
  const state = assembleDecisionState({
    evidence: input.evidence,
    usableZar: input.usableZar,
    authorisedResidualZar: input.authorisedResidualZar,
    pendingExposureZar: input.pendingExposureZar,
    asOf: input.asOf,
    windowDay: input.windowDay,
  })
  const { legal, skipped } = legalCandidates(input.candidates, input.pendingExposureZar, hardCap)

  if (input.usableZar <= 0 || input.authorisedResidualZar <= 0) {
    return finish(POLICY_BELIEF_THRESHOLD, state, stopAction(), skipped, input.evidence, null, {
      stop: 1,
    })
  }
  if (!legal.length) {
    return finish(POLICY_BELIEF_THRESHOLD, state, waitAction(), skipped, input.evidence, null, {
      wait: 1,
    })
  }

  const scored = legal
    .map((c) => {
      const belief = resolveRouteBelief(state.beliefs, {
        issuerId: c.issuerId,
        acquirerId: c.acquirerId,
        pairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posId: c.posId,
      })
      return { c, belief, score: scoreCandidate(c, belief, input.pendingExposureZar, hardCap) }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Deterministic tie-break
      return `${a.c.cardId}:${a.c.posId}:${a.c.amountZar}`.localeCompare(
        `${b.c.cardId}:${b.c.posId}:${b.c.amountZar}`
      )
    })

  const best = scored[0]
  if (best.belief?.reviewState === 'open') {
    const alt = scored.find((row) => row.belief?.reviewState !== 'open')
    if (alt) {
      return finish(
        POLICY_BELIEF_THRESHOLD,
        state,
        actionFromCandidate('reroute', alt.c),
        [
          ...skipped,
          {
            issuerAcquirerPairId: best.c.issuerAcquirerPairId,
            cardId: best.c.cardId,
            posId: best.c.posId,
            reason: 'Preferred route under review',
          },
        ],
        input.evidence,
        alt.belief,
        { reroute: alt.score }
      )
    }
    return finish(POLICY_BELIEF_THRESHOLD, state, waitAction(), skipped, input.evidence, best.belief, {
      wait: best.score,
    })
  }

  let kind: PlannerAction['kind'] = 'execute'
  let amount = best.c.amountZar
  const ticket = best.belief?.largestRecentSuccessfulTicketZar
  if (ticket != null && best.c.amountZar > ticket * 1.05 && ticket >= 3000) {
    // Reduce to recently observed ticket size (genuine receivable still required by caller).
    amount = ticket
    kind = 'reduce_to'
  } else if (
    (best.belief?.maturity === 'cold' || best.belief == null) &&
    best.c.amountZar > 5000
  ) {
    amount = 5000
    kind = 'bounded_exploration'
  }

  if (best.score < 0) {
    return finish(POLICY_BELIEF_THRESHOLD, state, waitAction(), skipped, input.evidence, best.belief, {
      wait: best.score,
    })
  }

  return finish(
    POLICY_BELIEF_THRESHOLD,
    state,
    actionFromCandidate(kind, best.c, amount),
    skipped,
    input.evidence,
    best.belief,
    { [kind]: best.score }
  )
}

/**
 * Short-horizon look-ahead: compare execute vs wait vs bounded smaller ticket vs stop.
 * One-step tree; seed-free.
 */
export function decideLookahead(input: PolicyInput): DecisionRecord {
  const hardCap = input.hardExposureCapZar ?? HARD_PENDING_EXPOSURE_CAP_ZAR
  const state = assembleDecisionState({
    evidence: input.evidence,
    usableZar: input.usableZar,
    authorisedResidualZar: input.authorisedResidualZar,
    pendingExposureZar: input.pendingExposureZar,
    asOf: input.asOf,
    windowDay: input.windowDay,
  })
  const { legal, skipped } = legalCandidates(input.candidates, input.pendingExposureZar, hardCap)
  if (!legal.length || input.authorisedResidualZar <= 0) {
    return finish(POLICY_LOOKAHEAD, state, waitAction(), skipped, input.evidence, null, { wait: 0 })
  }

  type Option = { action: PlannerAction; score: number; belief: RouteBeliefSnapshot | null }
  const options: Option[] = [{ action: waitAction(), score: 0, belief: null }]

  for (const c of legal) {
    const belief = resolveRouteBelief(state.beliefs, {
      issuerId: c.issuerId,
      acquirerId: c.acquirerId,
      pairId: c.issuerAcquirerPairId,
      cardId: c.cardId,
      posId: c.posId,
    })
    const execScore = scoreCandidate(c, belief, input.pendingExposureZar, hardCap)
    options.push({ action: actionFromCandidate('execute', c), score: execScore, belief })
    if (belief?.largestRecentSuccessfulTicketZar && belief.largestRecentSuccessfulTicketZar < c.amountZar) {
      const reduced = belief.largestRecentSuccessfulTicketZar
      options.push({
        action: actionFromCandidate('reduce_to', c, reduced),
        score: scoreCandidate({ ...c, amountZar: reduced }, belief, input.pendingExposureZar, hardCap) + 50,
        belief,
      })
    }
    if (c.amountZar > 4000) {
      const explore = Math.min(4000, c.amountZar)
      options.push({
        action: actionFromCandidate('bounded_exploration', c, explore),
        score:
          scoreCandidate({ ...c, amountZar: explore }, belief, input.pendingExposureZar, hardCap) +
          (belief?.maturity === 'cold' ? 80 : 10),
        belief,
      })
    }
  }

  options.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return `${a.action.kind}:${a.action.cardId}:${a.action.amountZar}`.localeCompare(
      `${b.action.kind}:${b.action.cardId}:${b.action.amountZar}`
    )
  })
  const best = options[0]
  return finish(POLICY_LOOKAHEAD, state, best.action, skipped, input.evidence, best.belief, {
    [best.action.kind]: best.score,
  })
}

function finish(
  policy: { id: string; version: string },
  state: DecisionState,
  action: PlannerAction,
  skipped: NotAttemptedRoute[],
  evidence: RouteEvidence[],
  belief: RouteBeliefSnapshot | null,
  objective: Record<string, number>
): DecisionRecord {
  const pairBelief =
    belief ||
    beliefForPair(state.beliefs, action.issuerAcquirerPairId) ||
    state.beliefs.find((b) => b.level === 'pair') ||
    null
  return buildDecisionRecord({
    policyId: policy.id,
    policyVersion: policy.version,
    state,
    action,
    constraintTrace: [`hard_pending_cap:${HARD_PENDING_EXPOSURE_CAP_ZAR}`],
    objectiveBreakdown: objective,
    explanationFacts: factsFor(action, pairBelief, evidence),
    notAttemptedRoutes: skipped,
    createdAt: state.assembledAt,
  })
}
