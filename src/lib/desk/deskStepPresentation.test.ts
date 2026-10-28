import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ActivityItem } from '@/store/activity'
import {
  deskDisplaySentence,
  inferredDeskStatusChip,
  isDeskStepItem,
  ledgerRowsFromOrderLedger,
} from '@/lib/desk/deskStepPresentation'

function item(partial: Partial<ActivityItem> & Pick<ActivityItem, 'id' | 'title' | 'createdAt'>): ActivityItem {
  return {
    actor: { type: 'ai', name: 'Desk' },
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    ...partial,
  }
}

describe('deskStepPresentation', () => {
  it('detects step cards and infers chips', () => {
    assert.equal(
      isDeskStepItem(item({ id: '1', title: 'Step 5 · Recycle', routingAction: 'replenish', createdAt: 1 })),
      true
    )
    assert.equal(
      inferredDeskStatusChip(
        item({ id: '2', title: 'Step 5 · Recycle', status: 'completed', routingAction: 'replenish', createdAt: 1 })
      ),
      'Swiped'
    )
  })

  it('rebuilds Step 4 ledger rows from orderLedger', () => {
    const rows = ledgerRowsFromOrderLedger(
      item({
        id: '3',
        title: 'Step 4 · Send',
        deskStep: 4,
        createdAt: 1,
        orderLedger: {
          zar: 12024.03,
          sellRate: 5.65,
          mznAtSell: 67935.77,
          costRate: 5.2,
          mznAtCost: 62524.96,
          spreadMzn: 5410.81,
          spreadPerZar: 0.45,
          windowZar: 300000,
          windowLeftZar: 287975.97,
        },
      })
    )
    assert.ok(rows)
    assert.equal(rows![0].label, 'Sold')
    assert.match(rows![0].value, /R12,024\.03/)
  })

  it('falls back to body when deskSentence is empty', () => {
    assert.equal(
      deskDisplaySentence(
        item({ id: '4', title: 'Step 3 · MZN', body: 'MZN cover is on the books.', createdAt: 1 })
      ),
      'MZN cover is on the books.'
    )
  })
})
