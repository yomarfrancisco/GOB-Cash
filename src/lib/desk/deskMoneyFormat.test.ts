import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatDeskMajorZar, parseDeskMoneyToken } from './deskMoneyFormat'

describe('parseDeskMoneyToken', () => {
  it('parses en-ZA Paid ledger without inflating to millions', () => {
    assert.equal(parseDeskMoneyToken('R100\u00a0000,00'), 100000)
    assert.equal(parseDeskMoneyToken('R100 000,00'), 100000)
    assert.equal(formatDeskMajorZar(parseDeskMoneyToken('R100 000,00')!), 'R 100 000')
  })

  it('parses en-US and MZN tokens', () => {
    assert.equal(parseDeskMoneyToken('R100,000.00'), 100000)
    assert.equal(parseDeskMoneyToken('436,660.13 MZN'), 436660.13)
    assert.equal(parseDeskMoneyToken('Mt 3 054 000'), 3054000)
  })
})
