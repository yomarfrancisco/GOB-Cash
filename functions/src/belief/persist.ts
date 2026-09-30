/**
 * Optional Firestore append for route evidence.
 * Simulation must use ROUTE_EVIDENCE_SIM_COLLECTION so production folds never see it.
 * Application code never updates or deletes an existing evidence document.
 * Ambiguous / unmatched evidence goes to quarantine — never the production fold.
 */
import * as admin from 'firebase-admin'
import type { RouteEvidence } from './types'
import { evidencePayloadEquals } from './appendOnly'
import {
  DECISION_RECORDS_COLLECTION,
  ROUTE_EVIDENCE_COLLECTION,
  ROUTE_EVIDENCE_QUARANTINE_COLLECTION,
  ROUTE_EVIDENCE_SIM_COLLECTION,
} from './collections'

export {
  DECISION_RECORDS_COLLECTION,
  ROUTE_BELIEFS_COLLECTION,
  ROUTE_EVIDENCE_COLLECTION,
  ROUTE_EVIDENCE_QUARANTINE_COLLECTION,
  ROUTE_EVIDENCE_SIM_COLLECTION,
} from './collections'

function db() {
  return admin.firestore()
}

export type PersistEvidenceResult =
  | { wrote: true; status: 'written' }
  | { wrote: false; status: 'duplicate' }
  | { wrote: false; status: 'conflict'; reason: string }
  | { wrote: false; status: 'quarantined'; reason: string }

function isAmbiguous(row: RouteEvidence): string | null {
  if (!row.merchantPrincipalId && !row.economicPaymentId && !row.invoiceId) {
    return 'missing merchantPrincipalId and payment/invoice identity'
  }
  if (row.kind === 'zar_available' && (row.settledZar == null || row.settledZar <= 0)) {
    return 'zar_available without settledZar'
  }
  return null
}

/**
 * Append-only write. Duplicate webhook → original observation (wrote: false, duplicate).
 * Conflicting reuse of observationId → rejected (conflict). Never update/delete.
 */
export async function persistRouteEvidence(row: RouteEvidence): Promise<PersistEvidenceResult> {
  const ambiguous = isAmbiguous(row)
  if (ambiguous) {
    await db()
      .collection(ROUTE_EVIDENCE_QUARANTINE_COLLECTION)
      .doc(row.observationId)
      .create({ ...row, quarantineReason: ambiguous, quarantinedAt: new Date().toISOString() })
      .catch(() => undefined)
    return { wrote: false, status: 'quarantined', reason: ambiguous }
  }

  const collection =
    row.source === 'simulation' ? ROUTE_EVIDENCE_SIM_COLLECTION : ROUTE_EVIDENCE_COLLECTION
  const ref = db().collection(collection).doc(row.observationId)
  const existing = await ref.get()
  if (existing.exists) {
    const prev = existing.data() as RouteEvidence
    if (evidencePayloadEquals(prev, row)) {
      return { wrote: false, status: 'duplicate' }
    }
    return {
      wrote: false,
      status: 'conflict',
      reason: 'observationId already used with a different payload',
    }
  }
  await ref.create(row)
  return { wrote: true, status: 'written' }
}

/** Decision records are create-once; never overwrite. */
export async function persistDecisionRecord(record: Record<string, unknown>): Promise<void> {
  const id = String(record.decisionId || '')
  if (!id) throw new Error('decisionId required')
  await db().collection(DECISION_RECORDS_COLLECTION).doc(id).create(record)
}
