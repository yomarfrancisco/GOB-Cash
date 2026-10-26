import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  advanceEftBookPlannedDay,
  bankingDeadlineIso,
  channelMixOf,
  nextCardSettleByIso,
  openEftZar,
  splitReplacementChannels,
  mergeEftBook,
} from './channelSplit'
import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'

describe('channelSplit', () => {
  it('keeps small sales on card only and books full EN ROUTE', () => {
    const split = splitReplacementChannels({ amountZar: 12_000, nowMs: Date.parse('2026-10-20T10:00:00+02:00') })
    assert.equal(split.enRouteZar, 12_000)
    assert.equal(split.cardZar, 12_000)
    assert.equal(split.eftZar, 0)
    assert.equal(split.cardTickets.length, 1)
    assert.ok(split.cardTickets[0]!.amountZar <= OPERATING_POLICY_V1.payment.maxAmountZar)
  })

  it('splits R100k into card headroom + EFT without packing only cards', () => {
    const split = splitReplacementChannels({ amountZar: 100_000, nowMs: Date.parse('2026-10-20T10:00:00+02:00'), shockId: 't100' })
    assert.equal(split.enRouteZar, 100_000)
    assert.ok(split.cardZar > 0)
    assert.ok(split.eftZar > 0)
    assert.ok(split.cardZar + split.eftZar === 100_000 || Math.abs(split.cardZar + split.eftZar - 100_000) < 0.02)
    assert.ok(split.eftZar >= 50_000, `eft ${split.eftZar} should be majority-ish`)
    assert.ok(split.cardTickets.every((t) => t.amountZar <= OPERATING_POLICY_V1.payment.maxAmountZar))
  })

  it('puts almost all of R1m on EFT replacement while EN ROUTE is full million', () => {
    const split = splitReplacementChannels({ amountZar: 1_000_000, nowMs: Date.parse('2026-10-20T10:00:00+02:00') })
    assert.equal(split.enRouteZar, 1_000_000)
    assert.ok(split.eftZar > split.cardZar)
    assert.ok(split.eftZar > 700_000)
    assert.ok(openEftZar(mergeEftBook(null, split)) === split.eftZar)
  })

  it('computes card next-09:00 and EFT T+2 banking deadlines', () => {
    const mon = Date.parse('2026-10-19T10:00:00+02:00') // Monday
    const cardBy = nextCardSettleByIso(mon)
    assert.match(cardBy, /2026-10-20T07:00:00/) // 09:00 SAST = 07:00 UTC
    const t2 = bankingDeadlineIso(mon, 2, 16)
    assert.ok(Date.parse(t2) > mon)
  })

  it('Planned day advances EFT open→submitted without instant settle', () => {
    const split = splitReplacementChannels({ amountZar: 100_000, nowMs: Date.parse('2026-10-20T10:00:00+02:00') })
    assert.equal(channelMixOf(split), 'mixed')
    const first = advanceEftBookPlannedDay(mergeEftBook(null, split), Date.parse('2026-10-20T10:00:00+02:00'))
    assert.ok(first.book.tickets.every((t) => t.status === 'submitted' || t.status === 'settled'))
    assert.equal(first.settledZar, 0)
  })
})
