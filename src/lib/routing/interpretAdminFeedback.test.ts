import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseObviousFeedback,
  parseRoutingAssignmentsFromBody,
  usefulClarification,
} from './interpretAdminFeedback'

describe('parseObviousFeedback', () => {
  it('reads an unavailable card without calling the LLM', () => {
    const parsed = parseObviousFeedback('Card 5 is unavailable for this cycle.')
    assert.equal(parsed?.interpreter, 'fast_path')
    assert.equal(parsed?.intents[0]?.action, 'exclude_card')
    assert.equal(parsed?.intents[0]?.resourceId, 5)
    assert.equal(parsed?.clarification, null)
  })

  it('does not assume this cycle when the admin named a weekday', () => {
    assert.equal(parseObviousFeedback('Card 5 is unavailable until Monday'), null)
  })

  it('does not treat a remember question as an exclusion', () => {
    assert.equal(parseObviousFeedback('Do you remember that it was lost?'), null)
  })
})

describe('parseRoutingAssignmentsFromBody', () => {
  it('reads card/machine lines from an activity row', () => {
    const rows = parseRoutingAssignmentsFromBody(
      'R20,459.03 ZAR → MZN\n\nCard 4 · Machine 3 · R10,229.52\nCard 5 · Machine 1 · R10,229.51'
    )
    assert.deepEqual(rows, [
      { cardId: 4, machineId: 3, amount: 10229.52 },
      { cardId: 5, machineId: 1, amount: 10229.51 },
    ])
  })
})

describe('usefulClarification', () => {
  it('drops placeholder LLM copy', () => {
    assert.equal(usefulClarification('short question'), null)
    assert.equal(
      usefulClarification(
        'I am not sure how to apply that. Name a card or machine and whether it is unavailable, restored, capped, or resting.'
      ),
      null
    )
  })
})
