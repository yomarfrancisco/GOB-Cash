import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answerHistoricalExplanation } from './historicalAsk'
import type { DeskTx } from './frictionHistory'
import { sastToUtcMs } from './routingTime'

const NOW = sastToUtcMs(2026, 9, 12, 15, 0)

describe('historical explanation', () => {
  it('reads the frozen routingDecision and does not invent a reason', () => {
    const history: DeskTx[] = [
      {
        id: 'ginav-imani',
        occurredAt: NOW - 86_400_000,
        executedAt: NOW - 86_400_000,
        cardId: 1,
        merchantId: 3,
        machineId: 3,
        amountZar: 15_000,
        currency: 'ZAR',
        country: 'ZA',
        channel: 'card_present',
        consortium: true,
        status: 'executed',
        source: 'live_desk',
        cycleNumber: 6,
        routingDecision: {
          selectedCardId: 1,
          selectedMachineId: 3,
          selectedAt: NOW - 86_400_000,
          selectionReason: 'Ginav → FNB IMANI — frozen at issuance, not today’s planner.',
          eligibleAlternatives: [{ machineId: 4, volume: 12_000, pairUseCount: 1 }],
          excludedAlternatives: [{ machineId: 1, reason: 'same-identity pair' }],
          relevantConstraints: [],
          machineVolumesAtDecision: { '3': 0, '4': 12_000 },
          pairUseCountsAtDecision: { '1:3': 0, '1:4': 1 },
          cardRestStateAtDecision: { activeCycles: 1, restCycles: 0, lastCycleUsed: 5 },
          decisionVersion: 'routing_decision_v1',
        },
      },
    ]
    const answered = answerHistoricalExplanation({
      message: 'Why did we choose FNB IMANI for Ginav last time?',
      history,
    })
    assert.match(answered.body, /frozen at issuance, not today’s planner/)
    assert.match(answered.body, /Stored reason/)
    assert.doesNotMatch(answered.body, /I will not re-run/)
  })
})
