/**
 * E0 explain-only facts for Sam. Never shows probabilities, capacity, or bank balances.
 * Action source remains the production control planner — this layer explains only.
 */
import type { ExplanationFact, PlannerAction, RouteBeliefSnapshot, RouteEvidence } from './types'

export type ExplainOnlyMoment = {
  id: string
  title: string
  /** Production planner action (control) — not belief policy. */
  controlAction: Pick<PlannerAction, 'kind' | 'amountZar'>
  belief: Pick<
    RouteBeliefSnapshot,
    | 'reviewState'
    | 'settlementMaturity'
    | 'settlementEvidenceCount'
    | 'largestRecentSuccessfulTicketZar'
    | 'settlementLatencyMs'
    | 'reversalExposure'
    | 'pendingExposureZar'
  > | null
  latestKinds: RouteEvidence['kind'][]
  samLines: string[]
  facts: ExplanationFact[]
}

const BANNED =
  /bank balance|remaining capacity|capacity we.?ve observed|pSettle|Beta|SAC|DRL|hidden.?world|probability|posterior/i

export function assertExplainOnlySafe(text: string): void {
  if (BANNED.test(text)) {
    throw new Error(`Explain-only violation: ${text}`)
  }
}

export function buildExplainOnlyFacts(
  evidence: RouteEvidence[],
  belief: RouteBeliefSnapshot | null,
  newKinds: RouteEvidence['kind'][]
): ExplanationFact[] {
  const facts: ExplanationFact[] = []
  const lastSettle = [...evidence]
    .reverse()
    .find((e) => e.kind === 'zar_available' || e.kind === 'settlement_credited')
  const lastReview = [...evidence].reverse().find((e) => e.kind === 'under_review')
  const lastDelay = [...evidence].reverse().find((e) => e.kind === 'delayed')
  const lastCapture = [...evidence].reverse().find((e) => e.kind === 'captured')
  const lastRecovered = [...evidence].reverse().find((e) => e.kind === 'recovered')

  if (lastSettle) {
    const amt = lastSettle.settledZar ?? lastSettle.requestedZar
    facts.push({
      kind: 'observation',
      text: `R${amt.toLocaleString('en-ZA')} previously settled on this route.`,
      evidenceIds: [lastSettle.observationId],
    })
  }

  if (newKinds.includes('captured') && !lastSettle) {
    facts.push({
      kind: 'observation',
      text: 'Capture confirms progression. I am not treating that as settled usable ZAR.',
      evidenceIds: lastCapture ? [lastCapture.observationId] : undefined,
    })
  }

  if (belief?.reviewState === 'pending' || newKinds.includes('authorised')) {
    if (!lastSettle || belief?.reviewState === 'pending') {
      facts.push({
        kind: 'inference',
        text: 'The next payment is still pending, so I’m not treating prior progress as additional settled evidence.',
      })
    }
  }

  if (lastDelay || belief?.reviewState === 'delayed') {
    facts.push({
      kind: 'observation',
      text: 'Settlement was delayed. That is not recovery.',
      evidenceIds: lastDelay ? [lastDelay.observationId] : undefined,
    })
  }

  if (lastReview || belief?.reviewState === 'under_review') {
    facts.push({
      kind: 'observation',
      text: 'This payment is under review. I’ve recorded the interruption, but there is not yet evidence that the route has recovered.',
      evidenceIds: lastReview ? [lastReview.observationId] : undefined,
    })
  }

  if (
    belief?.reviewState === 'recovered' ||
    belief?.reviewState === 'recovering' ||
    (lastRecovered && lastSettle)
  ) {
    facts.push({
      kind: 'inference',
      text: 'A later payment settled successfully. That reopens the route for assessment; it does not erase the earlier review.',
    })
  }

  if (belief?.settlementLatencyMs != null && lastSettle) {
    const hours = Math.round(belief.settlementLatencyMs / 3_600_000)
    facts.push({
      kind: 'observation',
      text: `Recent settlement timing on this route was about ${hours} hours after the payment event.`,
    })
  }

  if (belief) {
    facts.push({
      kind: 'observation',
      text: `Settlement evidence maturity is ${belief.settlementMaturity} (${belief.settlementEvidenceCount} settled observations).`,
    })
  }

  for (const f of facts) assertExplainOnlySafe(f.text)
  return facts
}

export function samLinesFromFacts(facts: ExplanationFact[]): string[] {
  return facts.filter((f) => f.kind === 'observation' || f.kind === 'inference').map((f) => f.text)
}

/** Static E0 moments for the protected preview (control action + explain-only Sam). */
export function e0DemoMoments(): ExplainOnlyMoment[] {
  const moments: ExplainOnlyMoment[] = [
    {
      id: 'pending_after_auth',
      title: 'After authorisation (pending)',
      controlAction: { kind: 'execute', amountZar: 8000 },
      belief: {
        reviewState: 'pending',
        settlementMaturity: 'cold',
        settlementEvidenceCount: 0,
        largestRecentSuccessfulTicketZar: null,
        settlementLatencyMs: null,
        reversalExposure: 0,
        pendingExposureZar: 8000,
      },
      latestKinds: ['authorised'],
      samLines: [
        'Payment authorised; settlement not yet credited as usable ZAR.',
        'The next payment is still pending, so I’m not treating that result as additional settled evidence.',
      ],
      facts: [],
    },
    {
      id: 'after_capture',
      title: 'After capture (still not settled)',
      controlAction: { kind: 'execute', amountZar: 8000 },
      belief: {
        reviewState: 'pending',
        settlementMaturity: 'cold',
        settlementEvidenceCount: 0,
        largestRecentSuccessfulTicketZar: null,
        settlementLatencyMs: null,
        reversalExposure: 0,
        pendingExposureZar: 8000,
      },
      latestKinds: ['captured'],
      samLines: [
        'Capture confirms progression. I am not treating that as settled usable ZAR.',
        'The next payment is still pending, so I’m not treating that result as additional settled evidence.',
      ],
      facts: [],
    },
    {
      id: 'after_settle',
      title: 'After usable ZAR',
      controlAction: { kind: 'execute', amountZar: 8000 },
      belief: {
        reviewState: 'clear',
        settlementMaturity: 'thin',
        settlementEvidenceCount: 1,
        largestRecentSuccessfulTicketZar: 8000,
        settlementLatencyMs: 86_400_000,
        reversalExposure: 0,
        pendingExposureZar: 0,
      },
      latestKinds: ['zar_available'],
      samLines: [
        'R8,000 previously settled on this route.',
        'Recent settlement timing on this route was about 24 hours after the payment event.',
        'Settlement evidence maturity is thin (1 settled observations).',
      ],
      facts: [],
    },
    {
      id: 'under_review',
      title: 'Under review',
      controlAction: { kind: 'execute', amountZar: 8000 },
      belief: {
        reviewState: 'under_review',
        settlementMaturity: 'thin',
        settlementEvidenceCount: 1,
        largestRecentSuccessfulTicketZar: 8000,
        settlementLatencyMs: 86_400_000,
        reversalExposure: 0,
        pendingExposureZar: 8000,
      },
      latestKinds: ['under_review'],
      samLines: [
        'R8,000 previously settled on this route.',
        'This payment is under review. I’ve recorded the interruption, but there is not yet evidence that the route has recovered.',
      ],
      facts: [],
    },
    {
      id: 'after_recovery',
      title: 'After recovery + later settle',
      controlAction: { kind: 'execute', amountZar: 8000 },
      belief: {
        reviewState: 'recovered',
        settlementMaturity: 'thin',
        settlementEvidenceCount: 2,
        largestRecentSuccessfulTicketZar: 8000,
        settlementLatencyMs: 57_600_000,
        reversalExposure: 0,
        pendingExposureZar: 0,
      },
      latestKinds: ['recovered', 'zar_available'],
      samLines: [
        'R8,000 previously settled on this route.',
        'A later payment settled successfully. That reopens the route for assessment; it does not erase the earlier review.',
      ],
      facts: [],
    },
  ]
  for (const m of moments) {
    for (const line of m.samLines) assertExplainOnlySafe(line)
  }
  return moments
}
