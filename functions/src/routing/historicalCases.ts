/**
 * Reproducible historical backfill.
 * Exact statement tickets were not in the repo. Rows marked reconstruction=true
 * are dated reconstructions from the reviewer-stated facts. Replace them when
 * the statements arrive. caseTag is metadata only.
 */

import { sastToUtcMs } from './routingTime'
import type { DeskReview, DeskTx } from './frictionHistory'

function tx(params: {
  id: string
  at: number
  cardId: number
  machineId: number
  amountZar: number
}): DeskTx {
  return {
    id: params.id,
    occurredAt: params.at,
    cardId: params.cardId,
    merchantId: params.machineId,
    machineId: params.machineId,
    amountZar: params.amountZar,
    currency: 'ZAR',
    country: 'ZA',
    channel: 'card_present',
    consortium: true,
    status: 'executed',
    source: 'historical_backfill',
    executedAt: params.at,
    proposedAt: params.at,
    reconstruction: true,
  }
}

function review(params: {
  id: string
  reviewId: string
  at: number
  outcome: DeskReview['outcome']
  notes: string
  cardId?: number
  merchantId?: number
  transactionId?: string
  reviewSource: DeskReview['reviewSource']
  side: DeskReview['side']
  institution?: string
  severity: DeskReview['severity']
  resolvedAt?: number
  durationHours?: number
  caseTag?: string
}): DeskReview {
  return {
    id: params.id,
    reviewId: params.reviewId,
    startedAt: params.at,
    outcome: params.outcome,
    notes: params.notes,
    rawText: params.notes,
    cardId: params.cardId,
    merchantId: params.merchantId,
    transactionId: params.transactionId,
    reviewSource: params.reviewSource,
    sourceConfidence: params.reviewSource === 'unknown' || params.reviewSource === 'multiple' ? 'medium' : 'high',
    side: params.side,
    institution: params.institution,
    severity: params.severity,
    resolvedAt: params.resolvedAt,
    durationHours: params.durationHours,
    source: 'historical_backfill',
    caseTag: params.caseTag,
  }
}

/** Vidrotec BIM on FNB BRICS. Sparse May, burst 16–19 Jun, review 20 Jun–28 Jul (38 days). */
export const CASE_A_TXS: DeskTx[] = [
  tx({ id: 'hist-a-prior-1', at: sastToUtcMs(2026, 5, 8, 11, 20), cardId: 2, machineId: 1, amountZar: 4_000 }),
  tx({ id: 'hist-a-prior-2', at: sastToUtcMs(2026, 5, 22, 14, 5), cardId: 2, machineId: 1, amountZar: 3_500 }),
  tx({ id: 'hist-a-1', at: sastToUtcMs(2026, 6, 16, 9, 40), cardId: 2, machineId: 1, amountZar: 12_000 }),
  tx({ id: 'hist-a-2', at: sastToUtcMs(2026, 6, 16, 15, 10), cardId: 2, machineId: 1, amountZar: 14_000 }),
  tx({ id: 'hist-a-3', at: sastToUtcMs(2026, 6, 17, 10, 5), cardId: 2, machineId: 1, amountZar: 15_000 }),
  tx({ id: 'hist-a-4', at: sastToUtcMs(2026, 6, 17, 16, 40), cardId: 2, machineId: 1, amountZar: 13_500 }),
  tx({ id: 'hist-a-5', at: sastToUtcMs(2026, 6, 18, 11, 20), cardId: 2, machineId: 1, amountZar: 15_000 }),
  tx({ id: 'hist-a-6', at: sastToUtcMs(2026, 6, 18, 17, 5), cardId: 2, machineId: 1, amountZar: 14_800 }),
  tx({ id: 'hist-a-7', at: sastToUtcMs(2026, 6, 19, 12, 0), cardId: 2, machineId: 1, amountZar: 15_000 }),
]

export const CASE_A_REVIEWS: DeskReview[] = [
  review({
    id: 'hist-a-opened',
    reviewId: 'review-bim-fnb-2026-06',
    at: sastToUtcMs(2026, 6, 20, 9, 0),
    outcome: 'review_opened',
    notes: 'Cross-institution review opened after the June Vidrotec / FNB BRICS burst.',
    cardId: 2,
    merchantId: 1,
    transactionId: 'hist-a-7',
    reviewSource: 'multiple',
    side: 'multiple',
    institution: 'BIM, FNB',
    severity: 'high',
    caseTag: 'high_severity_cross_institution_review',
  }),
  review({
    id: 'hist-a-docs',
    reviewId: 'review-bim-fnb-2026-06',
    at: sastToUtcMs(2026, 6, 25, 11, 30),
    outcome: 'documents_requested',
    notes: 'Documents requested.',
    cardId: 2,
    merchantId: 1,
    reviewSource: 'acquirer',
    side: 'acquirer',
    institution: 'FNB',
    severity: 'high',
    caseTag: 'high_severity_cross_institution_review',
  }),
  review({
    id: 'hist-a-split',
    reviewId: 'review-bim-fnb-2026-06',
    at: sastToUtcMs(2026, 6, 27, 10, 15),
    outcome: 'manual_review',
    notes: 'Acquirer asked for the reason for split sales. That is the question they asked, not a label we assign.',
    cardId: 2,
    merchantId: 1,
    reviewSource: 'acquirer',
    side: 'acquirer',
    institution: 'FNB',
    severity: 'high',
    caseTag: 'high_severity_cross_institution_review',
  }),
  review({
    id: 'hist-a-issuer',
    reviewId: 'review-bim-fnb-2026-06',
    at: sastToUtcMs(2026, 6, 30, 14, 0),
    outcome: 'issuer_challenge',
    notes: 'Issuer also involved. Network escalation is unproven. Do not assert Visa.',
    cardId: 2,
    merchantId: 1,
    reviewSource: 'issuer',
    side: 'issuer',
    institution: 'BIM',
    severity: 'high',
    caseTag: 'high_severity_cross_institution_review',
  }),
  review({
    id: 'hist-a-cleared',
    reviewId: 'review-bim-fnb-2026-06',
    at: sastToUtcMs(2026, 7, 28, 16, 0),
    outcome: 'review_cleared',
    notes: 'Review cleared after documents. Duration about 38 days (inside 35–42).',
    cardId: 2,
    merchantId: 1,
    reviewSource: 'multiple',
    side: 'multiple',
    institution: 'BIM, FNB',
    severity: 'high',
    resolvedAt: sastToUtcMs(2026, 7, 28, 16, 0),
    durationHours: 38 * 24,
    caseTag: 'high_severity_cross_institution_review',
  }),
]

/** Capitec BRICS. Seven 20 Jul tickets sum to R71,200 across four cards. */
export const CASE_B_TXS: DeskTx[] = [
  tx({ id: 'hist-b-1', at: sastToUtcMs(2026, 7, 20, 9, 12), cardId: 1, machineId: 2, amountZar: 21_000 }),
  tx({ id: 'hist-b-2', at: sastToUtcMs(2026, 7, 20, 10, 40), cardId: 2, machineId: 2, amountZar: 18_500 }),
  tx({ id: 'hist-b-3', at: sastToUtcMs(2026, 7, 20, 12, 5), cardId: 4, machineId: 2, amountZar: 14_200 }),
  tx({ id: 'hist-b-4', at: sastToUtcMs(2026, 7, 20, 13, 30), cardId: 5, machineId: 2, amountZar: 9_800 }),
  tx({ id: 'hist-b-5', at: sastToUtcMs(2026, 7, 20, 15, 10), cardId: 1, machineId: 2, amountZar: 5_600 }),
  tx({ id: 'hist-b-6', at: sastToUtcMs(2026, 7, 20, 16, 45), cardId: 2, machineId: 2, amountZar: 2_000 }),
  tx({ id: 'hist-b-7', at: sastToUtcMs(2026, 7, 20, 18, 20), cardId: 4, machineId: 2, amountZar: 100 }),
]

export const CASE_B_REVIEWS: DeskReview[] = [
  review({
    id: 'hist-b-opened',
    reviewId: 'review-capitec-2026-07',
    at: sastToUtcMs(2026, 7, 20, 19, 0),
    outcome: 'review_opened',
    notes: 'Analyst said the algorithm flagged this. Settlement hold opened.',
    merchantId: 2,
    transactionId: 'hist-b-7',
    reviewSource: 'acquirer',
    side: 'acquirer',
    institution: 'Capitec',
    severity: 'medium',
    caseTag: 'new_merchant_algorithmic_profile_review',
  }),
  review({
    id: 'hist-b-hold',
    reviewId: 'review-capitec-2026-07',
    at: sastToUtcMs(2026, 7, 20, 19, 5),
    outcome: 'settlement_hold',
    notes: 'Settlement hold while the merchant profile was calibrated.',
    merchantId: 2,
    reviewSource: 'acquirer',
    side: 'acquirer',
    institution: 'Capitec',
    severity: 'medium',
    caseTag: 'new_merchant_algorithmic_profile_review',
  }),
  review({
    id: 'hist-b-questions',
    reviewId: 'review-capitec-2026-07',
    at: sastToUtcMs(2026, 7, 20, 19, 20),
    outcome: 'documents_requested',
    notes:
      'Analyst asked for industry, typical payment sizes, expected transaction patterns, and local vs international card mix. Too few transactions to establish a reliable pattern.',
    merchantId: 2,
    reviewSource: 'acquirer',
    side: 'acquirer',
    institution: 'Capitec',
    severity: 'low',
    caseTag: 'new_merchant_algorithmic_profile_review',
  }),
  review({
    id: 'hist-b-cleared',
    reviewId: 'review-capitec-2026-07',
    at: sastToUtcMs(2026, 7, 21, 14, 0),
    outcome: 'review_cleared',
    notes: 'Profile clarification/calibration. Rapid clearance. No subsequently observed recurring problem.',
    merchantId: 2,
    reviewSource: 'acquirer',
    side: 'acquirer',
    institution: 'Capitec',
    severity: 'low',
    resolvedAt: sastToUtcMs(2026, 7, 21, 14, 0),
    durationHours: 19,
    caseTag: 'new_merchant_algorithmic_profile_review',
  }),
]

export const HISTORICAL_TXS: DeskTx[] = [...CASE_A_TXS, ...CASE_B_TXS]
export const HISTORICAL_REVIEWS: DeskReview[] = [...CASE_A_REVIEWS, ...CASE_B_REVIEWS]
