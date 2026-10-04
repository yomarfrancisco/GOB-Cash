import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayDeskBody, displayDeskTitle, executedPillLabel } from './deskCopy'

describe('desk copy display', () => {
  it('strips Day n of 14 from titles', () => {
    assert.equal(displayDeskTitle('Step 1 · Order · Day 9 of 14'), 'Step 1 · Order')
    assert.equal(displayDeskTitle('Step 5 · Recycle · Day 2 recycle'), 'Step 5 · Recycle')
    assert.equal(displayDeskTitle('Step 4 · Send · Day 3 send'), 'Step 4 · Send')
  })

  it('rewrites legacy sell/restock and hanging day scraps', () => {
    assert.equal(displayDeskTitle('Sell ZAR · Tue, day 3 of 14'), 'Step 4 · Send')
    assert.equal(displayDeskTitle('Sell ZAR · Tue,'), 'Step 4 · Send')
    assert.equal(displayDeskTitle("Restock ZAR at COST · Tuesday's tickets"), 'Step 5 · Recycle')
    assert.equal(displayDeskTitle('FNB approved R120.00'), 'Bank · FNB approved R120.00')
    assert.equal(displayDeskTitle('Next window opened'), 'Window · Opened')
  })

  it('strips leading Day n of 14 from bodies', () => {
    assert.equal(
      displayDeskBody('Day 9 of 14.\nScheduled ZAR order: R20,178.19.'),
      'Scheduled ZAR order: R20,178.19.'
    )
  })

  it('maps completed desk cards to step-specific confirmation pills', () => {
    assert.equal(executedPillLabel({ title: 'Step 1 · Order', routingAction: 'step' }), 'Order posted')
    assert.equal(executedPillLabel({ title: 'Step 2 · Invoice', routingAction: 'step' }), 'Invoices raised')
    assert.equal(executedPillLabel({ title: 'Step 3 · MZN', routingAction: 'step' }), 'MZN covered')
    assert.equal(executedPillLabel({ title: 'Step 4 · Send', routingAction: 'step' }), 'ZAR sent')
    assert.equal(executedPillLabel({ title: 'Step 5 · Recycle', routingAction: 'step' }), 'Card swiped')
    assert.equal(executedPillLabel({ title: 'Sell ZAR · Tue,', routingAction: 'deploy' }), 'ZAR sent')
    assert.equal(executedPillLabel({ title: 'Restock ZAR at COST', routingAction: 'replenish' }), 'Card swiped')
  })
})
