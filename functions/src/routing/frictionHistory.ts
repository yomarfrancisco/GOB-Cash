/**
 * Durable desk history. Outlives a 20-cycle test and recentSwipes[40].
 * One swipe is one card-present row. Review side lives on review events.
 */

import type { SwipeRecord } from './friction'
import { machineShortName } from './inventory'

export const DESK_TX_COLLECTION = 'adminDeskTx'
export const DESK_REVIEW_COLLECTION = 'adminDeskReviews'

export type DeskTxSource = 'live_desk' | 'imported_statement' | 'historical_backfill' | 'migrated_swipe'

export type DeskTx = {
  id: string
  occurredAt: number
  cardId: number
  merchantId: number
  machineId: number
  amountZar: number
  currency: 'ZAR'
  country: 'ZA'
  channel: 'card_present'
  consortium: boolean
  status: 'executed'
  source: DeskTxSource
  testRunId?: string
  cycleNumber?: number
}

export type FrictionOutcome =
  | 'approved_no_friction'
  | 'declined'
  | 'issuer_challenge'
  | 'merchant_review'
  | 'manual_review'
  | 'documents_requested'
  | 'temporarily_blocked'
  | 'settlement_hold'
  | 'approved_after_review'
  | 'review_cleared'
  | 'review_failed'

export type ReviewSource = 'issuer' | 'acquirer' | 'network' | 'multiple' | 'unknown'
export type Confidence = 'low' | 'medium' | 'high'
export type ReviewSeverity = 'low' | 'medium' | 'high'

export type DeskReview = {
  id: string
  transactionId?: string
  cardId?: number
  merchantId?: number
  outcome: FrictionOutcome
  startedAt: number
  resolvedAt?: number
  durationHours?: number
  institution?: string
  reviewSource: ReviewSource
  sourceConfidence: Confidence
  side: ReviewSource
  severity: ReviewSeverity
  notes: string
  rawText: string
  source: 'live_desk' | 'historical_backfill'
  caseTag?: string
}

export type MerchantProfile = {
  merchantId: number
  name: string
  activatedAt?: number
  industry?: string
  expectedTypicalTicket?: number
  expectedTicketMin?: number
  expectedTicketMax?: number
  expectedMonthlyVolume?: number
  expectedLocalCardShare?: number
  expectedInternationalCardShare?: number
}

/** Capitec acquiring profile from Case B. Other POS ages are unknown until backfill. */
export const DEFAULT_MERCHANT_PROFILES: MerchantProfile[] = [
  { merchantId: 1, name: 'FNB BRICS' },
  {
    merchantId: 2,
    name: 'Capitec BRICS',
    activatedAt: Date.parse('2026-07-15T00:00:00+02:00'),
    industry: 'merchant acquiring',
  },
  { merchantId: 3, name: 'FNB IMANI' },
  { merchantId: 4, name: 'FNB Wolf' },
]

export function merchantProfile(merchantId: number, overlays: MerchantProfile[] = []): MerchantProfile {
  const overlay = overlays.find((row) => row.merchantId === merchantId)
  const seeded = DEFAULT_MERCHANT_PROFILES.find((row) => row.merchantId === merchantId)
  return {
    merchantId,
    name: overlay?.name || seeded?.name || machineShortName(merchantId),
    ...(seeded || {}),
    ...(overlay || {}),
  }
}

export function deskTxId(params: { testRunId?: string; swipeId: string; occurredAt: number }): string {
  if (params.testRunId) return `desk-${params.testRunId}-${params.swipeId}`
  return `desk-${params.swipeId}-${params.occurredAt}`
}

export function deskTxFromSwipe(
  swipe: SwipeRecord,
  extra: { testRunId?: string; source?: DeskTxSource; consortium?: boolean } = {}
): DeskTx {
  return {
    id: deskTxId({ testRunId: extra.testRunId, swipeId: swipe.id, occurredAt: swipe.atMs }),
    occurredAt: swipe.atMs,
    cardId: swipe.cardId,
    merchantId: swipe.machineId,
    machineId: swipe.machineId,
    amountZar: swipe.amount,
    currency: 'ZAR',
    country: 'ZA',
    channel: 'card_present',
    consortium: extra.consortium !== false,
    status: 'executed',
    source: extra.source || (extra.testRunId ? 'live_desk' : 'migrated_swipe'),
    testRunId: extra.testRunId,
    cycleNumber: swipe.cycleNumber,
  }
}

export function mergeDeskHistory(durable: DeskTx[], swipes: SwipeRecord[], testRunId?: string): DeskTx[] {
  const byKey = new Map<string, DeskTx>()
  for (const row of durable) {
    byKey.set(`${row.cardId}:${row.machineId}:${row.occurredAt}:${row.amountZar}`, row)
  }
  for (const swipe of swipes) {
    const converted = deskTxFromSwipe(swipe, { testRunId, source: 'migrated_swipe' })
    const key = `${converted.cardId}:${converted.machineId}:${converted.occurredAt}:${converted.amountZar}`
    if (!byKey.has(key)) byKey.set(key, converted)
  }
  return [...byKey.values()].sort((a, b) => a.occurredAt - b.occurredAt)
}

export function outcomeFromLegacy(
  outcome: 'cleared' | 'docs' | 'declined' | 'review_cleared' | undefined
): FrictionOutcome | null {
  if (outcome === 'cleared') return 'approved_no_friction'
  if (outcome === 'docs') return 'documents_requested'
  if (outcome === 'declined') return 'declined'
  if (outcome === 'review_cleared') return 'review_cleared'
  return null
}
