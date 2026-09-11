import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adviseDesk } from './deskAdvisor'
import { assessFriction, assessProposedRoute, formatObserveLine } from './frictionAdvisor'
import { buildFrictionSnapshot, merchantProfileConfidence } from './frictionFeatures'
import { deskTxFromSwipe, merchantProfile, type DeskTx } from './frictionHistory'
import { createInitialState } from './conversionRouter'
import { sastToUtcMs } from './routingTime'

const NOW = sastToUtcMs(2026, 7, 20, 16, 0)

function tx(partial: Partial<DeskTx> & Pick<DeskTx, 'cardId' | 'machineId' | 'occurredAt'>): DeskTx {
  return deskTxFromSwipe({
    id: partial.id || `${partial.occurredAt}-${partial.cardId}-${partial.machineId}`,
    atMs: partial.occurredAt,
    cardId: partial.cardId,
    machineId: partial.machineId,
    amount: partial.amountZar ?? 10_000,
    cycleNumber: partial.cycleNumber ?? 1,
  })
}

describe('merchant profile confidence', () => {
  it('is not a fraud probability — a new merchant with 7 txs stays low', () => {
    const score = merchantProfileConfidence({
      daysSinceActivation: 5,
      lifetimeCount: 7,
      activeTradingDays: 4,
      observedMonthlyRunRate: 71_200,
      expectedMonthlyVolume: null,
    })
    assert.ok(score < 0.35)
    assert.ok(score >= 0)
  })
})

describe('Case B — new merchant algorithmic profile', () => {
  it('marks insufficient history on a 5-day Capitec profile with 7 txs', () => {
    const history = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      tx({
        cardId: 2,
        machineId: 2,
        occurredAt: NOW - (6 - i) * 18 * 60 * 60 * 1000,
        amountZar: [100, 2_400, 8_000, 9_500, 12_000, 18_200, 21_000][i],
      })
    )
    const snap = buildFrictionSnapshot({
      proposed: { cardId: 2, machineId: 2, amount: 12_000 },
      history,
      nowMs: NOW,
      merchant: merchantProfile(2),
    })
    assert.ok((snap.merchant.daysSinceActivation || 0) <= 6)
    assert.equal(snap.merchant.lifetimeCount, 7)
    const assessment = assessFriction(snap)
    assert.equal(assessment.band, 'insufficient_history')
    assert.match(assessment.body, /thin merchant baseline|too thin|5 days|Capitec/i)
    assert.doesNotMatch(assessment.body, /bank will flag|fraud|Visa/i)
    assert.ok(assessment.resemble.includes('new_merchant_algorithmic_profile_review'))
  })
})

describe('Case A — clustered pair, observe only', () => {
  it('elevates on short-window pair clustering without calling it a split sale', () => {
    const history = [0, 1, 2, 3].map((i) =>
      tx({
        cardId: 2,
        machineId: 1,
        occurredAt: NOW - (3 - i) * 90 * 60 * 1000,
        amountZar: 14_000,
      })
    )
    const snap = buildFrictionSnapshot({
      proposed: { cardId: 2, machineId: 1, amount: 14_000 },
      history,
      nowMs: NOW,
    })
    assert.ok(snap.cluster.pair6h >= 3)
    const assessment = assessFriction(snap)
    assert.ok(assessment.band === 'elevated' || assessment.band === 'high')
    assert.match(assessment.body, /pair|clustering|concentration/i)
    assert.doesNotMatch(assessment.body, /split sale|Visa|will flag/i)
  })
})

describe('observe line stays off empty history', () => {
  it('does not decorate a restock when the desk log is empty', () => {
    const line = formatObserveLine(
      assessProposedRoute({
        assignments: [{ cardId: 4, machineId: 3, amount: 11_339 }],
        history: [],
        nowMs: NOW,
      })
    )
    assert.equal(line, null)
  })
})

describe('friction Ask', () => {
  it('answers merchant age from the Capitec activation on file', () => {
    const advice = adviseDesk({
      message: 'How old is this merchant?',
      state: createInitialState(),
      constraints: [],
      current: {
        kind: 'replenish',
        assignments: [{ cardId: 2, machineId: 2, amount: 12_000 }],
        amountZar: 12_000,
      },
      cycleNumber: 19,
      costRate: 4.15,
      nowMs: NOW,
    })
    assert.match(advice.title, /Capitec/i)
    assert.match(advice.body, /days since the activation date/i)
    assert.match(advice.body, /not a fraud probability/i)
  })

  it('answers the Capitec case from stored facts, not speculation', () => {
    const advice = adviseDesk({
      message: 'Why did Capitec likely flag this?',
      state: createInitialState(),
      constraints: [],
      cycleNumber: 19,
      costRate: 4.15,
      nowMs: NOW,
    })
    assert.match(advice.body, /algorithm flagged/i)
    assert.match(advice.body, /7 transactions/i)
    assert.doesNotMatch(advice.body, /Visa/)
  })
})
