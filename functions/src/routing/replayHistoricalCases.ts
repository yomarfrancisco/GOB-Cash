/**
 * Replay the current feature engine as-of each historical swipe.
 * caseTag and KNOWN_CASES are not passed into buildFrictionSnapshot or assessFriction.
 */

import { assessFriction, type FrictionAssessment } from './frictionAdvisor'
import { buildFrictionSnapshot, type FrictionSnapshot } from './frictionFeatures'
import { merchantProfile, type DeskReview, type DeskTx } from './frictionHistory'
import { CASE_A_REVIEWS, CASE_A_TXS, CASE_B_REVIEWS, CASE_B_TXS } from './historicalCases'
import { buildPersistedSnapshot, type PersistedFrictionSnapshot } from './frictionSnapshot'

export type AsOfRow = {
  transactionId: string
  occurredAt: number
  cardId: number
  merchantId: number
  amountZar: number
  snapshot: PersistedFrictionSnapshot
  proposalSnapshot: PersistedFrictionSnapshot
  executionSnapshot: PersistedFrictionSnapshot
}

function snapshotsAt(row: DeskTx, prior: DeskTx[], reviews: DeskReview[]): {
  proposalSnapshot: PersistedFrictionSnapshot
  executionSnapshot: PersistedFrictionSnapshot
} {
  const shared = {
    proposed: { cardId: row.cardId, machineId: row.machineId, amount: row.amountZar },
    history: prior,
    reviews,
    computedAt: row.occurredAt,
    historyCutoffAt: row.occurredAt,
    transactionId: row.id,
  }
  return {
    proposalSnapshot: buildPersistedSnapshot({ kind: 'proposal', ...shared }),
    executionSnapshot: buildPersistedSnapshot({ kind: 'execution', ...shared }),
  }
}

function replayCase(txs: DeskTx[], reviews: DeskReview[]): AsOfRow[] {
  return txs.map((row, index) => {
    const prior = txs.slice(0, index)
    const { proposalSnapshot, executionSnapshot } = snapshotsAt(row, prior, reviews)
    return {
      transactionId: row.id,
      occurredAt: row.occurredAt,
      cardId: row.cardId,
      merchantId: row.merchantId,
      amountZar: row.amountZar,
      snapshot: executionSnapshot,
      proposalSnapshot,
      executionSnapshot,
    }
  })
}

export function replayHistoricalCases(): {
  caseA: AsOfRow[]
  caseB: AsOfRow[]
  comparison: ReturnType<typeof compareAsOf>
} {
  const caseA = replayCase(CASE_A_TXS, CASE_A_REVIEWS)
  const caseB = replayCase(CASE_B_TXS, CASE_B_REVIEWS)
  return { caseA, caseB, comparison: compareAsOf(caseA, caseB) }
}

function rowById(rows: AsOfRow[], id: string): AsOfRow | undefined {
  return rows.find((row) => row.transactionId === id)
}

function firstNonLow(rows: AsOfRow[]): AsOfRow | undefined {
  return rows.find((row) => row.snapshot.band !== 'low')
}

function compareAsOf(caseA: AsOfRow[], caseB: AsOfRow[]) {
  const a = rowById(caseA, 'hist-a-7') || caseA[caseA.length - 1]
  const b = rowById(caseB, 'hist-b-7') || caseB[caseB.length - 1]
  const af = a.snapshot.features
  const bf = b.snapshot.features
  const firstA = firstNonLow(caseA)
  const firstB = firstNonLow(caseB)
  return {
    at: {
      caseA: { transactionId: a.transactionId, band: a.snapshot.band, dimensions: a.snapshot.dimensions },
      caseB: { transactionId: b.transactionId, band: b.snapshot.band, dimensions: b.snapshot.dimensions },
    },
    distinguished: {
      pairCount7d: { caseA: af.pair.count7d, caseB: bf.pair.count7d },
      pairShareOfCard30d: { caseA: af.pair.shareOfCard30d, caseB: bf.pair.shareOfCard30d },
      pair24h: { caseA: af.cluster.pair24h, caseB: bf.cluster.pair24h },
      pair6h: { caseA: af.cluster.pair6h, caseB: bf.cluster.pair6h },
      cardCount7d: { caseA: af.card.count7d, caseB: bf.card.count7d },
      cardVolume7d: { caseA: af.card.volume7d, caseB: bf.card.volume7d },
      merchantCount1d: { caseA: af.merchant.count1d, caseB: bf.merchant.count1d },
      merchantAgeDays: { caseA: af.merchant.daysSinceActivation, caseB: bf.merchant.daysSinceActivation },
      merchantLifetime: { caseA: af.merchant.lifetimeCount, caseB: bf.merchant.lifetimeCount },
      merchantBaseline: {
        caseA: af.merchant.profileConfidence.category,
        caseB: bf.merchant.profileConfidence.category,
        version: af.merchant.profileConfidence.version,
      },
      reviewCount30d: { caseA: af.card.reviewCount30d, caseB: bf.card.reviewCount30d },
    },
    common: {
      featureVersion: a.snapshot.featureVersion,
      consortiumShare30d: { caseA: af.card.consortiumShare30d, caseB: bf.card.consortiumShare30d },
      merchantBaselineCategory: {
        caseA: af.merchant.profileConfidence.category,
        caseB: bf.merchant.profileConfidence.category,
      },
    },
    reviewMetadataOnly: [
      'issuer and acquirer both involved (Case A)',
      'explicit split-sales question (Case A)',
      '35–42 day duration / 38 days (Case A)',
      'algorithm flagged this (Case B)',
      'analyst asked industry, ticket, pattern, local/international mix (Case B)',
      'rapid clearance and no later recurrence (Case B)',
      'caseTag values',
    ],
    wouldIdentifyBeforeReview: {
      caseA: {
        bandBeforeReviewOpened: a.snapshot.band,
        reviewCount30d: af.card.reviewCount30d,
        firstNonLow: firstA?.transactionId || null,
        firstNonLowBand: firstA?.snapshot.band || null,
        firstNonLowPairShareOfCard30d: firstA?.snapshot.features.pair.shareOfCard30d ?? null,
      },
      caseB: {
        bandBeforeReviewOpened: b.snapshot.band,
        reviewCount30d: bf.card.reviewCount30d,
        firstNonLow: firstB?.transactionId || null,
        firstNonLowBand: firstB?.snapshot.band || null,
        merchantAgeDays: firstB?.snapshot.features.merchant.daysSinceActivation ?? null,
        merchantLifetimeAtFirst: firstB?.snapshot.features.merchant.lifetimeCount ?? null,
      },
    },
    whereItFails: {
      caseALastBurstNeverHigh: a.snapshot.band !== 'high',
      caseAPair6hAtLast: af.cluster.pair6h,
      caseAPair24hAtLast: af.cluster.pair24h,
      caseAFirstNonLowIsSparsePrior: firstA?.transactionId === 'hist-a-prior-2',
      caseBBandIsMerchantAgeNotSevenTxPattern: b.snapshot.band === 'insufficient_history',
      caseBLastCard7d: bf.card.count7d,
      caseBLastPair7d: bf.pair.count7d,
      caseBLastMerchant1d: bf.merchant.count1d,
      reviewsInvisibleBeforeOpen: af.card.reviewCount30d === 0 && bf.card.reviewCount30d === 0,
    },
  }
}

export function assertEngineIgnoresCaseTag(): void {
  const lastA = CASE_A_TXS[CASE_A_TXS.length - 1]
  const lastB = CASE_B_TXS[CASE_B_TXS.length - 1]
  const strip = (rows: DeskReview[]) =>
    rows.map((row) => {
      const { caseTag: _ignored, ...rest } = row
      return rest
    })
  for (const [row, history, reviews] of [
    [lastA, CASE_A_TXS.slice(0, -1), CASE_A_REVIEWS],
    [lastB, CASE_B_TXS.slice(0, -1), CASE_B_REVIEWS],
  ] as Array<[DeskTx, DeskTx[], DeskReview[]]>) {
    const withTag = assessAt(row, history, reviews)
    const withoutTag = assessAt(row, history, strip(reviews))
    if (withTag.band !== withoutTag.band || withTag.body !== withoutTag.body) {
      throw new Error('caseTag changed the friction assessment')
    }
    const snap = buildFrictionSnapshot({
      proposed: { cardId: row.cardId, machineId: row.machineId, amount: row.amountZar },
      history,
      reviews,
      nowMs: row.occurredAt,
      historyCutoffAt: row.occurredAt,
      merchant: merchantProfile(row.machineId),
    })
    const encoded = JSON.stringify(snap)
    if (encoded.includes('caseTag') || encoded.includes('high_severity') || encoded.includes('algorithmic_profile')) {
      throw new Error('feature snapshot carried a case label')
    }
  }
}

function assessAt(row: DeskTx, history: DeskTx[], reviews: DeskReview[]): FrictionAssessment {
  const snap: FrictionSnapshot = buildFrictionSnapshot({
    proposed: { cardId: row.cardId, machineId: row.machineId, amount: row.amountZar },
    history,
    reviews,
    nowMs: row.occurredAt,
    historyCutoffAt: row.occurredAt,
    merchant: merchantProfile(row.machineId),
  })
  return assessFriction(snap)
}
