import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planNextOpenBookings } from './nextOpenBooking'

describe('planNextOpenBookings', () => {
  const dayKey = '2026-11-10'
  const openAtMs = Date.UTC(2026, 10, 10, 7, 0, 0) // 09:00 SAST
  const sellRate = 4.5

  it('books FCFS against a finite reserve, capping each user at R100k', () => {
    const plan = planNextOpenBookings({
      dayKey,
      openAtMs,
      sellRate,
      reservePoolZar: 100_000,
      claims: [
        {
          userId: 'a',
          queueMzn: 3_000_000, // ~R666k want
          queuedAtMs: 1,
          dailyLiquidUsedZar: 0,
          dailyLiquidKey: dayKey,
        },
        {
          userId: 'b',
          queueMzn: 450_000, // ~R100k want
          queuedAtMs: 2,
          dailyLiquidUsedZar: 0,
          dailyLiquidKey: dayKey,
        },
      ],
    })
    assert.equal(plan.bookings[0].userId, 'a')
    assert.equal(plan.bookings[0].bookedZar, 100_000)
    assert.equal(plan.bookings[0].queueRank, 1)
    assert.equal(plan.bookings[1].bookedZar, 0)
    assert.equal(plan.bookings[1].skipped, 'reserve_short')
    assert.equal(plan.bookings[1].queueAheadZar, 100_000)
  })

  it('respects remaining daily liquid when reserve still has room', () => {
    const plan = planNextOpenBookings({
      dayKey,
      openAtMs,
      sellRate,
      reservePoolZar: 100_000,
      claims: [
        {
          userId: 'a',
          queueMzn: 900_000,
          queuedAtMs: 1,
          dailyLiquidUsedZar: 60_000,
          dailyLiquidKey: dayKey,
        },
      ],
    })
    assert.equal(plan.bookings[0].bookedZar, 40_000)
    assert.equal(plan.bookings[0].dailyLeftZar, 40_000)
  })

  it('skips a user who already used the daily cap so the next claimant can book', () => {
    const plan = planNextOpenBookings({
      dayKey,
      openAtMs,
      sellRate,
      reservePoolZar: 100_000,
      claims: [
        {
          userId: 'a',
          queueMzn: 900_000,
          queuedAtMs: 1,
          dailyLiquidUsedZar: 100_000,
          dailyLiquidKey: dayKey,
        },
        {
          userId: 'b',
          queueMzn: 225_000,
          queuedAtMs: 2,
          dailyLiquidUsedZar: 0,
          dailyLiquidKey: dayKey,
        },
      ],
    })
    assert.equal(plan.bookings[0].skipped, 'daily_cap')
    assert.equal(plan.bookings[0].bookedZar, 0)
    assert.equal(plan.bookings[1].bookedZar, 50_000)
  })
})
