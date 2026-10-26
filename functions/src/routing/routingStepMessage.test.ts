import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOrderStepMessage,
  clientTotalOf,
  formatZarMoney,
} from './routingStepMessage'
import type { ChannelTicket } from './channelSplit'

const eftTickets: ChannelTicket[] = [
  {
    channel: 'eft',
    amountZar: 81_250,
    expectedSettledBy: '2026-10-22T14:00:00.000Z',
    status: 'open',
    economicPaymentId: 'eft-1',
    instructedAt: '2026-10-20T10:00:00.000Z',
  },
  {
    channel: 'eft',
    amountZar: 81_250,
    expectedSettledBy: '2026-10-22T14:00:00.000Z',
    status: 'submitted',
    economicPaymentId: 'eft-2',
    instructedAt: '2026-10-20T10:00:00.000Z',
  },
]

describe('routingStepMessage', () => {
  it('builds Mixed Day-1 card with peer EFT rail and reconciling total', () => {
    const msg = buildOrderStepMessage({
      cycleNumber: 1,
      sentAt: '13:15',
      cardAssignments: [{ cardId: 1, machineId: 2, amount: 12_024.03 }],
      eftTickets,
      sellRate: 4.442,
      mznInventory: 10_000_000,
    })
    assert.equal(msg.stepNumber, 1)
    assert.equal(msg.stepName, 'Order')
    assert.equal(msg.rails.length, 2)
    assert.equal(msg.rails[0]!.kind, 'card')
    assert.equal(msg.rails[1]!.kind, 'eft')
    assert.equal(msg.rails[0]!.total, 12_024.03)
    assert.equal(msg.rails[1]!.total, 162_500)
    assert.equal(msg.clientTotal, clientTotalOf(msg.rails))
    assert.equal(msg.clientTotal, 174_524.03)
    assert.match(msg.summary, /2 rails/)
    assert.match(msg.summary, /EFT lands T\+2/)
    assert.ok(!msg.summary.includes('EN ROUTE still open'))
    assert.equal(msg.rails[1]!.chip.text, 'T+2 · 2 tickets')
    assert.equal(msg.rails[0]!.steps.some((s) => s.title === 'Swipe planned'), true)
  })

  it('omits EN ROUTE residual and keeps EFT inside the plan', () => {
    const msg = buildOrderStepMessage({
      cycleNumber: 1,
      sentAt: '13:15',
      cardAssignments: [{ cardId: 1, machineId: 2, amount: 12_024.03 }],
      eftTickets,
      sellRate: 4.44,
    })
    const blob = JSON.stringify(msg)
    assert.ok(!/EN ROUTE still open/i.test(blob))
    assert.ok(msg.rails.some((r) => r.kind === 'eft' && r.total === 162_500))
  })

  it('Step 6 marks card lane complete while EFT stays pending', () => {
    const msg = buildOrderStepMessage({
      cycleNumber: 1,
      sentAt: '13:16',
      cardAssignments: [{ cardId: 1, machineId: 2, amount: 12_024.03 }],
      eftTickets,
      sellRate: 4.442,
      cardLaneComplete: true,
      invoicesRaised: true,
    })
    assert.equal(msg.stepNumber, 6)
    assert.equal(msg.stepName, 'What happened')
    assert.ok(msg.rails[0]!.steps.every((s) => s.status === 'done'))
    assert.equal(msg.rails[0]!.chip.text, 'Settled')
    assert.ok(msg.rails[1]!.steps.every((s) => s.status === 'en_route'))
    assert.ok(msg.rails[1]!.steps.every((s) => /pending|delayed|settled/i.test(s.title)))
    assert.ok(!/en route/i.test(JSON.stringify(msg.rails)))
    assert.deepEqual(msg.settlement, {
      settledZar: 12_024.03,
      pendingZar: 162_500,
      totalZar: 174_524.03,
    })
    assert.equal(msg.next.opensIn, 'tomorrow')
    assert.equal(msg.next.dayLabel, 'Day 2')
  })

  it('formats ZAR with two decimals', () => {
    assert.equal(formatZarMoney(162_500), 'R162,500.00')
  })
})
