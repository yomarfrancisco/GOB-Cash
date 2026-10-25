/**
 * Distinct bank-evidence event kinds.
 * Not every authenticated bank email is a card purchase or settlement.
 */

export type BankEvidenceEventKind =
  | 'card_purchase'
  | 'card_decline'
  | 'card_reversal'
  | 'card_review'
  | 'bank_transfer'
  | 'cash_withdrawal'
  /** Legacy FNB ZA reservation notice (card float spend). */
  | 'card_spend'
  /** Legacy FNB/Capitec conversion receipt. */
  | 'conversion_receipt'
  /** FNB ZA Speedpoint / merchant POS payout into current account. */
  | 'pos_credit'

/** Kinds that may credit usable ZAR / settle a POS ticket. */
const POS_SETTLEMENT_KINDS = new Set<BankEvidenceEventKind>([
  'card_purchase',
  'conversion_receipt',
  'pos_credit',
])

/** Kinds that are card-lifecycle events (not transfers or ATM cash). */
const CARD_EVENT_KINDS = new Set<BankEvidenceEventKind>([
  'card_purchase',
  'card_decline',
  'card_reversal',
  'card_review',
  'card_spend',
  'conversion_receipt',
])

export function canSettlePosTicket(kind: BankEvidenceEventKind): boolean {
  return POS_SETTLEMENT_KINDS.has(kind)
}

export function canEmitUsableZarEvidence(kind: BankEvidenceEventKind): boolean {
  return kind === 'card_purchase' || kind === 'conversion_receipt' || kind === 'pos_credit'
}

export function isCardLifecycleEvent(kind: BankEvidenceEventKind): boolean {
  return CARD_EVENT_KINDS.has(kind)
}

export function isCashWithdrawal(kind: BankEvidenceEventKind): boolean {
  return kind === 'cash_withdrawal'
}

export function isBankTransfer(kind: BankEvidenceEventKind): boolean {
  return kind === 'bank_transfer'
}
