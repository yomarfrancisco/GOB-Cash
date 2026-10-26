/**
 * Pure builders that turn settlement / desk / operator events into RouteEvidence.
 * Persistence is optional — callers decide production vs simulation collection.
 */
import { buildRouteEvidence, pairId } from './evidence'
import type {
  CauseClass,
  EvidenceProvenance,
  EvidenceSource,
  EvidenceTrustClass,
  RouteEvidence,
  RouteEvidenceKind,
} from './types'

export type RouteIdentityInput = {
  merchantPrincipalId: string
  invoiceIssuerEntityId?: string | null
  mozambiqueBuyerId?: string | null
  cardId: string | null
  cardIssuerBankId: string | null
  posTerminalId: string | null
  acquirerBankId: string | null
  invoiceId?: string | null
  economicPaymentId?: string | null
  testRunId?: string | null
  cycleNumber?: number | null
  channel?: 'card' | 'eft'
  eftCorridorId?: string | null
}

function withIdentity(input: RouteIdentityInput) {
  const channel = input.channel || 'card'
  return {
    merchantPrincipalId: input.merchantPrincipalId,
    invoiceIssuerEntityId: input.invoiceIssuerEntityId ?? input.merchantPrincipalId,
    mozambiqueBuyerId: input.mozambiqueBuyerId ?? null,
    cardId: input.cardId,
    cardIssuerBankId: input.cardIssuerBankId,
    posTerminalId: input.posTerminalId,
    acquirerBankId: input.acquirerBankId,
    issuerAcquirerPairId: pairId(input.cardIssuerBankId, input.acquirerBankId),
    invoiceId: input.invoiceId ?? null,
    economicPaymentId: input.economicPaymentId ?? null,
    testRunId: input.testRunId ?? null,
    cycleNumber: input.cycleNumber ?? null,
    channel,
    eftCorridorId: channel === 'eft' ? input.eftCorridorId ?? null : null,
  }
}

export function evidenceFromZarAvailable(
  input: RouteIdentityInput & {
    source?: EvidenceSource
    provenance?: EvidenceProvenance
    trustClass?: EvidenceTrustClass
    requestedZar: number
    settledZar: number
    eventAt: string
    settledAt: string
    /** When same bank artifact already emitted settlement_credited. */
    linkedObservationId?: string | null
    evidenceRef?: string | null
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'zar_available',
    source: input.source || 'production',
    provenance: input.provenance || 'bank_mail',
    trustClass: input.trustClass || 'verified_match',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: input.settledZar,
    eventAt: input.eventAt,
    settledAt: input.settledAt,
    linkedObservationId: input.linkedObservationId ?? null,
    evidenceRef: input.evidenceRef ?? null,
    notes: ['Matched acquirer payout opened zar_available'],
  })
}

/**
 * settlement_credited vs zar_available:
 * - credited = funds recognised on the settlement path
 * - zar_available = usable ZAR for desk absorption
 * If one bank artifact proves both, emit zar_available as the terminal success and
 * optionally link a settlement_credited sibling without double-counting (fold dedups by link/payment).
 */
export function evidenceFromSettlementCredited(
  input: RouteIdentityInput & {
    source?: EvidenceSource
    provenance?: EvidenceProvenance
    requestedZar: number
    settledZar: number
    eventAt: string
    settledAt: string
    linkedObservationId?: string | null
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'settlement_credited',
    source: input.source || 'production',
    provenance: input.provenance || 'bank_mail',
    trustClass: 'verified_match',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: input.settledZar,
    eventAt: input.eventAt,
    settledAt: input.settledAt,
    linkedObservationId: input.linkedObservationId ?? null,
    notes: ['Settlement credited (may link to zar_available)'],
  })
}

export function evidenceFromAuthorisation(
  input: RouteIdentityInput & {
    source?: EvidenceSource
    provenance?: EvidenceProvenance
    requestedZar: number
    eventAt: string
    attemptEligibility?: 'eligible_submitted' | 'ineligible' | 'unknown'
    causeClass?: CauseClass
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'authorised',
    source: input.source || 'production',
    provenance: input.provenance || 'desk_confirm',
    trustClass: input.provenance === 'bank_mail' ? 'verified_bank' : 'verified_match',
    attemptEligibility: input.attemptEligibility || 'eligible_submitted',
    causeClass: input.causeClass || 'unknown',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    notes: [],
  })
}

export function evidenceFromCapture(
  input: RouteIdentityInput & {
    source?: EvidenceSource
    provenance?: EvidenceProvenance
    requestedZar: number
    eventAt: string
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'captured',
    source: input.source || 'production',
    provenance: input.provenance || 'acquirer_pos',
    trustClass: 'verified_match',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    notes: ['Capture confirms progression; not final settlement'],
  })
}

/**
 * Structured operator report — not free-text Sam chat.
 * Trust class remains operator_observation; fold must not treat as verified bank fact.
 */
export function evidenceFromOperatorReport(
  input: RouteIdentityInput & {
    kind: Extract<RouteEvidenceKind, 'declined' | 'under_review' | 'delayed' | 'reversed' | 'recovered'>
    operatorUid: string
    eventAt: string
    requestedZar: number
    settledZar?: number | null
    causeClass?: CauseClass
    evidenceRef?: string | null
    notes?: string[]
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: input.kind,
    source: 'production',
    provenance: 'operator_report',
    trustClass: 'operator_observation',
    attemptEligibility: 'eligible_submitted',
    causeClass: input.causeClass || 'unknown',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: input.settledZar ?? null,
    eventAt: input.eventAt,
    settledAt: null,
    operatorUid: input.operatorUid,
    evidenceRef: input.evidenceRef ?? null,
    notes: input.notes || [`Operator report: ${input.kind}`],
  })
}

export function evidenceFromTimeoutRule(
  input: RouteIdentityInput & {
    eventAt: string
    requestedZar: number
    overdueDeadlineAt: string
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'delayed',
    source: 'production',
    provenance: 'timeout_rule',
    trustClass: 'rule_derived',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'technical_timeout',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    notes: [`Explicit overdue deadline ${input.overdueDeadlineAt}`],
  })
}

/** Authenticated bank decline PDF (FNB / Capitec / merchant POS). */
export function evidenceFromBankDecline(
  input: RouteIdentityInput & {
    eventAt: string
    requestedZar: number
    evidenceRef?: string | null
    causeClass?: CauseClass
    notes?: string[]
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'declined',
    source: 'production',
    provenance: 'bank_mail',
    trustClass: 'verified_bank',
    attemptEligibility: 'eligible_submitted',
    causeClass: input.causeClass || 'unknown',
    ...withIdentity(input),
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    evidenceRef: input.evidenceRef ?? null,
    notes: input.notes || ['Bank decline receipt'],
  })
}

export type EftCorridorIdentity = {
  merchantPrincipalId?: string | null
  /** e.g. fnb_mozambique__sa_fnb or bim__beneficiary_nib */
  eftCorridorId: string
  cardIssuerBankId?: string | null
  acquirerBankId?: string | null
  economicPaymentId?: string | null
  invoiceId?: string | null
  testRunId?: string | null
  cycleNumber?: number | null
}

/** Funding / conversion EFT instructed on the desk — not bank truth yet. */
export function evidenceFromEftInstructed(
  input: EftCorridorIdentity & {
    requestedZar: number
    eventAt: string
    source?: EvidenceSource
    notes?: string[]
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'authorised',
    source: input.source || 'production',
    provenance: 'desk_confirm',
    trustClass: 'operator_observation',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    channel: 'eft',
    eftCorridorId: input.eftCorridorId,
    merchantPrincipalId: input.merchantPrincipalId || 'desk_eft',
    invoiceIssuerEntityId: input.merchantPrincipalId || 'desk_eft',
    mozambiqueBuyerId: null,
    cardId: null,
    cardIssuerBankId: input.cardIssuerBankId ?? null,
    posTerminalId: null,
    acquirerBankId: input.acquirerBankId ?? null,
    invoiceId: input.invoiceId ?? null,
    economicPaymentId: input.economicPaymentId ?? null,
    testRunId: input.testRunId ?? null,
    cycleNumber: input.cycleNumber ?? null,
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    notes: input.notes || ['EFT instructed — awaiting bank_transfer'],
  })
}

/** Moz bank_transfer / SA credit notice matched to an open EFT ticket. */
export function evidenceFromEftBankTransfer(
  input: EftCorridorIdentity & {
    requestedZar: number
    settledZar: number
    eventAt: string
    settledAt?: string
    evidenceRef?: string | null
    source?: EvidenceSource
    notes?: string[]
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'zar_available',
    source: input.source || 'production',
    provenance: 'bank_mail',
    trustClass: 'verified_bank',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    channel: 'eft',
    eftCorridorId: input.eftCorridorId,
    merchantPrincipalId: input.merchantPrincipalId || 'desk_eft',
    invoiceIssuerEntityId: input.merchantPrincipalId || 'desk_eft',
    mozambiqueBuyerId: null,
    cardId: null,
    cardIssuerBankId: input.cardIssuerBankId ?? null,
    posTerminalId: null,
    acquirerBankId: input.acquirerBankId ?? null,
    invoiceId: input.invoiceId ?? null,
    economicPaymentId: input.economicPaymentId ?? null,
    testRunId: input.testRunId ?? null,
    cycleNumber: input.cycleNumber ?? null,
    requestedZar: input.requestedZar,
    settledZar: input.settledZar,
    eventAt: input.eventAt,
    settledAt: input.settledAt || input.eventAt,
    evidenceRef: input.evidenceRef ?? null,
    notes: input.notes || ['EFT bank_transfer / credit matched — zar_available on corridor'],
  })
}

/** Soft T+1 / hard T+2 miss — delayed on EFT corridor only. */
export function evidenceFromEftDelayed(
  input: EftCorridorIdentity & {
    requestedZar: number
    eventAt: string
    overdueDeadlineAt: string
    source?: EvidenceSource
  }
): RouteEvidence {
  return buildRouteEvidence({
    kind: 'delayed',
    source: input.source || 'production',
    provenance: 'timeout_rule',
    trustClass: 'rule_derived',
    attemptEligibility: 'eligible_submitted',
    causeClass: 'unknown',
    channel: 'eft',
    eftCorridorId: input.eftCorridorId,
    merchantPrincipalId: input.merchantPrincipalId || 'desk_eft',
    invoiceIssuerEntityId: input.merchantPrincipalId || 'desk_eft',
    mozambiqueBuyerId: null,
    cardId: null,
    cardIssuerBankId: input.cardIssuerBankId ?? null,
    posTerminalId: null,
    acquirerBankId: input.acquirerBankId ?? null,
    invoiceId: input.invoiceId ?? null,
    economicPaymentId: input.economicPaymentId ?? null,
    testRunId: input.testRunId ?? null,
    cycleNumber: input.cycleNumber ?? null,
    requestedZar: input.requestedZar,
    settledZar: null,
    eventAt: input.eventAt,
    settledAt: null,
    notes: [`EFT overdue vs ${input.overdueDeadlineAt} — investigate or grant banker chase`],
  })
}
