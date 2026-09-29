import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCapitecSettlement } from './capitecSettlement'
import { parseCapitecReceipt } from './capitecParse'

const SUMMARY = `Merchant Settlement Summary
BRICS AI
Payout on 18 August 2026
Overview
Total paid out: R5 872.35
Sales
R5 872.35
Transaction period
17/08/26, 21:02 - 17/08/26, 21:02
Reference
CAPITEC 1808PosSettle 260817
Merchant ID
000000103951778
Transaction details
On terminal NN184154
R5 872.35
Date
Type
Card
Amount
Commission
VAT (15%)
Total
17/08/26, 21:02
Sale
Debit
R6 000.00
- R111.00
- R16.65
R5 872.35
`

describe('Capitec settlement summary', () => {
  it('reads the net payout, the sale, and the fee', () => {
    const settlement = parseCapitecSettlement(SUMMARY)
    assert.ok(settlement)
    assert.equal(settlement.paidOutZar, 5872.35)
    assert.equal(settlement.salesZar, 6000)
    assert.equal(settlement.commissionZar, 111)
    assert.equal(settlement.vatZar, 16.65)
    assert.equal(settlement.transactionCount, 1)
    assert.equal(settlement.reference, 'CAPITEC 1808PosSettle 260817')
    assert.equal(settlement.merchantId, '000000103951778')
    assert.equal(settlement.merchant, 'BRICS AI')
    assert.equal(settlement.payoutOn, '18 August 2026')
  })

  it('does not treat a card-sale receipt as a settlement', () => {
    assert.equal(parseCapitecSettlement('Card sale\nStatus\nAPPROVED\nR10 000.00'), null)
    assert.equal(parseCapitecReceipt(SUMMARY), null)
  })
})
