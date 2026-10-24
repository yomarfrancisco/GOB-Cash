import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EN_ROUTE_SETTLEMENT_WINDOW_MS } from './enRouteSettlementTimer'
import { resolveEnRouteBook } from './enRouteBook'

describe('resolveEnRouteBook', () => {
  const nowMs = 1_700_000_000_000

  it('prefers a funded earnings wallet', () => {
    const book = resolveEnRouteBook({
      earningsCents: 12_000_00,
      earningsUpdatedAtMs: nowMs - 3_600_000,
      nowMs,
      activity: [
        {
          routingAction: 'replenish',
          awaitingConfirm: false,
          status: 'completed',
          pairedAmountValue: 5000,
          createdAt: nowMs - 60_000,
        },
      ],
    })
    assert.deepEqual(book, {
      bookedAtMs: nowMs - 3_600_000,
      amountCents: 12_000_00,
      source: 'earnings',
    })
  })

  it('falls back to the newest confirmed desk restock', () => {
    const book = resolveEnRouteBook({
      earningsCents: 0,
      earningsUpdatedAtMs: null,
      nowMs,
      activity: [
        {
          routingAction: 'replenish',
          awaitingConfirm: true,
          status: 'awaiting_execution',
          pairedAmountValue: 9000,
          createdAt: nowMs - 60_000,
        },
        {
          routingAction: 'replenish',
          awaitingConfirm: false,
          status: 'completed',
          pairedAmountValue: 5500,
          createdAt: nowMs - 2 * 3_600_000,
          userRepliedAt: nowMs - 2 * 3_600_000 + 30_000,
        },
        {
          title: 'Step 5 · Recycle',
          routingAction: 'step',
          awaitingConfirm: false,
          status: 'completed',
          pairedAmountValue: 4000,
          createdAt: nowMs - 5 * 3_600_000,
        },
      ],
    })
    assert.equal(book?.source, 'desk_restock')
    assert.equal(book?.amountCents, 5500_00)
    assert.equal(book?.bookedAtMs, nowMs - 2 * 3_600_000 + 30_000)
  })

  it('ignores restocks older than the track window', () => {
    const book = resolveEnRouteBook({
      earningsCents: 0,
      earningsUpdatedAtMs: null,
      nowMs,
      activity: [
        {
          routingAction: 'replenish',
          awaitingConfirm: false,
          status: 'completed',
          pairedAmountValue: 5500,
          createdAt: nowMs - EN_ROUTE_SETTLEMENT_WINDOW_MS - 8 * 86_400_000,
        },
      ],
    })
    assert.equal(book, null)
  })
})
