import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  conversionStoryFromWalletTransition,
  settlementPlaybackForTransition,
} from './settlementPlayback'

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

  it('infers clear-to-ZAR story with amount', () => {
    const story = conversionStoryFromWalletTransition(
      { cashZAR: 100, cashMZN: 500, earnings: 50 },
      { cashZAR: 150, cashMZN: 500, earnings: 0 }
    )
    assert.equal(story?.kind, 'clear_to_zar')
    assert.equal(story?.instant?.amount, 50)
  })

  it('infers partial_liquid when residual MZN remains after reserve convert', () => {
    const story = conversionStoryFromWalletTransition(
      { cashZAR: 0, cashMZN: 2_000_000, earnings: 0 },
      { cashZAR: 100_000, cashMZN: 1_550_000, earnings: 0 }
    )
    assert.equal(story?.kind, 'partial_liquid')
    assert.equal(story?.sourceCard, 'mzn')
    assert.equal(story?.instant?.card, 'savings')
    assert.equal(story?.instant?.amount, 100_000)
  })

  it('infers reserve_only when MZN fully converts', () => {
    const story = conversionStoryFromWalletTransition(
      { cashZAR: 0, cashMZN: 40_000, earnings: 0 },
      { cashZAR: 10_000, cashMZN: 0, earnings: 0 }
    )
    assert.equal(story?.kind, 'reserve_only')
    assert.equal(story?.instant?.amount, 10_000)
  })
})
