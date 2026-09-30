/**
 * Pure builders that turn settlement / desk events into RouteEvidence.
 * Persistence is optional — callers decide production vs simulation collection.
 */
import { buildRouteEvidence, pairId } from './evidence'
import type { CauseClass, EvidenceProvenance, EvidenceSource, RouteEvidence } from './types'

export function evidenceFromZarAvailable(input: {
  source?: EvidenceSource
  provenance?: EvidenceProvenance
  issuerId: string | null
  cardId: string | null
  buyerId: string | null
  merchantId: string
  posId: string | null
  terminalId: string | null
  acquirerId: string | null
  invoiceId: string
  economicPaymentId: string | null
  testRunId: string | null
  cycleNumber: number | null
  requestedZar: number
  settledZar: number
  eventAt: string
  settledAt: string
}): RouteEvidence {
  return buildRouteEvidence({
    kind: 'zar_available',
    source: input.source || 'production',
    provenance: input.provenance || 'bank_mail',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    issuerId: input.issuerId,
    cardId: input.cardId,
    buyerId: input.buyerId,
    merchantId: input.merchantId,
    posId: input.posId,
    terminalId: input.terminalId,
    acquirerId: input.acquirerId,
    issuerAcquirerPairId: pairId(input.issuerId, input.acquirerId),
    invoiceId: input.invoiceId,
    economicPaymentId: input.economicPaymentId,
    testRunId: input.testRunId,
    cycleNumber: input.cycleNumber,
    requestedZar: input.requestedZar,
    settledZar: input.settledZar,
    eventAt: input.eventAt,
    settledAt: input.settledAt,
    notes: ['Acquirer settlement opened zar_available'],
  })
}

export function evidenceFromAuthorisation(input: {
  source?: EvidenceSource
  provenance?: EvidenceProvenance
  issuerId: string | null
  cardId: string
  buyerId: string | null
  merchantId: string
  posId: string
  terminalId: string | null
  acquirerId: string | null
  invoiceId: string | null
  economicPaymentId: string
  testRunId: string | null
  cycleNumber: number | null
  requestedZar: number
  eventAt: string
  attemptEligibility?: 'eligible_submitted' | 'ineligible' | 'unknown'
  causeClass?: CauseClass
}): RouteEvidence {
  return buildRouteEvidence({
    kind: 'authorised',
    source: input.source || 'production',
    provenance: input.provenance || 'desk_confirm',
    attemptEligibility: input.attemptEligibility || 'eligible_submitted',
    causeClass: input.causeClass || 'unknown',
    issuerId: input.issuerId,
    cardId: input.cardId,
    buyerId: input.buyerId,
    merchantId: input.merchantId,
    posId: input.posId,
    terminalId: input.terminalId,
    acquirerId: input.acquirerId,
    invoiceId: input.invoiceId,
    economicPaymentId: input.economicPaymentId,
    testRunId: input.testRunId,
    cycleNumber: input.cycleNumber,
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    notes: [],
  })
}
