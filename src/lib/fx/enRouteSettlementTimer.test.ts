import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  enRouteSettlementTimer,
  formatEnRouteDuration,
  nextSettleAt09hSast,
  parseWalletUpdatedAtMs,
} from './enRouteSettlementTimer'
import { sastParts, sastToUtcMs } from '@/lib/routing/routingTime'

describe('enRouteSettlementTimer', () => {
  it('targets the next 09:00 SAST after the book', () => {
    const bookedAtMs = sastToUtcMs(2026, 10, 25, 14, 30, 0) // 14:30 SAST
    const settleAtMs = nextSettleAt09hSast(bookedAtMs)
    const settleParts = sastParts(settleAtMs)
    assert.equal(settleParts.hour, 9)
    assert.equal(settleParts.minute, 0)
    assert.equal(settleParts.day, 26)

    const mid = enRouteSettlementTimer({
      balanceCents: 5500_00,
      bookedAtMs,
      settleAtMs,
      nowMs: bookedAtMs + 60 * 60 * 1000,
    })
    assert.equal(mid.state, 'on_time')
    assert.ok(mid.fillPercent > 50)
  })

  it('marks delayed past 09:00 SAST', () => {
    const bookedAtMs = sastToUtcMs(2026, 10, 24, 10, 0, 0)
    const settleAtMs = nextSettleAt09hSast(bookedAtMs)
    const late = enRouteSettlementTimer({
      balanceCents: 5500_00,
      bookedAtMs,
      settleAtMs,
      nowMs: settleAtMs + 2 * 60 * 60 * 1000 + 15 * 60_000,
    })
    assert.equal(late.state, 'delayed')
    assert.equal(late.label, '+2h 15m')
  })

  it('stays idle with no balance', () => {
    assert.equal(
      enRouteSettlementTimer({
        balanceCents: 0,
        bookedAtMs: Date.now(),
        nowMs: Date.now(),
      }).state,
      'idle'
    )
  })

  it('formats durations and parses updatedAt', () => {
    assert.equal(formatEnRouteDuration(45 * 60_000), '45m')
    assert.equal(parseWalletUpdatedAtMs({ toMillis: () => 1_700_000_000_000 }), 1_700_000_000_000)
  })
})
