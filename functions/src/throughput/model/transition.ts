import { allocateAction, pairKey } from "./allocation";
import { recordLedgerTransactions } from "./bankRules";
import { noteOperatingAllocation } from "./coverRules";
import { parseAction, profitableActivity, observedActivity } from "./activity";
import { clearExogenousOffer, downUntilAfterOperatingDays, isOperatingWeekday, resolveExogenousOffer } from "./demand";
import { recordContinuityObservation } from "./continuity";
import { fillEconomics } from "./economics";
import { applyDomainHitToState, demandFatesForAction, drawDomainHit, eventBased, resolveDomainHit, type DomainHit, type HitContext } from "./eventLoss";
import { drawInterruption, economicNoise, hiddenContinuityMultiplier, hiddenEconomicDelta, cascadeRng, worldRng } from "./hiddenWorld";
import { learnerFeatures, updatePosterior } from "./learner";
import { roundMoney, saturateHazard, sum } from "./math";
import { appendSimulationObservation, packedDesignFromPlan } from "./observations";
import { accrueProfitLinkedFromGrossProfit, consumeOrganic, syncOrganicPeriod } from "./organic";
import { emptyRolling, recordDayOnPairs, recordDayOnResources } from "./rolling";
import { expectedReviewDuration, evaluateRisk } from "./risk";
import { cloneState, isResourceUp, applyScheduledArrivals, releaseRecoveredResources, upResources } from "./state";
import type { DayAction, LedgerTransaction, OutcomePayload, PairRecord, PlannedTransaction, Resource, Scenario, SimState } from "./types";

export function incrementCalendarAge(state: SimState): void {
  state.merchantDaysActive += 1;
  for (const resource of [...state.cards, ...state.pos]) {
    resource.daysActive += 1;
  }
}

function findPair(state: SimState, cardId: string, posId: string): PairRecord | undefined {
  return state.pairs.find((p) => p.cardId === cardId && p.posId === posId);
}

function createPair(state: SimState, cardId: string, posId: string, day: number): PairRecord {
  const rec: PairRecord = {
    cardId,
    posId,
    firstActiveDay: day,
    lastUsedDay: null,
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

export function resetCleanHistoryForResources(state: SimState, resourceIds: Iterable<string>): void {
  const hit = new Set(resourceIds);
  for (const pair of state.pairs) {
    if (hit.has(pair.cardId) || hit.has(pair.posId)) {
      pair.cleanHistoryDays = 0;
    }
  }
}

function accrueResourceUse(
  resource: Resource,
  coreVol: number,
  orgRev: number,
  orgExp: number,
  coreTickets: number,
  orgTickets: number,
  day: number,
  clean: boolean,
): void {
  if (!isResourceUp(resource, day)) return;
  const volume = coreVol + orgRev + orgExp;
  const tickets = coreTickets + orgTickets;
  if (volume > 0) {
    resource.lifetimeVolume += volume;
    resource.lifetimeCount += tickets;
    resource.activeTradingDays += 1;
    resource.coreVolume += coreVol;
    resource.organicRevenueVolume += orgRev;
    resource.organicExpenseVolume += orgExp;
    resource.coreTransactionCount += coreTickets;
    resource.organicTransactionCount += orgTickets;
  }
  if (clean) resource.cleanHistoryDays += 1;
}

function pairVolumes(
  pairs: { cardId: string; posId: string; amount: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of pairs) {
    out[pair.cardId] = (out[pair.cardId] ?? 0) + pair.amount;
    out[pair.posId] = (out[pair.posId] ?? 0) + pair.amount;
  }
  return out;
}

export interface CleanDayOptions {
  /**
   * True only for the realized day in the simulation loop (or a production ledger row).
   * Projected days inside the rollout never generate hidden-world outcomes, never update
   * the economic posterior and never record continuity evidence.
   */
  realized?: boolean;
  /** Do not draw a Bernoulli interruption today (used on the morning a POS review is forced). */
  skipRandomHit?: boolean;
  /**
   * After today's packed plan is recorded, put one POS into review for `operatingDaysDown`
   * subsequent operating mornings (T2). Lock uses scenario.posCapitalLockFraction.
   */
  forcePosReview?: { operatingDaysDown: number };
}

/** Apply a clean operating day. Throughput number is treated as core-only. */
export function applyCleanDay(
  state: SimState,
  scenario: Scenario,
  throughputOrAction: number | DayAction,
  options: CleanDayOptions = {},
): void {
  const requested = parseAction(throughputOrAction);
  incrementCalendarAge(state);
  const plans = allocateAction(
    state,
    scenario,
    requested.coreThroughput,
    requested.organicRevenue,
    requested.organicExpense,
  );
  // Executed action = the feasible packed plan (core packed; organic actually placed).
  const action = {
    ...requested,
    coreThroughput: roundMoney(sum(plans.core.pairs.map((p) => p.amount))),
    organicRevenue: Math.min(requested.organicRevenue, plans.organicRevenue),
    organicExpense: Math.min(requested.organicExpense, plans.organicExpense),
  };
  let outcome: OutcomePayload | null = null;
  // Event-based loss model: fates of today's genuine demand under the executed plan (same
  // function the optimizer scored), applied to the backlog stock after execution.
  const offerTickets = resolveExogenousOffer(state, scenario).coreTickets;
  const fates = eventBased(scenario)
    ? demandFatesForAction(state, scenario, offerTickets, new Set(plans.transactions.map((t) => t.economicPaymentId)))
    : null;
  let realizedHit: DomainHit | null = null;
  if (action.coreThroughput > 1e-9) {
    const risk = evaluateRisk(state, scenario, action.coreThroughput, plans.core, plans.transactions);
    const econ = fillEconomics(
      state,
      scenario,
      action.coreThroughput,
      risk,
      expectedReviewDuration(scenario),
      fates ? { activity: plans.merged.pairs, fates } : undefined,
    );
    outcome = {
      grossProfit: econ.grossProfit,
      continuityCost: econ.expectedContinuityCost,
      myopicEv: econ.myopicEv,
      residual: null,
      economicResidual: null,
      structuralHazard: saturateHazard(risk.rawHazard, scenario.hMax),
      interruptionObserved: null,
      hiddenEconomicDelta: null,
    };
    if (
      options.realized &&
      (scenario.hiddenWorldEnabled || scenario.realizedCascadeEnabled) &&
      !options.skipRandomHit &&
      !options.forcePosReview
    ) {
      const design = packedDesignFromPlan(state, plans.core, plans.transactions);
      if (scenario.hiddenWorldEnabled) {
        const deltaStar = hiddenEconomicDelta(scenario, design);
        const residual = deltaStar + economicNoise(scenario, state.day, econ.grossProfit);
        outcome.economicResidual = residual;
        outcome.hiddenEconomicDelta = deltaStar;
        if (scenario.economicLearnerEnabled) {
          updatePosterior(state.learner, learnerFeatures(design, scenario), residual, scenario);
        }
      }
      const hStructural = outcome.structuralHazard ?? 0;
      const hTrue = scenario.hiddenWorldEnabled
        ? saturateHazard(risk.rawHazard * hiddenContinuityMultiplier(scenario, action.coreThroughput), scenario.hMax)
        : hStructural;
      const hit = drawInterruption(scenario, state.day, hTrue);
      outcome.interruptionObserved = hit;
      recordContinuityObservation(state, hStructural, hit);
      if (hit && eventBased(scenario)) {
        realizedHit = drawDomainHit(
          {
            day: state.day,
            cards: state.cards,
            pos: state.pos,
            ledger: [
              ...state.bankLedger,
              ...[...plans.transactions, ...plans.organicTransactions].map((t) => ({
                day: state.day,
                economicPaymentId: t.economicPaymentId,
                cardId: t.cardId,
                posId: t.posId,
                amount: t.amount,
                source: t.source,
                cardOrigin: t.cardOrigin,
                highValue: t.highValue,
              })),
            ],
            todayRows: plans.merged.pairs,
            deployableCapital: state.deployableCapital,
            scenario,
          },
          scenario.realizedCascadeEnabled && !scenario.hiddenWorldEnabled
            ? cascadeRng(scenario, state.day, "cascadeDomain")
            : worldRng(scenario, state.day, "interruptionDomain"),
        );
      }
    }
  }
  // The sample is kept on projected states so the rollout is scored under the same θ̃;
  // the simulation loop redraws (or clears) it at the start of each realized day.
  const observed = observedActivity(action);
  const coreTickets = plans.transactions.length;
  const orgVolume = action.organicRevenue + action.organicExpense;
  // Bank rules on: organic payments are atomic transactions, so the count is exact.
  const orgTickets = scenario.bankRulesEnabled
    ? plans.organicTransactions.length
    : orgVolume > 1e-9 && scenario.avgTicketZar > 0
      ? orgVolume / scenario.avgTicketZar
      : 0;
  const ticketsTotal = coreTickets + orgTickets;
  // Ledger of executed transactions (realized and projected days) for the feasibility layer.
  recordLedgerTransactions(state, [...plans.transactions, ...plans.organicTransactions]);

  if (observed > 0) {
    state.merchantLifetimeVolume += observed;
    state.merchantLifetimeCount += ticketsTotal;
    state.merchantActiveTradingDays += 1;
  }
  state.merchantCleanHistoryDays += 1;

  const coreById = pairVolumes(plans.core.pairs);
  const orgById = pairVolumes(plans.organic.pairs);
  const orgRevShare =
    action.organicRevenue + action.organicExpense > 0
      ? action.organicRevenue / (action.organicRevenue + action.organicExpense)
      : 0;

  for (const resource of [...state.cards, ...state.pos]) {
    const coreVol = coreById[resource.id] ?? 0;
    const orgVol = orgById[resource.id] ?? 0;
    const orgRev = orgVol * orgRevShare;
    const orgExp = orgVol - orgRev;
    const cTickets = coreVol > 1e-9 && action.coreThroughput > 1e-9
      ? coreTickets * (coreVol / action.coreThroughput)
      : 0;
    const oTickets = orgVol > 1e-9 && orgVolume > 1e-9 ? orgTickets * (orgVol / orgVolume) : 0;
    accrueResourceUse(resource, coreVol, orgRev, orgExp, cTickets, oTickets, state.day, true);
  }

  const creditedPairs = new Set<string>();
  const pairCore = new Map<string, number>();
  const pairOrg = new Map<string, number>();
  for (const pair of plans.core.pairs) {
    pairCore.set(pairKey(pair.cardId, pair.posId), pair.amount);
  }
  for (const pair of plans.organic.pairs) {
    pairOrg.set(pairKey(pair.cardId, pair.posId), pair.amount);
  }
  const keys = new Set([...pairCore.keys(), ...pairOrg.keys()]);
  for (const key of keys) {
    const [cardId, posId] = key.split("|") as [string, string];
    const coreAmt = pairCore.get(key) ?? 0;
    const orgAmt = pairOrg.get(key) ?? 0;
    const amount = coreAmt + orgAmt;
    if (amount <= 0) continue;
    const rec = findPair(state, cardId, posId) ?? createPair(state, cardId, posId, state.day);
    rec.lifetimeVolume += amount;
    rec.lifetimeCount +=
      (coreAmt > 1e-9 && action.coreThroughput > 1e-9
        ? coreTickets * (coreAmt / action.coreThroughput)
        : 0) +
      (orgAmt > 1e-9 && orgVolume > 1e-9 ? orgTickets * (orgAmt / orgVolume) : 0);
    rec.activeTradingDays += 1;
    rec.cleanHistoryDays += 1;
    rec.lastUsedDay = state.day;
    rec.coreVolume += coreAmt;
    rec.organicVolume += orgAmt;
    creditedPairs.add(key);
  }

  for (const rec of state.pairs) {
    if (creditedPairs.has(pairKey(rec.cardId, rec.posId))) continue;
    const card = state.cards.find((c) => c.id === rec.cardId);
    const pos = state.pos.find((p) => p.id === rec.posId);
    if (!card || !pos) continue;
    if (isResourceUp(card, state.day) && isResourceUp(pos, state.day)) {
      rec.cleanHistoryDays += 1;
    }
  }

  const volumeById: Record<string, number> = {};
  const ticketsById: Record<string, number> = {};
  for (const resource of [...state.cards, ...state.pos]) {
    const coreVol = coreById[resource.id] ?? 0;
    const orgVol = orgById[resource.id] ?? 0;
    volumeById[resource.id] = coreVol + orgVol;
    ticketsById[resource.id] =
      (coreVol > 1e-9 && action.coreThroughput > 1e-9
        ? coreTickets * (coreVol / action.coreThroughput)
        : 0) +
      (orgVol > 1e-9 && orgVolume > 1e-9 ? orgTickets * (orgVol / orgVolume) : 0);
  }
  recordDayOnResources(state.cards, volumeById, ticketsById);
  recordDayOnResources(state.pos, volumeById, ticketsById);

  const pairVolume: Record<string, number> = {};
  const pairCount: Record<string, number> = {};
  for (const key of keys) {
    const coreAmt = pairCore.get(key) ?? 0;
    const orgAmt = pairOrg.get(key) ?? 0;
    const amount = coreAmt + orgAmt;
    pairVolume[key] = amount;
    pairCount[key] =
      (coreAmt > 1e-9 && action.coreThroughput > 1e-9
        ? coreTickets * (coreAmt / action.coreThroughput)
        : 0) +
      (orgAmt > 1e-9 && orgVolume > 1e-9 ? orgTickets * (orgAmt / orgVolume) : 0);
  }
  recordDayOnPairs(state.pairs, pairVolume, pairCount);
  noteOperatingAllocation(state, plans.core);

  consumeOrganic(state, action.organicRevenue, action.organicExpense);
  accrueProfitLinkedFromGrossProfit(state, scenario, profitableActivity(action) * scenario.margin);
  appendSimulationObservation(state, plans.core, outcome ? plans.transactions : [], outcome);
  const weekday = isOperatingWeekday(state.day);
  if (action.coreThroughput > 1e-9) {
    state.consecutiveIdleBusinessDays = 0;
  } else if (weekday) {
    state.consecutiveIdleBusinessDays += 1;
  }
  state.throughputHistory.push(observed);

  if (fates) {
    // Stock update: arrivals + prior backlog = executed + deferred + expired (identity holds by
    // construction in demandFatesForAction). Expired demand is permanently lost.
    state.backlog = fates.nextBacklog;
    state.expiredDemandZar = (state.expiredDemandZar ?? 0) + fates.fates.expiredZar;
  }
  if (options.realized && options.forcePosReview && !realizedHit) {
    realizedHit = forcedPosReviewHit(
      state,
      scenario,
      plans.merged.pairs,
      [...plans.transactions, ...plans.organicTransactions],
      options.forcePosReview.operatingDaysDown,
    );
  }
  if (realizedHit) {
    // T2: today's ledger rows are already recorded above; the hit only affects later days.
    applyDomainHitToState(state, realizedHit);
  }
}

function forcedPosReviewHit(
  state: SimState,
  scenario: Scenario,
  todayRows: { cardId: string; posId: string; amount: number }[],
  todayTx: Pick<PlannedTransaction, "economicPaymentId" | "cardId" | "posId" | "amount" | "source" | "cardOrigin" | "highValue">[],
  operatingDaysDown: number,
): DomainHit | null {
  const byPos = new Map<string, number>();
  for (const r of todayRows) byPos.set(r.posId, (byPos.get(r.posId) ?? 0) + r.amount);
  let posId = [...byPos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (!posId) {
    const up = state.pos.filter((p) => p.downUntilDay === null || p.downUntilDay <= state.day).sort((a, b) => a.id.localeCompare(b.id))[0];
    posId = up?.id;
  }
  if (!posId) return null;
  const downUntilDay = downUntilAfterOperatingDays(state.day, operatingDaysDown);
  const ctx: HitContext = {
    day: state.day,
    cards: state.cards,
    pos: state.pos,
    ledger: [
      ...state.bankLedger,
      ...todayTx.map(
        (t): LedgerTransaction => ({
          day: state.day,
          economicPaymentId: t.economicPaymentId,
          cardId: t.cardId,
          posId: t.posId,
          amount: t.amount,
          source: t.source,
          cardOrigin: t.cardOrigin,
          highValue: t.highValue,
        }),
      ),
    ],
    todayRows,
    deployableCapital: state.deployableCapital,
    scenario,
  };
  const hit = resolveDomainHit(ctx, "pos", posId, Math.max(1, downUntilDay - state.day));
  hit.downUntilDay = downUntilDay;
  hit.durationDays = downUntilDay - state.day;
  return hit;
}

export function lockCapital(state: SimState, amount: number): void {
  const lock = Math.min(state.deployableCapital, Math.max(0, amount));
  state.deployableCapital -= lock;
  state.trappedCapital += lock;
}

function pickLargestShareResource(
  resources: Resource[],
  shares: number[],
): Resource | null {
  if (resources.length === 0) return null;
  let best = 0;
  for (let i = 1; i < shares.length; i++) {
    if ((shares[i] ?? 0) > (shares[best] ?? 0)) best = i;
  }
  return resources[best] ?? resources[0] ?? null;
}

/**
 * Expected-hit transition used by lookahead (deterministic).
 * Takes the largest-share resource down when the event is not a full system shock.
 */
export function applyExpectedHit(
  state: SimState,
  scenario: Scenario,
  throughputOrAction: number | DayAction,
  expectedDuration: number,
  expectedCapacityLost: number,
): void {
  const requested = parseAction(throughputOrAction);
  incrementCalendarAge(state);
  const plans = allocateAction(
    state,
    scenario,
    requested.coreThroughput,
    requested.organicRevenue,
    requested.organicExpense,
  );
  const action = {
    ...requested,
    coreThroughput: roundMoney(sum(plans.core.pairs.map((p) => p.amount))),
    organicRevenue: Math.min(requested.organicRevenue, plans.organicRevenue),
    organicExpense: Math.min(requested.organicExpense, plans.organicExpense),
  };
  const observed = observedActivity(action);
  recordLedgerTransactions(state, [...plans.transactions, ...plans.organicTransactions]);
  state.merchantInterruptionCount += 1;
  state.merchantCleanHistoryDays = 0;
  consumeOrganic(state, action.organicRevenue, action.organicExpense);
  accrueProfitLinkedFromGrossProfit(state, scenario, profitableActivity(action) * scenario.margin);
  state.throughputHistory.push(observed);

  const duration = Math.max(1, Math.round(expectedDuration));
  const downUntil = state.day + duration;
  const f = expectedCapacityLost;
  const freeze = scenario.capitalFrozenDuringReview;
  const lockedTotal = freeze ? f * (state.deployableCapital + state.trappedCapital) : 0;
  const plan = plans.merged;
  const cardsById = Object.fromEntries(state.cards.map((c) => [c.id, c]));
  const posById = Object.fromEntries(state.pos.map((p) => [p.id, p]));
  const cardResources = plan.cardIds.map((id) => cardsById[id]).filter((r): r is Resource => Boolean(r));
  const posResources = plan.posIds.map((id) => posById[id]).filter((r): r is Resource => Boolean(r));

  const systemHit = f >= 0.95;
  const targets: Resource[] = [];
  if (systemHit) {
    targets.push(...upResources(state.cards, state.day), ...upResources(state.pos, state.day));
  } else {
    const largestCard = Math.max(0, ...plan.cardShares);
    const largestPos = Math.max(0, ...plan.posShares);
    if (largestCard >= largestPos) {
      const card = pickLargestShareResource(cardResources, plan.cardShares);
      if (card) targets.push(card);
    } else {
      const posHit = pickLargestShareResource(posResources, plan.posShares);
      if (posHit) targets.push(posHit);
    }
  }

  const unique = [...new Map(targets.map((t) => [t.id, t])).values()];
  const lockEach = unique.length > 0 ? lockedTotal / unique.length : 0;
  for (const resource of unique) {
    resource.downUntilDay = downUntil;
    resource.interruptionCount += 1;
    resource.cleanHistoryDays = 0;
    if (freeze) {
      resource.frozenCapital += lockEach;
    }
  }
  resetCleanHistoryForResources(state, unique.map((r) => r.id));
  if (freeze) lockCapital(state, lockedTotal);

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
  const ticketsTotal = scenario.avgTicketZar > 0 ? observed / scenario.avgTicketZar : 0;
  for (const id of Object.keys(volumeById)) {
    ticketsById[id] = observed > 0 ? ticketsTotal * ((volumeById[id] ?? 0) / observed) : 0;
  }
  recordDayOnResources(state.cards, volumeById, ticketsById);
  recordDayOnResources(state.pos, volumeById, ticketsById);
  const pairVolume: Record<string, number> = {};
  const pairCount: Record<string, number> = {};
  for (const pair of plan.pairs) {
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
}

export function projectAfterAction(
  state: SimState,
  scenario: Scenario,
  action: DayAction,
  kind: "clean" | "hit",
  expectedDuration = 1,
  expectedCapacityLost = 1,
): SimState {
  const next = cloneState(state);
  if (kind === "clean") applyCleanDay(next, scenario, action);
  else applyExpectedHit(next, scenario, action, expectedDuration, expectedCapacityLost);
  clearExogenousOffer(next);
  next.day += 1;
  applyScheduledArrivals(next, scenario);
  releaseRecoveredResources(next);
  syncOrganicPeriod(next, scenario);
  return next;
}

export function projectCleanState(
  state: SimState,
  scenario: Scenario,
  throughputOrAction: number | DayAction,
): SimState {
  return projectAfterAction(state, scenario, parseAction(throughputOrAction), "clean");
}

export function projectHitState(
  state: SimState,
  scenario: Scenario,
  throughputOrAction: number | DayAction,
  expectedDuration: number,
  expectedCapacityLost: number,
): SimState {
  return projectAfterAction(
    state,
    scenario,
    parseAction(throughputOrAction),
    "hit",
    expectedDuration,
    expectedCapacityLost,
  );
}
