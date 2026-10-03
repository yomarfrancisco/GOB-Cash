import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatSellTicketLine, formatSwipeTicketLine } from '../settlement/railDisplay'
import {
  scheduleTicketPath,
  rulebookSlotMinutes,
  SAME_ACQUIRER_GAP_MS,
  schedulingDayParts,
  formatDeskClock,
} from '../routing/attemptSchedule'
import { sastParts, sastToUtcMs } from '../routing/routingTime'

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
  it('uses rulebook five-payment slots — no second 09h00 wrap', () => {
    // Friday night: old ladder was 09/11/13/15 then wrap → 09 again.
    const night = sastToUtcMs(2026, 10, 2, 22, 34)
    const path = scheduleTicketPath({
      nowMs: night,
      immediate: true,
      assignments: [
        { cardId: 1, machineId: 1, amount: 4000 },
        { cardId: 2, machineId: 2, amount: 4000 },
        { cardId: 3, machineId: 3, amount: 4000 },
        { cardId: 4, machineId: 4, amount: 4000 },
        { cardId: 5, machineId: 1, amount: 4000 },
      ],
    })
    assert.equal(path.tickets.length, 5)
    const labels = path.tickets.map((row) => row.timeLabel)
    assert.equal(new Set(labels).size, 5, `duplicate clocks: ${labels.join(', ')}`)

    const day = schedulingDayParts(night)
    assert.equal(day.weekday, 6, 'Friday night should schedule Saturday')
    for (const ticket of path.tickets) {
      const p = sastParts(Date.parse(ticket.earliestAt))
      assert.equal(p.day, day.day)
      assert.equal(p.month, day.month)
    }
    // First slot near rulebook morning, not a collapsed 09h00 ladder.
    assert.equal(path.tickets[0]!.timeLabel, formatDeskClock(Date.parse(path.tickets[0]!.earliestAt)))
    assert.notEqual(labels[4], labels[0])
  })

  it('keeps same-card swipes at least 120 minutes apart', () => {
    const morning = sastToUtcMs(2026, 10, 1, 10, 0)
    const path = scheduleTicketPath({
      nowMs: morning,
      assignments: [
        { cardId: 1, machineId: 3, amount: 5000 },
        { cardId: 2, machineId: 1, amount: 5000 },
        { cardId: 1, machineId: 2, amount: 5000 },
      ],
    })
    const t0 = Date.parse(path.tickets[0]!.earliestAt)
    const t2 = Date.parse(path.tickets[2]!.earliestAt)
    assert.ok(t2 - t0 >= SAME_ACQUIRER_GAP_MS - 60_000)
  })

  it('matches rulebook §7.3 base+jitter for five odd-day payments', () => {
    const mins = rulebookSlotMinutes(5, 1)
    assert.deepEqual(
      mins,
      [9 * 60 + 10, 10 * 60 + 45, 12 * 60 + 20, 13 * 60 + 55, 15 * 60 + 30].map(
        (base, i) => base + (((1 * 7 + i * 11) % 9) - 4)
      )
    )
  })
})
