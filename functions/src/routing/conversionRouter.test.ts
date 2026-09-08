import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_TEST_CONFIG,
  buildNotificationCopy,
  completeCycle,
  createInitialState,
  largestValidDeployment,
  planCycle,
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

  it('keeps the dropdown to a title plus two body lines', () => {
    const plan = planCycle(createInitialState())
    const copy = buildNotificationCopy(plan, 20)
    assert.equal(copy.body.split('\n').length, 2)
  })
})

function roundSum(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100
}
