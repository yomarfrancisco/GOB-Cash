import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  expectedMznForOrder,
  isAwaitingContinuePhase,
  isLeoSendPhase,
  stepTitle,
  stepForPhase,
} from './continuousCycle'

describe('continuousCycle', () => {
  it('computes expected MZN at SELL for a scheduled ZAR order', () => {
    assert.equal(expectedMznForOrder(10_000, 4.54), 45_400)
  })

  it('recognises continue vs send phases', () => {
    assert.equal(isAwaitingContinuePhase('awaiting_continue'), true)
    assert.equal(isLeoSendPhase('awaiting_send', 'deploy'), true)
    assert.equal(isLeoSendPhase('awaiting_mzn', 'deploy'), false)
  })

  it('labels Steps 1–6', () => {
    assert.equal(stepTitle(1, 'Day 1 of 14'), 'Step 1 · Order · Day 1 of 14')
    assert.equal(stepForPhase('awaiting_recycle'), 5)
    assert.equal(stepForPhase('awaiting_send'), 4)
  })
})
