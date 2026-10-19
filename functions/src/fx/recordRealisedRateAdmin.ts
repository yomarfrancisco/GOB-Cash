/**
 * Admin / Cursor entry points for realised FX rates.
 * Supports digital bank mail and partial sources (balance photos, manual deltas).
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import {
  issuingBankLabelFromBankId,
  normalizeIssuingBankId,
  recordRealisedRate,
  type IssuingBankId,
  type RealisedRateConfidence,
  type RealisedRateSource,
} from './realisedRates'

function db() {
  return admin.firestore()
}

function assertRoutingAdmin(context: functions.https.CallableContext): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required')
  }
  if (context.auth.uid !== ROUTING_ADMIN_UID) {
    throw new functions.https.HttpsError('permission-denied', 'Routing admin only')
  }
  return context.auth.uid
}

function asPositiveNumber(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || !(n > 0)) {
    throw new functions.https.HttpsError('invalid-argument', `${field} must be a positive number`)
  }
  return n
}

/**
 * Record a realised bank rate from any source.
 *
 * Digital: omit confidence (defaults high for bank_mail / moza_visa_email).
 * Photos / Cursor: set source to balance_photo | cursor_manual and pass
 * amountZar + amountMzn from the balance delta (before→after).
 */
export const admin_recordRealisedRate = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (data, context) => {
    assertRoutingAdmin(context)
    const payload = (data || {}) as Record<string, unknown>
    const amountZar = asPositiveNumber(payload.amountZar, 'amountZar')
    const amountMzn = asPositiveNumber(payload.amountMzn, 'amountMzn')
    const source = String(payload.source || 'operator_manual') as RealisedRateSource
    const allowed: RealisedRateSource[] = [
      'moza_visa_email',
      'bank_mail',
      'balance_photo',
      'cursor_manual',
      'operator_manual',
    ]
    if (!allowed.includes(source)) {
      throw new functions.https.HttpsError('invalid-argument', `unsupported source ${source}`)
    }
    const bankId = normalizeIssuingBankId(
      typeof payload.bankId === 'string' ? payload.bankId : String(payload.issuingBank || '')
    ) as IssuingBankId
    const issuingBank =
      typeof payload.issuingBank === 'string' && payload.issuingBank.trim()
        ? payload.issuingBank.trim()
        : issuingBankLabelFromBankId(bankId)

    const result = await recordRealisedRate(db(), {
      issuingBank,
      bankId,
      amountZar,
      amountMzn,
      source,
      observedAt: typeof payload.observedAt === 'string' ? payload.observedAt : null,
      apiMid: typeof payload.apiMid === 'number' ? payload.apiMid : null,
      canonicalCardId: typeof payload.canonicalCardId === 'string' ? payload.canonicalCardId : null,
      deskCardId: typeof payload.deskCardId === 'number' ? payload.deskCardId : null,
      evidenceId: typeof payload.evidenceId === 'string' ? payload.evidenceId : null,
      eventId: typeof payload.eventId === 'string' ? payload.eventId : null,
      terminalId: typeof payload.terminalId === 'string' ? payload.terminalId : null,
      merchant: typeof payload.merchant === 'string' ? payload.merchant : null,
      notes: typeof payload.notes === 'string' ? payload.notes : null,
      confidence: payload.confidence as RealisedRateConfidence | undefined,
      id: typeof payload.id === 'string' ? payload.id : null,
    })

    return {
      ok: true,
      created: result.created,
      id: result.observation.id,
      observation: result.observation,
    }
  })
