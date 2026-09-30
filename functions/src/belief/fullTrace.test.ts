import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendOnly } from './appendOnly'
import { buildRouteEvidence } from './evidence'
import { foldEvidence } from './fold'
import { decideBeliefThreshold, decideControl, decideLookahead } from './policies'
import type { NewRouteEvidenceInput, RouteEvidence } from './types'

/**
 * Full audit trace (persisted + derived) for Stage D gate.
 * Prints each step; asserts modelling invariants.
 */
describe('full example trace', () => {
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
      testRunId: 'full-trace',
      cycleNumber: 1,
      settledZar: null,
      settledAt: null,
      notes: [],
      ...partial,
    })
  }

  const candidates = [
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
  ]

  function decideAll(evidence: RouteEvidence[], asOf: string, pending = 0) {
    const input = {
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 16_000,
      pendingExposureZar: pending,
      asOf,
      candidates,
      controlAction: {
        kind: 'execute' as const,
        amountZar: 8000,
        cardId: 'card-2',
        posId: 'machine-1',
        issuerAcquirerPairId: 'bci__fnb',
        invoiceId: 'inv-next',
        economicPaymentId: 'pay-next',
        legalCheckPass: true as const,
      },
    }
    return {
      control: decideControl(input),
      threshold: decideBeliefThreshold(input),
      lookahead: decideLookahead(input),
    }
  }

  function printStep(
    label: string,
    evidence: RouteEvidence[],
    asOf: string,
    pending = 0,
    appended?: RouteEvidence | RouteEvidence[]
  ) {
    const pair = foldEvidence(evidence, asOf).find((s) => s.level === 'pair')
    const decisions = decideAll(evidence, asOf, pending)
    const rows = appended == null ? [] : Array.isArray(appended) ? appended : [appended]
    console.log('\n---', label, '---')
    for (const row of rows) {
      console.log(
        'appended',
        JSON.stringify({
          observationId: row.observationId,
          kind: row.kind,
          requestedZar: row.requestedZar,
          settledZar: row.settledZar,
          eventAt: row.eventAt,
          settledAt: row.settledAt,
        })
      )
    }
    console.log(
      'belief',
      JSON.stringify({
        authorisationAcceptance: pair?.authorisationAcceptance,
        finalSettlementRate: pair?.finalSettlementRate,
        settlementLatencyMs: pair?.settlementLatencyMs,
        largestRecentSuccessfulTicketZar: pair?.largestRecentSuccessfulTicketZar,
        rollingSettledVolumeZar: pair?.rollingSettledVolumeZar,
        pendingExposureZar: pair?.pendingExposureZar,
        reviewState: pair?.reviewState,
        reversalExposure: pair?.reversalExposure,
        evidenceCount: pair?.evidenceCount,
        maturity: pair?.maturity,
      })
    )
    for (const [name, rec] of Object.entries(decisions)) {
      console.log(
        name,
        JSON.stringify({
          decisionId: rec.decisionId,
          action: rec.action.kind,
          amountZar: rec.action.amountZar,
          facts: rec.explanationFacts,
        })
      )
    }
    const banned = /bank balance|remaining capacity|capacity we.?ve observed|pSettle|Beta/i
    for (const rec of Object.values(decisions)) {
      for (const fact of rec.explanationFacts) {
        assert.ok(!banned.test(fact.text), fact.text)
      }
    }
    // Seed-free: identical re-run
    const again = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 16_000,
      pendingExposureZar: pending,
      asOf,
      candidates,
    })
    assert.equal(again.decisionId, decisions.threshold.decisionId)
    return { pair, decisions }
  }

  it('prints and validates the seven-step lifecycle', () => {
    let log: RouteEvidence[] = []
    let result: ReturnType<typeof appendOnly>['result']

    // 1. authorised
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'authorised',
        eventAt: '2026-09-10T09:00:00.000Z',
        economicPaymentId: 'pay-1',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    let step = printStep('1_authorised', log, '2026-09-10T09:05:00.000Z', 8000, result.row)
    assert.equal(step.pair!.authorisationAcceptance, 1)
    assert.equal(step.pair!.finalSettlementRate, null)
    assert.equal(step.pair!.largestRecentSuccessfulTicketZar, null)

    // 2. capture
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'captured',
        eventAt: '2026-09-10T09:10:00.000Z',
        economicPaymentId: 'pay-1',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step = printStep('2_capture', log, '2026-09-10T09:15:00.000Z', 8000, result.row)
    assert.equal(step.pair!.finalSettlementRate, null, 'capture is not settlement')

    // 3. delayed
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'delayed',
        eventAt: '2026-09-10T15:00:00.000Z',
        economicPaymentId: 'pay-1',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step = printStep('3_settlement_delayed', log, '2026-09-10T15:05:00.000Z', 8000, result.row)
    assert.ok(step.pair!.reviewState === 'recovering' || step.pair!.reviewState === 'open')

    // 4. zar_available (eventAt = auth time; settledAt later → latency; distinct from capture)
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-10T09:00:00.000Z',
        economicPaymentId: 'pay-1',
        requestedZar: 8000,
        settledZar: 8000,
        settledAt: '2026-09-11T09:00:00.000Z',
      })
    ))
    assert.equal(result.status, 'written')
    step = printStep('4_zar_available', log, '2026-09-11T09:05:00.000Z', 0, result.row)
    assert.equal(step.pair!.finalSettlementRate, 1)
    assert.equal(step.pair!.largestRecentSuccessfulTicketZar, 8000)
    assert.ok((step.pair!.settlementLatencyMs || 0) > 0)

    // 5. second payment under review
    const step5Rows: RouteEvidence[] = []
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'authorised',
        eventAt: '2026-09-12T09:00:00.000Z',
        economicPaymentId: 'pay-2',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step5Rows.push(result.row)
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'under_review',
        eventAt: '2026-09-12T09:30:00.000Z',
        economicPaymentId: 'pay-2',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step5Rows.push(result.row)
    step = printStep('5_second_under_review', log, '2026-09-12T10:00:00.000Z', 8000, step5Rows)
    assert.equal(step.pair!.reviewState, 'open')
    assert.ok(
      step.decisions.threshold.action.kind === 'wait' ||
        step.decisions.threshold.action.kind === 'reroute'
    )
    // Historical review fact must remain visible after later recovery
    assert.ok(
      step.decisions.threshold.explanationFacts.some((f) => /under review/i.test(f.text))
    )

    // 6. recovery + success again
    const step6Rows: RouteEvidence[] = []
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'recovered',
        eventAt: '2026-09-13T09:00:00.000Z',
        economicPaymentId: 'pay-2',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step6Rows.push(result.row)
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'authorised',
        eventAt: '2026-09-14T09:00:00.000Z',
        economicPaymentId: 'pay-3',
        requestedZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step6Rows.push(result.row)
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-14T09:00:00.000Z',
        economicPaymentId: 'pay-3',
        requestedZar: 8000,
        settledZar: 8000,
        settledAt: '2026-09-14T17:00:00.000Z',
      })
    ))
    assert.equal(result.status, 'written')
    step6Rows.push(result.row)
    step = printStep('6_recovered_then_success', log, '2026-09-14T18:00:00.000Z', 0, step6Rows)
    assert.equal(step.pair!.reviewState, 'clear')
    assert.equal(step.pair!.largestRecentSuccessfulTicketZar, 8000)
    assert.ok(step.pair!.evidenceCount >= 5)
    assert.ok(
      step.decisions.threshold.explanationFacts.some((f) => /under review/i.test(f.text)),
      'recovery must not erase earlier review fact'
    )

    // 7. subsequent reversal
    ;({ log, result } = appendOnly(
      log,
      ev({
        kind: 'reversed',
        eventAt: '2026-09-20T09:00:00.000Z',
        economicPaymentId: 'pay-3',
        requestedZar: 8000,
        settledZar: 8000,
      })
    ))
    assert.equal(result.status, 'written')
    step = printStep('7_reversal', log, '2026-09-20T10:00:00.000Z', 0, result.row)
    assert.equal(step.pair!.reversalExposure, 8000)
    assert.equal(step.pair!.largestRecentSuccessfulTicketZar, 8000, 'reversal must not erase historical ticket')
    assert.equal(step.pair!.finalSettlementRate, 1, 'historical settlement evidence retained')
  })
})
