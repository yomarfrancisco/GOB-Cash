import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertOrderLedger,
  buildOrderLedger,
  coverVsSaleLine,
  formatMznMoney,
  formatRate4,
  formatZarMoney,
} from './orderLedger'

describe('orderLedger', () => {
  it('builds consistent sell/cost/spread from unrounded rates', () => {
    const ledger = buildOrderLedger({
      zar: 12_024.03,
      sellRate: 4.4258,
      baseCostRate: 4.0618,
      eftZar: 162_500,
    })
    assert.equal(ledger.zar, 12_024.03)
    assert.equal(ledger.mznAtSell, round2(12_024.03 * 4.4258))
    assert.equal(ledger.mznAtCost, round2(12_024.03 * 4.0618))
    assert.equal(ledger.spreadMzn, round2(ledger.mznAtSell - ledger.mznAtCost))
    assert.ok(Math.abs(ledger.spreadPerZar - (4.4258 - ledger.costRate)) < 1e-9)
    assert.equal(ledger.clientTotal, 174_524.03)
    assertOrderLedger(ledger)
  })

  it('states cover vs sale surplus when rates differ', () => {
    const ledger = buildOrderLedger({
      zar: 12_024.03,
      sellRate: 4.4258,
      baseCostRate: 4.0618,
      coverSellRate: 4.4422,
    })
    const line = coverVsSaleLine(ledger)
    assert.ok(line)
    assert.match(line!, /Cover sized at 4\.4422/)
    assert.match(line!, /sold at 4\.4258/)
    assert.match(line!, /MZN surplus/)
  })

  it('formats money and rates for the desk', () => {
    assert.equal(formatZarMoney(162_500), 'R162,500.00')
    assert.equal(formatMznMoney(53_215.24), '53,215.24 MZN')
    assert.equal(formatRate4(4.4258), '4.4258')
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
