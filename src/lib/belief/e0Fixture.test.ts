import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertE0FixtureSafe,
  E0_FIXTURE_MOMENTS,
  E0_ISOLATION,
} from './e0Fixture'

describe('E0 fixture isolation', () => {
  it('never claims production IO', () => {
    assert.equal(E0_ISOLATION.readsProductionRouteEvidence, false)
    assert.equal(E0_ISOLATION.writesEvidence, false)
    assert.equal(E0_ISOLATION.mutatesInvoicesWalletsRoutesDecisions, false)
    assert.equal(E0_ISOLATION.callsLivePlanner, false)
    assert.equal(E0_ISOLATION.callsLlm, false)
    assert.equal(E0_ISOLATION.usesProductionBankMail, false)
  })

  it('contains the corrected seven-step sequence with settled vs recovered wording', () => {
    assert.equal(E0_FIXTURE_MOMENTS.length, 7)
    assert.deepEqual(
      E0_FIXTURE_MOMENTS.map((m) => m.id),
      ['authorised', 'captured', 'delayed', 'zar_available', 'under_review', 'recovered', 'reversed']
    )
    assert.equal(E0_FIXTURE_MOMENTS[3].lifecycle, 'settled')
    assert.equal(E0_FIXTURE_MOMENTS[3].label, 'Settled evidence')
    assert.equal(E0_FIXTURE_MOMENTS[5].lifecycle, 'recovered')
    assert.equal(E0_FIXTURE_MOMENTS[6].controlAction.kind, 'reduce_to')
    assertE0FixtureSafe()
  })

  it('uses the required Sam copy for key moments', () => {
    const byId = Object.fromEntries(E0_FIXTURE_MOMENTS.map((m) => [m.id, m]))
    assert.match(byId.captured.samBody, /captured.*ZAR has not settled/i)
    assert.match(byId.delayed.samBody, /interruption/i)
    assert.match(byId.zar_available.samBody, /not a bank-balance estimate/i)
    assert.match(byId.under_review.samBody, /under review/i)
    assert.match(byId.recovered.samBody, /earlier review remains/i)
    assert.match(byId.reversed.samBody, /reducing the next proposed payment/i)
  })
})
