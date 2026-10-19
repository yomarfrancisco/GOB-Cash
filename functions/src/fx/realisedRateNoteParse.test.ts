import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRealisedRateNote } from './realisedRateNoteParse'

describe('parseRealisedRateNote', () => {
  it('parses a Cursor balance-photo note for Moza', () => {
    const note = parseRealisedRateNote(
      'Balance photo delta (Cursor)\nMoza account dropped 43.748,54 MZN on a 10.500,00 ZAR swipe.',
      'Realised rate Moza balance photo'
    )
    assert.ok(note)
    assert.equal(note!.bankId, 'moza')
    assert.equal(note!.amountZar, 10500)
    assert.equal(note!.amountMzn, 43748.54)
    assert.equal(note!.source, 'balance_photo')
  })

  it('parses compact ZAR/MZN pair for BCI', () => {
    const note = parseRealisedRateNote('BCI realised rate 8000 ZAR / 32440.00 MZN', 'FX rate observation')
    assert.ok(note)
    assert.equal(note!.bankId, 'bci')
    assert.equal(note!.amountZar, 8000)
    assert.equal(note!.amountMzn, 32440)
  })

  it('ignores unrelated mail', () => {
    assert.equal(parseRealisedRateNote('hello', 'weekly newsletter'), null)
  })
})
