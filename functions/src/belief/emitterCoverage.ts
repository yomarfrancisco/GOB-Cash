/**
 * Production emitter coverage for Stage A–D audit.
 * Positive-only zar_available must not alone drive a live policy.
 */

export type EmitterCoverageRow = {
  event: string
  wired: boolean
  source: string
  routeAttribution: string
  idempotencyKey: string
  notes: string
}

/** Honest inventory of what emits RouteEvidence today. */
export const EMITTER_COVERAGE: EmitterCoverageRow[] = [
  {
    event: 'authorisation accepted',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'hash(source|provenance|authorised|economicPaymentId|invoiceId|eventAt|requestedZar|card|pos|merchant|acquirer|issuer)',
    notes: 'Builder exists (evidenceFromAuthorisation); not hooked to desk confirm or bank auth mail yet.',
  },
  {
    event: 'capture',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'same scheme with kind=captured',
    notes: 'Kind exists on RouteEvidence; no production emitter.',
  },
  {
    event: 'decline',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind under_review/delayed with causeClass + eligibility',
    notes: 'Must set attemptEligibility and causeClass; unknown must not update liquidity rates. Not wired.',
  },
  {
    event: 'under review',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind=under_review + economicPaymentId + eventAt',
    notes: 'Desk friction / outcome language exists; does not write RouteEvidence.',
  },
  {
    event: 'delay/timeout',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind=delayed or timeout_rule provenance',
    notes: 'No silence inference; timeout_rule only when explicit overdue deadline exists. Not wired.',
  },
  {
    event: 'settlement credited',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind=settlement_credited',
    notes: 'Distinct from zar_available. FNB/Capitec parsers credit wallets/invoices but do not emit this kind yet.',
  },
  {
    event: 'zar_available',
    wired: true,
    source: 'functions/src/settlement/issueInvoices.ts → recordZarAvailableEvidence after markInvoiceZarAvailable (FNB gross / Capitec net match)',
    routeAttribution:
      'merchantId=invoice.issuerId; cardId=deskCardId; buyerId=billToId; posId=machineId; terminalId/acquirer from railByMachineId; invoiceId; economicPaymentId',
    idempotencyKey: 'observationIdFor(kind=zar_available, …) → Firestore doc id in routeEvidence',
    notes:
      'Only fires after invoice match on merchant + amount/card last4. Inbound receipt alone does not emit; secure match required. Positive-only — insufficient for live policy.',
  },
  {
    event: 'reversal/chargeback',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind=reversed compensating append',
    notes: 'Fold supports append-only reversalExposure; no producer yet.',
  },
  {
    event: 'verified recovery',
    wired: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind=recovered',
    notes: 'Desk rail_up language exists; does not write RouteEvidence.',
  },
]

export function wiredEvents(): string[] {
  return EMITTER_COVERAGE.filter((row) => row.wired).map((row) => row.event)
}

export function unwiredEvents(): string[] {
  return EMITTER_COVERAGE.filter((row) => !row.wired).map((row) => row.event)
}
