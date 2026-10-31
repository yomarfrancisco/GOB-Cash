import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  microDripMzn,
  mznCycleBarPercent,
  mznToTransitUsd,
  remainingFiveSecondTicksUntil,
  transitDayBarPercent,
  zarClearBarPercent,
} from './transitDayClock'

describe('transitDayClock', () => {
  it('sizes micro drip from planned residual over remaining ticks', () => {
    const drip = microDripMzn({
      remainingPlannedMzn: 1000,
      visibleMzn: 5000,
      nowMs: Date.UTC(2026, 9, 31, 10, 0, 0), // mid-window-ish depending on SAST helpers
    })
    assert.ok(drip > 0)
    assert.ok(drip <= 1000)
  })

  it('falls back to a tiny slice of visible MZN when no plan residual', () => {
    const drip = microDripMzn({
      remainingPlannedMzn: 0,
      visibleMzn: 10_000,
      nowMs: Date.now(),
    })
    assert.ok(drip >= 0.01)
    assert.ok(drip < 10_000)
  })

  it('converts MZN drip to USD at sell Mt/$', () => {
    assert.equal(mznToTransitUsd(84, 84), 1)
    assert.equal(mznToTransitUsd(0, 84), 0)
  })

  it('fills MZN cycle and ZAR ceremony bars over their windows', () => {
    const anchor = 1_000_000
    assert.equal(mznCycleBarPercent(anchor, anchor), 0)
    assert.equal(mznCycleBarPercent(anchor + 2500, anchor), 50)
    assert.equal(mznCycleBarPercent(anchor + 5000, anchor), 100)
    assert.equal(zarClearBarPercent(anchor + 7500, anchor), 50)
    assert.equal(zarClearBarPercent(anchor + 15_000, anchor), 100)
    assert.equal(zarClearBarPercent(anchor, null), 0)
  })

  it('keeps transit day bar in 0–100', () => {
    const pct = transitDayBarPercent(Date.now())
    assert.ok(pct >= 0 && pct <= 100)
    assert.ok(remainingFiveSecondTicksUntil(Date.now(), Date.now() + 12_000) >= 3)
  })
})
