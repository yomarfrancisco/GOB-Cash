import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFxDeskView } from './fxDeskModel'
import type { ActivityItem } from '@/store/activity'

function item(partial: Partial<ActivityItem> & Pick<ActivityItem, 'id' | 'title'>): ActivityItem {
  return {
    actor: { type: 'ai', name: 'Desk' },
    createdAt: Date.UTC(2026, 9, 3, 8, 0),
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    ...partial,
  }
}

describe('buildFxDeskView', () => {
  it('parses restock swipe rows into still-to-run tickets', () => {
    const view = buildFxDeskView({
      fullName: 'Ygor Francisco',
      summary: { cycleNumber: 9, cycleCount: 14, cumulativeDeployed: 175_894, availableCapital: 124_106 },
      items: [
        item({
          id: 'restock-1',
          title: 'Step 5 · Recycle · Day 9',
          routingAction: 'replenish',
          status: 'awaiting_execution',
          body: [
            "Swipe Mon's tickets back into the SA float at COST 4.12.",
            '',
            '- 09h20: Swipe BRICS (FNB Moz) on Imani FNB for R5 338,83',
            '- 11h07: Swipe Vidrotec (Millennium BIM) on Wolf and Sons FNB for R5 987,20',
            '- 13h18: Swipe Goblin (BCI) on Imani FNB for R5 233,25',
            '',
            'Total R16,559.28 · 68,000.00 MZN out.',
            'Status: Awaiting execution',
          ].join('\n'),
          createdAt: Date.now(),
        }),
      ],
    })
    assert.match(view.greeting, /Good /)
    assert.equal(view.badge.label, 'On track')
    assert.equal(view.tickets.length, 3)
    assert.equal(view.tickets[0]?.status, 'next')
    assert.equal(view.tickets[0]?.timeLabel, '09:20')
    assert.equal(view.tickets[0]?.cardName, 'BRICS')
    assert.match(view.tickets[0]?.amountLabel || '', /R5/)
  })
})
