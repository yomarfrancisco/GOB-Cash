/**
 * Rolling features for a proposed COST swipe. Observe only — does not route.
 */

import { cardShortName, machineShortName } from './inventory'
import type { DeskReview, DeskTx, MerchantProfile } from './frictionHistory'
import { merchantProfile } from './frictionHistory'

const HOUR = 3_600_000
const DAY = 86_400_000

export type WindowStats = {
  count: number
  volume: number
}

export type CardFeatures = {
  count1d: number
  count7d: number
  count30d: number
  volume1d: number
  volume7d: number
  volume30d: number
  median7d: number | null
  median30d: number | null
  average7d: number | null
  average30d: number | null
  max30d: number | null
  amountVsMedian30d: number | null
  amountVsAverage30d: number | null
  hoursSinceLast: number | null
  consortiumShare30d: number | null
  declineCount30d: number
  reviewCount30d: number
}

export type MerchantFeatures = {
  daysSinceActivation: number | null
  lifetimeCount: number
  lifetimeVolume: number
  activeTradingDays: number
  count1d: number
  count7d: number
  count30d: number
  volume1d: number
  volume7d: number
  volume30d: number
  medianTicket: number | null
  averageTicket: number | null
  maxTicket: number | null
  observedMonthlyRunRate: number | null
  expectedMonthlyVolume: number | null
  profileConfidence: number
}

export type PairFeatures = {
  count1d: number
  count7d: number
  count30d: number
  volume1d: number
  volume7d: number
  volume30d: number
  hoursSinceLast: number | null
  lifetimeCount: number
  shareOfCard30d: number | null
  shareOfMerchant30d: number | null
}

export type ClusterFeatures = {
  merchant1h: number
  merchant6h: number
  merchant24h: number
  card1h: number
  card6h: number
  card24h: number
  pair1h: number
  pair6h: number
  pair24h: number
  medianMinutesBetween: number | null
  shortWindowAmount6h: number
}

export type FrictionSnapshot = {
  cardId: number
  merchantId: number
  amountZar: number
  cardName: string
  merchantName: string
  card: CardFeatures
  merchant: MerchantFeatures
  pair: PairFeatures
  cluster: ClusterFeatures
}

function windowOf(rows: DeskTx[], nowMs: number, ms: number): DeskTx[] {
  const from = nowMs - ms
  return rows.filter((row) => row.occurredAt >= from && row.occurredAt <= nowMs)
}

function stats(rows: DeskTx[]): WindowStats {
  return {
    count: rows.length,
    volume: rows.reduce((sum, row) => sum + row.amountZar, 0),
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function ratio(amount: number, baseline: number | null): number | null {
  if (!baseline || baseline <= 0) return null
  return amount / baseline
}

function hoursSince(rows: DeskTx[], nowMs: number): number | null {
  if (!rows.length) return null
  const last = Math.max(...rows.map((row) => row.occurredAt))
  return Math.max(0, (nowMs - last) / HOUR)
}

function tradingDays(rows: DeskTx[]): number {
  const days = new Set(rows.map((row) => Math.floor((row.occurredAt + 2 * HOUR) / DAY)))
  return days.size
}

export function merchantProfileConfidence(params: {
  daysSinceActivation: number | null
  lifetimeCount: number
  activeTradingDays: number
  observedMonthlyRunRate: number | null
  expectedMonthlyVolume: number | null
}): number {
  const age = params.daysSinceActivation == null ? 0 : Math.min(params.daysSinceActivation / 30, 1) * 0.35
  const count = Math.min(params.lifetimeCount / 40, 1) * 0.35
  const days = Math.min(params.activeTradingDays / 15, 1) * 0.2
  let expected = 0.1
  if (
    params.expectedMonthlyVolume &&
    params.expectedMonthlyVolume > 0 &&
    params.observedMonthlyRunRate != null
  ) {
    const drift = Math.min(
      Math.abs(params.observedMonthlyRunRate - params.expectedMonthlyVolume) / params.expectedMonthlyVolume,
      1
    )
    expected = (1 - drift) * 0.1
  } else if (params.lifetimeCount < 8) {
    expected = 0
  }
  return Math.round((age + count + days + expected) * 100) / 100
}

export function buildFrictionSnapshot(params: {
  proposed: { cardId: number; machineId: number; amount: number }
  history: DeskTx[]
  reviews?: DeskReview[]
  nowMs: number
  merchant?: MerchantProfile
}): FrictionSnapshot {
  const { proposed, history, nowMs } = params
  const reviews = params.reviews || []
  const merchantId = proposed.machineId
  const profile = params.merchant || merchantProfile(merchantId)
  const cardRows = history.filter((row) => row.cardId === proposed.cardId)
  const merchantRows = history.filter((row) => row.merchantId === merchantId)
  const pairRows = history.filter((row) => row.cardId === proposed.cardId && row.merchantId === merchantId)
  const card30 = windowOf(cardRows, nowMs, 30 * DAY)
  const card7 = windowOf(cardRows, nowMs, 7 * DAY)
  const card1 = windowOf(cardRows, nowMs, DAY)
  const merch30 = windowOf(merchantRows, nowMs, 30 * DAY)
  const merch7 = windowOf(merchantRows, nowMs, 7 * DAY)
  const merch1 = windowOf(merchantRows, nowMs, DAY)
  const pair30 = windowOf(pairRows, nowMs, 30 * DAY)
  const pair7 = windowOf(pairRows, nowMs, 7 * DAY)
  const pair1 = windowOf(pairRows, nowMs, DAY)
  const cardAmounts7 = card7.map((row) => row.amountZar)
  const cardAmounts30 = card30.map((row) => row.amountZar)
  const merchAmounts = merchantRows.map((row) => row.amountZar)
  const card30s = stats(card30)
  const merch30s = stats(merch30)
  const pair30s = stats(pair30)
  const daysSinceActivation =
    typeof profile.activatedAt === 'number' ? Math.max(0, (nowMs - profile.activatedAt) / DAY) : null
  const observedMonthlyRunRate =
    merch30s.volume > 0 ? merch30s.volume : merchantRows.length ? stats(merchantRows).volume : null
  const profileConfidence = merchantProfileConfidence({
    daysSinceActivation,
    lifetimeCount: merchantRows.length,
    activeTradingDays: tradingDays(merchantRows),
    observedMonthlyRunRate,
    expectedMonthlyVolume: profile.expectedMonthlyVolume ?? null,
  })
  const review30 = reviews.filter((row) => nowMs - row.startedAt <= 30 * DAY)
  const cardReview30 = review30.filter((row) => !row.cardId || row.cardId === proposed.cardId)
  const gaps = [...pairRows]
    .sort((a, b) => a.occurredAt - b.occurredAt)
    .slice(-6)
    .map((row, index, all) => (index === 0 ? null : (row.occurredAt - all[index - 1].occurredAt) / 60000))
    .filter((value): value is number => value != null)

  return {
    cardId: proposed.cardId,
    merchantId,
    amountZar: proposed.amount,
    cardName: cardShortName(proposed.cardId),
    merchantName: profile.name || machineShortName(merchantId),
    card: {
      count1d: stats(card1).count,
      count7d: stats(card7).count,
      count30d: card30s.count,
      volume1d: stats(card1).volume,
      volume7d: stats(card7).volume,
      volume30d: card30s.volume,
      median7d: median(cardAmounts7),
      median30d: median(cardAmounts30),
      average7d: average(cardAmounts7),
      average30d: average(cardAmounts30),
      max30d: cardAmounts30.length ? Math.max(...cardAmounts30) : null,
      amountVsMedian30d: ratio(proposed.amount, median(cardAmounts30)),
      amountVsAverage30d: ratio(proposed.amount, average(cardAmounts30)),
      hoursSinceLast: hoursSince(cardRows, nowMs),
      consortiumShare30d: card30s.count
        ? card30.filter((row) => row.consortium).length / card30s.count
        : null,
      declineCount30d: cardReview30.filter((row) => row.outcome === 'declined').length,
      reviewCount30d: cardReview30.filter((row) =>
        [
          'merchant_review',
          'manual_review',
          'documents_requested',
          'issuer_challenge',
          'settlement_hold',
          'temporarily_blocked',
        ].includes(row.outcome)
      ).length,
    },
    merchant: {
      daysSinceActivation,
      lifetimeCount: merchantRows.length,
      lifetimeVolume: stats(merchantRows).volume,
      activeTradingDays: tradingDays(merchantRows),
      count1d: stats(merch1).count,
      count7d: stats(merch7).count,
      count30d: merch30s.count,
      volume1d: stats(merch1).volume,
      volume7d: stats(merch7).volume,
      volume30d: merch30s.volume,
      medianTicket: median(merchAmounts),
      averageTicket: average(merchAmounts),
      maxTicket: merchAmounts.length ? Math.max(...merchAmounts) : null,
      observedMonthlyRunRate,
      expectedMonthlyVolume: profile.expectedMonthlyVolume ?? null,
      profileConfidence,
    },
    pair: {
      count1d: stats(pair1).count,
      count7d: stats(pair7).count,
      count30d: pair30s.count,
      volume1d: stats(pair1).volume,
      volume7d: stats(pair7).volume,
      volume30d: pair30s.volume,
      hoursSinceLast: hoursSince(pairRows, nowMs),
      lifetimeCount: pairRows.length,
      shareOfCard30d: card30s.volume > 0 ? pair30s.volume / card30s.volume : null,
      shareOfMerchant30d: merch30s.volume > 0 ? pair30s.volume / merch30s.volume : null,
    },
    cluster: {
      merchant1h: windowOf(merchantRows, nowMs, HOUR).length,
      merchant6h: windowOf(merchantRows, nowMs, 6 * HOUR).length,
      merchant24h: windowOf(merchantRows, nowMs, DAY).length,
      card1h: windowOf(cardRows, nowMs, HOUR).length,
      card6h: windowOf(cardRows, nowMs, 6 * HOUR).length,
      card24h: windowOf(cardRows, nowMs, DAY).length,
      pair1h: windowOf(pairRows, nowMs, HOUR).length,
      pair6h: windowOf(pairRows, nowMs, 6 * HOUR).length,
      pair24h: windowOf(pairRows, nowMs, DAY).length,
      medianMinutesBetween: median(gaps),
      shortWindowAmount6h: stats(windowOf(pairRows, nowMs, 6 * HOUR)).volume + proposed.amount,
    },
  }
}
