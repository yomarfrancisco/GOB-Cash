/**
 * Production emitter coverage for Stage A2 audit.
 * Positive-only zar_available must not alone drive a live policy.
 */

export type EmitterCoverageRow = {
  event: string
  wired: boolean
  available: boolean
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
    available: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'hash(…kind=authorised…)',
    notes:
      'Builder evidenceFromAuthorisation exists. No proven automated auth mail→payment match yet. Desk confirm alone is not wired as production evidence.',
  },
  {
    event: 'capture',
    wired: false,
    available: false,
    source: '—',
    routeAttribution: '—',
    idempotencyKey: 'kind=captured',
    notes: 'Builder exists. No trusted acquirer/POS capture feed matched to invoice today.',
  },
  {
    event: 'decline',
    wired: false,
    available: true,
    source: 'Proposed: structured operator_report (not free-text Sam)',
    routeAttribution: 'payment/invoice/route from operator form',
    idempotencyKey: 'kind=declined + payment + eventAt + operatorUid',
    notes: 'No automated decline feed. Operator report builder ready; callable not exposed in E0.',
  },
  {
    event: 'under review',
    wired: false,
    available: true,
    source: 'Proposed: structured operator_report',
    routeAttribution: 'payment/invoice/route',
    idempotencyKey: 'kind=under_review + payment + eventAt',
    notes: 'Desk friction language exists but does not write RouteEvidence. Operator form is the smallest control.',
  },
  {
    event: 'delay/timeout',
    wired: false,
    available: true,
    source: 'Proposed: timeout_rule when explicit overdue deadline exists; else operator_report',
    routeAttribution: 'payment + deadline',
    idempotencyKey: 'kind=delayed',
    notes: 'No silence inference. evidenceFromTimeoutRule ready; not hooked until deadline config exists.',
  },
  {
    event: 'settlement credited',
    wired: false,
    available: true,
    source: 'Same bank artifact as zar_available (FNB/Capitec match)',
    routeAttribution: 'invoice match',
    idempotencyKey: 'kind=settlement_credited linked to zar_available',
    notes:
      'Present implementation treats matched payout as terminal zar_available only to avoid double success. Builder evidenceFromSettlementCredited available for linked sibling if needed.',
  },
  {
    event: 'zar_available',
    wired: true,
    available: true,
    source:
      'functions/src/settlement/issueInvoices.ts → recordZarAvailableEvidence after markInvoiceZarAvailable (FNB gross / Capitec net match)',
    routeAttribution:
      'merchantPrincipalId=invoice.issuerId; cardId=deskCardId; mozambiqueBuyerId=billToId; posTerminalId=machineId; acquirer from rail; invoiceId; economicPaymentId',
    idempotencyKey: 'observationId → Firestore doc id in routeEvidence',
    notes:
      'Only after secure invoice match. Inbound receipt alone does not emit. Positive-only — insufficient for live policy.',
  },
  {
    event: 'reversal/chargeback',
    wired: false,
    available: true,
    source: 'Proposed: structured operator_report (bank chargeback mail not matched yet)',
    routeAttribution: 'payment/invoice/route + causeClass',
    idempotencyKey: 'kind=reversed compensating append',
    notes: 'Fold supports reversalExposure; no proven automated chargeback matcher.',
  },
  {
    event: 'verified recovery',
    wired: false,
    available: true,
    source: 'Proposed: operator_report recovered; or later zar_available after interruption (fold)',
    routeAttribution: 'payment/route',
    idempotencyKey: 'kind=recovered',
    notes: 'Later verified zar_available after delayed/under_review sets reviewState=recovered in fold.',
  },
]

export function wiredEvents(): string[] {
  return EMITTER_COVERAGE.filter((row) => row.wired).map((row) => row.event)
}

export function unwiredEvents(): string[] {
  return EMITTER_COVERAGE.filter((row) => !row.wired).map((row) => row.event)
}
