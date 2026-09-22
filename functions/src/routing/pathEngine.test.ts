import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_OVERLAY } from './constraints'
import { applyCapitalShock, createInitialState, DEFAULT_TEST_CONFIG, planCycle, planReplenish } from './conversionRouter'
import { answerHistoricalExplanation } from './historicalAsk'
import {
  applyPathWrites,
  classifyPathWrite,
  expectedSpreadMzn,
  fallbackQuote,
  frozenQuoteFromSell,
  pickQBestPair,
  type PathBook,
} from './pathEngine'

function bookWith(extra: PathBook = {}): PathBook {
  return { residuals: [], notes: [], quote: fallbackQuote(), ...extra }
}

describe('pathEngine Q-best', () => {
  it('issues absorbing whole tickets, not a leftover onion pack', () => {
    const state = createInitialState({ ...DEFAULT_TEST_CONFIG, startingCapital: 100_000 })
    const plan = planCycle(state, EMPTY_OVERLAY, bookWith())
    assert.ok(plan.cardAssignments.length >= 1)
    assert.ok(plan.cardAssignments.every((row) => row.amount !== 15_000))
    assert.ok(plan.deployedAmount < 20_000)
    assert.ok((plan.idleCapital || 0) > 80_000)
  })

  it('still enumerates a legal card×POS for a named leftover', () => {
    const state = createInitialState()
    const picked = pickQBestPair({
      state,
      overlay: EMPTY_OVERLAY,
      cycleNumber: 1,
      amountZar: 2_500,
      book: bookWith(),
      onlyCardId: 3,
    })
    assert.ok(picked.assignment)
    assert.equal(picked.assignment.cardId, 3)
  })

  it('freeze removes a POS until rail_up', () => {
    const state = createInitialState()
    const frozen = bookWith({
      notes: [
        {
          cycle: 1,
          kind: 'freeze',
          cardId: null,
          machineId: 3,
          amountZar: null,
          at: '2026-09-18T10:00:00.000Z',
        },
      ],
    })
    const whileDown = pickQBestPair({
      state,
      overlay: EMPTY_OVERLAY,
      cycleNumber: 2,
      amountZar: 2_500,
      book: frozen,
    })
    assert.ok(whileDown.assignment)
    assert.notEqual(whileDown.assignment.machineId, 3)

    const up = applyPathWrites(frozen, [
      {
        kind: 'rail_up',
        cardId: null,
        machineId: 3,
        amountZar: null,
        summary: 'FNB IMANI is up again.',
      },
    ], { cycleNumber: 2, nowIso: '2026-09-18T12:00:00.000Z' })
    const after = pickQBestPair({
      state,
      overlay: EMPTY_OVERLAY,
      cycleNumber: 3,
      amountZar: 2_500,
      book: up,
    })
    assert.ok(after.ranks.some((row) => row.machineId === 3))
  })

  it('holds when every legal pair is frozen', () => {
    const state = createInitialState()
    const book = bookWith({
      notes: [1, 2, 3, 4].map((machineId) => ({
        cycle: 1,
        kind: 'freeze' as const,
        cardId: null,
        machineId,
        amountZar: null,
        at: '2026-09-18T10:00:00.000Z',
      })),
    })
    const plan = planCycle(state, EMPTY_OVERLAY, book)
    assert.equal(plan.deployedAmount, 0)
    assert.equal(plan.cardAssignments.length, 0)
    assert.match(plan.holdReason || plan.selectionReason, /Hold|frozen|empty|eligible|valid route|freezes/i)
  })

  it('prices a sale from live SELL and restock from live COST', () => {
    const quote = frozenQuoteFromSell(5.5, 1)
    const state = createInitialState({ ...DEFAULT_TEST_CONFIG, startingCapital: 100_000 })
    const sale = planCycle(state, EMPTY_OVERLAY, bookWith({ quote }))
    assert.equal(sale.quote?.sellRate, 5.5)
    assert.equal(sale.quote?.costRate, quote.costRate)
    assert.equal(sale.expectedProfit, expectedSpreadMzn(sale.deployedAmount, quote))
    assert.ok(Math.abs(sale.expectedProfit - sale.deployedAmount * (quote.sellRate - quote.costRate)) < 0.02)
    assert.notEqual(sale.expectedProfit, sale.deployedAmount * 0.1)

    state.bufferUsed = sale.deployedAmount
    const restock = planReplenish(state, quote.costRate, EMPTY_OVERLAY, bookWith({ quote }))
    assert.ok(restock)
    assert.deepEqual(
      restock?.cardAssignments.map((row) => row.amount),
      sale.cardAssignments.map((row) => row.amount)
    )
    assert.equal(restock?.amountZar, sale.deployedAmount)
    assert.equal(restock?.costRate, quote.costRate)
  })

  it('historical Ask reads the frozen reason and does not re-plan', () => {
    const answered = answerHistoricalExplanation({
      message: 'Why did we choose Rail 2 FNB for Ginav last time?',
      history: [
        {
          id: 'ginav-rail2',
          occurredAt: Date.UTC(2026, 8, 17, 12),
          executedAt: Date.UTC(2026, 8, 17, 12),
          cardId: 2,
          merchantId: 2,
          machineId: 2,
          amountZar: 3_524.31,
          currency: 'ZAR',
          country: 'ZA',
          channel: 'card_present',
          consortium: true,
          status: 'executed',
          source: 'live_desk',
          posReason: 'leftover R10,000 still has to move',
          routingDecision: {
            selectedCardId: 1,
            selectedMachineId: 3,
            selectedAt: Date.UTC(2026, 8, 17, 12),
            selectionReason: 'leftover R10,000 still has to move',
            eligibleAlternatives: [],
            excludedAlternatives: [],
            relevantConstraints: [],
            machineVolumesAtDecision: {},
            pairUseCountsAtDecision: {},
            cardRestStateAtDecision: { activeCycles: 0, restCycles: 0, lastCycleUsed: 0 },
            decisionVersion: 'routing_decision_v1',
            quote: frozenQuoteFromSell(5.5, Date.UTC(2026, 8, 17, 12)),
          },
        },
      ],
    })
    assert.match(answered.body, /leftover R10,000 still has to move/)
    assert.doesNotMatch(answered.body, /volume bucket/)
  })
})

describe('path write classifier', () => {
  it('reads the five outcome kinds without inventing a pair', () => {
    assert.equal(classifyPathWrite('Capitec declined', { machineIds: [2] })?.write?.kind, 'decline')
    assert.equal(classifyPathWrite('FNB IMANI froze', { machineIds: [3] })?.write?.kind, 'freeze')
    assert.equal(classifyPathWrite('FNB IMANI is up again', { machineIds: [3] })?.write?.kind, 'rail_up')
    assert.equal(
      classifyPathWrite('that swipe did not land', { openCardId: 1, openMachineId: 3, amountZar: 10_000 })?.write?.kind,
      'unpaid'
    )
    assert.equal(classifyPathWrite('Capitec delayed', { machineIds: [2] })?.write?.kind, 'delay')
    assert.match(classifyPathWrite('something froze')?.ambiguous || '', /Which rail/)
  })
})

describe('pathEngine flow', () => {
  it('treats Sell ZAR as a set-window-capital shock, not an additive residual', () => {
    const started = createInitialState()
    const after = applyCapitalShock(started, { kind: 'sell_zar', amountZar: 100_000 })
    assert.equal(after.authorisedZar, 100_000)
    assert.ok(after.window)
    assert.equal(after.window?.openingAmountZar ?? after.authorisedZar, 100_000)
  })

  it('Sell ZAR on a fresh desk opens Day 1 tickets at that capital', () => {
    const dummy = planCycle(createInitialState({ ...DEFAULT_TEST_CONFIG, startingCapital: 10_000 }))
    const after = applyCapitalShock(
      { ...createInitialState(), window: dummy.window, completedCycles: 0 },
      { kind: 'sell_zar', amountZar: 100_000 }
    )
    const plan = planCycle(after)
    assert.equal(plan.window?.openingAmountZar, 100_000)
    assert.equal(plan.window?.snapshot.days.at(-1)?.day, 1)
    assert.ok(Math.abs(plan.deployedAmount - 15_410.59) < 0.02)
    assert.equal(plan.cardAssignments.length, 3)
  })
})
