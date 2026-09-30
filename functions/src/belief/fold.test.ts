import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendEvidence, buildRouteEvidence, sortEvidence } from './evidence'
import { foldEvidence } from './fold'
import type { NewRouteEvidenceInput, RouteEvidence } from './types'

function base(partial: Partial<NewRouteEvidenceInput> & Pick<NewRouteEvidenceInput, 'kind' | 'eventAt'>): RouteEvidence {
  return buildRouteEvidence({
    source: 'simulation',
    provenance: 'simulation',
    trustClass: 'simulation',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    merchantPrincipalId: 'lemon_economics',
    invoiceIssuerEntityId: 'lemon_economics',
    mozambiqueBuyerId: 'multivendas',
    cardId: 'card-1',
    cardIssuerBankId: 'bci',
    posTerminalId: 'pos-1',
    acquirerBankId: 'fnb',
    invoiceId: 'inv-1',
    economicPaymentId: 'pay-1',
    testRunId: 'sim-1',
    cycleNumber: 1,
    requestedZar: 8000,
    settledZar: null,
    settledAt: null,
    linkedObservationId: null,
    operatorUid: null,
    evidenceRef: null,
    notes: [],
    ...partial,
  })
}

describe('route evidence', () => {
  it('is idempotent on observationId', () => {
    const a = base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'p1' })
    const b = base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'p1' })
    assert.equal(a.observationId, b.observationId)
    const log = appendEvidence(appendEvidence([], a), b)
    assert.equal(log.length, 1)
  })

  it('does not treat ineligible declines as liquidity evidence in fold rates', () => {
    const auth = base({
      kind: 'authorised',
      eventAt: '2026-09-01T10:00:00.000Z',
      economicPaymentId: 'p1',
    })
    const bad = base({
      kind: 'under_review',
      eventAt: '2026-09-01T11:00:00.000Z',
      economicPaymentId: 'p2',
      attemptEligibility: 'ineligible',
      causeClass: 'documentation',
    })
    const snaps = foldEvidence([auth, bad], '2026-09-02T00:00:00.000Z')
    const pair = snaps.find((s) => s.level === 'pair')
    assert.ok(pair)
    assert.equal(pair!.authorisationAcceptance, 1)
    assert.equal(pair!.reviewState, 'under_review')
  })

  it('does not double-count linked settlement_credited and zar_available', () => {
    const credited = base({
      kind: 'settlement_credited',
      eventAt: '2026-09-01T18:00:00.000Z',
      economicPaymentId: 'same',
      settledZar: 8000,
      settledAt: '2026-09-01T18:00:00.000Z',
      linkedObservationId: 'link-1',
    })
    const zar = base({
      kind: 'zar_available',
      eventAt: '2026-09-01T18:00:00.000Z',
      economicPaymentId: 'same',
      settledZar: 8000,
      settledAt: '2026-09-01T18:00:00.000Z',
      linkedObservationId: 'link-1',
    })
    const pair = foldEvidence([credited, zar], '2026-09-02T00:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(pair!.settlementEvidenceCount, 1)
    assert.equal(pair!.finalSettlementRate, 1)
  })
})

describe('belief fold replay', () => {
  it('fold(E) equals fold(shuffle(E))', () => {
    const rows = [
      base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'a' }),
      base({
        kind: 'delayed',
        eventAt: '2026-09-01T12:00:00.000Z',
        economicPaymentId: 'a',
        ingestedAt: '2026-09-01T12:05:00.000Z',
      }),
      base({
        kind: 'zar_available',
        eventAt: '2026-09-02T09:00:00.000Z',
        economicPaymentId: 'a',
        settledZar: 8000,
        settledAt: '2026-09-02T09:00:00.000Z',
      }),
      base({
        kind: 'under_review',
        eventAt: '2026-09-03T10:00:00.000Z',
        economicPaymentId: 'b',
        requestedZar: 5000,
      }),
      base({
        kind: 'recovered',
        eventAt: '2026-09-04T10:00:00.000Z',
        economicPaymentId: 'b',
        requestedZar: 5000,
      }),
      base({
        kind: 'authorised',
        eventAt: '2026-09-05T10:00:00.000Z',
        economicPaymentId: 'c',
        requestedZar: 8000,
      }),
      base({
        kind: 'zar_available',
        eventAt: '2026-09-05T18:00:00.000Z',
        economicPaymentId: 'c',
        settledZar: 8000,
        settledAt: '2026-09-05T18:00:00.000Z',
      }),
    ]
    const shuffled = [...rows].reverse()
    const a = foldEvidence(rows, '2026-09-06T00:00:00.000Z')
    const b = foldEvidence(shuffled, '2026-09-06T00:00:00.000Z')
    assert.deepEqual(a, b)
  })

  it('fold(E) equals fold(E + duplicate)', () => {
    const row = base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'dup' })
    const e = [row]
    const withDup = appendEvidence(e, { ...row })
    assert.deepEqual(
      foldEvidence(e, '2026-09-02T00:00:00.000Z'),
      foldEvidence(withDup, '2026-09-02T00:00:00.000Z')
    )
  })

  it('reversal increases exposure without deleting authorisation evidence', () => {
    const rows = [
      base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'r1' }),
      base({
        kind: 'zar_available',
        eventAt: '2026-09-01T18:00:00.000Z',
        economicPaymentId: 'r1',
        settledZar: 8000,
        settledAt: '2026-09-01T18:00:00.000Z',
      }),
      base({
        kind: 'reversed',
        eventAt: '2026-09-10T10:00:00.000Z',
        economicPaymentId: 'r1',
        settledZar: 8000,
      }),
    ]
    const snap = foldEvidence(rows, '2026-09-11T00:00:00.000Z').find((s) => s.level === 'pair')
    assert.ok(snap)
    assert.equal(snap!.authorisationAcceptance, 1)
    assert.equal(snap!.finalSettlementRate, 1)
    assert.equal(snap!.reversalExposure, 8000)
    assert.equal(snap!.largestRecentSuccessfulTicketZar, 8000)
  })

  it('delayed is not recovering', () => {
    const rows = [
      base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'd1' }),
      base({ kind: 'delayed', eventAt: '2026-09-01T16:00:00.000Z', economicPaymentId: 'd1' }),
    ]
    const snap = foldEvidence(rows, '2026-09-01T17:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(snap!.reviewState, 'delayed')
  })

  it('capture does not raise settlement maturity or ticket size', () => {
    const rows = [
      base({ kind: 'authorised', eventAt: '2026-09-01T10:00:00.000Z', economicPaymentId: 'c1' }),
      base({ kind: 'captured', eventAt: '2026-09-01T10:10:00.000Z', economicPaymentId: 'c1' }),
    ]
    const snap = foldEvidence(rows, '2026-09-01T11:00:00.000Z').find((s) => s.level === 'pair')
    assert.equal(snap!.settlementMaturity, 'cold')
    assert.equal(snap!.settlementEvidenceCount, 0)
    assert.equal(snap!.largestRecentSuccessfulTicketZar, null)
    assert.equal(snap!.finalSettlementRate, null)
  })

  it('canonical sort is stable by eventAt, ingestedAt, observationId', () => {
    const a = base({
      kind: 'authorised',
      eventAt: '2026-09-01T10:00:00.000Z',
      ingestedAt: '2026-09-01T10:01:00.000Z',
      economicPaymentId: 's1',
    })
    const b = base({
      kind: 'authorised',
      eventAt: '2026-09-01T10:00:00.000Z',
      ingestedAt: '2026-09-01T10:00:30.000Z',
      economicPaymentId: 's2',
    })
    const sorted = sortEvidence([a, b])
    assert.equal(sorted[0].economicPaymentId, 's2')
  })
})
