import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hydrateWindow, persistWindow } from './throughputPlan'
import {
  advanceWindow,
  reportWindowOutcome,
  startWindow,
} from '../throughput/prospective/window'

const CENT = 0.01

function dumpRoutes(branch: ReturnType<typeof startWindow>, day: number) {
  const record = branch.snapshot.days.find((row) => row.day === day)
  return {
    settledZar: record?.settledZar,
    heldBackZar: record?.heldBackZar,
    routes: (record?.routes ?? []).map((route) => ({
      card: route.cardName,
      pos: route.railLabel,
      amount: route.amountZar,
    })),
  }
}

describe('Throughput golden fixture seed 21 R100k', () => {
  it('Day 2 matches the absorbing whole-ticket book and kernel pairs', () => {
    const day1 = startWindow({ availableZar: 100_000, seed: 21 })
    assert.equal(day1.completedThroughDay, 1)
    const day2 = advanceWindow(day1)
    assert.equal(day2.completedThroughDay, 2)

    const book = (day2.snapshot.book[2] ?? []).map((ticket) => ticket.amount)
    assert.deepEqual(book, [2_942.06, 3_524.31, 3_006.67])

    const record = day2.snapshot.days[1]!
    assert.ok(Math.abs(record.settledZar - 9_473.04) < CENT)
    assert.ok(Math.abs(record.heldBackZar - 92_068.02) < CENT)

    const routes = dumpRoutes(day2, 2).routes
    assert.deepEqual(routes, [
      { card: 'BRICS', pos: 'Rail 4 Capitec', amount: 2_942.06 },
      { card: 'Ginav', pos: 'Rail 1 FNB', amount: 3_524.31 },
      { card: 'Vidrotec', pos: 'Rail 2 FNB', amount: 3_006.67 },
    ])
    assert.equal(
      routes.every((row) => row.amount !== 15_000),
      true
    )
  })

  it('Day 3 after an unpaid leftover is not a second 75k onion pack', () => {
    const day2 = advanceWindow(startWindow({ availableZar: 100_000, seed: 21 }))
    const leftover = day2.snapshot.days[1]!.routes[0]!
    const reported = reportWindowOutcome(day2, {
      type: 'report_outcome',
      expectedDay: 2,
      outcome: 'unpaid',
      rail: leftover.railLabel,
      amountZar: leftover.amountZar,
    })
    const day3 = advanceWindow(reported)
    const record = day3.snapshot.days[2]!
    assert.ok(Math.abs(record.settledZar - 18_827.57) < CENT)
    assert.equal(
      record.routes.every((row) => row.amountZar !== 15_000),
      true
    )
    assert.ok(record.routes.some((row) => row.economicPaymentId === leftover.economicPaymentId))
  })

  it('persists a Firestore-safe window without arrays of arrays', () => {
    const window = startWindow({ availableZar: 100_000, seed: 21 })
    const persisted = persistWindow(window)
    assert.equal(hasArrayOfArrays(persisted), false)
    assert.ok(Array.isArray((persisted.snapshot as { days: unknown[] }).days))
    assert.ok((persisted.snapshot as { days: { routes: unknown[] }[] }).days[0].routes.length >= 3)
  })

  it('rails survive the Firestore round trip: persisted Day 2/3 equals in-memory Day 2/3', () => {
    const roundTrip = (window: ReturnType<typeof startWindow>) =>
      hydrateWindow(JSON.parse(JSON.stringify(persistWindow(window))))!
    const day1 = startWindow({ availableZar: 100_000, seed: 21 })
    const memDay2 = advanceWindow(day1)
    const perDay2 = advanceWindow(roundTrip(day1))
    assert.deepEqual(dumpRoutes(perDay2, 2).routes, dumpRoutes(memDay2, 2).routes)
    assert.deepEqual(dumpRoutes(perDay2, 2).routes.map((row) => row.pos), [
      'Rail 4 Capitec',
      'Rail 1 FNB',
      'Rail 2 FNB',
    ])
    const memDay3 = advanceWindow(memDay2)
    const perDay3 = advanceWindow(roundTrip(perDay2))
    assert.deepEqual(dumpRoutes(perDay3, 3).routes, dumpRoutes(memDay3, 3).routes)
  })
})

function hasArrayOfArrays(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => Array.isArray(item)) || value.some(hasArrayOfArrays)
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasArrayOfArrays)
  }
  return false
}
