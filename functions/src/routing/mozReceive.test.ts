import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_OVERLAY } from './constraints'
import { applyReceiveChoice, chooseReceiveAccount, parseReceiveHint } from './mozReceive'
import { buildActivityCopy, createInitialState, planCycle } from './conversionRouter'

describe('parseReceiveHint', () => {
  it('keeps Mahomed on BCI and BIM by default', () => {
    const hint = parseReceiveHint("what's next?")
    assert.equal(hint.payerName, 'Mahomed')
    assert.deepEqual(hint.payerBanks, ['bci', 'bim'])
  })

  it('clears the payer when the admin says it is not Mahomed', () => {
    const hint = parseReceiveHint('not Mahomed, different payer')
    assert.equal(hint.payerName, null)
    assert.equal(hint.payerBanks.length, 0)
  })

  it('reads an FNB payer from the message', () => {
    const hint = parseReceiveHint('the payer is on FNB Mozambique')
    assert.deepEqual(hint.payerBanks, ['fnb'])
  })
})

describe('chooseReceiveAccount', () => {
  it('never lands on Vista and names a METIX debit account', () => {
    const state = createInitialState()
    const plan = planCycle(state)
    const choice = chooseReceiveAccount({
      state,
      overlay: EMPTY_OVERLAY,
      amountZar: plan.deployedAmount,
      cycleNumber: plan.cycleNumber,
      swipeCardIds: plan.cardAssignments.map((row) => row.cardId),
    })
    assert.ok(choice)
    assert.notEqual(choice?.bankId, 'vista')
    assert.match(choice?.reason || '', /METIX/)
    assert.match(choice?.reason || '', /Vista is not used/)
    assert.match(choice?.reason || '', /Mahomed/)
    assert.ok(choice?.bankId === 'bci' || choice?.bankId === 'bim')
  })

  it('diversifies off the last receive card when payer banks still match', () => {
    let state = createInitialState()
    const first = chooseReceiveAccount({
      state,
      amountZar: 45_000,
      cycleNumber: 1,
      swipeCardIds: [1, 2, 4, 5],
    })
    assert.ok(first)
    state = applyReceiveChoice(state, first!.cardId)
    const second = chooseReceiveAccount({
      state,
      amountZar: 45_000,
      cycleNumber: 2,
      swipeCardIds: [1, 2, 4, 5],
    })
    assert.ok(second)
    assert.notEqual(second?.cardId, first?.cardId)
    assert.match(second?.reason || '', /fewer recent receives|diversifies|less recent inbound/i)
  })

  it('follows an FNB payer even when Mahomed is the default', () => {
    const state = createInitialState()
    const choice = chooseReceiveAccount({
      state,
      amountZar: 15_000,
      cycleNumber: 1,
      swipeCardIds: [3],
      hint: parseReceiveHint('payer is on FNB'),
    })
    assert.equal(choice?.cardId, 3)
    assert.equal(choice?.bankId, 'fnb')
  })
})

describe('sell receive copy', () => {
  it('names one debit account instead of a generic Moz bank list', () => {
    const state = createInitialState()
    const plan = planCycle(state)
    const copy = buildActivityCopy(plan, 20, 'awaiting_execution', 0.1, undefined, { state })
    assert.match(copy.body, /Receive MZN into /)
    assert.doesNotMatch(copy.body, /Moza Banco, or Vista/)
    assert.doesNotMatch(copy.body, /into a Moz account/)
    assert.match(copy.body, /METIX/)
  })
})
