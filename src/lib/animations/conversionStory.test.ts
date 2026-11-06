import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { storyFromConversionResult } from './conversionStory'

describe('storyFromConversionResult', () => {
  it('plans reserve-only buy ZAR', () => {
    const story = storyFromConversionResult({
      destination: 'ZAR',
      amountZAR: 10_067.1,
      amountMZN: 45_000,
      reserveInstantZar: 10_067.1,
      reserveRoutedZar: 0,
      enRoute: false,
    })
    assert.equal(story?.kind, 'reserve_only')
    assert.equal(story?.sourceCard, 'mzn')
    assert.equal(story?.instant?.card, 'savings')
    assert.equal(story?.instant?.amount, 10_067.1)
  })

  it('plans split buy ZAR', () => {
    const story = storyFromConversionResult({
      destination: 'ZAR',
      amountZAR: 60_000,
      amountMZN: 270_000,
      reserveInstantZar: 30_000,
      reserveRoutedZar: 30_000,
      enRoute: true,
    })
    assert.equal(story?.kind, 'split')
    assert.equal(story?.instant?.amount, 30_000)
    assert.equal(story?.routed?.amount, 30_000)
  })

  it('plans route-only when no reserve', () => {
    const story = storyFromConversionResult({
      destination: 'ZAR',
      amountZAR: 10_000,
      amountMZN: 45_000,
      reserveInstantZar: 0,
      reserveRoutedZar: 10_000,
      enRoute: true,
    })
    assert.equal(story?.kind, 'route_only')
    assert.equal(story?.routed?.amount, 10_000)
  })
})
