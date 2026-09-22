export type CapitalMode = "fixed" | "reinvest";
export type ResourceKind = "card" | "pos";
export type MaturityCategory = "Thin" | "Developing" | "Established";
export type PresetId = "conservative" | "balanced" | "aggressive" | "custom";
export type PolicyObjective = "myopic" | "lookahead";
/** Model A = today card/POS only. Model B = today+7d+14d card/POS. Model C = B + pair. */
export type ConcentrationModel = "today" | "rolling-card-pos" | "rolling-card-pos-pair";
export type ExpenseTimingPolicy = "threshold" | "distributed" | "mixed";
/** How economically equivalent pair covers are ranked. */
export type PairTieBreak = "history" | "neutral" | "low-dependency";

export interface ResourceVoiDiagnostic {
  id: string;
  name: string;
  kind: ResourceKind | "pair";
  inCover: boolean;
  economicQ: number;
  maturityScore: number;
  dependencyShare: number;
  observationCount: number;
  activeObservationDays: number;
  observedVolume: number;
  effectiveN: number;
  confidence: number;
  uncertainty: number;
  expectedUncertaintyReduction: number;
  informationValue: number;
  totalQ: number;
}

export interface CoverVoiDiagnosis {
  economicQ: number;
  resourceInformationValue: number;
  configurationInformationValue: number;
  informationValue: number;
  totalQ: number;
  remainingInformativeDays: number;
  configEffectiveN: number;
  configUncertainty: number;
  resources: ResourceVoiDiagnostic[];
}

export interface ConfigFeatures {
  logV: number;
  tx: number;
  cards: number;
  pos: number;
  pairs: number;
  maxCardShare: number;
  maxPosShare: number;
  pairHhi: number;
  active7: number;
  active14: number;
  idle: number;
  timeBucket: number;
}

export interface PackedDesign {
  throughputZar: number;
  transactionCount: number;
  cardIds: string[];
  posIds: string[];
  pairKeys: string[];
  volumesByResource: Record<string, number>;
  ticketsByResource: Record<string, number>;
  largestCardShare: number;
  largestPosShare: number;
  pairHhi: number;
  recentActiveDays7d: number;
  recentActiveDays14d: number;
  consecutiveIdleBusinessDays: number;
  businessTimeBucket: number;
  weekday: boolean;
}

export interface OutcomePayload {
  grossProfit: number;
  continuityCost: number;
  myopicEv: number;
  residual: number | null;
  /**
   * Gross-economic residual r = y_gross − G_structural (Rands). Learned by Δ_G.
   * Never includes interruption / review outcomes. null when not observed.
   */
  economicResidual?: number | null;
  /** Structural daily interruption hazard h_structural(s,a) at the time of the action. */
  structuralHazard?: number | null;
  /** Genuine observed interruption/review outcome for this operating day (continuity layer only). */
  interruptionObserved?: boolean | null;
  /** Offline testing only: hidden-world Δ*(s,a) that generated y (noise-free). */
  hiddenEconomicDelta?: number | null;
}

/** Gaussian posterior over residual coefficients θ (fractions of gross), by named column. */
export interface LearnerPosterior {
  columns: string[];
  mu: number[];
  cov: number[][];
  /** Realized operating days that updated this posterior. */
  updates: number;
}

/** Poisson–Gamma evidence for the continuity multiplier m: h_true = m · h_structural. */
export interface ContinuityEvidence {
  /** Σ h_structural over observed operating days (expected hits under the structural model). */
  exposure: number;
  /** Observed interruption / review events. */
  hits: number;
  /** Operating days with an observed continuity outcome. */
  days: number;
}

export type HiddenWorldClass = "matched" | "misspecified";

/** Thompson draw used to rank today's actions. "hidden-truth" is the offline oracle. */
export type LearnerSample = Record<string, number> | "hidden-truth" | null;

export interface OperatingObservation {
  id: string;
  source: "simulation" | "production";
  observedAt: { simDay: number; timestamp?: string };
  design: PackedDesign | null;
  outcome: OutcomePayload | null;
  outcomeStatus: "none" | "partial" | "complete";
  provenance: { runId?: string; importId?: string; replacesId?: string };
}

export interface RollingWindow {
  volumes: number[];
  counts: number[];
  consecutiveActiveDays: number;
  daysSinceLastUse: number;
}

export interface MaturityWeights {
  age: number;
  count: number;
  volume: number;
  activeDays: number;
  clean: number;
}

export interface ResourceHistorySeed {
  ageDays: number;
  historicalTxCount: number;
  historicalVolumeZar: number;
  activeDays: number;
  cleanHistoryDays: number;
  reviewCount: number;
}

export interface DayAction {
  coreThroughput: number;
  organicRevenue: number;
  organicExpense: number;
}

export interface OrganicLedger {
  monthIndex: number;
  weekIndex: number;
  lastAccrualDay: number;
  monthRevenueBudget: number;
  monthRevenueAllocated: number;
  monthRevenueRemaining: number;
  profitLinkedStock: number;
  weeklyMinimumStock: number;
  pendingProfitLinked: number;
  lifetimeProfitLinkedAccrued: number;
  lifetimeWeeklyMinimumAccrued: number;
  lifetimeExpenseEntitlement: number;
  lifetimeOrganicRevenue: number;
  lifetimeOrganicExpense: number;
  lastGrossProfit: number;
  lastProfitLinkedAccrual: number;
  lastWeeklyMinimumAccrual: number;
  lastExpenseEntitlementAdded: number;
}

export interface Resource {
  id: string;
  name: string;
  kind: ResourceKind;
  installedOnDay: number;
  daysActive: number;
  lifetimeCount: number;
  lifetimeVolume: number;
  activeTradingDays: number;
  cleanHistoryDays: number;
  interruptionCount: number;
  downUntilDay: number | null;
  frozenCapital: number;
  coreVolume: number;
  organicRevenueVolume: number;
  organicExpenseVolume: number;
  importedHistoryVolume: number;
  coreTransactionCount: number;
  organicTransactionCount: number;
  importedHistoryCount: number;
  rolling: RollingWindow;
  /** Consecutive operating weekdays with packed core volume. Weekends do not reset this. */
  consecutiveOperatingActiveDays: number;
  /**
   * Slice 0 two-operator ownership. Cards belong to the demand operator; POS belong to
   * the supply operator. Unset on the unwrapped calendar path.
   */
  ownerOperatorId?: string;
  /**
   * Slice 0 scenario-fixture institution identity. Configured simulation labels only —
   * not verified product mappings.
   */
  institutionId?: string;
  /** Cards only. Banker-identified feature input ("no local cards can be a flag"). */
  cardOrigin?: CardOrigin;
  /** POS only. Execution prerequisite for the PIN-present rule. Default true. */
  pinCapableFlow?: boolean;
  /** POS only. Physical card-present flow. Default true. */
  cardPresentFlow?: boolean;
}

export interface PairRecord {
  cardId: string;
  posId: string;
  firstActiveDay: number | null;
  lastUsedDay: number | null;
  lifetimeVolume: number;
  lifetimeCount: number;
  activeTradingDays: number;
  cleanHistoryDays: number;
  coreVolume: number;
  organicVolume: number;
  rolling: RollingWindow;
  /** Pair-scoped interruption (event-based loss model): the relationship is unusable until this day. */
  downUntilDay?: number | null;
  frozenCapital?: number;
}

/* ------------------------------------------------------------------------------------------
 * Interruption-loss model (severity side). Probability side (hazard) is unchanged.
 * ------------------------------------------------------------------------------------------ */

export type LossModel = "legacy" | "eventBased";
export type ContinuityRegime = "normal" | "critical" | "collapsed";

/**
 * Failure domains. Probabilities are conditional on an interruption having occurred and are
 * MODEL HYPOTHESES until issuer / banker evidence supports them.
 *   pair        one card×POS relationship is unusable
 *   card        one card is unusable (target drawn ∝ its share of today's activity)
 *   pos         one terminal is unusable (target drawn ∝ its share of today's activity)
 *   merchant    the acquiring account: every POS is unusable
 *   institution issuer side: every card is unusable
 *   system      everything is unusable and the account balance is frozen
 */
export type LossDomain = "pair" | "card" | "pos" | "merchant" | "institution" | "system";

export type LossDomainProbabilities = Record<LossDomain, number>;

export interface EventLossAblation {
  /** Unexecuted genuine tickets carry into a backlog (δ per operating day, expiry after m days). */
  backlog: boolean;
  /** Executable capacity uses eligible unused cards / POS / pairs; false = capital-only (legacy assumption). */
  resourceAwareCapacity: boolean;
  /** pair + pos domains active; false = their probability mass is moved to the card domain. */
  posFailureDomain: boolean;
  /** merchant + institution + system domains active; false = their mass is moved to the card domain. */
  accountContagion: boolean;
  /** Trading losses (deferral, expiry) only on operating days; carry on calendar days. false = every calendar day trades. */
  operatingDayDistinction: boolean;
  /** Rollout carries no separate hit branch (interruption valued once). false = legacy hit branch kept as well. */
  removeSeverityDoubleCount: boolean;
}

/** Genuine ticket carried over because it was not executed on the day it arrived. */
export interface BacklogTicket extends CoreTicket {
  economicPaymentId: string;
  arrivalDay: number;
  /** Operating days on which this ticket was offered and not executed. Expires when ≥ ticketMaxDeferralOperatingDays. */
  deferrals: number;
}

/** Fates of today's genuine core demand (arrivals + prior backlog). Mutually exclusive, in Rands. */
export interface DemandFates {
  arrivalsZar: number;
  arrivalsCount: number;
  backlogInZar: number;
  backlogInCount: number;
  executedZar: number;
  executedCount: number;
  /** Executed today on a resource other than the one originally planned (realized hits only). */
  reroutedZar: number;
  reroutedCount: number;
  deferredZar: number;
  deferredCount: number;
  expiredZar: number;
  expiredCount: number;
  backlogEndZar: number;
  backlogEndCount: number;
  /** δ × backlogEnd (operating day) — charged today. */
  deferralCostZar: number;
  /** margin × expired — charged today, once. */
  expiryCostZar: number;
  rerouteCostZar: number;
}

export interface EventLossComponents {
  lostMargin: number;
  deferral: number;
  rerouting: number;
  carry: number;
  total: number;
}

export interface EventLossDomainRow {
  domain: LossDomain;
  probability: number;
  /** Loss given this domain (weighted over dependence-drawn targets and short/long durations). */
  loss: EventLossComponents;
  /** Dependence-weighted expected in-flight capital locked (Rands). */
  lockedCapital: number;
  /** Operating days on which the hit path executed less than the clean path. */
  operatingDaysImpaired: number;
  /** Extra volume that expired on the hit path relative to the clean path. */
  expiredZar: number;
  /** Extra Rand-days held in backlog on the hit path relative to the clean path. */
  deferredZarDays: number;
  reroutedTickets: number;
  /** Executed volume shortfall of the hit path over the projection (before deferred volume catches up). */
  executionShortfallZar: number;
  /** Candidate targets and their dependence weights (share of today's activity). */
  targets: Array<{ id: string; weight: number }>;
}

export interface EventLossSummary {
  /** Σ_k π_k · Loss_k : loss conditional on an interruption at T2 (after today's execution). */
  lossGivenInterruption: EventLossComponents;
  /** h × lossGivenInterruption — the expected continuity cost carried in myopicEv. */
  expected: EventLossComponents;
  byDomain: EventLossDomainRow[];
  /** Expected (h-weighted) diagnostics. */
  expectedLockedCapital: number;
  expectedOperatingDaysImpaired: number;
  expectedReroutedTickets: number;
  expectedExpiredZar: number;
  expectedDeferredZarDays: number;
  /** Numeric identity check: |Σ components − total| over all domains. */
  reconciliationError: number;
}

/** A realized interruption applied to the state (event-based loss model, hidden world on). */
export interface InterruptionEvent {
  day: number;
  domain: LossDomain;
  targetIds: string[];
  durationDays: number;
  downUntilDay: number;
  lockedCapital: number;
}

/* ------------------------------------------------------------------------------------------
 * Bank Operating Rules / Feasibility Layer
 *
 * Three categories are kept separate everywhere (state, diagnostics, UI):
 *   hard-issuer-constraint      – bank guidance that makes an action infeasible
 *   banker-identified-feature   – observable continuity features the banker named (not bans)
 *   model-hypothesis            – our temporal windows / weights / provisional coefficients
 * ------------------------------------------------------------------------------------------ */

export type CardOrigin = "local" | "international";

export type BankRuleCategory = "hard-issuer-constraint" | "banker-identified-feature" | "model-hypothesis";

/** Hard issuer operating constraints. A candidate that violates one is infeasible, never scored. */
export type HardBankRuleId =
  | "no-split-payment"
  | "one-purchase-per-card-per-day"
  | "no-retry-after-decline"
  | "supporting-invoice-required"
  | "pin-present-required"
  | "repeated-amount-review";

export type RepeatedAmountPolicy = "allow-with-invoice" | "defer";

/** Genuine economic obligation offered on a day. Ids are assigned by demand (or by a production ledger). */
export interface CoreTicket {
  amount: number;
  timeMinutes: number;
  /** Atomic genuine payment. One id ⇒ at most one card transaction. */
  economicPaymentId?: string;
  invoiceId?: string;
  /** Supplier invoice / commercial document on file for this payment. Default true in simulation. */
  supportingInvoicePresent?: boolean;
  /** Demand-side beneficiary the ticket is payable to. Unset tickets are unrestricted. */
  beneficiaryId?: string | null;
}

export type TransactionSource = "core" | "organic-revenue" | "organic-expense";

export type BankEligibility = "eligible" | "eligible-review-flagged";

/** One executed card transaction kept on the state ledger (realized and projected days). */
export interface LedgerTransaction {
  day: number;
  economicPaymentId: string;
  cardId: string;
  posId: string;
  amount: number;
  source: TransactionSource;
  cardOrigin: CardOrigin;
  highValue: boolean;
}

/** Persisted decline: that card must not retry that economic payment. */
export interface DeclineRecord {
  day: number;
  cardId: string;
  economicPaymentId: string;
}

export interface BlockedObligation {
  economicPaymentId: string;
  invoiceId: string | null;
  amount: number;
  source: TransactionSource;
  /** Card it would have used, or the cover cards that were tried. */
  candidateCardIds: string[];
  candidatePosIds: string[];
  rule: HardBankRuleId;
  category: BankRuleCategory;
  reason: string;
  /** True when the obligation can be reconsidered on a later day (e.g. card budget); false when the document is missing. */
  reconsiderLater: boolean;
}

/** Banker-identified continuity features computed on the realized packed plan plus ledger history. */
export interface BankRiskFeatures {
  highValueThresholdZar: number;
  highValueCount1d: number;
  highValueCount7d: number;
  highValueCount14d: number;
  highValueVolume1d: number;
  highValueVolume7d: number;
  highValueVolume14d: number;
  highValueShare1d: number;
  highValueShare7d: number;
  highValueShare14d: number;
  localTxCount1d: number;
  localTxCount7d: number;
  localTxCount14d: number;
  internationalTxCount1d: number;
  internationalTxCount7d: number;
  internationalTxCount14d: number;
  localVolumeShare1d: number;
  localVolumeShare7d: number;
  localVolumeShare14d: number;
  internationalVolumeShare1d: number;
  internationalVolumeShare7d: number;
  internationalVolumeShare14d: number;
  /** True when the 14-day window (including today) has no local-card transaction. */
  zeroLocalActivity14d: boolean;
  /** Per-card uses, today included. */
  cardUses1d: Record<string, number>;
  cardUses7d: Record<string, number>;
  cardUses14d: Record<string, number>;
  activeCardDays7d: Record<string, number>;
  activeCardDays14d: Record<string, number>;
  /** Volume on cards that were already used earlier in the window (repeat use). */
  repeatCardVolume7d: number;
  repeatCardVolume14d: number;
  maxCardUses1d: number;
  maxCardUses7d: number;
  maxCardUses14d: number;
  /** Cards with more than one transaction today. Always 0 for a feasible plan. */
  sameDayRepeat: number;
  /** Mean prior uses (last 6 / 13 days) per card used today. Model hypothesis inputs. */
  repeat7d: number;
  repeat14d: number;
  /** Diagnostic: w1·sameDayRepeat + w7·repeat7d + w14·repeat14d (uses-based; not the hazard input). */
  repeatExposure: number;

  /* ---- Rolling persistence / repeat features (card level and pair level, kept separate) ----
   * Windows are calendar days [t−6, t−1] / [t−13, t−1]; "active share" divides by the number of
   * operating weekdays in that window, so weekends do not dilute. All keyed by card id or pair key. */
  /** Card / pair was used on the previous operating weekday. */
  cardUsedPrevOperatingDay: Record<string, boolean>;
  pairUsedPrevOperatingDay: Record<string, boolean>;
  cardActiveDays7d: Record<string, number>;
  cardActiveDays14d: Record<string, number>;
  pairActiveDays7d: Record<string, number>;
  pairActiveDays14d: Record<string, number>;
  cardActiveShare7d: Record<string, number>;
  cardActiveShare14d: Record<string, number>;
  pairActiveShare7d: Record<string, number>;
  pairActiveShare14d: Record<string, number>;
  cardVolumeShare7d: Record<string, number>;
  cardVolumeShare14d: Record<string, number>;
  pairVolumeShare7d: Record<string, number>;
  pairVolumeShare14d: Record<string, number>;
  /** Operating weekdays inside the prior 7d / 14d windows (denominators of the active shares). */
  operatingDaysPrior7d: number;
  operatingDaysPrior14d: number;
  /** Of today's cards / pairs, how many were used on the previous operating day. */
  cardsUsedPrevOperatingDay: number;
  pairsUsedPrevOperatingDay: number;
  /**
   * Model hypothesis (illustrative / uncalibrated). Per card:
   *   e_c = (w1·usedPrevOpDay + w7·activeShare7d + w14·activeShare14d) / (w1 + w7 + w14) ∈ [0, 1]
   * Plan-level exposure = volume-weighted mean of e_c over today's cards. Same for pairs with p1/p7/p14.
   */
  cardRepeatExposure: number;
  pairRepeatExposure: number;
  /** Per-card / per-pair exposures behind the plan-level numbers (today's cards / pairs only). */
  cardRepeatExposureById: Record<string, number>;
  pairRepeatExposureById: Record<string, number>;
  /** Provisional factors (1.0 while the coefficients are 0). */
  highValueFactor: number;
  /** F_card_repeat = 1 + c_card × cardRepeatExposure. */
  repeatCardFactor: number;
  /** F_pair_repeat = 1 + c_pair × pairRepeatExposure. */
  repeatPairFactor: number;
  localMixFactor: number;
}

export interface BankDaySummary {
  bankRulesEnabled: boolean;
  /** Genuine core demand on offer today (all tickets). */
  offeredCoreDemand: number;
  /** Largest part of the offer that can pass every hard rule today (packing the whole offer). */
  feasibleCoreDemand: number;
  /** Core demand requested by the chosen action before feasibility. */
  requestedCoreDemand: number;
  /** Core amount that passed every hard rule and was executed. */
  executedCoreDemand: number;
  executedOrganic: number;
  blockedAmount: number;
  blockedCount: number;
  blockedByRule: Partial<Record<HardBankRuleId, number>>;
  reviewFlaggedCount: number;
  transactionCount: number;
  cardsUsed: number;
  posUsed: number;
}

export interface PlannedTransaction {
  time: string;
  amount: number;
  cardId: string;
  posId: string;
  economicPaymentId: string;
  invoiceId: string | null;
  source: TransactionSource;
  cardOrigin: CardOrigin;
  cardPresent: boolean;
  pinCapableFlow: boolean;
  documentationRequired: boolean;
  supportingInvoicePresent: boolean;
  /** Banker-identified feature: amount > highValueThresholdZar. Not a ban. */
  highValue: boolean;
  /** Hard rule 5 diagnostic. Always false on an executable plan. */
  sameCardUsedEarlierToday: boolean;
  /** Prior uses of this card in the last 6 / 13 days (model-hypothesis windows). */
  cardUsesPrior7d: number;
  cardUsesPrior14d: number;
  /** Prior identical amounts in the window on the same card / POS / pair / merchant. */
  sameAmountHistory: { card: number; pos: number; pair: number; merchant: number };
  bankRuleReviewRequired: boolean;
  eligibility: BankEligibility;
}

export interface ExogenousOffer {
  mode: "expected" | "realized";
  coreTickets: CoreTicket[];
  coreDemandZar: number;
  organicRevenueArrivalZar: number;
  organicExpenseArrivalZar: number;
}

export interface DailyActionPlan {
  date: string;
  transact: boolean;
  totalCoreAmount: number;
  organicAmount: number;
  /** Core transactions (whole genuine tickets). */
  transactions: PlannedTransaction[];
  /** Organic revenue / expense transactions placed on cards not used for core today. */
  organicTransactions: PlannedTransaction[];
  /** Genuine obligations that could not be executed today, with the hard rule that blocked them. */
  blocked: BlockedObligation[];
  bankSummary: BankDaySummary;
}

export interface SimState {
  day: number;
  deployableCapital: number;
  extractedProfit: number;
  trappedCapital: number;
  cards: Resource[];
  pos: Resource[];
  pairs: PairRecord[];
  throughputHistory: number[];
  merchantDaysActive: number;
  merchantLifetimeCount: number;
  merchantLifetimeVolume: number;
  merchantActiveTradingDays: number;
  merchantCleanHistoryDays: number;
  merchantInterruptionCount: number;
  organic: OrganicLedger;
  /** Kernel-Bayes evidence log. Simulation and production adapters both write this. */
  observations: OperatingObservation[];
  /** Consecutive weekday days with no core volume. Not an experiment. */
  consecutiveIdleBusinessDays: number;
  /** Core pairs used on the most recent operating day with volume. */
  lastOperatingPairKeys: string[];
  /** Signature of lastOperatingPairKeys. */
  lastOperatingCoverSig: string;
  /** Economic residual posterior Δ_G. Updated only from realized gross-economic residuals. */
  learner: LearnerPosterior;
  /** Today's Thompson draw (realized days only). null in projections → Δ = 0. */
  learnerSample: LearnerSample;
  /** Continuity-layer evidence. Diagnostic unless usePosteriorContinuityCalibration. */
  continuity: ContinuityEvidence;
  /**
   * Executed card transactions (core and organic) for the trailing window. Feeds the
   * one-purchase-per-card rule, repeated-amount history and banker-identified features.
   */
  bankLedger: LedgerTransaction[];
  /** Persisted declines. Hard rule: no same-card retry of that economic payment. */
  declines: DeclineRecord[];
  /** Event-based loss model: genuine tickets deferred from earlier operating days (explicit stock). */
  backlog?: BacklogTicket[];
  /** Event-based loss model: realized interruptions applied to this state (T2 events). */
  interruptionEvents?: InterruptionEvent[];
  /** Cumulative demand permanently lost (expired) in Rands. */
  expiredDemandZar?: number;
  /**
   * Realized exogenous offer for this calendar day. Absent means the
   * expected (lookahead) offer. Cleared on state transition so future
   * days are not omniscient about later realized tickets.
   */
  exogenousOffer?: ExogenousOffer;
}

/**
 * Scenario inputs. Risk numbers marked `illustrative` in defaults are not
 * empirical estimates of bank behaviour.
 */
export interface Scenario {
  name: string;
  preset: PresetId;

  startingCapitalZar: number;
  startingCapitalMzn: number;
  margin: number;
  capitalMode: CapitalMode;

  initialCards: number;
  initialCardNames: string[];
  initialPos: number;
  posEveryDays: number;
  cardEveryDays: number;
  maximumPosDevices: number;
  perCardCapacityZar: number;
  perPosCapacityZar: number;

  horizonDays: number;
  throughputStepZar: number;
  avgTicketZar: number;
  expectedTicketMinZar: number;
  expectedTicketMaxZar: number;
  /** Poisson mean of genuine core tickets on a weekday. Weekends have none. */
  meanDailyCoreTickets: number;
  /** Seeded weekly operating-policy ensemble size (myopic inner policy). */
  weeklyEnsemblePaths: number;

  /** Illustrative daily interruption hazard at V = vRef when all factors = 1. */
  p0: number;
  /** Reference daily throughput for the hazard power law. */
  vRefZar: number;
  /** Illustrative exponent on V / Vref. */
  gamma: number;
  hMax: number;
  /** If set, hazard is treated as infinite for V > this value. */
  infiniteHazardAboveZar: number | null;

  shortReviewMinDays: number;
  shortReviewMaxDays: number;
  longReviewMinDays: number;
  longReviewMaxDays: number;
  probabilityReviewIsLong: number;
  interruptionIsCardScope: number;
  interruptionIsPosScope: number;
  interruptionIsSystemScope: number;
  /**
   * Share of a card-scoped interruption that hits all cards together.
   * 0 = independent card failures; 1 = any card event takes every card.
   * Five cards do not imply five independent failure domains.
   */
  cardFailureCorrelation: number;
  /**
   * Share of a POS-scoped interruption that hits all POS devices together.
   */
  posFailureCorrelation: number;

  /* ---- Interruption-loss model (severity). Hazard coefficients are shared by both models. ----
   * legacy     : closed-form h · E[duration] · (lost turnover + locked-capital carry) in myopicEv,
   *              PLUS the rollout's hit branch (largest-share resource down, f × capital locked).
   * eventBased : one event state machine (failure domain → dependence-weighted target → in-flight
   *              capital locked → resource-aware executable capacity → ticket fates) used both for
   *              realized hits and for the expected-loss projection inside the optimizer. The rollout
   *              then carries no separate hit branch, so the interruption is valued exactly once. */
  lossModel: LossModel;
  /** Conditional probabilities of each failure domain given an interruption. MODEL HYPOTHESES (uncalibrated). */
  lossDomainProbabilities: LossDomainProbabilities;
  /** Deferral / time / liquidity cost per Rand of backlog per OPERATING day held. Hypothesis. */
  deferralCostDailyRate: number;
  /** Genuine operational cost of executing a ticket on a resource other than its planned one. Hypothesis. */
  rerouteCostPerTicketZar: number;
  /** A deferred ticket expires (margin lost once) after this many operating days in the backlog. Hypothesis. */
  ticketMaxDeferralOperatingDays: number;
  /** Executed volume is in flight (unsettled, lockable) for this many calendar days incl. the execution day. Hypothesis. */
  settlementLagDays: number;
  /** Event-based ablation switches (default all on). Used only to attribute policy changes. */
  eventLossAblation: EventLossAblation;
  /**
   * When true, no new ordinary core or organic demand arrives. Existing backlog may still be
   * offered. Used only for the evaluation tail after the optimization horizon; the 14-day
   * optimizer does not see this flag.
   */
  suppressNewDemand?: boolean;
  /**
   * When true, the realized path draws Bernoulli interruptions from today's structural hazard
   * even if the economic hidden world is off. A second draw can fire while a review is still
   * open (state-dependent cascade). Experiment flag; production default is false.
   */
  realizedCascadeEnabled?: boolean;
  /**
   * Extra fraction of current deployable (working) capital locked by a POS-scoped interruption,
   * on top of that terminal's in-flight exposure, capped at deployable. 0 = in-flight only
   * (production). Hypothesis for the cascade experiment; central test value 0.50.
   */
  posCapitalLockFraction?: number;
  /**
   * Exposure-weighted POS severity (experiment). When set, a POS-j review traps the capital
   * economically exposed to that terminal instead of a flat fraction of the book:
   *   lock_j = min(working, max(inFlight_j, scale × share_j × working)),
   * where share_j is POS j's share of ledger volume over the last posExposureWindowDays and
   * inFlight_j is its unsettled volume (a subset of the same exposure, so not added on top).
   * Calibration anchor from operations: a 50/50 book across 2 POS traps ≈ 50% on one review,
   * which is scale = 1. null = legacy flat posCapitalLockFraction.
   */
  posExposureLockScale?: number | null;
  /** Rolling window (calendar days) for the POS exposure share. Default 7. */
  posExposureWindowDays?: number;
  /**
   * Experiment only. When the book is in one-POS CRITICAL (exactly one POS up and at least
   * one POS down), multiply hazard by 1 + κ × min(1, survivingPOS consecutive days / 5).
   * 0 = off (production). Does not turn global persistence into hazard.
   */
  criticalPersistenceSensitivity?: number;
  /**
   * Experiment only (β-aware degraded-state packer). While a POS review is active and at
   * least two POS survive, the packer re-routes the day's whole genuine tickets over the
   * surviving terminals (cards fixed, every hard bank rule re-checked) and picks the routing
   * with the best structural Q among those with maxPosShare ≤ β. If none exists the day is
   * CRITICAL_β and the routing with the minimum achievable maxPosShare is used. null = off
   * (production). Never splits, creates or modifies tickets.
   */
  degradedMaxPosShare?: number | null;
  /**
   * Experiment only. Planner N−1 constraint: require
   *   min_j(executableThroughputAfterLoss(j) / targetThroughput) >= nMinusOneRetentionMin
   * among positive-throughput candidates. null = off (production). Does not equalise ordinary-day shares.
   */
  nMinusOneRetentionMin?: number | null;
  /**
   * Experiment only. Planner N−1 constraint: require
   *   max_j(minimumAchievableMaxPosShareAfterLoss(j)) <= nMinusOneMaxPosShareLimit
   * among positive-throughput candidates. null = off (production).
   */
  nMinusOneMaxPosShareLimit?: number | null;

  merchantProfileFit: number;
  crossBorderProfile: number;
  relatedPartyContext: number;

  merchantMaturitySensitivity: number;
  cardMaturitySensitivity: number;
  posMaturitySensitivity: number;
  concentrationSensitivity: number;
  rampSensitivity: number;
  ticketFitSensitivity: number;
  priorReviewSensitivity: number;
  cleanHistorySensitivity: number;

  merchantMaturityWeights: MaturityWeights;
  cardMaturityWeights: MaturityWeights;
  posMaturityWeights: MaturityWeights;

  merchantAgeDaysToMature: number;
  merchantCountToMature: number;
  merchantVolumeToMature: number;
  merchantActiveDaysToMature: number;
  merchantCleanDaysToMature: number;

  cardAgeDaysToMature: number;
  cardCountToMature: number;
  cardVolumeToMature: number;
  cardActiveDaysToMature: number;
  cardCleanDaysToMature: number;

  posAgeDaysToMature: number;
  posCountToMature: number;
  posVolumeToMature: number;
  posActiveDaysToMature: number;
  posCleanDaysToMature: number;

  thinMax: number;
  developingMax: number;

  rampWeightPrevDay: number;
  rampWeight7d: number;
  rampWeight30d: number;
  /** Bounded acceleration used when there is no baseline history. */
  coldStartJump: number;

  useLookahead: boolean;
  lookaheadDays: number;
  capitalFrozenDuringReview: boolean;
  /**
   * Illustrative extra daily cost per locked Rand (beyond lost turnover).
   * Only applied when capitalFrozenDuringReview is on.
   */
  frozenCapitalDailyRate: number;
  showOperatingBand: boolean;
  bandEvTolerance: number;
  showBreakEvenHazard: boolean;

  riskConstraintEnabled: boolean;
  maxExpectedDowntimeShare: number;
  maxProbLongReview30d: number;

  conservativeThroughputZar: number;
  monteCarloPaths: number;
  rngSeed: number;

  /** When set, replace computed merchant maturity score (sensitivity / experiments). */
  merchantMaturityStateOverride: number | null;
  /** When set, replace computed card maturity score. */
  cardMaturityStateOverride: number | null;

  startingCardHistory: ResourceHistorySeed;
  startingPosHistory: ResourceHistorySeed;
  /** Per-card overrides; index-aligned with initial cards. Null entries fall back to startingCardHistory. */
  startingCardHistories: Array<ResourceHistorySeed | null>;
  startingPosHistories: Array<ResourceHistorySeed | null>;
  /** If set, merchant imported history is this seed; otherwise it is pooled from initial cards. */
  startingMerchantHistory: ResourceHistorySeed | null;

  /** Genuine external revenue the businesses already earn, outside core throughput. Monthly envelope. */
  externalOrganicRevenueMonthlyZar: number;
  weeklyExpenseFloorZar: number;
  monthlyProfitLinkedExpenseRate: number;
  organicMonthLengthDays: number;
  organicWeekLengthDays: number;
  /**
   * How card/POS/pair rolling windows enter F_concentration.
   * Coefficients are unchanged; the state fed into them is the experiment.
   */
  concentrationModel: ConcentrationModel;
  /** When genuine expense entitlement is converted into observed spend. Total entitlement is unchanged. */
  expenseTimingPolicy: ExpenseTimingPolicy;
  /**
   * Tie-break among covers that are within the concentration/persistence band.
   * history = prefer high lifetime-volume pairs; neutral = id order;
   * low-dependency = prefer lower recent use-frequency, still penalising new pairs.
   */
  pairTieBreak: PairTieBreak;
  /**
   * When true, use-frequency persistence enters the hazard as its own factor.
   * Diagnostic by default (false): volume concentration does not see 30/30 vs 12/30 at equal volume.
   */
  includePersistenceInHazard: boolean;
  /** Coefficient on the persistence/dependency input. Unused while includePersistenceInHazard is off. */
  persistenceSensitivity: number;
  /**
   * Rands cost per pair used above the number of cards in the cover.
   * Keeps cartesian covers expensive without a lexicographic veto.
   */
  pairOperatingCostZar: number;
  /** Rands cost of opening a card×POS pair that has no lifetime volume yet. Charged on the first day only. */
  newPairCostZar: number;
  /** Rands cost of using a POS that has no lifetime volume yet. Charged on the first day only. */
  newPosCostZar: number;
  /**
   * Rands per (consecutive + 7d active days) charged on each held-cover day
   * if the cover still uses the current hottest POS. Allocation-only; not a hazard factor.
   */
  hotPosUseCostZar: number;
  /**
   * When true, covers must obey the mix: card count from today's V, no pair from the last
   * operating day, no 3rd consecutive operating day on a card, and lookahead re-chooses a
   * legal cover instead of holding the same keys. Allocation-only; not in h(V) or CA.
   */
  coverMixEnabled: boolean;
  /** Below this core V, target 2 cards. */
  coverThinThroughputZar: number;
  /** At/above this core V, target 4 cards. Between thin and fat, target 3. */
  coverFatThroughputZar: number;
  /** Rest a card on the next operating day once it has this many consecutive operating days. */
  coverMaxConsecutiveOperatingDays: number;
  /**
   * When true, cover ranking uses Q_total = Q_economic + VOI_resource (+ VOI_config if enabled).
   * IV does not enter h(V) or the 180-day continuity-adjusted identity.
   */
  valueOfInformationEnabled: boolean;
  /** When true with valueOfInformationEnabled, add configuration-level VOI. */
  voiConfigurationEnabled: boolean;
  /** Provisional RBF length scale on log10 throughput. Illustrative, not calibrated. */
  voiKernelLogV: number;
  /** Provisional length scale on ticket count. */
  voiKernelTx: number;
  voiKernelCards: number;
  voiKernelPos: number;
  voiKernelPairs: number;
  voiKernelHhi: number;
  voiKernelMaxShare: number;
  voiKernelActive7: number;
  voiKernelActive14: number;
  voiKernelIdle: number;
  voiKernelTime: number;
  /** Provisional evidence scale for resource κ = N/(N+N*). */
  voiNStarResource: number;
  /** Provisional evidence scale for configuration κ. */
  voiNStarConfig: number;
  /** Provisional prior σ (Rands/day) of resource-channel stakes. */
  voiPriorSigmaResZar: number;
  /** Provisional prior σ (Rands/day) of configuration outcome residual. */
  voiPriorSigmaCfgZar: number;
  /**
   * Economic residual learner Δ_G(s,a) with Thompson sampling. Today's packed action is
   * ranked by Q_base + Δ_G(θ̃), θ̃ ~ posterior. Δ_G is gross-economic only; it never
   * enters h(V), the continuity cost, or the recorded continuity-adjusted EV.
   */
  economicLearnerEnabled: boolean;
  /** Prior σ (fraction of gross) on each configuration coefficient β. */
  learnerPriorSigmaConfig: number;
  /** Prior σ (fraction of gross) on each card effect u_card. */
  learnerPriorSigmaCard: number;
  /** Prior σ (fraction of gross) on each POS effect u_pos. */
  learnerPriorSigmaPos: number;
  /** Observation noise σ_ε = c_ε · G (fraction of gross). */
  learnerNoiseFraction: number;
  /**
   * Offline test world. When on, realized outcomes are y = Q_base + Δ*(θ*_econ) + ε and
   * genuine interruption draws use h_true = m*(θ*_cont) · h_structural. Off in production.
   */
  hiddenWorldEnabled: boolean;
  /** Seed for θ*_econ, θ*_cont and outcome noise. Independent of rngSeed (demand). */
  hiddenWorldSeed: number;
  /** matched: θ*_econ ~ agent prior. misspecified: adds terms the agent cannot express. */
  hiddenWorldClass: HiddenWorldClass;
  /** Scale on the prior σ used to draw θ*_econ (1 = matched). */
  hiddenEconomicSigmaScale: number;
  /** σ of the hidden log-multiplier intercept c0 on hazard (θ*_cont). 0 = structural hazard is true. */
  hiddenContinuityLogSigma: number;
  /** σ of the hidden log-multiplier slope c1 on log(V/Vref) (θ*_cont). */
  hiddenContinuitySlopeSigma: number;
  /** Gamma(α0, α0) prior strength on the continuity multiplier m (prior mean 1). */
  continuityPriorStrength: number;
  /**
   * When true, production hazard is h_post = m̂ · h_structural with m̂ the posterior mean of
   * the continuity multiplier. Off in v1: h_structural is the production risk function and
   * the continuity posterior is diagnostic only.
   */
  usePosteriorContinuityCalibration: boolean;

  /* ---------------- Bank Operating Rules / Feasibility Layer ---------------- */

  /**
   * Master switch. When false the previous packer / organic water-fill is used unchanged
   * (comparison baseline). When true, hard issuer rules run on the realized packed plan
   * before Q_base, Thompson ranking, rolling-Q or MPC see the action.
   */
  bankRulesEnabled: boolean;

  /* Hard issuer constraints (bank guidance) */
  /** Rule 5: same card not used twice a day, across core + organic. Bank guidance ⇒ 1. */
  maxEligiblePurchasesPerCardPerDay: number;
  /** Rule 4: PIN must show — a candidate needs cardPresent && pinCapableFlow on its POS. */
  requiresPinPresent: boolean;
  /** Rule 3: supplier invoice required for automatic execution. */
  documentationRequired: boolean;
  /**
   * Rule 2 scope. Bank wording covers the same purchase only (0). A positive value blocks the
   * declined card for any purchase for that many days — a model extension, not bank wording.
   */
  declineBlocksCardForDays: number;
  /** Rule 6: what to do with a genuine payment whose identical amount repeats in the window. */
  repeatedAmountPolicy: RepeatedAmountPolicy;

  /* Banker-identified continuity features */
  /** "Payments above R10,000 are considered high value." */
  highValueThresholdZar: number;
  /** Origin per Day-1 card (index-aligned). Missing entries default to international. */
  initialCardOrigins: CardOrigin[];

  /* Model hypotheses (illustrative / uncalibrated) */
  /** Repeated-amount look-back window in days. The banker gave no window. */
  repeatedAmountWindowDays: number;
  /**
   * Card-level repeat weights: cardRepeatExposure ∝ w1·usedPrevOperatingDay + w7·activeShare7d + w14·activeShare14d,
   * w1 > w7 > w14. w1 also weights the same-day-repeat diagnostic on attempted infeasible plans.
   */
  repeatWeightSameDay: number;
  repeatWeight7d: number;
  repeatWeight14d: number;
  /** Pair-level repeat weights: pairRepeatExposure ∝ p1·pairUsedPrevOperatingDay + p7·pairActiveShare7d + p14·pairActiveShare14d, p1 > p7 > p14. */
  pairRepeatWeightPrevDay: number;
  pairRepeatWeight7d: number;
  pairRepeatWeight14d: number;
  /** Provisional hazard coefficient on highValueShare1d. 0 = diagnostic only. */
  highValueSensitivity: number;
  /** Provisional hazard coefficient on cardRepeatExposure (F_card_repeat). 0 = diagnostic only. */
  repeatCardSensitivity: number;
  /** Provisional hazard coefficient on pairRepeatExposure (F_pair_repeat). Same card × same POS: stronger signal. 0 = diagnostic only. */
  repeatPairSensitivity: number;
  /** Provisional hazard coefficient on (1 − localVolumeShare14d). 0 = diagnostic only. */
  localMixSensitivity: number;

  /**
   * Slice 0 two-operator fixtures. Absent on the unwrapped seed-21 calendar path.
   * Institution maps and the MZN/ZAR quote are scenario configuration, not product facts.
   */
  slice0Fixtures?: Slice0ScenarioFixtures;
}

/** Configured simulation identities for Slice 0. Not verified live institution or FX data. */
export interface Slice0ScenarioFixtures {
  quotedMznPerZar: number;
  quoteKind: "scenario_constant_operator_quote";
  demandOperatorId: string;
  supplyOperatorId: string;
  /** Resource id (card-1) and/or card name → configured simulation institution. */
  cardInstitutionByResourceId: Record<string, string>;
  /** Resource id (pos-1) → configured simulation institution. */
  posInstitutionByResourceId: Record<string, string>;
}

export interface HazardDecomposition {
  model: ConcentrationModel;
  todayConcentration: number;
  concentration7d: number;
  concentration14d: number;
  concentration30d: number;
  todayRamp: number;
  resourceRamp7d: number;
  resourceRamp30d: number;
  pairConcentrationToday: number;
  pairConcentration7d: number;
  pairConcentration14d: number;
  pairConcentration30d: number;
  combinedCardPosConcentration: number;
  combinedPairConcentration: number;
  combinedConcentrationInput: number;
  combinedRampInput: number;
  concentrationFactor: number;
  rampFactor: number;
  largestPosShare7d: number;
  largestPosShare14d: number;
  largestPairShare7d: number;
  largestPairShare14d: number;
  largestPairShare30d: number;
  maxConsecutivePosDays: number;
  maxConsecutivePairDays: number;
  maxActiveDays7dPos: number;
  maxActiveDays14dPos: number;
  maxActiveDays30dPos: number;
  persistenceInput: number;
  persistenceFrequency7d: number;
  persistenceFrequency14d: number;
  persistenceFrequency30d: number;
  persistenceFactor: number;
  /**
   * 1 unless the book is one-POS CRITICAL and criticalPersistenceSensitivity > 0.
   * Separate from persistenceFactor (global F_persist stays 1 in production).
   */
  criticalPersistenceFactor: number;
  survivingPosConsecutiveDays: number;
  largestPosVolumeShare7d: number;
  largestPosVolumeShare14d: number;
  largestPosVolumeShare30d: number;
  largestPosActiveShare7d: number;
  largestPosActiveShare14d: number;
  largestPosActiveShare30d: number;
  largestPairActiveShare7d: number;
  largestPairActiveShare14d: number;
  largestPairActiveShare30d: number;
  overlapNotes: string[];
}

export interface ExpenseTimingDiagnosis {
  maxLegitimateSpendAvailableToday: number;
  scheduledSpend: number;
  economicallyUsefulAdditionalSpend: number;
  expenseEntitlementAvailable: number;
  expenseScheduledToday: number;
  expenseDeferred: number;
  marginalValueOfAdditionalOrganicSpendToday: number;
  bringForwardUpToZar: number;
  guidance: string;
}

export interface NamedFactor {
  id: string;
  label: string;
  value: number;
  kind: "state-derived" | "direct-input";
}

export interface MaturityBreakdown {
  score: number;
  category: MaturityCategory;
  components: {
    age: number;
    count: number;
    volume: number;
    activeDays: number;
    clean: number;
  };
}

export interface ConcentrationMetrics {
  largestCardShare: number;
  largestPosShare: number;
  largestPairShare: number;
  cardHhi: number;
  posHhi: number;
  pairHhi: number;
  expectedCapacityLost: number;
  expectedCapacityLostIfCardInterrupted: number;
  expectedCapacityLostIfPosInterrupted: number;
  usableIndependentCards: number;
  usableIndependentPos: number;
  activeCardCount: number;
  activePosCount: number;
  cardShares: number[];
  posShares: number[];
}

export interface PairAllocation {
  cardId: string;
  posId: string;
  cardName: string;
  posName: string;
  amount: number;
  share: number;
  weight: number;
  cardMaturity: number;
  posMaturity: number;
  cardCategory: MaturityCategory;
  posCategory: MaturityCategory;
  source: "core" | "organic";
}

export interface AllocationPlan {
  pairs: PairAllocation[];
  cardIds: string[];
  posIds: string[];
  cardVolumes: number[];
  posVolumes: number[];
  cardShares: number[];
  posShares: number[];
  pairHhi: number;
  largestPairShare: number;
  transactionCount: number;
}

export interface ResourceSnapshot {
  id: string;
  name: string;
  kind: ResourceKind;
  installedOnDay: number;
  available: boolean;
  downUntilDay: number | null;
  maturityScore: number;
  maturityCategory: MaturityCategory;
  daysActive: number;
  lifetimeVolume: number;
  lifetimeCount: number;
  activeTradingDays: number;
  cleanHistoryDays: number;
  coreVolume: number;
  organicRevenueVolume: number;
  organicExpenseVolume: number;
  importedHistoryVolume: number;
  consecutiveActiveDays: number;
  volume7d: number;
  volume14d: number;
  volume30d: number;
  activeDays7d: number;
  activeDays14d: number;
  activeDays30d: number;
  daysSinceLastUse: number;
  shareOfActiveDays7d: number;
  shareOfActiveDays14d: number;
  shareOfActiveDays30d: number;
}

export interface CandidateSlice {
  throughput: number;
  organicRevenue: number;
  organicExpense: number;
  grossProfit: number;
  expectedContinuityCost: number;
  myopicEv: number;
  objectiveEv: number;
  hazard: number;
  rolloutCumulativeEv: number;
  endingMerchantMaturity: number;
  expectedDowntime: number;
  posteriorDeltaMean: number;
  posteriorDeltaSd: number;
  decisionAdjustment: number;
}

export interface LearnerCoefficientRow {
  column: string;
  mean: number;
  sd: number;
}

export interface LearningDiagnosis {
  /** Δ_G under today's draw for the chosen action (Rands). */
  sampledDelta: number;
  posteriorDeltaMean: number;
  posteriorDeltaSd: number;
  /** Posterior SD of Δ_G as a fraction of the chosen action's gross profit. */
  posteriorSdShareOfGross: number;
  /** Realized operating days that have updated the posterior so far. */
  updates: number;
  coefficients: LearnerCoefficientRow[];
  continuity: {
    posteriorMean: number;
    lo90: number;
    hi90: number;
    exposure: number;
    hits: number;
    days: number;
    inProduction: boolean;
  };
}

/** Diagnostics of the β-aware degraded-state packer for one packed core plan (experiment). */
export interface DegradedRoutingDiagnostics {
  beta: number;
  survivingPos: number;
  ticketCount: number;
  /** POS assignments enumerated over the surviving terminals (cards fixed). */
  routingsEnumerated: number;
  /** Assignments that executed the same tickets under every hard bank rule and capacity. */
  routingsFeasible: number;
  /** Assignments among the feasible ones with maxPosShare ≤ β. */
  routingsCompliant: number;
  /** Lowest maxPosShare any feasible routing reached. */
  minAchievableMaxShare: number;
  /** maxPosShare / HHI of the routing the old (baseline) packer produced. */
  baselineMaxShare: number;
  baselineHhi: number;
  /** maxPosShare / HHI of the routing actually chosen. */
  chosenMaxShare: number;
  chosenHhi: number;
  /** Structural day-0 Q of the baseline and of the chosen routing (same tickets). */
  baselineQ: number;
  chosenQ: number;
  /** True when no feasible routing satisfied β: the day is CRITICAL_β and the min-share routing is used. */
  criticalBeta: boolean;
  /** True when the chosen routing differs from the baseline packer's. */
  rerouted: boolean;
}

export interface CalendarEntry {
  day: number;
  /** Present only when the β-aware degraded-state packer was active on this day. */
  degradedRouting?: DegradedRoutingDiagnostics;
  nMinusOneThroughputRetention?: number;
  nMinusOneMaxPosShare?: number;
  nMinusOneWorstCaseLock?: number;
  nMinusOneResilienceFeasible?: boolean;
  nMinusOneResilienceFallback?: boolean;
  availableCapital: number;
  recommendedThroughput: number;
  coreThroughput: number;
  organicRevenue: number;
  organicExpense: number;
  totalActivity: number;
  organicRevenueRemaining: number;
  organicExpenseRemaining: number;
  monthRevenueRemaining: number;
  grossProfitToday: number;
  expenseEntitlementAddedToday: number;
  expenseBudgetOpening: number;
  organicExpenseSpentToday: number;
  expenseBudgetClosing: number;
  weeklyMinimumAccrual: number;
  profitLinkedAccrual: number;
  expenseScheduledToday: number;
  expenseDelayedToday: number;
  cumulativeGrossProfit: number;
  cumulativeExpenseEntitlement: number;
  cumulativeOrganicExpense: number;
  unusedExpenseBudget: number;
  pairsUsed: number;
  allocations: PairAllocation[];
  coreAllocations: PairAllocation[];
  organicAllocations: PairAllocation[];
  idleCapital: number;
  grossProfit: number;
  continuityAdjustedEv: number;
  expectedContinuityCost: number;
  hazard: number;
  factors: NamedFactor[];
  merchantMaturity: MaturityBreakdown;
  cardResources: ResourceSnapshot[];
  posResources: ResourceSnapshot[];
  pairRecords: PairRecord[];
  concentration: ConcentrationMetrics;
  rampIndex: number;
  hazardDecomposition: HazardDecomposition;
  expenseDiagnosis: ExpenseTimingDiagnosis;
  posUsedIds: string[];
  pairKeysUsed: string[];
  candidates: CandidateSlice[];
  selectedThroughput: number;
  bindingFactors: BindingFactor[];
  totalExplanation: string;
  allocationExplanation: string;
  arrivingCardIds: string[];
  arrivingPosIds: string[];
  /** L-day rollout score of the chosen action (lookahead EV). Not truncated by inspect length. */
  rolloutQ: number;
  actionPlan: DailyActionPlan;
  /** Cover-ranking VOI diagnosis. Ranking only; not added to continuity-adjusted EV. */
  voi: CoverVoiDiagnosis | null;
  /** Economic residual posterior before today's decision, and today's draw. */
  learning: LearningDiagnosis | null;
  /** Bank Operating Rules layer: features, per-rule contributions to h, day summary. */
  bank: BankDayDiagnosis;
  /** Event-based loss model: today's demand fates and the interruption projection of the chosen action. */
  demandFates: DemandFates | null;
  eventLoss: EventLossSummary | null;
  /** True on calendar rows after the optimization horizon (evaluation tail: no new ordinary demand). */
  inEvaluationTail?: boolean;
  state: SimState;
}

export interface HazardContributionRow {
  id: string;
  label: string;
  category: "structural" | "banker-identified-feature" | "model-hypothesis";
  /** Multiplicative factor (1 = no effect) or, for base / final rows, the hazard level. */
  value: number;
  /** True for the provisional (illustrative / uncalibrated) bank-feature coefficients. */
  provisional: boolean;
  note: string;
}

export interface BankDayDiagnosis {
  summary: BankDaySummary;
  features: BankRiskFeatures;
  /** base hazard → each factor → final structural hazard, in multiplication order. */
  hazardContributions: HazardContributionRow[];
  /** Human-readable statements, e.g. zero local-card activity. */
  notes: string[];
}

export interface FactorChange {
  id: string;
  label: string;
  baseline: number;
  counterfactual: number;
  delta: number;
}

export interface CounterfactualResult {
  requestedThroughput: number;
  evaluatedThroughput: number;
  clamped: boolean;
  allocations: PairAllocation[];
  idleCapital: number;
  grossProfit: number;
  expectedContinuityCost: number;
  myopicEv: number;
  hazard: number;
  incrementalGrossProfit: number;
  incrementalContinuityCost: number;
  evDifference: number;
  factorChanges: FactorChange[];
  concentration: ConcentrationMetrics;
  explanation: string;
}

export interface CandidateEvaluation {
  throughput: number;
  grossProfit: number;
  pBase: number;
  rawHazard: number;
  hazard: number;
  factors: NamedFactor[];
  factorProduct: number;
  expectedDurationDays: number;
  expectedShortCost: number;
  expectedLongCost: number;
  freezeCost: number;
  expectedContinuityCost: number;
  myopicEv: number;
  lookaheadEv: number;
  objectiveEv: number;
  capitalVelocity: number;
  resourceUtilization: number;
  expectedDowntimeShare: number;
  probLongReview30d: number;
  passesRiskConstraint: boolean;
  concentration: ConcentrationMetrics;
  merchantMaturity: MaturityBreakdown;
  cardMaturity: MaturityBreakdown;
  posMaturity: MaturityBreakdown;
  ticketCount: number;
  ticketFitDeviation: number;
  rampIndex: number;
  organicRevenue: number;
  organicExpense: number;
  observedActivity: number;
  rolloutCumulativeEv: number;
  endingMerchantMaturity: number;
  endingCardMaturity: number;
  continuationCoreThroughput: number;
  hazardDecomposition: HazardDecomposition;
  /** Posterior mean of Δ_G for this packed action (Rands). Diagnostic; not in myopicEv. */
  posteriorDeltaMean: number;
  /** Posterior predictive SD of Δ_G for this packed action (Rands). */
  posteriorDeltaSd: number;
  /** Δ_G under today's Thompson draw (or hidden truth for the oracle). 0 when learner off. */
  decisionAdjustment: number;
  /** objectiveEv + decisionAdjustment: the quantity today's action maximises. */
  decisionEv: number;
  /** Banker-identified features on this exact packed plan (realized plan, not abstract cover). */
  bankFeatures: BankRiskFeatures;
  /** Genuine obligations the hard rules kept out of this candidate. */
  blocked: BlockedObligation[];
  /** Event-based loss model only: fates of today's demand under this action. */
  demandFates?: DemandFates;
  /** Event-based loss model only: the interruption projection behind expectedContinuityCost. */
  eventLoss?: EventLossSummary;
  /** Post-failure continuity of this packed plan (set when the N−1 planner constraint is on). */
  nMinusOneThroughputRetention?: number;
  nMinusOneMaxPosShare?: number;
  nMinusOneWorstCaseLock?: number;
  nMinusOneResilienceFeasible?: boolean;
  /** True when no positive-throughput candidate met the N−1 constraint and this is the Q fallback. */
  nMinusOneResilienceFallback?: boolean;
}

export interface BindingFactor {
  id: string;
  label: string;
  detail: string;
}

export interface DayDecision {
  day: number;
  capital: number;
  idleCapital: number;
  recommended: CandidateEvaluation;
  myopicRecommended: CandidateEvaluation;
  lookaheadRecommended: CandidateEvaluation;
  riskConstrained: CandidateEvaluation;
  curve: CandidateEvaluation[];
  bandMin: number;
  bandMax: number;
  breakEvenHazard: number | null;
  impliedHazard: number;
  hazardSafetyRatio: number | null;
  bindingFactors: BindingFactor[];
  explanation: string;
  cardCount: number;
  posCount: number;
  usableCardCapacity: number;
  usablePosCapacity: number;
  organicRevenue: number;
  organicExpense: number;
  observedActivity: number;
  organicOfferRevenue: number;
  organicOfferExpense: number;
  expenseBudgetOpening: number;
  expenseScheduledToday: number;
  expenseDiagnosis: ExpenseTimingDiagnosis;
  actionPlan: DailyActionPlan;
}

export interface SimulationDayRow {
  day: number;
  throughput: number;
  grossProfit: number;
  continuityAdjustedEv: number;
  cumulativeGross: number;
  cumulativeEv: number;
  capital: number;
  hazard: number;
  cardCount: number;
  posCount: number;
  activeCardCount: number;
  activePosCount: number;
  merchantMaturity: number;
  cardMaturity: number;
  merchantCategory: MaturityCategory;
  cardCategory: MaturityCategory;
  largestCardShare: number;
  cardHhi: number;
  largestPosShare: number;
  posHhi: number;
  pairHhi: number;
  expectedCapacityLost: number;
  expectedCapacityLostIfCardInterrupted: number;
  expectedCapacityLostIfPosInterrupted: number;
  dominantBindingConstraint: string;
  coreThroughput: number;
  organicRevenue: number;
  organicExpense: number;
  totalActivity: number;
  pairsUsed: number;
  expenseEntitlementAdded: number;
  expenseBudgetOpening: number;
  expenseBudgetClosing: number;
  weeklyMinimumAccrual: number;
  profitLinkedAccrual: number;
  cumulativeExpenseEntitlement: number;
  cumulativeOrganicExpense: number;
  largestPosShare7d: number;
  largestPosShare14d: number;
  largestPairShare7d: number;
  largestPairShare14d: number;
  largestPairShare30d: number;
  maxConsecutivePosDays: number;
  maxConsecutivePairDays: number;
  largestPosShare30d: number;
  largestPosActiveShare7d: number;
  largestPosActiveShare14d: number;
  largestPosActiveShare30d: number;
  largestPairActiveShare7d: number;
  largestPairActiveShare14d: number;
  largestPairActiveShare30d: number;
  organicSpendBroughtForward: number;
  lockedCapital?: number;
  activeReviews?: number;
  backlogZar?: number;
  collapsed?: boolean;
  collapseReason?: "zero-pos" | "zero-card" | "zero-capital" | "economic-idle" | null;
  onePosDegraded?: boolean;
  hitDomain?: LossDomain | null;
  /** Continuity regime at the start of the day (after recoveries), with economic idle applied after the decision. */
  regime?: ContinuityRegime;
  concentrationFactor?: number;
  persistenceFactor?: number;
  criticalPersistenceFactor?: number;
  feasibleZar?: number;
  availableCapital?: number;
  nMinusOneThroughputRetention?: number;
  nMinusOneMaxPosShare?: number;
  nMinusOneWorstCaseLock?: number;
  nMinusOneResilienceFeasible?: boolean;
  nMinusOneResilienceFallback?: boolean;
}

export interface CascadePathOutcome {
  enteredOnePos: boolean;
  onePosDay: number | null;
  secondHitDuringReview: boolean;
  collapsed: boolean;
  collapseReason: "zero-pos" | "zero-card" | "zero-capital" | "economic-idle" | null;
  collapseDay: number | null;
  accountWideHit: boolean;
  posScopedHit: boolean;
  daysDegraded: number;
  peakLockedCapital: number;
  meanBacklog: number;
  maxBacklog: number;
  recovered: boolean;
  recoveredValue: number;
  totalCA: number;
  totalGross: number;
  expiredZar: number;
  endingTrapped: number;
}

export interface ResourceUtilizationRow {
  id: string;
  name: string;
  kind: ResourceKind;
  installedOnDay: number;
  daysPresent: number;
  daysAvailable: number;
  daysWithVolume: number;
  lifetimeVolume: number;
  utilization: number;
  maturityScore: number;
  maturityCategory: MaturityCategory;
}

export interface SimulationResult {
  policy: string;
  days: SimulationDayRow[];
  calendar: CalendarEntry[];
  totalGrossProfit: number;
  totalContinuityAdjusted: number;
  totalExpectedDowntimeDays: number;
  endingCapital: number;
  endingExtractedProfit: number;
  totalCoreThroughput: number;
  totalOrganicRevenue: number;
  totalOrganicExpense: number;
  totalOrganicBroughtForward: number;
  endingUnusedExpenseEntitlement: number;
  totalExpenseEntitlementAccrued: number;
  endingMerchantMaturity: number;
  coreShareOfTotal: number;
  surpriseFlags: string[];
  /** State after the last realized day (posterior, continuity evidence, observation log). */
  endingState: SimState;
  /** Last day scored by the optimizer under ordinary demand. Absent when no evaluation tail ran. */
  optimizationEndDay?: number;
  evaluationTail?: EvaluationTailResult;
  cascade?: CascadePathOutcome;
}

/** Outcome of the post-horizon drain: no new demand, backlog / reviews / settlement may still resolve. */
export interface EvaluationTailResult {
  maxCalendarDays: number;
  daysRun: number;
  endDay: number;
  resolved: boolean;
  daysToClearBacklog: number | null;
  unresolvedBacklogZar: number;
  unresolvedReviewCount: number;
  unresolvedFrozenCapital: number;
  unresolvedInFlightZar: number;
}

export interface MonteCarloSummary {
  paths: number;
  seed: number;
  meanCumulativeProfit: number;
  medianCumulativeProfit: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  probabilityAtLeastOneLongReview: number;
  averageDowntimeDays: number;
}

export interface SensitivityRow {
  parameter: string;
  value: number;
  day1Optimum: number;
  day1ObjectiveEv: number;
}

export interface SanityCheckResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}
