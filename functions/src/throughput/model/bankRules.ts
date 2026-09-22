/**
 * Bank Operating Rules / Feasibility Layer.
 *
 * Runs on the realized packed plan, before Q_base, Thompson ranking, rolling-Q or MPC:
 *
 *   genuine invoices / tickets / obligations
 *     → construct candidate packed plan
 *     → Bank Operating Rules / Feasibility Layer        (this module)
 *     → feasible candidate actions only
 *     → Q_base → Thompson economic residual ranking → rolling-Q / MPC → selected action → transition
 *
 * Three categories are kept separate and labelled everywhere:
 *
 *   HARD ISSUER CONSTRAINTS (bank guidance — infeasible, never scored)
 *     1. no split economic payment (anti-fragmentation)
 *     2. no same-card retry of a declined economic payment
 *     3. supporting invoice / documentation present
 *     4. PIN-present / card-present flow
 *     5. one eligible purchase per card per day, across core + organic
 *     6. repeated identical genuine amount ⇒ bankRuleReviewRequired (defer or allow with evidence)
 *
 *   BANKER-IDENTIFIED CONTINUITY FEATURES (observable; not bans)
 *     7. amount > R10,000 is high value
 *     8. absence of local-card activity
 *     9. repeat use of the same card
 *
 *   MODEL HYPOTHESES (illustrative / uncalibrated)
 *     7-day and 14-day repeat windows, recency weights w1 > w7 > w14, the repeated-amount window,
 *     and the provisional hazard coefficients on the three features (0 = diagnostic only).
 *
 * Hard rules never enter Δ_G, θ*_econ, the Thompson posterior or VOI. Features may enter
 * h_structural through explicitly named provisional factors; they never enter Δ_G.
 */
import { formatZar, roundMoney, sum } from "./math";
import type {
  BankDaySummary,
  BankRiskFeatures,
  BankRuleCategory,
  BlockedObligation,
  CardOrigin,
  CoreTicket,
  HardBankRuleId,
  HazardContributionRow,
  LedgerTransaction,
  NamedFactor,
  PlannedTransaction,
  Resource,
  Scenario,
  SimState,
  TransactionSource,
} from "./types";

export const BANK_CATEGORY_LABELS: Record<BankRuleCategory, string> = {
  "hard-issuer-constraint": "Hard issuer constraint",
  "banker-identified-feature": "Banker-identified continuity feature",
  "model-hypothesis": "Model hypothesis (illustrative / uncalibrated)",
};

export const HARD_RULE_META: Record<HardBankRuleId, { label: string; bankWording: string }> = {
  "no-split-payment": {
    label: "No split economic payment",
    bankWording: "No split invoices",
  },
  "one-purchase-per-card-per-day": {
    label: "One eligible purchase per card per day",
    bankWording: "Do not use the same card twice a day",
  },
  "no-retry-after-decline": {
    label: "No same-card retry after decline",
    bankWording: "Do not re-purchase a declined card",
  },
  "supporting-invoice-required": {
    label: "Supporting invoice required",
    bankWording: "Keep supplier invoices",
  },
  "pin-present-required": {
    label: "PIN-present / card-present flow required",
    bankWording: "PIN must show all the time",
  },
  "repeated-amount-review": {
    label: "Repeated identical amount → review",
    bankWording: "Do not use the same amount recurringly",
  },
};

export const HARD_RULE_IDS: HardBankRuleId[] = [
  "no-split-payment",
  "one-purchase-per-card-per-day",
  "no-retry-after-decline",
  "supporting-invoice-required",
  "pin-present-required",
  "repeated-amount-review",
];

/** Ledger days retained. Must cover the longest window (repeated-amount window, 14d features). */
export const LEDGER_RETENTION_DAYS = 45;

export function bankRulesOn(scenario: Scenario): boolean {
  return scenario.bankRulesEnabled === true;
}

/* ------------------------------------------------------------------------------------------
 * Transaction identity
 * ------------------------------------------------------------------------------------------ */

export function ticketPaymentId(day: number, index: number): string {
  return `pay:${day}:${index + 1}`;
}

export function ticketInvoiceId(day: number, index: number): string {
  return `INV-${String(day).padStart(3, "0")}-${String(index + 1).padStart(2, "0")}`;
}

/** Fill missing identity fields deterministically. Amounts and times are never changed. */
export function withTicketIdentity(tickets: CoreTicket[], day: number): CoreTicket[] {
  return tickets.map((t, i) => ({
    ...t,
    economicPaymentId: t.economicPaymentId ?? ticketPaymentId(day, i),
    invoiceId: t.invoiceId ?? ticketInvoiceId(day, i),
    supportingInvoicePresent: t.supportingInvoicePresent ?? true,
  }));
}

export function organicPaymentId(day: number, source: Exclude<TransactionSource, "core">): string {
  return source === "organic-revenue" ? `org-rev:${day}` : `org-exp:${day}`;
}

export function organicInvoiceId(day: number, source: Exclude<TransactionSource, "core">): string {
  return source === "organic-revenue" ? `ORG-REV-${String(day).padStart(3, "0")}` : `ORG-EXP-${String(day).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------------------------------
 * Ledger + decline state
 * ------------------------------------------------------------------------------------------ */

export function cardOriginOf(card: Resource | undefined): CardOrigin {
  return card?.cardOrigin ?? "international";
}

export function posPinCapable(pos: Resource | undefined): boolean {
  return pos?.pinCapableFlow ?? true;
}

export function posCardPresent(pos: Resource | undefined): boolean {
  return pos?.cardPresentFlow ?? true;
}

export function isHighValue(amount: number, scenario: Scenario): boolean {
  return amount > Math.max(0, scenario.highValueThresholdZar);
}

/** Append today's executed transactions to the ledger and drop rows outside the retention window. */
export function recordLedgerTransactions(state: SimState, transactions: PlannedTransaction[]): void {
  if (!state.bankLedger) state.bankLedger = [];
  for (const tx of transactions) {
    if (tx.amount <= 1e-9) continue;
    state.bankLedger.push({
      day: state.day,
      economicPaymentId: tx.economicPaymentId,
      cardId: tx.cardId,
      posId: tx.posId,
      amount: tx.amount,
      source: tx.source,
      cardOrigin: tx.cardOrigin,
      highValue: tx.highValue,
    });
  }
  const cutoff = state.day - LEDGER_RETENTION_DAYS;
  if (state.bankLedger.some((row) => row.day <= cutoff)) {
    state.bankLedger = state.bankLedger.filter((row) => row.day > cutoff);
  }
}

/** Persist a decline. The same card must not retry this economic payment (rule 2). */
export function recordDecline(state: SimState, cardId: string, economicPaymentId: string, day = state.day): void {
  if (!state.declines) state.declines = [];
  if (state.declines.some((d) => d.cardId === cardId && d.economicPaymentId === economicPaymentId)) return;
  state.declines.push({ day, cardId, economicPaymentId });
}

function priorRows(state: SimState, windowDays: number): LedgerTransaction[] {
  const from = state.day - (windowDays - 1);
  return (state.bankLedger ?? []).filter((row) => row.day >= from && row.day < state.day);
}

/** Uses of a card on days [today − (windowDays − 1), today − 1]. */
export function priorCardUses(state: SimState, cardId: string, windowDays: number): number {
  let n = 0;
  const from = state.day - (windowDays - 1);
  for (const row of state.bankLedger ?? []) {
    if (row.cardId === cardId && row.day >= from && row.day < state.day) n += 1;
  }
  return n;
}

/** Uses already recorded on the ledger for today (normally 0 while a day is being decided). */
export function usesTodayFromLedger(state: SimState): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of state.bankLedger ?? []) {
    if (row.day === state.day) out.set(row.cardId, (out.get(row.cardId) ?? 0) + 1);
  }
  return out;
}

/** Cache-key fragment: everything the feasibility layer reads from the state. */
export function ledgerSignature(state: SimState, scenario: Scenario): string {
  if (!bankRulesOn(scenario)) return "bank-off";
  const cards = state.cards
    .map((c) => `${c.id}:${priorCardUses(state, c.id, 1)}/${priorCardUses(state, c.id, 7)}/${priorCardUses(state, c.id, 14)}`)
    .join(",");
  const amounts = priorRows(state, Math.max(1, scenario.repeatedAmountWindowDays)).length;
  // Pair-level persistence inputs: pairs used on the previous operating day and pair active days in 14d.
  const prevOp = previousOperatingDay(state.day);
  const pairDays = new Map<string, number>();
  const prevPairs: string[] = [];
  for (const row of priorRows(state, 14)) {
    const pk = ledgerPairKey(row.cardId, row.posId);
    pairDays.set(pk, (pairDays.get(pk) ?? 0) + 1);
    if (prevOp !== null && row.day === prevOp) prevPairs.push(pk);
  }
  const pairs = [...pairDays.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
  return `bank:${cards}|amt${amounts}|dec${(state.declines ?? []).length}|led${(state.bankLedger ?? []).length}|pp${prevPairs.sort().join(",")}|pd${pairs}`;
}

/* ------------------------------------------------------------------------------------------
 * Repeated identical amounts (rule 6) — track, never modify
 * ------------------------------------------------------------------------------------------ */

export interface SameAmountHistory {
  card: number;
  pos: number;
  pair: number;
  merchant: number;
}

export function sameAmountHistory(
  state: SimState,
  scenario: Scenario,
  amount: number,
  cardId: string,
  posId: string,
  todayTransactions: PlannedTransaction[] = [],
): SameAmountHistory {
  const out: SameAmountHistory = { card: 0, pos: 0, pair: 0, merchant: 0 };
  const same = (a: number) => Math.abs(a - amount) < 0.005;
  for (const row of priorRows(state, Math.max(1, scenario.repeatedAmountWindowDays))) {
    if (!same(row.amount)) continue;
    out.merchant += 1;
    if (row.cardId === cardId) out.card += 1;
    if (row.posId === posId) out.pos += 1;
    if (row.cardId === cardId && row.posId === posId) out.pair += 1;
  }
  for (const tx of todayTransactions) {
    if (!same(tx.amount)) continue;
    out.merchant += 1;
    if (tx.cardId === cardId) out.card += 1;
    if (tx.posId === posId) out.pos += 1;
    if (tx.cardId === cardId && tx.posId === posId) out.pair += 1;
  }
  return out;
}

export function repeatedAmountFlagged(history: SameAmountHistory): boolean {
  return history.card + history.pos + history.pair + history.merchant > 0;
}

/* ------------------------------------------------------------------------------------------
 * Hard-rule eligibility of one (payment, card, POS) triple
 * ------------------------------------------------------------------------------------------ */

export interface PaymentCandidate {
  economicPaymentId: string;
  invoiceId: string | null;
  amount: number;
  source: TransactionSource;
  supportingInvoicePresent: boolean;
}

export interface EligibilityContext {
  state: SimState;
  scenario: Scenario;
  /** Card uses already committed today (ledger rows for today + earlier picks in this plan). */
  usesToday: Map<string, number>;
  /** Only genuine realized amounts are checked for repetition; expected placeholders are not. */
  checkRepeatedAmounts: boolean;
  /** Transactions already placed today (for same-amount history within the day). */
  todayTransactions: PlannedTransaction[];
}

export type EligibilityVerdict =
  | { ok: true; reviewRequired: boolean; sameAmount: SameAmountHistory }
  | { ok: false; rule: HardBankRuleId; reason: string; reconsiderLater: boolean; sameAmount: SameAmountHistory; cardId?: string };

function declineBlocks(ctx: EligibilityContext, cardId: string, economicPaymentId: string): boolean {
  const { state, scenario } = ctx;
  for (const d of state.declines ?? []) {
    if (d.cardId !== cardId) continue;
    if (d.economicPaymentId === economicPaymentId) return true;
    if (scenario.declineBlocksCardForDays > 0 && state.day - d.day < scenario.declineBlocksCardForDays) return true;
  }
  return false;
}

export function checkHardRules(
  ctx: EligibilityContext,
  payment: PaymentCandidate,
  card: Resource,
  pos: Resource,
): EligibilityVerdict {
  const { scenario } = ctx;
  const sameAmount = ctx.checkRepeatedAmounts
    ? sameAmountHistory(ctx.state, scenario, payment.amount, card.id, pos.id, ctx.todayTransactions)
    : { card: 0, pos: 0, pair: 0, merchant: 0 };

  if (scenario.documentationRequired && !payment.supportingInvoicePresent) {
    return {
      ok: false,
      rule: "supporting-invoice-required",
      reason: "blocked: supporting invoice missing",
      reconsiderLater: false,
      sameAmount,
    };
  }
  if (scenario.requiresPinPresent && !(posPinCapable(pos) && posCardPresent(pos))) {
    return {
      ok: false,
      rule: "pin-present-required",
      reason: `blocked: ${pos.name} is not a PIN-capable card-present flow`,
      reconsiderLater: true,
      sameAmount,
    };
  }
  if (declineBlocks(ctx, card.id, payment.economicPaymentId)) {
    return {
      ok: false,
      rule: "no-retry-after-decline",
      reason: `blocked: ${card.name} was declined for this economic payment and must not retry it`,
      reconsiderLater: true,
      sameAmount,
    };
  }
  const used = ctx.usesToday.get(card.id) ?? 0;
  if (used >= Math.max(1, scenario.maxEligiblePurchasesPerCardPerDay)) {
    return {
      ok: false,
      rule: "one-purchase-per-card-per-day",
      reason: `blocked: ${card.name} already has ${used} eligible purchase${used === 1 ? "" : "s"} today`,
      reconsiderLater: true,
      sameAmount,
      cardId: card.id,
    };
  }
  const repeated = repeatedAmountFlagged(sameAmount);
  if (repeated) {
    const allow = scenario.repeatedAmountPolicy === "allow-with-invoice" && payment.supportingInvoicePresent;
    if (!allow) {
      return {
        ok: false,
        rule: "repeated-amount-review",
        reason:
          scenario.repeatedAmountPolicy === "defer"
            ? `deferred for operator review: ${formatZar(payment.amount)} repeats an identical genuine amount in the last ${scenario.repeatedAmountWindowDays} days`
            : `deferred: ${formatZar(payment.amount)} repeats an identical amount and no supporting invoice is on file`,
        reconsiderLater: true,
        sameAmount,
      };
    }
  }
  return { ok: true, reviewRequired: repeated, sameAmount };
}

export function buildPlannedTransaction(
  ctx: EligibilityContext,
  payment: PaymentCandidate,
  card: Resource,
  pos: Resource,
  time: string,
  verdict: Extract<EligibilityVerdict, { ok: true }>,
): PlannedTransaction {
  const { state, scenario } = ctx;
  const usedBefore = (ctx.usesToday.get(card.id) ?? 0) > 0;
  return {
    time,
    amount: payment.amount,
    cardId: card.id,
    posId: pos.id,
    economicPaymentId: payment.economicPaymentId,
    invoiceId: payment.invoiceId,
    source: payment.source,
    cardOrigin: cardOriginOf(card),
    cardPresent: posCardPresent(pos),
    pinCapableFlow: posPinCapable(pos),
    documentationRequired: scenario.documentationRequired,
    supportingInvoicePresent: payment.supportingInvoicePresent,
    highValue: isHighValue(payment.amount, scenario),
    sameCardUsedEarlierToday: usedBefore,
    cardUsesPrior7d: priorCardUses(state, card.id, 7),
    cardUsesPrior14d: priorCardUses(state, card.id, 14),
    sameAmountHistory: verdict.sameAmount,
    bankRuleReviewRequired: verdict.reviewRequired,
    eligibility: verdict.reviewRequired ? "eligible-review-flagged" : "eligible",
  };
}

/** Legacy (bank rules off) transaction row: identity fields filled, rule fields reported as observed. */
export function legacyPlannedTransaction(
  state: SimState,
  scenario: Scenario,
  payment: PaymentCandidate,
  card: Resource,
  pos: Resource,
  time: string,
  usesToday: Map<string, number>,
): PlannedTransaction {
  const usedBefore = (usesToday.get(card.id) ?? 0) > 0;
  return {
    time,
    amount: payment.amount,
    cardId: card.id,
    posId: pos.id,
    economicPaymentId: payment.economicPaymentId,
    invoiceId: payment.invoiceId,
    source: payment.source,
    cardOrigin: cardOriginOf(card),
    cardPresent: posCardPresent(pos),
    pinCapableFlow: posPinCapable(pos),
    documentationRequired: scenario.documentationRequired,
    supportingInvoicePresent: payment.supportingInvoicePresent,
    highValue: isHighValue(payment.amount, scenario),
    sameCardUsedEarlierToday: usedBefore,
    cardUsesPrior7d: priorCardUses(state, card.id, 7),
    cardUsesPrior14d: priorCardUses(state, card.id, 14),
    sameAmountHistory: { card: 0, pos: 0, pair: 0, merchant: 0 },
    bankRuleReviewRequired: false,
    eligibility: "eligible",
  };
}

export function blockedObligation(
  payment: PaymentCandidate,
  cardIds: string[],
  posIds: string[],
  rule: HardBankRuleId,
  reason: string,
  reconsiderLater: boolean,
): BlockedObligation {
  return {
    economicPaymentId: payment.economicPaymentId,
    invoiceId: payment.invoiceId,
    amount: payment.amount,
    source: payment.source,
    candidateCardIds: [...new Set(cardIds)],
    candidatePosIds: [...new Set(posIds)],
    rule,
    category: "hard-issuer-constraint",
    reason,
    reconsiderLater,
  };
}

/**
 * Choose the most specific rule when every cover row rejected a payment.
 * Documentation is payment-level; PIN is POS-level; decline and card budget are card-level.
 */
export function dominantBlockingRule(verdicts: Array<Extract<EligibilityVerdict, { ok: false }>>): Extract<EligibilityVerdict, { ok: false }> | null {
  if (verdicts.length === 0) return null;
  const order: HardBankRuleId[] = [
    "supporting-invoice-required",
    "no-split-payment",
    "repeated-amount-review",
    "no-retry-after-decline",
    "pin-present-required",
    "one-purchase-per-card-per-day",
  ];
  for (const rule of order) {
    const hits = verdicts.filter((v) => v.rule === rule);
    const hit = hits[0];
    if (!hit) continue;
    if (rule === "one-purchase-per-card-per-day") {
      const cards = new Set(hits.map((v) => v.cardId).filter((c): c is string => Boolean(c)));
      if (cards.size > 1) {
        return { ...hit, reason: `blocked: every candidate card (${cards.size}) already has 1 eligible purchase today` };
      }
    }
    return hit;
  }
  return verdicts[0]!;
}

/* ------------------------------------------------------------------------------------------
 * Banker-identified continuity features on the realized plan + ledger history
 * ------------------------------------------------------------------------------------------ */

export interface TodayTransactionLike {
  cardId: string;
  posId: string;
  amount: number;
  cardOrigin?: CardOrigin;
  highValue?: boolean;
}

export function emptyBankRiskFeatures(scenario: Scenario): BankRiskFeatures {
  return {
    highValueThresholdZar: scenario.highValueThresholdZar,
    highValueCount1d: 0,
    highValueCount7d: 0,
    highValueCount14d: 0,
    highValueVolume1d: 0,
    highValueVolume7d: 0,
    highValueVolume14d: 0,
    highValueShare1d: 0,
    highValueShare7d: 0,
    highValueShare14d: 0,
    localTxCount1d: 0,
    localTxCount7d: 0,
    localTxCount14d: 0,
    internationalTxCount1d: 0,
    internationalTxCount7d: 0,
    internationalTxCount14d: 0,
    localVolumeShare1d: 0,
    localVolumeShare7d: 0,
    localVolumeShare14d: 0,
    internationalVolumeShare1d: 0,
    internationalVolumeShare7d: 0,
    internationalVolumeShare14d: 0,
    zeroLocalActivity14d: true,
    cardUses1d: {},
    cardUses7d: {},
    cardUses14d: {},
    activeCardDays7d: {},
    activeCardDays14d: {},
    repeatCardVolume7d: 0,
    repeatCardVolume14d: 0,
    maxCardUses1d: 0,
    maxCardUses7d: 0,
    maxCardUses14d: 0,
    sameDayRepeat: 0,
    repeat7d: 0,
    repeat14d: 0,
    repeatExposure: 0,
    cardUsedPrevOperatingDay: {},
    pairUsedPrevOperatingDay: {},
    cardActiveDays7d: {},
    cardActiveDays14d: {},
    pairActiveDays7d: {},
    pairActiveDays14d: {},
    cardActiveShare7d: {},
    cardActiveShare14d: {},
    pairActiveShare7d: {},
    pairActiveShare14d: {},
    cardVolumeShare7d: {},
    cardVolumeShare14d: {},
    pairVolumeShare7d: {},
    pairVolumeShare14d: {},
    operatingDaysPrior7d: 0,
    operatingDaysPrior14d: 0,
    cardsUsedPrevOperatingDay: 0,
    pairsUsedPrevOperatingDay: 0,
    cardRepeatExposure: 0,
    pairRepeatExposure: 0,
    cardRepeatExposureById: {},
    pairRepeatExposureById: {},
    highValueFactor: 1,
    repeatCardFactor: 1,
    repeatPairFactor: 1,
    localMixFactor: 1,
  };
}

/** Same weekday convention as demand.ts (day 1 = Monday); duplicated here to avoid an import cycle. */
export function isOperatingDay(day: number): boolean {
  return (((Math.max(1, day) - 1) % 7) + 7) % 7 < 5;
}

/** Most recent operating weekday strictly before `day`, or null. */
export function previousOperatingDay(day: number): number | null {
  for (let d = day - 1; d >= Math.max(1, day - 7); d -= 1) if (isOperatingDay(d)) return d;
  return null;
}

function operatingDaysIn(from: number, to: number): number {
  let n = 0;
  for (let d = Math.max(1, from); d <= to; d += 1) if (isOperatingDay(d)) n += 1;
  return n;
}

export function ledgerPairKey(cardId: string, posId: string): string {
  return `${cardId}|${posId}`;
}

interface WindowAgg {
  count: number;
  volume: number;
  hvCount: number;
  hvVolume: number;
  localCount: number;
  localVolume: number;
  intlCount: number;
  intlVolume: number;
  uses: Record<string, number>;
  volumeByCard: Record<string, number>;
  daysByCard: Record<string, Set<number>>;
  volumeByPair: Record<string, number>;
  daysByPair: Record<string, Set<number>>;
}

function newAgg(): WindowAgg {
  return {
    count: 0,
    volume: 0,
    hvCount: 0,
    hvVolume: 0,
    localCount: 0,
    localVolume: 0,
    intlCount: 0,
    intlVolume: 0,
    uses: {},
    volumeByCard: {},
    daysByCard: {},
    volumeByPair: {},
    daysByPair: {},
  };
}

function addToAgg(agg: WindowAgg, day: number, cardId: string, posId: string, amount: number, origin: CardOrigin, hv: boolean): void {
  agg.count += 1;
  agg.volume += amount;
  if (hv) {
    agg.hvCount += 1;
    agg.hvVolume += amount;
  }
  if (origin === "local") {
    agg.localCount += 1;
    agg.localVolume += amount;
  } else {
    agg.intlCount += 1;
    agg.intlVolume += amount;
  }
  agg.uses[cardId] = (agg.uses[cardId] ?? 0) + 1;
  agg.volumeByCard[cardId] = (agg.volumeByCard[cardId] ?? 0) + amount;
  (agg.daysByCard[cardId] ??= new Set()).add(day);
  const pk = ledgerPairKey(cardId, posId);
  agg.volumeByPair[pk] = (agg.volumeByPair[pk] ?? 0) + amount;
  (agg.daysByPair[pk] ??= new Set()).add(day);
}

function shareMap(volumes: Record<string, number>, total: number): Record<string, number> {
  return Object.fromEntries(Object.entries(volumes).map(([k, v]) => [k, total > 1e-9 ? v / total : 0]));
}

/** Normalised recency-weighted exposure in [0, 1]. */
function exposureOf(w1: number, w7: number, w14: number, prev: boolean, share7: number, share14: number): number {
  const a = Math.max(0, w1);
  const b = Math.max(0, w7);
  const c = Math.max(0, w14);
  const denom = a + b + c;
  if (denom <= 1e-12) return 0;
  return (a * (prev ? 1 : 0) + b * share7 + c * share14) / denom;
}

function repeatVolume(agg: WindowAgg): number {
  let v = 0;
  for (const [card, n] of Object.entries(agg.uses)) if (n >= 2) v += agg.volumeByCard[card] ?? 0;
  return v;
}

function maxOf(rec: Record<string, number>): number {
  let m = 0;
  for (const v of Object.values(rec)) m = Math.max(m, v);
  return m;
}

function daysCount(rec: Record<string, Set<number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(rec).map(([k, s]) => [k, s.size]));
}

/**
 * Features over 1d / 7d / 14d windows (calendar days, today included), computed on the
 * realized plan given as `today` plus the ledger of executed transactions.
 */
export function bankRiskFeatures(state: SimState, scenario: Scenario, today: TodayTransactionLike[]): BankRiskFeatures {
  const cardsById = new Map(state.cards.map((c) => [c.id, c]));
  const w1 = newAgg();
  const w7 = newAgg();
  const w14 = newAgg();
  const from7 = state.day - 6;
  const from14 = state.day - 13;
  // Prior-window aggregates (yesterday and earlier) for the rolling persistence features.
  const prior7 = newAgg();
  const prior14 = newAgg();
  const prevOp = previousOperatingDay(state.day);
  const cardsPrevOp = new Set<string>();
  const pairsPrevOp = new Set<string>();
  for (const row of state.bankLedger ?? []) {
    if (row.day >= state.day || row.day < from14) continue;
    addToAgg(w14, row.day, row.cardId, row.posId, row.amount, row.cardOrigin, row.highValue);
    addToAgg(prior14, row.day, row.cardId, row.posId, row.amount, row.cardOrigin, row.highValue);
    if (row.day >= from7) {
      addToAgg(w7, row.day, row.cardId, row.posId, row.amount, row.cardOrigin, row.highValue);
      addToAgg(prior7, row.day, row.cardId, row.posId, row.amount, row.cardOrigin, row.highValue);
    }
    if (prevOp !== null && row.day === prevOp) {
      cardsPrevOp.add(row.cardId);
      pairsPrevOp.add(ledgerPairKey(row.cardId, row.posId));
    }
  }
  const usedTodayCards = new Set<string>();
  const todayVolumeByCard: Record<string, number> = {};
  const todayVolumeByPair: Record<string, number> = {};
  let todayVolume = 0;
  for (const tx of today) {
    if (tx.amount <= 1e-9) continue;
    const origin = tx.cardOrigin ?? cardOriginOf(cardsById.get(tx.cardId));
    const hv = tx.highValue ?? isHighValue(tx.amount, scenario);
    usedTodayCards.add(tx.cardId);
    todayVolume += tx.amount;
    todayVolumeByCard[tx.cardId] = (todayVolumeByCard[tx.cardId] ?? 0) + tx.amount;
    const pk = ledgerPairKey(tx.cardId, tx.posId);
    todayVolumeByPair[pk] = (todayVolumeByPair[pk] ?? 0) + tx.amount;
    addToAgg(w1, state.day, tx.cardId, tx.posId, tx.amount, origin, hv);
    addToAgg(w7, state.day, tx.cardId, tx.posId, tx.amount, origin, hv);
    addToAgg(w14, state.day, tx.cardId, tx.posId, tx.amount, origin, hv);
  }
  const share = (part: number, total: number) => (total > 1e-9 ? part / total : 0);

  // Rolling persistence / repeat features. Active shares divide by operating weekdays in the
  // prior window so weekends do not dilute; day 1 has no prior operating day ⇒ everything 0.
  const opDays7 = operatingDaysIn(from7, state.day - 1);
  const opDays14 = operatingDaysIn(from14, state.day - 1);
  const cardActiveDays7d = daysCount(prior7.daysByCard);
  const cardActiveDays14d = daysCount(prior14.daysByCard);
  const pairActiveDays7d = daysCount(prior7.daysByPair);
  const pairActiveDays14d = daysCount(prior14.daysByPair);
  const shareOver = (days: Record<string, number>, n: number) =>
    Object.fromEntries(Object.entries(days).map(([k, d]) => [k, n > 0 ? Math.min(1, d / n) : 0]));
  const cardActiveShare7d = shareOver(cardActiveDays7d, opDays7);
  const cardActiveShare14d = shareOver(cardActiveDays14d, opDays14);
  const pairActiveShare7d = shareOver(pairActiveDays7d, opDays7);
  const pairActiveShare14d = shareOver(pairActiveDays14d, opDays14);
  const cardUsedPrevOperatingDay: Record<string, boolean> = {};
  const pairUsedPrevOperatingDay: Record<string, boolean> = {};
  const cardRepeatExposureById: Record<string, number> = {};
  const pairRepeatExposureById: Record<string, number> = {};
  let cardRepeatExposure = 0;
  let pairRepeatExposure = 0;
  let cardsUsedPrevOperatingDay = 0;
  let pairsUsedPrevOperatingDay = 0;
  for (const [card, vol] of Object.entries(todayVolumeByCard)) {
    const prev = cardsPrevOp.has(card);
    cardUsedPrevOperatingDay[card] = prev;
    if (prev) cardsUsedPrevOperatingDay += 1;
    const e = exposureOf(
      scenario.repeatWeightSameDay,
      scenario.repeatWeight7d,
      scenario.repeatWeight14d,
      prev,
      cardActiveShare7d[card] ?? 0,
      cardActiveShare14d[card] ?? 0,
    );
    cardRepeatExposureById[card] = e;
    cardRepeatExposure += e * share(vol, todayVolume);
  }
  for (const [pk, vol] of Object.entries(todayVolumeByPair)) {
    const prev = pairsPrevOp.has(pk);
    pairUsedPrevOperatingDay[pk] = prev;
    if (prev) pairsUsedPrevOperatingDay += 1;
    const e = exposureOf(
      scenario.pairRepeatWeightPrevDay,
      scenario.pairRepeatWeight7d,
      scenario.pairRepeatWeight14d,
      prev,
      pairActiveShare7d[pk] ?? 0,
      pairActiveShare14d[pk] ?? 0,
    );
    pairRepeatExposureById[pk] = e;
    pairRepeatExposure += e * share(vol, todayVolume);
  }

  let sameDayRepeat = 0;
  for (const n of Object.values(w1.uses)) if (n >= 2) sameDayRepeat += 1;
  let priorUses7 = 0;
  let priorUses14 = 0;
  for (const card of usedTodayCards) {
    priorUses7 += (w7.uses[card] ?? 0) - (w1.uses[card] ?? 0);
    priorUses14 += (w14.uses[card] ?? 0) - (w1.uses[card] ?? 0);
  }
  const nToday = usedTodayCards.size;
  const repeat7d = nToday > 0 ? priorUses7 / nToday : 0;
  const repeat14d = nToday > 0 ? priorUses14 / nToday : 0;
  const repeatExposure =
    Math.max(0, scenario.repeatWeightSameDay) * sameDayRepeat +
    Math.max(0, scenario.repeatWeight7d) * repeat7d +
    Math.max(0, scenario.repeatWeight14d) * repeat14d;

  const highValueShare1d = share(w1.hvVolume, w1.volume);
  const localVolumeShare14d = share(w14.localVolume, w14.volume);

  return {
    highValueThresholdZar: scenario.highValueThresholdZar,
    highValueCount1d: w1.hvCount,
    highValueCount7d: w7.hvCount,
    highValueCount14d: w14.hvCount,
    highValueVolume1d: roundMoney(w1.hvVolume),
    highValueVolume7d: roundMoney(w7.hvVolume),
    highValueVolume14d: roundMoney(w14.hvVolume),
    highValueShare1d,
    highValueShare7d: share(w7.hvVolume, w7.volume),
    highValueShare14d: share(w14.hvVolume, w14.volume),
    localTxCount1d: w1.localCount,
    localTxCount7d: w7.localCount,
    localTxCount14d: w14.localCount,
    internationalTxCount1d: w1.intlCount,
    internationalTxCount7d: w7.intlCount,
    internationalTxCount14d: w14.intlCount,
    localVolumeShare1d: share(w1.localVolume, w1.volume),
    localVolumeShare7d: share(w7.localVolume, w7.volume),
    localVolumeShare14d,
    internationalVolumeShare1d: share(w1.intlVolume, w1.volume),
    internationalVolumeShare7d: share(w7.intlVolume, w7.volume),
    internationalVolumeShare14d: share(w14.intlVolume, w14.volume),
    zeroLocalActivity14d: w14.localCount === 0,
    cardUses1d: { ...w1.uses },
    cardUses7d: { ...w7.uses },
    cardUses14d: { ...w14.uses },
    activeCardDays7d: daysCount(w7.daysByCard),
    activeCardDays14d: daysCount(w14.daysByCard),
    repeatCardVolume7d: roundMoney(repeatVolume(w7)),
    repeatCardVolume14d: roundMoney(repeatVolume(w14)),
    maxCardUses1d: maxOf(w1.uses),
    maxCardUses7d: maxOf(w7.uses),
    maxCardUses14d: maxOf(w14.uses),
    sameDayRepeat,
    repeat7d,
    repeat14d,
    repeatExposure,
    cardUsedPrevOperatingDay,
    pairUsedPrevOperatingDay,
    cardActiveDays7d,
    cardActiveDays14d,
    pairActiveDays7d,
    pairActiveDays14d,
    cardActiveShare7d,
    cardActiveShare14d,
    pairActiveShare7d,
    pairActiveShare14d,
    cardVolumeShare7d: shareMap(w7.volumeByCard, w7.volume),
    cardVolumeShare14d: shareMap(w14.volumeByCard, w14.volume),
    pairVolumeShare7d: shareMap(w7.volumeByPair, w7.volume),
    pairVolumeShare14d: shareMap(w14.volumeByPair, w14.volume),
    operatingDaysPrior7d: opDays7,
    operatingDaysPrior14d: opDays14,
    cardsUsedPrevOperatingDay,
    pairsUsedPrevOperatingDay,
    cardRepeatExposure,
    pairRepeatExposure,
    cardRepeatExposureById,
    pairRepeatExposureById,
    // Provisional (illustrative / uncalibrated) factors. 1.0 while the coefficients are 0.
    highValueFactor: 1 + Math.max(0, scenario.highValueSensitivity) * highValueShare1d,
    repeatCardFactor: 1 + Math.max(0, scenario.repeatCardSensitivity) * cardRepeatExposure,
    repeatPairFactor: 1 + Math.max(0, scenario.repeatPairSensitivity) * pairRepeatExposure,
    localMixFactor: 1 + Math.max(0, scenario.localMixSensitivity) * (w14.count > 0 ? 1 - localVolumeShare14d : 0),
  };
}

/** Named hazard factors for the banker-identified features (provisional coefficients). Card and pair persistence are separate terms. */
export function bankFeatureFactors(features: BankRiskFeatures): NamedFactor[] {
  return [
    { id: "highValue", label: "High-value share (banker feature · provisional)", value: features.highValueFactor, kind: "state-derived" },
    { id: "repeatCard", label: "Card repeat / persistence (banker feature · provisional)", value: features.repeatCardFactor, kind: "state-derived" },
    { id: "repeatPair", label: "Pair repeat / persistence (banker feature · provisional)", value: features.repeatPairFactor, kind: "state-derived" },
    { id: "localMix", label: "Local/international mix (banker feature · provisional)", value: features.localMixFactor, kind: "state-derived" },
  ];
}

/* ------------------------------------------------------------------------------------------
 * Day summary, hazard contribution table, notes
 * ------------------------------------------------------------------------------------------ */

export function bankDaySummary(
  scenario: Scenario,
  offeredCoreDemand: number,
  feasibleCoreDemand: number,
  requestedCoreDemand: number,
  transactions: PlannedTransaction[],
  organicTransactions: PlannedTransaction[],
  blocked: BlockedObligation[],
): BankDaySummary {
  const all = [...transactions, ...organicTransactions];
  const byRule: Partial<Record<HardBankRuleId, number>> = {};
  for (const b of blocked) byRule[b.rule] = (byRule[b.rule] ?? 0) + 1;
  return {
    bankRulesEnabled: bankRulesOn(scenario),
    offeredCoreDemand: roundMoney(offeredCoreDemand),
    feasibleCoreDemand: roundMoney(feasibleCoreDemand),
    requestedCoreDemand: roundMoney(requestedCoreDemand),
    executedCoreDemand: roundMoney(sum(transactions.map((t) => t.amount))),
    executedOrganic: roundMoney(sum(organicTransactions.map((t) => t.amount))),
    blockedAmount: roundMoney(sum(blocked.map((b) => b.amount))),
    blockedCount: blocked.length,
    blockedByRule: byRule,
    reviewFlaggedCount: all.filter((t) => t.bankRuleReviewRequired).length,
    transactionCount: all.length,
    cardsUsed: new Set(all.map((t) => t.cardId)).size,
    posUsed: new Set(all.map((t) => t.posId)).size,
  };
}

const STRUCTURAL_ORDER: Array<{ id: string; label: string }> = [
  { id: "profile", label: "Merchant profile contribution" },
  { id: "merchantMaturity", label: "Merchant maturity contribution" },
  { id: "cardMaturity", label: "Card maturity contribution" },
  { id: "posMaturity", label: "POS maturity contribution" },
  { id: "concentration", label: "Concentration contribution" },
  { id: "persistence", label: "Persistence / use-frequency contribution" },
  { id: "ramp", label: "Ramp contribution" },
  { id: "highValue", label: "High-value contribution" },
  { id: "repeatCard", label: "Card repeat / persistence contribution" },
  { id: "repeatPair", label: "Pair repeat / persistence contribution" },
  { id: "localMix", label: "Local/international-mix contribution" },
  { id: "ticketFit", label: "Ticket-fit contribution" },
  { id: "crossBorder", label: "Cross-border profile contribution" },
  { id: "relatedParty", label: "Related-party context contribution" },
  { id: "priorReview", label: "Prior-review contribution" },
  { id: "cleanHistory", label: "Clean-history contribution" },
];

const BANK_FEATURE_IDS = new Set(["highValue", "repeatCard", "repeatPair", "localMix"]);

export function hazardContributionRows(
  pBase: number,
  factors: NamedFactor[],
  rawHazard: number,
  finalHazard: number,
  continuityMultiplier: number,
  features: BankRiskFeatures,
  scenario: Scenario,
): HazardContributionRow[] {
  const rows: HazardContributionRow[] = [
    {
      id: "base",
      label: "Base hazard p0·(V/Vref)^γ",
      category: "structural",
      value: pBase,
      provisional: false,
      note: "Existing structural power law; unchanged.",
    },
  ];
  const byId = new Map(factors.map((f) => [f.id, f]));
  for (const spec of STRUCTURAL_ORDER) {
    const f = byId.get(spec.id);
    if (!f) continue;
    const bank = BANK_FEATURE_IDS.has(spec.id);
    let note = "Existing structural factor; coefficient unchanged.";
    if (spec.id === "highValue") {
      note = `F = 1 + ${scenario.highValueSensitivity} × highValueShare1d (${(features.highValueShare1d * 100).toFixed(0)}%). Banker: > ${formatZar(scenario.highValueThresholdZar)} is high value. Coefficient illustrative / uncalibrated${scenario.highValueSensitivity === 0 ? "; 0 = diagnostic only" : ""}.`;
    } else if (spec.id === "repeatCard") {
      note = `F_card_repeat = 1 + ${scenario.repeatCardSensitivity} × cardRepeatExposure (${features.cardRepeatExposure.toFixed(3)}; per card e = (${scenario.repeatWeightSameDay}·usedPrevOpDay + ${scenario.repeatWeight7d}·activeShare7d + ${scenario.repeatWeight14d}·activeShare14d)/${(scenario.repeatWeightSameDay + scenario.repeatWeight7d + scenario.repeatWeight14d).toFixed(2)}, volume-weighted; ${features.cardsUsedPrevOperatingDay} of today's cards used on the previous operating day). Windows, weights and coefficient are model hypotheses (illustrative / uncalibrated)${scenario.repeatCardSensitivity === 0 ? "; 0 = diagnostic only" : ""}. Not merged into the concentration coefficient.`;
    } else if (spec.id === "repeatPair") {
      note = `F_pair_repeat = 1 + ${scenario.repeatPairSensitivity} × pairRepeatExposure (${features.pairRepeatExposure.toFixed(3)}; per pair e = (${scenario.pairRepeatWeightPrevDay}·pairUsedPrevOpDay + ${scenario.pairRepeatWeight7d}·pairActiveShare7d + ${scenario.pairRepeatWeight14d}·pairActiveShare14d)/${(scenario.pairRepeatWeightPrevDay + scenario.pairRepeatWeight7d + scenario.pairRepeatWeight14d).toFixed(2)}; ${features.pairsUsedPrevOperatingDay} of today's pairs used on the previous operating day). Same card × same POS = repeated use of the same relationship. Model hypothesis (illustrative / uncalibrated)${scenario.repeatPairSensitivity === 0 ? "; 0 = diagnostic only" : ""}.`;
    } else if (spec.id === "localMix") {
      note = `F = 1 + ${scenario.localMixSensitivity} × (1 − localVolumeShare14d) (local share ${(features.localVolumeShare14d * 100).toFixed(0)}%). Banker: no local cards can be a flag. Coefficient illustrative / uncalibrated${scenario.localMixSensitivity === 0 ? "; 0 = diagnostic only" : ""}.`;
    }
    rows.push({
      id: spec.id,
      label: spec.label,
      category: bank ? "banker-identified-feature" : "structural",
      value: f.value,
      provisional: bank,
      note,
    });
  }
  rows.push({
    id: "raw",
    label: "Raw hazard (base × all factors)",
    category: "structural",
    value: rawHazard,
    provisional: false,
    note: "Before saturation at hMax.",
  });
  if (Math.abs(continuityMultiplier - 1) > 1e-12) {
    rows.push({
      id: "continuityMultiplier",
      label: "Posterior continuity multiplier m̂",
      category: "structural",
      value: continuityMultiplier,
      provisional: false,
      note: "usePosteriorContinuityCalibration is on.",
    });
  }
  rows.push({
    id: "final",
    label: "Final structural hazard h",
    category: "structural",
    value: finalHazard,
    provisional: false,
    note: "Saturated at hMax. This is the production risk function.",
  });
  return rows;
}

export function bankNotes(features: BankRiskFeatures, summary: BankDaySummary, scenario: Scenario): string[] {
  const notes: string[] = [];
  if (!bankRulesOn(scenario)) {
    notes.push("Bank operating rules are OFF: the previous packer and organic water-fill are in force (comparison baseline). Features below are still reported.");
  }
  if (features.zeroLocalActivity14d) {
    notes.push(
      "Local-card share is currently 0% over the last 14 days. This matches a factor the banker explicitly identified as relevant. The model does not manufacture local transactions to change it.",
    );
  } else {
    notes.push(
      `Local-card share over 14 days: ${(features.localVolumeShare14d * 100).toFixed(0)}% of volume (${features.localTxCount14d} local / ${features.internationalTxCount14d} international transactions).`,
    );
  }
  if (features.highValueCount1d > 0) {
    notes.push(
      `${features.highValueCount1d} transaction${features.highValueCount1d === 1 ? "" : "s"} today above ${formatZar(scenario.highValueThresholdZar)} (banker-identified high value). Not blocked; tracked as a continuity feature.`,
    );
  }
  if (features.sameDayRepeat > 0) {
    notes.push(`${features.sameDayRepeat} card${features.sameDayRepeat === 1 ? "" : "s"} used more than once today — violates hard rule 5. This plan is not executable.`);
  }
  if (features.maxCardUses7d > 1) {
    notes.push(
      `Repeat-card state: max uses per card 7d = ${features.maxCardUses7d}, 14d = ${features.maxCardUses14d}. No hard cap is imposed on 7d/14d repetition.`,
    );
  }
  if (features.cardsUsedPrevOperatingDay > 0 || features.pairsUsedPrevOperatingDay > 0) {
    notes.push(
      `Nearby-day reuse (banker: repeat use of the same card is a flag): ${features.cardsUsedPrevOperatingDay} card(s) and ${features.pairsUsedPrevOperatingDay} card×POS pair(s) in today's plan were also used on the previous operating day. ` +
        `cardRepeatExposure ${features.cardRepeatExposure.toFixed(2)} → F_card_repeat ${features.repeatCardFactor.toFixed(3)}; pairRepeatExposure ${features.pairRepeatExposure.toFixed(2)} → F_pair_repeat ${features.repeatPairFactor.toFixed(3)}. ` +
        `Reuse is not prohibited; the optimizer paid this continuity cost and still chose it. Coefficients and windows are illustrative / uncalibrated.`,
    );
  }
  if (summary.blockedCount > 0) {
    const parts = Object.entries(summary.blockedByRule).map(([rule, n]) => `${HARD_RULE_META[rule as HardBankRuleId].label} ×${n}`);
    notes.push(`${summary.blockedCount} genuine obligation${summary.blockedCount === 1 ? "" : "s"} (${formatZar(summary.blockedAmount)}) blocked or deferred today by hard issuer constraints: ${parts.join("; ")}.`);
  }
  if (summary.reviewFlaggedCount > 0) {
    notes.push(`${summary.reviewFlaggedCount} executed transaction${summary.reviewFlaggedCount === 1 ? "" : "s"} carry bankRuleReviewRequired (repeated identical genuine amount with a supporting invoice on file). Amounts were not modified.`);
  }
  return notes;
}
