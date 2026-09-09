import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatRoutingClock,
  hasCalendarTimeReference,
  hasFutureTimeConstraint,
  resolveExpiryFromMessage,
  sastToUtcMs,
} from './routingTime'

const THURSDAY_0015_SAST = sastToUtcMs(2026, 9, 10, 0, 15)

describe('routing clock', () => {
  it('labels Now in SAST', () => {
    const clock = formatRoutingClock(THURSDAY_0015_SAST)
    assert.match(clock.promptLine, /Thursday 10 September 2026, 00:15 SAST/)
    assert.equal(clock.timezone, 'Africa/Johannesburg')
  })
})

describe('time phrases', () => {
  it('leaves until-I-say as a manual hold, not a calendar date', () => {
    assert.equal(hasCalendarTimeReference('Card 5 is unavailable until I say'), false)
    assert.equal(hasFutureTimeConstraint('Card 5 is unavailable until I say'), false)
  })

  it('detects calendar language including past remarks', () => {
    assert.equal(hasCalendarTimeReference('yesterday we used card 5'), true)
    assert.equal(hasFutureTimeConstraint('yesterday we used card 5'), false)
    assert.equal(resolveExpiryFromMessage('yesterday we used card 5', THURSDAY_0015_SAST), null)
  })

  it('resolves until Monday to the coming Monday 00:00 SAST', () => {
    assert.equal(hasFutureTimeConstraint('Card 5 is unavailable until Monday'), true)
    assert.equal(
      resolveExpiryFromMessage('Card 5 is unavailable until Monday', THURSDAY_0015_SAST),
      sastToUtcMs(2026, 9, 14, 0, 0)
    )
  })

  it('resolves rest of today and a clock time', () => {
    assert.equal(
      resolveExpiryFromMessage('keep card 5 off for the rest of today', THURSDAY_0015_SAST),
      sastToUtcMs(2026, 9, 11, 0, 0)
    )
    assert.equal(
      resolveExpiryFromMessage('Card 2 unavailable until 17:00', THURSDAY_0015_SAST),
      sastToUtcMs(2026, 9, 10, 17, 0)
    )
  })
})
