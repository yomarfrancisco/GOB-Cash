import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialState } from './conversionRouter'
import {
  applyIntentsToState,
  overlayFromConstraints,
  parseFastPath,
} from './constraints'

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
