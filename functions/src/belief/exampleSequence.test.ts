/**
 * Stage D gate: example lifecycle must produce sensible beliefs + policy actions
 * before any live UI (Stages E–F) is unpaused.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRouteEvidence, pairId } from './evidence'
import { foldEvidence, resolveRouteBelief } from './fold'
import { decideBeliefThreshold, type CandidatePayment } from './policies'
import type { RouteEvidence } from './types'

const PAIR = pairId('bci', 'fnb')!
const BASE = {
  merchantPrincipalId: 'imani_beauty',
  invoiceIssuerEntityId: 'imani',
  mozambiqueBuyerId: 'wolf',
  cardId: '4',
  cardIssuerBankId: 'bci',
  posTerminalId: '2',
  acquirerBankId: 'fnb',
  issuerAcquirerPairId: PAIR,
  invoiceId: 'inv-demo',
  economicPaymentId: 'pay-demo-1',
  testRunId: 'test-demo',
  cycleNumber: 1,
  source: 'production' as const,
  provenance: 'bank_mail' as const,
  attemptEligibility: 'eligible_submitted' as const,
  causeClass: 'unknown' as const,
  operatorUid: null,
  evidenceRef: null,
  linkedObservationId: null,
  notes: [] as string[],
}

function row(
  kind: RouteEvidence['kind'],
  at: string,
  extra: Partial<RouteEvidence> = {}
): RouteEvidence {
  return buildRouteEvidence({
    ...BASE,
    kind,
    requestedZar: 8000,
    settledZar: kind === 'zar_available' || kind === 'settlement_credited' ? 8000 : null,
    eventAt: at,
    settledAt: kind === 'zar_available' || kind === 'settlement_credited' ? at : null,
    ...extra,
  })
}

const candidate: CandidatePayment = {
  amountZar: 12_000,
  cardId: '4',
  posTerminalId: '2',
  cardIssuerBankId: 'bci',
  acquirerBankId: 'fnb',
  issuerAcquirerPairId: PAIR,
  invoiceId: 'inv-next',
  economicPaymentId: 'pay-demo-2',
}

describe('Stage D example sequence', () => {
  it('authorised → delay → zar_available → review → recovery yields sane beliefs and actions', () => {
    const authorised = row('authorised', '2026-10-01T10:00:00.000Z')
    let evidence = [authorised]
    let beliefs = foldEvidence(evidence, '2026-10-01T10:05:00.000Z')
    let pair = resolveRouteBelief(beliefs, {
      pairId: PAIR,
      cardIssuerBankId: 'bci',
      acquirerBankId: 'fnb',
    })
    assert.ok(pair)
    assert.ok((pair.authorisationAcceptance ?? 0) > 0)
    assert.equal(pair.finalSettlementRate, null)
    assert.equal(pair.largestRecentSuccessfulTicketZar, null)

    const delayed = row('delayed', '2026-10-01T18:00:00.000Z')
    evidence = [...evidence, delayed]
    beliefs = foldEvidence(evidence, '2026-10-01T18:05:00.000Z')
    pair = resolveRouteBelief(beliefs, { pairId: PAIR, cardIssuerBankId: 'bci', acquirerBankId: 'fnb' })
    assert.ok(pair)
    assert.equal(pair.reviewState, 'delayed')
    assert.equal(pair.largestRecentSuccessfulTicketZar, null)

    const settled = row('zar_available', '2026-10-02T09:00:00.000Z', {
      settledAt: '2026-10-02T09:00:00.000Z',
      settledZar: 8000,
    })
    evidence = [...evidence, settled]
    beliefs = foldEvidence(evidence, '2026-10-02T09:05:00.000Z')
    pair = resolveRouteBelief(beliefs, { pairId: PAIR, cardIssuerBankId: 'bci', acquirerBankId: 'fnb' })
    assert.ok(pair)
    assert.equal(pair.largestRecentSuccessfulTicketZar, 8000)
    assert.ok((pair.finalSettlementRate ?? 0) > 0)
    assert.ok(pair.rollingSettledVolumeZar >= 8000)

    const decideAfterSettle = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 50_000,
      pendingExposureZar: 0,
      candidates: [candidate],
      asOf: '2026-10-02T09:10:00.000Z',
    })
    assert.ok(['execute', 'reduce_to', 'bounded_exploration'].includes(decideAfterSettle.action.kind))
    if (decideAfterSettle.action.amountZar != null) {
      assert.ok(decideAfterSettle.action.amountZar <= 8000 * 1.05 + 1e-6)
    }
    assert.ok(decideAfterSettle.explanationFacts.some((f) => /ticket size|settled/i.test(f.text)))

    const review = row('under_review', '2026-10-03T11:00:00.000Z', {
      economicPaymentId: 'pay-demo-2',
      requestedZar: 8000,
    })
    evidence = [...evidence, review]
    beliefs = foldEvidence(evidence, '2026-10-03T11:05:00.000Z')
    pair = resolveRouteBelief(beliefs, { pairId: PAIR, cardIssuerBankId: 'bci', acquirerBankId: 'fnb' })
    assert.ok(pair)
    assert.equal(pair.reviewState, 'under_review')

    const decideOnReview = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 50_000,
      pendingExposureZar: 0,
      candidates: [candidate],
      asOf: '2026-10-03T11:10:00.000Z',
    })
    assert.ok(['wait', 'reroute'].includes(decideOnReview.action.kind))

    const recovered = row('recovered', '2026-10-04T12:00:00.000Z', {
      economicPaymentId: 'pay-demo-3',
    })
    const settledAgain = row('zar_available', '2026-10-04T12:30:00.000Z', {
      economicPaymentId: 'pay-demo-3',
      settledAt: '2026-10-04T12:30:00.000Z',
      settledZar: 8000,
      requestedZar: 8000,
    })
    evidence = [...evidence, recovered, settledAgain]
    beliefs = foldEvidence(evidence, '2026-10-04T12:35:00.000Z')
    pair = resolveRouteBelief(beliefs, { pairId: PAIR, cardIssuerBankId: 'bci', acquirerBankId: 'fnb' })
    assert.ok(pair)
    assert.ok(pair.reviewState === 'recovered' || pair.reviewState === 'clear')
    assert.equal(pair.largestRecentSuccessfulTicketZar, 8000)
    assert.ok(pair.settlementEvidenceCount >= 2)

    const decideAfterRecovery = decideBeliefThreshold({
      evidence,
      usableZar: 50_000,
      authorisedResidualZar: 50_000,
      pendingExposureZar: 0,
      candidates: [candidate],
      asOf: '2026-10-04T12:40:00.000Z',
    })
    assert.ok(decideAfterRecovery.explanationFacts.length > 0)
    assert.doesNotMatch(
      decideAfterRecovery.explanationFacts.map((f) => f.text).join(' '),
      /capacity|pSettle|Beta|bank balance/i
    )
  })
})
