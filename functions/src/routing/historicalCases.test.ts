import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeDeskHistory, outcomeFromLegacy } from './frictionHistory'
import { CASE_B_TXS } from './historicalCases'
import { assertEngineIgnoresCaseTag, replayHistoricalCases } from './replayHistoricalCases'

describe('proposed rows stay out of history', () => {
  it('drops status=proposed before features can see them', () => {
    const proposed = { ...CASE_B_TXS[0], id: 'proposed-only', status: 'proposed' as const }
    const merged = mergeDeskHistory([proposed, CASE_B_TXS[0]], [])
    assert.equal(merged.some((row) => row.status === 'proposed'), false)
    assert.equal(merged.some((row) => row.id === CASE_B_TXS[0].id), true)
  })
})

describe('legacy outcome mapping', () => {
  it('does not map a bare cleared to approved_no_friction', () => {
    assert.equal(outcomeFromLegacy('cleared', 'cleared'), null)
    assert.equal(outcomeFromLegacy('review_cleared', 'cleared after review'), 'review_cleared')
    assert.equal(outcomeFromLegacy('cleared', 'no friction'), 'approved_no_friction')
    assert.equal(outcomeFromLegacy('docs', 'invoice requested'), 'documents_requested')
  })
})

describe('historical backfill fixtures', () => {
  it('keeps Case B at R71,200 on four cards', () => {
    const total = CASE_B_TXS.reduce((sum, row) => sum + row.amountZar, 0)
    const cards = new Set(CASE_B_TXS.map((row) => row.cardId))
    assert.equal(CASE_B_TXS.length, 7)
    assert.equal(total, 71_200)
    assert.equal(cards.size, 4)
    assert.ok(Math.min(...CASE_B_TXS.map((row) => row.amountZar)) === 100)
    assert.ok(Math.max(...CASE_B_TXS.map((row) => row.amountZar)) === 21_000)
  })
})

describe('as-of replay', () => {
  it('does not let caseTag change the band', () => {
    assert.doesNotThrow(() => assertEngineIgnoresCaseTag())
  })

  it('freezes history before each swipe and records featureVersion', () => {
    const { caseA, caseB, comparison } = replayHistoricalCases()
    for (const row of [...caseA, ...caseB]) {
      assert.equal(row.snapshot.featureVersion, 'friction_features_v1')
      assert.equal(row.snapshot.historyCutoffAt, row.occurredAt)
      assert.ok(row.snapshot.computedAt === row.occurredAt)
      assert.equal(row.proposalSnapshot.kind, 'proposal')
      assert.equal(row.executionSnapshot.kind, 'execution')
      assert.equal(row.proposalSnapshot.band, row.executionSnapshot.band)
      assert.notEqual(row.proposalSnapshot.id, row.executionSnapshot.id)
    }
    assert.equal(comparison.at.caseA.transactionId, 'hist-a-7')
    assert.equal(comparison.at.caseB.transactionId, 'hist-b-7')
    assert.equal(comparison.wouldIdentifyBeforeReview.caseA.reviewCount30d, 0)
    assert.equal(comparison.wouldIdentifyBeforeReview.caseB.reviewCount30d, 0)
    assert.equal(comparison.whereItFails.reviewsInvisibleBeforeOpen, true)
  })
})
