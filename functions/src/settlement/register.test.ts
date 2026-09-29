import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseFnbSettlement } from './fnbSettlement'
import {
  BUYER_CARDS,
  RAILS,
  buyerByCardLast4,
  companyOf,
  railByMachineId,
  railByMerchantId,
  resolveMerchantDescriptor,
} from './register'

describe('settlement register', () => {
  it('maps four rails to Lemon, Imani, Lemon Capitec and Wolf', () => {
    assert.equal(railByMachineId(1)?.companyId, 'lemon_economics')
    assert.equal(railByMachineId(2)?.companyId, 'imani')
    assert.equal(railByMachineId(3)?.companyId, 'lemon_economics')
    assert.equal(railByMachineId(4)?.companyId, 'wolf_and_sons')
    assert.equal(railByMerchantId('150000001004090')?.id, 'lemon_fnb')
    assert.equal(railByMerchantId('100000002904331')?.descriptor, 'WandSons')
    assert.equal(railByMerchantId('000000103951778')?.acquirer, 'capitec')
  })

  it('resolves legacy BRICS AI descriptors to Lemon Economics', () => {
    assert.equal(resolveMerchantDescriptor('*BRICS AI (PTY) LTD')?.id, 'lemon_economics')
    assert.equal(resolveMerchantDescriptor('BRICS AI')?.id, 'lemon_economics')
    assert.equal(companyOf('lemon_economics').formerLegalName, 'BRICS AI (Pty) Ltd')
  })

  it('maps buyer cards including Multivendas trading as GINAV', () => {
    assert.equal(buyerByCardLast4('8871')?.companyId, 'multivendas')
    assert.equal(companyOf('multivendas').tradingAs, 'GINAV')
    assert.equal(buyerByCardLast4('0922')?.shortName, 'Goblin')
    assert.equal(buyerByCardLast4('0955')?.shortName, 'Wolf')
    assert.equal(BUYER_CARDS.filter((row) => row.deskCardId === 1).length, 2)
  })

  it('keeps House of Exports off every rail', () => {
    assert.equal(
      RAILS.some((row) => row.companyId === 'house_of_exports'),
      false
    )
    assert.equal(companyOf('house_of_exports').kind, 'upstream_supplier')
  })
})

describe('FNB settlement parse', () => {
  it('reads gross settled amount and month-end fee note inputs', () => {
    const text = `
Merchant Number: 150000001004090
Merchant Name: *BRICS AI (PTY) LTD
Outlet Number: 100000002757978
Statement Date: 01/09/2026
Settled Amount 31,000.00 775.00 116.25
67368744 D 4871 0 04Yfge031004
20260901140200 441279******0922 CR 11,000.00 0.00 0 548406 0 74067246244171590295282 2 275.00 41.25
`
    const settlement = parseFnbSettlement(text)
    assert.ok(settlement)
    assert.equal(settlement!.settledGrossZar, 31000)
    assert.equal(settlement!.zarAvailableZar, 31000)
    assert.equal(settlement!.commissionZar, 775)
    assert.equal(settlement!.vatZar, 116.25)
    assert.equal(settlement!.merchantNumber, '150000001004090')
  })
})
