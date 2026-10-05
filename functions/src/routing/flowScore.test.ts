import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RouteBeliefSnapshot } from '../belief/types'
import {
  assignmentsFingerprint,
  learningLambda,
  scoreFlowTicket,
  shouldReplayDayAfterFlowRevision,
} from './flowScore'

function belief(partial: Partial<RouteBeliefSnapshot>): RouteBeliefSnapshot {
  return {
    schemaVersion: 2,
    level: 'pair',
    beliefKey: 'pair:bci__lemon',
    authorisationAcceptance: 0.9,
    finalSettlementRate: 0.8,
    largestRecentSuccessfulTicketZar: 10_000,
    settlementLatencyMs: 86_400_000,
    rollingSettledVolumeZar: 50_000,
    pendingExposureZar: 0,
    reviewState: 'clear',
    settlementMaturity: 'thin',
    maturity: 'thin',
    evidenceCount: 3,
    settlementEvidenceCount: 3,
    evidenceFreshnessDays: 2,
    recentAttemptCount: 3,
    recentSettlementCount: 3,
    observedCadenceDays: 1,
    reversalExposure: 0,
    lastEventAt: null,
    operatorObservationCount: 0,
    ...partial,
  }
}

describe('flowScore', () => {
  it('keeps λ at 0 with no settlement evidence (cold start)', () => {
    assert.equal(learningLambda(null), 0)
    assert.equal(
      learningLambda(
        belief({
          settlementMaturity: 'cold',
          settlementEvidenceCount: 0,
          evidenceCount: 0,
        })
      ),
      0
    )
  })

  it('raises λ as settlement evidence accrues', () => {
    const thin = learningLambda(belief({ settlementEvidenceCount: 2, settlementMaturity: 'thin' }))
    const established = learningLambda(
      belief({ settlementEvidenceCount: 6, settlementMaturity: 'established' })
    )
    assert.ok(thin > 0.2)
    assert.ok(established > thin)
    assert.ok(established <= 0.85)
  })

  it('prefers higher settlement probability when λ is active', () => {
    const sell = 4.62
    const cost = 4.2
    const good = scoreFlowTicket({
      amountZar: 10_000,
      cardId: 1,
      belief: belief({ finalSettlementRate: 0.95, settlementEvidenceCount: 6, settlementMaturity: 'established' }),
      sellRate: sell,
      baseCostRate: cost,
      tightness: 1,
    })
    const bad = scoreFlowTicket({
      amountZar: 10_000,
      cardId: 1,
      belief: belief({ finalSettlementRate: 0.2, settlementEvidenceCount: 6, settlementMaturity: 'established' }),
      sellRate: sell,
      baseCostRate: cost,
      tightness: 1,
    })
    assert.ok(good.score > bad.score)
    assert.ok(good.lambda > 0.5)
  })

  it('demotes interrupted rails hard', () => {
    const clear = scoreFlowTicket({
      amountZar: 10_000,
      cardId: 1,
      belief: belief({ reviewState: 'clear' }),
      sellRate: 4.62,
      baseCostRate: 4.2,
    })
    const review = scoreFlowTicket({
      amountZar: 10_000,
      cardId: 1,
      belief: belief({ reviewState: 'under_review' }),
      sellRate: 4.62,
      baseCostRate: 4.2,
    })
    assert.ok(review.score < -100)
    assert.ok(clear.score > review.score)
  })

  it('gates full day replay away from open send and committed ZAR', () => {
    assert.equal(
      shouldReplayDayAfterFlowRevision({
        deskStep: 3,
        cyclePhase: 'awaiting_mzn',
        committedZar: 0,
        assignmentsChanged: true,
      }),
      true
    )
    assert.equal(
      shouldReplayDayAfterFlowRevision({
        deskStep: 4,
        cyclePhase: 'awaiting_send',
        committedZar: 0,
        assignmentsChanged: true,
      }),
      false
    )
    assert.equal(
      shouldReplayDayAfterFlowRevision({
        deskStep: 2,
        cyclePhase: 'awaiting_invoice',
        committedZar: 5_000,
        assignmentsChanged: true,
      }),
      false
    )
    assert.equal(
      shouldReplayDayAfterFlowRevision({
        deskStep: 2,
        cyclePhase: 'awaiting_invoice',
        committedZar: 0,
        assignmentsChanged: false,
      }),
      false
    )
  })

  it('fingerprints assignment sets stably', () => {
    assert.equal(
      assignmentsFingerprint([
        { cardId: 2, machineId: 1, amount: 5000 },
        { cardId: 1, machineId: 3, amount: 2500 },
      ]),
      assignmentsFingerprint([
        { cardId: 1, machineId: 3, amount: 2500 },
        { cardId: 2, machineId: 1, amount: 5000 },
      ])
    )
  })
})
