import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { E0_FIXTURE_MOMENTS, E0_ISOLATION, assertE0FixtureSafe } from './e0Fixture'

describe('E0 fixture isolation', () => {
  it('never claims production IO', () => {
    assert.equal(E0_ISOLATION.readsProductionRouteEvidence, false)
    assert.equal(E0_ISOLATION.writesEvidence, false)
    assert.equal(E0_ISOLATION.mutatesInvoicesWalletsRoutesDecisions, false)
    assert.equal(E0_ISOLATION.callsLivePlanner, false)
    assert.equal(E0_ISOLATION.callsLlm, false)
    assert.equal(E0_ISOLATION.usesProductionBankMail, false)
    assert.equal(E0_ISOLATION.namespace, 'e0_preview_fixture_v1')
  })

  it('contains the corrected seven-step sequence with settled vs recovered wording', () => {
    assert.equal(E0_FIXTURE_MOMENTS.length, 7)
    assert.deepEqual(
      E0_FIXTURE_MOMENTS.map((m) => m.id),
      ['authorised', 'captured', 'delayed', 'zar_available', 'under_review', 'recovered', 'reversed']
    )
    assert.equal(E0_FIXTURE_MOMENTS.find((m) => m.id === 'zar_available')?.lifecycle, 'settled')
    assert.equal(E0_FIXTURE_MOMENTS.find((m) => m.id === 'zar_available')?.label, 'Settled evidence')
    assert.equal(E0_FIXTURE_MOMENTS.find((m) => m.id === 'recovered')?.lifecycle, 'recovered')
    assert.equal(E0_FIXTURE_MOMENTS.find((m) => m.id === 'recovered')?.label, 'Recovered')
    assertE0FixtureSafe()
  })

  it('uses the required Sam copy for key moments', () => {
    const byId = Object.fromEntries(E0_FIXTURE_MOMENTS.map((m) => [m.id, m.samBody]))
    assert.match(byId.captured, /captured, but the ZAR has not settled yet/)
    assert.match(byId.delayed, /interruption, not as evidence that the route has recovered/)
    assert.match(byId.zar_available, /R8,000 settled as usable ZAR/)
    assert.match(byId.under_review, /under review\. I’m holding this route/)
    assert.match(byId.recovered, /reopens the route for assessment/)
    assert.match(byId.reversed, /later reversed/)
  })
})
