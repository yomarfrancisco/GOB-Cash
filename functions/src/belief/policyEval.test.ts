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
    testRunId: 'audit',
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

function cand(
  partial: Partial<CandidatePayment> & Pick<CandidatePayment, 'amountZar' | 'cardId' | 'posTerminalId'>
): CandidatePayment {
  return {
    cardIssuerBankId: 'bci',
    acquirerBankId: 'fnb',
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
    posTerminalId: input.candidates.find((c) => !c.illegalReason)?.posTerminalId ?? null,
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
      trustClass: 'verified_bank',
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
    const onlyProd = productionEvidenceOnly([prod, sim])
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
        posTerminalId: 'other-pos',
      }),
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-01T10:00:00.000Z',
        economicPaymentId: 'i1',
        requestedZar: 5000,
        settledZar: 5000,
        settledAt: '2026-09-01T18:00:00.000Z',
        cardId: 'other-card',
        posTerminalId: 'other-pos',
      }),
    ]
    const thinPair = ev({
      kind: 'authorised',
      eventAt: '2026-09-05T10:00:00.000Z',
      economicPaymentId: 'new',
      requestedZar: 8000,
      cardId: 'new-card',
      posTerminalId: 'new-pos',
    })
    const snaps = foldEvidence([...issuerHeavy, thinPair], '2026-09-06T00:00:00.000Z')
    const resolved = resolveRouteBelief(snaps, {
      cardIssuerBankId: 'bci',
      acquirerBankId: 'fnb',
      pairId: 'bci__fnb',
      cardId: 'new-card',
      posTerminalId: 'new-pos',
    })
    assert.ok(resolved)
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

    const rows: Array<Record<string, unknown>> = []
    function record(scenario: string, input: Parameters<typeof decideBeliefThreshold>[0]) {
      const r = runThree(input)
      rows.push({
        scenario,
        control: `${r.control.action.kind}:${r.control.action.amountZar}`,
        belief_threshold: `${r.threshold.action.kind}:${r.threshold.action.amountZar}`,
        lookahead: `${r.lookahead.action.kind}:${r.lookahead.action.amountZar}`,
      })
      const again = runThree(input)
      assert.equal(again.control.decisionId, r.control.decisionId)
      assert.equal(again.threshold.decisionId, r.threshold.decisionId)
      assert.equal(again.lookahead.decisionId, r.lookahead.decisionId)
      return r
    }

    record('repeated_successful_settlements', {
      evidence: successEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1', economicPaymentId: 'next' })],
    })

    record('sparse_cold_start', {
      evidence: [],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1' })],
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
    record('review_with_alternate_route', {
      evidence: reviewEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 8000,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [
        cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1', economicPaymentId: 'r1' }),
        cand({
          amountZar: 5000,
          cardId: 'card-9',
          posTerminalId: 'machine-4',
          cardIssuerBankId: 'standard_bank_mozambique',
          acquirerBankId: 'capitec',
          issuerAcquirerPairId: 'standard_bank_mozambique__capitec',
          economicPaymentId: 'alt',
        }),
      ],
    })

    record('review_no_alternate', {
      evidence: reviewEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 8000,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1' })],
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
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1' })],
    })

    const rev = record('reversal_after_success', {
      evidence: [
        ...successEvidence,
        ev({
          kind: 'reversed',
          eventAt: '2026-09-08T09:00:00.000Z',
          economicPaymentId: 's2',
          requestedZar: 8000,
          settledZar: 8000,
          causeClass: 'issuer_control_or_liquidity',
        }),
      ],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-08T10:00:00.000Z',
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1' })],
    })
    assert.notEqual(
      rev.threshold.action.kind === 'execute' && rev.threshold.action.amountZar === 8000,
      true
    )

    record('waiting_optimal_near_cap_under_review', {
      evidence: reviewEvidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 39_000,
      asOf: '2026-09-03T10:00:00.000Z',
      hardExposureCapZar: 40_000,
      candidates: [cand({ amountZar: 8000, cardId: 'card-2', posTerminalId: 'machine-1' })],
    })

    record('bounded_exploration_cold_large_ticket', {
      evidence: [],
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-03T10:00:00.000Z',
      candidates: [
        cand({
          amountZar: 8000,
          cardId: 'card-2',
          posTerminalId: 'machine-1',
          invoiceId: 'genuine-invoice',
          economicPaymentId: 'genuine-pay',
        }),
      ],
    })

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
          posTerminalId: 'machine-99',
          illegalReason: 'Illegal merchant/POS pairing',
        }),
      ],
      controlAction: {
        kind: 'wait',
        amountZar: null,
        cardId: null,
        posTerminalId: null,
        issuerAcquirerPairId: null,
        invoiceId: null,
        economicPaymentId: null,
        legalCheckPass: true,
      },
    })
    assert.equal(illegal.threshold.action.kind, 'wait')
    assert.equal(illegal.lookahead.action.kind, 'wait')
    rows.push({
      scenario: 'illegal_merchant_pos_all_reject',
      control: `${illegal.control.action.kind}:${illegal.control.action.amountZar}`,
      belief_threshold: `${illegal.threshold.action.kind}:${illegal.threshold.action.amountZar}`,
      lookahead: `${illegal.lookahead.action.kind}:${illegal.lookahead.action.amountZar}`,
    })

    console.log('\n=== Paired policy comparison (identical exogenous conditions) ===')
    for (const row of rows) {
      console.log(JSON.stringify({ ...row, note: 'No superiority claimed.' }))
    }
  })
})
