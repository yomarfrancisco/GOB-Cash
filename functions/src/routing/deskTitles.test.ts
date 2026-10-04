import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  askCardTitle,
  bankCardTitle,
  frictionCardTitle,
  proposalCardTitle,
  sideCardTitle,
  stepCardTitle,
  windowCardTitle,
} from './deskTitles'

describe('deskTitles', () => {
  it('keeps Lane A step titles closed', () => {
    assert.equal(stepCardTitle(1), 'Step 1 · Order')
    assert.equal(stepCardTitle(4), 'Step 4 · Send')
    assert.equal(stepCardTitle(4, 'Add ZAR'), 'Step 4 · Send · Add ZAR')
    assert.equal(stepCardTitle(4, 'Waiting'), 'Step 4 · Send · Waiting')
    assert.equal(stepCardTitle(5), 'Step 5 · Recycle')
    assert.equal(stepCardTitle(6), 'Step 6 · Next day')
  })

  it('prefixes Lane B without double-prefixing', () => {
    assert.equal(bankCardTitle('FNB', 'approved'), 'Bank · FNB approved')
    assert.equal(windowCardTitle('Opened'), 'Window · Opened')
    assert.equal(askCardTitle('POS ranking'), 'Ask · POS ranking')
    assert.equal(askCardTitle('Ask · POS ranking'), 'Ask · POS ranking')
    assert.equal(proposalCardTitle('Rule'), 'Proposal · Rule')
    assert.equal(frictionCardTitle('Decline'), 'Friction · Decline')
    assert.equal(sideCardTitle('advice', 'Need a fact'), 'Ask · Need a fact')
    assert.equal(sideCardTitle('proposal', 'Need a fact'), 'Proposal · Need a fact')
  })
})
