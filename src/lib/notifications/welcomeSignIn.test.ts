import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FUND_MZN_ACCOUNT_NUMBER,
  FUND_MZN_BANK,
  FUND_MZN_NOTE,
  FUND_MZN_NOTE_PT,
  FUND_MZN_RECIPIENT,
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

  it('structures the Day-1 fund card around one MZN action', () => {
    const payload = buildWelcomePagaDeskPayload({
      paymentReference: 'WOLFMOZA20261101123',
      userEmail: 'ops@example.com',
      displayName: 'Ygor Francisco',
    })
    assert.equal(payload.title, 'Fund your MZN account')
    assert.match(payload.deskSentence, /^Hi Ygor\./)
    assert.match(payload.deskSentence, /PAGA turns your meticais into rand you can pay out/)
    assert.match(payload.deskSentence, /1\. Send MZN to the account below/)
    assert.match(payload.deskSentence, /first R100,000 each day/)
    assert.match(payload.deskSentence, /09:00 the next day/)
    assert.match(payload.deskSentence, /2\. Tell us where to pay/)
    assert.match(payload.deskSentence, /Routing Manager will ask for your South African bank account once/)
    assert.match(payload.deskSentence, /Your PAGA MZN account:/)
    assert.doesNotMatch(payload.deskSentence, /dollar|USD|24 hours/i)
    assert.equal(payload.dropdownBody, WELCOME_PAGA_DROPDOWN_BODY)
    assert.ok(payload.dropdownBody.length < 90)
    assert.equal(payload.deskLedgerRows.length, 4)
    assert.equal(payload.deskLedgerRows[0]?.value, FUND_MZN_RECIPIENT)
    assert.equal(payload.deskLedgerRows[1]?.value, FUND_MZN_BANK)
    assert.equal(payload.deskLedgerRows[2]?.value, FUND_MZN_ACCOUNT_NUMBER)
    assert.equal(payload.deskLedgerRows[2]?.copyable, true)
    assert.equal(payload.deskLedgerRows[3]?.value, 'WOLFMOZA20261101123')
    assert.equal(payload.deskLedgerRows[3]?.copyable, true)
    assert.equal(payload.deskNote, FUND_MZN_NOTE)
    assert.equal(payload.deskNoteAlt, FUND_MZN_NOTE_PT)
    assert.equal(payload.fundAccountNumber, FUND_MZN_ACCOUNT_NUMBER)
    assert.equal(payload.paymentReference, 'WOLFMOZA20261101123')
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
