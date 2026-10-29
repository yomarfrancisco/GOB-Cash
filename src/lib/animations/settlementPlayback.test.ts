import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { settlementPlaybackForTransition } from './settlementPlayback'

describe('settlementPlaybackForTransition', () => {
  it('plays the MZN card when EN ROUTE clears into MZN', () => {
    assert.deepEqual(
      settlementPlaybackForTransition(
        { cashZAR: 100, cashMZN: 500, earnings: 50 },
        { cashZAR: 100, cashMZN: 1_450, earnings: 0 }
      ),
      { affectedCard: 'mzn' }
    )
  })

  it('plays EN ROUTE when ZAR is committed', () => {
    assert.deepEqual(
      settlementPlaybackForTransition(
        { cashZAR: 150, cashMZN: 500, earnings: 0 },
        { cashZAR: 100, cashMZN: 500, earnings: 50 }
      ),
      { affectedCard: 'yieldSurprise' }
    )
  })

  it('plays ZAR when MZN is recycled back to the ZAR card', () => {
    assert.deepEqual(
      settlementPlaybackForTransition(
        { cashZAR: 100, cashMZN: 500, earnings: 0 },
        { cashZAR: 150, cashMZN: 300, earnings: 0 }
      ),
      { affectedCard: 'savings' }
    )
  })

  it('ignores hydration and unrelated wallet changes', () => {
    assert.equal(
      settlementPlaybackForTransition(
        { cashZAR: 100, cashMZN: 500, earnings: 50 },
        { cashZAR: 100, cashMZN: 500, earnings: 0 }
      ),
      null
    )
  })
})
