import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBankEmailRound,
  expectedRepliesForRound,
  formatPtDate,
  formatPtZar,
  isExpectedBankReplyDue,
  isBankEmailRoundDay,
} from './bankEmailRound'

const MON_26_OCT = Date.parse('2026-10-26T08:00:00+02:00')

describe('bankEmailRound', () => {
  it('runs Monday to Friday and skips weekends', () => {
    assert.equal(isBankEmailRoundDay(MON_26_OCT), true)
    assert.equal(isBankEmailRoundDay(MON_26_OCT + 4 * 86_400_000), true)
    assert.equal(isBankEmailRoundDay(MON_26_OCT + 5 * 86_400_000), false)
    assert.equal(isBankEmailRoundDay(MON_26_OCT + 6 * 86_400_000), false)
  })

  it('selects one bank daily and bundles every frozen EFT ticket', () => {
    const first = buildBankEmailRound({
      cycleNumber: 1,
      clockMs: MON_26_OCT,
      horizonHours: 72,
      eftTickets: [{ amount: 65_000 }, { amount: 97_500 }],
    })
    const second = buildBankEmailRound({
      cycleNumber: 2,
      clockMs: MON_26_OCT + 86_400_000,
      horizonHours: 72,
      eftTickets: [{ amount: 80_000 }, { amount: 110_000 }],
    })
    assert.equal(first.due, true)
    assert.equal(first.selected.length, 1)
    assert.equal(first.selected[0]?.testedAmountZar, 162_500)
    assert.deepEqual(
      first.selected[0]?.attachments.map((attachment) => attachment.amountZar),
      [65_000, 97_500]
    )
    assert.match(first.selected[0]?.bodyPt || '', /Total · ZAR 162\.500,00/)
    assert.notEqual(first.selected[0]?.bankKey, second.selected[0]?.bankKey)
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

  it('shows Monday as the next round on a weekend', () => {
    const round = buildBankEmailRound({
      cycleNumber: 6,
      clockMs: MON_26_OCT + 5 * 86_400_000,
      horizonHours: 24,
      eftTickets: [{ amount: 65_000 }],
    })
    assert.equal(round.due, false)
    assert.equal(round.noRoundReason, 'weekend')
    assert.equal(round.selected.length, 0)
    assert.equal(round.nextRoundLabel, 'MON 2 NOV')
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

  it('makes next-day replies due even when the planned clock is before 09:00', () => {
    const round = buildBankEmailRound({
      cycleNumber: 1,
      clockMs: Date.parse('2026-10-26T08:00:00+02:00'),
      horizonHours: 72,
      eftTickets: [{ amount: 65_000 }],
    })
    assert.equal(
      isExpectedBankReplyDue(round, Date.parse('2026-10-27T08:00:00+02:00')),
      true
    )
    assert.equal(
      isExpectedBankReplyDue(round, Date.parse('2026-10-26T23:59:00+02:00')),
      false
    )
  })
})
