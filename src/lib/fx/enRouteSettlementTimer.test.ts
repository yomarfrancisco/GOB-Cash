import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EN_ROUTE_SETTLEMENT_WINDOW_MS,
  enRouteSettlementTimer,
  formatEnRouteDuration,
  parseWalletUpdatedAtMs,
} from './enRouteSettlementTimer'

describe('enRouteSettlementTimer', () => {
  const bookedAtMs = 1_700_000_000_000

  it('stays idle with no balance or book time', () => {
    assert.equal(
      enRouteSettlementTimer({ balanceCents: 0, bookedAtMs, nowMs: bookedAtMs }).state,
      'idle'
    )
    assert.equal(
      enRouteSettlementTimer({ balanceCents: 5000, bookedAtMs: null, nowMs: bookedAtMs }).state,
      'idle'
    )
  })

  it('drains the fill toward settlement inside the 18h window', () => {
    const mid = enRouteSettlementTimer({
      balanceCents: 5500_00,
      bookedAtMs,
      nowMs: bookedAtMs + EN_ROUTE_SETTLEMENT_WINDOW_MS / 2,
    })
    assert.equal(mid.state, 'on_time')
    assert.equal(mid.fillPercent, 50)
    assert.equal(mid.label, '9h 00m')
    assert.match(mid.ariaLabel, /Settlement expected in 9h 00m/)
  })

  it('marks delayed past the window with a thin amber fill', () => {
    const late = enRouteSettlementTimer({
      balanceCents: 5500_00,
      bookedAtMs,
      nowMs: bookedAtMs + EN_ROUTE_SETTLEMENT_WINDOW_MS + 2 * 60 * 60 * 1000 + 15 * 60_000,
    })
    assert.equal(late.state, 'delayed')
    assert.equal(late.fillPercent, 8)
    assert.equal(late.label, '+2h 15m')
  })

  it('formats short and long durations', () => {
    assert.equal(formatEnRouteDuration(45 * 60_000), '45m')
    assert.equal(formatEnRouteDuration(11 * 3_600_000 + 20 * 60_000), '11h 20m')
  })

  it('parses wallet updatedAt shapes', () => {
    assert.equal(parseWalletUpdatedAtMs(null), null)
    assert.equal(parseWalletUpdatedAtMs(bookedAtMs), bookedAtMs)
    assert.equal(parseWalletUpdatedAtMs({ toMillis: () => bookedAtMs }), bookedAtMs)
    assert.equal(parseWalletUpdatedAtMs({ seconds: bookedAtMs / 1000 }), bookedAtMs)
    assert.equal(parseWalletUpdatedAtMs(new Date(bookedAtMs).toISOString()), bookedAtMs)
  })
})
