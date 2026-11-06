import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MZN_DRIP_CYCLE_MAX_MS,
  MZN_DRIP_CYCLE_MIN_MS,
  SHARED_MZN_DRIP_CYCLE_MS,
  ZAR_CLEAR_CATCHUP_GRACE_MS,
  createInitialOverlay,
  inventoryBarsArmed,
  inventoryTimeBarPercents,
  lastSettleAt09hSast,
  microDripMzn,
  mznCycleBarPercent,
  mznToTransitZar,
  randomMznDripCycleMs,
  remainingFiveSecondTicksUntil,
  resolveZarClearOverlayAction,
  sharedDripProgress,
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

  it('picks cycle lengths inside 20–50s', () => {
    for (let i = 0; i < 40; i++) {
      const ms = randomMznDripCycleMs(() => i / 40)
      assert.ok(ms >= MZN_DRIP_CYCLE_MIN_MS)
      assert.ok(ms <= MZN_DRIP_CYCLE_MAX_MS)
    }
    assert.equal(randomMznDripCycleMs(() => 0), MZN_DRIP_CYCLE_MIN_MS)
    assert.equal(randomMznDripCycleMs(() => 1), MZN_DRIP_CYCLE_MAX_MS)
  })

  it('converts MZN drip to ZAR at sell Mt/R', () => {
    assert.equal(mznToTransitZar(4.65, 4.65), 1)
    assert.equal(mznToTransitZar(0, 4.65), 0)
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

  it('starts live ceremony inside the grace window and catch-up resets after miss', () => {
    const lastNine = 1_000_000
    assert.equal(
      resolveZarClearOverlayAction({
        nowMs: lastNine + 5_000,
        lastNineMs: lastNine,
        lastNineHandledMs: 0,
        transitZarDelta: 1200,
        zarCeremonyActive: false,
      }),
      'start_ceremony'
    )
    assert.equal(
      resolveZarClearOverlayAction({
        nowMs: lastNine + ZAR_CLEAR_CATCHUP_GRACE_MS + 1,
        lastNineMs: lastNine,
        lastNineHandledMs: 0,
        transitZarDelta: 1200,
        zarCeremonyActive: false,
      }),
      'instant_reset'
    )
    assert.equal(
      resolveZarClearOverlayAction({
        nowMs: lastNine + 60_000,
        lastNineMs: lastNine,
        lastNineHandledMs: lastNine,
        transitZarDelta: 1200,
        zarCeremonyActive: false,
      }),
      'none'
    )
    assert.equal(
      resolveZarClearOverlayAction({
        nowMs: lastNine + 60_000,
        lastNineMs: lastNine,
        lastNineHandledMs: 0,
        transitZarDelta: 0,
        zarCeremonyActive: false,
      }),
      'none'
    )
  })

  it('shared drip is identical for the same wallet + clock on every client', () => {
    const dayStart = lastSettleAt09hSast(Date.now())
    const nowMs = dayStart + SHARED_MZN_DRIP_CYCLE_MS * 12 + 10_000
    const a = sharedDripProgress({
      walletMzn: 100_000,
      sellMznPerZar: 4.65,
      nowMs,
    })
    const b = sharedDripProgress({
      walletMzn: 100_000,
      sellMznPerZar: 4.65,
      nowMs,
    })
    assert.deepEqual(a, b)
    assert.ok(a.drippedMzn > 0)
    assert.equal(a.displayMznOffset, -a.drippedMzn)
    assert.equal(a.displayTransitZarOffset, mznToTransitZar(a.drippedMzn, 4.65))
    // Inventory @ sell conserved: dripped MZN becomes transit R.
    const before = 100_000 / 4.65
    const after = (100_000 + a.displayMznOffset) / 4.65 + a.displayTransitZarOffset
    assert.ok(Math.abs(before - after) < 0.02)
  })

  it('keeps inventory bars empty until MZN or ZAR book is funded', () => {
    const now = Date.now()
    const overlay = createInitialOverlay(now, () => 0)
    assert.equal(inventoryBarsArmed({ walletMzn: 0, walletZar: 0, walletTransitZar: 0 }), false)
    const empty = inventoryTimeBarPercents({
      nowMs: now,
      walletMzn: 0,
      walletZar: 0,
      walletTransitZar: 0,
      overlay,
    })
    assert.deepEqual(empty, { mznBarPercent: 0, transitBarPercent: 0, zarBarPercent: 0 })

    const mznOnly = inventoryTimeBarPercents({
      nowMs: now + 2_500,
      walletMzn: 10_000,
      walletZar: 0,
      walletTransitZar: 0,
      overlay: { ...overlay, mznCycleAnchorMs: now, mznCycleDurationMs: 5_000 },
    })
    assert.equal(mznOnly.mznBarPercent, 50)
    // Day bar lives on the ZAR card — idle until liquid or in-route ZAR exists.
    assert.equal(mznOnly.transitBarPercent, 0)
    assert.equal(mznOnly.zarBarPercent, 0)

    const zarBook = inventoryTimeBarPercents({
      nowMs: now + 2_500,
      walletMzn: 0,
      walletZar: 100,
      walletTransitZar: 50,
      overlay,
    })
    assert.equal(zarBook.mznBarPercent, 0)
    assert.ok(zarBook.transitBarPercent > 0)
    assert.ok(zarBook.zarBarPercent > 0)
  })
})
