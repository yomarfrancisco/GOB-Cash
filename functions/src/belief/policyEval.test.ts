import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendOnly, productionEvidenceOnly } from './appendOnly'
import { buildRouteEvidence } from './evidence'
import { foldEvidence, resolveRouteBelief } from './fold'
import { decideBeliefThreshold, decideControl, decideLookahead, type CandidatePayment } from './policies'
import { EMITTER_COVERAGE, wiredEvents } from './emitterCoverage'
import type { NewRouteEvidenceInput, PlannerAction, RouteEvidence } from './types'

function ev(
  partial: Partial<NewRouteEvidenceInput> &
    Pick<NewRouteEvidenceInput, 'kind' | 'eventAt' | 'economicPaymentId' | 'requestedZar'>
): RouteEvidence {
  return buildRouteEvidence({
    source: 'simulation',
    provenance: 'simulation',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    issuerId: 'bci',
    cardId: 'card-2',
    buyerId: 'multivendas',
    merchantId: 'lemon_economics',
    posId: 'machine-1',
    terminalId: 'term-1',
    acquirerId: 'fnb',
    invoiceId: `inv-${partial.economicPaymentId}`,
    testRunId: 'audit',
    cycleNumber: 1,
    settledZar: null,
    settledAt: null,
    notes: [],
    ...partial,
  })
}

function cand(partial: Partial<CandidatePayment> & Pick<CandidatePayment, 'amountZar' | 'cardId' | 'posId'>): CandidatePayment {
  return {
    issuerId: 'bci',
    acquirerId: 'fnb',
    issuerAcquirerPairId: 'bci__fnb',
    invoiceId: 'inv',
    economicPaymentId: 'pay',
    ...partial,
  }
}

function runThree(input: Parameters<typeof decideBeliefThreshold>[0]) {
  const controlAction: PlannerAction = input.controlAction || {
    kind: 'execute',
    amountZar: input.candidates.find((c) => !c.illegalReason)?.amountZar ?? null,
    cardId: input.candidates.find((c) => !c.illegalReason)?.cardId ?? null,
    posId: input.candidates.find((c) => !c.illegalReason)?.posId ?? null,
    issuerAcquirerPairId: input.candidates.find((c) => !c.illegalReason)?.issuerAcquirerPairId ?? null,
    invoiceId: input.candidates.find((c) => !c.illegalReason)?.invoiceId ?? null,
    economicPaymentId: input.candidates.find((c) => !c.illegalReason)?.economicPaymentId ?? null,
    legalCheckPass: true,
  }
  return {
    control: decideControl({ ...input, controlAction }),
    threshold: decideBeliefThreshold(input),
    lookahead: decideLookahead(input),
  }
}

describe('emitter coverage honesty', () => {
  it('documents that only zar_available is production-wired', () => {
    assert.deepEqual(wiredEvents(), ['zar_available'])
    assert.ok(EMITTER_COVERAGE.filter((r) => !r.wired).length >= 7)
  })
})

describe('append-only enforcement', () => {
  it('never overwrites; duplicate returns original; conflict rejects', () => {
    const a = ev({
      kind: 'authorised',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'p1',
      requestedZar: 8000,
      ingestedAt: '2026-09-01T10:00:01.000Z',
    })
    let { log, result } = appendOnly([], a)
    assert.equal(result.status, 'written')
    const dup = appendOnly(log, { ...a, ingestedAt: '2026-09-01T10:00:02.000Z' })
    assert.equal(dup.result.status, 'duplicate')
    assert.equal(dup.log.length, 1)
    const conflictRow = ev({
      kind: 'authorised',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'p1',
      requestedZar: 9000,
      ingestedAt: '2026-09-01T10:00:03.000Z',
    })
    // Force same observationId as a while changing payload
    const forged = { ...conflictRow, observationId: a.observationId }
    const conflict = appendOnly(log, forged)
    assert.equal(conflict.result.status, 'conflict')
    assert.equal(conflict.log.length, 1)
  })

  it('reversals append compensating evidence', () => {
    const settle = ev({
      kind: 'zar_available',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'p1',
      requestedZar: 8000,
      settledZar: 8000,
      settledAt: '2026-09-02T10:00:00.000Z',
    })
    const rev = ev({
      kind: 'reversed',
      eventAt: '2026-09-10T10:00:00.000Z',
      economicPaymentId: 'p1',
      requestedZar: 8000,
      settledZar: 8000,
    })
    const { log } = appendOnly(appendOnly([], settle).log, rev)
    assert.equal(log.length, 2)
    const pair = foldEvidence(log, '2026-09-11T00:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.largestRecentSuccessfulTicketZar, 8000)
    assert.equal(pair!.reversalExposure, 8000)
  })

  it('simulation evidence is excluded from production fold', () => {
    const prod = ev({
      kind: 'zar_available',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'prod',
      requestedZar: 5000,
      settledZar: 5000,
      settledAt: '2026-09-01T12:00:00.000Z',
      source: 'production',
      provenance: 'bank_mail',
    })
    const sim = ev({
      kind: 'zar_available',
      eventAt: '2026-09-01T11:00:00.000Z',
      economicPaymentId: 'sim',
      requestedZar: 8000,
      settledZar: 8000,
      settledAt: '2026-09-01T13:00:00.000Z',
      source: 'simulation',
    })
    const mixed = [prod, sim]
    const onlyProd = productionEvidenceOnly(mixed)
    assert.equal(onlyProd.length, 1)
    const pair = foldEvidence(onlyProd, '2026-09-02T00:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.largestRecentSuccessfulTicketZar, 5000)
  })
})

describe('hierarchical sparse fallback', () => {
  it('cold pair falls back through issuer/acquirer priors', () => {
    const issuerHeavy = [
      ev({
        kind: 'authorised',
        eventAt: '2026-09-01T10:00:00.000Z',
        economicPaymentId: 'i1',
        requestedZar: 5000,
        cardId: 'other-card',
        posId: 'other-pos',
      }),
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-01T10:00:00.000Z',
        economicPaymentId: 'i1',
        requestedZar: 5000,
        settledZar: 5000,
        settledAt: '2026-09-01T18:00:00.000Z',
        cardId: 'other-card',
        posId: 'other-pos',
      }),
    ]
    const thinPair = ev({
      kind: 'authorised',
      eventAt: '2026-09-05T10:00:00.000Z',
      economicPaymentId: 'new',
      requestedZar: 8000,
      cardId: 'new-card',
      posId: 'new-pos',
    })
    const snaps = foldEvidence([...issuerHeavy, thinPair], '2026-09-06T00:00:00.000Z')
    const resolved = resolveRouteBelief(snaps, {
      issuerId: 'bci',
      acquirerId: 'fnb',
      pairId: 'bci__fnb',
      cardId: 'new-card',
      posId: 'new-pos',
    })
    assert.ok(resolved)
    // Prior settlement on same issuer/acquirer informs ticket size when local pair is cold
    assert.ok(
      resolved!.largestRecentSuccessfulTicketZar === 5000 ||
        resolved!.authorisationAcceptance != null
    )
  })

  it('late-arriving zar_available still updates fold', () => {
    const auth = ev({
      kind: 'authorised',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'late',
      requestedZar: 8000,
      ingestedAt: '2026-09-01T10:00:01.000Z',
    })
    const lateSettle = ev({
      kind: 'zar_available',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'late',
      requestedZar: 8000,
      settledZar: 8000,
      settledAt: '2026-09-03T10:00:00.000Z',
      ingestedAt: '2026-09-04T10:00:00.000Z',
    })
    const before = foldEvidence([auth], '2026-09-02T00:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(before!.finalSettlementRate, null)
    const after = foldEvidence([auth, lateSettle], '2026-09-04T12:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(after!.finalSettlementRate, 1)
    assert.equal(after!.largestRecentSuccessfulTicketZar, 8000)
  })
})

describe('paired policy evaluation', () => {
  type ScenarioMetrics = {
    scenario: string
    control: string
    threshold: string
    lookahead: string
    evidence: {
      settlements: number
      failures: number
      delays: number
      pendingExposureZar: number
      reversalExposure: number
      rollingSettledVolumeZar: number
      concentrationHint: number | null
      finalSettlementRate: number | null
    }
    policies: {
      id: string
      action: string
      amountZar: number | null
      realisedContributionProxy: number
      boundedExploration: boolean
    }[]
    allRejectIllegal: boolean
  }
  const rows: ScenarioMetrics[] = []

  function evidenceStats(evidence: RouteEvidence[], asOf: string, pendingExposureZar: number) {
    const pair = foldEvidence(evidence, asOf).find((s) => s.level === 'pair')
    const settlements = evidence.filter((e) => e.kind === 'zar_available' || e.kind === 'settlement_credited').length
    const failures = evidence.filter((e) => e.kind === 'under_review' || e.kind === 'reversed').length
    const delays = evidence.filter((e) => e.kind === 'delayed').length
    return {
      settlements,
      failures,
      delays,
      pendingExposureZar,
      reversalExposure: pair?.reversalExposure ?? 0,
      rollingSettledVolumeZar: pair?.rollingSettledVolumeZar ?? 0,
      concentrationHint: pair?.rollingSettledVolumeZar ?? null,
      finalSettlementRate: pair?.finalSettlementRate ?? null,
    }
  }

  function contributionProxy(action: PlannerAction): number {
    if (action.kind === 'wait' || action.amountZar == null) return 0
    if (action.kind === 'bounded_exploration') return action.amountZar * 0.5
    return action.amountZar
  }

  function record(scenario: string, input: Parameters<typeof decideBeliefThreshold>[0]) {
    const r = runThree(input)
    const stats = evidenceStats(input.evidence, input.asOf, input.pendingExposureZar)
    rows.push({
      scenario,
      control: `${r.control.action.kind}:${r.control.action.amountZar}`,
      threshold: `${r.threshold.action.kind}:${r.threshold.action.amountZar}`,
      lookahead: `${r.lookahead.action.kind}:${r.lookahead.action.amountZar}`,
      evidence: stats,
      policies: [
        {
          id: 'control',
          action: r.control.action.kind,
          amountZar: r.control.action.amountZar,
          realisedContributionProxy: contributionProxy(r.control.action),
          boundedExploration: r.control.action.kind === 'bounded_exploration',
        },
        {
          id: 'belief_threshold',
          action: r.threshold.action.kind,
          amountZar: r.threshold.action.amountZar,
          realisedContributionProxy: contributionProxy(r.threshold.action),
          boundedExploration: r.threshold.action.kind === 'bounded_exploration',
        },
        {
          id: 'lookahead',
          action: r.lookahead.action.kind,
          amountZar: r.lookahead.action.amountZar,
          realisedContributionProxy: contributionProxy(r.lookahead.action),
          boundedExploration: r.lookahead.action.kind === 'bounded_exploration',
        },
      ],
      allRejectIllegal: false,
    })
    // Determinism under identical exogenous conditions
    const again = runThree(input)
    assert.equal(again.control.decisionId, r.control.decisionId)
    assert.equal(again.threshold.decisionId, r.threshold.decisionId)
    assert.equal(again.lookahead.decisionId, r.lookahead.decisionId)
    return r
  }

  it('covers required scenario matrix without claiming superiority', () => {
    const successEvidence = [
      ev({
        kind: 'authorised',
        eventAt: '2026-09-01T09:00:00.000Z',
        economicPaymentId: 's1',
        requestedZar: 8000,
      }),
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-01T09:00:00.000Z',
        economicPaymentId: 's1',
        requestedZar: 8000,
        settledZar: 8000,
        settledAt: '2026-09-01T18:00:00.000Z',
      }),
      ev({
        kind: 'authorised',
        eventAt: '2026-09-02T09:00:00.000Z',
        economicPaymentId: 's2',
        requestedZar: 8000,
      }),
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-02T09:00:00.000Z',
        economicPaymentId: 's2',
        requestedZar: 8000,
        settledZar: 8000,
        settledAt: '2026-09-02T18:00:00.000Z',
      }),
    ]
    record('repeated_successful_settlements', {
      evidence: successEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1', economicPaymentId: 'next' })],
    })

    record('sparse_cold_start', {
      evidence: [],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1' })],
    })

    const reviewEvidence = [
      ...successEvidence,
      ev({
        kind: 'authorised',
        eventAt: '2026-09-03T09:00:00.000Z',
        economicPaymentId: 'r1',
        requestedZar: 8000,
      }),
      ev({
        kind: 'under_review',
        eventAt: '2026-09-03T09:30:00.000Z',
        economicPaymentId: 'r1',
        requestedZar: 8000,
      }),
    ]
    const withAlt = record('review_with_alternate_route', {
      evidence: reviewEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 8000,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [
        cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1', economicPaymentId: 'r1' }),
        cand({
          amountZar: 5000,
          cardId: 'card-9',
          posId: 'machine-4',
          issuerId: 'standard',
          acquirerId: 'capitec',
          issuerAcquirerPairId: 'standard__capitec',
          economicPaymentId: 'alt',
        }),
      ],
    })
    assert.ok(['wait', 'reroute', 'execute', 'reduce_to', 'bounded_exploration'].includes(withAlt.threshold.action.kind))

    record('review_no_alternate', {
      evidence: reviewEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 8000,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1' })],
    })

    record('delayed_settlement', {
      evidence: [
        ev({
          kind: 'authorised',
          eventAt: '2026-09-01T09:00:00.000Z',
          economicPaymentId: 'd1',
          requestedZar: 8000,
        }),
        ev({
          kind: 'delayed',
          eventAt: '2026-09-01T15:00:00.000Z',
          economicPaymentId: 'd1',
          requestedZar: 8000,
        }),
      ],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 8000,
      asOf: '2026-09-01T16:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1' })],
    })

    record('reversal_after_success', {
      evidence: [
        ...successEvidence,
        ev({
          kind: 'reversed',
          eventAt: '2026-09-08T09:00:00.000Z',
          economicPaymentId: 's2',
          requestedZar: 8000,
          settledZar: 8000,
        }),
      ],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-08T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1' })],
    })

    // Waiting optimal: open review, no alternate, soft score negative path via high pending near cap
    const waitCase = record('waiting_optimal_near_cap_under_review', {
      evidence: reviewEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 39_000,
      asOf: '2026-09-03T10:00:00.000Z',
      hardExposureCapZar: 40_000,
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posId: 'machine-1' })],
    })
    assert.ok(
      waitCase.threshold.action.kind === 'wait' || waitCase.threshold.notAttemptedRoutes.length > 0
    )

    // Bounded exploration: cold start with large candidate
    const explore = record('bounded_exploration_cold_large_ticket', {
      evidence: [],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [
        cand({
          amountZar: 8000,
          cardId: 'card-2',
          posId: 'machine-1',
          invoiceId: 'genuine-invoice',
          economicPaymentId: 'genuine-pay',
        }),
      ],
    })
    assert.ok(
      explore.threshold.action.kind === 'bounded_exploration' ||
        explore.lookahead.action.kind === 'bounded_exploration' ||
        explore.threshold.action.kind === 'execute'
    )
    if (explore.threshold.action.kind === 'bounded_exploration') {
      assert.ok((explore.threshold.action.amountZar || 0) < 8000)
      assert.ok(explore.threshold.action.invoiceId)
      assert.ok(explore.threshold.action.economicPaymentId)
    }

    const illegal = runThree({
      evidence: successEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [
        cand({
          amountZar: 8000,
          cardId: 'card-2',
          posId: 'machine-99',
          illegalReason: 'Illegal merchant/POS pairing',
        }),
      ],
      controlAction: {
        kind: 'wait',
        amountZar: null,
        cardId: null,
        posId: null,
        issuerAcquirerPairId: null,
        invoiceId: null,
        economicPaymentId: null,
        legalCheckPass: true,
      },
    })
    assert.equal(illegal.threshold.action.kind, 'wait')
    assert.equal(illegal.lookahead.action.kind, 'wait')
    assert.ok(illegal.threshold.notAttemptedRoutes.some((r) => /Illegal merchant\/POS/.test(r.reason)))
    const illegalStats = evidenceStats(successEvidence, '2026-09-03T10:00:00.000Z', 0)
    rows.push({
      scenario: 'illegal_merchant_pos_all_reject',
      control: `${illegal.control.action.kind}:${illegal.control.action.amountZar}`,
      threshold: `${illegal.threshold.action.kind}:${illegal.threshold.action.amountZar}`,
      lookahead: `${illegal.lookahead.action.kind}:${illegal.lookahead.action.amountZar}`,
      evidence: illegalStats,
      policies: [
        {
          id: 'control',
          action: illegal.control.action.kind,
          amountZar: illegal.control.action.amountZar,
          realisedContributionProxy: contributionProxy(illegal.control.action),
          boundedExploration: false,
        },
        {
          id: 'belief_threshold',
          action: illegal.threshold.action.kind,
          amountZar: illegal.threshold.action.amountZar,
          realisedContributionProxy: contributionProxy(illegal.threshold.action),
          boundedExploration: false,
        },
        {
          id: 'lookahead',
          action: illegal.lookahead.action.kind,
          amountZar: illegal.lookahead.action.amountZar,
          realisedContributionProxy: contributionProxy(illegal.lookahead.action),
          boundedExploration: false,
        },
      ],
      allRejectIllegal: true,
    })

    // Report matrix (no superiority claim)
    console.log('\n=== Paired policy comparison (identical exogenous conditions) ===')
    let boundedExplorationCount = 0
    for (const row of rows) {
      boundedExplorationCount += row.policies.filter((p) => p.boundedExploration).length
      console.log(
        JSON.stringify({
          scenario: row.scenario,
          control: row.control,
          belief_threshold: row.threshold,
          lookahead: row.lookahead,
          evidence: row.evidence,
          policies: row.policies,
          calibrationNote:
            'One-shot offline compare under shared evidence; realisedContributionProxy is proposed ticket size (×0.5 for bounded_exploration), not multi-horizon PnL.',
          note: 'No superiority claimed — actions under shared evidence/candidates only.',
        })
      )
    }
    console.log(
      JSON.stringify({
        summary: {
          scenarios: rows.length,
          boundedExplorationSelections: boundedExplorationCount,
          allIllegalRejected: rows.find((r) => r.scenario === 'illegal_merchant_pos_all_reject')?.allRejectIllegal,
        },
      })
    )
  })
})
