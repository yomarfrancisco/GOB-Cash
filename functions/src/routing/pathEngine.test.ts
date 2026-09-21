import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_OVERLAY } from './constraints'
import { createInitialState, planCycle, planReplenish } from './conversionRouter'
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
  it('reroutes an unpaid leftover off the failed pair when another legal pair exists', () => {
    const state = createInitialState()
    const residual = {
      economicPaymentId: 'pay-c1-1-3',
      amountZar: 10_000,
      originCycle: 1,
      cardId: 1,
      machineId: 3,
      status: 'open' as const,
    }
    const book = bookWith({
      residuals: [residual],
      notes: [
        {
          cycle: 1,
          kind: 'decline',
          cardId: 1,
          machineId: 3,
          amountZar: 10_000,
          at: '2026-09-18T10:00:00.000Z',
          economicPaymentId: 'pay-c1-1-3',
        },
      ],
    })
    const plan = planCycle(state, EMPTY_OVERLAY, book)
    assert.equal(plan.deployedAmount, 10_000)
    assert.ok(plan.cardAssignments.length === 1)
    const row = plan.cardAssignments[0]
    assert.notEqual(row.cardId, 1)
    assert.notEqual(`${row.cardId}:${row.machineId}`, '1:3')
    assert.match(row.posReason || '', /leftover|Q-best/i)
    assert.equal(row.routingDecision?.quote?.sellRate, fallbackQuote().sellRate)
  })

  it('never lets a banned same-identity pair win', () => {
    const state = createInitialState()
    const picked = pickQBestPair({
      state,
      overlay: EMPTY_OVERLAY,
      cycleNumber: 1,
      amountZar: 10_000,
      book: bookWith(),
      onlyCardId: 3,
    })
    assert.ok(picked.assignment)
    assert.equal(picked.assignment.cardId, 3)
    assert.notEqual(picked.assignment.machineId, 1)
    assert.notEqual(picked.assignment.machineId, 2)
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
      amountZar: 10_000,
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
      amountZar: 10_000,
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
    assert.match(plan.selectionReason, /Hold/)
  })

  it('holds a leftover that cannot fit R10k–R15k', () => {
    const state = createInitialState()
    const plan = planCycle(
      state,
      EMPTY_OVERLAY,
      bookWith({
        residuals: [
          {
            economicPaymentId: 'pay-print-cap',
            amountZar: 8_000,
            originCycle: 1,
            cardId: 1,
            machineId: 3,
            status: 'open',
          },
        ],
      })
    )
    assert.equal(plan.deployedAmount, 0)
    assert.match(plan.holdReason || plan.selectionReason, /does not fit/)
  })

  it('prices a sale from live SELL and restock from live COST', () => {
    const quote = frozenQuoteFromSell(5.5, 1)
    const state = createInitialState()
    const sale = planCycle(state, EMPTY_OVERLAY, bookWith({ quote }))
    assert.equal(sale.quote?.sellRate, 5.5)
    assert.equal(sale.quote?.costRate, quote.costRate)
    assert.equal(sale.expectedProfit, expectedSpreadMzn(sale.deployedAmount, quote))
    assert.ok(Math.abs(sale.expectedProfit - sale.deployedAmount * (quote.sellRate - quote.costRate)) < 0.02)
    assert.notEqual(sale.expectedProfit, sale.deployedAmount * 0.1)

    state.bufferUsed = 40_000
    state.availableCapital = 13_129
    const restock = planReplenish(state, quote.costRate, EMPTY_OVERLAY, bookWith({ quote }))
    assert.ok(restock)
    assert.equal(restock?.amountMzn, Math.round(40_000 * quote.costRate * 100) / 100)
    assert.equal(restock?.costRate, quote.costRate)
  })

  it('historical Ask reads the frozen reason and does not re-plan', () => {
    const answered = answerHistoricalExplanation({
      message: 'Why did we choose FNB IMANI for Ginav last time?',
      history: [
        {
          id: 'ginav-imani',
          occurredAt: Date.UTC(2026, 8, 17, 12),
          executedAt: Date.UTC(2026, 8, 17, 12),
          cardId: 1,
          merchantId: 3,
          machineId: 3,
          amountZar: 10_000,
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
