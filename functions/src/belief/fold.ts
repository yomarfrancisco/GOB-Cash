import { sortEvidence } from './evidence'
import type {
  BeliefLevel,
  BeliefMaturity,
  ReviewState,
  RouteBeliefSnapshot,
  RouteEvidence,
} from './types'
import { BELIEF_SCHEMA_VERSION } from './types'

const DAY_MS = 86_400_000
const ROLLING_WINDOW_DAYS = 14
const RECENT_WINDOW_DAYS = 14

type CellAcc = {
  level: BeliefLevel
  beliefKey: string
  authAttempts: number
  authAccepts: number
  settleAttempts: number
  settleSuccesses: number
  latencySum: number
  latencyN: number
  largestTicket: number | null
  rollingVolume: number
  pendingExposure: number
  reviewState: ReviewState
  reversalExposure: number
  evidenceCount: number
  lastEventAt: string | null
  firstEventAt: string | null
  recentAttempts: number
  recentSettlements: number
  eventDays: Set<string>
}

function emptyCell(level: BeliefLevel, beliefKey: string): CellAcc {
  return {
    level,
    beliefKey,
    authAttempts: 0,
    authAccepts: 0,
    settleAttempts: 0,
    settleSuccesses: 0,
    latencySum: 0,
    latencyN: 0,
    largestTicket: null,
    rollingVolume: 0,
    pendingExposure: 0,
    reviewState: 'clear',
    reversalExposure: 0,
    evidenceCount: 0,
    lastEventAt: null,
    firstEventAt: null,
    recentAttempts: 0,
    recentSettlements: 0,
    eventDays: new Set(),
  }
}

function isEligibleLiquidity(row: RouteEvidence): boolean {
  return row.attemptEligibility === 'eligible_submitted'
}

function withinDays(iso: string, asOf: string, days: number): boolean {
  const t = Date.parse(iso)
  const now = Date.parse(asOf)
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false
  return now - t <= days * DAY_MS && now >= t
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function rate(successes: number, attempts: number): number | null {
  if (attempts <= 0) return null
  return successes / attempts
}

function maturity(count: number, freshnessDays: number | null): BeliefMaturity {
  if (count < 2) return 'cold'
  if (count < 6 || (freshnessDays != null && freshnessDays > 21)) return 'thin'
  return 'established'
}

function freshnessDays(lastEventAt: string | null, asOf: string): number | null {
  if (!lastEventAt) return null
  const a = Date.parse(lastEventAt)
  const b = Date.parse(asOf)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, (b - a) / DAY_MS)
}

function keysFor(row: RouteEvidence): Array<{ level: BeliefLevel; beliefKey: string }> {
  const out: Array<{ level: BeliefLevel; beliefKey: string }> = []
  if (row.issuerId) out.push({ level: 'issuer', beliefKey: `issuer:${row.issuerId}` })
  if (row.acquirerId) out.push({ level: 'acquirer', beliefKey: `acquirer:${row.acquirerId}` })
  if (row.issuerAcquirerPairId) {
    out.push({ level: 'pair', beliefKey: `pair:${row.issuerAcquirerPairId}` })
  }
  if (row.cardId) out.push({ level: 'card', beliefKey: `card:${row.cardId}` })
  if (row.posId) out.push({ level: 'pos', beliefKey: `pos:${row.posId}` })
  return out
}

function applyRow(cell: CellAcc, row: RouteEvidence, asOf: string): void {
  cell.evidenceCount += 1
  cell.lastEventAt = row.eventAt
  if (!cell.firstEventAt || row.eventAt < cell.firstEventAt) cell.firstEventAt = row.eventAt
  cell.eventDays.add(dayKey(row.eventAt))
  const recent = withinDays(row.eventAt, asOf, RECENT_WINDOW_DAYS)
  const rolling = withinDays(row.eventAt, asOf, ROLLING_WINDOW_DAYS)
  const eligible = isEligibleLiquidity(row)

  switch (row.kind) {
    case 'authorised':
      if (eligible) {
        cell.authAttempts += 1
        cell.authAccepts += 1
        cell.pendingExposure += row.requestedZar
        if (recent) cell.recentAttempts += 1
      }
      break
    case 'captured':
      // Capture confirms progress; settlement still separate.
      break
    case 'settlement_credited':
    case 'zar_available': {
      if (eligible) {
        cell.settleAttempts += 1
        cell.settleSuccesses += 1
        const ticket = row.settledZar ?? row.requestedZar
        if (cell.largestTicket == null || ticket > cell.largestTicket) cell.largestTicket = ticket
        if (rolling) cell.rollingVolume += ticket
        if (recent) cell.recentSettlements += 1
        cell.pendingExposure = Math.max(0, cell.pendingExposure - row.requestedZar)
        if (row.latencyMs != null) {
          cell.latencySum += row.latencyMs
          cell.latencyN += 1
        }
      }
      break
    }
    case 'under_review':
      cell.reviewState = 'open'
      break
    case 'delayed':
      if (cell.reviewState !== 'open') cell.reviewState = 'recovering'
      break
    case 'reversed':
      cell.reversalExposure += row.settledZar ?? row.requestedZar
      // Does not erase prior authorisation evidence.
      break
    case 'recovered':
      cell.reviewState = 'clear'
      break
    default:
      break
  }

  // Eligible declines / unknown failures: count as auth attempts without accept when kind is not authorised.
  // Declines arrive as under_review or via a separate decline path — when cause is unknown we still
  // record evidenceCount but do not invent liquidity attribution beyond attempt eligibility gate.
}

function toSnapshot(cell: CellAcc, asOf: string): RouteBeliefSnapshot {
  const fresh = freshnessDays(cell.lastEventAt, asOf)
  const cadence =
    cell.eventDays.size >= 2 && cell.firstEventAt && cell.lastEventAt
      ? Math.max(
          0,
          (Date.parse(cell.lastEventAt) - Date.parse(cell.firstEventAt)) /
            DAY_MS /
            Math.max(1, cell.eventDays.size - 1)
        )
      : null
  return {
    schemaVersion: BELIEF_SCHEMA_VERSION,
    beliefKey: cell.beliefKey,
    level: cell.level,
    authorisationAcceptance: rate(cell.authAccepts, cell.authAttempts),
    finalSettlementRate: rate(cell.settleSuccesses, cell.settleAttempts),
    settlementLatencyMs: cell.latencyN > 0 ? cell.latencySum / cell.latencyN : null,
    largestRecentSuccessfulTicketZar: cell.largestTicket,
    rollingSettledVolumeZar: round2(cell.rollingVolume),
    pendingExposureZar: round2(cell.pendingExposure),
    reviewState: cell.reviewState,
    reversalExposure: round2(cell.reversalExposure),
    evidenceCount: cell.evidenceCount,
    evidenceFreshnessDays: fresh,
    maturity: maturity(cell.evidenceCount, fresh),
    recentAttemptCount: cell.recentAttempts,
    recentSettlementCount: cell.recentSettlements,
    observedCadenceDays: cadence,
    lastEventAt: cell.lastEventAt,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Pure hierarchical fold. Same evidence multiset → same snapshots (canonical sort).
 * Card/POS cells accumulate independently; consumers pool via {@link resolveRouteBelief}.
 */
export function foldEvidence(
  evidence: RouteEvidence[],
  asOf = new Date().toISOString()
): RouteBeliefSnapshot[] {
  const sorted = sortEvidence(evidence)
  const cells = new Map<string, CellAcc>()

  for (const row of sorted) {
    for (const { level, beliefKey } of keysFor(row)) {
      let cell = cells.get(beliefKey)
      if (!cell) {
        cell = emptyCell(level, beliefKey)
        cells.set(beliefKey, cell)
      }
      applyRow(cell, row, asOf)
    }
  }

  return [...cells.values()]
    .map((cell) => toSnapshot(cell, asOf))
    .sort((a, b) => a.beliefKey.localeCompare(b.beliefKey))
}

/**
 * Hierarchical readout: prefer pair when established/thin with enough local evidence;
 * otherwise blend toward issuer+acquirer priors by weighting.
 */
export function resolveRouteBelief(
  snapshots: RouteBeliefSnapshot[],
  opts: { issuerId?: string | null; acquirerId?: string | null; pairId?: string | null; cardId?: string | null; posId?: string | null }
): RouteBeliefSnapshot | null {
  const byKey = new Map(snapshots.map((s) => [s.beliefKey, s]))
  const pair = opts.pairId ? byKey.get(`pair:${opts.pairId}`) : null
  const issuer = opts.issuerId ? byKey.get(`issuer:${opts.issuerId}`) : null
  const acquirer = opts.acquirerId ? byKey.get(`acquirer:${opts.acquirerId}`) : null
  const card = opts.cardId ? byKey.get(`card:${opts.cardId}`) : null
  const pos = opts.posId ? byKey.get(`pos:${opts.posId}`) : null

  if (pair && pair.evidenceCount >= 3 && pair.maturity !== 'cold') {
    return mergePreferLocal(pair, issuer, acquirer)
  }
  if (pair) return mergePreferLocal(pair, issuer, acquirer)
  if (card && card.evidenceCount >= 4) return mergePreferLocal(card, issuer, acquirer)
  if (pos && pos.evidenceCount >= 4) return mergePreferLocal(pos, issuer, acquirer)
  if (issuer || acquirer) return mergePreferLocal(issuer ?? null, issuer, acquirer)
  return null
}

function mergePreferLocal(
  local: RouteBeliefSnapshot | null,
  issuer: RouteBeliefSnapshot | null | undefined,
  acquirer: RouteBeliefSnapshot | null | undefined
): RouteBeliefSnapshot | null {
  if (!local && !issuer && !acquirer) return null
  if (!local) {
    return {
      schemaVersion: BELIEF_SCHEMA_VERSION,
      beliefKey: `pooled:${issuer?.beliefKey || ''}:${acquirer?.beliefKey || ''}`,
      level: 'pair',
      authorisationAcceptance: avgNullable(issuer?.authorisationAcceptance, acquirer?.authorisationAcceptance),
      finalSettlementRate: avgNullable(issuer?.finalSettlementRate, acquirer?.finalSettlementRate),
      settlementLatencyMs: avgNullable(issuer?.settlementLatencyMs, acquirer?.settlementLatencyMs),
      largestRecentSuccessfulTicketZar: maxNullable(
        issuer?.largestRecentSuccessfulTicketZar,
        acquirer?.largestRecentSuccessfulTicketZar
      ),
      rollingSettledVolumeZar: (issuer?.rollingSettledVolumeZar || 0) + (acquirer?.rollingSettledVolumeZar || 0),
      pendingExposureZar: (issuer?.pendingExposureZar || 0) + (acquirer?.pendingExposureZar || 0),
      reviewState: worstReview(issuer?.reviewState, acquirer?.reviewState),
      reversalExposure: (issuer?.reversalExposure || 0) + (acquirer?.reversalExposure || 0),
      evidenceCount: (issuer?.evidenceCount || 0) + (acquirer?.evidenceCount || 0),
      evidenceFreshnessDays: minNullable(issuer?.evidenceFreshnessDays, acquirer?.evidenceFreshnessDays),
      maturity: 'cold',
      recentAttemptCount: (issuer?.recentAttemptCount || 0) + (acquirer?.recentAttemptCount || 0),
      recentSettlementCount: (issuer?.recentSettlementCount || 0) + (acquirer?.recentSettlementCount || 0),
      observedCadenceDays: avgNullable(issuer?.observedCadenceDays, acquirer?.observedCadenceDays),
      lastEventAt: maxIso(issuer?.lastEventAt, acquirer?.lastEventAt),
    }
  }
  // Recent local evidence outweighs but does not erase broader priors for rates when local is thin.
  if (local.maturity === 'cold' || local.evidenceCount < 3) {
    return {
      ...local,
      authorisationAcceptance:
        avgNullable(local.authorisationAcceptance, avgNullable(issuer?.authorisationAcceptance, acquirer?.authorisationAcceptance)) ??
        local.authorisationAcceptance,
      finalSettlementRate:
        avgNullable(local.finalSettlementRate, avgNullable(issuer?.finalSettlementRate, acquirer?.finalSettlementRate)) ??
        local.finalSettlementRate,
      settlementLatencyMs:
        avgNullable(local.settlementLatencyMs, avgNullable(issuer?.settlementLatencyMs, acquirer?.settlementLatencyMs)) ??
        local.settlementLatencyMs,
      largestRecentSuccessfulTicketZar:
        local.largestRecentSuccessfulTicketZar ??
        maxNullable(issuer?.largestRecentSuccessfulTicketZar, acquirer?.largestRecentSuccessfulTicketZar),
    }
  }
  return local
}

function avgNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  const vals = [a, b].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function maxNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  const vals = [a, b].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return null
  return Math.max(...vals)
}

function minNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  const vals = [a, b].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return null
  return Math.min(...vals)
}

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b || null
  if (!b) return a
  return a > b ? a : b
}

function worstReview(a?: ReviewState, b?: ReviewState): ReviewState {
  const order: ReviewState[] = ['clear', 'recovering', 'open']
  const ia = a ? order.indexOf(a) : 0
  const ib = b ? order.indexOf(b) : 0
  return order[Math.max(ia, ib)]
}
