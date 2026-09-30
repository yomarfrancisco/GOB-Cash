import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRouteEvidence } from './evidence'
import { decideBeliefThreshold, decideControl, decideLookahead, type CandidatePayment } from './policies'
import type { NewRouteEvidenceInput, PlannerAction, RouteEvidence } from './types'

/**
 * Multi-step paired evaluation with pending exposure carry, latency, review/recovery,
 * alternate route, reversal risk, wait cost, and bounded exploration.
 * Reports where each policy does better/worse — no superiority claim for live promotion.
 */

function ev(
  partial: Partial<NewRouteEvidenceInput> &
    Pick<NewRouteEvidenceInput, 'kind' | 'eventAt' | 'economicPaymentId' | 'requestedZar'>
): RouteEvidence {
  return buildRouteEvidence({
    source: 'simulation',
    provenance: 'simulation',
    trustClass: 'simulation',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    merchantPrincipalId: 'lemon_economics',
    invoiceIssuerEntityId: 'lemon_economics',
    mozambiqueBuyerId: 'multivendas',
    cardId: 'card-2',
    cardIssuerBankId: 'bci',
    posTerminalId: 'machine-1',
    acquirerBankId: 'fnb',
    invoiceId: `inv-${partial.economicPaymentId}`,
    testRunId: 'multi',
    cycleNumber: 1,
    settledZar: null,
    settledAt: null,
    linkedObservationId: null,
    operatorUid: null,
    evidenceRef: null,
    notes: [],
    ...partial,
  })
}

type PolicyId = 'control' | 'threshold' | 'lookahead'

type StepOutcome = {
  policy: PolicyId
  action: string
  amountZar: number | null
  pendingAfter: number
  realisedContribution: number
  delayed: boolean
  failed: boolean
  explored: boolean
}

function candidates(alt = false): CandidatePayment[] {
  const primary: CandidatePayment = {
    amountZar: 8000,
    cardId: 'card-2',
    posTerminalId: 'machine-1',
    cardIssuerBankId: 'bci',
    acquirerBankId: 'fnb',
    issuerAcquirerPairId: 'bci__fnb',
    invoiceId: 'inv-primary',
    economicPaymentId: 'pay-primary',
  }
  if (!alt) return [primary]
  return [
    primary,
    {
      amountZar: 5000,
      cardId: 'card-9',
      posTerminalId: 'machine-4',
      cardIssuerBankId: 'standard_bank_mozambique',
      acquirerBankId: 'capitec',
      issuerAcquirerPairId: 'standard_bank_mozambique__capitec',
      invoiceId: 'inv-alt',
      economicPaymentId: 'pay-alt',
    },
  ]
}

function decide(policy: PolicyId, evidence: RouteEvidence[], pending: number, asOf: string, withAlt: boolean) {
  const controlAction: PlannerAction = {
    kind: 'execute',
    amountZar: 8000,
    cardId: 'card-2',
    posTerminalId: 'machine-1',
    issuerAcquirerPairId: 'bci__fnb',
    invoiceId: 'inv-primary',
    economicPaymentId: 'pay-primary',
    legalCheckPass: true,
  }
  const input = {
    evidence,
    usableZar: 50_000,
    authorisedResidualZar: 24_000,
    pendingExposureZar: pending,
    asOf,
    candidates: candidates(withAlt),
    controlAction,
    hardExposureCapZar: 40_000,
  }
  if (policy === 'control') return decideControl(input)
  if (policy === 'threshold') return decideBeliefThreshold(input)
  return decideLookahead(input)
}

/**
 * Exogenous world: settle after latency unless under review; reversals on large tickets mid-horizon.
 */
function simulateWorld(
  action: PlannerAction,
  step: number,
  pending: number
): {
  pendingAfter: number
  contribution: number
  delayed: boolean
  failed: boolean
  explored: boolean
  newEvidence: RouteEvidence[]
} {
  if (action.kind === 'wait' || action.amountZar == null) {
    return {
      pendingAfter: Math.max(0, pending - 2000),
      contribution: 0,
      delayed: false,
      failed: false,
      explored: false,
      newEvidence: [],
    }
  }
  const amt = action.amountZar
  const explored = action.kind === 'bounded_exploration'
  const payId = `sim-${step}-${action.kind}-${amt}`
  const t0 = `2026-09-${String(10 + step).padStart(2, '0')}T09:00:00.000Z`
  // Force a review interruption on step 2 for large executes.
  if (step === 2 && amt >= 8000 && action.kind === 'execute') {
    return {
      pendingAfter: pending + amt,
      contribution: 0,
      delayed: false,
      failed: true,
      explored,
      newEvidence: [
        ev({ kind: 'authorised', eventAt: t0, economicPaymentId: payId, requestedZar: amt }),
        ev({
          kind: 'under_review',
          eventAt: `2026-09-${String(10 + step).padStart(2, '0')}T12:00:00.000Z`,
          economicPaymentId: payId,
          requestedZar: amt,
        }),
      ],
    }
  }
  // Delayed settlement for step 1 large tickets.
  if (step === 1 && amt >= 8000) {
    const settleAt = `2026-09-${String(12 + step).padStart(2, '0')}T09:00:00.000Z`
    return {
      pendingAfter: pending,
      contribution: amt * 0.85,
      delayed: true,
      failed: false,
      explored,
      newEvidence: [
        ev({ kind: 'authorised', eventAt: t0, economicPaymentId: payId, requestedZar: amt }),
        ev({
          kind: 'delayed',
          eventAt: `2026-09-${String(10 + step).padStart(2, '0')}T18:00:00.000Z`,
          economicPaymentId: payId,
          requestedZar: amt,
        }),
        ev({
          kind: 'zar_available',
          eventAt: t0,
          economicPaymentId: payId,
          requestedZar: amt,
          settledZar: amt,
          settledAt: settleAt,
        }),
      ],
    }
  }
  // Reversal risk on step 4 after success.
  if (step === 4 && amt >= 7000) {
    const settleAt = `2026-09-${String(10 + step).padStart(2, '0')}T17:00:00.000Z`
    return {
      pendingAfter: Math.max(0, pending),
      contribution: amt * 0.4,
      delayed: false,
      failed: false,
      explored,
      newEvidence: [
        ev({ kind: 'authorised', eventAt: t0, economicPaymentId: payId, requestedZar: amt }),
        ev({
          kind: 'zar_available',
          eventAt: t0,
          economicPaymentId: payId,
          requestedZar: amt,
          settledZar: amt,
          settledAt: settleAt,
        }),
        ev({
          kind: 'reversed',
          eventAt: `2026-09-${String(11 + step).padStart(2, '0')}T09:00:00.000Z`,
          economicPaymentId: payId,
          requestedZar: amt,
          settledZar: amt,
          causeClass: 'issuer_control_or_liquidity',
        }),
      ],
    }
  }
  const settleAt = `2026-09-${String(10 + step).padStart(2, '0')}T17:00:00.000Z`
  return {
    pendingAfter: Math.max(0, pending),
    contribution: amt,
    delayed: false,
    failed: false,
    explored,
    newEvidence: [
      ev({ kind: 'authorised', eventAt: t0, economicPaymentId: payId, requestedZar: amt }),
      ev({
        kind: 'zar_available',
        eventAt: t0,
        economicPaymentId: payId,
        requestedZar: amt,
        settledZar: amt,
        settledAt: settleAt,
      }),
    ],
  }
}

function runHorizon(policy: PolicyId, withAlt: boolean, steps = 5) {
  let evidence: RouteEvidence[] = []
  let pending = 0
  const outcomes: StepOutcome[] = []
  let contribution = 0
  let delays = 0
  let failures = 0
  let explorations = 0

  for (let step = 0; step < steps; step++) {
    const asOf = `2026-09-${String(10 + step).padStart(2, '0')}T08:00:00.000Z`
    const rec = decide(policy, evidence, pending, asOf, withAlt)
    const world = simulateWorld(rec.action, step, pending)
    evidence = [...evidence, ...world.newEvidence]
    pending = world.pendingAfter
    contribution += world.contribution
    if (world.delayed) delays += 1
    if (world.failed) failures += 1
    if (world.explored) explorations += 1
    outcomes.push({
      policy,
      action: rec.action.kind,
      amountZar: rec.action.amountZar,
      pendingAfter: pending,
      realisedContribution: world.contribution,
      delayed: world.delayed,
      failed: world.failed,
      explored: world.explored,
    })
  }

  return {
    policy,
    withAlt,
    contribution,
    delays,
    failures,
    explorations,
    finalPending: pending,
    outcomes,
  }
}

describe('multi-step paired policy evaluation', () => {
  it('reports comparative horizons without claiming live superiority', () => {
    const results = [
      runHorizon('control', true),
      runHorizon('threshold', true),
      runHorizon('lookahead', true),
      runHorizon('control', false),
      runHorizon('threshold', false),
      runHorizon('lookahead', false),
    ]

    console.log('\n=== Multi-step paired evaluation (exogenous world shared by construction) ===')
    for (const r of results) {
      console.log(
        JSON.stringify({
          policy: r.policy,
          alternateRouteAvailable: r.withAlt,
          realisedContribution: r.contribution,
          delays: r.delays,
          failures: r.failures,
          boundedExplorations: r.explorations,
          finalPendingExposure: r.finalPending,
          actions: r.outcomes.map((o) => `${o.action}:${o.amountZar}`),
        })
      )
    }

    const withAlt = results.filter((r) => r.withAlt)
    const best = [...withAlt].sort((a, b) => b.contribution - a.contribution)[0]
    const worst = [...withAlt].sort((a, b) => a.contribution - b.contribution)[0]
    console.log(
      JSON.stringify({
        note: 'No live promotion. Comparative only under this synthetic exogenous path.',
        betterOnContribution: best.policy,
        worseOnContribution: worst.policy,
        betterContribution: best.contribution,
        worseContribution: worst.contribution,
      })
    )

    // Sanity: threshold should not always mirror control on cold start step 0.
    assert.ok(results.some((r) => r.policy === 'threshold' && r.outcomes[0].action !== 'execute' || r.outcomes[0].amountZar !== 8000))
  })
})
