import { cardNamesForCount, createDefaultScenario } from "./defaults";
import { applyHistorySeed, applyMerchantHistory, seedForIndex } from "./history";
import { emptyContinuityEvidence } from "./continuity";
import { createLearnerPosterior } from "./learner";
import { createOrganicLedger } from "./organic";
import { emptyRolling } from "./rolling";
import type { Resource, ResourceKind, Scenario, SimState } from "./types";

function makeResource(
  kind: ResourceKind,
  index: number,
  installedOnDay: number,
  name?: string,
): Resource {
  return {
    id: `${kind}-${index}`,
    name: name ?? (kind === "card" ? `Card ${index}` : `POS ${index}`),
    kind,
    installedOnDay,
    daysActive: 0,
    lifetimeCount: 0,
    lifetimeVolume: 0,
    activeTradingDays: 0,
    cleanHistoryDays: 0,
    interruptionCount: 0,
    downUntilDay: null,
    frozenCapital: 0,
    coreVolume: 0,
    organicRevenueVolume: 0,
    organicExpenseVolume: 0,
    importedHistoryVolume: 0,
    coreTransactionCount: 0,
    organicTransactionCount: 0,
    importedHistoryCount: 0,
    rolling: emptyRolling(),
    consecutiveOperatingActiveDays: 0,
    ...(kind === "card"
      ? { cardOrigin: "international" as const }
      : { pinCapableFlow: true, cardPresentFlow: true }),
  };
}

/** Slice 0 ownership / institution labels. No-op when fixtures are absent. */
export function stampSlice0Resource(resource: Resource, scenario: Scenario): Resource {
  const fixtures = scenario.slice0Fixtures;
  if (!fixtures) return resource;
  if (resource.kind === "card") {
    resource.ownerOperatorId = fixtures.demandOperatorId;
    resource.institutionId =
      fixtures.cardInstitutionByResourceId[resource.id] ??
      fixtures.cardInstitutionByResourceId[resource.name];
  } else {
    resource.ownerOperatorId = fixtures.supplyOperatorId;
    resource.institutionId = fixtures.posInstitutionByResourceId[resource.id];
  }
  return resource;
}

export function createInitialState(scenario: Scenario = createDefaultScenario()): SimState {
  const cardNames = cardNamesForCount(scenario.initialCards, scenario.initialCardNames);
  const cards = cardNames.map((name, i) => {
    const resource = makeResource("card", i + 1, 1, name);
    resource.cardOrigin = scenario.initialCardOrigins?.[i] ?? "international";
    applyHistorySeed(resource, seedForIndex(scenario.startingCardHistory, scenario.startingCardHistories, i));
    return stampSlice0Resource(resource, scenario);
  });
  const pos = Array.from({ length: scenario.initialPos }, (_, i) => {
    const resource = makeResource("pos", i + 1, 1);
    applyHistorySeed(resource, seedForIndex(scenario.startingPosHistory, scenario.startingPosHistories, i));
    return stampSlice0Resource(resource, scenario);
  });

  const state: SimState = {
    day: 1,
    deployableCapital: scenario.startingCapitalZar,
    extractedProfit: 0,
    trappedCapital: 0,
    cards,
    pos,
    pairs: [],
    throughputHistory: [],
    merchantDaysActive: 0,
    merchantLifetimeCount: 0,
    merchantLifetimeVolume: 0,
    merchantActiveTradingDays: 0,
    merchantCleanHistoryDays: 0,
    merchantInterruptionCount: 0,
    organic: createOrganicLedger(scenario, 1),
    observations: [],
    consecutiveIdleBusinessDays: 0,
    lastOperatingPairKeys: [],
    lastOperatingCoverSig: "",
    learner: createLearnerPosterior(scenario),
    learnerSample: null,
    continuity: emptyContinuityEvidence(),
    bankLedger: [],
    declines: [],
    backlog: [],
    interruptionEvents: [],
    expiredDemandZar: 0,
  };
  applyMerchantHistory(state, scenario);
  return state;
}

export function cloneState(state: SimState): SimState {
  return structuredClone(state);
}

export function isResourceUp(resource: Resource, day: number): boolean {
  return resource.downUntilDay === null || resource.downUntilDay <= day;
}

export function upResources(resources: Resource[], day: number): Resource[] {
  return resources.filter((r) => isResourceUp(r, day));
}

/** Pair-scoped interruption (event-based loss model): false while the relationship is under review. */
export function isPairUp(state: SimState, cardId: string, posId: string): boolean {
  for (const rec of state.pairs) {
    if (rec.cardId !== cardId || rec.posId !== posId) continue;
    return rec.downUntilDay === null || rec.downUntilDay === undefined || rec.downUntilDay <= state.day;
  }
  return true;
}

/** Only pair records that are actually down (fast path for allocation). */
export function downPairKeys(state: SimState): Set<string> {
  const out = new Set<string>();
  for (const rec of state.pairs) {
    if (rec.downUntilDay !== null && rec.downUntilDay !== undefined && rec.downUntilDay > state.day) {
      out.add(`${rec.cardId}|${rec.posId}`);
    }
  }
  return out;
}

function nextIndex(resources: Resource[], kind: ResourceKind): number {
  const max = resources.reduce((acc, r) => {
    const n = Number(r.id.replace(`${kind}-`, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return max + 1;
}

function scheduledCount(initial: number, everyDays: number, day: number, max?: number): number {
  if (everyDays <= 0) return max === undefined ? initial : Math.min(initial, max);
  const extra = Math.floor(Math.max(0, day - 1) / everyDays);
  const desired = initial + extra;
  return max === undefined ? desired : Math.min(desired, max);
}

export function applyScheduledArrivals(state: SimState, scenario: Scenario): string[] {
  const day = state.day;
  const arrived: string[] = [];
  const desiredPos = scheduledCount(
    scenario.initialPos,
    scenario.posEveryDays,
    day,
    scenario.maximumPosDevices,
  );
  const desiredCards = scheduledCount(scenario.initialCards, scenario.cardEveryDays, day);

  while (state.pos.length < desiredPos) {
    const resource = stampSlice0Resource(makeResource("pos", nextIndex(state.pos, "pos"), day), scenario);
    state.pos.push(resource);
    arrived.push(resource.id);
  }
  while (state.cards.length < desiredCards) {
    const index = nextIndex(state.cards, "card");
    const resource = stampSlice0Resource(makeResource("card", index, day, `Card ${index}`), scenario);
    state.cards.push(resource);
    arrived.push(resource.id);
  }
  return arrived;
}

export function releaseRecoveredResources(state: SimState): number {
  let released = 0;
  const all = [...state.cards, ...state.pos];
  for (const resource of all) {
    if (resource.downUntilDay !== null && resource.downUntilDay <= state.day) {
      released += resource.frozenCapital;
      resource.frozenCapital = 0;
      resource.downUntilDay = null;
    }
  }
  for (const rec of state.pairs) {
    if (rec.downUntilDay !== null && rec.downUntilDay !== undefined && rec.downUntilDay <= state.day) {
      released += rec.frozenCapital ?? 0;
      rec.frozenCapital = 0;
      rec.downUntilDay = null;
    }
  }
  if (released > 0) {
    state.trappedCapital = Math.max(0, state.trappedCapital - released);
    state.deployableCapital += released;
  }
  return released;
}

export function physicalCapacity(
  resources: Resource[],
  day: number,
  perUnit: number,
): number {
  return upResources(resources, day).length * perUnit;
}

export function availableCapital(state: SimState): number {
  return Math.max(0, state.deployableCapital);
}

export function maxFeasibleThroughput(state: SimState, scenario: Scenario): number {
  const cardCap = physicalCapacity(state.cards, state.day, scenario.perCardCapacityZar);
  const posCap = physicalCapacity(state.pos, state.day, scenario.perPosCapacityZar);
  return Math.max(0, Math.min(availableCapital(state), cardCap, posCap));
}

export function beginCalendarDay(state: SimState, scenario: Scenario): string[] {
  const arrived = applyScheduledArrivals(state, scenario);
  releaseRecoveredResources(state);
  return arrived;
}

export function throughputCandidates(maxV: number, step: number): number[] {
  const values = [0];
  if (step <= 0) {
    if (maxV > 0) values.push(maxV);
    return values;
  }
  for (let v = step; v < maxV - 1e-9; v += step) {
    values.push(v);
  }
  if (maxV > 0) values.push(maxV);
  return values;
}
