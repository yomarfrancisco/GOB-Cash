import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeBankDetails, parseZarPayoutSubject } from './firstPayoutHelpers'

describe('firstPayoutFlow helpers', () => {
  it('parses ZAR Payout subject handles', () => {
    assert.equal(parseZarPayoutSubject('ZAR Payout alice'), 'alice')
    assert.equal(parseZarPayoutSubject('ZAR Payout @Bob_1'), 'bob_1')
    assert.equal(parseZarPayoutSubject('Fund notice'), null)
  })

  it('detects SA bank detail messages', () => {
    assert.equal(
      looksLikeBankDetails('FNB\nAccount holder: Jane Doe\nAccount: 62812345678'),
      true
    )
    assert.equal(looksLikeBankDetails('what is my liquidity?'), false)
    assert.equal(looksLikeBankDetails('Capitec 1050123456'), true)
  })
})
