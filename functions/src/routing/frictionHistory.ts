/**
 * Durable desk history. Outlives a 20-cycle test and recentSwipes[40].
 * One swipe is one card-present row. Review side lives on review events.
 */

import type { SwipeRecord } from './friction'
import { machineShortName } from './inventory'

export const DESK_TX_COLLECTION = 'adminDeskTx'
export const DESK_REVIEW_COLLECTION = 'adminDeskReviews'
export const DESK_SNAPSHOT_COLLECTION = 'adminDeskSnapshots'
export const FRICTION_FEATURE_VERSION = 'friction_features_v1'
export const CONFIDENCE_HEURISTIC_VERSION = 'heuristic_v1'

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
  status: 'proposed' | 'executed'
  source: DeskTxSource
  testRunId?: string
  cycleNumber?: number
  proposedAt?: number
  executedAt?: number
  proposalSnapshotId?: string
  executionSnapshotId?: string
  restockGroupId?: string
  assignmentIndex?: number
  posReason?: string
  reconstruction?: boolean
}

export function restockGroupIdFor(testRunId: string, cycleNumber: number): string {
  return `restock-${testRunId}-c${cycleNumber}`
}

export type FrictionOutcome =
  | 'review_opened'
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
  reviewId: string
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
  /** Metadata only. Never an input to feature or band calculation. */
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

export function omitUndefined<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as T
}

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
  extra: {
    testRunId?: string
    source?: DeskTxSource
    consortium?: boolean
    status?: DeskTx['status']
    proposedAt?: number
    proposalSnapshotId?: string
    executionSnapshotId?: string
    restockGroupId?: string
    assignmentIndex?: number
    posReason?: string
  } = {}
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
    status: extra.status || 'executed',
    executedAt: extra.status === 'proposed' ? undefined : swipe.atMs,
    proposedAt: extra.proposedAt,
    source: extra.source || (extra.testRunId ? 'live_desk' : 'migrated_swipe'),
    testRunId: extra.testRunId,
    cycleNumber: swipe.cycleNumber,
    proposalSnapshotId: extra.proposalSnapshotId,
    executionSnapshotId: extra.executionSnapshotId,
    restockGroupId: extra.restockGroupId,
    assignmentIndex: extra.assignmentIndex,
    posReason: extra.posReason,
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
  return [...byKey.values()]
    .filter((row) => row.status !== 'proposed')
    .sort((a, b) => a.occurredAt - b.occurredAt)
}

export function outcomeFromLegacy(
  outcome: 'cleared' | 'docs' | 'declined' | 'review_cleared' | undefined,
  text = ''
): FrictionOutcome | null {
  if (outcome === 'docs') return 'documents_requested'
  if (outcome === 'declined') return 'declined'
  if (outcome === 'review_cleared') return 'review_cleared'
  if (outcome === 'cleared') {
    const lower = text.toLowerCase()
    if (/\b(after review|review then|manual review|review_cleared)\b/.test(lower)) return 'review_cleared'
    if (/\b(no (?:issue|problem|friction)|clean)\b/.test(lower)) return 'approved_no_friction'
    return null
  }
  return null
}
