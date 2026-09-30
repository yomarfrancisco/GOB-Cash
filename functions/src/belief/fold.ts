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
  /** Dedup terminal settlement credits linked to the same economic success. */
  countedTerminalIds: Set<string>
  latencySum: number
  latencyN: number
  largestTicket: number | null
  rollingVolume: number
  pendingExposure: number
  reviewState: ReviewState
  reversalExposure: number
  evidenceCount: number
  settlementEvidenceCount: number
  lastEventAt: string | null
  firstEventAt: string | null
  recentAttempts: number
  recentSettlements: number
  eventDays: Set<string>
  operatorObservationCount: number
  /** Payments that already reached terminal settlement — later delays must not regress them. */
  settledPaymentIds: Set<string>
}

function emptyCell(level: BeliefLevel, beliefKey: string): CellAcc {
  return {
    level,
    beliefKey,
    authAttempts: 0,
    authAccepts: 0,
    settleAttempts: 0,
    settleSuccesses: 0,
    countedTerminalIds: new Set(),
    latencySum: 0,
    latencyN: 0,
    largestTicket: null,
    rollingVolume: 0,
    pendingExposure: 0,
    reviewState: 'clear',
    reversalExposure: 0,
    evidenceCount: 0,
    settlementEvidenceCount: 0,
    lastEventAt: null,
    firstEventAt: null,
    recentAttempts: 0,
    recentSettlements: 0,
    eventDays: new Set(),
    operatorObservationCount: 0,
    settledPaymentIds: new Set(),
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

/** Settlement maturity ignores auth/capture/delay noise. */
function settlementMaturity(settleSuccesses: number, freshnessDays: number | null): BeliefMaturity {
  if (settleSuccesses < 1) return 'cold'
  if (settleSuccesses < 3 || (freshnessDays != null && freshnessDays > 21)) return 'thin'
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
  if (row.cardIssuerBankId) out.push({ level: 'issuer', beliefKey: `issuer:${row.cardIssuerBankId}` })
  if (row.acquirerBankId) out.push({ level: 'acquirer', beliefKey: `acquirer:${row.acquirerBankId}` })
  if (row.issuerAcquirerPairId) {
    out.push({ level: 'pair', beliefKey: `pair:${row.issuerAcquirerPairId}` })
  }
  if (row.cardId) out.push({ level: 'card', beliefKey: `card:${row.cardId}` })
  if (row.posTerminalId) out.push({ level: 'pos', beliefKey: `pos:${row.posTerminalId}` })
  return out
}

function applyTerminalSettlement(cell: CellAcc, row: RouteEvidence, asOf: string): void {
  if (!isEligibleLiquidity(row)) return
  // Avoid double-counting settlement_credited + zar_available for the same economic success.
  const terminalKey =
    row.linkedObservationId ||
    row.economicPaymentId ||
    row.observationId
  if (cell.countedTerminalIds.has(terminalKey)) {
    // Second linked event: keep latency / pending cleanup only if needed; do not add another success.
    cell.pendingExposure = Math.max(0, cell.pendingExposure - row.requestedZar)
    return
  }
  cell.countedTerminalIds.add(terminalKey)
  if (row.economicPaymentId) cell.settledPaymentIds.add(row.economicPaymentId)

  const interrupted =
    cell.reviewState === 'delayed' ||
    cell.reviewState === 'under_review' ||
    cell.reviewState === 'recovering'

  cell.settleAttempts += 1
  cell.settleSuccesses += 1
  cell.settlementEvidenceCount += 1
  const ticket = row.settledZar ?? row.requestedZar
  if (cell.largestTicket == null || ticket > cell.largestTicket) cell.largestTicket = ticket
  if (withinDays(row.eventAt, asOf, ROLLING_WINDOW_DAYS)) cell.rollingVolume += ticket
  if (withinDays(row.eventAt, asOf, RECENT_WINDOW_DAYS)) cell.recentSettlements += 1
  cell.pendingExposure = Math.max(0, cell.pendingExposure - row.requestedZar)
  if (row.latencyMs != null) {
    cell.latencySum += row.latencyMs
    cell.latencyN += 1
  }
  // Later verified successful settlement after interruption → recovered (not silence inference).
  cell.reviewState = interrupted ? 'recovered' : 'clear'
}

function paymentAlreadySettled(cell: CellAcc, row: RouteEvidence): boolean {
  return Boolean(row.economicPaymentId && cell.settledPaymentIds.has(row.economicPaymentId))
}

function applyRow(cell: CellAcc, row: RouteEvidence, asOf: string): void {
  cell.evidenceCount += 1
  cell.lastEventAt = row.eventAt
  if (!cell.firstEventAt || row.eventAt < cell.firstEventAt) cell.firstEventAt = row.eventAt
  cell.eventDays.add(dayKey(row.eventAt))
  if (row.trustClass === 'operator_observation' || row.provenance === 'operator_report') {
    cell.operatorObservationCount += 1
  }
  const recent = withinDays(row.eventAt, asOf, RECENT_WINDOW_DAYS)
  const eligible = isEligibleLiquidity(row)

  switch (row.kind) {
    case 'authorised':
      if (eligible) {
        cell.authAttempts += 1
        cell.authAccepts += 1
        cell.pendingExposure += row.requestedZar
        if (recent) cell.recentAttempts += 1
        if (cell.reviewState === 'clear' || cell.reviewState === 'recovered') {
          cell.reviewState = 'pending'
        }
      }
      break
    case 'captured':
      // Capture confirms progression only — never settlement performance.
      break
    case 'settlement_credited':
    case 'zar_available':
      applyTerminalSettlement(cell, row, asOf)
      break
    case 'under_review':
      if (!paymentAlreadySettled(cell, row)) cell.reviewState = 'under_review'
      break
    case 'delayed':
      // Delay is not recovery. Never regress a payment that already settled.
      if (paymentAlreadySettled(cell, row)) break
      if (cell.reviewState !== 'under_review') cell.reviewState = 'delayed'
      break
    case 'declined':
      if (eligible) {
        cell.authAttempts += 1
        // Decline is not an accept.
      }
      if (cell.reviewState === 'pending' || cell.reviewState === 'clear') {
        cell.reviewState = 'under_review'
      }
      break
    case 'reversed':
      cell.reversalExposure += row.settledZar ?? row.requestedZar
      // Does not erase prior authorisation or historical successful ticket.
      break
    case 'recovered':
      // Explicit recovery evidence → recovering (not clear yet).
      cell.reviewState = 'recovering'
      break
    default:
      break
  }
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
    settlementEvidenceCount: cell.settlementEvidenceCount,
    settlementMaturity: settlementMaturity(cell.settleSuccesses, fresh),
    evidenceFreshnessDays: fresh,
    maturity: maturity(cell.evidenceCount, fresh),
    recentAttemptCount: cell.recentAttempts,
    recentSettlementCount: cell.recentSettlements,
    observedCadenceDays: cadence,
    lastEventAt: cell.lastEventAt,
    operatorObservationCount: cell.operatorObservationCount,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Pure hierarchical fold. Same evidence multiset → same snapshots (canonical sort).
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

export function resolveRouteBelief(
  snapshots: RouteBeliefSnapshot[],
  opts: {
    cardIssuerBankId?: string | null
    acquirerBankId?: string | null
    pairId?: string | null
    cardId?: string | null
    posTerminalId?: string | null
  }
): RouteBeliefSnapshot | null {
  const byKey = new Map(snapshots.map((s) => [s.beliefKey, s]))
  const pair = opts.pairId ? byKey.get(`pair:${opts.pairId}`) : null
  const issuer = opts.cardIssuerBankId ? byKey.get(`issuer:${opts.cardIssuerBankId}`) : null
  const acquirer = opts.acquirerBankId ? byKey.get(`acquirer:${opts.acquirerBankId}`) : null
  const card = opts.cardId ? byKey.get(`card:${opts.cardId}`) : null
  const pos = opts.posTerminalId ? byKey.get(`pos:${opts.posTerminalId}`) : null

  if (pair && pair.settlementEvidenceCount >= 2 && pair.settlementMaturity !== 'cold') {
    return mergePreferLocal(pair, issuer, acquirer)
  }
  if (pair) return mergePreferLocal(pair, issuer, acquirer)
  if (card && card.settlementEvidenceCount >= 2) return mergePreferLocal(card, issuer, acquirer)
  if (pos && pos.settlementEvidenceCount >= 2) return mergePreferLocal(pos, issuer, acquirer)
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
      settlementEvidenceCount:
        (issuer?.settlementEvidenceCount || 0) + (acquirer?.settlementEvidenceCount || 0),
      settlementMaturity: colderMaturity(issuer?.settlementMaturity, acquirer?.settlementMaturity),
      evidenceFreshnessDays: minNullable(issuer?.evidenceFreshnessDays, acquirer?.evidenceFreshnessDays),
      maturity: 'cold',
      recentAttemptCount: (issuer?.recentAttemptCount || 0) + (acquirer?.recentAttemptCount || 0),
      recentSettlementCount: (issuer?.recentSettlementCount || 0) + (acquirer?.recentSettlementCount || 0),
      observedCadenceDays: avgNullable(issuer?.observedCadenceDays, acquirer?.observedCadenceDays),
      lastEventAt: maxIso(issuer?.lastEventAt, acquirer?.lastEventAt),
      operatorObservationCount:
        (issuer?.operatorObservationCount || 0) + (acquirer?.operatorObservationCount || 0),
    }
  }
  if (local.settlementMaturity === 'cold' || local.settlementEvidenceCount < 2) {
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

function colderMaturity(a?: BeliefMaturity, b?: BeliefMaturity): BeliefMaturity {
  const order: BeliefMaturity[] = ['cold', 'thin', 'established']
  const ia = a ? order.indexOf(a) : 0
  const ib = b ? order.indexOf(b) : 0
  return order[Math.min(ia, ib)]
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
  const order: ReviewState[] = ['clear', 'recovered', 'pending', 'recovering', 'delayed', 'under_review']
  const ia = a ? order.indexOf(a) : 0
  const ib = b ? order.indexOf(b) : 0
  return order[Math.max(ia, ib)] || 'clear'
}
