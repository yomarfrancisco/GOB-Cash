import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MZN_DRIP_CYCLE_MAX_MS,
  MZN_DRIP_CYCLE_MIN_MS,
  SHARED_MZN_DRIP_CYCLE_MS,
  ZAR_CLEAR_CATCHUP_GRACE_MS,
  createInitialOverlay,
  DAILY_LIQUID_ZAR_CAP,
  PLANNED_CARD_DAY_TARGET_ZAR,
  formatPayoutEtaLabel,
  fundCalculatorPayoutLabel,
  fundCalculatorSettlementStatus,
  inventoryBarsArmed,
  inventoryTimeBarPercents,
  lastSettleAt09hSast,
  microDripMzn,
  mznCycleBarPercent,
  mznFastCycleArmed,
  mznToTransitZar,
  nextLiquidBankSendAtMs,
  nextSettleAt09hSastExclusive,
  randomMznDripCycleMs,
  remainingFiveSecondTicksUntil,
  resolveZarClearOverlayAction,
  routingPlanDripCeilingZar,
  sharedDripProgress,
  transitDayBarPercent,
  zarClearBarPercent,
  zarLiquidityJourneyBarPercent,
} from './transitDayClock'
import { sastToUtcMs } from '@/lib/routing/routingTime'

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

  it('holds card amounts steady mid-cycle; only the bar advances', () => {
    const dayStart = lastSettleAt09hSast(Date.now())
    const early = sharedDripProgress({
      walletMzn: 50_000,
      sellMznPerZar: 4.65,
      nowMs: dayStart + SHARED_MZN_DRIP_CYCLE_MS * 3 + 1_000,
    })
    const late = sharedDripProgress({
      walletMzn: 50_000,
      sellMznPerZar: 4.65,
      nowMs: dayStart + SHARED_MZN_DRIP_CYCLE_MS * 3 + 30_000,
    })
    assert.equal(early.drippedMzn, late.drippedMzn)
    assert.equal(early.displayMznOffset, late.displayMznOffset)
    assert.equal(early.displayTransitZarOffset, late.displayTransitZarOffset)
    assert.ok(late.mznCycleBarPercent > early.mznCycleBarPercent)
  })

  it('ZAR journey bar is 0 without a routing-plan residual bound', () => {
    const sell = 4.48
    const pct = zarLiquidityJourneyBarPercent({
      walletMzn: 1_551_788.22,
      drippedZar: 10_000,
      sellMznPerZar: sell,
    })
    assert.equal(pct, 0)
    assert.equal(
      zarLiquidityJourneyBarPercent({
        walletMzn: 1_551_788.22,
        drippedZar: 10_000,
        sellMznPerZar: sell,
        journeyBoundZar: null,
      }),
      0
    )
  })

  it('projects no ZAR drip when residual ceiling is 0 (nothing queued)', () => {
    const sell = 4.48
    const walletMzn = 1_551_788.22
    const dayStart = lastSettleAt09hSast(Date.now())
    const nowMs = dayStart + SHARED_MZN_DRIP_CYCLE_MS * 500
    const none = sharedDripProgress({
      walletMzn,
      sellMznPerZar: sell,
      nowMs,
      sinceMs: dayStart,
      maxDripZar: 0,
    })
    assert.equal(none.displayTransitZarOffset, 0)
    assert.equal(none.drippedMzn, 0)
  })

  it('drip ceiling is planned card day (~R30k), not R100k till or full residual', () => {
    const sell = 4.48
    const queueMzn = 1_551_788.22 // ~R346k residual
    // Live booking wins when present, capped at planned day target.
    assert.equal(
      routingPlanDripCeilingZar({
        queueMzn,
        sellMznPerZar: sell,
        nextOpenBookedZar: 40_000,
      }),
      PLANNED_CARD_DAY_TARGET_ZAR
    )
    assert.equal(
      routingPlanDripCeilingZar({
        queueMzn,
        sellMznPerZar: sell,
        nextOpenBookedZar: 20_000,
      }),
      20_000
    )
    // No booking → journey toward planned card day (~R30k), not R100k.
    const ceiling = routingPlanDripCeilingZar({
      queueMzn,
      sellMznPerZar: sell,
      nextOpenBookedZar: 0,
      reservePoolZar: 0,
      queueAheadZar: 0,
    })
    assert.equal(ceiling, PLANNED_CARD_DAY_TARGET_ZAR)
    assert.ok(ceiling < DAILY_LIQUID_ZAR_CAP)
    assert.ok(ceiling < queueMzn / sell)
    assert.equal(
      routingPlanDripCeilingZar({ queueMzn: 0, sellMznPerZar: sell, nextOpenBookedZar: 0 }),
      0
    )

    const dayStart = lastSettleAt09hSast(Date.now())
    const nowMs = dayStart + SHARED_MZN_DRIP_CYCLE_MS * 500
    const dripped = sharedDripProgress({
      walletMzn: queueMzn,
      sellMznPerZar: sell,
      nowMs,
      sinceMs: dayStart,
      maxDripZar: ceiling,
    })
    assert.ok(dripped.displayTransitZarOffset > 0)
    assert.ok(dripped.displayTransitZarOffset <= ceiling + 0.02)

    const pct = zarLiquidityJourneyBarPercent({
      walletMzn: queueMzn,
      drippedZar: ceiling * 0.48,
      sellMznPerZar: sell,
      journeyBoundZar: ceiling,
    })
    assert.ok(Math.abs(pct - 48) < 0.05)
  })

  it('paces next-open slice from queuedAt → next open (does not fill early)', () => {
    const sell = 4.48
    const ceiling = PLANNED_CARD_DAY_TARGET_ZAR
    const queueMzn = 1_551_788.22
    // Fixed SAST morning: open at 09:00.
    const dayStart = sastToUtcMs(2026, 11, 11, 9, 0)
    const nextOpen = nextSettleAt09hSastExclusive(dayStart + 60_000)
    assert.equal(nextOpen, dayStart + 24 * 60 * 60 * 1000)

    const halfWindow = dayStart + (nextOpen - dayStart) / 2
    // Snap to a completed-cycle boundary so amounts are stable.
    const halfCycles = Math.floor((halfWindow - dayStart) / SHARED_MZN_DRIP_CYCLE_MS)
    const atHalf = dayStart + halfCycles * SHARED_MZN_DRIP_CYCLE_MS
    const mid = sharedDripProgress({
      walletMzn: queueMzn,
      sellMznPerZar: sell,
      nowMs: atHalf + 1_000,
      sinceMs: dayStart,
      maxDripZar: ceiling,
    })
    // ~50% of R100k, not the full residual and not 100% early.
    assert.ok(mid.displayTransitZarOffset > ceiling * 0.4)
    assert.ok(mid.displayTransitZarOffset < ceiling * 0.6)
    assert.ok(mid.mznCycleBarPercent > 0)

    // Final in-window cycle → snap full for this slot and freeze the fast bar.
    const nearOpen = nextOpen - SHARED_MZN_DRIP_CYCLE_MS / 2
    const late = sharedDripProgress({
      walletMzn: queueMzn,
      sellMznPerZar: sell,
      nowMs: nearOpen,
      sinceMs: dayStart,
      maxDripZar: ceiling,
    })
    assert.ok(late.displayTransitZarOffset >= ceiling - 0.02)
    assert.equal(late.mznCycleBarPercent, 0)
  })

  it('freezes fast cycle when next liquidity slot is fully apportioned', () => {
    assert.equal(mznFastCycleArmed({ maxDripZar: 0, drippedZar: 0 }), false)
    assert.equal(mznFastCycleArmed({ maxDripZar: 100_000, drippedZar: 100_000 }), false)
    assert.equal(mznFastCycleArmed({ maxDripZar: 100_000, drippedZar: 99_999 }), true)
    assert.equal(mznFastCycleArmed({ maxDripZar: null, drippedZar: 50_000 }), true)

    const sell = 4.48
    const dayStart = lastSettleAt09hSast(Date.now())
    const nextOpen = nextSettleAt09hSastExclusive(dayStart + 1)
    // Final cycle before open → slot fully apportioned; fast cycle must not spin.
    const full = sharedDripProgress({
      walletMzn: 1_000_000,
      sellMznPerZar: sell,
      nowMs: nextOpen - SHARED_MZN_DRIP_CYCLE_MS / 2,
      sinceMs: dayStart,
      maxDripZar: 10_000,
    })
    assert.ok(full.displayTransitZarOffset >= 10_000 - 0.02)
    assert.equal(full.mznCycleBarPercent, 0)

    // Out-of-sync: dripped already at ceiling mid-window → still frozen.
    assert.equal(
      mznFastCycleArmed({ maxDripZar: 10_000, drippedZar: 10_000 }),
      false
    )
  })

  it('anchors drip to sinceMs so evening residual does not replay the whole day', () => {
    const dayStart = lastSettleAt09hSast(Date.now())
    const evening = dayStart + 10 * 60 * 60 * 1000 // ~19:00 same SAST day
    const landedAt = evening - 2 * 60 * 1000 // arrived 2 minutes ago
    const residual = 1_551_788.22
    const retro = sharedDripProgress({
      walletMzn: residual,
      sellMznPerZar: 4.48,
      nowMs: evening,
    })
    const anchored = sharedDripProgress({
      walletMzn: residual,
      sellMznPerZar: 4.48,
      nowMs: evening,
      sinceMs: landedAt,
    })
    // Unanchored evening book would look like a huge instant convert.
    assert.ok(retro.displayTransitZarOffset > 50_000)
    // Two minutes ≈ a few cycles → only a few rand of projected transit.
    assert.ok(anchored.drippedMzn < 20_000)
    assert.ok(anchored.displayTransitZarOffset < 5_000)
    assert.ok(residual + anchored.displayMznOffset > residual * 0.98)
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

  it('formats payout ETA as ZAR out in m / h / d', () => {
    const now = sastToUtcMs(2026, 11, 10, 10, 0)
    assert.equal(formatPayoutEtaLabel(now + 10_000, now), 'ZAR out in 1m')
    assert.equal(formatPayoutEtaLabel(now + 2 * 60_000, now), 'ZAR out in 2m')
    assert.equal(formatPayoutEtaLabel(now + 3 * 3_600_000, now), 'ZAR out in 3h')
    assert.equal(formatPayoutEtaLabel(now + 26 * 3_600_000, now), 'ZAR out in 2d')
  })

  it('fund calculator: blank at zero; Instant when apportionable; multi-day from reserve', () => {
    const morning = sastToUtcMs(2026, 11, 10, 8, 0)
    assert.equal(
      fundCalculatorPayoutLabel({ amountZar: 0, nowMs: morning, dailyLeftZar: 100_000 }),
      ''
    )
    assert.equal(
      fundCalculatorPayoutLabel({
        amountZar: 50_000,
        nowMs: morning,
        dailyLeftZar: 100_000,
        reservePoolZar: 100_000,
        queueAheadZar: 0,
      }),
      'Instant ZAR payout'
    )
    // Queue already books the whole till — not Instant.
    assert.notEqual(
      fundCalculatorPayoutLabel({
        amountZar: 50_000,
        nowMs: morning,
        dailyLeftZar: 100_000,
        reservePoolZar: 100_000,
        queueAheadZar: 100_000,
      }),
      'Instant ZAR payout'
    )
    // R150k: R100k Instant-capable, R50k at today's 09:15 → ZAR out in 2h
    assert.equal(
      fundCalculatorPayoutLabel({
        amountZar: 150_000,
        nowMs: morning,
        dailyLeftZar: 100_000,
        reservePoolZar: 100_000,
        queueAheadZar: 0,
      }),
      'ZAR out in 2h'
    )
    // Absurd amount cannot clear in 23h — needs many R100k opens.
    const huge = fundCalculatorPayoutLabel({
      amountZar: 20_000_000_000,
      nowMs: morning,
      dailyLeftZar: 100_000,
      reservePoolZar: 100_000,
      queueAheadZar: 0,
    })
    assert.match(huge, /^ZAR out in \d+d$/)
    const days = Number(huge.replace(/\D/g, ''))
    assert.ok(days > 1000)
    assert.equal(nextLiquidBankSendAtMs(morning), sastToUtcMs(2026, 11, 10, 9, 15))
  })

  it('fund calculator settlement: Immediate / tomorrow / later date', () => {
    const morning = sastToUtcMs(2026, 11, 10, 8, 0)
    assert.equal(
      fundCalculatorSettlementStatus({ amountZar: 0, nowMs: morning, dailyLeftZar: 100_000 }),
      null
    )
    assert.deepEqual(
      fundCalculatorSettlementStatus({
        amountZar: 50_000,
        nowMs: morning,
        dailyLeftZar: 100_000,
        reservePoolZar: 100_000,
        queueAheadZar: 0,
      }),
      { kind: 'immediate', label: 'Immediate settlement' }
    )
    // Needs one open after today's instant slice → bank send tomorrow morning.
    const evening = sastToUtcMs(2026, 11, 10, 18, 0)
    assert.deepEqual(
      fundCalculatorSettlementStatus({
        amountZar: 150_000,
        nowMs: evening,
        dailyLeftZar: 100_000,
        reservePoolZar: 100_000,
        queueAheadZar: 0,
      }),
      { kind: 'tomorrow', label: 'Settled tomorrow' }
    )
    const later = fundCalculatorSettlementStatus({
      amountZar: 350_000,
      nowMs: evening,
      dailyLeftZar: 100_000,
      reservePoolZar: 100_000,
      queueAheadZar: 0,
    })
    assert.equal(later?.kind, 'later')
    assert.match(String(later?.label || ''), /^Settled \w{3} \d{1,2} \w{3}$/)
  })
})
