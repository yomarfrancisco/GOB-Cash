import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMznProof } from './mznProofParse'

const WOLF = `Transferência
Mesmo Banco
Operação efectuada com sucesso
Titular da conta a creditar
WOLF DIGITAL LDA
Número de operação
90698249
Conta a debitar
346 794 411 000 1
Conta a creditar
3625 606 841 000 1
Valor a transferir
77,690.00
MZN`

const VIDROTEC = `It's done!
LDA VIDROTEC
It has already been received
95.550,00 MZN`

const INTERBANK = `Interbank
Operation successful
TEI order number
58243247
Operation number
98548084
Debit account
346 794 411 000 1
Destination NIB
0001 0000 0125 4822 944 57
Transfer value
90,000.00
MZN`

describe('MZN screenshot proofs', () => {
  it('reads a same-bank success screen', () => {
    const proof = parseMznProof(WOLF)
    assert.equal(proof?.amountMzn, 77690)
    assert.equal(proof?.beneficiary, 'WOLF DIGITAL LDA')
    assert.equal(proof?.operationNumber, '90698249')
    assert.equal(proof?.debitAccount, '346 794 411 000 1')
    assert.equal(proof?.creditAccount, '3625 606 841 000 1')
    assert.equal(proof?.layout, 'bank_transfer')
  })

  it('reads the short received notice, including the thousands dot', () => {
    const proof = parseMznProof(VIDROTEC)
    assert.equal(proof?.amountMzn, 95550)
    assert.equal(proof?.beneficiary, 'LDA VIDROTEC')
    assert.equal(proof?.operationNumber, null)
    assert.equal(proof?.layout, 'received_notice')
  })

  it('reads an English interbank success screen', () => {
    const proof = parseMznProof(INTERBANK)
    assert.equal(proof?.amountMzn, 90000)
    assert.equal(proof?.operationNumber, '98548084')
    assert.equal(proof?.teiNumber, '58243247')
    assert.equal(proof?.creditAccount, '0001 0000 0125 4822 944 57')
  })

  it('ignores mail that is not a transfer proof', () => {
    assert.equal(parseMznProof('hi from gmail'), null)
  })
})
