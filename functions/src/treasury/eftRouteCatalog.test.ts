import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ECONOMETRICA_CAPITEC,
  EFT_ROUTES,
  LEMON_FNB_SA,
  selectEftRoute,
  shortInvoiceNumber,
} from './eftRouteCatalog'

describe('eftRouteCatalog', () => {
  it('uses documented SA beneficiary accounts', () => {
    assert.equal(ECONOMETRICA_CAPITEC.accountNumber, '1055902139')
    assert.equal(ECONOMETRICA_CAPITEC.branchCode, '450105')
    assert.equal(LEMON_FNB_SA.accountNumber, '63183630649')
  })

  it('every route has concrete remitter and beneficiary account numbers', () => {
    for (const route of EFT_ROUTES) {
      assert.ok(route.payerAccount.accountNumber.length >= 5, route.key)
      assert.ok(route.beneficiaryBank.accountNumber.length >= 5, route.key)
      assert.ok(route.banker.email.includes('@'), route.key)
    }
  })

  it('selects explicit corridors and rotates otherwise', () => {
    const route = selectEftRoute(Date.now(), 'fnb_mz__brics_ei__lemon_fnb')
    assert.equal(route.key, 'fnb_mz__brics_ei__lemon_fnb')
    assert.equal(route.payerAccount.accountNumber, '4829002310001')
    assert.equal(route.beneficiaryBank.accountNumber, '63183630649')
  })

  it('builds short invoice numbers', () => {
    const n = shortInvoiceNumber(383222.73, Date.parse('2026-11-25T10:00:00+02:00'), 'ECM')
    assert.match(n, /^ECM-EFT-20261125-\d{6}$/)
  })
})
