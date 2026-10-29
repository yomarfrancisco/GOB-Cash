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

  it('labels Steps 1–6 without day counters', () => {
    assert.equal(stepTitle(1, 'Day 1 of 14'), 'Step 1 · ZAR order received')
    assert.equal(stepTitle(5, 'Day 2 recycle'), 'Step 5 · Replace ZAR')
    assert.equal(stepTitle(4, 'Day 3 send'), 'Step 4 · Send ZAR')
    assert.equal(stepTitle(4, 'Add ZAR'), 'Step 4 · Send ZAR · Add ZAR')
    assert.equal(stepForPhase('order_open'), 1)
    assert.equal(stepForPhase('awaiting_invoice'), 2)
    assert.equal(stepForPhase('awaiting_mzn'), 3)
    assert.equal(stepForPhase('awaiting_send'), 4)
    assert.equal(stepForPhase('awaiting_recycle'), 5)
    assert.equal(stepForPhase('awaiting_day_close'), 6)
    assert.equal(stepTitle(6), 'Step 6 · Day lookback')
  })
})
