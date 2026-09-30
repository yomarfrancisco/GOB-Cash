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
export const POLICY_BELIEF_THRESHOLD = { id: 'belief_threshold', version: '2' } as const
export const POLICY_LOOKAHEAD = { id: 'lookahead_mpc_short', version: '2' } as const

/** Hard concentration / pending exposure envelope (ZAR). Soft penalty approaches this. */
export const HARD_PENDING_EXPOSURE_CAP_ZAR = 40_000

export type CandidatePayment = {
  amountZar: number
  cardId: string
  posTerminalId: string
  cardIssuerBankId: string
  acquirerBankId: string
  issuerAcquirerPairId: string
  invoiceId: string | null
  economicPaymentId: string | null
  illegalReason?: string | null
}

export type PolicyInput = {
  evidence: RouteEvidence[]
  usableZar: number
  authorisedResidualZar: number
  pendingExposureZar: number
  candidates: CandidatePayment[]
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
        posTerminalId: c.posTerminalId,
        reason: c.illegalReason,
      })
      continue
    }
    if (c.amountZar <= 0) {
      skipped.push({
        issuerAcquirerPairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posTerminalId: c.posTerminalId,
        reason: 'Non-positive amount',
      })
      continue
    }
    if (pendingExposureZar + c.amountZar > hardCap) {
      skipped.push({
        issuerAcquirerPairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posTerminalId: c.posTerminalId,
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
    posTerminalId: c.posTerminalId,
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
    posTerminalId: null,
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
    posTerminalId: null,
    issuerAcquirerPairId: null,
    invoiceId: null,
    economicPaymentId: null,
    legalCheckPass: true,
  }
}

function interrupted(belief: RouteBeliefSnapshot | null): boolean {
  if (!belief) return false
  return (
    belief.reviewState === 'under_review' ||
    belief.reviewState === 'delayed' ||
    belief.reviewState === 'pending'
  )
}

function scoreCandidate(
  c: CandidatePayment,
  belief: RouteBeliefSnapshot | null,
  pendingExposureZar: number,
  hardCap: number
): number {
  // Settlement rate only — never inflate with auth acceptance as a stand-in for finality.
  const settle = belief?.finalSettlementRate ?? 0.45
  const margin = c.amountZar * 0.1
  let reviewPenalty = 0
  if (belief?.reviewState === 'under_review') reviewPenalty = 0.55
  else if (belief?.reviewState === 'delayed') reviewPenalty = 0.35
  else if (belief?.reviewState === 'pending') reviewPenalty = 0.2
  else if (belief?.reviewState === 'recovering') reviewPenalty = 0.15

  // Reversal exposure reduces expected contribution unless cause was unrelated (handled upstream).
  const reversalDrag =
    belief && belief.reversalExposure > 0
      ? Math.min(0.5, belief.reversalExposure / Math.max(belief.rollingSettledVolumeZar, belief.reversalExposure, 1))
      : 0

  const approach = pendingExposureZar / hardCap
  const softConcentration = approach > 0.7 ? (approach - 0.7) * c.amountZar * 0.05 : 0
  const ticketFit =
    belief?.largestRecentSuccessfulTicketZar != null
      ? c.amountZar <= belief.largestRecentSuccessfulTicketZar * 1.05
        ? 1
        : 0.65
      : 0.8
  return margin * settle * ticketFit * (1 - reversalDrag) - reviewPenalty * margin - softConcentration
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
  const lastCapture = [...lastEvidence].reverse().find((e) => e.kind === 'captured')
  const lastReview = [...lastEvidence].reverse().find((e) => e.kind === 'under_review')
  const lastDelay = [...lastEvidence].reverse().find((e) => e.kind === 'delayed')
  const lastReversal = [...lastEvidence].reverse().find((e) => e.kind === 'reversed')

  if (lastSettle) {
    const amt = lastSettle.settledZar ?? lastSettle.requestedZar
    facts.push({
      kind: 'observation',
      text: `The last R${amt.toLocaleString('en-ZA')} payment settled on this route.`,
      evidenceIds: [lastSettle.observationId],
    })
  } else if (lastCapture && lastAuth) {
    facts.push({
      kind: 'observation',
      text: 'Payment was captured; settlement is not yet credited as usable ZAR.',
      evidenceIds: [lastCapture.observationId],
    })
  } else if (lastAuth) {
    facts.push({
      kind: 'observation',
      text: 'Payment authorised; settlement not yet credited as usable ZAR.',
      evidenceIds: [lastAuth.observationId],
    })
  }
  if (lastDelay) {
    facts.push({
      kind: 'observation',
      text: 'Settlement on this route was delayed. That is not yet recovery.',
      evidenceIds: [lastDelay.observationId],
    })
  }
  if (lastReview) {
    facts.push({
      kind: 'observation',
      text: 'A payment on this route was placed under review.',
      evidenceIds: [lastReview.observationId],
    })
  }
  if (lastReversal) {
    facts.push({
      kind: 'observation',
      text: 'A later reversal increased finality exposure on this route.',
      evidenceIds: [lastReversal.observationId],
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
      text: 'Little eligible settled history on this card-issuer–acquirer pair; starting with a bounded genuine ticket.',
    })
  }
  if (belief) {
    facts.push({
      kind: 'observation',
      text: `Settlement maturity ${belief.settlementMaturity}; ${belief.settlementEvidenceCount} settled observations; lifecycle ${belief.reviewState}.`,
    })
  }
  return facts
}

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
 * Belief-threshold heuristic (seed-free).
 * Capture / auth alone must not unlock full ticket size.
 * Reversal exposure forces reassess unless causeClass unrelated_to_route on the reversal row.
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
        cardIssuerBankId: c.cardIssuerBankId,
        acquirerBankId: c.acquirerBankId,
        pairId: c.issuerAcquirerPairId,
        cardId: c.cardId,
        posTerminalId: c.posTerminalId,
      })
      return { c, belief, score: scoreCandidate(c, belief, input.pendingExposureZar, hardCap) }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return `${a.c.cardId}:${a.c.posTerminalId}:${a.c.amountZar}`.localeCompare(
        `${b.c.cardId}:${b.c.posTerminalId}:${b.c.amountZar}`
      )
    })

  const best = scored[0]

  if (interrupted(best.belief) && best.belief?.reviewState === 'under_review') {
    const alt = scored.find((row) => row.belief?.reviewState !== 'under_review')
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
            posTerminalId: best.c.posTerminalId,
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

  if (best.belief?.reviewState === 'delayed' || best.belief?.reviewState === 'pending') {
    // Pending/delayed: do not expand ticket; wait or keep bounded.
    if (best.belief.settlementMaturity === 'cold' || best.belief.settlementEvidenceCount < 1) {
      if (best.c.amountZar > 5000) {
        return finish(
          POLICY_BELIEF_THRESHOLD,
          state,
          actionFromCandidate('bounded_exploration', best.c, 5000),
          skipped,
          input.evidence,
          best.belief,
          { bounded_exploration: best.score }
        )
      }
      return finish(POLICY_BELIEF_THRESHOLD, state, waitAction(), skipped, input.evidence, best.belief, {
        wait: best.score,
      })
    }
  }

  // Reversal: keep historical ticket observation but reassess unless unrelated.
  const lastReversal = [...input.evidence].reverse().find((e) => e.kind === 'reversed')
  const reversalUnrelated = lastReversal?.causeClass === 'unrelated_to_route'
  if (best.belief && best.belief.reversalExposure > 0 && !reversalUnrelated) {
    const ticket = best.belief.largestRecentSuccessfulTicketZar
    if (ticket != null && best.c.amountZar > ticket * 0.7) {
      const reduced = Math.max(3000, Math.floor(ticket * 0.6))
      return finish(
        POLICY_BELIEF_THRESHOLD,
        state,
        actionFromCandidate('reduce_to', best.c, reduced),
        skipped,
        input.evidence,
        best.belief,
        { reduce_to: best.score }
      )
    }
    return finish(POLICY_BELIEF_THRESHOLD, state, waitAction(), skipped, input.evidence, best.belief, {
      wait: best.score,
    })
  }

  let kind: PlannerAction['kind'] = 'execute'
  let amount = best.c.amountZar
  const ticket = best.belief?.largestRecentSuccessfulTicketZar
  const settleMature = best.belief?.settlementMaturity
  const settleCount = best.belief?.settlementEvidenceCount ?? 0

  // Capture/auth alone → settlementMaturity stays cold → bounded or wait.
  if (settleCount < 1 || settleMature === 'cold') {
    if (best.c.amountZar > 5000) {
      amount = 5000
      kind = 'bounded_exploration'
    } else {
      return finish(POLICY_BELIEF_THRESHOLD, state, waitAction(), skipped, input.evidence, best.belief, {
        wait: best.score,
      })
    }
  } else if (ticket != null && best.c.amountZar > ticket * 1.05 && ticket >= 3000) {
    amount = ticket
    kind = 'reduce_to'
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
 * Short-horizon look-ahead that consumes belief state: pending exposure carry,
 * settlement latency penalty, review/recovery, reversal risk, wait cost, exploration.
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
  // Wait cost: small positive when pending is high or lifecycle interrupted (preserve optionality).
  const waitBonus =
    input.pendingExposureZar > hardCap * 0.6
      ? 120
      : legal.some((c) => {
          const b = resolveRouteBelief(state.beliefs, {
            cardIssuerBankId: c.cardIssuerBankId,
            acquirerBankId: c.acquirerBankId,
            pairId: c.issuerAcquirerPairId,
            cardId: c.cardId,
            posTerminalId: c.posTerminalId,
          })
          return interrupted(b) || (b != null && b.reversalExposure > 0)
        })
        ? 90
        : 0
  const options: Option[] = [{ action: waitAction(), score: waitBonus, belief: null }]

  for (const c of legal) {
    const belief = resolveRouteBelief(state.beliefs, {
      cardIssuerBankId: c.cardIssuerBankId,
      acquirerBankId: c.acquirerBankId,
      pairId: c.issuerAcquirerPairId,
      cardId: c.cardId,
      posTerminalId: c.posTerminalId,
    })
    const latencyPenalty =
      belief?.settlementLatencyMs != null
        ? Math.min(200, belief.settlementLatencyMs / (86_400_000 / 40))
        : belief?.settlementMaturity === 'cold'
          ? 60
          : 0
    const coldPenalty =
      !belief?.settlementEvidenceCount || belief.settlementMaturity === 'cold' ? 280 : 0
    const interruptPenalty = interrupted(belief) ? 200 : 0
    const reversalPenalty = belief && belief.reversalExposure > 0 ? 180 : 0
    const execScore =
      scoreCandidate(c, belief, input.pendingExposureZar, hardCap) -
      latencyPenalty -
      coldPenalty -
      interruptPenalty -
      reversalPenalty
    options.push({ action: actionFromCandidate('execute', c), score: execScore, belief })

    if (belief?.largestRecentSuccessfulTicketZar && belief.largestRecentSuccessfulTicketZar < c.amountZar) {
      const reduced = belief.largestRecentSuccessfulTicketZar
      options.push({
        action: actionFromCandidate('reduce_to', c, reduced),
        score:
          scoreCandidate({ ...c, amountZar: reduced }, belief, input.pendingExposureZar, hardCap) -
          latencyPenalty * 0.5 -
          reversalPenalty * 0.5 +
          40,
        belief,
      })
    }

    // Bounded exploration: smaller genuine ticket when settlement history is cold.
    if (c.amountZar > 4000 && (belief?.settlementMaturity === 'cold' || !belief?.settlementEvidenceCount)) {
      const explore = 5000
      options.push({
        action: actionFromCandidate('bounded_exploration', c, explore),
        score:
          scoreCandidate({ ...c, amountZar: explore }, belief, input.pendingExposureZar, hardCap) +
          120 -
          latencyPenalty * 0.3,
        belief,
      })
    }

    // Alternate route preference under review.
    if (belief?.reviewState === 'under_review') {
      options.push({
        action: waitAction(),
        score: 150,
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
