import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_OVERLAY } from './constraints'
import {
  DEFAULT_TEST_CONFIG,
  buildAgentReplyCopy,
  buildNotificationCopy,
  buildReplenishActivityCopy,
  buildReplenishNotificationCopy,
  completeCycle,
  createInitialState,
  formatAskImpactBody,
  largestValidDeployment,
  planCycle,
  planReplenish,
  previewAskImpact,
  simulateRun,
  splitAcrossCards,
} from './conversionRouter'

describe('largestValidDeployment', () => {
  const limits = { cardCount: 5, minCardAmount: 10_000, maxCardAmount: 15_000 }

  it('deploys a single card for R10k–R15k', () => {
    assert.deepEqual(largestValidDeployment(10_000, limits), {
      deployedAmount: 10_000,
      cardCount: 1,
    })
    assert.deepEqual(largestValidDeployment(15_000, limits), {
      deployedAmount: 15_000,
      cardCount: 1,
    })
  })

  it('leaves a gap remainder idle instead of underfilling two cards', () => {
    assert.deepEqual(largestValidDeployment(17_000, limits), {
      deployedAmount: 15_000,
      cardCount: 1,
    })
  })

  it('uses the fewest cards once a higher band is reachable', () => {
    assert.deepEqual(largestValidDeployment(25_000, limits), {
      deployedAmount: 25_000,
      cardCount: 2,
    })
    assert.deepEqual(largestValidDeployment(45_000, limits), {
      deployedAmount: 45_000,
      cardCount: 3,
    })
    assert.deepEqual(largestValidDeployment(59_000, limits), {
      deployedAmount: 59_000,
      cardCount: 4,
    })
  })
})

describe('splitAcrossCards', () => {
  it('keeps whole-cycle amounts assigned without leftover cents', () => {
    const parts = splitAcrossCards(31_512, 3, 10_000, 15_000)
    assert.equal(parts.length, 3)
    assert.equal(roundSum(parts), 31_512)
    for (const part of parts) {
      assert.ok(part >= 10_000 && part <= 15_000)
    }
  })
})

describe('20-cycle default test', () => {
  it('compounds only on completion and stays inside validation ranges', () => {
    const { state, cycles } = simulateRun({ ...DEFAULT_TEST_CONFIG, spread: 0.095 })
    assert.equal(cycles.length, 20)
    assert.equal(cycles[0].deployedAmount, 10_000)
    assert.equal(cycles[0].cardCountUsed, 1)
    assert.equal(state.completedCycles, 20)

    const cardCounts = cycles.map((cycle) => cycle.cardCountUsed)
    assert.ok(cardCounts.some((count) => count >= 2))
    assert.ok(cardCounts.some((count) => count >= 3))
    assert.ok(cardCounts.some((count) => count >= 4))
    assert.ok(Math.max(...cardCounts) <= 5)

    assert.ok(state.cumulativeDeployed > 450_000 && state.cumulativeDeployed < 600_000)
    assert.ok(state.cumulativeSpread > 40_000 && state.cumulativeSpread < 58_000)
    assert.ok(state.availableCapital > 50_000 && state.availableCapital < 70_000)

    const volumes = state.cards.map((card) => card.volume)
    const maxVol = Math.max(...volumes)
    const minVol = Math.min(...volumes.filter((volume) => volume > 0))
    assert.ok(maxVol / minVol < 3)

    const machineVolumes = state.machines.map((machine) => machine.volume)
    const maxM = Math.max(...machineVolumes)
    const minM = Math.min(...machineVolumes)
    assert.ok(minM > 0)
    assert.ok(maxM / minM < 2.5)

    assert.ok(cycles.some((cycle) => cycle.bufferActionRequired))
    assert.ok(cycles.some((cycle) => cycle.idleCapital > 0))
  })

  it('does not invent a next cycle until the current one is completed', () => {
    const state = createInitialState()
    const first = planCycle(state)
    const stillFirst = planCycle(state)
    assert.equal(first.cycleNumber, 1)
    assert.equal(stillFirst.cycleNumber, 1)
    const after = completeCycle(state, first)
    assert.equal(planCycle(after).cycleNumber, 2)
  })

  it('recalculates the current cycle when a card is excluded by overlay', () => {
    const state = createInitialState()
    state.availableCapital = 20_017
    const original = planCycle(state)
    assert.ok(original.cardAssignments.length >= 2)
    const excluded = original.cardAssignments[original.cardAssignments.length - 1].cardId
    const revised = planCycle(state, {
      excludedCardIds: [excluded],
      excludedMachineIds: [],
      cardMaxById: {},
      cardMinById: {},
      preferredMachineIds: [],
    })
    assert.equal(revised.cycleNumber, original.cycleNumber)
    assert.ok(revised.cardAssignments.every((row) => row.cardId !== excluded))
    assert.ok(revised.deployedAmount > 0)
  })

  it('does not invent a route when every card is excluded', () => {
    const state = createInitialState()
    const blocked = planCycle(state, {
      excludedCardIds: [1, 2, 3, 4, 5],
      excludedMachineIds: [],
      cardMaxById: {},
      cardMinById: {},
      preferredMachineIds: [],
    })
    assert.equal(blocked.deployedAmount, 0)
    assert.equal(blocked.cardAssignments.length, 0)
    assert.match(blocked.selectionReason, /No valid route/)
  })

  it('keeps the dropdown to a title plus one body line', () => {
    const plan = planCycle(createInitialState())
    const copy = buildNotificationCopy(plan, 20)
    assert.equal(copy.body.split('\n').length, 1)
    assert.match(copy.body, /after MZN reflects/)
    assert.equal(copy.body.includes('Restock'), false)
  })

  it('answers a revision with the change and next payout only', () => {
    const plan = planCycle(createInitialState())
    const copy = buildAgentReplyCopy(plan, 20, 'Card 5 excluded from this cycle only.', false)
    assert.equal(copy.body.includes('You:'), false)
    assert.equal(copy.body.includes('Expected spread'), false)
    assert.equal(copy.body.includes('Awaiting execution'), false)
    assert.match(copy.body, /Card 5 excluded from this cycle only/)
    assert.match(copy.body, /Next: receive MZN, then pay/)
  })

  it('never pairs Wolf with FNB Wolf or BRICS AI with a BRICS machine', () => {
    const { cycles } = simulateRun({ ...DEFAULT_TEST_CONFIG, cycleCount: 20 })
    for (const cycle of cycles) {
      for (const row of cycle.cardAssignments) {
        assert.equal(
          (row.cardId === 5 && row.machineId === 4) ||
            (row.cardId === 3 && (row.machineId === 1 || row.machineId === 2)),
          false
        )
      }
    }
  })

  it('plans a COST replenish when the buffer would exceed the working threshold', () => {
    const state = createInitialState()
    state.bufferUsed = 40_000
    state.availableCapital = 13_129
    const replenish = planReplenish(state, 4.32)
    assert.ok(replenish)
    assert.equal(replenish?.amountZar, 40_000)
    assert.equal(replenish?.amountMzn, 172_800)
    const copy = buildReplenishNotificationCopy(replenish!)
    assert.equal(copy.title, 'Restock ZAR @ COST')
    assert.match(copy.body, /Swipe /)
    assert.doesNotMatch(copy.body, /each Moz/)
    assert.ok((replenish?.cardAssignments.length || 0) > 0)
    assert.ok(replenish!.cardAssignments.every((row) => Boolean(row.posReason)))
  })

  it('names the actual swipe and why that POS, not a generic each-card line', () => {
    const state = createInitialState()
    state.bufferUsed = 40_000
    state.availableCapital = 13_129
    const overlay = { ...EMPTY_OVERLAY, excludedCardIds: [1, 2, 4, 5] }
    const replenish = planReplenish(state, 4.32, overlay)
    assert.ok(replenish)
    assert.equal(replenish!.cardAssignments.length, 1)
    assert.equal(replenish!.cardAssignments[0].cardId, 3)
    assert.equal(
      replenish!.cardAssignments[0].machineId === 1 || replenish!.cardAssignments[0].machineId === 2,
      false
    )
    const row = replenish!.cardAssignments[0]
    assert.match(row.posReason || '', /cannot use FNB BRICS or Capitec BRICS/i)
    const copy = buildReplenishActivityCopy(replenish!, 20, 'awaiting_execution', state, overlay)
    assert.match(copy.body, /^Swipe BRICS AI on /)
    assert.match(copy.body, /cannot use FNB BRICS or Capitec BRICS/i)
    assert.doesNotMatch(copy.body, /each Moz debit card/)
    assert.doesNotMatch(copy.body, /Cards resting/)
    assert.doesNotMatch(copy.body, /POS resting/)
    assert.doesNotMatch(copy.body, /Spends /)
    assert.doesNotMatch(copy.body, /from Moz accounts/)
    assert.doesNotMatch(copy.body, /Awaiting execution/)
    const notice = buildReplenishNotificationCopy(replenish!)
    assert.match(notice.body, /^Swipe BRICS AI on /)
    assert.doesNotMatch(notice.body, /each Moz/)
  })

  it('keeps the named-pair restock list; empty swipe history adds no extra line', () => {
    const state = createInitialState()
    state.bufferUsed = 40_000
    state.availableCapital = 13_129
    const replenish = planReplenish(state, 4.15)
    assert.ok(replenish)
    assert.ok((replenish!.cardAssignments.length || 0) > 1)
    const friction = { swipes: [], notes: [], nowMs: Date.UTC(2026, 8, 10, 20, 0) }
    const copy = buildReplenishActivityCopy(
      replenish!,
      20,
      'awaiting_execution',
      state,
      EMPTY_OVERLAY,
      friction
    )
    const baseline = buildReplenishActivityCopy(replenish!, 20, 'awaiting_execution', state)
    assert.equal(copy.body, baseline.body)
    assert.match(copy.body, /^Swipe these \d+ pairs:/)
    assert.match(copy.body, /Swipe .+ on .+ for R/)
    assert.match(copy.body, /COST 4\.15 Mt\/R\./)
    assert.match(copy.body, /Then sell ZAR · Cycle \d+ of 20\./)
    assert.doesNotMatch(copy.body, /each Moz debit card/)
    assert.doesNotMatch(copy.body, /declined this week|times in 7 days|last 30 days typical/)
    const first = replenish!.cardAssignments[0]
    const hot = buildReplenishActivityCopy(replenish!, 20, 'awaiting_execution', state, EMPTY_OVERLAY, {
      swipes: [0, 1, 2].map((i) => ({
        id: `hot-${i}`,
        atMs: Date.UTC(2026, 8, 10 - i, 12, 0),
        cardId: first.cardId,
        machineId: first.machineId,
        amount: first.amount,
        cycleNumber: 19,
      })),
      notes: [],
      nowMs: Date.UTC(2026, 8, 10, 20, 0),
    })
    assert.match(hot.body, /^Swipe these \d+ pairs:/)
    assert.match(hot.body, /has run 3 times in 7 days/)
    assert.ok(hot.body.indexOf('Swipe these') < hot.body.indexOf('has run 3 times'))
    assert.ok(hot.body.indexOf('has run 3 times') < hot.body.indexOf('COST 4.15'))
  })
})

describe('ask preview', () => {
  it('shows the next route without the excluded card', () => {
    const state = createInitialState({ ...DEFAULT_TEST_CONFIG, startingCapital: 30_000 })
    const current = planCycle(state)
    const excluded = current.cardAssignments[0]?.cardId
    assert.ok(excluded)
    const preview = previewAskImpact(
      state,
      { ...EMPTY_OVERLAY, excludedCardIds: [excluded] },
      4.2
    )
    assert.equal(preview.replenishFirst, null)
    assert.ok(preview.nextPlan)
    assert.equal(
      preview.nextPlan.cardAssignments.some((row) => row.cardId === excluded),
      false
    )
    const body = formatAskImpactBody({
      acknowledgement: 'Wolf resting for the next 3 cycles.',
      currentPlan: current,
      preview,
      proposal: true,
    })
    assert.match(body, /Accept applies this rule/)
    assert.match(body, /Next: receive MZN/)
  })
})

function roundSum(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100
}
