import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatSellTicketLine, formatSwipeTicketLine } from '../settlement/railDisplay'
import { suggestAttemptTime, MIN_ATTEMPT_SPACING_MS } from '../routing/attemptSchedule'
import { sastToUtcMs } from '../routing/routingTime'

describe('rail display', () => {
  it('names legal payer and merchant on sell lines', () => {
    const line = formatSellTicketLine(5_000, 1, 3)
    assert.match(line, /BRICS AI/i)
    assert.match(line, /FNB Mozambique/i)
    assert.match(line, /Lemon Economics/i)
    assert.match(line, /Capitec/i)
    assert.ok(!/Lemon Capitec/.test(line) || /Lemon Economics/.test(line))
  })

  it('names issuer and merchant on swipe lines', () => {
    const line = formatSwipeTicketLine(5_000, 3, 2)
    assert.match(line, /Vidrotec/i)
    assert.match(line, /BIM|Millennium/i)
    assert.match(line, /Imani/i)
    assert.match(line, /FNB/i)
  })
})

describe('attempt schedule', () => {
  it('spaces after last attempt and clamps to operating hours', () => {
    const morning = sastToUtcMs(2026, 9, 30, 10, 0)
    const schedule = suggestAttemptTime({
      nowMs: morning,
      lastAttemptAtMs: morning - 30 * 60_000,
    })
    const earliest = Date.parse(schedule.earliestAt)
    assert.ok(earliest >= morning - 30 * 60_000 + MIN_ATTEMPT_SPACING_MS - 60_000)
    assert.match(schedule.reason || '', /Not before|two-hour|hours/i)
  })
})
