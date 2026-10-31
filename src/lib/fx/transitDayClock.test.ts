import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MZN_DRIP_CYCLE_MAX_MS,
  MZN_DRIP_CYCLE_MIN_MS,
  microDripMzn,
  mznCycleBarPercent,
  mznToTransitUsd,
  randomMznDripCycleMs,
  remainingFiveSecondTicksUntil,
  transitDayBarPercent,
  zarClearBarPercent,
} from './transitDayClock'

describe('transitDayClock', () => {
  it('sizes micro drip from planned residual over remaining window, scaled by cycle', () => {
    const drip5 = microDripMzn({
      remainingPlannedMzn: 1000,
      visibleMzn: 5000,
      nowMs: Date.UTC(2026, 9, 31, 10, 0, 0),
      cycleDurationMs: 5_000,
    })
    const drip30 = microDripMzn({
      remainingPlannedMzn: 1000,
      visibleMzn: 5000,
      nowMs: Date.UTC(2026, 9, 31, 10, 0, 0),
      cycleDurationMs: 30_000,
    })
    assert.ok(drip5 > 0)
    assert.ok(drip5 <= 1000)
    assert.ok(drip30 > drip5)
    // ~6× before cent rounding (30s / 5s).
    assert.ok(drip30 / drip5 > 5 && drip30 / drip5 < 7)
  })

  it('falls back to a tiny slice of visible MZN when no plan residual', () => {
    const drip = microDripMzn({
      remainingPlannedMzn: 0,
      visibleMzn: 10_000,
      nowMs: Date.now(),
      cycleDurationMs: 5_000,
    })
    assert.ok(drip >= 0.01)
    assert.ok(drip < 10_000)
  })

  it('picks cycle lengths inside 5–30s', () => {
    for (let i = 0; i < 40; i++) {
      const ms = randomMznDripCycleMs(() => i / 40)
      assert.ok(ms >= MZN_DRIP_CYCLE_MIN_MS)
      assert.ok(ms <= MZN_DRIP_CYCLE_MAX_MS)
    }
    assert.equal(randomMznDripCycleMs(() => 0), MZN_DRIP_CYCLE_MIN_MS)
    assert.equal(randomMznDripCycleMs(() => 1), MZN_DRIP_CYCLE_MAX_MS)
  })

  it('converts MZN drip to USD at sell Mt/$', () => {
    assert.equal(mznToTransitUsd(84, 84), 1)
    assert.equal(mznToTransitUsd(0, 84), 0)
  })

  it('fills MZN cycle and ZAR ceremony bars over their windows', () => {
    const anchor = 1_000_000
    assert.equal(mznCycleBarPercent(anchor, anchor, 5_000), 0)
    assert.equal(mznCycleBarPercent(anchor + 2500, anchor, 5_000), 50)
    assert.equal(mznCycleBarPercent(anchor + 5000, anchor, 5_000), 100)
    assert.equal(mznCycleBarPercent(anchor + 15_000, anchor, 30_000), 50)
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
