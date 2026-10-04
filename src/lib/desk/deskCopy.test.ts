import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayDeskBody,
  displayDeskTitle,
  enrichRecycleBodyWithLiveCost,
  executedPillLabel,
  parseDeskZarAmount,
} from './deskCopy'
import { COST_MARKUP_FNB_STD, MZN_ZAR_MARKUP, costMznPerZarForBank } from '@/lib/mznZar'

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

  it('overlays bank-specific live COST Mt on recycle swipe lines', () => {
    // SELL = mid × 1.155. Choose sell so mid = 4, BCI COST = 4.20, FNB = 4.24, BIM = 4.28
    const mid = 4
    const sell = mid * MZN_ZAR_MARKUP
    const fnbCost = costMznPerZarForBank(sell, 'FNB Moz')
    assert.ok(Math.abs(fnbCost - mid * COST_MARKUP_FNB_STD) < 1e-9)

    const body = [
      "Swipe Fri's tickets back into the SA float at COST 4.03.",
      '',
      '- 09h14: Swipe BRICS (FNB Moz) on Imani FNB for R3 854,87',
      '- 10h42: Swipe Ginav (Std Bank Moz) on Wolf and Sons FNB for R5 541,07',
      '- 15h33: Swipe Vidrotec (Millennium BIM) on Imani FNB for R4 281,67',
      '- 13h56: Swipe Wolf (BCI) on Wolf and Sons FNB for R5 315,51',
      '',
      'Total R18,993.12 · 76,000.00 MZN out.',
      '',
      'Status: Awaiting execution',
    ].join('\n')
    const out = enrichRecycleBodyWithLiveCost(body, sell)
    assert.match(out, /at bank COST\./)
    const bricsMt = (Math.round(3854.87 * mid * 1.06 * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    const bimMt = (Math.round(4281.67 * mid * 1.07 * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    const bciMt = (Math.round(5315.51 * mid * 1.05 * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    assert.match(out, new RegExp(`BRICS \\(FNB Moz\\).+\\(=Mt ${bricsMt} @COST\\)`))
    assert.match(out, new RegExp(`Vidrotec \\(Millennium BIM\\).+\\(=Mt ${bimMt} @COST\\)`))
    assert.match(out, new RegExp(`Wolf \\(BCI\\).+\\(=Mt ${bciMt} @COST\\)`))
    assert.match(out, /Total R18,993\.12 · [\d,.]+ MZN out\./)
  })
})
