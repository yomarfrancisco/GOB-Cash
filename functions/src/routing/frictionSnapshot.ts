/**
 * Persistable friction snapshot. Frozen at computedAt against history before historyCutoffAt.
 */

import { assessFriction, type FrictionAssessment } from './frictionAdvisor'
import { buildFrictionSnapshot, type FrictionSnapshot } from './frictionFeatures'
import {
  FRICTION_FEATURE_VERSION,
  merchantProfile,
  type DeskReview,
  type DeskTx,
  type MerchantProfile,
} from './frictionHistory'

export type PersistedFrictionSnapshot = {
  id: string
  kind: 'proposal' | 'execution'
  featureVersion: typeof FRICTION_FEATURE_VERSION
  computedAt: number
  historyCutoffAt: number
  transactionId?: string
  testRunId?: string
  cycleNumber?: number
  proposed: { cardId: number; machineId: number; amountZar: number }
  features: Pick<FrictionSnapshot, 'card' | 'merchant' | 'pair' | 'cluster'>
  band: FrictionAssessment['band']
  reasons: string[]
  dimensions: FrictionAssessment['dimensions']
  title: string
  body: string
}

export function snapshotId(params: {
  kind: 'proposal' | 'execution'
  cardId: number
  machineId: number
  atMs: number
  testRunId?: string
  cycleNumber?: number
}): string {
  const run = params.testRunId || 'hist'
  const cycle = params.cycleNumber ?? 0
  return `snap-${params.kind}-${run}-c${cycle}-${params.cardId}-${params.machineId}-${params.atMs}`
}

export function buildPersistedSnapshot(params: {
  kind: 'proposal' | 'execution'
  proposed: { cardId: number; machineId: number; amount: number }
  history: DeskTx[]
  reviews?: DeskReview[]
  computedAt: number
  historyCutoffAt?: number
  transactionId?: string
  testRunId?: string
  cycleNumber?: number
  profiles?: MerchantProfile[]
}): PersistedFrictionSnapshot {
  const historyCutoffAt = params.historyCutoffAt ?? params.computedAt
  const snap = buildFrictionSnapshot({
    proposed: params.proposed,
    history: params.history,
    reviews: params.reviews,
    nowMs: params.computedAt,
    historyCutoffAt,
    merchant: merchantProfile(params.proposed.machineId, params.profiles),
  })
  const assessment = assessFriction(snap)
  return {
    id: snapshotId({
      kind: params.kind,
      cardId: params.proposed.cardId,
      machineId: params.proposed.machineId,
      atMs: params.computedAt,
      testRunId: params.testRunId,
      cycleNumber: params.cycleNumber,
    }),
    kind: params.kind,
    featureVersion: snap.featureVersion,
    computedAt: snap.computedAt,
    historyCutoffAt: snap.historyCutoffAt,
    transactionId: params.transactionId,
    testRunId: params.testRunId,
    cycleNumber: params.cycleNumber,
    proposed: {
      cardId: params.proposed.cardId,
      machineId: params.proposed.machineId,
      amountZar: params.proposed.amount,
    },
    features: {
      card: snap.card,
      merchant: snap.merchant,
      pair: snap.pair,
      cluster: snap.cluster,
    },
    band: assessment.band,
    reasons: assessment.body ? assessment.body.split(/(?<=\.)\s+/).filter(Boolean) : [],
    dimensions: assessment.dimensions,
    title: assessment.title,
    body: assessment.body,
  }
}
