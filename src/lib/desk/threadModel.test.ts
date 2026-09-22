import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDeskThread, buildNextStep, hasLiveStep, isDeskYes, latestPendingWrite } from './threadModel'

function item(extra: Record<string, unknown> & { id: string; title: string }) {
  return {
    actor: { type: 'ai', name: 'Sam' },
    createdAt: 1_000,
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    ...extra,
  } as Parameters<typeof buildDeskThread>[0][number]
}

describe('FX Desk thread', () => {
  it('puts the operator on the right and Sam on the left', () => {
    const rows = buildDeskThread([
      item({
        id: 'ask-1',
        title: 'Record outcome',
        body: 'Capitec declined. Leftover will move on the next live pair.',
        userReply: 'Capitec declined',
        routingAction: 'proposal',
        awaitingProposalAccept: true,
        createdAt: 2_000,
      }),
    ])
    assert.equal(rows[0].kind, 'chat')
    if (rows[0].kind !== 'chat') return
    assert.equal(rows[0].speaker, 'you')
    assert.equal(rows[1].kind, 'chat')
    if (rows[1].kind !== 'chat') return
    assert.equal(rows[1].speaker, 'sam')
    assert.equal(rows[1].pendingConfirm, true)
    assert.match(rows[1].text, /Save that into this window/)
  })

  it('keeps a completed cycle as a day card, not an editable instruction', () => {
    const rows = buildDeskThread([
      item({
        id: 'c2',
        title: 'Sell ZAR · Cycle 2',
        body: 'Pay R10,000 after MZN has reflected.\nZAR kept in South Africa after this payout: R40,000 of R50,000.',
        status: 'completed',
        routingAction: 'deploy',
        cycleNumber: 2,
        amount: { currency: 'ZAR', value: 10_000, sign: 'debit' },
        createdAt: 3_000,
      }),
    ])
    assert.equal(rows[0].kind, 'day')
    if (rows[0].kind !== 'day') return
    assert.match(rows[0].title, /Cycle 2/)
    assert.equal(rows[0].recommendedZar, 10_000)
    assert.equal(rows[0].heldZar, 40_000)
  })

  it('puts the clock on the next-step card and leaves yes for writes', () => {
    const awaiting = item({
      id: 'open',
      title: 'Sell ZAR · Cycle 3',
      body: 'Pay R10,000 after MZN has reflected.',
      awaitingConfirm: true,
      routingAction: 'deploy',
      cycleNumber: 3,
      amount: { currency: 'ZAR', value: 10_000, sign: 'debit' },
    })
    const next = buildNextStep([awaiting])
    assert.equal(next.clock, 'sent')
    assert.equal(next.clockLabel, "I've sent ZAR")
    assert.equal(hasLiveStep(next), true)
    assert.equal(isDeskYes('yes'), true)
    assert.equal(latestPendingWrite([awaiting]), null)
    const rows = buildDeskThread([awaiting])
    assert.equal(rows.length, 1)
    if (rows[0].kind !== 'chat') return
    assert.match(rows[0].text, /Pay R10,000/)
  })
})
