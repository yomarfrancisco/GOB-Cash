import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCapitecReceipt } from './capitecParse'

const RECEIPT = `Approved
Approved

Transaction
007849518254
Date
01/09/2026
Time
15:34:26

BRICS AI
R10 000.00

Description
Card sale
Status
APPROVED
Card number
428670******6696
Authorization ID
949089
Channel
POS`

describe('Capitec conversion receipt', () => {
  it('reads an approved card sale', () => {
    const receipt = parseCapitecReceipt(RECEIPT)
    assert.equal(receipt?.amountZar, 10000)
    assert.equal(receipt?.merchant, 'BRICS AI')
    assert.equal(receipt?.cardLast4, '6696')
    assert.equal(receipt?.status, 'approved')
    assert.equal(receipt?.transactionNumber, '007849518254')
    assert.equal(receipt?.authCode, '949089')
    assert.equal(receipt?.occurredAt, '01/09/2026 15:34:26')
  })

  it('does not add a declined sale', () => {
    const receipt = parseCapitecReceipt(RECEIPT.replace('Status\nAPPROVED', 'Status\nDECLINED'))
    assert.equal(receipt?.status, 'declined')
  })

  it('ignores an FNB receipt', () => {
    assert.equal(parseCapitecReceipt(':-) FNB Receipt\nTotal: R 4000.00'), null)
  })
})
