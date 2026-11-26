import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DELIVERY_NOTE,
  liveNoteRatePct,
  noteCycleDayForFunding,
  noteReturnAtMs,
} from './deliveryNote'
import { sastToUtcMs } from '@/lib/routing/routingTime'

function sast(y: number, m: number, d: number, h: number, min = 0): number {
  return sastToUtcMs(y, m, d, h, min)
}

describe('delivery note cycle calendar', () => {
  it('weekday before cut-off joins that day → next 09:00', () => {
    // Thu 10:00 → Thu cycle → Fri 09:00
    const at = sast(2026, 11, 26, 10, 0)
    const day = noteCycleDayForFunding(at)
    assert.deepEqual(day, { year: 2026, month: 11, day: 26 })
    assert.equal(noteReturnAtMs(at), sast(2026, 11, 27, 9, 0))
  })

  it('weekday after cut-off joins next day → day after 09:00', () => {
    // Thu 16:00 → Fri cycle → Sat 09:00
    const at = sast(2026, 11, 26, 16, 0)
    const day = noteCycleDayForFunding(at)
    assert.deepEqual(day, { year: 2026, month: 11, day: 27 })
    assert.equal(noteReturnAtMs(at), sast(2026, 11, 28, 9, 0))
  })

  it('Fri after 15:00 and Sat 09–15 → back Sun 09:00', () => {
    const friEve = sast(2026, 11, 27, 16, 0) // Fri
    assert.deepEqual(noteCycleDayForFunding(friEve), { year: 2026, month: 11, day: 28 })
    assert.equal(noteReturnAtMs(friEve), sast(2026, 11, 29, 9, 0))

    const satAm = sast(2026, 11, 28, 11, 0) // Sat
    assert.deepEqual(noteCycleDayForFunding(satAm), { year: 2026, month: 11, day: 28 })
    assert.equal(noteReturnAtMs(satAm), sast(2026, 11, 29, 9, 0))
  })

  it('Sat after 15:00 and all Sunday → back Mon 09:00', () => {
    const satEve = sast(2026, 11, 28, 16, 0)
    assert.deepEqual(noteCycleDayForFunding(satEve), { year: 2026, month: 11, day: 29 })
    assert.equal(noteReturnAtMs(satEve), sast(2026, 11, 30, 9, 0))

    const sunAm = sast(2026, 11, 29, 10, 0)
    assert.deepEqual(noteCycleDayForFunding(sunAm), { year: 2026, month: 11, day: 29 })
    assert.equal(noteReturnAtMs(sunAm), sast(2026, 11, 30, 9, 0))
  })
})

describe('delivery note rates', () => {
  it('steps down each hour 09:00–15:00 then flat preorder', () => {
    assert.equal(liveNoteRatePct(sast(2026, 11, 26, 9, 0)), DELIVERY_NOTE.openRatePct)
    assert.equal(liveNoteRatePct(sast(2026, 11, 26, 10, 0)), 6.25)
    assert.equal(liveNoteRatePct(sast(2026, 11, 26, 14, 0)), 5.25)
    assert.equal(liveNoteRatePct(sast(2026, 11, 26, 15, 0)), DELIVERY_NOTE.preorderRatePct)
    assert.equal(liveNoteRatePct(sast(2026, 11, 26, 3, 0)), DELIVERY_NOTE.preorderRatePct)
  })
})
