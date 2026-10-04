import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayDeskBody,
  displayDeskTitle,
  enrichRecycleBodyWithLiveCost,
  executedPillLabel,
  parseDeskZarAmount,
} from './deskCopy'

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

  it('parses desk ZAR amounts with en-ZA and en-US separators', () => {
    assert.equal(parseDeskZarAmount('R3 854,87'), 3854.87)
    assert.equal(parseDeskZarAmount('R3,854.87'), 3854.87)
    assert.equal(parseDeskZarAmount('R3854.87'), 3854.87)
  })

  it('overlays live COST Mt on recycle swipe lines and the total', () => {
    const body = [
      'Swipe Fri\'s tickets back into the SA float at COST 4.03.',
      '',
      '- 09h14: Swipe BRICS (FNB Moz) on Imani FNB for R3 854,87',
      '- 10h42: Swipe Ginav (Std Bank Moz) on Wolf and Sons FNB for R5 541,07',
      '',
      'Total R9,395.94 · 37,865.64 MZN out.',
      '',
      'Status: Awaiting execution',
    ].join('\n')
    const out = enrichRecycleBodyWithLiveCost(body, 4.03)
    assert.match(out, /at COST 4\.03\./)
    assert.match(
      out,
      /- 09h14: Swipe BRICS \(FNB Moz\) on Imani FNB for R3 854,87 \(=Mt 15 535\.13 @COST\)/
    )
    assert.match(
      out,
      /- 10h42: Swipe Ginav \(Std Bank Moz\) on Wolf and Sons FNB for R5 541,07 \(=Mt 22 330\.51 @COST\)/
    )
    assert.match(out, /Total R9,395\.94 · 37,865\.64 MZN out\./)
  })

  it('refreshes a previously enriched recycle body when COST moves', () => {
    const body =
      '- 09h14: Swipe BRICS (FNB Moz) on Imani FNB for R3 854,87 (=Mt 15 000.00 @COST)\nTotal R3,854.87 · 15,000.00 MZN out.'
    const out = enrichRecycleBodyWithLiveCost(body, 4.1)
    assert.match(out, /\(=Mt 15 804\.97 @COST\)/)
    assert.match(out, /Total R3,854\.87 · 15,804\.97 MZN out\./)
  })
})
