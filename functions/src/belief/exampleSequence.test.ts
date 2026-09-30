import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRouteEvidence } from './evidence'
import { foldEvidence, resolveRouteBelief } from './fold'
import { decideBeliefThreshold, decideLookahead } from './policies'
import { evaluatePlannerAct } from './decision'
import type { NewRouteEvidenceInput, RouteEvidence } from './types'

/**
 * Required Stage D gate sequence:
 * 1. payment authorised
 * 2. settlement delayed
 * 3. usable ZAR credited
 * 4. second payment under review
 * 5. route later successfully used again
 */
describe('example sequence gate', () => {
  const asOf = '2026-09-20T12:00:00.000Z'

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
      testRunId: 'seq-demo',
      cycleNumber: 1,
      settledZar: null,
      settledAt: null,
      notes: [],
      ...partial,
    })
  }

  it('produces sensible beliefs, recommendations and operator copy', () => {
    const step1 = ev({
      kind: 'authorised',
      eventAt: '2026-09-10T09:00:00.000Z',
      economicPaymentId: 'pay-1',
      requestedZar: 8000,
    })
    let evidence = [step1]
    let pair = foldEvidence(evidence, '2026-09-10T10:00:00.000Z').find((s) => s.level === 'pair')
    assert.ok(pair)
    assert.equal(pair!.authorisationAcceptance, 1)
    assert.equal(pair!.finalSettlementRate, null)
    assert.equal(pair!.largestRecentSuccessfulTicketZar, null)

    const step2 = ev({
      kind: 'delayed',
      eventAt: '2026-09-10T15:00:00.000Z',
      economicPaymentId: 'pay-1',
      requestedZar: 8000,
    })
    evidence = [...evidence, step2]
    pair = foldEvidence(evidence, '2026-09-10T16:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.reviewState, 'recovering')
    assert.equal(pair!.finalSettlementRate, null)

    const step3 = ev({
      kind: 'zar_available',
      eventAt: '2026-09-10T09:00:00.000Z',
      economicPaymentId: 'pay-1',
      requestedZar: 8000,
      settledZar: 8000,
      settledAt: '2026-09-11T09:00:00.000Z',
    })
    evidence = [...evidence, step3]
    pair = foldEvidence(evidence, '2026-09-11T10:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.finalSettlementRate, 1)
    assert.equal(pair!.largestRecentSuccessfulTicketZar, 8000)
    assert.ok((pair!.settlementLatencyMs || 0) > 0)

    const step4 = ev({
      kind: 'authorised',
      eventAt: '2026-09-12T09:00:00.000Z',
      economicPaymentId: 'pay-2',
      requestedZar: 8000,
    })
    const step4b = ev({
      kind: 'under_review',
      eventAt: '2026-09-12T09:30:00.000Z',
      economicPaymentId: 'pay-2',
      requestedZar: 8000,
    })
    evidence = [...evidence, step4, step4b]
    pair = foldEvidence(evidence, '2026-09-12T10:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.reviewState, 'open')

    const decisionDuringReview = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 16_000,
      pendingExposureZar: 8000,
      asOf: '2026-09-12T10:00:00.000Z',
      candidates: [
        {
          amountZar: 8000,
          cardId: 'card-2',
          posId: 'machine-1',
          issuerId: 'bci',
          acquirerId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv-pay-2',
          economicPaymentId: 'pay-2',
        },
        {
          amountZar: 5000,
          cardId: 'card-3',
          posId: 'machine-2',
          issuerId: 'bci',
          acquirerId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv-alt',
          economicPaymentId: 'pay-alt',
        },
      ],
    })
    assert.ok(
      decisionDuringReview.action.kind === 'wait' || decisionDuringReview.action.kind === 'reroute',
      `expected wait or reroute, got ${decisionDuringReview.action.kind}`
    )
    assert.ok(
      decisionDuringReview.explanationFacts.some((f) => f.kind === 'observation' && /review/i.test(f.text))
    )

    const step5a = ev({
      kind: 'recovered',
      eventAt: '2026-09-13T09:00:00.000Z',
      economicPaymentId: 'pay-2',
      requestedZar: 8000,
    })
    const step5b = ev({
      kind: 'authorised',
      eventAt: '2026-09-14T09:00:00.000Z',
      economicPaymentId: 'pay-3',
      requestedZar: 8000,
    })
    const step5c = ev({
      kind: 'zar_available',
      eventAt: '2026-09-14T17:00:00.000Z',
      economicPaymentId: 'pay-3',
      requestedZar: 8000,
      settledZar: 8000,
      settledAt: '2026-09-14T17:00:00.000Z',
    })
    evidence = [...evidence, step5a, step5b, step5c]
    pair = foldEvidence(evidence, asOf).find((s) => s.level === 'pair')
    assert.equal(pair!.reviewState, 'clear')
    assert.equal(pair!.largestRecentSuccessfulTicketZar, 8000)
    assert.ok((pair!.recentSettlementCount || 0) >= 1)

    const resolved = resolveRouteBelief(foldEvidence(evidence, asOf), {
      issuerId: 'bci',
      acquirerId: 'fnb',
      pairId: 'bci__fnb',
      cardId: 'card-2',
      posId: 'machine-1',
    })
    assert.ok(resolved)

    const after = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf,
      candidates: [
        {
          amountZar: 8000,
          cardId: 'card-2',
          posId: 'machine-1',
          issuerId: 'bci',
          acquirerId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv-next',
          economicPaymentId: 'pay-next',
        },
      ],
    })
    assert.ok(['execute', 'reduce_to', 'bounded_exploration'].includes(after.action.kind))
    assert.ok(
      after.explanationFacts.some(
        (f) => f.kind === 'observation' && /R8[\u00a0 ]?000|R8,000|8000/.test(f.text)
      ),
      JSON.stringify(after.explanationFacts)
    )
    assert.ok(
      after.explanationFacts.some(
        (f) => f.kind === 'inference' && /recently observed ticket size/i.test(f.text)
      ),
      JSON.stringify(after.explanationFacts)
    )

    const lookahead = decideLookahead({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf,
      candidates: [
        {
          amountZar: 8000,
          cardId: 'card-2',
          posId: 'machine-1',
          issuerId: 'bci',
          acquirerId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv-next',
          economicPaymentId: 'pay-next',
        },
      ],
    })
    assert.ok(lookahead.decisionId)
    assert.equal(lookahead.policyId, 'lookahead_mpc_short')

    // Same state + policy version → same action (seed-free)
    const again = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf,
      candidates: [
        {
          amountZar: 8000,
          cardId: 'card-2',
          posId: 'machine-1',
          issuerId: 'bci',
          acquirerId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv-next',
          economicPaymentId: 'pay-next',
        },
      ],
    })
    assert.equal(again.decisionId, after.decisionId)
    assert.equal(again.action.kind, after.action.kind)
    assert.equal(again.action.amountZar, after.action.amountZar)

    const act = evaluatePlannerAct({
      actKind: 'accept_recommendation',
      operatorUid: 'ygor',
      authorisedUids: ['ygor'],
      decision: after,
      submittedDecisionStateHash: after.decisionStateHash,
      expectedWindowDay: null,
      idempotencyKey: 'act-1',
      seenIdempotencyKeys: new Set(),
    })
    assert.equal(act.status, 'accepted')

    const stale = evaluatePlannerAct({
      actKind: 'accept_recommendation',
      operatorUid: 'ygor',
      authorisedUids: ['ygor'],
      decision: after,
      submittedDecisionStateHash: 'wrong-hash',
      expectedWindowDay: null,
      idempotencyKey: 'act-2',
      seenIdempotencyKeys: new Set(),
    })
    assert.equal(stale.status, 'rejected_stale')
  })
})
