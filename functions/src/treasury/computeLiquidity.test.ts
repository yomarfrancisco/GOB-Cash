import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleLiquidityPipe,
  diffLiquiditySnapshots,
  pickLiquidityRate,
} from './computeLiquidity'
import { mergeEftBook, splitReplacementChannels } from '../routing/channelSplit'

describe('computeLiquidity pipe', () => {
  const atMs = Date.parse('2026-11-07T00:00:00+02:00')

  it('fullLiquidityAt is the latest landsAt, not the next clearing window', () => {
    const rate = 4.1303
    const cashMzn = 19_125_346.13
    const snap = assembleLiquidityPipe({
      atMs,
      cashMzn,
      liquidZar: 22_025.09,
      clearingZar: 5_105.97,
      rate,
    })
    assert.ok(snap.fullLiquidityAt != null)
    const clearingMs = snap.states.find((s) => s.kind === 'clearing')?.landsAt
    assert.ok(clearingMs != null)
    assert.ok(snap.fullLiquidityAt! > clearingMs!)
    const lands = snap.states
      .map((s) => s.landsAt)
      .filter((ms): ms is number => ms != null)
    assert.equal(snap.fullLiquidityAt, Math.max(...lands))
  })

  it('reconciles states to funded ÷ rate within a cent', () => {
    const rate = 4.1303
    const snap = assembleLiquidityPipe({
      atMs,
      cashMzn: 19_125_346.13,
      liquidZar: 22_025.09,
      clearingZar: 5_105.97,
      rate,
    })
    const sum = snap.states.reduce((s, r) => s + r.amountZar, 0)
    assert.ok(Math.abs(sum - snap.fundedZar) < 0.02)
    assert.equal(snap.reconciled, true)
  })

  it('prefers open EFT book tickets for EFT dates', () => {
    const split = splitReplacementChannels({
      amountZar: 1_625_000,
      nowMs: atMs,
      shockId: 'test-eft',
    })
    // Force an EFT-heavy book by merging a large EFT split.
    const big = splitReplacementChannels({
      amountZar: 2_000_000,
      nowMs: atMs,
      shockId: 'big',
    })
    const book = mergeEftBook(null, { ...big, eftTickets: big.eftTickets, cardTickets: [] })
    const snap = assembleLiquidityPipe({
      atMs,
      cashMzn: 8_260_600, // ≈ R2m at 4.1303
      liquidZar: 0,
      clearingZar: 0,
      rate: 4.1303,
      eftBook: book,
    })
    const eft = snap.states.filter((s) => s.kind === 'eft')
    assert.ok(eft.length >= 1)
    assert.ok(eft.every((s) => s.landsAt != null))
    void split
  })

  it('pickLiquidityRate prefers frozen cost over sell', () => {
    assert.equal(
      pickLiquidityRate({ frozenCostRate: 4.13, orderSellRate: 4.543, openWeightedCostRate: 4.1 }),
      4.13
    )
    assert.equal(pickLiquidityRate({ orderSellRate: 4.543 }), Math.round((4.543 / 1.1) * 100) / 100)
  })

  it('diff lists funding, rate, and full-liquidity moves', () => {
    const prior = assembleLiquidityPipe({
      atMs,
      cashMzn: 17_125_346.13,
      liquidZar: 22_025.09,
      clearingZar: 5_105.97,
      rate: 4.1303,
    })
    const live = assembleLiquidityPipe({
      atMs: atMs + 72 * 60_000,
      cashMzn: 19_125_346.13,
      liquidZar: 22_025.09,
      clearingZar: 5_105.97,
      rate: 4.1287,
    })
    const lines = diffLiquiditySnapshots(prior, live)
    assert.ok(lines.some((l) => /MZN funded/.test(l)))
    assert.ok(lines.some((l) => /Rate now/.test(l)))
  })

  it('schedules residual like the routing plan: card planned days + EFT T+2', () => {
    const openAt = Date.parse('2026-11-10T09:00:00+02:00')
    const snap = assembleLiquidityPipe({
      atMs,
      cashMzn: 4.1303 * 250_000, // R250k residual
      liquidZar: 10_000,
      clearingZar: 0,
      rate: 4.1303,
      nextOpenBookedZar: 30_000,
      nextOpenAtMs: openAt,
    })
    const cards = snap.states.filter((s) => s.kind === 'card')
    const eft = snap.states.filter((s) => s.kind === 'eft')
    assert.equal(cards.length, 3)
    assert.ok(cards.every((c) => c.amountZar <= 30_000.02))
    assert.equal(cards[0]!.amountZar, 30_000)
    assert.equal(cards[0]!.landsAt, openAt)
    assert.match(cards[0]!.label, /card/)
    assert.equal(eft.length, 1)
    assert.ok(eft[0]!.amountZar > 150_000)
    assert.match(eft[0]!.label, /EFT · T\+2/)
    assert.equal(snap.states.filter((s) => s.kind === 'reserve' || s.kind === 'queued').length, 0)
    const sum = snap.states.reduce((s, r) => s + r.amountZar, 0)
    assert.ok(Math.abs(sum - snap.fundedZar) < 0.02)
  })

  it('small residual stays on card days only (no EFT)', () => {
    const openAt = Date.parse('2026-11-10T09:00:00+02:00')
    const snap = assembleLiquidityPipe({
      atMs,
      cashMzn: 4.1303 * 50_000,
      liquidZar: 0,
      clearingZar: 0,
      rate: 4.1303,
      nextOpenBookedZar: 0,
      nextOpenAtMs: openAt,
    })
    const cards = snap.states.filter((s) => s.kind === 'card')
    assert.equal(cards.length, 2) // 30k + 20k
    assert.equal(snap.states.filter((s) => s.kind === 'eft').length, 0)
    assert.equal(snap.states.filter((s) => s.kind === 'queued').length, 0)
  })
})
