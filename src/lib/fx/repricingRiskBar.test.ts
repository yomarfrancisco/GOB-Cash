import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampRiskScore,
  cardDisplaysBottomBar,
  isZarPayoutRiskCard,
  repricingRiskAriaLevel,
  repricingRiskBarPercent,
  riskBarPercentForCard,
} from './repricingRiskBar'

describe('score-to-bar mapping', () => {
  it('clamps the visual value between 0 and 100', () => {
    assert.equal(clampRiskScore(-12), 0)
    assert.equal(clampRiskScore(0), 0)
    assert.equal(clampRiskScore(37.5), 37.5)
    assert.equal(clampRiskScore(100), 100)
    assert.equal(clampRiskScore(140), 100)
    assert.equal(clampRiskScore(Number.NaN), 0)
  })

  it('maps a ready score onto the bar and uses the minimum for low scores', () => {
    assert.equal(repricingRiskBarPercent({ dataStatus: 'ready', riskScore: 0 }), 0)
    assert.equal(repricingRiskBarPercent({ dataStatus: 'ready', riskScore: 12 }), 12)
    assert.equal(repricingRiskBarPercent({ dataStatus: 'ready', riskScore: 250 }), 100)
  })

  it('keeps learning, stale, unavailable, and missing data at the neutral minimum', () => {
    assert.equal(repricingRiskBarPercent({ dataStatus: 'learning', riskScore: 80 }), 0)
    assert.equal(repricingRiskBarPercent({ dataStatus: 'stale', riskScore: 80 }), 0)
    assert.equal(repricingRiskBarPercent({ dataStatus: 'unavailable', riskScore: 80 }), 0)
    assert.equal(repricingRiskBarPercent(null), 0)
    assert.equal(repricingRiskAriaLevel({ dataStatus: 'ready', riskScore: 10 }), 'low')
    assert.equal(repricingRiskAriaLevel({ dataStatus: 'ready', riskScore: 40 }), 'moderate')
    assert.equal(repricingRiskAriaLevel({ dataStatus: 'ready', riskScore: 70 }), 'high')
    assert.equal(repricingRiskAriaLevel({ dataStatus: 'stale', riskScore: 70 }), 'unavailable')
  })
})

describe('ZAR card binding', () => {
  const ready = { dataStatus: 'ready' as const, riskScore: 80 }

  it('does not give the MZN card the dynamic risk value', () => {
    assert.equal(isZarPayoutRiskCard('MZN'), false)
    assert.equal(riskBarPercentForCard('MZN', ready, 0), null)
    assert.equal(cardDisplaysBottomBar({ currencyCode: 'MZN', cardType: 'mzn' }), false)
  })

  it('gives the ZAR card the risk value regardless of stack position', () => {
    for (const stackIndex of [0, 1, 2, 5]) {
      assert.equal(isZarPayoutRiskCard('ZAR'), true)
      assert.equal(riskBarPercentForCard('ZAR', ready, stackIndex), 80)
    }
    assert.equal(cardDisplaysBottomBar({ currencyCode: 'ZAR', cardType: 'savings' }), true)
  })

  it('does not change unrelated card bar visibility', () => {
    assert.equal(cardDisplaysBottomBar({ currencyCode: 'USD', cardType: 'zwd' }), true)
    assert.equal(cardDisplaysBottomBar({ currencyCode: 'ETH', cardType: 'yield' }), true)
    assert.equal(cardDisplaysBottomBar({ currencyCode: 'BTC', cardType: 'btc' }), true)
    assert.equal(cardDisplaysBottomBar({ currencyCode: 'MZN', cardType: 'yieldSurprise' }), false)
  })
})
