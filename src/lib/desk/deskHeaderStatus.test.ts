import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDeskHeaderStatus } from './deskHeaderStatus'
import type { ActivityItem } from '@/store/activity'

function item(partial: Partial<ActivityItem> & Pick<ActivityItem, 'id' | 'title'>): ActivityItem {
  return {
    actor: { type: 'ai', name: 'Desk' },
    createdAt: Date.now(),
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    ...partial,
  }
}

describe('buildDeskHeaderStatus', () => {
  it('shows day, on-track status and window progress', () => {
    const status = buildDeskHeaderStatus(
      {
        status: 'active',
        cycleNumber: 9,
        cycleCount: 14,
        cumulativeDeployed: 175_894,
        availableCapital: 124_106,
      },
      [
        item({
          id: 'step-1',
          title: 'Step 1 · Order · Day 9 of 14',
          cycleNumber: 9,
          awaitingConfirm: true,
          routingAction: 'step',
          status: 'awaiting_execution',
        }),
      ]
    )
    assert.equal(status.dayLabel, 'Day 9 of 14')
    assert.equal(status.statusLabel, 'On track')
    assert.equal(status.statusTone, 'ok')
    assert.ok(status.progressPct > 58 && status.progressPct < 59)
  })

  it('flags review when a card is pending', () => {
    const status = buildDeskHeaderStatus(
      { status: 'active', cycleNumber: 9, cycleCount: 14, cumulativeDeployed: 100_000, availableCapital: 200_000 },
      [
        item({
          id: 'held',
          title: 'Vidrotec is on hold',
          body: 'Ticket came back pending.',
          cycleNumber: 9,
          awaitingConfirm: true,
          routingAction: 'replenish',
          status: 'awaiting_execution',
        }),
      ]
    )
    assert.equal(status.statusLabel, 'Review')
    assert.equal(status.statusTone, 'review')
  })
})
