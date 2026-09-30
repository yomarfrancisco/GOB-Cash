/**
 * Pure append-only evidence log (application-layer enforcement).
 * Firestore persist mirrors these rules; simulation never folds into production.
 */
import type { RouteEvidence } from './types'
import { appendEvidence, sortEvidence } from './evidence'
import { ROUTE_EVIDENCE_COLLECTION, ROUTE_EVIDENCE_SIM_COLLECTION } from './collections'

export type AppendResult =
  | { status: 'written'; row: RouteEvidence }
  | { status: 'duplicate'; row: RouteEvidence }
  | { status: 'conflict'; row: RouteEvidence; existing: RouteEvidence; reason: string }

function canonicalPayload(row: RouteEvidence): string {
  const { ingestedAt: _i, ...rest } = row
  return JSON.stringify(rest)
}

/** Compare evidence equality ignoring ingestedAt jitter on true duplicates. */
export function evidencePayloadEquals(a: RouteEvidence, b: RouteEvidence): boolean {
  return canonicalPayload(a) === canonicalPayload(b)
}

/**
 * Append-only: never overwrite or delete. Duplicate ID with same payload → duplicate.
 * Same ID with different payload → conflict (rejected).
 */
export function appendOnly(log: RouteEvidence[], row: RouteEvidence): {
  log: RouteEvidence[]
  result: AppendResult
} {
  const existing = log.find((e) => e.observationId === row.observationId)
  if (existing) {
    if (evidencePayloadEquals(existing, row)) {
      return { log, result: { status: 'duplicate', row: existing } }
    }
    return {
      log,
      result: {
        status: 'conflict',
        row,
        existing,
        reason: 'observationId already used with a different payload',
      },
    }
  }
  return { log: appendEvidence(log, row), result: { status: 'written', row } }
}

/** Production fold must exclude simulation-sourced rows. */
export function productionEvidenceOnly(log: RouteEvidence[]): RouteEvidence[] {
  return sortEvidence(log.filter((row) => row.source === 'production'))
}

export function simulationEvidenceOnly(log: RouteEvidence[]): RouteEvidence[] {
  return sortEvidence(log.filter((row) => row.source === 'simulation'))
}

export function evidenceCollectionFor(source: RouteEvidence['source']): string {
  return source === 'simulation' ? ROUTE_EVIDENCE_SIM_COLLECTION : ROUTE_EVIDENCE_COLLECTION
}
