import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampRiskScore, repricingRiskAriaLevel, repricingRiskBarPercent } from './repricingRiskBar'

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
