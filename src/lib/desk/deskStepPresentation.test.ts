import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ActivityItem } from '@/store/activity'
import {
  dedupeDeskStepCards,
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

  it('repairs dropdown stubs into desk sentences', () => {
    assert.equal(
      deskDisplaySentence(
        item({ id: '4', title: 'Step 3 · MZN', body: 'MZN covered — Next 24h to send', createdAt: 1 })
      ),
      'MZN cover is on the books, sized at the sell rate.'
    )
    assert.equal(
      deskDisplaySentence(
        item({ id: '5', title: 'Step 4 · Send', body: 'R12,024.03 send', deskStep: 4, createdAt: 1 })
      ),
      'ZAR sold for MZN by COB, once the cover landed.'
    )
  })

  it('dedupes stacked step cards for the same run/cycle/step', () => {
    const out = dedupeDeskStepCards([
      item({
        id: 'old',
        title: 'Step 3 · MZN',
        deskStep: 3,
        testRunId: 't1',
        cycleNumber: 1,
        createdAt: 100,
      }),
      item({
        id: 'new',
        title: 'Step 3 · MZN',
        deskStep: 3,
        testRunId: 't1',
        cycleNumber: 1,
        createdAt: 200,
      }),
      item({ id: 'bank', title: 'Other movements', createdAt: 150 }),
    ])
    assert.equal(out.length, 2)
    assert.ok(out.some((row) => row.id === 'new'))
    assert.ok(out.some((row) => row.id === 'bank'))
    assert.ok(!out.some((row) => row.id === 'old'))
  })
})
