import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { residualEftOutboundAllowlist } from './residualEftBankEmail'

describe('residualEftBankEmail', () => {
  it('allow-lists the test inbox', () => {
    assert.ok(residualEftOutboundAllowlist().includes('ygor@brics.ninja'))
  })
})
