import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatSellTicketLine, formatSwipeTicketLine } from '../settlement/railDisplay'
import { scheduleTicketPath, MIN_ATTEMPT_SPACING_MS, SAME_ACQUIRER_GAP_MS } from '../routing/attemptSchedule'
import { sastToUtcMs } from '../routing/routingTime'

describe('rail display', () => {
  it('keeps legal names on sell ticket lines', () => {
    const line = formatSellTicketLine(5_000, 1, 3)
    assert.match(line, /BRICS AI/i)
    assert.match(line, /FNB Mozambique/i)
    assert.match(line, /Lemon Economics/i)
    assert.match(line, /Capitec/i)
  })

  it('uses short desk names on swipe lines', () => {
    const line = formatSwipeTicketLine(5_000, 3, 2)
    assert.match(line, /^Vidrotec \(Millennium BIM\) on Imani FNB for /)
    assert.doesNotMatch(line, /Sociedade Unipessoal|Beauty Distributors/)
  })
})

describe('ticket path schedule', () => {
  it('assigns a desk clock to each swipe with spacing', () => {
    const morning = sastToUtcMs(2026, 10, 1, 10, 0)
    const path = scheduleTicketPath({
      nowMs: morning,
      assignments: [
        { cardId: 1, machineId: 3, amount: 5000 }, // Capitec
        { cardId: 2, machineId: 1, amount: 5000 }, // FNB
        { cardId: 3, machineId: 2, amount: 5000 }, // FNB again
      ],
    })
    assert.equal(path.tickets.length, 3)
    assert.match(path.tickets[0].timeLabel, /^\d{2}h\d{2}$/)
    const t0 = Date.parse(path.tickets[0].earliestAt)
    const t1 = Date.parse(path.tickets[1].earliestAt)
    const t2 = Date.parse(path.tickets[2].earliestAt)
    assert.ok(t1 - t0 >= MIN_ATTEMPT_SPACING_MS - 60_000)
    assert.ok(t2 - t1 >= SAME_ACQUIRER_GAP_MS - 60_000)
    assert.equal(path.tickets[2].pathNote, null)
    assert.equal(path.pathSummary, null)
    assert.ok(!/business hours/i.test(JSON.stringify(path)))
  })
})
