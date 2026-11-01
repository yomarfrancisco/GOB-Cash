import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildWelcomePagaBody, buildWolfMozaPaymentReference } from './welcomeSignIn'

describe('welcomeSignIn', () => {
  it('builds WOLFMOZA payment references with date + sequence', () => {
    const ref = buildWolfMozaPaymentReference(new Date('2026-11-01T12:00:00'))
    assert.match(ref, /^WOLFMOZA20261101\d{3}$/)
  })

  it('includes Moza funding details and payout email instruction', () => {
    const body = buildWelcomePagaBody({
      paymentReference: 'WOLFMOZA20261101123',
      userEmail: 'ops@example.com',
    })
    assert.match(body, /liquidity-adaptive dollar/)
    assert.match(body, /4841111710001/)
    assert.match(body, /003400004841111710132/)
    assert.match(body, /WOLFMOZA20261101123/)
    assert.match(body, /payout@mozpaga\.xyz/)
    assert.match(body, /ops@example\.com/)
  })
})
