import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDeskHeaderStatus, progressThroughFocus } from './deskHeaderStatus'
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
  it('shows day and on-track from the focused bubble', () => {
    const t1 = Date.UTC(2026, 9, 3, 8, 0)
    const t2 = Date.UTC(2026, 9, 4, 8, 0)
    const items = [
      item({
        id: 'd8',
        title: 'Step 1 · Order · Day 8 of 14',
        cycleNumber: 8,
        createdAt: t1,
        awaitingConfirm: false,
        routingAction: 'step',
        status: 'completed',
      }),
      item({
        id: 'd9',
        title: 'Step 1 · Order · Day 9 of 14',
        cycleNumber: 9,
        createdAt: t2,
        awaitingConfirm: true,
        routingAction: 'step',
        status: 'awaiting_execution',
      }),
    ]
    const status = buildDeskHeaderStatus(
      { status: 'active', cycleNumber: 9, cycleCount: 14, cumulativeDeployed: 175_894, availableCapital: 124_106 },
      items,
      { focusAt: t1, focusCycle: 8 }
    )
    assert.equal(status.dayLabel, 'Day 8 of 14')
    assert.equal(status.statusLabel, 'On track')
    assert.ok(status.progressPct < buildDeskHeaderStatus(
      { status: 'active', cycleNumber: 9, cycleCount: 14 },
      items,
      { focusAt: t2, focusCycle: 9 }
    ).progressPct)
  })

  it('moves progress through a day as focus advances', () => {
    const base = Date.UTC(2026, 9, 3, 8, 0)
    const items = [0, 1, 2, 3].map((i) =>
      item({
        id: `c-${i}`,
        title: `Step ${i + 1}`,
        cycleNumber: 3,
        createdAt: base + i * 60_000,
        routingAction: 'step',
        status: i < 3 ? 'completed' : 'awaiting_execution',
      })
    )
    const early = progressThroughFocus(items, base, 3, 14)
    const late = progressThroughFocus(items, base + 3 * 60_000, 3, 14)
    assert.ok(late > early)
  })

  it('shows Planned when the desk is in simulation mode', () => {
    const status = buildDeskHeaderStatus(
      { status: 'active', cycleNumber: 9, cycleCount: 14, deskMode: 'planned' },
      [
        item({
          id: 'open',
          title: 'Step 1 · Order',
          cycleNumber: 9,
          awaitingConfirm: true,
          routingAction: 'step',
          status: 'awaiting_execution',
        }),
      ],
      { focusAt: null, focusCycle: 9, planned: true }
    )
    assert.equal(status.statusLabel, 'Planned')
    assert.equal(status.statusTone, 'planned')
  })
})
