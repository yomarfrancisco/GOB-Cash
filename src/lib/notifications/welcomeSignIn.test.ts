import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  WELCOME_PAGA_DROPDOWN_BODY,
  buildWelcomePagaDeskPayload,
  buildWolfMozaPaymentReference,
  isFirstSignupSession,
} from './welcomeSignIn'

describe('welcomeSignIn', () => {
  it('builds WOLFMOZA payment references with date + sequence', () => {
    const ref = buildWolfMozaPaymentReference(new Date('2026-11-01T12:00:00'))
    assert.match(ref, /^WOLFMOZA20261101\d{3}$/)
  })

  it('structures the desk intro as sentence + ledger tiles', () => {
    const payload = buildWelcomePagaDeskPayload({
      paymentReference: 'WOLFMOZA20261101123',
      userEmail: 'ops@example.com',
    })
    assert.equal(payload.title, 'What is PAGA?')
    assert.match(payload.deskSentence, /liquidity-adaptive dollar/)
    assert.equal(payload.dropdownBody, WELCOME_PAGA_DROPDOWN_BODY)
    assert.ok(payload.dropdownBody.length < 90)
    assert.equal(payload.deskLedgerRows.length, 8)
    assert.equal(payload.deskLedgerRows[0]?.value, 'WOLF DIGITAL, LDA.')
    assert.equal(payload.deskLedgerRows[2]?.value, '4841111710001')
    assert.equal(payload.deskLedgerRows[3]?.value, '003400004841111710132')
    assert.equal(payload.deskLedgerRows[4]?.value, 'MOZAMZMA')
    assert.equal(payload.deskLedgerRows[5]?.value, 'MZ59003400004841111710132')
    assert.equal(payload.deskLedgerRows[6]?.value, 'WOLFMOZA20261101123')
    assert.equal(payload.deskLedgerRows[7]?.value, 'payout@mozpaga.xyz')
    assert.match(payload.deskLedgerRows[7]?.secondLine || '', /ops@example\.com/)
  })

  it('treats only first signup as welcome-eligible', () => {
    const now = new Date()
    assert.equal(
      isFirstSignupSession(
        { metadata: { creationTime: now.toISOString(), lastSignInTime: now.toISOString() } },
        { isNewUser: true }
      ),
      true
    )
    assert.equal(
      isFirstSignupSession({
        metadata: {
          creationTime: '2020-01-01T00:00:00.000Z',
          lastSignInTime: now.toISOString(),
        },
      }),
      false
    )
  })
})
