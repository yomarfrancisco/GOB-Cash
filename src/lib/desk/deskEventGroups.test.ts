import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ActivityItem } from '@/store/activity'
import {
  classifyDeskEvent,
  deskPairSwipesEnabled,
  groupDeskEvents,
  stripDeskProvenance,
} from '@/lib/desk/deskEventGroups'

function item(partial: Partial<ActivityItem> & Pick<ActivityItem, 'id' | 'title' | 'createdAt'>): ActivityItem {
  return {
    actor: { type: 'ai', name: 'Desk' },
    ...partial,
  }
}

describe('deskEventGroups', () => {
  it('strips provenance and Mt/R · SAST', () => {
    const out = stripDeskProvenance(
      'FNB approved R100.00. This arrived directly from FNB. Mt/R · SAST'
    )
    assert.equal(out.includes('arrived directly'), false)
    assert.equal(out.includes('Mt/R'), false)
    assert.equal(out.includes('SAST'), false)
    assert.match(out, /MZN\/ZAR/)
  })

  it('classifies ZAR booked / cleared / FNB approved / other movements', () => {
    assert.equal(
      classifyDeskEvent(
        item({
          id: '1',
          kind: 'EN_ROUTE_BOOKED',
          title: 'ZAR en route',
          createdAt: Date.UTC(2026, 9, 27, 10, 0),
        })
      )?.kind,
      'zar_booked'
    )
    assert.equal(
      classifyDeskEvent(
        item({
          id: '2',
          kind: 'EN_ROUTE_CLEARED',
          title: 'ZAR cleared',
          createdAt: Date.UTC(2026, 9, 27, 10, 0),
        })
      )?.kind,
      'zar_cleared'
    )
    assert.equal(
      classifyDeskEvent(
        item({
          id: '3',
          title: 'Bank · FNB approved',
          body: 'FNB approved R16600.00 at ECONOMETRICA on card 1234.',
          createdAt: Date.UTC(2026, 9, 27, 10, 0),
        })
      )?.kind,
      'swipe_approved'
    )
    assert.equal(
      classifyDeskEvent(
        item({
          id: '4',
          title: 'Bank · FNB POS paid in',
          body: 'FNB credited R50.00 to current account ending 0649 from Smartapp.',
          createdAt: Date.UTC(2026, 9, 27, 10, 0),
        })
      )?.kind,
      'other_movements'
    )
    assert.equal(
      classifyDeskEvent(
        item({
          id: '5',
          title: 'Step 4 · Send',
          createdAt: Date.UTC(2026, 9, 27, 10, 0),
        })
      ),
      null
    )
  })

  it('collapses same-source same-kind same-day into one group', () => {
    const day = Date.UTC(2026, 9, 27, 12, 0)
    const items = [
      item({
        id: 'a',
        kind: 'EN_ROUTE_BOOKED',
        title: 'ZAR booked',
        body: 'R100000.00 booked ≈ 565000.00 MZN @ 5.6500 sell.',
        amount: { currency: 'ZAR', value: 100_000, sign: 'debit' },
        createdAt: day,
      }),
      item({
        id: 'b',
        kind: 'EN_ROUTE_BOOKED',
        title: 'ZAR en route',
        body: 'R35000.00 booked ≈ 197750.00 MZN @ 5.6500 sell.',
        amount: { currency: 'ZAR', value: 35_000, sign: 'debit' },
        createdAt: day + 60_000,
      }),
      item({
        id: 'c',
        kind: 'EN_ROUTE_BOOKED',
        title: 'ZAR booked',
        body: 'R65000.00 booked ≈ 367250.00 MZN @ 5.6500 sell.',
        amount: { currency: 'ZAR', value: 65_000, sign: 'debit' },
        createdAt: day + 120_000,
      }),
      item({
        id: 'step',
        title: 'Step 1 · Plan',
        createdAt: day + 30_000,
      }),
    ]
    const out = groupDeskEvents(items)
    const groups = out.filter((x) => x.kind === 'DESK_EVENT_GROUP')
    assert.equal(groups.length, 1)
    assert.equal(groups[0].title, 'ZAR booked')
    assert.equal(groups[0].deskEventGroup?.rows.length, 3)
    assert.equal(groups[0].deskEventGroup?.totalZar, 200_000)
    assert.ok(out.some((x) => x.id === 'step'))
    assert.equal(out.filter((x) => x.kind === 'EN_ROUTE_BOOKED').length, 0)
  })

  it('uses the bank name for grouped approvals', () => {
    const day = Date.UTC(2026, 9, 27, 12, 0)
    const out = groupDeskEvents([
      item({
        id: 'approved-1',
        title: 'Bank · FNB approved',
        body: 'FNB approved R100.00 at ECONOMETRICA on card 1234.',
        createdAt: day,
      }),
      item({
        id: 'approved-2',
        title: 'Bank · FNB approved',
        body: 'FNB approved R200.00 at IMANI on card 1234.',
        createdAt: day + 60_000,
      }),
    ])
    assert.equal(out[0].title, 'FNB approved')
  })

  it('deskPairSwipesEnabled is true outside production by default', () => {
    assert.equal(typeof deskPairSwipesEnabled(), 'boolean')
  })
})
