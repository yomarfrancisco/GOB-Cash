import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adviseDesk } from './deskAdvisor'
import { createInitialState } from './conversionRouter'
import type { DeskTx } from './frictionHistory'
import { answerLedgerFactAsk } from './ledgerFacts'
import { isLedgerFactAsk, isSettlementAsk, sastToUtcMs } from './routingTime'

const NOW = sastToUtcMs(2026, 9, 12, 11, 7)

function tx(partial: Partial<DeskTx> & Pick<DeskTx, 'id' | 'cardId' | 'machineId' | 'amountZar' | 'occurredAt'>): DeskTx {
  return {
    currency: 'ZAR',
    country: 'ZA',
    channel: 'card_present',
    consortium: true,
    status: 'executed',
    source: 'live_desk',
    merchantId: partial.machineId,
    executedAt: partial.occurredAt,
    ...partial,
  }
}

const groupedRestock: DeskTx[] = [
  tx({
    id: 'g1',
    cardId: 4,
    machineId: 4,
    amountZar: 12_000,
    occurredAt: NOW - 3_600_000,
    restockGroupId: 'restock-live-c6',
    assignmentIndex: 0,
  }),
  tx({
    id: 'g2',
    cardId: 5,
    machineId: 2,
    amountZar: 14_317,
    occurredAt: NOW - 3_600_000,
    restockGroupId: 'restock-live-c6',
    assignmentIndex: 1,
  }),
  tx({
    id: 'g3',
    cardId: 1,
    machineId: 3,
    amountZar: 11_000,
    occurredAt: NOW - 3_600_000,
    restockGroupId: 'restock-live-c6',
    assignmentIndex: 2,
  }),
]

describe('ledger fact intent', () => {
  it('catches ordinary last-merchant wording and leaves weekly-each-card to settlement', () => {
    assert.equal(isLedgerFactAsk('what was the last merchant we used?'), true)
    assert.equal(isLedgerFactAsk('when did we last use Capitec?'), true)
    assert.equal(isLedgerFactAsk('did we use Ginav today?'), true)
    assert.equal(isLedgerFactAsk('how much has FNB Wolf taken today?'), true)
    assert.equal(isSettlementAsk('how much has FNB Wolf taken today?'), false)
    assert.equal(isLedgerFactAsk('ok how much have we settled on each card over the past week?'), false)
  })
})

describe('ledger retrieval', () => {
  it('refuses to invent a last merchant when timestamps are tied', () => {
    const answered = answerLedgerFactAsk({
      message: 'what was the last merchant we used?',
      history: groupedRestock,
      nowMs: NOW,
    })
    assert.match(answered.body, /Goblin → FNB Wolf/)
    assert.match(answered.body, /Wolf → Capitec BRICS/)
    assert.match(answered.body, /Ginav → FNB IMANI/)
    assert.match(answered.body, /Individual swipe order is unknown/)
  })

  it('answers last Capitec time and notes the grouped restock', () => {
    const answered = answerLedgerFactAsk({
      message: 'when did we last use Capitec?',
      history: groupedRestock,
      nowMs: NOW,
    })
    assert.match(answered.body, /Wolf → Capitec BRICS/)
    assert.match(answered.body, /SAST/)
    assert.match(answered.body, /grouped restock/)
    assert.match(answered.body, /Individual swipe order is unknown/)
  })

  it('does not fall through to the open sell route', () => {
    const state = createInitialState()
    const advice = adviseDesk({
      message: 'what was the last merchant we used?',
      state,
      constraints: [],
      current: {
        kind: 'deploy',
        assignments: [{ cardId: 2, machineId: 1, amount: 12_000 }],
        amountZar: 12_000,
      },
      history: groupedRestock,
      cycleNumber: 7,
      costRate: 4.15,
      nowMs: NOW,
    })
    assert.doesNotMatch(advice.body, /receive MZN|Vidrotec|BIM/i)
    assert.match(advice.body, /Individual swipe order is unknown/)
  })
})
