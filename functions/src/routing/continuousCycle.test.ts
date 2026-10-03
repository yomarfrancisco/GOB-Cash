import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expectedMznForOrder, isAwaitingContinuePhase, isLeoSendPhase } from './continuousCycle'

describe('continuousCycle', () => {
  it('computes expected MZN at SELL for a scheduled ZAR order', () => {
    assert.equal(expectedMznForOrder(10_000, 4.54), 45_400)
  })

  it('recognises continue vs send phases', () => {
    assert.equal(isAwaitingContinuePhase('awaiting_continue'), true)
    assert.equal(isLeoSendPhase('awaiting_send', 'deploy'), true)
    assert.equal(isLeoSendPhase('awaiting_mzn', 'deploy'), false)
  })
})
