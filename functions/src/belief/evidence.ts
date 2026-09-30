import { createHash } from 'crypto'
import type { NewRouteEvidenceInput, RouteEvidence } from './types'
import { BELIEF_SCHEMA_VERSION } from './types'

function stable(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

/** Deterministic observation ID from provenance keys (idempotent append). */
export function observationIdFor(input: NewRouteEvidenceInput): string {
  const parts = [
    input.source,
    input.provenance,
    input.kind,
    input.economicPaymentId || '',
    input.invoiceId || '',
    input.eventAt,
    String(input.requestedZar),
    input.cardId || '',
    input.posId || '',
    input.merchantId || '',
    input.acquirerId || '',
    input.issuerId || '',
  ]
  return createHash('sha256').update(parts.map(stable).join('|')).digest('hex').slice(0, 32)
}

export function pairId(issuerId: string | null, acquirerId: string | null): string | null {
  if (!issuerId || !acquirerId) return null
  return `${issuerId}__${acquirerId}`
}

export function latencyMs(eventAt: string, settledAt: string | null): number | null {
  if (!settledAt) return null
  const a = Date.parse(eventAt)
  const b = Date.parse(settledAt)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return b - a
}

export function buildRouteEvidence(
  input: NewRouteEvidenceInput,
  nowIso = new Date().toISOString()
): RouteEvidence {
  const ingestedAt = input.ingestedAt || nowIso
  const issuerAcquirerPairId =
    input.issuerAcquirerPairId !== undefined
      ? input.issuerAcquirerPairId
      : pairId(input.issuerId, input.acquirerId)
  return {
    ...input,
    issuerAcquirerPairId,
    observationId: observationIdFor({ ...input, issuerAcquirerPairId }),
    schemaVersion: BELIEF_SCHEMA_VERSION,
    ingestedAt,
    latencyMs: latencyMs(input.eventAt, input.settledAt),
  }
}

/** Canonical order for fold replay: event time, ingestion time, observation ID. */
export function compareEvidence(a: RouteEvidence, b: RouteEvidence): number {
  const ea = a.eventAt.localeCompare(b.eventAt)
  if (ea !== 0) return ea
  const ia = a.ingestedAt.localeCompare(b.ingestedAt)
  if (ia !== 0) return ia
  return a.observationId.localeCompare(b.observationId)
}

export function sortEvidence(rows: RouteEvidence[]): RouteEvidence[] {
  return [...rows].sort(compareEvidence)
}

/** Append with idempotency: duplicate observationId is a no-op. */
export function appendEvidence(log: RouteEvidence[], row: RouteEvidence): RouteEvidence[] {
  if (log.some((existing) => existing.observationId === row.observationId)) return log
  return sortEvidence([...log, row])
}
