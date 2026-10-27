import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertOrderLedger,
  buildOrderLedger,
  coverVsSaleLine,
  formatMznMoney,
  formatRate4,
  formatZarMoney,
  sellMznForZar,
} from './orderLedger'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

describe('orderLedger', () => {
  it('keeps sell/cost/spread consistent at 4dp display rates', () => {
    const ledger = buildOrderLedger({
      zar: 12_024.03,
      sellRate: 4.4257,
      baseCostRate: 4.0617,
      windowZar: 150_000,
      eftTickets: [
        { amount: 65_000 },
        { amount: 97_500 },
      ],
    })
    assert.equal(ledger.mznAtSell, sellMznForZar(12_024.03, 4.4257))
    assert.equal(ledger.mznAtSell, round2(12_024.03 * 4.4257))
    assert.equal(ledger.mznAtCost, round2(12_024.03 * 4.0617))
    assert.equal(ledger.spreadMzn, round2(ledger.mznAtSell - ledger.mznAtCost))
    assert.equal(ledger.eftZar, 162_500)
    assert.equal(ledger.clientTotal, 174_524.03)
    assert.equal(ledger.windowLeftZar, round2(150_000 - 12_024.03))
    assert.equal(assertOrderLedger(ledger, { soft: true }).length, 0)
    assert.equal(formatRate4(ledger.spreadPerZar), formatRate4(4.4257 - ledger.costRate))
  })

  it('states cover vs sale when rates differ', () => {
    const ledger = buildOrderLedger({
      zar: 12_024.03,
      sellRate: 4.4257,
      baseCostRate: 4.0617,
      coverSellRate: 4.4422,
    })
    const line = coverVsSaleLine(ledger)
    assert.ok(line)
    assert.match(line!, /Cover sized at 4\.4422/)
    assert.match(line!, /sold at 4\.4257/)
  })

  it('formats desk money', () => {
    assert.equal(formatZarMoney(162_500), 'R162,500.00')
    assert.equal(formatMznMoney(53_215.24), '53,215.24 MZN')
  })
})
