import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatRoutingClock,
  formatVisibleSast,
  hasCalendarTimeReference,
  hasFutureTimeConstraint,
  isBankerQuestion,
  isDeskStrategyAsk,
  isMemoryOrHistoryQuestion,
  isPaceAsk,
  isSettlementAsk,
  isWhatIfAsk,
  resolveExpiryFromMessage,
  sastToUtcMs,
  shouldNotApplyAskIntents,
  wantsNewRoutingRun,
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

  it('treats remember/when questions as history, not new constraints', () => {
    assert.equal(isMemoryOrHistoryQuestion('Do you remember that it was lost?'), true)
    assert.equal(isMemoryOrHistoryQuestion('Card 5 is unavailable until Monday'), false)
    assert.equal(isMemoryOrHistoryQuestion('Card 5 is unavailable for this cycle.'), false)
  })

  it('treats why/what-if as banker asks, not silent applies', () => {
    assert.equal(isBankerQuestion('Why is Wolf on Capitec BRICS?'), true)
    assert.equal(isBankerQuestion('Wolf is lost'), false)
    assert.equal(isBankerQuestion("Isn't this too much too soon?"), true)
    assert.equal(shouldNotApplyAskIntents("Isn't this too much too soon?"), true)
    assert.equal(
      isBankerQuestion('ok how much have we settled on each card over the past week?'),
      true
    )
    assert.equal(
      shouldNotApplyAskIntents('ok how much have we settled on each card over the past week?'),
      true
    )
    assert.equal(
      isSettlementAsk('ok how much have we settled on each card over the past week?'),
      true
    )
    assert.equal(isPaceAsk('ok how much have we settled on each card over the past week?'), false)
    assert.equal(isWhatIfAsk('what if we rest Wolf for 3 cycles'), true)
    assert.equal(isWhatIfAsk('Wolf is lost'), false)
  })

  it('treats whats next as a strategy ask', () => {
    assert.equal(isDeskStrategyAsk("Ok, what's next?"), true)
    assert.equal(shouldNotApplyAskIntents("what's next"), true)
    assert.equal(isDeskStrategyAsk('rest Wolf for 3 cycles'), false)
    assert.equal(isDeskStrategyAsk("Let's assume i have to swipe. what should i do?"), true)
    assert.equal(isDeskStrategyAsk('what happens if no cards are possible for at least 2 months?'), true)
    assert.equal(wantsNewRoutingRun("what's next"), false)
    assert.equal(wantsNewRoutingRun('start the next run'), true)
  })

  it('shows a clock time for same-day activity', () => {
    assert.equal(formatVisibleSast(THURSDAY_0015_SAST, sastToUtcMs(2026, 9, 10, 0, 24)), '00:15')
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
