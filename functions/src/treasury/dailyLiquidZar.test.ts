import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clipReserveSplitToDailyLiquid,
  DAILY_LIQUID_ZAR_CAP,
  sastDayKey,
} from './dailyLiquidZar'
import type { ReserveSplitPlan } from './reserveConvert'

function baseSplit(over: Partial<ReserveSplitPlan> = {}): ReserveSplitPlan {
  return {
    destCurrency: 'ZAR',
    wantDest: 200_000,
    totalSource: 900_000,
    reserveAvailable: 200_000,
    instantDest: 168_000,
    routedDest: 32_000,
    instantSource: 756_000,
    routedSource: 144_000,
    ...over,
  }
}

describe('dailyLiquidZar', () => {
  it('exposes the R100k cap', () => {
    assert.equal(DAILY_LIQUID_ZAR_CAP, 100_000)
  })

  it('formats a SAST calendar day key', () => {
    // 2026-11-09 22:00 SAST = 20:00 UTC
    assert.equal(sastDayKey(Date.UTC(2026, 10, 9, 20, 0, 0)), '2026-11-09')
  })

  it('clips instant ZAR above the daily left onto the routed leg', () => {
    const clipped = clipReserveSplitToDailyLiquid(baseSplit(), 100_000)
    assert.equal(clipped.instantDest, 100_000)
    assert.equal(clipped.instantSource, 450_000)
    assert.equal(clipped.routedDest, 100_000)
    assert.equal(clipped.routedSource, 450_000)
  })

  it('routes everything when daily left is zero', () => {
    const clipped = clipReserveSplitToDailyLiquid(baseSplit(), 0)
    assert.equal(clipped.instantDest, 0)
    assert.equal(clipped.instantSource, 0)
    assert.equal(clipped.routedDest, 200_000)
    assert.equal(clipped.routedSource, 900_000)
  })

  it('leaves a split under the cap untouched', () => {
    const split = baseSplit({
      instantDest: 40_000,
      instantSource: 180_000,
      routedDest: 0,
      routedSource: 0,
      wantDest: 40_000,
      totalSource: 180_000,
    })
    assert.deepEqual(clipReserveSplitToDailyLiquid(split, 100_000), split)
  })
})
