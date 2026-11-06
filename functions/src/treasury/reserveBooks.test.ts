import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateFromAvailable,
  refillTowardTarget,
  RESERVE_DEFAULTS,
  splitDestAgainstReserve,
} from './reserveBooks'
import { reserveSplitDeskCopy } from './reserveDeskCopy'

describe('reserveBooks', () => {
  it('boots ZAR at R100k and MZN at Mt 0', () => {
    assert.equal(RESERVE_DEFAULTS.ZAR.fiatBalance, 100_000)
    assert.equal(RESERVE_DEFAULTS.ZAR.targetBalance, 100_000)
    assert.equal(RESERVE_DEFAULTS.MZN.fiatBalance, 0)
    assert.equal(RESERVE_DEFAULTS.MZN.targetBalance, 0)
  })

  it('allocates up to available reserve only', () => {
    assert.equal(allocateFromAvailable(30_000, 20_000), 20_000)
    assert.equal(allocateFromAvailable(30_000, 50_000), 30_000)
    assert.equal(allocateFromAvailable(0, 10_000), 0)
  })

  it('splits R60k against R50k reserve into instant + routed', () => {
    const split = splitDestAgainstReserve({
      wantDest: 60_000,
      reserveAvailable: 50_000,
      totalSource: 240_000,
    })
    assert.equal(split.instantDest, 50_000)
    assert.equal(split.routedDest, 10_000)
    assert.equal(split.instantSource, 200_000)
    assert.equal(split.routedSource, 40_000)
  })

  it('refills toward target before surplus', () => {
    const { toReserve, surplus } = refillTowardTarget({
      balance: 10_000,
      targetBalance: 30_000,
      availableCredit: 25_000,
    })
    assert.equal(toReserve, 20_000)
    assert.equal(surplus, 5_000)
  })
})

describe('reserveDeskCopy', () => {
  it('explains a reserve + ROUTE split clearly', () => {
    const copy = reserveSplitDeskCopy({
      destCurrency: 'ZAR',
      fundedDest: 60_000,
      instantDest: 30_000,
      routedDest: 30_000,
      settleAtMs: Date.now() + 20 * 3_600_000,
    })
    assert.match(copy.deskSentence, /paid out now from reserve/i)
    assert.match(copy.deskSentence, /on ROUTE/i)
    assert.equal(copy.deskLedgerRows[0]?.label, 'Funded')
    assert.equal(copy.deskStep, 3)
  })

  it('explains full instant payout', () => {
    const copy = reserveSplitDeskCopy({
      destCurrency: 'ZAR',
      fundedDest: 20_000,
      instantDest: 20_000,
      routedDest: 0,
    })
    assert.match(copy.dropdownBody, /reserve/i)
    assert.equal(copy.deskStep, 4)
  })
})
