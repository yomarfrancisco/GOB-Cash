import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyFnbEvent, liquidityDeltaZar } from './fnbApply'
import {
  bankNoticeCopy,
  classifyPosReceiptStatus,
  parseFnbCardSpend,
  parseFnbPosCredit,
  parseFnbReceipt,
  parseMerchantPosReceipt,
} from './fnbParse'

const SPEND =
  'FNB :-) R395.00 reserved for purchase @ M2 Aesthetic Studio from Current a/c..630649 using card..8948. 24Sep 10:36'

const POS_CREDIT =
  'FNB :-) R12000.00 paid to Current a/c..043559 @ Gts Cibffce1 Txn Cibffce1 Txn. Ref.Speedpoint67390368fn. 20Oct 04:31'

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

const DECLINED_IMANI = `First National Bank, a division of FirstRand Bank Limited. Reg No. 1929/001225/06.
An Authorised Financial Services and Credit Provider (NCRCP20).

:-) FNB Receipt

imani

14-10-2026 14:19:59
Customer Copy
Declined

UTI:
c6e12857-105b-4e05-b14a-
c60a73e34f4b
RRN: 04YiSx005001
Auth Code: 000000
Visa Card
429960******8594
Total: R 10000.00
Purchase R 10000.00`

const DECLINED_WANDSONS = `:-) FNB Receipt

WandSons

14-10-2026 15:45:18
Customer Copy
Declined

UTI:
4b5a50f6-62fb-4fe7-87fa-
81a6a6962748
RRN: 04YlJQ004001
Auth Code: 000000
Visa Debit
441279******0922
Total: R 1200.00
Purchase R 1200.00`

const DECLINED_ECONOMETRICA = `Declined
Payment systems inoperative

Transaction
007992578611
Date
14/10/2026
Time
10:55:05

ECONOMETRICA
R5 518.00

Description
Sale
Status
DECLINED
Card number
441279******0955
Channel
POS
AID
A0000000031010
EMV Application label
Visa`

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

  it('classifies FNB declines before footer Authorised / Approved words', () => {
    const imani = parseFnbReceipt(DECLINED_IMANI)
    assert.equal(imani?.status, 'declined')
    assert.equal(imani?.amountZar, 10000)
    assert.equal(imani?.cardLast4, '8594')
    assert.equal(imani?.authCode, '000000')
    assert.equal(imani?.merchant, 'imani')
    const copy = bankNoticeCopy(imani!, false)
    assert.match(copy.title, /declined/i)
    assert.doesNotMatch(copy.title, /approved/i)
    assert.match(copy.body, /ZAR card unchanged/i)

    const wand = parseFnbReceipt(DECLINED_WANDSONS)
    assert.equal(wand?.status, 'declined')
    assert.equal(wand?.amountZar, 1200)
    assert.equal(wand?.cardLast4, '0922')
    assert.equal(liquidityDeltaZar(wand!), 0)
    const float = applyFnbEvent(null, wand!, '0922')
    assert.equal(float.receiptedZar, 0)
  })

  it('reads Econometrica-style merchant POS declines', () => {
    assert.equal(parseFnbReceipt(DECLINED_ECONOMETRICA), null)
    const slip = parseMerchantPosReceipt(DECLINED_ECONOMETRICA)
    assert.equal(slip?.status, 'declined')
    assert.equal(slip?.amountZar, 5518)
    assert.equal(slip?.cardLast4, '0955')
    assert.equal(slip?.merchant, 'ECONOMETRICA')
    assert.equal(slip?.transactionNumber, '007992578611')
    assert.match(slip?.declineReason || '', /Payment systems inoperative/i)
    assert.equal(slip?.noticeBank, 'POS')
    const copy = bankNoticeCopy(slip!, true)
    assert.match(copy.title, /POS declined/i)
    assert.equal(liquidityDeltaZar(slip!), 0)
  })

  it('treats Auth 000000 as declined even if Approved also appears', () => {
    assert.equal(classifyPosReceiptStatus('Customer Copy\nApproved\nAuth Code: 000000', '000000'), 'declined')
  })

  it('reads a Gmail forward of the same reservation', () => {
    const spend = parseFnbCardSpend(`Fwd: ${SPEND}`)
    assert.equal(spend?.amountZar, 395)
    assert.equal(spend?.merchant, 'M2 Aesthetic Studio')
    const copy = bankNoticeCopy(spend!, true)
    assert.ok(!/arrived directly from FNB/i.test(copy.body))
    assert.ok(!/forwarded from Gmail/i.test(copy.body))
    assert.match(copy.body, /····8948/)
    assert.equal(copy.bankTag, 'FNB')
    assert.equal(copy.bankNoticeClass, 'other')
  })

  it('adds an approved conversion and subtracts a reservation', () => {
    const spend = parseFnbCardSpend(SPEND)
    const receipt = parseFnbReceipt(RECEIPT)
    assert.equal(liquidityDeltaZar(spend!), -395)
    assert.equal(liquidityDeltaZar(receipt!), 4000)
    assert.equal(liquidityDeltaZar({ ...receipt!, status: 'declined' }), 0)
    const approvedFloat = applyFnbEvent(null, receipt!, '0922')
    assert.equal(approvedFloat.receiptedZar, 4000)
  })

  it('ignores mail that is neither notice', () => {
    assert.equal(parseFnbCardSpend('hi'), null)
    assert.equal(parseFnbReceipt('hello from gmail'), null)
    assert.equal(parseFnbPosCredit('hi'), null)
    assert.equal(parseMerchantPosReceipt('hello'), null)
  })

  it('reads a Speedpoint POS credit into a current account', () => {
    const credit = parseFnbPosCredit(POS_CREDIT)
    assert.equal(credit?.kind, 'pos_credit')
    assert.equal(credit?.amountZar, 12000)
    assert.equal(credit?.accountLast4, '3559')
    assert.match(credit!.counterparty, /Gts Cibffce1/i)
    assert.equal(credit?.reference, 'Speedpoint67390368fn')
    assert.equal(credit?.paidOn, '20Oct 04:31')
    assert.equal(liquidityDeltaZar(credit!), 12000)
    const copy = bankNoticeCopy(credit!, false)
    assert.match(copy.title, /POS paid in/i)
    assert.match(copy.body, /3559/)
    assert.match(copy.body, /Speedpoint67390368fn/)
  })
})
