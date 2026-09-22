import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyAskIntent,
  classifyAskIntentFast,
  enforceReadOnlyAdvice,
  guardConstraintOnQuestions,
  mayMutateRoute,
} from './askIntent'
import { adviseDesk } from './deskAdvisor'
import { createInitialState } from './conversionRouter'
import { sastToUtcMs } from './routingTime'

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

  it('classifies confirmed rail outcomes as path writes, not next-step questions', () => {
    assert.equal(classifyAskIntentFast('Capitec declined')?.intent, 'path_write')
    assert.equal(classifyAskIntentFast('FNB IMANI froze')?.intent, 'path_write')
    assert.equal(classifyAskIntentFast('that swipe did not land')?.intent, 'path_write')
    assert.equal(mayMutateRoute('path_write'), true)
    assert.equal(classifyAskIntentFast('Why did Capitec decline last time?')?.intent !== 'path_write', true)
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
    assert.deepEqual(enforceReadOnlyAdvice('path_write', proposal), proposal)
  })

  it('answers the two live questions without calling OpenAI', async () => {
    const originalFetch = globalThis.fetch
    const openaiCalls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      openaiCalls.push(url)
      throw new Error(`OpenAI must not be called: ${url}`)
    }) as typeof fetch
    try {
      delete process.env.LLM_API_KEY
      delete process.env.OPENAI_API_KEY
      const leaningQ = 'Have we been leaning too heavily on any one POS today?'
      const whyQ = 'Why did we choose Rail 2 FNB for Ginav last time?'
      const leaning = await classifyAskIntent(leaningQ)
      const why = await classifyAskIntent(whyQ)
      assert.equal(leaning.source, 'fast_path')
      assert.equal(leaning.intent, 'ledger_aggregate')
      assert.equal(why.source, 'fast_path')
      assert.equal(why.intent, 'historical_explanation')

      const nowMs = sastToUtcMs(2026, 9, 12, 14, 26)
      const leaningAdvice = adviseDesk({
        message: leaningQ,
        state: createInitialState(),
        constraints: [],
        classification: leaning,
        cycleNumber: 7,
        costRate: 4.15,
        nowMs,
        history: [
          {
            id: 'a',
            occurredAt: nowMs - 3_600_000,
            executedAt: nowMs - 3_600_000,
            cardId: 1,
            merchantId: 3,
            machineId: 3,
            amountZar: 15_000,
            currency: 'ZAR',
            country: 'ZA',
            channel: 'card_present',
            consortium: true,
            status: 'executed',
            source: 'live_desk',
          },
        ],
      })
      const whyAdvice = adviseDesk({
        message: whyQ,
        state: createInitialState(),
        constraints: [],
        classification: why,
        cycleNumber: 7,
        costRate: 4.15,
        nowMs,
        history: [
          {
            id: 'ginav-imani',
            occurredAt: nowMs - 86_400_000,
            executedAt: nowMs - 86_400_000,
            cardId: 2,
            merchantId: 2,
            machineId: 2,
            amountZar: 15_000,
            currency: 'ZAR',
            country: 'ZA',
            channel: 'card_present',
            consortium: true,
            status: 'executed',
            source: 'live_desk',
            posReason: 'stored issuance reason',
          },
        ],
      })
      assert.match(leaningAdvice.body, /Rail 3 Capitec|POS concentration|no POS concentration/i)
      assert.match(whyAdvice.body, /stored issuance reason|Stored reason/i)
      assert.deepEqual(openaiCalls, [])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
