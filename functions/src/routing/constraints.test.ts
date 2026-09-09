import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialState } from './conversionRouter'
import {
  applyIntentsToState,
  contextualClarify,
  expireConstraints,
  expireConstraintsByTime,
  overlayFromConstraints,
  parseFastPath,
  usefulClarification,
} from './constraints'
import { sastToUtcMs } from './routingTime'

describe('parseFastPath', () => {
  it('reads an obvious card exclusion', () => {
    const parsed = parseFastPath('Card 5 is unavailable for this cycle.')
    assert.ok(parsed)
    assert.equal(parsed?.intents[0]?.action, 'exclude_card')
    assert.equal(parsed?.intents[0]?.resourceId, 5)
    assert.equal(parsed?.intents[0]?.scope, 'this_cycle')
  })

  it('reads a restore', () => {
    const parsed = parseFastPath('Machine 2 is back')
    assert.ok(parsed)
    assert.equal(parsed?.intents[0]?.action, 'restore_machine')
    assert.equal(parsed?.intents[0]?.resourceId, 2)
  })

  it('leaves free-form language to the LLM', () => {
    assert.equal(parseFastPath('Keep the last pairing off until lunch, then rotate.'), null)
  })

  it('leaves calendar time windows to the LLM instead of assuming this cycle', () => {
    assert.equal(parseFastPath('Card 5 is unavailable until Monday'), null)
  })
})

describe('time-bounded constraints', () => {
  const monday = sastToUtcMs(2026, 9, 14, 0, 0)
  const thursday = sastToUtcMs(2026, 9, 10, 0, 15)

  it('expires until_date rows when Now passes expiresAt, not on Execute', () => {
    const row = {
      id: 'c1',
      feedbackId: 'fb',
      action: 'exclude_card' as const,
      resourceId: 5,
      value: null,
      scope: 'until_date' as const,
      remainingCycles: null,
      expiresAt: monday,
      status: 'active' as const,
      summary: 'Card 5 excluded until Monday.',
      createdAtCycle: 9,
    }
    const afterExecute = expireConstraints([row], 9, thursday)
    assert.equal(afterExecute[0]?.status, 'active')
    const afterMonday = expireConstraintsByTime([row], monday)
    assert.equal(afterMonday[0]?.status, 'expired')
    assert.deepEqual(overlayFromConstraints([row], monday).excludedCardIds, [])
    assert.deepEqual(overlayFromConstraints([row], thursday).excludedCardIds, [5])
  })
})

describe('placeholder copy is not a valid answer', () => {
  it('does not treat the old fallback as useful clarification', () => {
    assert.equal(
      usefulClarification('I am not sure how to apply that. Name a card or machine and whether it is unavailable, restored, capped, or resting.'),
      null
    )
    assert.equal(usefulClarification('short question'), null)
    assert.match(
      contextualClarify([{ cardId: 4, machineId: 3 }, { cardId: 5, machineId: 1 }]),
      /Card 4 on Machine 3/
    )
  })
})

describe('applyIntentsToState', () => {
  it('turns validated exclude intents into an overlay the planner can consume', () => {
    const state = createInitialState()
    const applied = applyIntentsToState(
      state,
      [],
      [
        {
          action: 'exclude_card',
          resourceType: 'card',
          resourceId: 5,
          value: null,
          scope: 'this_cycle',
          nCycles: null,
          summary: 'Card 5 excluded for this cycle only.',
          confidence: 1,
        },
      ],
      9,
      'fb1'
    )
    const overlay = overlayFromConstraints(applied.constraints)
    assert.deepEqual(overlay.excludedCardIds, [5])
    assert.equal(applied.summaries[0], 'Card 5 excluded for this cycle only.')
  })
})
