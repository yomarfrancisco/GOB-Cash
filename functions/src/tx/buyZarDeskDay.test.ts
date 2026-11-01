import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUY_DESK_TITLES } from './buyZarDeskDay'
import { channelMixOf, splitReplacementChannels } from '../routing/channelSplit'

describe('buyZarDeskDay titles', () => {
  it('keeps the closed Buy ZAR title matrix', () => {
    assert.equal(BUY_DESK_TITLES[1], 'Step 1 · MZN funded')
    assert.equal(BUY_DESK_TITLES[2], 'Step 2 · FX invoices raised')
    assert.equal(BUY_DESK_TITLES[3], 'Step 3 · ZAR booked')
    assert.equal(BUY_DESK_TITLES[4], 'Step 4 · Clear ROUTE')
    assert.equal(BUY_DESK_TITLES[5], 'Step 5 · Place ZAR')
    assert.equal(BUY_DESK_TITLES[6], 'Step 6 · Day lookback')
  })
})

describe('buy Step 2 rail from plan split', () => {
  it('uses card-only for small buys', () => {
    const split = splitReplacementChannels({ amountZar: 10_000, shockId: 't1' })
    assert.equal(channelMixOf(split), 'card')
    assert.ok(split.cardZar > 0)
    assert.equal(split.eftZar, 0)
  })
})
