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
    input.posTerminalId || '',
    input.merchantPrincipalId || '',
    input.acquirerBankId || '',
    input.cardIssuerBankId || '',
    input.linkedObservationId || '',
  ]
  return createHash('sha256').update(parts.map(stable).join('|')).digest('hex').slice(0, 32)
}

/** Card-issuing bank × acquirer bank pair — never merchant principal. */
export function pairId(cardIssuerBankId: string | null, acquirerBankId: string | null): string | null {
  if (!cardIssuerBankId || !acquirerBankId) return null
  return `${cardIssuerBankId}__${acquirerBankId}`
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
      : pairId(input.cardIssuerBankId, input.acquirerBankId)
  const trustClass =
    input.trustClass ||
    (input.provenance === 'operator_report'
      ? 'operator_observation'
      : input.provenance === 'simulation'
        ? 'simulation'
        : input.provenance === 'timeout_rule'
          ? 'rule_derived'
          : input.provenance === 'bank_mail'
            ? 'verified_bank'
            : 'verified_match')
  return {
    ...input,
    issuerAcquirerPairId,
    trustClass,
    linkedObservationId: input.linkedObservationId ?? null,
    operatorUid: input.operatorUid ?? null,
    evidenceRef: input.evidenceRef ?? null,
    observationId: observationIdFor({ ...input, issuerAcquirerPairId, trustClass }),
    schemaVersion: BELIEF_SCHEMA_VERSION,
    ingestedAt,
    latencyMs: latencyMs(input.eventAt, input.settledAt),
  }
}

/** Canonical order for fold replay: event time (settledAt for terminal settles), ingestion, id. */
export function compareEvidence(a: RouteEvidence, b: RouteEvidence): number {
  const aKey =
    (a.kind === 'zar_available' || a.kind === 'settlement_credited') && a.settledAt
      ? a.settledAt
      : a.eventAt
  const bKey =
    (b.kind === 'zar_available' || b.kind === 'settlement_credited') && b.settledAt
      ? b.settledAt
      : b.eventAt
  const ea = aKey.localeCompare(bKey)
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
