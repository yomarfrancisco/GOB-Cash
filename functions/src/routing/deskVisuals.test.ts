import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialState, DEFAULT_TEST_CONFIG } from './conversionRouter'
import { buildDeskVisuals, suggestVisuals } from './deskVisuals'

describe('desk visuals', () => {
  it('builds capital and profit charts from the book', () => {
    const state = createInitialState(DEFAULT_TEST_CONFIG, 100_000)
    state.completedCycles = 3
    state.cycledZar = 25_000
    state.cumulativeSpread = 840
    const visuals = buildDeskVisuals({
      state,
      walletZar: 40_000,
      sellRate: 4.54,
      costRate: 4.13,
      recentCycles: [
        {
          cycleNumber: 1,
          status: 'completed',
          createdAtMs: 1,
          completedAtMs: 2,
          deployedAmount: 9000,
          assignments: [],
        },
        {
          cycleNumber: 2,
          status: 'completed',
          createdAtMs: 3,
          completedAtMs: 4,
          deployedAmount: 8000,
          assignments: [],
        },
      ],
    })
    assert.match(visuals.snapshot, /R75,000 of R100,000/)
    assert.ok(visuals.tables.some((row) => row.id === 'capital'))
    const profit = visuals.charts.find((row) => row.id === 'profit')
    assert.ok(profit)
    assert.equal(profit?.unit, 'ZAR')
    assert.ok((profit?.series[0].points.length || 0) >= 2)
  })

  it('attaches a profit chart when the operator asks to see it', () => {
    const visuals = buildDeskVisuals({
      state: createInitialState(DEFAULT_TEST_CONFIG, 100_000),
      walletZar: 10_000,
    })
    const picked = suggestVisuals('show me a graph of projected profits', visuals)
    assert.equal(picked.chart?.id, 'profit')
  })
})
