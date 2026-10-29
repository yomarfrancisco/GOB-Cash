import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canClaimAutonomousRun,
  decideAutonomousAction,
  dueScheduledSlots,
  normalizeExposure,
  scheduledRunId,
  zarCustodyTotal,
} from './autonomousSettlementPolicy'

const base = {
  status: 'active',
  cyclePhase: 'order_open',
  deskStep: 1,
  awaitingKind: 'step',
  expectedZar: 100,
  expectedMzn: 100,
  spendableZar: 100,
  spendableMzn: 100,
}

describe('autonomous settlement policy', () => {
  it('advances backend-owned order and invoice steps', () => {
    assert.equal(decideAutonomousAction(base), 'advance_internal')
    assert.equal(
      decideAutonomousAction({ ...base, cyclePhase: 'awaiting_invoice', deskStep: 2 }),
      'advance_internal'
    )
  })

  it('does not advance an order backed only by model capital', () => {
    assert.equal(decideAutonomousAction({ ...base, spendableZar: 99 }), 'pending_funding')
  })

  it('uses the real MZN wallet before advancing cover', () => {
    assert.equal(
      decideAutonomousAction({ ...base, cyclePhase: 'awaiting_mzn', deskStep: 3, spendableMzn: 99 }),
      'pending_funding'
    )
    assert.equal(
      decideAutonomousAction({ ...base, cyclePhase: 'awaiting_mzn', deskStep: 3 }),
      'advance_internal'
    )
  })

  it('executes an integrated send only from spendable ZAR', () => {
    assert.equal(
      decideAutonomousAction({
        ...base,
        cyclePhase: 'awaiting_send',
        deskStep: 4,
        awaitingKind: 'deploy',
      }),
      'execute_integrated_send'
    )
    assert.equal(
      decideAutonomousAction({
        ...base,
        cyclePhase: 'awaiting_send',
        deskStep: 4,
        awaitingKind: 'deploy',
        spendableZar: 99,
      }),
      'pending_funding'
    )
  })

  it('routes restocks through bank evidence confirmation', () => {
    assert.equal(
      decideAutonomousAction({ ...base, cyclePhase: 'awaiting_recycle', awaitingKind: 'replenish' }),
      'confirm_from_bank_evidence'
    )
  })
})

describe('autonomous settlement identity and exposure', () => {
  it('builds stable SAST schedule keys across UTC midnight', () => {
    const lateThursdayUtc = Date.UTC(2026, 9, 29, 22, 30)
    assert.equal(scheduledRunId('09', lateThursdayUtc), '2026-10-30-0900')
    assert.equal(scheduledRunId('09', lateThursdayUtc), scheduledRunId('09', lateThursdayUtc))
  })

  it('recovers only due weekday schedule slots', () => {
    assert.deepEqual(dueScheduledSlots(Date.UTC(2026, 9, 30, 6, 59)), [])
    assert.deepEqual(dueScheduledSlots(Date.UTC(2026, 9, 30, 7, 0)), ['09'])
    assert.deepEqual(dueScheduledSlots(Date.UTC(2026, 9, 30, 13, 0)), ['09', '15'])
    assert.deepEqual(dueScheduledSlots(Date.UTC(2026, 9, 31, 13, 0)), [])
  })

  it('keeps wallet balances spendable while reporting exposure separately', () => {
    assert.deepEqual(
      normalizeExposure({
        walletZar: 1_000,
        walletMzn: 2_000,
        committedZar: 300,
        inTransitZar: 200,
      }),
      {
        walletZar: 1_000,
        walletMzn: 2_000,
        spendableZar: 1_000,
        spendableMzn: 2_000,
        committedZar: 300,
        inTransitZar: 200,
      }
    )
  })

  it('leases one scheduler worker and permits stale recovery', () => {
    const nowMs = Date.UTC(2026, 9, 30, 9)
    assert.equal(
      canClaimAutonomousRun({
        status: 'running',
        heartbeatMs: nowMs - 60_000,
        nowMs,
        leaseMs: 600_000,
      }),
      false
    )
    assert.equal(
      canClaimAutonomousRun({
        status: 'running',
        heartbeatMs: nowMs - 700_000,
        nowMs,
        leaseMs: 600_000,
      }),
      true
    )
    assert.equal(
      canClaimAutonomousRun({ status: 'completed', nowMs, leaseMs: 600_000 }),
      false
    )
  })

  it('conserves ZAR custody when cash is booked EN ROUTE', () => {
    assert.equal(zarCustodyTotal({ walletZar: 1_000, inTransitZar: 0 }), 1_000)
    assert.equal(zarCustodyTotal({ walletZar: 600, inTransitZar: 400 }), 1_000)
  })
})
