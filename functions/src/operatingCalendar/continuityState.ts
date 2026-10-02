/**
 * Persistent operating-calendar continuity state.
 * Carries across 14-day desk windows and calendar months — never reset on month boundary.
 */
import { createHash } from 'crypto'
import {
  OPERATING_POLICY_V1,
  OPERATING_POLICY_VERSION,
  type CardId,
  type LifecycleState,
  type MerchantPrincipalId,
  type NetworkColdState,
  type TerminalId,
} from './operatingPolicyV1'

export type RouteProof = {
  cardId: CardId
  terminalId: TerminalId
  merchantPrincipalId: MerchantPrincipalId
  acquirerBankId: string
  usableZarAt: string
  amountZar: number
  instructionId: string
}

export type SettlementLatencyObs = {
  terminalId: TerminalId
  acquirerBankId: string
  authorisedAt: string
  usableAt: string
  latencyHours: number
}

export type PendingExposureItem = {
  instructionId: string
  cardId: CardId
  terminalId: TerminalId
  amountZar: number
  lifecycleState: LifecycleState
  expectedBy: string | null
  overdue: boolean
}

export type ContinuityStateV1 = {
  policyVersion: typeof OPERATING_POLICY_VERSION
  networkState: NetworkColdState
  evidenceSupportedDailyCeilingZar: number
  authorisedGrowthRate: number
  workingLiquidityZar: number
  operatingBufferPct: number
  frozenCardIds: CardId[]
  frozenTerminalIds: TerminalId[]
  /** Append-only usable-ZAR proofs — silence never creates these. */
  routeProofs: RouteProof[]
  settlementLatency: SettlementLatencyObs[]
  pendingExposure: PendingExposureItem[]
  openDelays: string[]
  openReviews: string[]
  openReversals: string[]
  /** ISO date strings of attempts (trailing windows derived from these). */
  cardAttemptDates: Record<string, string[]>
  principalAttemptDates: Record<string, string[]> // card|principal
  terminalAttemptDates: Record<string, string[]>
  terminalAttemptValues: Record<string, Array<{ date: string; amountZar: number }>>
  cardCleanUsableCount: Record<string, number>
  cardPrincipalsTouched: Record<string, string[]>
  cardAcquirersTouched: Record<string, string[]>
  cardMaturityStage: Record<string, 'A' | 'B' | 'C' | 'established'>
  invoiceBacklog: Array<{ invoiceId: string; amountZar: number; merchantPrincipalId: string }>
  inputHash: string
  outputHash: string
  updatedAt: string
}

export function emptyContinuityState(params?: {
  networkState?: NetworkColdState
  workingLiquidityZar?: number
  authorisedGrowthRate?: number
}): ContinuityStateV1 {
  const policy = OPERATING_POLICY_V1
  return {
    policyVersion: OPERATING_POLICY_VERSION,
    networkState: params?.networkState || 'cold_start',
    evidenceSupportedDailyCeilingZar: policy.network.coldDailyCeilingZar,
    authorisedGrowthRate: params?.authorisedGrowthRate ?? 0,
    workingLiquidityZar: params?.workingLiquidityZar ?? 0,
    operatingBufferPct: policy.liquidity.defaultOperatingBufferPct,
    frozenCardIds: [],
    frozenTerminalIds: [],
    routeProofs: [],
    settlementLatency: [],
    pendingExposure: [],
    openDelays: [],
    openReviews: [],
    openReversals: [],
    cardAttemptDates: {},
    principalAttemptDates: {},
    terminalAttemptDates: {},
    terminalAttemptValues: {},
    cardCleanUsableCount: {},
    cardPrincipalsTouched: {},
    cardAcquirersTouched: {},
    cardMaturityStage: {},
    invoiceBacklog: [],
    inputHash: '',
    outputHash: '',
    updatedAt: new Date(0).toISOString(),
  }
}

export function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function pushCapped(map: Record<string, string[]>, key: string, date: string, cap = 60) {
  const list = map[key] || []
  list.push(date)
  map[key] = list.slice(-cap)
}

export function recordIssuedAttempt(
  state: ContinuityStateV1,
  row: {
    cardId: CardId
    terminalId: TerminalId
    merchantPrincipalId: MerchantPrincipalId
    amountZar: number
    date: string
    instructionId: string
    expectedBy?: string | null
  }
): ContinuityStateV1 {
  const next = structuredClone(state)
  pushCapped(next.cardAttemptDates, row.cardId, row.date)
  pushCapped(next.principalAttemptDates, `${row.cardId}|${row.merchantPrincipalId}`, row.date)
  pushCapped(next.terminalAttemptDates, row.terminalId, row.date)
  const tv = next.terminalAttemptValues[row.terminalId] || []
  tv.push({ date: row.date, amountZar: row.amountZar })
  next.terminalAttemptValues[row.terminalId] = tv.slice(-80)
  next.pendingExposure.push({
    instructionId: row.instructionId,
    cardId: row.cardId,
    terminalId: row.terminalId,
    amountZar: row.amountZar,
    lifecycleState: 'authorised',
    expectedBy: row.expectedBy ?? null,
    overdue: false,
  })
  next.updatedAt = new Date().toISOString()
  return next
}

/**
 * Auth/capture update pending exposure but do NOT advance maturity.
 */
export function recordLifecycleProgress(
  state: ContinuityStateV1,
  instructionId: string,
  lifecycleState: LifecycleState
): ContinuityStateV1 {
  const next = structuredClone(state)
  const item = next.pendingExposure.find((p) => p.instructionId === instructionId)
  if (item) item.lifecycleState = lifecycleState
  next.updatedAt = new Date().toISOString()
  return next
}

/**
 * Only final usable ZAR creates a route proof and advances card maturity.
 * Silence must never call this.
 */
export function recordUsableZar(
  state: ContinuityStateV1,
  proof: RouteProof,
  authorisedAt?: string
): ContinuityStateV1 {
  const next = structuredClone(state)
  next.routeProofs.push(proof)
  next.pendingExposure = next.pendingExposure.filter((p) => p.instructionId !== proof.instructionId)
  const clean = (next.cardCleanUsableCount[proof.cardId] || 0) + 1
  next.cardCleanUsableCount[proof.cardId] = clean
  const principals = new Set(next.cardPrincipalsTouched[proof.cardId] || [])
  principals.add(proof.merchantPrincipalId)
  next.cardPrincipalsTouched[proof.cardId] = [...principals]
  const acqs = new Set(next.cardAcquirersTouched[proof.cardId] || [])
  acqs.add(proof.acquirerBankId)
  next.cardAcquirersTouched[proof.cardId] = [...acqs]
  next.cardMaturityStage[proof.cardId] = maturityStageFor(
    clean,
    next.cardPrincipalsTouched[proof.cardId] || [],
    next.cardAcquirersTouched[proof.cardId] || [],
    next.networkState
  )
  if (authorisedAt) {
    const latencyHours = (Date.parse(proof.usableZarAt) - Date.parse(authorisedAt)) / 3_600_000
    if (Number.isFinite(latencyHours) && latencyHours >= 0) {
      next.settlementLatency.push({
        terminalId: proof.terminalId,
        acquirerBankId: proof.acquirerBankId,
        authorisedAt,
        usableAt: proof.usableZarAt,
        latencyHours,
      })
    }
  }
  // Evidence can lift network cold → established after cold days have usable proofs
  if (next.networkState === 'cold_start' && next.routeProofs.length >= 6) {
    next.networkState = 'established'
    next.evidenceSupportedDailyCeilingZar = OPERATING_POLICY_V1.network.establishedDailyCeilingZar
  } else if (next.networkState === 'cold_start') {
    next.evidenceSupportedDailyCeilingZar = OPERATING_POLICY_V1.network.coldDailyCeilingZar
  }
  next.updatedAt = new Date().toISOString()
  return next
}

export function maturityStageFor(
  cleanCount: number,
  principals: string[],
  acquirers: string[],
  networkState: NetworkColdState
): 'A' | 'B' | 'C' | 'established' {
  const policy = OPERATING_POLICY_V1
  if (networkState === 'established' && cleanCount >= policy.newCard.stageB.maxCleanOutcomesExclusive) {
    if (principals.length >= 2 && acquirers.length >= 2) return 'C'
  }
  if (cleanCount < policy.newCard.stageA.maxCleanOutcomesExclusive) return 'A'
  if (cleanCount < policy.newCard.stageB.maxCleanOutcomesExclusive) return 'B'
  if (principals.length >= 2 && acquirers.length >= 2) return 'C'
  return 'B'
}

export function freezeCard(state: ContinuityStateV1, cardId: CardId): ContinuityStateV1 {
  const next = structuredClone(state)
  if (!next.frozenCardIds.includes(cardId)) next.frozenCardIds.push(cardId)
  next.updatedAt = new Date().toISOString()
  return next
}

export function markOverdueFromExpectedBy(state: ContinuityStateV1, nowIso: string): ContinuityStateV1 {
  const next = structuredClone(state)
  const now = Date.parse(nowIso)
  for (const item of next.pendingExposure) {
    if (item.expectedBy && Date.parse(item.expectedBy) < now) {
      item.overdue = true
      // Keep card frozen; do not fabricate bank outcome
      if (!next.frozenCardIds.includes(item.cardId)) next.frozenCardIds.push(item.cardId)
    }
  }
  next.updatedAt = nowIso
  return next
}

export function pendingExposureZar(state: ContinuityStateV1): number {
  return Math.round(state.pendingExposure.reduce((s, p) => s + p.amountZar, 0) * 100) / 100
}

export function rollingCount(
  dates: string[] | undefined,
  asOfDate: string,
  windowDays: number
): number {
  if (!dates?.length) return 0
  const asOfMs = Date.parse(asOfDate + 'T12:00:00Z')
  const cut = asOfMs - (windowDays - 1) * 86400000
  return dates.filter((d) => Date.parse(d + 'T12:00:00Z') >= cut && d <= asOfDate).length
}

/** Month boundary must not clear maturity / proofs / rolling history. */
export function rolloverMonth(state: ContinuityStateV1, authorisedGrowthRate = 0): ContinuityStateV1 {
  const next = structuredClone(state)
  next.authorisedGrowthRate = authorisedGrowthRate
  next.invoiceBacklog = []
  next.updatedAt = new Date().toISOString()
  // Explicitly keep routeProofs, cardCleanUsableCount, maturity, rolling windows
  return next
}

export function withHashes(state: ContinuityStateV1, input: unknown, output: unknown): ContinuityStateV1 {
  return {
    ...state,
    inputHash: hashPayload(input),
    outputHash: hashPayload(output),
  }
}
