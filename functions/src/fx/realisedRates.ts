/**
 * Durable ledger of realised MZN/ZAR rates per issuing bank.
 * Distinct from policy COST (assumed markups) and hourly API mid.
 *
 * Sources may be fully digital (bank mail) or partial (balance photos /
 * Cursor-extracted deltas forwarded via Resend or recorded manually).
 */

import {
  COST_MARKUP_BCI,
  COST_MARKUP_BIM,
  COST_MARKUP_FNB_STD,
  MZN_ZAR_API_RATE_AT_CALIBRATION,
  MZN_ZAR_MARKUP,
  MZN_ZAR_MARKUP_RECEIVE_MZN,
  fetchQuotedMznPerZar,
} from './quotedMznZar'

export const FX_REALISED_RATES_COLLECTION = 'fxRealisedRates'

export type RealisedRateSource =
  | 'moza_visa_email'
  | 'bank_mail'
  | 'balance_photo'
  | 'cursor_manual'
  | 'operator_manual'

export type IssuingBankId = 'bci' | 'moza' | 'fnb_mz' | 'standard_mz' | 'bim' | 'other'

export type RealisedRateConfidence = 'high' | 'medium' | 'low'

export type RealisedRateObservation = {
  id: string
  issuingBank: string
  bankId: IssuingBankId
  amountZar: number
  amountMzn: number
  /** Realised MZN per ZAR = amountMzn / amountZar. */
  effectiveRate: number
  apiMid: number
  /** mid × 1.05 at observation time. */
  bciCostRate: number
  /** mid × 1.155 at observation time. */
  sellRate: number
  /** (sell − effective) / effective. */
  marginOnCost: number
  /** (sell − bciCost) / bciCost — policy reference (~10%). */
  marginOnBciCost: number
  /** (effective − bciCost) / bciCost. */
  bankPremiumVsBci: number
  /** Policy COST markup for this bank at ingest (1.05 / 1.06 / 1.07). */
  assumedCostMarkup: number
  source: RealisedRateSource
  /** Bank / photo transaction time when known. */
  observedAt: string
  ingestedAt: string
  canonicalCardId: string | null
  deskCardId: number | null
  evidenceId: string | null
  eventId: string | null
  terminalId: string | null
  merchant: string | null
  notes: string | null
  confidence: RealisedRateConfidence
}

export type RealisedRateInput = {
  issuingBank: string
  bankId?: IssuingBankId
  amountZar: number
  amountMzn: number
  source: RealisedRateSource
  observedAt?: string | null
  apiMid?: number | null
  canonicalCardId?: string | null
  deskCardId?: number | null
  evidenceId?: string | null
  eventId?: string | null
  terminalId?: string | null
  merchant?: string | null
  notes?: string | null
  confidence?: RealisedRateConfidence
  /** Stable doc id; defaults from evidence/event/amounts. */
  id?: string | null
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function normalizeIssuingBankId(raw: string | null | undefined): IssuingBankId {
  const text = String(raw || '')
  // Order matters: "Mozambique" must not match Moza Banco.
  if (/BIM|Millennium/i.test(text)) return 'bim'
  if (/Standard/i.test(text)) return 'standard_mz'
  if (/\bFNB\b/i.test(text)) return 'fnb_mz'
  if (/\bBCI\b/i.test(text)) return 'bci'
  if (/\bMoza\b|Moza\s*Banco/i.test(text)) return 'moza'
  const id = String(raw || '').toLowerCase().trim()
  if (id === 'moza' || id === 'bim' || id === 'bci') return id
  if (id === 'fnb' || id === 'fnb_mz') return 'fnb_mz'
  if (id === 'standard' || id === 'standard_mz') return 'standard_mz'
  return 'other'
}

/** Default confidence by how digital / complete the source is. */
export function defaultConfidenceForSource(source: RealisedRateSource): RealisedRateConfidence {
  switch (source) {
    case 'moza_visa_email':
    case 'bank_mail':
      return 'high'
    case 'balance_photo':
      return 'medium'
    case 'cursor_manual':
    case 'operator_manual':
      return 'medium'
    default:
      return 'low'
  }
}

export function assumedMarkupForBankId(bankId: IssuingBankId): number {
  switch (bankId) {
    case 'bim':
      return COST_MARKUP_BIM
    case 'fnb_mz':
    case 'standard_mz':
      return COST_MARKUP_FNB_STD
    case 'bci':
    case 'moza':
    case 'other':
    default:
      // Moza has no dedicated policy markup yet — desk still assumes BCI.
      return COST_MARKUP_BCI
  }
}

export function buildRealisedRateObservation(
  input: RealisedRateInput & { apiMid: number; ingestedAt?: string }
): RealisedRateObservation {
  const amountZar = round2(input.amountZar)
  const amountMzn = round2(input.amountMzn)
  if (!(amountZar > 0) || !(amountMzn > 0)) {
    throw new Error('realised_rate_requires_positive_zar_and_mzn')
  }
  const effectiveRate = round6(amountMzn / amountZar)
  const apiMid = round6(input.apiMid > 0 ? input.apiMid : MZN_ZAR_API_RATE_AT_CALIBRATION)
  const bciCostRate = round6(apiMid * COST_MARKUP_BCI)
  const sellRate = round6(apiMid * MZN_ZAR_MARKUP)
  const bankId = input.bankId || normalizeIssuingBankId(input.issuingBank)
  const assumedCostMarkup = assumedMarkupForBankId(bankId)
  const marginOnCost = round4((sellRate - effectiveRate) / effectiveRate)
  const marginOnBciCost = round4((sellRate - bciCostRate) / bciCostRate)
  const bankPremiumVsBci = round4((effectiveRate - bciCostRate) / bciCostRate)
  const ingestedAt = input.ingestedAt || new Date().toISOString()
  const observedAt = input.observedAt && Date.parse(input.observedAt) ? new Date(input.observedAt).toISOString() : ingestedAt
  const id =
    (input.id && String(input.id).replace(/[^\w.-]+/g, '-')) ||
    [
      bankId,
      input.source,
      input.evidenceId || input.eventId || 'obs',
      String(amountZar),
      observedAt.slice(0, 19).replace(/[^\d]/g, ''),
    ]
      .join('-')
      .replace(/[^\w.-]+/g, '-')

  return {
    id,
    issuingBank: input.issuingBank || bankId,
    bankId,
    amountZar,
    amountMzn,
    effectiveRate,
    apiMid,
    bciCostRate,
    sellRate,
    marginOnCost,
    marginOnBciCost,
    bankPremiumVsBci,
    assumedCostMarkup,
    source: input.source,
    observedAt,
    ingestedAt,
    canonicalCardId: input.canonicalCardId ?? null,
    deskCardId: input.deskCardId ?? null,
    evidenceId: input.evidenceId ?? null,
    eventId: input.eventId ?? null,
    terminalId: input.terminalId ?? null,
    merchant: input.merchant ?? null,
    notes: input.notes ?? null,
    confidence: input.confidence || defaultConfidenceForSource(input.source),
  }
}

/** Resolve live API mid (MZN per ZAR), falling back to calibration mid. */
export async function resolveApiMid(explicit?: number | null): Promise<number> {
  if (typeof explicit === 'number' && explicit > 0) return explicit
  try {
    const sell = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP)
    if (sell > 0) return sell / MZN_ZAR_MARKUP
  } catch {
    // fall through
  }
  try {
    const cost = await fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN)
    if (cost > 0) return cost / MZN_ZAR_MARKUP_RECEIVE_MZN
  } catch {
    // fall through
  }
  return MZN_ZAR_API_RATE_AT_CALIBRATION
}

/**
 * Idempotent write to fxRealisedRates/{id}.
 * Returns the observation; `created` is false when the doc already existed.
 */
export async function recordRealisedRate(
  db: FirebaseFirestore.Firestore,
  input: RealisedRateInput
): Promise<{ observation: RealisedRateObservation; created: boolean }> {
  const apiMid = await resolveApiMid(input.apiMid)
  const observation = buildRealisedRateObservation({ ...input, apiMid })
  const ref = db.collection(FX_REALISED_RATES_COLLECTION).doc(observation.id)
  let created = false
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists) return
    created = true
    tx.set(ref, observation)
  })
  return { observation, created }
}

/** Parse loose Moza-style "19-10-2026 13:12:37" into ISO when possible. */
export function parseObservedAtLoose(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (Date.parse(trimmed)) return new Date(trimmed).toISOString()
  const m = trimmed.match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+[àa]s?\s+|\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/i
  )
  if (!m) return null
  let year = Number(m[3])
  if (year < 100) year += 2000
  const day = Number(m[1])
  const month = Number(m[2])
  const iso = new Date(
    Date.UTC(year, month - 1, day, Number(m[4]), Number(m[5]), Number(m[6] || 0))
  )
  return Number.isFinite(iso.getTime()) ? iso.toISOString() : null
}

export function issuingBankLabelFromBankId(bankId: IssuingBankId): string {
  switch (bankId) {
    case 'moza':
      return 'Moza Banco'
    case 'bci':
      return 'BCI'
    case 'bim':
      return 'Millennium BIM'
    case 'fnb_mz':
      return 'FNB Mozambique'
    case 'standard_mz':
      return 'Standard Bank Mozambique'
    default:
      return 'Unknown'
  }
}
