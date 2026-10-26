import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOrderStepMessage,
  clientTotalOf,
  formatZarMoney,
} from './routingStepMessage'
import type { ChannelTicket } from './channelSplit'
import { buildOrderLedger } from './orderLedger'

const eftTickets: ChannelTicket[] = [
  {
    channel: 'eft',
    amountZar: 65_000,
    expectedSettledBy: '2026-10-28T14:00:00.000Z',
    status: 'open',
    economicPaymentId: 'eft-1',
    instructedAt: '2026-10-20T10:00:00.000Z',
  },
  {
    channel: 'eft',
    amountZar: 97_500,
    expectedSettledBy: '2026-10-28T14:00:00.000Z',
    status: 'submitted',
    economicPaymentId: 'eft-2',
    instructedAt: '2026-10-20T10:00:00.000Z',
  },
]

describe('routingStepMessage', () => {
  it('builds Mixed Day-1 card with peer EFT pending rail', () => {
    const ledger = buildOrderLedger({
      zar: 12_024.03,
      sellRate: 4.4257,
      baseCostRate: 4.0617,
      windowZar: 150_000,
      eftTickets: eftTickets.map((t) => ({ amount: t.amountZar, dueIso: t.expectedSettledBy })),
      cardAssignments: [{ cardId: 1, amount: 12_024.03 }],
    })
    const msg = buildOrderStepMessage({
      cycleNumber: 1,
      sentAt: '13:15',
      cardAssignments: [{ cardId: 1, machineId: 2, amount: 12_024.03 }],
      eftTickets,
      orderLedger: ledger,
      sellRate: 4.4257,
      mznInventory: 10_000_000,
    })
    assert.equal(msg.stepNumber, 1)
    assert.equal(msg.clientTotal, clientTotalOf(msg.rails))
    assert.equal(msg.clientTotal, 174_524.03)
    assert.match(msg.summary, /2 rails/)
    assert.ok(!/en route/i.test(JSON.stringify(msg)))
    assert.equal(msg.rails[1]!.steps[0]!.title, 'Instruction 1 pending')
  })

  it('Step 6 keeps settled card rail + pending EFT totals', () => {
    const msg = buildOrderStepMessage({
      cycleNumber: 1,
      sentAt: '23:05',
      cardAssignments: [{ cardId: 1, machineId: 2, amount: 12_024.03 }],
      eftTickets,
      sellRate: 4.4257,
      cardLaneComplete: true,
      invoicesRaised: true,
      swipeTimeLabel: '09:12',
    })
    assert.equal(msg.stepNumber, 6)
    assert.equal(msg.rails[0]!.chip.text, 'Settled')
    assert.ok(msg.rails[0]!.steps.every((s) => s.status === 'done'))
    assert.ok(msg.rails[1]!.steps.every((s) => s.status === 'pending'))
    assert.deepEqual(msg.settlement, {
      settledZar: 12_024.03,
      pendingZar: 162_500,
      totalZar: 174_524.03,
    })
    assert.equal(msg.next.opensIn, 'tomorrow')
    assert.match(msg.summary, /settled on card/)
    assert.match(msg.summary, /EFT pending/)
  })

  it('formats ZAR with two decimals', () => {
    assert.equal(formatZarMoney(162_500), 'R162,500.00')
  })
})
