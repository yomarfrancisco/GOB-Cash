import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { advanceWindow, startWindow } from '../throughput/prospective/window'
import { resolveWindow } from './throughputPlan'

describe('routing throughput window', () => {
  it('skips weekends across the full month horizon', () => {
    let window = startWindow({
      availableZar: 1_000_000,
      seed: 1,
      horizonDays: 31,
    })
    while (window.completedThroughDay < 13) {
      window = advanceWindow(window)
    }

    const next = resolveWindow({
      window,
      completedCycles: 13,
      availableCapital: window.availableZar,
      authorisedZar: 1_000_000,
      bufferUsed: 0,
    })

    assert.equal(next.completedThroughDay, 15)
    assert.equal(next.snapshot.days.at(-1)?.weekday, 'Mon')
    assert.equal(next.snapshot.days.at(-1)?.weekend, false)
  })
})
