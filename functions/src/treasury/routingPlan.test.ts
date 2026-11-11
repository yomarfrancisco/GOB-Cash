import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CARD_EFT_OVERLAP_OPERATING_DAYS,
  PLANNED_CARD_DAY_TARGET_ZAR,
  assembleRoutingPlan,
  formatPlanWhenLabel,
  nextLiquidityOpenMs,
  nextOperatingLiquidityOpenMs,
  packDualRailResidual,
  projectOpenCount,
} from './routingPlan'

const MORNING = Date.UTC(2026, 10, 10, 6, 0, 0) // Tue 10 Nov 2026 08:00 SAST

describe('routingPlan', () => {
  it('returns null when there is no residual (fully liquid)', () => {
    const plan = assembleRoutingPlan({
      nowMs: MORNING,
      fundedMzn: 90_000,
      zarLiquid: 20_134.23,
      mznResidual: 0,
      rate: 4.47,
    })
    assert.equal(plan, null)
  })

  it('returns null when funded MZN is empty', () => {
    assert.equal(
      assembleRoutingPlan({
        nowMs: MORNING,
        fundedMzn: 0,
        zarLiquid: 0,
        mznResidual: 1000,
        rate: 4.47,
      }),
      null
    )
  })

  it('packs R1m residual as ~R90k card (3×R30k) + ~R910k EFT T+2 in parallel', () => {
    const residualZar = 1_000_000
    const rate = 4.47
    const mznResidual = residualZar * rate
    const plan = assembleRoutingPlan({
      nowMs: MORNING,
      fundedMzn: mznResidual,
      zarLiquid: 0,
      mznResidual,
      rate,
      plannedDayTargetZar: PLANNED_CARD_DAY_TARGET_ZAR,
      nextOpenAtMs: nextOperatingLiquidityOpenMs(MORNING),
    })
    assert.ok(plan)
    assert.equal(plan!.cardZar, PLANNED_CARD_DAY_TARGET_ZAR * CARD_EFT_OVERLAP_OPERATING_DAYS)
    assert.ok(Math.abs(plan!.eftZar - 910_000) < 0.02)
    const cardLegs = plan!.legs.filter((l) => l.channel === 'card')
    const eftLegs = plan!.legs.filter((l) => l.channel === 'eft')
    assert.equal(cardLegs.length, 3)
    assert.ok(cardLegs.every((l) => l.amountZar <= PLANNED_CARD_DAY_TARGET_ZAR + 0.02))
    assert.equal(eftLegs.length, 1)
    assert.equal(eftLegs[0].chip, 'EFT · T+2')
    assert.match(plan!.sentence, /EFT in parallel/i)
    assert.match(plan!.note, /re-instruct EFT/i)
    assert.ok(!plan!.legs.some((l) => /guaranteed/i.test(l.chip)))
  })

  it('uses planned day target (~R30k), not R100k slices', () => {
    const plan = assembleRoutingPlan({
      nowMs: MORNING,
      fundedMzn: 1_991_000,
      zarLiquid: 0,
      mznResidual: 1_544_000,
      rate: 4.47,
      nextOpenBookedZar: 0,
      nextOpenAtMs: nextOperatingLiquidityOpenMs(MORNING),
    })
    assert.ok(plan)
    const cardLegs = plan!.legs.filter((l) => l.channel === 'card')
    assert.ok(cardLegs.every((l) => l.amountZar <= PLANNED_CARD_DAY_TARGET_ZAR + 0.02))
    assert.ok(plan!.eftZar > 0)
    // Must not invent R100k card days.
    assert.ok(cardLegs.every((l) => l.amountZar < 100_000))
  })

  it('small residual stays card-only (no EFT)', () => {
    const rate = 4.47
    const residualZar = 50_000
    const plan = assembleRoutingPlan({
      nowMs: MORNING,
      fundedMzn: residualZar * rate,
      zarLiquid: 0,
      mznResidual: residualZar * rate,
      rate,
      nextOpenAtMs: nextOperatingLiquidityOpenMs(MORNING),
    })
    assert.ok(plan)
    assert.equal(plan!.eftZar, 0)
    assert.ok(plan!.cardZar > 0)
    assert.ok(plan!.legs.every((l) => l.channel === 'card'))
    assert.equal(plan!.legs.filter((l) => l.channel === 'card').length, 2) // 30k + 20k
  })

  it('marks first card day Reserved when next-open booking covers it', () => {
    const nextOpen = nextOperatingLiquidityOpenMs(MORNING)
    const plan = assembleRoutingPlan({
      nowMs: MORNING,
      fundedMzn: 200_000,
      zarLiquid: 10_000,
      mznResidual: 155_000,
      rate: 4.47,
      nextOpenBookedZar: 30_000,
      nextOpenAtMs: nextOpen,
    })
    assert.ok(plan)
    assert.ok(plan!.legs.some((l) => l.chip === 'Liquid now'))
    const firstCard = plan!.legs.find((l) => l.channel === 'card')
    assert.ok(firstCard)
    assert.equal(firstCard!.chip, 'Reserved for you')
    assert.equal(firstCard!.confidence, 'reserved')
  })

  it('skips Sunday when walking card operating days', () => {
    // Friday morning → opens Fri, Sat, Mon (skip Sun).
    const friMorning = Date.UTC(2026, 10, 13, 6, 0, 0) // Fri 13 Nov 2026 08:00 SAST
    const packed = packDualRailResidual({
      residualZar: 90_000,
      nowMs: friMorning,
      nextOpenAtMs: nextOperatingLiquidityOpenMs(friMorning),
      plannedDayTargetZar: 30_000,
      cardHorizonOperatingDays: 3,
    })
    assert.equal(packed.cardLegs.length, 3)
    const dows = packed.cardLegs.map((l) => {
      const shifted = new Date(l.landsAtMs + 2 * 60 * 60 * 1000)
      return shifted.getUTCDay()
    })
    assert.deepEqual(dows, [5, 6, 1]) // Fri, Sat, Mon
    assert.ok(!dows.includes(0))
  })

  it('packDualRailResidual matches R1m doctrine numbers', () => {
    const packed = packDualRailResidual({
      residualZar: 1_000_000,
      nowMs: MORNING,
      nextOpenAtMs: nextOperatingLiquidityOpenMs(MORNING),
      plannedDayTargetZar: 30_000,
    })
    assert.equal(packed.cardZar, 90_000)
    assert.equal(packed.eftZar, 910_000)
    assert.equal(packed.cardLegs.length, 3)
  })

  it('projects multi-day open counts from daily reserve (fund helper)', () => {
    const opens = projectOpenCount({
      amountZar: 250_000,
      dailyCapZar: 100_000,
      reservePoolZar: 100_000,
      queueAheadZar: 0,
    })
    assert.equal(opens, 3)
  })

  it('formats open labels in SAST', () => {
    const open = nextLiquidityOpenMs(MORNING)
    const label = formatPlanWhenLabel(open)
    assert.match(label, /09:00/)
  })
})
