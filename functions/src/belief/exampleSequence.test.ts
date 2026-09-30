import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendOnly } from './appendOnly'
import { buildRouteEvidence } from './evidence'
import { foldEvidence } from './fold'
import { decideBeliefThreshold } from './policies'
import type { NewRouteEvidenceInput, RouteEvidence } from './types'

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
    testRunId: 'seq',
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

describe('example sequence demo gate', () => {
  it('authorisation → delay → settle → review → recover → reversal', () => {
    let log: RouteEvidence[] = []
    ;({ log } = appendOnly(
      log,
      ev({
        kind: 'authorised',
        eventAt: '2026-09-01T09:00:00.000Z',
        economicPaymentId: 'p1',
        requestedZar: 8000,
      })
    ))
    ;({ log } = appendOnly(
      log,
      ev({
        kind: 'delayed',
        eventAt: '2026-09-01T15:00:00.000Z',
        economicPaymentId: 'p1',
        requestedZar: 8000,
      })
    ))
    let pair = foldEvidence(log, '2026-09-01T16:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.reviewState, 'delayed')

    ;({ log } = appendOnly(
      log,
      ev({
        kind: 'zar_available',
        eventAt: '2026-09-01T09:00:00.000Z',
        economicPaymentId: 'p1',
        requestedZar: 8000,
        settledZar: 8000,
        settledAt: '2026-09-02T09:00:00.000Z',
      })
    ))
    pair = foldEvidence(log, '2026-09-02T10:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.reviewState, 'recovered')
    assert.equal(pair!.largestRecentSuccessfulTicketZar, 8000)

    ;({ log } = appendOnly(
      log,
      ev({
        kind: 'under_review',
        eventAt: '2026-09-03T10:00:00.000Z',
        economicPaymentId: 'p2',
        requestedZar: 8000,
      })
    ))
    const duringReview = decideBeliefThreshold({
      evidence: log,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 8000,
      asOf: '2026-09-03T11:00:00.000Z',
      candidates: [
        {
          amountZar: 8000,
          cardId: 'card-2',
          posTerminalId: 'machine-1',
          cardIssuerBankId: 'bci',
          acquirerBankId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv',
          economicPaymentId: 'next',
        },
      ],
    })
    assert.equal(duringReview.action.kind, 'wait')
    assert.ok(duringReview.explanationFacts.some((f) => /under review/i.test(f.text)))

    ;({ log } = appendOnly(
      log,
      ev({
        kind: 'recovered',
        eventAt: '2026-09-04T10:00:00.000Z',
        economicPaymentId: 'p2',
        requestedZar: 8000,
      })
    ))
    pair = foldEvidence(log, '2026-09-04T11:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.reviewState, 'recovering')

    ;({ log } = appendOnly(
      log,
      ev({
        kind: 'reversed',
        eventAt: '2026-09-10T10:00:00.000Z',
        economicPaymentId: 'p1',
        requestedZar: 8000,
        settledZar: 8000,
        causeClass: 'issuer_control_or_liquidity',
      })
    ))
    const afterRev = decideBeliefThreshold({
      evidence: log,
      usableZar: 50_000,
      authorisedResidualZar: 8000,
      pendingExposureZar: 0,
      asOf: '2026-09-10T12:00:00.000Z',
      candidates: [
        {
          amountZar: 8000,
          cardId: 'card-2',
          posTerminalId: 'machine-1',
          cardIssuerBankId: 'bci',
          acquirerBankId: 'fnb',
          issuerAcquirerPairId: 'bci__fnb',
          invoiceId: 'inv',
          economicPaymentId: 'next',
        },
      ],
    })
    assert.notEqual(afterRev.action.kind === 'execute' && afterRev.action.amountZar === 8000, true)
  })
})
