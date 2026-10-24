import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveEnRouteBook } from './enRouteBook'
import { nextSettleAt09hSast } from './enRouteSettlementTimer'

describe('resolveEnRouteBook', () => {
  const nowMs = 1_700_000_000_000

  it('prefers a funded earnings wallet with settleAt', () => {
    const settleAtMs = nextSettleAt09hSast(nowMs - 3_600_000)
    const book = resolveEnRouteBook({
      earningsCents: 12_000_00,
      earningsUpdatedAtMs: nowMs - 3_600_000,
      earningsSettleAtMs: settleAtMs,
      nowMs,
      activity: [],
    })
    assert.equal(book?.source, 'earnings')
    assert.equal(book?.amountCents, 12_000_00)
    assert.equal(book?.settleAtMs, settleAtMs)
  })

  it('falls back to the newest confirmed desk restock', () => {
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
          createdAt: nowMs - 2 * 3_600_000,
          userRepliedAt: nowMs - 2 * 3_600_000 + 30_000,
        },
      ],
    })
    assert.equal(book?.source, 'desk_restock')
    assert.equal(book?.amountCents, 5500_00)
  })
})
