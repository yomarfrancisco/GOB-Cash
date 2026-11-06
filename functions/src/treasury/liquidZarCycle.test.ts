import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { liquidCycleKeyAt } from './liquidZarCycle'
import { sastToUtcMs } from '../routing/routingTime'

describe('liquidZarCycle', () => {
  it('keys the open cycle to the last 09:00 SAST calendar day', () => {
    // 2026-11-06 08:59 SAST → still 2026-11-05 cycle
    const beforeNine = sastToUtcMs(2026, 11, 6, 8, 59, 0)
    assert.equal(liquidCycleKeyAt(beforeNine), '2026-11-05')

    // 2026-11-06 09:00 SAST → new cycle day
    const atNine = sastToUtcMs(2026, 11, 6, 9, 0, 0)
    assert.equal(liquidCycleKeyAt(atNine), '2026-11-06')

    // 2026-11-06 15:00 SAST → same cycle
    const afternoon = sastToUtcMs(2026, 11, 6, 15, 0, 0)
    assert.equal(liquidCycleKeyAt(afternoon), '2026-11-06')
  })
})
