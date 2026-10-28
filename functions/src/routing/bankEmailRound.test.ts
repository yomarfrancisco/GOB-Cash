import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBankEmailRound,
  expectedRepliesForRound,
  formatPtDate,
  formatPtZar,
  isBankEmailRoundCycle,
} from './bankEmailRound'

const MON_26_OCT = Date.parse('2026-10-26T08:00:00+02:00')

describe('bankEmailRound', () => {
  it('runs once in every three consecutive desk cycles', () => {
    assert.equal(isBankEmailRoundCycle(1), true)
    assert.equal(isBankEmailRoundCycle(2), false)
    assert.equal(isBankEmailRoundCycle(3), false)
    assert.equal(isBankEmailRoundCycle(4), true)
  })

  it('selects two rotating banks and maps frozen EFT ticket amounts', () => {
    const first = buildBankEmailRound({
      cycleNumber: 1,
      clockMs: MON_26_OCT,
      horizonHours: 72,
      eftTickets: [{ amount: 65_000 }, { amount: 97_500 }],
    })
    const second = buildBankEmailRound({
      cycleNumber: 4,
      clockMs: MON_26_OCT + 3 * 86_400_000,
      horizonHours: 72,
      eftTickets: [{ amount: 80_000 }, { amount: 110_000 }],
    })
    assert.equal(first.due, true)
    assert.equal(first.selected.length, 2)
    assert.deepEqual(first.selected.map((row) => row.testedAmountZar), [65_000, 97_500])
    assert.equal(new Set([...first.selected, ...second.selected].map((row) => row.bankKey)).size, 4)
    assert.ok(first.selected.every((row) => row.reason === 'untested at this amount'))
    assert.ok(first.selected.every((row) => !('knownLimitZar' in row)))
  })

  it('formats Mozambican Portuguese dates, money and pre-AO90 copy', () => {
    assert.equal(formatPtDate(MON_26_OCT), '26/10/2026')
    assert.equal(formatPtZar(65_000), 'ZAR 65.000,00')
    const round = buildBankEmailRound({
      cycleNumber: 1,
      clockMs: MON_26_OCT,
      horizonHours: 24,
      eftTickets: [{ amount: 65_000 }],
    })
    assert.match(round.selected[0]!.subject, /26\/10\/2026 · ZAR 65\.000,00/)
    assert.match(round.selected[0]!.bodyPt, /\bfactura\b/)
    assert.doesNotMatch(round.selected[0]!.bodyPt, /\bfatura\b/)
  })

  it('shows the next round without selecting banks on non-round days', () => {
    const round = buildBankEmailRound({
      cycleNumber: 2,
      clockMs: MON_26_OCT + 86_400_000,
      horizonHours: 24,
      eftTickets: [{ amount: 65_000 }],
    })
    assert.equal(round.due, false)
    assert.equal(round.noRoundReason, 'cadence')
    assert.equal(round.selected.length, 0)
    assert.equal(round.nextRoundLabel, 'THU 29 OCT')
  })

  it('creates expectation-only replies without invented outcomes', () => {
    const round = buildBankEmailRound({
      cycleNumber: 1,
      clockMs: MON_26_OCT,
      horizonHours: 72,
      eftTickets: [{ amount: 65_000 }, { amount: 97_500 }],
    })
    const replies = expectedRepliesForRound(round)
    assert.ok(replies)
    assert.ok(replies.rows.every((row) => row.status === 'expected'))
    assert.ok(replies.rows.every((row) => row.wouldLearn.includes('amount acceptance')))
    assert.ok(replies.rows.every((row) => !('outcome' in row)))
  })
})
