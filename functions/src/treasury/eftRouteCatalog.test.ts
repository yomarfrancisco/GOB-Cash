import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EFT_ROUTES, selectEftRoute, shortInvoiceNumber } from './eftRouteCatalog'

describe('eftRouteCatalog', () => {
  it('always beneficiaries Econometrica Capitec with known account', () => {
    for (const route of EFT_ROUTES) {
      assert.equal(route.beneficiaryBank.accountNumber, '1055902139')
      assert.match(route.beneficiaryCompany.legalName, /Econometrica/)
      assert.equal(route.beneficiaryCompany.registrationNumber, '2026/785154/07')
    }
  })

  it('rotates routes on weekdays and accepts explicit keys', () => {
    const monday = Date.parse('2026-11-23T10:00:00+02:00') // Mon
    const a = selectEftRoute(monday)
    const b = selectEftRoute(monday, 'fnb_mz__econometrica_capitec')
    assert.ok(a.key)
    assert.equal(b.key, 'fnb_mz__econometrica_capitec')
    assert.equal(b.banker.key, 'fnb_mz')
  })

  it('builds short invoice numbers', () => {
    const n = shortInvoiceNumber(383222.73, Date.parse('2026-11-25T10:00:00+02:00'))
    assert.match(n, /^ECM-EFT-20261125-\d{6}$/)
  })
})
