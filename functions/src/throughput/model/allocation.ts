import { fillEconomics } from "./economics";
import { formatClock, resolveExogenousOffer, selectTickets } from "./demand";
import { formatZar, hhi, roundMoney, sharesFromWeights, sum } from "./math";
import { resourceMaturity, usableFraction } from "./maturity";
import { expectedReviewDuration, evaluateRisk } from "./risk";
import {
  emptyRolling,
  recordDayOnPairs,
  recordDayOnResources,
} from "./rolling";
import {
  applyScheduledArrivals,
  cloneState,
  downPairKeys,
  maxFeasibleThroughput,
  releaseRecoveredResources,
  upResources,
} from "./state";
import type {
  AllocationPlan,
  BlockedObligation,
  CoreTicket,
  DegradedRoutingDiagnostics,
  PairAllocation,
  PairRecord,
  PairTieBreak,
  PlannedTransaction,
  Resource,
  Scenario,
  SimState,
} from "./types";
import {
  bankRulesOn,
  blockedObligation,
  buildPlannedTransaction,
  checkHardRules,
  dominantBlockingRule,
  ledgerSignature,
  legacyPlannedTransaction,
  organicInvoiceId,
  organicPaymentId,
  usesTodayFromLedger,
  withTicketIdentity,
  type EligibilityContext,
  type EligibilityVerdict,
  type PaymentCandidate,
} from "./bankRules";
import { assessDeltaForPlan, learnerStateSignature } from "./thompson";
import { informationValueForPackedPlan, resourceQueryUncertainty } from "./voi";
import {
  eligibleCards,
  feasibleCovers,
  legalOrganicKeys,
  noteOperatingAllocation,
  targetCardCount,
} from "./coverRules";

export function pairKey(cardId: string, posId: string): string {
  return `${cardId}|${posId}`;
}

export function displayResourceName(id: string, name?: string): string {
  if (name && name.trim().length > 0) return name;
  const [kind, n] = id.split("-");
  if (kind === "card") return `Card ${n}`;
  if (kind === "pos") return `POS ${n}`;
  return id;
}

function pairWeight(card: Resource, pos: Resource, scenario: Scenario): number {
  const cw = usableFraction(resourceMaturity(card, scenario).score);
  const pw = usableFraction(resourceMaturity(pos, scenario).score);
  return Math.max(1e-6, cw) * Math.max(1e-6, pw);
}

export type PairWeightFn = (card: Resource, pos: Resource, scenario: Scenario) => number;

export function defaultPairWeight(card: Resource, pos: Resource, scenario: Scenario): number {
  return pairWeight(card, pos, scenario);
}

function resourceVolumes(
  pairs: PairAllocation[],
  ids: string[],
  pick: (pair: PairAllocation) => string,
): { volumes: number[]; shares: number[] } {
  const volumes = ids.map((id) =>
    roundMoney(sum(pairs.filter((p) => pick(p) === id).map((p) => p.amount))),
  );
  const total = sum(volumes);
  const shares =
    total > 1e-9 ? volumes.map((v) => v / total) : sharesFromWeights(ids.map(() => 1));
  return { volumes, shares };
}

function pairHistory(state: SimState, cardId: string, posId: string): PairRecord | undefined {
  return state.pairs.find((p) => p.cardId === cardId && p.posId === posId);
}

function isNewPair(state: SimState, cardId: string, posId: string): boolean {
  const rec = pairHistory(state, cardId, posId);
  return !rec || rec.lifetimeVolume <= 1e-9;
}

function complexityScore(plan: AllocationPlan, state: SimState): number {
  const pairsUsed = plan.pairs.length;
  const newPairs = plan.pairs.filter((p) => isNewPair(state, p.cardId, p.posId)).length;
  const cardsUsed = new Set(plan.pairs.map((p) => p.cardId)).size;
  const posUsed = new Set(plan.pairs.map((p) => p.posId)).size;
  return pairsUsed * 1_000_000 + newPairs * 10_000 + cardsUsed * 100 + posUsed;
}

function operationalComplexityCostZar(
  plan: AllocationPlan,
  state: SimState,
  scenario: Scenario,
): number {
  const cardsUsed = new Set(plan.pairs.map((p) => p.cardId)).size;
  const extraPairs = Math.max(0, plan.pairs.length - Math.max(1, cardsUsed));
  const newPairs = plan.pairs.filter((p) => isNewPair(state, p.cardId, p.posId)).length;
  const newPos = [...new Set(plan.pairs.map((p) => p.posId))].filter((id) => {
    const pos = state.pos.find((p) => p.id === id);
    return !pos || pos.lifetimeVolume <= 1e-9;
  }).length;
  const posUsed = new Set(plan.pairs.map((p) => p.posId)).size;
  const upPos = upResources(state.pos, state.day).length;
  const collapseCost =
    posUsed === 1 && upPos >= 2 ? Math.max(0, scenario.pairOperatingCostZar) * 10 : 0;
  return (
    extraPairs * Math.max(0, scenario.pairOperatingCostZar) +
    newPairs * Math.max(0, scenario.newPairCostZar) +
    newPos * Math.max(0, scenario.newPosCostZar) +
    collapseCost
  );
}

function hottestPosUseCostZar(
  plan: AllocationPlan,
  state: SimState,
  scenario: Scenario,
  hotId: string | null = hottestPosId(state.pos),
): number {
  if (!hotId || upResources(state.pos, state.day).length < 3) return 0;
  if (!plan.pairs.some((p) => p.posId === hotId)) return 0;
  const pos = state.pos.find((p) => p.id === hotId);
  if (!pos) return 0;
  const streak = pos.rolling.consecutiveActiveDays;
  const active7 = pos.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length;
  if (streak < 4 && active7 < 4) return 0;
  return (streak + active7) * Math.max(0, scenario.hotPosUseCostZar);
}

function hottestPosId(pos: Resource[]): string | null {
  if (pos.length === 0) return null;
  const ranked = pos.slice().sort((a, b) => {
    const a7 = a.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length;
    const b7 = b.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length;
    if (b7 !== a7) return b7 - a7;
    if (b.lifetimeVolume !== a.lifetimeVolume) return b.lifetimeVolume - a.lifetimeVolume;
    return a.id.localeCompare(b.id);
  });
  return ranked[0]?.id ?? null;
}

function ensurePairRecord(state: SimState, cardId: string, posId: string, day: number): PairRecord {
  const existing = pairHistory(state, cardId, posId);
  if (existing) return existing;
  const rec: PairRecord = {
    cardId,
    posId,
    firstActiveDay: day,
    lastUsedDay: day,
    lifetimeVolume: 0,
    lifetimeCount: 0,
    activeTradingDays: 0,
    cleanHistoryDays: 0,
    coreVolume: 0,
    organicVolume: 0,
    rolling: emptyRolling(),
  };
  state.pairs.push(rec);
  return rec;
}

function applyCoverRollingDay(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  observed: number,
): void {
  const ticketsTotal = scenario.avgTicketZar > 0 ? observed / scenario.avgTicketZar : 0;
  const volumeById: Record<string, number> = {};
  const ticketsById: Record<string, number> = {};
  for (let i = 0; i < plan.cardIds.length; i++) {
    const id = plan.cardIds[i]!;
    volumeById[id] = (volumeById[id] ?? 0) + (plan.cardVolumes[i] ?? 0);
  }
  for (let i = 0; i < plan.posIds.length; i++) {
    const id = plan.posIds[i]!;
    volumeById[id] = (volumeById[id] ?? 0) + (plan.posVolumes[i] ?? 0);
  }
  for (const id of Object.keys(volumeById)) {
    ticketsById[id] = observed > 0 ? ticketsTotal * ((volumeById[id] ?? 0) / observed) : 0;
  }
  for (const resource of [...state.cards, ...state.pos]) {
    const vol = volumeById[resource.id] ?? 0;
    if (vol > 1e-9) {
      resource.lifetimeVolume += vol;
      resource.activeTradingDays += 1;
    }
  }
  recordDayOnResources(state.cards, volumeById, ticketsById);
  recordDayOnResources(state.pos, volumeById, ticketsById);
  const pairVolume: Record<string, number> = {};
  const pairCount: Record<string, number> = {};
  for (const pair of plan.pairs) {
    const rec = ensurePairRecord(state, pair.cardId, pair.posId, state.day);
    rec.lifetimeVolume += pair.amount;
    rec.activeTradingDays += 1;
    rec.lastUsedDay = state.day;
    const key = pairKey(pair.cardId, pair.posId);
    pairVolume[key] = pair.amount;
    pairCount[key] = observed > 0 ? ticketsTotal * (pair.amount / observed) : 0;
  }
  for (const rec of state.pairs) {
    const key = pairKey(rec.cardId, rec.posId);
    if (!(key in pairVolume)) {
      pairVolume[key] = 0;
      pairCount[key] = 0;
    }
  }
  recordDayOnPairs(state.pairs, pairVolume, pairCount);
  noteOperatingAllocation(state, plan);
  if (bankRulesOn(scenario)) {
    // Held-cover projection: one transaction per pair so repeat-card features evolve over the hold.
    const cardsById = new Map(state.cards.map((c) => [c.id, c]));
    for (const pair of plan.pairs) {
      if (pair.amount <= 1e-9) continue;
      state.bankLedger.push({
        day: state.day,
        economicPaymentId: `hold:${state.day}:${pair.cardId}|${pair.posId}`,
        cardId: pair.cardId,
        posId: pair.posId,
        amount: pair.amount,
        source: "core",
        cardOrigin: cardsById.get(pair.cardId)?.cardOrigin ?? "international",
        highValue: pair.amount > scenario.highValueThresholdZar,
      });
    }
  }
}

function continuationPlan(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  weightFn: PairWeightFn,
  source: PairAllocation["source"],
): AllocationPlan {
  const cards = upResources(state.cards, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const pos = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const keys of feasibleCovers(state, scenario, throughput, cards, pos)) {
    const plan = allocatePairsOnKeys(state, scenario, throughput, weightFn, source, keys);
    if (sum(plan.pairs.map((p) => p.amount)) >= throughput - 0.05) return plan;
  }
  return allocatePairsOnKeys(state, scenario, throughput, weightFn, source);
}

export interface CoverHoldDetail {
  /** Σ_t [myopic EV − hot-POS cost + Δ̃ / IV] − first-day complexity cost. The cover-ranking Q. */
  score: number;
  /** First-day operational complexity cost K(a) (new pair / new POS / extra pair). */
  firstCost: number;
  /** Day-0 components. */
  day0MyopicEv: number;
  day0Hazard: number;
  day0Delta: number;
  day0ExpectedContinuityCost: number;
  day0GrossProfit: number;
  /** Day-0 provisional persistence factors on the realized packed plan. */
  day0CardRepeatFactor: number;
  day0PairRepeatFactor: number;
}

function coverHoldScore(
  state: SimState,
  scenario: Scenario,
  keys: Set<string>,
  throughput: number,
  weightFn: PairWeightFn,
  source: PairAllocation["source"],
  firstPacked?: AllocationPlan,
  firstTransactions: PlannedTransaction[] = [],
  economicBestQ = Number.NEGATIVE_INFINITY,
): number {
  return coverHoldDetail(state, scenario, keys, throughput, weightFn, source, firstPacked, firstTransactions, economicBestQ).score;
}

function coverHoldDetail(
  state: SimState,
  scenario: Scenario,
  keys: Set<string>,
  throughput: number,
  weightFn: PairWeightFn,
  source: PairAllocation["source"],
  firstPacked?: AllocationPlan,
  firstTransactions: PlannedTransaction[] = [],
  economicBestQ = Number.NEGATIVE_INFINITY,
): CoverHoldDetail {
  const infeasible: CoverHoldDetail = {
    score: Number.NEGATIVE_INFINITY,
    firstCost: 0,
    day0MyopicEv: 0,
    day0Hazard: 0,
    day0Delta: 0,
    day0ExpectedContinuityCost: 0,
    day0GrossProfit: 0,
    day0CardRepeatFactor: 1,
    day0PairRepeatFactor: 1,
  };
  const horizon = fastCoverSearch
    ? 1
    : Math.max(
        1,
        Math.min(8, scenario.useLookahead ? Math.max(1, scenario.lookaheadDays) : 7),
      );
  const durations = expectedReviewDuration(scenario);
  const cursor = cloneState(state);
  const hotId = hottestPosId(state.pos);
  let value = 0;
  let firstCost = 0;
  const day0 = { ...infeasible };
  for (let t = 0; t < horizon; t++) {
    if (t > 0) {
      cursor.day += 1;
      applyScheduledArrivals(cursor, scenario);
      releaseRecoveredResources(cursor);
    }
    const plan =
      t === 0 && firstPacked
        ? firstPacked
        : t > 0 && scenario.coverMixEnabled
          ? continuationPlan(cursor, scenario, throughput, weightFn, source)
          : allocatePairsOnKeys(cursor, scenario, throughput, weightFn, source, keys);
    const allocated = sum(plan.pairs.map((p) => p.amount));
    const need = t === 0 && firstPacked ? sum(firstPacked.pairs.map((p) => p.amount)) : throughput;
    if (t === 0 && allocated < need - 0.05 && need > 1e-9) return infeasible;
    if (t === 0) firstCost = operationalComplexityCostZar(plan, cursor, scenario);
    const scoredThroughput = Math.max(allocated, need);
    const risk = evaluateRisk(cursor, scenario, scoredThroughput, plan);
    const econ = fillEconomics(cursor, scenario, scoredThroughput, risk, durations, { activity: plan.pairs });
    value += econ.myopicEv - hottestPosUseCostZar(plan, cursor, scenario, hotId);
    if (t === 0) {
      day0.day0MyopicEv = econ.myopicEv;
      day0.day0Hazard = risk.hazard;
      day0.day0ExpectedContinuityCost = econ.expectedContinuityCost;
      day0.day0GrossProfit = econ.grossProfit;
      day0.day0CardRepeatFactor = risk.bankFeatures.repeatCardFactor;
      day0.day0PairRepeatFactor = risk.bankFeatures.repeatPairFactor;
    }
    if (scenario.economicLearnerEnabled) {
      // Thompson: the held cover is scored under the sampled model on every day of the
      // hold, Σ_t [Q_base + Δ_G(θ̃)], so Δ̃ competes with the structural gap on equal
      // footing. Replaces the VOI bonus.
      const adj = assessDeltaForPlan(cursor, scenario, plan, t === 0 ? firstTransactions : []).decisionAdjustment;
      value += adj;
      if (t === 0) day0.day0Delta = adj;
    } else if (t === 0 && scenario.valueOfInformationEnabled) {
      value += informationValueForPackedPlan(
        cursor,
        scenario,
        plan,
        firstTransactions,
        scoredThroughput,
        risk.concentration.expectedCapacityLost,
        risk.hazard,
        econ.myopicEv,
        Number.isFinite(economicBestQ) ? economicBestQ : econ.myopicEv,
      ).total;
    }
    applyCoverRollingDay(cursor, scenario, plan, scoredThroughput);
  }
  return { ...day0, score: value - firstCost, firstCost };
}

export interface CoverAlternative extends CoverHoldDetail {
  keys: string[];
  plan: AllocationPlan;
  transactions: PlannedTransaction[];
  /** Pairs in this cover's realized plan that were also used on the previous operating day. */
  incumbentPairs: string[];
  /** Cards in this cover's realized plan that were also used on the previous operating day. */
  incumbentCards: string[];
}

/**
 * Diagnostic: score every candidate cover for `tickets` exactly as allocateSparsePairs does
 * (same enumeration, same feasibility filter, same held-cover Q), and report which covers reuse
 * a pair / card from the previous operating day. Used to show the marginal economics of reuse:
 *   Q(reuse incumbent pair) vs Q(best alternative feasible cover with no incumbent pair).
 * Does not touch the cover memo and does not change the decision path.
 */
export function coverAlternatives(
  state: SimState,
  scenario: Scenario,
  tickets: CoreTicket[],
  incumbentPairKeys: Set<string>,
  incumbentCardIds: Set<string>,
): CoverAlternative[] {
  const cards = upResources(state.cards, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const pos = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const target = roundMoney(sum(tickets.map((t) => t.amount)));
  if (cards.length === 0 || pos.length === 0 || target <= 1e-9) return [];
  const enumerated = (scenario.coverMixEnabled
    ? feasibleCovers(state, scenario, target, cards, pos)
    : enumerateCovers(cards, pos, state, scenario)
  ).filter((keys) => keys.size <= tickets.length); // packCoreTickets passes maxPairs = tickets.length
  const rankAt = Math.min(
    maxFeasibleThroughput(state, scenario),
    Math.max(target, Math.min(20_000, maxFeasibleThroughput(state, scenario))),
  );
  const durations = expectedReviewDuration(scenario);
  const rules = bankRulesOn(scenario);
  const prePacked = enumerated.map((keys) => {
    const packed = packTicketsOnKeys(state, scenario, tickets, keys);
    return { keys, packed, allocated: sum(packed.plan.pairs.map((p) => p.amount)) };
  });
  const bestAllocated = rules ? Math.max(0, ...prePacked.map((r) => r.allocated)) : target;
  const rows: Array<{ keys: Set<string>; packed: PackedCore; econ: number }> = [];
  for (const { keys, packed, allocated } of prePacked) {
    if (allocated < bestAllocated - 0.05 || allocated <= 1e-9) continue;
    const risk = evaluateRisk(state, scenario, allocated, packed.plan);
    rows.push({ keys, packed, econ: fillEconomics(state, scenario, allocated, risk, durations, { activity: packed.plan.pairs }).myopicEv });
  }
  if (rows.length === 0) return [];
  const economicBestQ = Math.max(...rows.map((r) => r.econ));
  return rows.map((row) => {
    const detail = coverHoldDetail(state, scenario, row.keys, rankAt, defaultPairWeight, "core", row.packed.plan, row.packed.transactions, economicBestQ);
    const usedPairs = row.packed.plan.pairs.filter((p) => p.amount > 1e-9);
    return {
      ...detail,
      keys: [...row.keys].sort(),
      plan: row.packed.plan,
      transactions: row.packed.transactions,
      incumbentPairs: usedPairs.map((p) => pairKey(p.cardId, p.posId)).filter((k) => incumbentPairKeys.has(k)).sort(),
      incumbentCards: [...new Set(usedPairs.map((p) => p.cardId))].filter((c) => incumbentCardIds.has(c)).sort(),
    };
  });
}

function rankResources(resources: Resource[], rule: PairTieBreak): Resource[] {
  return resources.slice().sort((a, b) => {
    if (rule === "history") {
      if (b.lifetimeVolume !== a.lifetimeVolume) return b.lifetimeVolume - a.lifetimeVolume;
      if (b.activeTradingDays !== a.activeTradingDays) return b.activeTradingDays - a.activeTradingDays;
    } else if (rule === "low-dependency") {
      const a7 = a.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length;
      const b7 = b.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length;
      if (a7 !== b7) return a7 - b7;
      if (b.rolling.daysSinceLastUse !== a.rolling.daysSinceLastUse) {
        return b.rolling.daysSinceLastUse - a.rolling.daysSinceLastUse;
      }
    }
    return a.id.localeCompare(b.id);
  });
}

function cartesianKeys(cards: Resource[], pos: Resource[]): Set<string> {
  return new Set(cards.flatMap((c) => pos.map((p) => pairKey(c.id, p.id))));
}

function roundRobinKeys(cards: Resource[], pos: Resource[], offset = 0): Set<string> {
  if (cards.length === 0 || pos.length === 0) return new Set();
  return new Set(cards.map((card, i) => pairKey(card.id, pos[(i + offset) % pos.length]!.id)));
}

function matchingKeys(cards: Resource[], pos: Resource[]): Set<string> {
  const n = Math.min(cards.length, pos.length);
  return new Set(Array.from({ length: n }, (_, i) => pairKey(cards[i]!.id, pos[i]!.id)));
}

function enumerateCovers(cards: Resource[], pos: Resource[], state: SimState, scenario: Scenario): Set<string>[] {
  const covers: Set<string>[] = [];
  const seen = new Set<string>();
  // Pair-scoped interruptions (event-based loss model) make a relationship unusable; a cover
  // that includes it is trimmed to its usable pairs.
  const down = downPairKeys(state);
  const push = (raw: Set<string>) => {
    const keys = down.size === 0 ? raw : new Set([...raw].filter((k) => !down.has(k)));
    if (keys.size === 0) return;
    const sig = [...keys].sort().join(",");
    if (seen.has(sig)) return;
    seen.add(sig);
    covers.push(keys);
  };

  const rankedCards = rankResources(cards, scenario.pairTieBreak);
  const rankedPos = rankResources(pos, scenario.pairTieBreak);
  const idCards = cards.slice().sort((a, b) => a.id.localeCompare(b.id));
  const idPos = pos.slice().sort((a, b) => a.id.localeCompare(b.id));
  const weightOf = (card: Resource, p: Resource) => defaultPairWeight(card, p, scenario);
  let bestCard = rankedCards[0];
  let bestPos = rankedPos[0];
  let bestW = -1;
  for (const card of rankedCards) {
    for (const p of rankedPos) {
      const hist = pairHistory(state, card.id, p.id);
      const historyBonus =
        scenario.pairTieBreak === "history" && hist && hist.lifetimeVolume > 0 ? 1e-3 : 0;
      const w = weightOf(card, p) + historyBonus;
      if (w > bestW) {
        bestW = w;
        bestCard = card;
        bestPos = p;
      }
    }
  }
  if (bestCard && bestPos) push(new Set([pairKey(bestCard.id, bestPos.id)]));

  const pushPrefixes = (cs: Resource[], ps: Resource[]) => {
    for (let k = 1; k <= Math.max(cs.length, ps.length); k++) {
      const cSlice = cs.slice(0, Math.min(k, cs.length));
      const pSlice = ps.slice(0, Math.min(k, ps.length));
      // Every POS offset of the round robin: the same card set on a rotated card→POS assignment,
      // so on full-utilisation days the optimizer has a candidate that changes the relationship
      // (pair) without changing the cards. Offset 0 is the historical ranking order.
      for (let offset = 0; offset < pSlice.length; offset++) push(roundRobinKeys(cSlice, pSlice, offset));
      push(matchingKeys(cSlice, pSlice));
    }
    for (let kp = 1; kp <= ps.length; kp++) {
      const pSlice = ps.slice(0, kp);
      for (let offset = 0; offset < pSlice.length; offset++) push(roundRobinKeys(cs, pSlice, offset));
    }
  };
  pushPrefixes(rankedCards, rankedPos);
  const hotId = hottestPosId(rankedPos);
  if (hotId && rankedPos.length > 1) {
    pushPrefixes(
      rankedCards,
      rankedPos.filter((p) => p.id !== hotId),
    );
  }
  if (scenario.pairTieBreak === "history") {
    pushPrefixes(idCards, idPos);
  }
  push(cartesianKeys(rankedCards, rankedPos));

  for (const card of idCards) {
    for (const p of idPos) {
      push(new Set([pairKey(card.id, p.id)]));
    }
  }

  // Two-card covers: with the learner on every card is a legitimate candidate (the posterior
  // decides); otherwise only cards the kernel evidence still treats as unobserved.
  const unobservedCards = scenario.economicLearnerEnabled
    ? idCards
    : idCards.filter((c) => {
        const skeleton = allocatePairsOnKeys(state, scenario, Math.max(1, scenario.avgTicketZar), defaultPairWeight, "core", new Set([pairKey(c.id, idPos[0]?.id ?? "pos-1")]));
        return resourceQueryUncertainty(c, state, scenario, skeleton) > 0.45;
      });
  for (let i = 0; i < unobservedCards.length; i++) {
    const c1 = unobservedCards[i]!;
    for (const c2 of idCards) {
      if (c1.id === c2.id) continue;
      if (c2.id < c1.id && unobservedCards.some((c) => c.id === c2.id)) continue;
      const posForPairs = idPos.slice(0, Math.min(2, idPos.length));
      for (const p of posForPairs) {
        push(new Set([pairKey(c1.id, p.id), pairKey(c2.id, p.id)]));
      }
      if (idPos.length >= 2) {
        push(new Set([pairKey(c1.id, idPos[0]!.id), pairKey(c2.id, idPos[1]!.id)]));
        push(new Set([pairKey(c1.id, idPos[1]!.id), pairKey(c2.id, idPos[0]!.id)]));
      }
    }
  }

  return covers;
}

let sparseCoverMemo = { sig: "", keys: null as Set<string> | null };
let fastCoverSearch = false;

export function withFastCoverSearch<T>(fn: () => T): T {
  const prev = fastCoverSearch;
  fastCoverSearch = true;
  try {
    return fn();
  } finally {
    fastCoverSearch = prev;
  }
}

function coverSignature(state: SimState, scenario: Scenario): string {
  return [
    state.day,
    state.cards.length,
    state.pos.length,
    state.pairs.length,
    Math.round(state.merchantLifetimeVolume),
    scenario.concentrationModel,
    scenario.pairTieBreak,
    scenario.includePersistenceInHazard ? "p" : "v",
    `critP:${scenario.criticalPersistenceSensitivity ?? 0}`,
    `beta:${scenario.degradedMaxPosShare ?? "off"}`,
    scenario.pairOperatingCostZar,
    scenario.newPairCostZar,
    scenario.newPosCostZar,
    scenario.hotPosUseCostZar,
    scenario.coverMixEnabled ? "mix" : "nomix",
    scenario.coverThinThroughputZar,
    scenario.coverFatThroughputZar,
    scenario.coverMaxConsecutiveOperatingDays,
    (state.lastOperatingPairKeys ?? []).join(","),
    state.cards.map((c) => `${c.id}:${c.consecutiveOperatingActiveDays ?? 0}`).join(","),
    scenario.valueOfInformationEnabled ? "voi" : "novoi",
    scenario.voiConfigurationEnabled ? "cfg" : "nocfg",
    state.observations.length,
    learnerStateSignature(state, scenario),
    scenario.usePosteriorContinuityCalibration ? `cal:${state.continuity.hits}/${state.continuity.exposure.toFixed(4)}` : "nocal",
    state.cards.map((c) => `${c.id}:${c.coreTransactionCount}`).join(","),
    state.pos.map((p) => `${p.id}:${p.coreTransactionCount}`).join(","),
    ledgerSignature(state, scenario),
    scenario.maxEligiblePurchasesPerCardPerDay,
    scenario.requiresPinPresent ? "pin" : "nopin",
    scenario.repeatedAmountPolicy,
    `bf:${scenario.highValueSensitivity}/${scenario.repeatCardSensitivity}/${scenario.repeatPairSensitivity}/${scenario.localMixSensitivity}`,
    `rw:${scenario.repeatWeightSameDay}/${scenario.repeatWeight7d}/${scenario.repeatWeight14d}/${scenario.pairRepeatWeightPrevDay}/${scenario.pairRepeatWeight7d}/${scenario.pairRepeatWeight14d}`,
    resolveExogenousOffer(state, scenario).mode,
    // Interruption-loss model: cover ranking under eventBased depends on availability, locks and backlog.
    scenario.lossModel,
    [...state.cards, ...state.pos].map((r) => `${r.downUntilDay ?? 0}:${Math.round(r.frozenCapital)}`).join(","),
    state.pairs.filter((p) => (p.downUntilDay ?? 0) > state.day).map((p) => `${p.cardId}|${p.posId}`).join(","),
    (state.backlog ?? []).map((t) => `${t.economicPaymentId}:${t.deferrals}`).join(","),
    scenario.lossModel === "eventBased"
      ? `${Object.values(scenario.lossDomainProbabilities).join("/")}|${scenario.deferralCostDailyRate}|${scenario.rerouteCostPerTicketZar}|${scenario.ticketMaxDeferralOperatingDays}|${scenario.settlementLagDays}|${Object.values(scenario.eventLossAblation).map((v) => (v ? 1 : 0)).join("")}`
      : "",
  ].join("|");
}

/**
 * Water-fill a chosen daily total over an optional pair subset.
 * Weight of pair (i,j) = usableFraction(card_i) × usableFraction(POS_j), then
 * physical caps.
 */
export function allocatePairsOnKeys(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  weightFn: PairWeightFn = defaultPairWeight,
  source: PairAllocation["source"] = "core",
  allowedKeys?: Set<string>,
): AllocationPlan {
  const cards = upResources(state.cards, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const pos = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const cardIds = cards.map((c) => c.id);
  const posIds = pos.map((p) => p.id);

  const skeleton: AllocationPlan = {
    pairs: [],
    cardIds,
    posIds,
    cardVolumes: cardIds.map(() => 0),
    posVolumes: posIds.map(() => 0),
        cardShares: sharesFromWeights(cards.map((c) => weightFn(c, pos[0] ?? c, scenario))),
        posShares: sharesFromWeights(pos.map((p) => weightFn(cards[0] ?? p, p, scenario))),
    pairHhi: 1,
    largestPairShare: 1,
    transactionCount: 0,
  };

  if (cards.length === 0 || pos.length === 0) {
    return { ...skeleton, cardShares: [], posShares: [] };
  }

  const rawPairs = cards
    .flatMap((card) =>
      pos.map((p) => ({
        card,
        pos: p,
        weight: weightFn(card, p, scenario),
      })),
    )
    .filter((p) => !allowedKeys || allowedKeys.has(pairKey(p.card.id, p.pos.id)));

  if (throughput <= 0) {
    const weights = rawPairs.map((p) => p.weight);
    const pairShares = sharesFromWeights(weights);
    const cardWeights = cardIds.map((id) =>
      sum(rawPairs.filter((p) => p.card.id === id).map((p) => p.weight)),
    );
    const posWeights = posIds.map((id) =>
      sum(rawPairs.filter((p) => p.pos.id === id).map((p) => p.weight)),
    );
    return {
      pairs: [],
      cardIds,
      posIds,
      cardVolumes: cardIds.map(() => 0),
      posVolumes: posIds.map(() => 0),
      cardShares: sharesFromWeights(cardWeights),
      posShares: sharesFromWeights(posWeights),
      pairHhi: hhi(pairShares),
      largestPairShare: pairShares.length ? Math.max(...pairShares) : 1,
      transactionCount: 0,
    };
  }

  const cardRoom: Record<string, number> = Object.fromEntries(
    cards.map((c) => [c.id, scenario.perCardCapacityZar]),
  );
  const posRoom: Record<string, number> = Object.fromEntries(
    pos.map((p) => [p.id, scenario.perPosCapacityZar]),
  );
  const assigned: Record<string, number> = Object.fromEntries(
    rawPairs.map((p) => [pairKey(p.card.id, p.pos.id), 0]),
  );

  let remaining = throughput;
  const blocked = new Set<string>();

  for (let iter = 0; iter < 24 && remaining > 1e-6; iter++) {
    const eligible = rawPairs.filter((p) => {
      const key = pairKey(p.card.id, p.pos.id);
      return (
        !blocked.has(key) &&
        (cardRoom[p.card.id] ?? 0) > 1e-6 &&
        (posRoom[p.pos.id] ?? 0) > 1e-6
      );
    });
    if (eligible.length === 0) break;
    const wsum = sum(eligible.map((p) => p.weight));
    if (wsum <= 0) break;

    const proposals = eligible.map((p) => {
      const room = Math.min(cardRoom[p.card.id] ?? 0, posRoom[p.pos.id] ?? 0);
      const add = Math.min(remaining * (p.weight / wsum), room);
      return { p, add };
    });

    let progressed = 0;
    for (const { p, add } of proposals) {
      const key = pairKey(p.card.id, p.pos.id);
      if (add <= 1e-8) {
        blocked.add(key);
        continue;
      }
      assigned[key] = (assigned[key] ?? 0) + add;
      cardRoom[p.card.id] = (cardRoom[p.card.id] ?? 0) - add;
      posRoom[p.pos.id] = (posRoom[p.pos.id] ?? 0) - add;
      remaining -= add;
      progressed += add;
      if ((cardRoom[p.card.id] ?? 0) <= 1e-6 || (posRoom[p.pos.id] ?? 0) <= 1e-6) {
        blocked.add(key);
      }
    }
    if (progressed <= 1e-8) break;
  }

  if (remaining > 0.005) {
    const dumpEligible = rawPairs.filter((p) => {
      const room = Math.min(cardRoom[p.card.id] ?? 0, posRoom[p.pos.id] ?? 0);
      return room > 1e-6;
    });
    const dumpW = sum(dumpEligible.map((p) => p.weight));
    if (dumpW > 0) {
      const leftover = remaining;
      for (const p of dumpEligible) {
        const key = pairKey(p.card.id, p.pos.id);
        const room = Math.min(cardRoom[p.card.id] ?? 0, posRoom[p.pos.id] ?? 0);
        const add = Math.min(leftover * (p.weight / dumpW), room);
        assigned[key] = (assigned[key] ?? 0) + add;
        remaining -= add;
      }
    }
  }

  let pairs: PairAllocation[] = rawPairs
    .map((p) => {
      const amount = roundMoney(assigned[pairKey(p.card.id, p.pos.id)] ?? 0);
      const cm = resourceMaturity(p.card, scenario);
      const pm = resourceMaturity(p.pos, scenario);
      return {
        cardId: p.card.id,
        posId: p.pos.id,
        cardName: p.card.name,
        posName: p.pos.name,
        amount,
        share: 0,
        weight: p.weight,
        cardMaturity: cm.score,
        posMaturity: pm.score,
        cardCategory: cm.category,
        posCategory: pm.category,
        source,
      };
    })
    .filter((p) => p.amount > 0);

  const allocated = roundMoney(sum(pairs.map((p) => p.amount)));
  const drift = roundMoney(throughput - allocated);
  if (pairs.length > 0 && Math.abs(drift) >= 0.01) {
    const last = pairs[pairs.length - 1]!;
    last.amount = roundMoney(last.amount + drift);
  }
  pairs = pairs.filter((p) => p.amount > 0);
  const total = sum(pairs.map((p) => p.amount)) || 1;
  for (const p of pairs) p.share = p.amount / total;

  const byCard = resourceVolumes(pairs, cardIds, (x) => x.cardId);
  const byPos = resourceVolumes(pairs, posIds, (x) => x.posId);
  const pairShares = pairs.map((p) => p.share);

  return {
    pairs,
    cardIds,
    posIds,
    cardVolumes: byCard.volumes,
    posVolumes: byPos.volumes,
    cardShares: byCard.shares,
    posShares: byPos.shares,
    pairHhi: hhi(pairShares.length ? pairShares : [1]),
    largestPairShare: pairShares.length ? Math.max(...pairShares) : 1,
    transactionCount: 0,
  };
}

export function allocateSparsePairs(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  weightFn: PairWeightFn = defaultPairWeight,
  source: PairAllocation["source"] = "core",
  options?: { maxPairs?: number; tickets?: CoreTicket[] },
): AllocationPlan {
  if (throughput <= 1e-9) {
    return allocatePairsOnKeys(state, scenario, throughput, weightFn, source);
  }

  const cards = upResources(state.cards, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const pos = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (cards.length === 0 || pos.length === 0) {
    return allocatePairsOnKeys(state, scenario, throughput, weightFn, source);
  }

  const tickets = options?.tickets ?? selectTickets(resolveExogenousOffer(state, scenario).coreTickets, throughput);
  const target = roundMoney(sum(tickets.map((t) => t.amount)));
  if (target <= 1e-9) {
    return allocatePairsOnKeys(state, scenario, 0, weightFn, source);
  }

  const maxPairs = options?.maxPairs ?? Number.POSITIVE_INFINITY;
  const ticketSig = tickets.map((t) => `${t.amount}:${t.timeMinutes}`).join(",");
  const sig = `${coverSignature(state, scenario)}|${source}|${weightFn === defaultPairWeight ? "d" : "w"}|${Number.isFinite(maxPairs) ? maxPairs : "n"}|${ticketSig}`;
  const memoHit = sparseCoverMemo.sig === sig ? sparseCoverMemo.keys : null;
  if (memoHit && memoHit.size <= maxPairs) {
    const packed = packTicketsOnKeys(state, scenario, tickets, memoHit);
    if (sum(packed.plan.pairs.map((p) => p.amount)) >= target - 0.05) return packed.plan;
  }

  const enumerated = scenario.coverMixEnabled
    ? feasibleCovers(state, scenario, target, cards, pos)
    : enumerateCovers(cards, pos, state, scenario);
  const covers = enumerated.filter((keys) => keys.size <= maxPairs);
  const search = covers.length > 0 ? covers : enumerated.filter((keys) => keys.size === 1);
  const rankAt = Math.min(
    maxFeasibleThroughput(state, scenario),
    Math.max(target, Math.min(20_000, maxFeasibleThroughput(state, scenario))),
  );

  const packedRows: Array<{
    plan: AllocationPlan;
    keys: Set<string>;
    transactions: PlannedTransaction[];
    econ: number;
  }> = [];
  const durations = expectedReviewDuration(scenario);
  const rules = bankRulesOn(scenario);
  // With the feasibility layer on, the hard rules may make the full target unpackable on every
  // cover (e.g. more genuine tickets than eligible cards). Covers are then compared on the
  // largest feasible packed amount rather than discarded; the shortfall is reported as blocked.
  const prePacked = search.map((keys) => {
    const packed = packTicketsOnKeys(state, scenario, tickets, keys);
    return { keys, packed, allocated: sum(packed.plan.pairs.map((p) => p.amount)) };
  });
  const bestAllocated = rules ? Math.max(0, ...prePacked.map((r) => r.allocated)) : target;
  for (const { keys, packed, allocated } of prePacked) {
    if (allocated < bestAllocated - 0.05) continue;
    if (allocated <= 1e-9) continue;
    if (scenario.coverMixEnabled) {
      const usedCards = new Set(packed.plan.pairs.map((p) => p.cardId)).size;
      const want = Math.min(
        targetCardCount(target, scenario),
        eligibleCards(cards, scenario).length,
        tickets.length,
      );
      if (want >= 2 && usedCards < want) continue;
    }
    const risk = evaluateRisk(state, scenario, allocated, packed.plan);
    const econ = fillEconomics(state, scenario, allocated, risk, durations, { activity: packed.plan.pairs }).myopicEv;
    packedRows.push({ plan: packed.plan, keys, transactions: packed.transactions, econ });
  }

  if (packedRows.length === 0) {
    const mixKeys = scenario.coverMixEnabled
      ? feasibleCovers(state, scenario, target, cards, pos)[0]
      : null;
    const denseKeys = mixKeys && mixKeys.size > 0 ? mixKeys : cartesianKeys(cards, pos);
    const packed = packTicketsOnKeys(state, scenario, tickets, denseKeys);
    sparseCoverMemo = { sig, keys: denseKeys };
    return packed.plan.pairs.length > 0 ? packed.plan : allocatePairsOnKeys(state, scenario, target, weightFn, source);
  }

  const economicBestQ = Math.max(...packedRows.map((r) => r.econ));
  const scored = packedRows.map((row) => ({
    ...row,
    complexity: complexityScore(row.plan, state),
    score: coverHoldScore(
      state,
      scenario,
      row.keys,
      rankAt,
      weightFn,
      source,
      row.plan,
      row.transactions,
      economicBestQ,
    ),
  }));

  let best = scored[0]!;
  for (const row of scored) {
    if (row.score > best.score + 1e-9) {
      best = row;
      continue;
    }
    if (row.score < best.score - 1e-9) continue;
    if (row.complexity < best.complexity) {
      best = row;
      continue;
    }
    // Equal score and complexity: keep the earlier-enumerated cover. Enumeration order encodes
    // the pairTieBreak ranking (offset 0 of the round robin = ranking order), so a rotated
    // assignment only wins when its held-cover value is strictly higher.
  }

  sparseCoverMemo = { sig, keys: best.keys };
  return best.plan;
}

/**
 * Deterministic card×POS allocation of a chosen daily total V.
 * Chooses the cover with the highest multi-day held-cover EV net of
 * first-day operational complexity cost. Installed POS/cards are optional
 * capacity — a cover need not touch every device, and a new device is used
 * only when that path value exceeds the complexity cost.
 */
export function allocatePairs(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  weightFn: PairWeightFn = defaultPairWeight,
  source: PairAllocation["source"] = "core",
): AllocationPlan {
  return allocateSparsePairs(state, scenario, throughput, weightFn, source);
}

function allocateOntoPreferredKeys(
  state: SimState,
  scenario: Scenario,
  amount: number,
  weightFn: PairWeightFn,
  source: PairAllocation["source"],
  preferKeys: Set<string>,
): AllocationPlan {
  if (amount <= 1e-9) {
    return allocatePairsOnKeys(state, scenario, 0, weightFn, source);
  }
  const prefer = legalOrganicKeys(
    state,
    scenario,
    upResources(state.cards, state.day),
    upResources(state.pos, state.day),
    preferKeys,
  );
  if (prefer.size === 0) {
    return allocatePairsOnKeys(state, scenario, 0, weightFn, source);
  }
  const ranked = [...prefer].sort((a, b) => {
    if (scenario.pairTieBreak === "history") {
      const [ac, ap] = a.split("|") as [string, string];
      const [bc, bp] = b.split("|") as [string, string];
      const ha = pairHistory(state, ac, ap)?.lifetimeVolume ?? 0;
      const hb = pairHistory(state, bc, bp)?.lifetimeVolume ?? 0;
      if (hb !== ha) return hb - ha;
    } else if (scenario.pairTieBreak === "low-dependency") {
      const [ac, ap] = a.split("|") as [string, string];
      const [bc, bp] = b.split("|") as [string, string];
      const pa = state.pos.find((p) => p.id === ap);
      const pb = state.pos.find((p) => p.id === bp);
      const a7 = pa?.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length ?? 0;
      const b7 = pb?.rolling.volumes.slice(-7).filter((v) => v > 1e-9).length ?? 0;
      if (a7 !== b7) return a7 - b7;
    }
    return a.localeCompare(b);
  });
  for (const n of [1, 2]) {
    if (ranked.length < n) continue;
    const keys = new Set(ranked.slice(0, n));
    const plan = allocatePairsOnKeys(state, scenario, amount, weightFn, source, keys);
    if (sum(plan.pairs.map((p) => p.amount)) >= amount - 0.05) return plan;
  }
  if (prefer.size > 0) {
    const plan = allocatePairsOnKeys(state, scenario, amount, weightFn, source, prefer);
    if (sum(plan.pairs.map((p) => p.amount)) >= amount - 0.05) return plan;
    return plan;
  }
  return allocatePairsOnKeys(state, scenario, 0, weightFn, source);
}

export function mergeAllocationPlans(plans: AllocationPlan[]): AllocationPlan {
  const nonempty = plans.filter((p) => p.cardIds.length + p.posIds.length > 0);
  const base = nonempty[0];
  if (!base) {
    return {
      pairs: [],
      cardIds: [],
      posIds: [],
      cardVolumes: [],
      posVolumes: [],
      cardShares: [],
      posShares: [],
      pairHhi: 1,
      largestPairShare: 1,
      transactionCount: 0,
    };
  }
  const cardIds = [...new Set(nonempty.flatMap((p) => p.cardIds))];
  const posIds = [...new Set(nonempty.flatMap((p) => p.posIds))];
  const byKey = new Map<string, PairAllocation>();
  for (const plan of nonempty) {
    for (const pair of plan.pairs) {
      const key = pairKey(pair.cardId, pair.posId);
      const existing = byKey.get(key);
      if (existing) {
        existing.amount = roundMoney(existing.amount + pair.amount);
        existing.weight += pair.weight;
        if (existing.source !== pair.source) existing.source = "core";
      } else {
        byKey.set(key, { ...pair });
      }
    }
  }
  const pairs = [...byKey.values()].filter((p) => p.amount > 0);
  const total = sum(pairs.map((p) => p.amount)) || 1;
  for (const p of pairs) p.share = p.amount / total;
  const byCard = resourceVolumes(pairs, cardIds, (x) => x.cardId);
  const byPos = resourceVolumes(pairs, posIds, (x) => x.posId);
  const pairShares = pairs.map((p) => p.share);
  return {
    pairs,
    cardIds,
    posIds,
    cardVolumes: byCard.volumes,
    posVolumes: byPos.volumes,
    cardShares: byCard.shares,
    posShares: byPos.shares,
    pairHhi: hhi(pairShares.length ? pairShares : [1]),
    largestPairShare: pairShares.length ? Math.max(...pairShares) : 1,
    transactionCount: sum(nonempty.map((p) => p.transactionCount)),
  };
}

/** Equal per up-card, then POS by usable fraction — natural share of genuine revenue. */
export function organicRevenueWeight(card: Resource, pos: Resource, scenario: Scenario): number {
  return Math.max(1e-6, usableFraction(resourceMaturity(pos, scenario).score));
}

/** Equal per up-POS, then cards by usable fraction — expenditure at terminals. */
export function organicExpenseWeight(card: Resource, pos: Resource, scenario: Scenario): number {
  return Math.max(1e-6, usableFraction(resourceMaturity(card, scenario).score));
}

export function allocateOrganic(
  state: SimState,
  scenario: Scenario,
  revenue: number,
  expense: number,
  preferKeys?: Set<string>,
): AllocationPlan {
  const prefer = preferKeys ?? new Set<string>();
  const rev =
    revenue > 1e-9
      ? allocateOntoPreferredKeys(state, scenario, revenue, organicRevenueWeight, "organic", prefer)
      : allocatePairsOnKeys(state, scenario, 0, organicRevenueWeight, "organic");
  const exp =
    expense > 1e-9
      ? allocateOntoPreferredKeys(state, scenario, expense, organicExpenseWeight, "organic", prefer)
      : allocatePairsOnKeys(state, scenario, 0, organicExpenseWeight, "organic");
  return mergeAllocationPlans([rev, exp]);
}

export interface PlacedOrganic {
  plan: AllocationPlan;
  transactions: PlannedTransaction[];
  blocked: BlockedObligation[];
  /** Amount actually placed (scored = executed). */
  revenue: number;
  expense: number;
}

/**
 * Bank-rules organic placement. Each organic payment (revenue lump, expense lump) is one
 * genuine economic payment ⇒ one card transaction (rule 1), on a card with no other
 * eligible purchase today (rule 5), on a PIN-capable card-present POS (rule 4). Amounts are
 * never split across pairs. A payment with no eligible card today is reported as blocked
 * (reconsider later); the ledger stock is not consumed.
 */
export function placeOrganicAtomically(
  state: SimState,
  scenario: Scenario,
  revenue: number,
  expense: number,
  coreTransactions: PlannedTransaction[],
): PlacedOrganic {
  const cards = upResources(state.cards, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const pos = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const cardIds = cards.map((c) => c.id);
  const posIds = pos.map((p) => p.id);
  const transactions: PlannedTransaction[] = [];
  const blocked: BlockedObligation[] = [];
  const usesToday = usesTodayFromLedger(state);
  for (const tx of coreTransactions) usesToday.set(tx.cardId, (usesToday.get(tx.cardId) ?? 0) + 1);
  const realized = resolveExogenousOffer(state, scenario).mode === "realized";
  const ctx: EligibilityContext = {
    state,
    scenario,
    usesToday,
    checkRepeatedAmounts: realized,
    todayTransactions: [...coreTransactions, ...transactions],
  };
  const corePos = new Set(coreTransactions.map((t) => t.posId));
  const rankedPos = pos.slice().sort((a, b) => {
    // Prefer a POS the core plan already uses today (no extra device), then id order.
    const ca = corePos.has(a.id) ? 0 : 1;
    const cb = corePos.has(b.id) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
  const rankedCards = rankResources(cards, scenario.pairTieBreak);
  const placed = { revenue: 0, expense: 0 };

  const payments: Array<{ amount: number; source: "organic-revenue" | "organic-expense"; weightFn: PairWeightFn }> = [];
  if (revenue > 1e-9) payments.push({ amount: floorMoneySafe(revenue), source: "organic-revenue", weightFn: organicRevenueWeight });
  if (expense > 1e-9) payments.push({ amount: floorMoneySafe(expense), source: "organic-expense", weightFn: organicExpenseWeight });

  const pairs: PairAllocation[] = [];
  for (const p of payments) {
    const payment: PaymentCandidate = {
      economicPaymentId: organicPaymentId(state.day, p.source),
      invoiceId: organicInvoiceId(state.day, p.source),
      amount: p.amount,
      source: p.source,
      supportingInvoicePresent: true,
    };
    let done = false;
    const rejections: Array<Extract<EligibilityVerdict, { ok: false }>> = [];
    outer: for (const card of rankedCards) {
      if (p.amount > scenario.perCardCapacityZar + 1e-9) break;
      for (const device of rankedPos) {
        if (p.amount > scenario.perPosCapacityZar + 1e-9) continue;
        const v = checkHardRules(ctx, payment, card, device);
        if (!v.ok) {
          rejections.push(v);
          if (v.rule === "supporting-invoice-required" || v.rule === "repeated-amount-review") break outer;
          if (v.rule === "one-purchase-per-card-per-day" || v.rule === "no-retry-after-decline") continue outer;
          continue;
        }
        const tx = buildPlannedTransaction(ctx, payment, card, device, "—", v);
        transactions.push(tx);
        ctx.todayTransactions.push(tx);
        usesToday.set(card.id, (usesToday.get(card.id) ?? 0) + 1);
        const cm = resourceMaturity(card, scenario);
        const pm = resourceMaturity(device, scenario);
        pairs.push({
          cardId: card.id,
          posId: device.id,
          cardName: card.name,
          posName: device.name,
          amount: p.amount,
          share: 0,
          weight: p.weightFn(card, device, scenario),
          cardMaturity: cm.score,
          posMaturity: pm.score,
          cardCategory: cm.category,
          posCategory: pm.category,
          source: "organic",
        });
        if (p.source === "organic-revenue") placed.revenue += p.amount;
        else placed.expense += p.amount;
        done = true;
        break outer;
      }
    }
    if (!done) {
      const dominant = dominantBlockingRule(rejections);
      blocked.push(
        blockedObligation(
          payment,
          rankedCards.map((c) => c.id),
          rankedPos.map((d) => d.id),
          dominant?.rule ?? "one-purchase-per-card-per-day",
          dominant?.reason ?? "blocked: no card without an eligible purchase today is available for this organic payment",
          dominant?.reconsiderLater ?? true,
        ),
      );
    }
  }

  const merged = new Map<string, PairAllocation>();
  for (const pair of pairs) {
    const key = pairKey(pair.cardId, pair.posId);
    const existing = merged.get(key);
    if (existing) existing.amount = roundMoney(existing.amount + pair.amount);
    else merged.set(key, { ...pair });
  }
  const plan = finishPlan([...merged.values()], cardIds, posIds, transactions.length);
  return { plan, transactions, blocked, revenue: roundMoney(placed.revenue), expense: roundMoney(placed.expense) };
}

function floorMoneySafe(v: number): number {
  return Math.floor(Math.max(0, v) * 100) / 100;
}

export interface PackedCore {
  plan: AllocationPlan;
  transactions: PlannedTransaction[];
  /** Genuine tickets the hard issuer rules kept out of this plan (empty when rules are off). */
  blocked: BlockedObligation[];
  /** Present only when the β-aware degraded-state packer was active (experiment flag). */
  degradedRouting?: DegradedRoutingDiagnostics;
}

function finishPlan(
  pairs: PairAllocation[],
  cardIds: string[],
  posIds: string[],
  transactionCount: number,
): AllocationPlan {
  const used = pairs.filter((p) => p.amount > 1e-9);
  const total = sum(used.map((p) => p.amount)) || 1;
  for (const p of used) p.share = p.amount / total;
  const byCard = resourceVolumes(used, cardIds, (x) => x.cardId);
  const byPos = resourceVolumes(used, posIds, (x) => x.posId);
  const pairShares = used.map((p) => p.share);
  return {
    pairs: used,
    cardIds,
    posIds,
    cardVolumes: byCard.volumes,
    posVolumes: byPos.volumes,
    cardShares: byCard.shares,
    posShares: byPos.shares,
    pairHhi: hhi(pairShares.length ? pairShares : [1]),
    largestPairShare: pairShares.length ? Math.max(...pairShares) : 1,
    transactionCount,
  };
}

export function packTicketsOnKeys(
  state: SimState,
  scenario: Scenario,
  tickets: CoreTicket[],
  coverKeys: Set<string>,
  /**
   * Optional forced routing: economicPaymentId → "card|pos" key. A forced ticket may only use
   * that key (every hard rule still applies); unforced tickets follow the ordinary cover walk.
   */
  forcedKeys?: Map<string, string>,
): PackedCore {
  const cards = upResources(state.cards, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const pos = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  const cardIds = cards.map((c) => c.id);
  const posIds = pos.map((p) => p.id);
  const empty = finishPlan([], cardIds, posIds, 0);
  const rules = bankRulesOn(scenario);
  const identified = withTicketIdentity(tickets, state.day);
  if (identified.length === 0 || coverKeys.size === 0 || cards.length === 0 || pos.length === 0) {
    // No cover / no resources: with rules on, every genuine ticket is reported as blocked
    // (card budget) so the inspector can show it; with rules off, legacy behaviour (silently unpacked).
    const blocked: BlockedObligation[] = rules && identified.length > 0 && (cards.length === 0 || pos.length === 0)
      ? identified.map((t) =>
          blockedObligation(paymentOf(t), [], [], "one-purchase-per-card-per-day", "blocked: no eligible card×POS pair is available today", true),
        )
      : [];
    return { plan: empty, transactions: [], blocked };
  }

  const byIdCard = Object.fromEntries(cards.map((c) => [c.id, c]));
  const byIdPos = Object.fromEntries(pos.map((p) => [p.id, p]));
  const downPairs = downPairKeys(state);
  const cover = [...coverKeys]
    .map((key) => {
      if (downPairs.has(key)) return null;
      const [cardId, posId] = key.split("|") as [string, string];
      const card = byIdCard[cardId];
      const device = byIdPos[posId];
      if (!card || !device) return null;
      return {
        key,
        card,
        pos: device,
        weight: defaultPairWeight(card, device, scenario),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.key.localeCompare(b.key));

  if (cover.length === 0) return { plan: empty, transactions: [], blocked: [] };

  const cardRoom: Record<string, number> = Object.fromEntries(
    cards.map((c) => [c.id, scenario.perCardCapacityZar]),
  );
  const posRoom: Record<string, number> = Object.fromEntries(
    pos.map((p) => [p.id, scenario.perPosCapacityZar]),
  );
  const assigned: Record<string, number> = {};
  const transactions: PlannedTransaction[] = [];
  const blocked: BlockedObligation[] = [];
  const usesToday = usesTodayFromLedger(state);
  const ctx: EligibilityContext = {
    state,
    scenario,
    usesToday,
    checkRepeatedAmounts: resolveExogenousOffer(state, scenario).mode === "realized",
    todayTransactions: transactions,
  };
  const seenPayments = new Set<string>();

  let cursor = 0;
  for (const ticket of identified) {
    const payment = paymentOf(ticket);
    // Hard rule 1 (anti-fragmentation): one economic payment ⇒ at most one card transaction.
    if (rules && seenPayments.has(payment.economicPaymentId)) {
      blocked.push(
        blockedObligation(payment, [], [], "no-split-payment", "blocked: this economic payment already has a transaction today; it cannot be split into a second one", false),
      );
      continue;
    }
    let picked: (typeof cover)[number] | null = null;
    let verdict: Extract<EligibilityVerdict, { ok: true }> | null = null;
    const rejections: Array<Extract<EligibilityVerdict, { ok: false }>> = [];
    const forcedKey = forcedKeys?.get(payment.economicPaymentId);
    for (let k = 0; k < cover.length; k++) {
      const row = cover[(cursor + k) % cover.length]!;
      if (forcedKey !== undefined && row.key !== forcedKey) continue;
      const fits =
        (cardRoom[row.card.id] ?? 0) + 1e-9 >= ticket.amount && (posRoom[row.pos.id] ?? 0) + 1e-9 >= ticket.amount;
      if (!fits) continue;
      if (rules) {
        const v = checkHardRules(ctx, payment, row.card, row.pos);
        if (!v.ok) {
          rejections.push(v);
          // Payment-level rules cannot be cured by another card/POS in this cover.
          if (v.rule === "supporting-invoice-required" || v.rule === "repeated-amount-review") break;
          continue;
        }
        verdict = v;
      }
      picked = row;
      cursor = (cursor + k + 1) % cover.length;
      break;
    }
    if (!picked) {
      if (rules) {
        const dominant = dominantBlockingRule(rejections);
        if (dominant) {
          blocked.push(
            blockedObligation(payment, cover.map((r) => r.card.id), cover.map((r) => r.pos.id), dominant.rule, dominant.reason, dominant.reconsiderLater),
          );
        }
      }
      continue;
    }
    seenPayments.add(payment.economicPaymentId);
    assigned[picked.key] = roundMoney((assigned[picked.key] ?? 0) + ticket.amount);
    cardRoom[picked.card.id] = (cardRoom[picked.card.id] ?? 0) - ticket.amount;
    posRoom[picked.pos.id] = (posRoom[picked.pos.id] ?? 0) - ticket.amount;
    const time = formatClock(ticket.timeMinutes);
    const tx =
      rules && verdict
        ? buildPlannedTransaction(ctx, payment, picked.card, picked.pos, time, verdict)
        : legacyPlannedTransaction(state, scenario, payment, picked.card, picked.pos, time, usesToday);
    usesToday.set(picked.card.id, (usesToday.get(picked.card.id) ?? 0) + 1);
    transactions.push(tx);
  }

  const pairs: PairAllocation[] = [];
  for (const row of cover) {
    const amount = assigned[row.key] ?? 0;
    if (amount <= 1e-9) continue;
    const cm = resourceMaturity(row.card, scenario);
    const pm = resourceMaturity(row.pos, scenario);
    pairs.push({
      cardId: row.card.id,
      posId: row.pos.id,
      cardName: row.card.name,
      posName: row.pos.name,
      amount,
      share: 0,
      weight: row.weight,
      cardMaturity: cm.score,
      posMaturity: pm.score,
      cardCategory: cm.category,
      posCategory: pm.category,
      source: "core",
    });
  }

  return {
    plan: finishPlan(pairs, cardIds, posIds, transactions.length),
    transactions,
    blocked,
  };
}

function paymentOf(ticket: CoreTicket): PaymentCandidate {
  return {
    economicPaymentId: ticket.economicPaymentId ?? "",
    invoiceId: ticket.invoiceId ?? null,
    amount: ticket.amount,
    source: "core",
    supportingInvoicePresent: ticket.supportingInvoicePresent ?? true,
  };
}

export function packCoreTickets(state: SimState, scenario: Scenario, tickets: CoreTicket[]): PackedCore {
  const total = roundMoney(sum(tickets.map((t) => t.amount)));
  if (tickets.length === 0 || total <= 1e-9) {
    return packTicketsOnKeys(state, scenario, [], new Set());
  }
  const cover = allocateSparsePairs(state, scenario, total, defaultPairWeight, "core", {
    maxPairs: tickets.length,
    tickets,
  });
  const keys = new Set(cover.pairs.map((p) => pairKey(p.cardId, p.posId)));
  const baseline =
    keys.size === 0
      ? packTicketsOnKeys(
          state,
          scenario,
          tickets,
          new Set(allocatePairsOnKeys(state, scenario, total, defaultPairWeight, "core").pairs.map((p) => pairKey(p.cardId, p.posId))),
        )
      : packTicketsOnKeys(state, scenario, tickets, keys);
  return betaAwareDegradedReroute(state, scenario, tickets, baseline);
}

/* ------------------------------------------------------------------------------------------
 * β-aware degraded-state packer (experiment; scenario.degradedMaxPosShare, default null).
 *
 * Active only while a POS review is open and ≥ 2 POS survive. Takes the baseline packer's
 * whole-ticket plan, keeps each ticket on its card (one purchase per card per day untouched),
 * enumerates every POS assignment over the surviving terminals, re-runs the hard bank rules and
 * capacity on each, and among the feasible routings with maxPosShare ≤ β picks the one with the
 * best day-0 structural Q. If no feasible routing satisfies β the day is CRITICAL_β and the
 * routing with the minimum achievable maxPosShare is used (ties: lower HHI, then Q). Tickets are
 * never split, created, deferred or modified to satisfy β.
 * ------------------------------------------------------------------------------------------ */

function maxShareAndHhi(plan: AllocationPlan): { max: number; hhi: number } {
  const shares = plan.posShares.filter((s) => s > 1e-12);
  if (shares.length === 0) return { max: 0, hhi: 0 };
  return { max: Math.max(...shares), hhi: hhi(shares) };
}

/** Day-0 structural Q of a packed core plan: the same terms the cover search scores on day 0. */
function day0RoutingQ(state: SimState, scenario: Scenario, packed: PackedCore): number {
  const throughput = sum(packed.plan.pairs.map((p) => p.amount));
  const risk = evaluateRisk(state, scenario, throughput, packed.plan, packed.transactions);
  const econ = fillEconomics(state, scenario, throughput, risk, expectedReviewDuration(scenario), { activity: packed.plan.pairs });
  let q = econ.myopicEv - hottestPosUseCostZar(packed.plan, state, scenario) - operationalComplexityCostZar(packed.plan, state, scenario);
  if (scenario.economicLearnerEnabled) {
    q += assessDeltaForPlan(state, scenario, packed.plan, packed.transactions).decisionAdjustment;
  }
  return q;
}

function betaAwareDegradedReroute(state: SimState, scenario: Scenario, tickets: CoreTicket[], baseline: PackedCore): PackedCore {
  const beta = scenario.degradedMaxPosShare;
  if (beta === null || beta === undefined || !Number.isFinite(beta)) return baseline;
  const posReviewActive = state.pos.some((p) => p.downUntilDay !== null && p.downUntilDay > state.day);
  if (!posReviewActive) return baseline;
  const survivors = upResources(state.pos, state.day).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (survivors.length < 2) return baseline;
  const core = baseline.transactions.filter((t) => t.source === "core");
  const n = core.length;
  if (n === 0) return baseline;

  const base = maxShareAndHhi(baseline.plan);
  const executed = new Set(core.map((t) => t.economicPaymentId));
  const k = survivors.length;
  const downPairs = downPairKeys(state);

  type Candidate = { packed: PackedCore; max: number; hhi: number; q: number | null; assign: number[] };
  const candidates: Candidate[] = [];
  let enumerated = 0;

  const tryAssign = (assign: number[]): void => {
    enumerated += 1;
    const forced = new Map<string, string>();
    const keys = new Set<string>();
    for (let i = 0; i < n; i++) {
      const key = pairKey(core[i]!.cardId, survivors[assign[i]!]!.id);
      if (downPairs.has(key)) return;
      forced.set(core[i]!.economicPaymentId, key);
      keys.add(key);
    }
    const packed = packTicketsOnKeys(state, scenario, tickets, keys, forced);
    const got = packed.transactions.filter((t) => t.source === "core");
    // Feasible only if exactly the baseline's tickets execute (no new blocks, no extra tickets).
    if (got.length !== n || got.some((t) => !executed.has(t.economicPaymentId))) return;
    if (got.some((t) => forced.get(t.economicPaymentId) !== pairKey(t.cardId, t.posId))) return;
    const m = maxShareAndHhi(packed.plan);
    candidates.push({ packed, max: m.max, hhi: m.hhi, q: null, assign: assign.slice() });
  };

  if (n <= 12) {
    const assign = new Array<number>(n).fill(0);
    const rec = (i: number): void => {
      if (i === n) {
        tryAssign(assign);
        return;
      }
      for (let p = 0; p < k; p++) {
        assign[i] = p;
        rec(i + 1);
      }
    };
    rec(0);
  } else {
    // Greedy largest-first fill (never reached at realistic ticket counts).
    const order = core.map((_, i) => i).sort((a, b) => core[b]!.amount - core[a]!.amount);
    const load = new Array<number>(k).fill(0);
    const assign = new Array<number>(n).fill(0);
    for (const i of order) {
      let best = 0;
      for (let p = 1; p < k; p++) if (load[p]! < load[best]!) best = p;
      assign[i] = best;
      load[best]! += core[i]!.amount;
    }
    tryAssign(assign);
  }

  const diagnosticsBase = {
    beta,
    survivingPos: k,
    ticketCount: n,
    routingsEnumerated: enumerated,
    baselineMaxShare: base.max,
    baselineHhi: base.hhi,
  };
  if (candidates.length === 0) {
    // Only the baseline itself is feasible (it always is; defensive).
    const q = day0RoutingQ(state, scenario, baseline);
    return {
      ...baseline,
      degradedRouting: {
        ...diagnosticsBase,
        routingsFeasible: 1,
        routingsCompliant: base.max <= beta + 1e-9 ? 1 : 0,
        minAchievableMaxShare: base.max,
        chosenMaxShare: base.max,
        chosenHhi: base.hhi,
        baselineQ: q,
        chosenQ: q,
        criticalBeta: base.max > beta + 1e-9,
        rerouted: false,
      },
    };
  }

  const minAchievable = Math.min(...candidates.map((c) => c.max));
  const compliant = candidates.filter((c) => c.max <= beta + 1e-9);
  const baselineKey = core.map((t) => t.posId).join("|");
  const sameAsBaseline = (c: Candidate) => c.assign.map((p) => survivors[p]!.id).join("|") === baselineKey;
  const baselineCandidate = candidates.find(sameAsBaseline);
  const baselineQ = baselineCandidate ? day0RoutingQ(state, scenario, baselineCandidate.packed) : day0RoutingQ(state, scenario, baseline);

  let chosen: Candidate;
  if (compliant.length > 0) {
    for (const c of compliant) c.q = day0RoutingQ(state, scenario, c.packed);
    compliant.sort((a, b) => b.q! - a.q! || a.max - b.max || a.hhi - b.hhi || a.assign.join().localeCompare(b.assign.join()));
    chosen = compliant[0]!;
  } else {
    const floor = candidates.filter((c) => c.max <= minAchievable + 1e-9);
    const minHhi = Math.min(...floor.map((c) => c.hhi));
    const tied = floor.filter((c) => c.hhi <= minHhi + 1e-9);
    for (const c of tied) c.q = day0RoutingQ(state, scenario, c.packed);
    tied.sort((a, b) => b.q! - a.q! || a.assign.join().localeCompare(b.assign.join()));
    chosen = tied[0]!;
  }
  if (chosen.q === null) chosen.q = day0RoutingQ(state, scenario, chosen.packed);

  return {
    ...chosen.packed,
    degradedRouting: {
      ...diagnosticsBase,
      routingsFeasible: candidates.length,
      routingsCompliant: compliant.length,
      minAchievableMaxShare: minAchievable,
      chosenMaxShare: chosen.max,
      chosenHhi: chosen.hhi,
      baselineQ,
      chosenQ: chosen.q,
      criticalBeta: compliant.length === 0,
      rerouted: !sameAsBaseline(chosen),
    },
  };
}

export interface AllocatedAction {
  core: AllocationPlan;
  organic: AllocationPlan;
  merged: AllocationPlan;
  /** Core transactions: whole genuine tickets, one per economic payment. */
  transactions: PlannedTransaction[];
  /** Organic transactions (bank rules on); empty under the legacy water-fill. */
  organicTransactions: PlannedTransaction[];
  /** Genuine obligations the hard rules kept out of today's plan. */
  blocked: BlockedObligation[];
  /** Organic amounts actually placed. Equal to the request when rules are off. */
  organicRevenue: number;
  organicExpense: number;
  /** β-aware degraded-state packer diagnostics (experiment flag only). */
  degradedRouting?: DegradedRoutingDiagnostics;
}

/**
 * Realized packed plan for an action. This is the single choke point every scorer and the
 * transition go through, so the plan that is scored is the plan that is executed:
 *
 *   candidate demand → pack whole genuine tickets → inspect actual cards/POS/pairs/amounts/times
 *   → apply hard bank feasibility rules → (risk features, Q computed by the caller)
 */
export function allocateAction(
  state: SimState,
  scenario: Scenario,
  coreThroughput: number,
  organicRevenue: number,
  organicExpense: number,
): AllocatedAction {
  const offer = resolveExogenousOffer(state, scenario);
  const tickets = selectTickets(offer.coreTickets, coreThroughput);
  const packed = packCoreTickets(state, scenario, tickets);
  if (bankRulesOn(scenario)) {
    const organic = placeOrganicAtomically(state, scenario, organicRevenue, organicExpense, packed.transactions);
    return {
      core: packed.plan,
      organic: organic.plan,
      merged: mergeAllocationPlans([packed.plan, organic.plan]),
      transactions: packed.transactions,
      organicTransactions: organic.transactions,
      blocked: [...packed.blocked, ...organic.blocked],
      organicRevenue: organic.revenue,
      organicExpense: organic.expense,
      degradedRouting: packed.degradedRouting,
    };
  }
  const prefer = new Set(packed.plan.pairs.map((p) => pairKey(p.cardId, p.posId)));
  const organic = allocateOrganic(state, scenario, organicRevenue, organicExpense, prefer);
  return {
    core: packed.plan,
    organic,
    merged: mergeAllocationPlans([packed.plan, organic]),
    transactions: packed.transactions,
    organicTransactions: [],
    blocked: [],
    organicRevenue,
    organicExpense,
    degradedRouting: packed.degradedRouting,
  };
}

export function explainAllocation(plan: AllocationPlan, throughput: number): string {
  if (throughput <= 0) {
    return "No activity is scheduled, so no card×POS pair receives volume. Installed resources still age one calendar day and accrue clean history if they were available and not interrupted.";
  }
  if (plan.pairs.length === 0) {
    return "No available card×POS pair could carry volume (all relevant resources are down or at capacity).";
  }
  if (plan.pairs.length === 1) {
    const p = plan.pairs[0]!;
    return `The entire ${formatZar(p.amount)} is assigned to ${displayResourceName(p.cardId, p.cardName)} → ${displayResourceName(p.posId, p.posName)}, the only available pair.`;
  }
  const ranked = [...plan.pairs].sort((a, b) => b.amount - a.amount);
  const top = ranked[0]!;
  const parts = [
    `The chosen core is packed as ${plan.transactionCount || plan.pairs.length} whole ticket${(plan.transactionCount || plan.pairs.length) === 1 ? "" : "s"} onto ${plan.pairs.length} card×POS pair${plan.pairs.length === 1 ? "" : "s"} — the cover whose multi-day held-cover EV, net of first-day new-pair and extra-pair costs, ranks highest. Installed devices are optional; equal splitting is not a target.`,
    `${displayResourceName(top.cardId, top.cardName)} → ${displayResourceName(top.posId, top.posName)} receives the largest share (${formatZar(top.amount)}, ${(top.share * 100).toFixed(0)}%).`,
  ];
  if (plan.cardIds.length === 1) {
    parts.push(
      `A single card carries every pair, so card concentration remains 100% even if volume is spread across POS devices.`,
    );
  }
  if (plan.posIds.length === 1) {
    parts.push(`A single POS carries every pair, so POS concentration remains 100%.`);
  }
  return parts.join(" ");
}
