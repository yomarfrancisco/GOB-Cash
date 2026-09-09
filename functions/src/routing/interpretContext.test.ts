import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createInitialState } from './conversionRouter'
import { attachResolvedExpiry, buildRoutingLedgerBrief, ledgerFromRoutingState } from './interpretContext'
import { sastToUtcMs } from './routingTime'

const THURSDAY_0015_SAST = sastToUtcMs(2026, 9, 10, 0, 15)

describe('buildRoutingLedgerBrief', () => {
  it('includes the clock, card rest, and executed cycle times', () => {
    const state = createInitialState()
    state.completedCycles = 9
    state.cards[4] = {
      ...state.cards[4],
      lastCycleUsed: 8,
      restCycles: 1,
      activeCycles: 2,
      volume: 20_400,
      machineHistory: [1, 1, 3],
    }
    const brief = buildRoutingLedgerBrief({
      ledger: ledgerFromRoutingState(state),
      constraints: [
        {
          id: 'c1',
          feedbackId: 'fb',
          action: 'exclude_card',
          resourceId: 5,
          value: null,
          scope: 'until_date',
          remainingCycles: null,
          expiresAt: sastToUtcMs(2026, 9, 14, 0, 0),
          status: 'active',
          summary: 'Card 5 excluded until Monday.',
          createdAtCycle: 10,
        },
      ],
      recentCycles: [
        {
          cycleNumber: 9,
          status: 'completed',
          createdAtMs: sastToUtcMs(2026, 9, 9, 23, 10),
          completedAtMs: sastToUtcMs(2026, 9, 9, 23, 40),
          assignments: [{ cardId: 4, machineId: 3, amount: 10229.52 }],
        },
      ],
      awaiting: {
        cycleNumber: 10,
        kind: 'deploy',
        issuedAtMs: sastToUtcMs(2026, 9, 9, 23, 41),
      },
      nowMs: THURSDAY_0015_SAST,
    })
    assert.match(brief, /Thursday 10 September 2026, 00:15 SAST/)
    assert.match(brief, /9 of 20 cycles completed/)
    assert.match(brief, /#5 last used cycle 8 \(2 ago\)/)
    assert.match(brief, /C9 executed Wednesday 9 September 2026, 23:40 SAST/)
    assert.match(brief, /expires Monday 14 September 2026, 00:00 SAST/)
  })
})

describe('attachResolvedExpiry', () => {
  it('upgrades a this-cycle exclude when the admin named a calendar end', () => {
    const filled = attachResolvedExpiry(
      [
        {
          action: 'exclude_card',
          resourceType: 'card',
          resourceId: 5,
          value: null,
          scope: 'this_cycle',
          nCycles: null,
          summary: 'Card 5 excluded for this cycle only.',
          confidence: 0.9,
        },
      ],
      'Card 5 is unavailable until Monday',
      THURSDAY_0015_SAST
    )
    assert.equal(filled[0]?.scope, 'until_date')
    assert.equal(filled[0]?.expiresAt, sastToUtcMs(2026, 9, 14, 0, 0))
    assert.match(filled[0]?.summary || '', /Monday 14 September 2026/)
  })
})
