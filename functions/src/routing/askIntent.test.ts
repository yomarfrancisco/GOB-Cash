import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyAskIntentFast,
  enforceReadOnlyAdvice,
  guardConstraintOnQuestions,
  mayMutateRoute,
} from './askIntent'

describe('Ask intent classifier', () => {
  it('classifies the two live failures as read-only', () => {
    const leaning = classifyAskIntentFast('Have we been leaning too heavily on any one POS today?')
    assert.equal(leaning?.intent, 'ledger_aggregate')
    assert.equal(mayMutateRoute(leaning!.intent), false)

    const why = classifyAskIntentFast('Why did we choose FNB IMANI for Ginav last time?')
    assert.equal(why?.intent, 'historical_explanation')
    assert.equal(mayMutateRoute(why!.intent), false)
  })

  it('keeps explicit commands as constraint_request', () => {
    assert.equal(classifyAskIntentFast('Use Ginav next time')?.intent, 'constraint_request')
    assert.equal(classifyAskIntentFast('Park Ginav until Monday')?.intent, 'constraint_request')
    assert.equal(mayMutateRoute('constraint_request'), true)
  })

  it('maps the remaining examples without treating a name as a constraint', () => {
    assert.equal(classifyAskIntentFast('When did we last use Capitec?')?.intent, 'ledger_fact')
    assert.equal(classifyAskIntentFast('Why this POS?')?.intent, 'current_route_question')
    assert.equal(classifyAskIntentFast('Is this similar to the BIM case?')?.intent, 'friction_question')
  })

  it('refuses to keep an interrogative entity mention as a constraint', () => {
    const leaked = guardConstraintOnQuestions('Why did we choose FNB IMANI for Ginav last time?', {
      intent: 'constraint_request',
      confidence: 0.9,
      source: 'llm',
      cardIds: [1],
      machineIds: [3],
      reason: 'named Ginav',
    })
    assert.equal(leaked.intent, 'historical_explanation')
    assert.equal(mayMutateRoute(leaked.intent), false)
  })

  it('strips Pursue options from every non-constraint intent', () => {
    const proposal = {
      kind: 'options',
      options: [{ id: '1' }],
      recommendedOptionId: '1',
    }
    const stripped = enforceReadOnlyAdvice('historical_explanation', proposal)
    assert.equal(stripped.kind, 'next_step')
    assert.equal(stripped.options, undefined)
    assert.equal(stripped.recommendedOptionId, undefined)
    assert.deepEqual(enforceReadOnlyAdvice('constraint_request', proposal), proposal)
  })
})
