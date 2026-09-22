import { cloneState } from "./state";
import type { SimState } from "./types";

/**
 * What the engine learned in one cycle, packaged so the next cycle can start from it.
 *
 * This is the belief side only: resource and pair maturity, the Kernel-Bayes evidence
 * log, the economic-residual posterior, continuity evidence, the trailing bank ledger
 * and persisted declines. It never contains the hidden world (true bank liquidity) and
 * it never contains capital, authority or unfilled demand — those are re-established by
 * the cycle that opens (Slice 1 carries the demand residual explicitly as authorised
 * demand, so the kernel backlog is not carried, or it would be counted twice).
 *
 * Day-relative fields are re-based so the successor's day 1 is the day after the
 * predecessor's last operating day. A cycle horizon is a whole number of weeks, so the
 * weekday calendar stays aligned.
 */
export interface CarriedBeliefs {
  version: 1;
  /** Operating days that elapsed in the cycle this was taken from. */
  elapsedDays: number;
  /** Belief-bearing state, already re-based so that day 1 is "tomorrow". */
  state: SimState;
}

export const CARRIED_BELIEFS_VERSION = 1 as const;

/** Snapshot the learned state at the end of a cycle. Pure: does not mutate `ending`. */
export function extractCarriedBeliefs(ending: SimState): CarriedBeliefs {
  const elapsedDays = Math.max(0, ending.day);
  const state = rebase(cloneState(ending), elapsedDays);
  return { version: CARRIED_BELIEFS_VERSION, elapsedDays, state };
}

/**
 * Start a fresh cycle from carried beliefs. Capital, organic ledger and per-cycle demand
 * stock come from `fresh` (the scenario for the cycle that is opening); everything the
 * engine learned comes from `carried`.
 */
export function seedStateFromCarried(fresh: SimState, carried: CarriedBeliefs): SimState {
  if (carried.version !== CARRIED_BELIEFS_VERSION) {
    throw new Error(`unsupported carried beliefs version ${String(carried.version)}`);
  }
  const learned = cloneState(carried.state);
  return {
    ...learned,
    day: 1,
    deployableCapital: fresh.deployableCapital,
    extractedProfit: 0,
    trappedCapital: 0,
    organic: fresh.organic,
    learnerSample: null,
    backlog: [],
    expiredDemandZar: 0,
    exogenousOffer: undefined,
    // Identity and ownership are per-cycle fixtures; keep the fresh stamp, carry the history.
    cards: learned.cards.map((card, index) => ({ ...card, ...identity(fresh.cards[index]), frozenCapital: 0 })),
    pos: learned.pos.map((pos, index) => ({ ...pos, ...identity(fresh.pos[index]), frozenCapital: 0 })),
    pairs: learned.pairs.map((pair) => ({ ...pair, frozenCapital: 0 })),
  };
}

function identity(resource: SimState["cards"][number] | undefined) {
  if (!resource) return {};
  return {
    id: resource.id,
    name: resource.name,
    kind: resource.kind,
    ownerOperatorId: resource.ownerOperatorId,
    institutionId: resource.institutionId,
    cardOrigin: resource.cardOrigin,
    pinCapableFlow: resource.pinCapableFlow,
    cardPresentFlow: resource.cardPresentFlow,
  };
}

/** Shift every day-relative field back by `shift` so the next day is day 1. Mutates and returns `state`. */
function rebase(state: SimState, shift: number): SimState {
  const day = (value: number): number => value - shift;
  const maybeDay = (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : value - shift;
  state.day = 0;
  for (const resource of [...state.cards, ...state.pos]) {
    resource.installedOnDay = day(resource.installedOnDay);
    resource.downUntilDay = downAfterRebase(maybeDay(resource.downUntilDay));
  }
  for (const pair of state.pairs) {
    pair.firstActiveDay = maybeDay(pair.firstActiveDay);
    pair.lastUsedDay = maybeDay(pair.lastUsedDay);
    pair.downUntilDay = downAfterRebase(maybeDay(pair.downUntilDay));
  }
  // The engine keys its evidence log as `sim:${day}`. Re-key on the re-based day so the
  // successor's own day 1 appends to the log instead of replacing what day 1 learned before.
  const renamed = new Map<string, string>();
  for (const observation of state.observations) {
    const match = /^sim:(-?\d+)$/.exec(observation.id);
    if (match) renamed.set(observation.id, `sim:${day(Number(match[1]))}`);
  }
  for (const observation of state.observations) {
    observation.observedAt = { ...observation.observedAt, simDay: day(observation.observedAt.simDay) };
    observation.id = renamed.get(observation.id) ?? observation.id;
    const replacesId = observation.provenance.replacesId;
    if (replacesId && renamed.has(replacesId)) {
      observation.provenance = { ...observation.provenance, replacesId: renamed.get(replacesId) };
    }
  }
  state.bankLedger = (state.bankLedger ?? []).map((row) => ({ ...row, day: day(row.day) }));
  state.declines = (state.declines ?? []).map((row) => ({ ...row, day: day(row.day) }));
  state.interruptionEvents = (state.interruptionEvents ?? []).map((event) => ({
    ...event,
    day: day(event.day),
    downUntilDay: day(event.downUntilDay),
  }));
  return state;
}

/** A review that would already be over by the new day 1 is simply cleared. */
function downAfterRebase(downUntilDay: number | null): number | null {
  if (downUntilDay === null) return null;
  return downUntilDay <= 1 ? null : downUntilDay;
}
