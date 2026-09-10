import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyIntentsToState } from './constraints'
import { createInitialState, type RoutingState } from './conversionRouter'
import { adviseDesk } from './deskAdvisor'
import { cardLabel } from './inventory'
import { isDeskStrategyAsk, shouldNotApplyAskIntents, sastToUtcMs } from './routingTime'
import type { RoutingIntent } from './constraints'

const NOW = sastToUtcMs(2026, 9, 10, 15, 3)

function restAll(state: RoutingState, nCycles = 10) {
  const intents: RoutingIntent[] = state.cards.map((card) => ({
    action: 'rest_card',
    resourceType: 'card',
    resourceId: card.id,
    value: null,
    scope: 'n_cycles',
    nCycles,
    summary: `${cardLabel(card.id)} resting for the next ${nCycles} cycles.`,
    confidence: 1,
  }))
  return applyIntentsToState(state, [], intents, 17, 'rest-all')
}

describe('desk strategy asks', () => {
  it('treats whats next as advice, not a rest dump', () => {
    assert.equal(isDeskStrategyAsk("Ok, what's next?"), true)
    assert.equal(shouldNotApplyAskIntents("Ok, what's next?"), true)
    assert.equal(isDeskStrategyAsk('rest Ginav for 10 cycles'), false)
    assert.equal(isDeskStrategyAsk('Wolf is lost'), false)
  })
})

describe('adviseDesk', () => {
  it('asks which card is safe when every card is parked', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const advice = adviseDesk({
      message: "Ok, what's next?",
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'question')
    assert.equal(advice.questionKind, 'which_card_safe')
    assert.match(advice.title, /Need a card/i)
    assert.match(advice.body, /Which card is actually safe/i)
    assert.doesNotMatch(advice.body, /this_cycle/)
    assert.equal(advice.options, undefined)
  })

  it('offers one restore route when the admin names a workable card', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const advice = adviseDesk({
      message: 'Ginav',
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
      recentFeedback: [
        {
          rawMessage: "Ok, what's next?",
          summary: null,
          createdAtMs: NOW - 60_000,
          status: 'question',
          questionKind: 'which_card_safe',
        },
      ],
    })
    assert.equal(advice.kind, 'options')
    assert.equal(advice.options?.length, 1)
    assert.match(advice.options?.[0].body || '', /Ginav/i)
    assert.equal(advice.options?.[0].intents[0]?.action, 'restore_card')
    assert.equal(advice.options?.[0].intents[0]?.resourceId, 1)
    assert.equal(advice.title.startsWith('Use '), true)
  })

  it('does not invent a third route when one sale is already open', () => {
    const state = createInitialState()
    const advice = adviseDesk({
      message: "what's next?",
      state,
      constraints: [],
      cycleNumber: 1,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'next_step')
    assert.equal(advice.options, undefined)
    assert.match(advice.body, /no second route/i)
    assert.match(advice.body, /Receive MZN into |receive MZN into /)
    assert.match(advice.body, /METIX|Mahomed|BCI|BIM/)
  })

  it('parks the desk when the admin says no card is safe', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const advice = adviseDesk({
      message: 'none, wait for a new consortium card',
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'options')
    assert.equal(advice.options?.length, 1)
    assert.match(advice.body, /new card/i)
    assert.equal(advice.options?.[0].intents.length, 5)
    assert.ok(advice.options?.[0].intents.every((row) => row.scope === 'until_cleared'))
  })

  it('offers two routes only when two named cards both work', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const advice = adviseDesk({
      message: 'Ginav or Vidrotec',
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'options')
    assert.equal(advice.options?.length, 2)
    assert.match(advice.body, /\(1\)/)
    assert.match(advice.body, /\(2\)/)
    assert.doesNotMatch(advice.body, /\(3\)/)
  })

  it('justifies the POS on an open restock', () => {
    const state = createInitialState()
    state.bufferUsed = 40_000
    state.availableCapital = 13_129
    const advice = adviseDesk({
      message: "what's next?",
      state,
      constraints: [],
      cycleNumber: 1,
      costRate: 4.32,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'next_step')
    assert.match(advice.title, /restock/i)
    assert.match(advice.body, /on (FNB IMANI|Capitec BRICS|FNB BRICS|FNB Wolf)/)
    assert.match(
      advice.body,
      /cannot use|taken less rand|cooler pair|only legal POS|preferred machine|volume is lower|sat idle|tied with|has been on/
    )
  })

  it('tells the admin to wait when one card has a unique calendar lift', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const constraints = applied.constraints.map((row, index) =>
      index === 0
        ? { ...row, scope: 'until_date' as const, remainingCycles: null, expiresAt: NOW + 5 * 86_400_000 }
        : row
    )
    const advice = adviseDesk({
      message: "what's next?",
      state: applied.state,
      constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'next_step')
    assert.match(advice.body, /comes off rest/i)
    assert.equal(advice.options, undefined)
  })

  it('picks one safest swipe when the admin says they have to swipe', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const advice = adviseDesk({
      message: "Let's assume i have to swipe. what should i do?",
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'options')
    assert.equal(advice.options?.length, 1)
    assert.equal(advice.options?.[0].intents[0]?.action, 'restore_card')
    assert.doesNotMatch(advice.body, /this_cycle/)
    assert.match(advice.body, /safest pair/i)
    assert.match(advice.body, /on (FNB IMANI|Capitec BRICS|FNB BRICS|FNB Wolf)/)
    assert.match(
      advice.body,
      /cannot use|taken less rand|cooler pair|only legal POS|preferred machine|volume is lower|sat idle|ranked ahead|has been on|tied with/
    )
  })

  it('explains a two-month freeze instead of parking the desk', () => {
    const state = createInitialState()
    const applied = restAll(state)
    const advice = adviseDesk({
      message: 'ok nothing is coming this week. what happens if no cards are possible for at least 2 months?',
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 17,
      costRate: 4.1,
      nowMs: NOW,
    })
    assert.equal(advice.kind, 'next_step')
    assert.match(advice.body, /COST restock stops/i)
    assert.match(advice.body, /float/i)
    assert.doesNotMatch(advice.body, /Retire every Moz card/)
    assert.equal(advice.options, undefined)
  })

  it('answers too-much-too-soon from the open restock, not a card-name nag', () => {
    const state = createInitialState()
    state.bufferUsed = 49_891.33
    state.availableCapital = 108.67
    const lastSwipe = sastToUtcMs(2026, 9, 10, 21, 54)
    const nowMs = sastToUtcMs(2026, 9, 10, 22, 41)
    const advice = adviseDesk({
      message: "Isn't this too much too soon?",
      state,
      constraints: [],
      current: {
        kind: 'replenish',
        assignments: [
          { cardId: 3, machineId: 3, amount: 12_472.84 },
          { cardId: 5, machineId: 2, amount: 12_472.83 },
          { cardId: 1, machineId: 1, amount: 12_472.83 },
          { cardId: 2, machineId: 2, amount: 12_472.83 },
        ],
        amountZar: 49_891.33,
      },
      recentFeedback: [
        {
          rawMessage: "what's next?",
          summary: 'Need a card',
          createdAtMs: nowMs - 120_000,
          status: 'question',
          questionKind: 'which_card_safe',
        },
      ],
      swipes: [
        {
          id: '19-5-1',
          atMs: lastSwipe,
          cardId: 5,
          machineId: 1,
          amount: 11_339,
          cycleNumber: 19,
        },
      ],
      cycleNumber: 20,
      costRate: 4.15,
      nowMs,
    })
    assert.equal(advice.kind, 'next_step')
    assert.doesNotMatch(advice.body, /card name|none \/ new card|Which card is actually safe/i)
    assert.match(advice.body, /R49,891/)
    assert.match(advice.body, /4 swipes/)
    assert.match(advice.body, /R10,000/)
    assert.match(advice.body, /21:54/)
    assert.match(advice.body, /do not add another card/i)
  })
})
