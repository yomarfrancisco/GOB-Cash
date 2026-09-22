/**
 * Bank Operating Rules comparison: the same demand seed and the same hidden world, run once
 * with the feasibility layer off (the previous production/learning result) and once with it on.
 * Nothing else changes — no coefficient retune, no prior widening. Any fall in the optimum is
 * reported as the consequence of a narrower feasible action set.
 */
import { coverAlternatives, pairKey } from "./allocation";
import { cloneScenario } from "./defaults";
import { resolveExogenousOffer, selectTickets, weekdayName } from "./demand";
import { hiddenEconomicDelta } from "./hiddenWorld";
import { oracleForDay } from "./learningLab";
import { roundMoney, sum } from "./math";
import { simulate } from "./simulation";
import { cloneState, createInitialState, upResources } from "./state";
import { HARD_RULE_META, isOperatingDay, ledgerPairKey, previousOperatingDay } from "./bankRules";
import type {
  BlockedObligation,
  CalendarEntry,
  HardBankRuleId,
  LedgerTransaction,
  PairAllocation,
  Scenario,
  SimulationResult,
} from "./types";

export interface BankComparisonSide {
  operating: boolean;
  throughput: number;
  /** Packed card transactions (core + organic). Legacy organic counts one purchase per organic pair. */
  transactions: number;
  cards: number;
  pos: number;
  organic: number;
  pairLabels: string[];
  hazard: number;
  continuityAdjustedEv: number;
  deltaStar: number;
  trueValue: number;
  regret: number | null;
  sampledDelta: number;
  highValueCount: number;
  localShare14d: number;
  internationalShare14d: number;
  maxCardUses7d: number;
  maxCardUses14d: number;
  repeatExposure: number;
  /** Rolling persistence state of the executed plan (banker: repeat use of the same card is a flag). */
  cardsUsedPrevOpDay: number;
  pairsUsedPrevOpDay: number;
  reusedPairLabels: string[];
  cardRepeatExposure: number;
  pairRepeatExposure: number;
  repeatCardFactor: number;
  repeatPairFactor: number;
  /** Cards used more than once today across core + organic (rule 5 violations in the executed plan). */
  sameCardTwice: string[];
  /** Amount on second-and-later same-day uses of a card (what rule 5 alone would remove). */
  sameCardTwiceAmount: number;
  offeredCoreDemand: number;
  feasibleCoreDemand: number;
  blockedAmount: number;
  blockedCount: number;
  blocked: BlockedObligation[];
}

export interface BankComparisonDayRow {
  day: number;
  weekday: string;
  before: BankComparisonSide;
  after: BankComparisonSide;
  /** Chosen throughput, card set or POS set differ between the two runs. */
  actionDiffers: boolean;
}

export interface BankComparisonTotals {
  throughput: number;
  transactions: number;
  distinctCards: number;
  distinctPos: number;
  operatingDays: number;
  grossProfit: number;
  continuityAdjustedEv: number;
  sumDeltaStar: number;
  trueValue: number;
  cumulativeRegret: number | null;
  highValueCount: number;
  blockedAmount: number;
  blockedCount: number;
  blockedByRule: Array<{ rule: HardBankRuleId; label: string; count: number; amount: number }>;
  sameCardTwiceDays: number;
  sameCardTwiceAmount: number;
  meanHazard: number;
  /** Persistence over the run, from the executed ledger (operating weekdays only). */
  persistence: PersistenceStats;
}

export interface PersistenceStats {
  /** Longest run of consecutive operating days on which one card / one pair was used. */
  maxConsecutiveCardDays: number;
  maxConsecutivePairDays: number;
  maxConsecutiveCardLabel: string;
  maxConsecutivePairLabel: string;
  /** Operating days where at least one executed pair / card was also used on the previous operating day. */
  pairReuseDays: number;
  cardReuseDays: number;
  /** End-of-run active days per card / pair over the last 7 / 14 calendar days (operating-day denominators shown). */
  cardActiveDays7d: Array<{ id: string; days: number }>;
  cardActiveDays14d: Array<{ id: string; days: number }>;
  pairActiveDays7d: Array<{ id: string; days: number }>;
  pairActiveDays14d: Array<{ id: string; days: number }>;
  operatingDays7d: number;
  operatingDays14d: number;
  maxCardActiveDays7d: number;
  maxCardActiveDays14d: number;
  maxPairActiveDays7d: number;
  maxPairActiveDays14d: number;
  distinctCards: number;
  distinctPairs: number;
}

/** Marginal economics of reusing an incumbent pair on one operating day. */
export interface PairReuseEconomics {
  day: number;
  weekday: string;
  coreThroughput: number;
  /** Pairs in the executed plan that were also used on the previous operating day. */
  reusedPairs: string[];
  chosenPairs: string[];
  /** Best-scoring cover that contains at least one incumbent pair (the production cover-ranking Q). */
  qReuse: number;
  reuseCover: string[];
  reuseMatchesChosen: boolean;
  /** Best-scoring feasible cover with no incumbent pair. null ⇒ no such cover could carry the same tickets. */
  qAlternative: number | null;
  alternativeCover: string[];
  alternativeReusesCard: boolean;
  /** qReuse − qAlternative under the production scenario (> 0 ⇒ reuse survives). */
  qDifference: number | null;
  /** Same difference with c_card = c_pair = 0. */
  qDifferenceNoPersistence: number | null;
  /** Part of qDifference attributable to the persistence factors (negative = persistence penalised reuse). */
  persistenceCost: number | null;
  /** Part attributable to first-day switching cost K(a) (new pair / new POS / extra pair). */
  switchingCost: number | null;
  /** Remainder: maturity, concentration and the other structural terms plus Δ̃ over the hold. */
  maturityAndOther: number | null;
  /** Day-0 Thompson Δ̃ difference (informational; inside maturityAndOther). */
  deltaDay0Difference: number | null;
  /** Day-0 factors on the chosen plan. */
  cardRepeatFactor: number;
  pairRepeatFactor: number;
  hazardReuse: number;
  hazardAlternative: number | null;
  /** Would the alternative have been chosen had persistence been priced at 0? */
  reuseSurvivesWithoutPersistence: boolean | null;
  reuseSurvivesWithPersistence: boolean | null;
  /**
   * Multiple of the current (c_card, c_pair) at which the alternative would overtake the incumbent,
   * assuming the persistence component scales linearly with the price (first-order). null when the
   * persistence price does not disadvantage the incumbent or no alternative exists.
   */
  breakEvenPriceMultiple: number | null;
  /** Why no alternative cover exists (when qAlternative is null). */
  noAlternativeReason: string | null;
}

export interface PersistenceSweepRow {
  multiplier: number;
  cardCoefficient: number;
  pairCoefficient: number;
  throughput: number;
  transactions: number;
  continuityAdjustedEv: number;
  trueValue: number;
  meanHazard: number;
  blockedAmount: number;
  persistence: PersistenceStats;
}

export interface BankRulesComparison {
  days: number;
  rngSeed: number;
  hiddenWorldSeed: number;
  rows: BankComparisonDayRow[];
  before: BankComparisonTotals;
  after: BankComparisonTotals;
  /** Provisional persistence coefficients used in the rules-on run. */
  persistenceCoefficients: { card: number; pair: number; w: [number, number, number]; p: [number, number, number] };
  /** Reuse-day marginal economics in the rules-on run. */
  pairReuse: PairReuseEconomics[];
  /** Sensitivity of the rules-on run to the persistence price (0× is the pre-persistence rules-on result). */
  persistenceSweep: PersistenceSweepRow[];
  answers: {
    /** Realized throughput change and its decomposition. */
    infeasibleThroughput: {
      /** before − after core throughput. */
      amount: number;
      shareOfBefore: number;
      /** Amount of the previous executed plan sitting on second same-day uses of a card (rule 5). */
      violatingInPreviousPlan: number;
      violatingShareOfBefore: number;
      /** Σ_days max(0, offered − feasible): demand no feasible plan could carry. */
      offerNoFeasiblePlanCouldCarry: number;
      /** amount − offerNoFeasiblePlanCouldCarry: the optimizer choosing below the feasible maximum. */
      optimizerChoiceInsideFeasibleSet: number;
      detail: string;
    };
    mostBindingRule: { rule: HardBankRuleId | null; label: string; count: number; amount: number; detail: string };
    learnerChanged: { daysDiffering: number; operatingDays: number; detail: string };
    invalidSameCardCombos: { days: number; cards: number; amount: number; detail: string };
  };
  runtimeMs: number;
}

export interface BankRulesComparisonOptions {
  days?: number;
  skipOracle?: boolean;
  /** Persistence-price multipliers to sweep on the rules-on scenario. [] disables the sweep. */
  persistenceMultipliers?: number[];
  /** Compute reuse-day marginal economics (default true). */
  reuseEconomics?: boolean;
  onProgress?: (message: string) => void;
}

/* ------------------------------------------------------------------------------------------
 * Persistence statistics from the executed ledger
 * ------------------------------------------------------------------------------------------ */

function longestOperatingStreak(daysUsed: Set<number>, lastDay: number): number {
  let best = 0;
  let run = 0;
  for (let d = 1; d <= lastDay; d += 1) {
    if (!isOperatingDay(d)) continue;
    if (daysUsed.has(d)) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

export function persistenceStats(ledger: LedgerTransaction[], lastDay: number): PersistenceStats {
  const cardDays = new Map<string, Set<number>>();
  const pairDays = new Map<string, Set<number>>();
  for (const row of ledger) {
    if (row.amount <= 1e-9 || row.day > lastDay) continue;
    (cardDays.get(row.cardId) ?? cardDays.set(row.cardId, new Set()).get(row.cardId)!).add(row.day);
    const pk = ledgerPairKey(row.cardId, row.posId);
    (pairDays.get(pk) ?? pairDays.set(pk, new Set()).get(pk)!).add(row.day);
  }
  let maxCard = 0;
  let maxCardLabel = "—";
  for (const [id, days] of cardDays) {
    const s = longestOperatingStreak(days, lastDay);
    if (s > maxCard) {
      maxCard = s;
      maxCardLabel = id;
    }
  }
  let maxPair = 0;
  let maxPairLabel = "—";
  for (const [id, days] of pairDays) {
    const s = longestOperatingStreak(days, lastDay);
    if (s > maxPair) {
      maxPair = s;
      maxPairLabel = id;
    }
  }
  let pairReuseDays = 0;
  let cardReuseDays = 0;
  for (let d = 2; d <= lastDay; d += 1) {
    if (!isOperatingDay(d)) continue;
    const prev = previousOperatingDay(d);
    if (prev === null) continue;
    if ([...pairDays.values()].some((s) => s.has(d) && s.has(prev))) pairReuseDays += 1;
    if ([...cardDays.values()].some((s) => s.has(d) && s.has(prev))) cardReuseDays += 1;
  }
  const window = (m: Map<string, Set<number>>, from: number) =>
    [...m.entries()]
      .map(([id, s]) => ({ id, days: [...s].filter((d) => d >= from && d <= lastDay).length }))
      .filter((r) => r.days > 0)
      .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
  const opDays = (from: number) => {
    let n = 0;
    for (let d = Math.max(1, from); d <= lastDay; d += 1) if (isOperatingDay(d)) n += 1;
    return n;
  };
  const c7 = window(cardDays, lastDay - 6);
  const c14 = window(cardDays, lastDay - 13);
  const p7 = window(pairDays, lastDay - 6);
  const p14 = window(pairDays, lastDay - 13);
  return {
    maxConsecutiveCardDays: maxCard,
    maxConsecutivePairDays: maxPair,
    maxConsecutiveCardLabel: maxCardLabel,
    maxConsecutivePairLabel: maxPairLabel,
    pairReuseDays,
    cardReuseDays,
    cardActiveDays7d: c7,
    cardActiveDays14d: c14,
    pairActiveDays7d: p7,
    pairActiveDays14d: p14,
    operatingDays7d: opDays(lastDay - 6),
    operatingDays14d: opDays(lastDay - 13),
    maxCardActiveDays7d: Math.max(0, ...c7.map((r) => r.days)),
    maxCardActiveDays14d: Math.max(0, ...c14.map((r) => r.days)),
    maxPairActiveDays7d: Math.max(0, ...p7.map((r) => r.days)),
    maxPairActiveDays14d: Math.max(0, ...p14.map((r) => r.days)),
    distinctCards: cardDays.size,
    distinctPairs: pairDays.size,
  };
}

/**
 * Day × card × POS activity rebuilt from the calendar (core + organic allocations) so both sides are
 * comparable — the legacy organic water-fill never enters the transaction ledger. Streaks and
 * active-day counts only need pair-day granularity.
 */
function ledgerOf(result: SimulationResult): LedgerTransaction[] {
  const rows: LedgerTransaction[] = [];
  for (const e of result.calendar) {
    const push = (cardId: string, posId: string, amount: number, source: LedgerTransaction["source"]) =>
      rows.push({ day: e.day, economicPaymentId: `cal:${e.day}:${cardId}|${posId}`, cardId, posId, amount, source, cardOrigin: "international", highValue: false });
    for (const p of e.coreAllocations) if (p.amount > 1e-9) push(p.cardId, p.posId, p.amount, "core");
    for (const p of e.organicAllocations as PairAllocation[]) if (p.amount > 1e-9) push(p.cardId, p.posId, p.amount, "organic-revenue");
  }
  return rows;
}

/* ------------------------------------------------------------------------------------------
 * Reuse-day marginal economics
 * ------------------------------------------------------------------------------------------ */

function pairReuseEconomicsOf(entry: CalendarEntry, scenario: Scenario): PairReuseEconomics | null {
  if (entry.coreThroughput <= 1e-9) return null;
  const state = cloneState(entry.state);
  const prev = previousOperatingDay(entry.day);
  if (prev === null) return null;
  const incumbentPairs = new Set<string>();
  const incumbentCards = new Set<string>();
  for (const row of state.bankLedger) {
    if (row.day !== prev || row.amount <= 1e-9) continue;
    incumbentPairs.add(pairKey(row.cardId, row.posId));
    incumbentCards.add(row.cardId);
  }
  const chosenPairs = entry.coreAllocations.filter((p) => p.amount > 1e-9).map((p) => pairKey(p.cardId, p.posId)).sort();
  const reused = chosenPairs.filter((k) => incumbentPairs.has(k));
  if (reused.length === 0) return null;

  const tickets = selectTickets(resolveExogenousOffer(state, scenario).coreTickets, entry.coreThroughput);
  const rows = coverAlternatives(state, scenario, tickets, incumbentPairs, incumbentCards);
  const finite = rows.filter((r) => Number.isFinite(r.score));
  const withIncumbent = finite.filter((r) => r.incumbentPairs.length > 0).sort((a, b) => b.score - a.score);
  const without = finite.filter((r) => r.incumbentPairs.length === 0).sort((a, b) => b.score - a.score);
  const best = withIncumbent[0];
  if (!best) return null;
  const alt = without[0] ?? null;

  // Same covers, persistence priced at zero (nothing else changes).
  const noPersistence = cloneScenario(scenario);
  noPersistence.repeatCardSensitivity = 0;
  noPersistence.repeatPairSensitivity = 0;
  const rows0 = coverAlternatives(cloneState(entry.state), noPersistence, tickets, incumbentPairs, incumbentCards);
  const sig = (keys: string[]) => keys.join(",");
  const best0 = rows0.find((r) => sig(r.keys) === sig(best.keys));
  const alt0 = alt ? rows0.find((r) => sig(r.keys) === sig(alt.keys)) : null;
  const bestWith0 = rows0.filter((r) => Number.isFinite(r.score) && r.incumbentPairs.length > 0).sort((a, b) => b.score - a.score)[0];
  const bestWithout0 = rows0.filter((r) => Number.isFinite(r.score) && r.incumbentPairs.length === 0).sort((a, b) => b.score - a.score)[0];

  const qDiff = alt ? best.score - alt.score : null;
  const qDiff0 = best0 && alt0 ? best0.score - alt0.score : null;
  const switching = alt ? alt.firstCost - best.firstCost : null;
  const persistenceCost = qDiff !== null && qDiff0 !== null ? qDiff - qDiff0 : null;
  const maturityAndOther = qDiff0 !== null && switching !== null ? qDiff0 - switching : null;
  const chosenSig = sig(chosenPairs);
  const breakEven =
    qDiff !== null && qDiff0 !== null && persistenceCost !== null && persistenceCost < -1e-6 && qDiff0 > 0
      ? qDiff0 / -persistenceCost
      : null;
  const upCards = upResources(state.cards, state.day).length;
  const noAlternativeReason = alt
    ? null
    : finite.length === withIncumbent.length
      ? `Every enumerated cover that can carry the ${tickets.length} genuine ticket(s) contains an incumbent pair (${upCards} card(s) up; rule 5 needs one card per ticket).`
      : "No enumerated cover without an incumbent pair could carry the same tickets.";
  return {
    day: entry.day,
    weekday: weekdayName(entry.day),
    coreThroughput: entry.coreThroughput,
    reusedPairs: reused,
    chosenPairs,
    qReuse: roundMoney(best.score),
    reuseCover: best.keys,
    reuseMatchesChosen: sig(best.keys) === chosenSig,
    qAlternative: alt ? roundMoney(alt.score) : null,
    alternativeCover: alt?.keys ?? [],
    alternativeReusesCard: alt ? alt.incumbentCards.length > 0 : false,
    qDifference: qDiff !== null ? roundMoney(qDiff) : null,
    qDifferenceNoPersistence: qDiff0 !== null ? roundMoney(qDiff0) : null,
    persistenceCost: persistenceCost !== null ? roundMoney(persistenceCost) : null,
    switchingCost: switching !== null ? roundMoney(switching) : null,
    maturityAndOther: maturityAndOther !== null ? roundMoney(maturityAndOther) : null,
    deltaDay0Difference: alt ? roundMoney(best.day0Delta - alt.day0Delta) : null,
    cardRepeatFactor: best.day0CardRepeatFactor,
    pairRepeatFactor: best.day0PairRepeatFactor,
    hazardReuse: best.day0Hazard,
    hazardAlternative: alt ? alt.day0Hazard : null,
    reuseSurvivesWithPersistence: alt ? best.score >= alt.score : null,
    reuseSurvivesWithoutPersistence: bestWith0 && bestWithout0 ? bestWith0.score >= bestWithout0.score : null,
    breakEvenPriceMultiple: breakEven !== null ? Math.round(breakEven * 100) / 100 : null,
    noAlternativeReason,
  };
}

function sameCardTwiceOf(entry: CalendarEntry): { cards: string[]; amount: number } {
  // Time-ordered card purchases: every core transaction, then organic. Legacy organic
  // water-fills pairs, so each organic pair allocation counts as one purchase on that card.
  const purchases: Array<{ cardId: string; amount: number }> = entry.actionPlan.transactions.map((t) => ({
    cardId: t.cardId,
    amount: t.amount,
  }));
  if (entry.actionPlan.organicTransactions.length > 0) {
    for (const t of entry.actionPlan.organicTransactions) purchases.push({ cardId: t.cardId, amount: t.amount });
  } else {
    for (const p of entry.organicAllocations as PairAllocation[]) {
      if (p.amount > 1e-9) purchases.push({ cardId: p.cardId, amount: p.amount });
    }
  }
  const seen = new Set<string>();
  const repeated = new Set<string>();
  let amount = 0;
  for (const p of purchases) {
    if (seen.has(p.cardId)) {
      repeated.add(p.cardId);
      amount += p.amount;
    } else seen.add(p.cardId);
  }
  return { cards: [...repeated].sort(), amount: roundMoney(amount) };
}

function sideOf(entry: CalendarEntry, scenario: Scenario, result: SimulationResult, skipOracle: boolean): BankComparisonSide {
  // The realized observation for this day is written after the decision, so it lives on the ending state.
  const obs = result.endingState.observations.find((o) => o.id === `sim:${entry.day}`);
  const design = obs?.design ?? null;
  const deltaStar = obs?.outcome?.hiddenEconomicDelta ?? hiddenEconomicDelta(scenario, design);
  const cards = new Set(entry.coreAllocations.map((p) => p.cardId));
  const pos = new Set(entry.coreAllocations.map((p) => p.posId));
  let regret: number | null = null;
  if (!skipOracle && scenario.economicLearnerEnabled) {
    const oracle = oracleForDay(entry, scenario);
    regret = oracle.trueValue - (entry.continuityAdjustedEv + deltaStar);
  }
  const f = entry.bank.features;
  const s = entry.bank.summary;
  const twice = sameCardTwiceOf(entry);
  const organicTx =
    entry.actionPlan.organicTransactions.length > 0
      ? entry.actionPlan.organicTransactions.length
      : entry.organicAllocations.filter((p) => p.amount > 1e-9).length;
  return {
    operating: entry.coreThroughput > 1e-9,
    throughput: entry.coreThroughput,
    transactions: entry.actionPlan.transactions.length + organicTx,
    cards: cards.size,
    pos: pos.size,
    organic: roundMoney(entry.organicRevenue + entry.organicExpense),
    pairLabels: entry.coreAllocations.map((p) => `${p.cardName}→${p.posName} ${roundMoney(p.amount).toLocaleString("en-ZA")}`),
    hazard: entry.hazard,
    continuityAdjustedEv: entry.continuityAdjustedEv,
    deltaStar,
    trueValue: entry.continuityAdjustedEv + deltaStar,
    regret,
    sampledDelta: entry.learning?.sampledDelta ?? 0,
    highValueCount: f.highValueCount1d,
    localShare14d: f.localVolumeShare14d,
    internationalShare14d: f.internationalVolumeShare14d,
    maxCardUses7d: f.maxCardUses7d,
    maxCardUses14d: f.maxCardUses14d,
    repeatExposure: f.repeatExposure,
    cardsUsedPrevOpDay: f.cardsUsedPrevOperatingDay,
    pairsUsedPrevOpDay: f.pairsUsedPrevOperatingDay,
    reusedPairLabels: Object.entries(f.pairUsedPrevOperatingDay)
      .filter(([, used]) => used)
      .map(([k]) => k)
      .sort(),
    cardRepeatExposure: f.cardRepeatExposure,
    pairRepeatExposure: f.pairRepeatExposure,
    repeatCardFactor: f.repeatCardFactor,
    repeatPairFactor: f.repeatPairFactor,
    sameCardTwice: twice.cards,
    sameCardTwiceAmount: twice.amount,
    offeredCoreDemand: s.offeredCoreDemand,
    feasibleCoreDemand: s.feasibleCoreDemand,
    blockedAmount: s.blockedAmount,
    blockedCount: s.blockedCount,
    blocked: entry.actionPlan.blocked,
  };
}

function totalsOf(sides: BankComparisonSide[], result: SimulationResult, lastDay: number): BankComparisonTotals {
  const cards = new Set<string>();
  const pos = new Set<string>();
  for (const e of result.calendar) {
    for (const p of e.coreAllocations) {
      cards.add(p.cardId);
      pos.add(p.posId);
    }
  }
  const byRule = new Map<HardBankRuleId, { count: number; amount: number }>();
  for (const s of sides) {
    for (const b of s.blocked) {
      const cur = byRule.get(b.rule) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += b.amount;
      byRule.set(b.rule, cur);
    }
  }
  const regrets = sides.map((s) => s.regret).filter((r): r is number => r !== null);
  const operating = sides.filter((s) => s.operating);
  return {
    throughput: roundMoney(sum(sides.map((s) => s.throughput))),
    transactions: sum(sides.map((s) => s.transactions)),
    distinctCards: cards.size,
    distinctPos: pos.size,
    operatingDays: operating.length,
    grossProfit: roundMoney(sum(result.calendar.map((e) => e.grossProfit))),
    continuityAdjustedEv: roundMoney(sum(sides.map((s) => s.continuityAdjustedEv))),
    sumDeltaStar: roundMoney(sum(sides.map((s) => s.deltaStar))),
    trueValue: roundMoney(sum(sides.map((s) => s.trueValue))),
    cumulativeRegret: regrets.length > 0 ? roundMoney(sum(regrets)) : null,
    highValueCount: sum(sides.map((s) => s.highValueCount)),
    blockedAmount: roundMoney(sum(sides.map((s) => s.blockedAmount))),
    blockedCount: sum(sides.map((s) => s.blockedCount)),
    blockedByRule: [...byRule.entries()]
      .map(([rule, v]) => ({ rule, label: HARD_RULE_META[rule].label, count: v.count, amount: roundMoney(v.amount) }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount),
    sameCardTwiceDays: sides.filter((s) => s.sameCardTwice.length > 0).length,
    sameCardTwiceAmount: roundMoney(sum(sides.map((s) => s.sameCardTwiceAmount))),
    meanHazard: operating.length > 0 ? sum(operating.map((s) => s.hazard)) / operating.length : 0,
    persistence: persistenceStats(ledgerOf(result), lastDay),
  };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

export function runBankRulesComparison(base: Scenario, options: BankRulesComparisonOptions = {}): BankRulesComparison {
  const started = Date.now();
  const days = Math.max(5, Math.min(base.horizonDays, options.days ?? 14));
  const skipOracle = options.skipOracle ?? false;

  const before = cloneScenario(base);
  before.bankRulesEnabled = false;
  const after = cloneScenario(base);
  after.bankRulesEnabled = true;

  options.onProgress?.(`Running ${days} days without the bank operating rules…`);
  const beforeRun = simulate(createInitialState(before), before, "optimize", { realizedThroughDay: days });
  options.onProgress?.(`Running the same ${days} days with the bank operating rules…`);
  const afterRun = simulate(createInitialState(after), after, "optimize", { realizedThroughDay: days });
  options.onProgress?.(skipOracle ? "Assembling report…" : "Scoring both runs against the hidden-θ* oracle…");

  const rows: BankComparisonDayRow[] = [];
  for (let i = 0; i < days; i += 1) {
    const eb = beforeRun.calendar[i];
    const ea = afterRun.calendar[i];
    if (!eb || !ea) break;
    const b = sideOf(eb, before, beforeRun, skipOracle);
    const a = sideOf(ea, after, afterRun, skipOracle);
    const cardsB = eb.coreAllocations.map((p) => p.cardId);
    const cardsA = ea.coreAllocations.map((p) => p.cardId);
    const posB = eb.coreAllocations.map((p) => p.posId);
    const posA = ea.coreAllocations.map((p) => p.posId);
    rows.push({
      day: eb.day,
      weekday: weekdayName(eb.day),
      before: b,
      after: a,
      actionDiffers: Math.abs(b.throughput - a.throughput) > 0.5 || !sameSet(cardsB, cardsA) || !sameSet(posB, posA),
    });
  }

  const beforeTotals = totalsOf(rows.map((r) => r.before), beforeRun, days);
  const afterTotals = totalsOf(rows.map((r) => r.after), afterRun, days);

  // Reuse-day marginal economics on the rules-on run.
  const pairReuse: PairReuseEconomics[] = [];
  if (options.reuseEconomics ?? true) {
    for (const entry of afterRun.calendar) {
      if (entry.day > days) break;
      options.onProgress?.(`Marginal economics of pair reuse — day ${entry.day}…`);
      const r = pairReuseEconomicsOf(entry, after);
      if (r) pairReuse.push(r);
    }
  }

  // Persistence-price sweep: same seed, same hidden world, only c_card / c_pair scaled.
  const multipliers = options.persistenceMultipliers ?? [0, 0.5, 1, 2];
  const persistenceSweep: PersistenceSweepRow[] = [];
  for (const m of multipliers) {
    const sc = cloneScenario(after);
    sc.repeatCardSensitivity = roundMoney(after.repeatCardSensitivity * m);
    sc.repeatPairSensitivity = roundMoney(after.repeatPairSensitivity * m);
    options.onProgress?.(`Persistence sweep ${m}× (c_card ${sc.repeatCardSensitivity}, c_pair ${sc.repeatPairSensitivity})…`);
    const run = m === 1 ? afterRun : simulate(createInitialState(sc), sc, "optimize", { realizedThroughDay: days });
    const sides = run.calendar.filter((e) => e.day <= days).map((e) => sideOf(e, sc, run, true));
    const t = totalsOf(sides, run, days);
    persistenceSweep.push({
      multiplier: m,
      cardCoefficient: sc.repeatCardSensitivity,
      pairCoefficient: sc.repeatPairSensitivity,
      throughput: t.throughput,
      transactions: t.transactions,
      continuityAdjustedEv: t.continuityAdjustedEv,
      trueValue: t.trueValue,
      meanHazard: t.meanHazard,
      blockedAmount: t.blockedAmount,
      persistence: t.persistence,
    });
  }

  // Q1: throughput of the previous plan that a hard rule alone rules out. Two components:
  //   (a) second-and-later same-day uses of a card in the previous executed plan (rule 5);
  //   (b) offered core demand that no feasible plan can carry on the day (offer − feasible).
  const ruleFiveAmount = beforeTotals.sameCardTwiceAmount;
  const offerGap = roundMoney(sum(rows.map((r) => Math.max(0, r.after.offeredCoreDemand - r.after.feasibleCoreDemand))));
  const throughputDrop = roundMoney(beforeTotals.throughput - afterTotals.throughput);
  const choiceGap = roundMoney(throughputDrop - offerGap);
  const ruleFiveShare = beforeTotals.throughput > 1e-9 ? ruleFiveAmount / beforeTotals.throughput : 0;
  const dropShare = beforeTotals.throughput > 1e-9 ? throughputDrop / beforeTotals.throughput : 0;

  const top = afterTotals.blockedByRule[0] ?? null;
  const operatingDays = rows.filter((r) => r.before.operating || r.after.operating);
  const differing = operatingDays.filter((r) => r.actionDiffers);
  const invalidDays = rows.filter((r) => r.before.sameCardTwice.length > 0);
  const invalidCards = new Set(invalidDays.flatMap((r) => r.before.sameCardTwice));

  const comparison: BankRulesComparison = {
    days,
    rngSeed: base.rngSeed,
    hiddenWorldSeed: base.hiddenWorldSeed,
    rows,
    before: beforeTotals,
    after: afterTotals,
    persistenceCoefficients: {
      card: after.repeatCardSensitivity,
      pair: after.repeatPairSensitivity,
      w: [after.repeatWeightSameDay, after.repeatWeight7d, after.repeatWeight14d],
      p: [after.pairRepeatWeightPrevDay, after.pairRepeatWeight7d, after.pairRepeatWeight14d],
    },
    pairReuse,
    persistenceSweep,
    answers: {
      infeasibleThroughput: {
        amount: throughputDrop,
        shareOfBefore: dropShare,
        violatingInPreviousPlan: ruleFiveAmount,
        violatingShareOfBefore: ruleFiveShare,
        offerNoFeasiblePlanCouldCarry: offerGap,
        optimizerChoiceInsideFeasibleSet: choiceGap,
        detail:
          `Previous ${days}-day core throughput R${beforeTotals.throughput.toLocaleString("en-ZA")}; with the rules R${afterTotals.throughput.toLocaleString("en-ZA")} ` +
          `(Δ R${throughputDrop.toLocaleString("en-ZA")}, ${(dropShare * 100).toFixed(1)}%). ` +
          `In the previous plan itself, R${ruleFiveAmount.toLocaleString("en-ZA")} (${(ruleFiveShare * 100).toFixed(1)}%) sat on second same-day uses of a card and was therefore not executable under rule 5 ` +
          `(${beforeTotals.sameCardTwiceDays} day(s)); re-planning inside the feasible set recovered most of it by spreading whole tickets across more cards. ` +
          `Of the realized Δ, R${offerGap.toLocaleString("en-ZA")} is offered core demand that no feasible plan could carry on the day (offer − feasible, summed) ` +
          `and R${choiceGap.toLocaleString("en-ZA")} is the optimizer/learner choosing less than the feasible maximum inside the narrower set.`,
      },
      mostBindingRule: {
        rule: top?.rule ?? null,
        label: top?.label ?? "none",
        count: top?.count ?? 0,
        amount: top?.amount ?? 0,
        detail: top
          ? `${top.label} blocked ${top.count} genuine obligation(s) worth R${top.amount.toLocaleString("en-ZA")} over ${days} days. ` +
            afterTotals.blockedByRule.map((r) => `${r.label}: ${r.count} / R${r.amount.toLocaleString("en-ZA")}`).join("; ")
          : "No genuine obligation was blocked by a hard rule in this run.",
      },
      learnerChanged: {
        daysDiffering: differing.length,
        operatingDays: operatingDays.length,
        detail:
          `${differing.length} of ${operatingDays.length} operating day(s) chose a different throughput, card set or POS set once the rules applied` +
          (differing.length > 0 ? ` (days ${differing.map((r) => r.day).join(", ")}).` : ".") +
          ` True value Σ(CA + Δ*): before R${beforeTotals.trueValue.toLocaleString("en-ZA")}, after R${afterTotals.trueValue.toLocaleString("en-ZA")}.` +
          (beforeTotals.cumulativeRegret !== null && afterTotals.cumulativeRegret !== null
            ? ` Cumulative regret vs the θ*-oracle: before R${beforeTotals.cumulativeRegret.toLocaleString("en-ZA")}, after R${afterTotals.cumulativeRegret.toLocaleString("en-ZA")} (the oracle is also restricted to feasible actions after).`
            : ""),
      },
      invalidSameCardCombos: {
        days: invalidDays.length,
        cards: invalidCards.size,
        amount: ruleFiveAmount,
        detail:
          invalidDays.length > 0
            ? `Yes. In the previous run, ${invalidDays.length} day(s) used a card twice in one day across core + organic ` +
              `(cards: ${[...invalidCards].join(", ")}; R${ruleFiveAmount.toLocaleString("en-ZA")} on the second uses). Days: ` +
              invalidDays.map((r) => `${r.weekday} ${r.day} → ${r.before.sameCardTwice.join("/")}`).join("; ") +
              ". With the rules on, no day does."
            : "No. The previous run never used the same card twice in one day across core + organic.",
      },
    },
    runtimeMs: Date.now() - started,
  };
  // Sanity: the after run must never carry a same-card-twice day.
  if (rows.some((r) => r.after.sameCardTwice.length > 0)) {
    comparison.answers.invalidSameCardCombos.detail += " WARNING: the rules-on run still contains a same-card-twice day; this is a bug.";
  }
  return comparison;
}
