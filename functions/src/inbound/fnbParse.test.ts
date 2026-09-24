import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseFnbCardSpend, parseFnbReceipt } from './fnbParse'

const SPEND =
  'FNB :-) R395.00 reserved for purchase @ M2 Aesthetic Studio from Current a/c..630649 using card..8948. 24Sep 10:36'

const RECEIPT = `:-) FNB Receipt
BRICS AI
01-09-2026 20:34:31
Customer Copy
Approved
UTI:
8848407e-4295-4031-870c-
68b70cab6165
RRN: 04Yfge032002
Auth Code: 893796
Visa Debit
441279******0922
Total: R 4000.00
Purchase R 4000.00`

describe('FNB notices', () => {
  it('reads a reserved SA card purchase from the subject', () => {
    const spend = parseFnbCardSpend(SPEND)
    assert.equal(spend?.amountZar, 395)
    assert.equal(spend?.merchant, 'M2 Aesthetic Studio')
    assert.equal(spend?.accountLast4, '0649')
    assert.equal(spend?.cardLast4, '8948')
    assert.equal(spend?.status, 'reserved')
    assert.equal(spend?.reservedOn, '24Sep 10:36')
  })

  it('reads an approved FNB conversion receipt', () => {
    const receipt = parseFnbReceipt(RECEIPT)
    assert.equal(receipt?.amountZar, 4000)
    assert.equal(receipt?.status, 'approved')
    assert.equal(receipt?.cardLast4, '0922')
    assert.equal(receipt?.rrn, '04Yfge032002')
    assert.equal(receipt?.authCode, '893796')
    assert.equal(receipt?.uti, '8848407e-4295-4031-870c-68b70cab6165')
    assert.equal(receipt?.merchant, 'BRICS AI')
  })

  it('ignores mail that is neither notice', () => {
    assert.equal(parseFnbCardSpend('hi'), null)
    assert.equal(parseFnbReceipt('hello from gmail'), null)
  })
})
