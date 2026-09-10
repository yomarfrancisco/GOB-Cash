import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adviseDesk } from './deskAdvisor'
import {
  formatFrictionSentence,
  isFrictionNoteReply,
  nextNoteQuestion,
  parseFrictionNote,
  type SwipeRecord,
} from './friction'
import { createInitialState } from './conversionRouter'
import { applyIntentsToState } from './constraints'
import { cardLabel } from './inventory'
import { sastToUtcMs } from './routingTime'
import type { RoutingIntent } from './constraints'

const NOW = sastToUtcMs(2026, 9, 10, 22, 0)

function swipe(partial: Partial<SwipeRecord> & Pick<SwipeRecord, 'cardId' | 'machineId'>): SwipeRecord {
  return {
    id: partial.id || `${partial.cycleNumber || 1}-${partial.cardId}-${partial.machineId}`,
    atMs: partial.atMs ?? NOW - 20 * 60 * 60 * 1000,
    amount: partial.amount ?? 11_339,
    cycleNumber: partial.cycleNumber ?? 19,
    cardId: partial.cardId,
    machineId: partial.machineId,
  }
}

describe('friction sentence', () => {
  it('adds nothing when there is no history — keep the pair list as the instruction', () => {
    const line = formatFrictionSentence({
      assignments: [
        { cardId: 5, machineId: 1, amount: 11_339 },
        { cardId: 1, machineId: 2, amount: 11_339 },
      ],
      swipes: [],
      notes: [],
      nowMs: NOW,
    })
    assert.equal(line, null)
  })

  it('names a hot pair instead of rewriting the restock list', () => {
    const line = formatFrictionSentence({
      assignments: [{ cardId: 4, machineId: 3, amount: 11_339 }],
      swipes: [
        swipe({ cardId: 4, machineId: 3, atMs: NOW - 1 * 86_400_000 }),
        swipe({ cardId: 4, machineId: 3, atMs: NOW - 2 * 86_400_000, id: 'a' }),
        swipe({ cardId: 4, machineId: 3, atMs: NOW - 3 * 86_400_000, id: 'b' }),
      ],
      notes: [],
      nowMs: NOW,
    })
    assert.match(line || '', /Goblin on FNB IMANI has run 3 times in 7 days/)
    assert.match(line || '', /invoice ready|settle/)
  })

  it('blocks a card switch after a decline', () => {
    const line = formatFrictionSentence({
      assignments: [{ cardId: 1, machineId: 2, amount: 11_339 }],
      swipes: [],
      notes: [
        {
          id: 'd',
          kind: 'outcome',
          atMs: NOW - 86_400_000,
          text: 'declined',
          cardId: 4,
          outcome: 'declined',
        },
      ],
      nowMs: NOW,
    })
    assert.equal(line, null)
    const blocked = formatFrictionSentence({
      assignments: [{ cardId: 4, machineId: 3, amount: 11_339 }],
      swipes: [],
      notes: [
        {
          id: 'd',
          kind: 'outcome',
          atMs: NOW - 86_400_000,
          text: 'declined',
          cardId: 4,
          outcome: 'declined',
        },
      ],
      nowMs: NOW,
    })
    assert.match(blocked || '', /Goblin was declined/)
    assert.match(blocked || '', /Do not swipe another card/)
  })
})

describe('note questions', () => {
  it('asks how a swipe went after 18 hours, not immediately', () => {
    const recent = [swipe({ cardId: 5, machineId: 1, atMs: NOW - 60 * 60 * 1000 })]
    assert.equal(
      nextNoteQuestion({ swipes: recent, notes: [], nowMs: NOW, pendingKind: null }),
      null
    )
    const due = nextNoteQuestion({
      swipes: [swipe({ cardId: 5, machineId: 1, atMs: NOW - 20 * 60 * 60 * 1000 })],
      notes: [],
      nowMs: NOW,
      pendingKind: null,
    })
    assert.equal(due?.questionKind, 'swipe_outcome')
    assert.match(due?.body || '', /Wolf on FNB BRICS/)
  })
})

describe('parseFrictionNote', () => {
  it('stores cleared / declined / docs from a short reply', () => {
    assert.equal(isFrictionNoteReply('cleared'), true)
    const note = parseFrictionNote('cleared', {
      nowMs: NOW,
      swipes: [swipe({ cardId: 5, machineId: 1 })],
      pendingKind: 'swipe_outcome',
    })
    assert.equal(note?.outcome, 'cleared')
    assert.equal(note?.cardId, 5)
  })
})

describe('adviseDesk friction', () => {
  it('does not offer another card after a decline', () => {
    const state = createInitialState()
    const intents: RoutingIntent[] = state.cards.map((card) => ({
      action: 'rest_card',
      resourceType: 'card',
      resourceId: card.id,
      value: null,
      scope: 'n_cycles',
      nCycles: 10,
      summary: `${cardLabel(card.id)} resting.`,
      confidence: 1,
    }))
    const applied = applyIntentsToState(state, [], intents, 19, 'rest')
    const advice = adviseDesk({
      message: "Let's assume i have to swipe. what should i do?",
      state: applied.state,
      constraints: applied.constraints,
      cycleNumber: 19,
      costRate: 4.15,
      nowMs: NOW,
      notes: [
        {
          id: 'd',
          kind: 'outcome',
          atMs: NOW - 86_400_000,
          text: 'declined',
          cardId: 4,
          outcome: 'declined',
        },
      ],
    })
    assert.equal(advice.kind, 'question')
    assert.equal(advice.questionKind, 'decline_followup')
    assert.doesNotMatch(advice.body, /Pursue/)
    assert.match(advice.body, /Do not switch cards|How do you want to proceed/)
  })
})
