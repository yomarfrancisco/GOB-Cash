import { mulberry32, quantile, randomInt } from "./math";
import { syncOrganicPeriod } from "./organic";
import { decideDay } from "./optimizer";
import { evaluateRisk, operatingResources } from "./risk";
import {
  applyScheduledArrivals,
  createInitialState,
  maxFeasibleThroughput,
  releaseRecoveredResources,
  upResources,
} from "./state";
import { applyCleanDay, incrementCalendarAge, lockCapital, resetCleanHistoryForResources } from "./transition";
import type { MonteCarloSummary, Resource, Scenario, SimState } from "./types";

function pickUniform<T>(rng: () => number, items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? items[0] ?? null;
}

function beginSampledInterruption(
  state: SimState,
  scenario: Scenario,
  rng: () => number,
): { long: boolean; duration: number } {
  const long = rng() < scenario.probabilityReviewIsLong;
  const duration = long
    ? randomInt(rng, scenario.longReviewMinDays, scenario.longReviewMaxDays)
    : randomInt(rng, scenario.shortReviewMinDays, scenario.shortReviewMaxDays);

  const scopeSum =
    scenario.interruptionIsCardScope +
    scenario.interruptionIsPosScope +
    scenario.interruptionIsSystemScope || 1;
  const r = rng() * scopeSum;
  const upCards = upResources(state.cards, state.day);
  const upPos = upResources(state.pos, state.day);

  let targets: Resource[] = [];
  if (r < scenario.interruptionIsSystemScope) {
    targets = [...upCards, ...upPos];
  } else if (r < scenario.interruptionIsSystemScope + scenario.interruptionIsCardScope) {
    const hit = pickUniform(rng, upCards);
    if (hit) targets = [hit];
  } else {
    const hit = pickUniform(rng, upPos);
    if (hit) targets = [hit];
  }
  if (targets.length === 0) targets = [...upCards, ...upPos];

  const f = Math.min(1, targets.length / Math.max(1, upCards.length + upPos.length));
  const lockedTotal = scenario.capitalFrozenDuringReview ? f * state.deployableCapital : 0;
  const downUntil = state.day + duration;
  const lockEach = targets.length > 0 ? lockedTotal / targets.length : 0;

  state.merchantInterruptionCount += 1;
  state.merchantCleanHistoryDays = 0;
  for (const resource of targets) {
    resource.downUntilDay = downUntil;
    resource.interruptionCount += 1;
    resource.cleanHistoryDays = 0;
    resource.frozenCapital += lockEach;
  }
  resetCleanHistoryForResources(state, targets.map((r) => r.id));
  if (scenario.capitalFrozenDuringReview) lockCapital(state, lockedTotal);
  return { long, duration };
}

export function runMonteCarlo(
  scenario: Scenario,
  paths = scenario.monteCarloPaths,
  seed = scenario.rngSeed,
): MonteCarloSummary {
  const rng = mulberry32(seed);
  const profits: number[] = [];
  let longCount = 0;
  let downtimeTotal = 0;
  const fastScenario: Scenario = { ...scenario, useLookahead: false };

  for (let p = 0; p < paths; p++) {
    const state = createInitialState(scenario);
    let profit = 0;
    let hadLong = false;
    let downDays = 0;

    for (let day = 1; day <= scenario.horizonDays; day++) {
      state.day = day;
      applyScheduledArrivals(state, fastScenario);
      releaseRecoveredResources(state);
      syncOrganicPeriod(state, fastScenario);

      if (!operatingResources(state) || maxFeasibleThroughput(state, fastScenario) <= 0) {
        downDays += 1;
        incrementCalendarAge(state);
        state.throughputHistory.push(0);
        continue;
      }

      const decision = decideDay(state, fastScenario, false);
      const action = {
        coreThroughput: decision.recommended.throughput,
        organicRevenue: decision.recommended.organicRevenue,
        organicExpense: decision.recommended.organicExpense,
      };
      const risk = evaluateRisk(state, fastScenario, decision.recommended.observedActivity);
      profit += (action.coreThroughput + action.organicRevenue) * scenario.margin;
      if (scenario.capitalMode === "reinvest") {
        state.deployableCapital += (action.coreThroughput + action.organicRevenue) * scenario.margin;
      } else {
        state.extractedProfit += (action.coreThroughput + action.organicRevenue) * scenario.margin;
      }

      applyCleanDay(state, fastScenario, action);

      if (decision.recommended.observedActivity > 0 && rng() < risk.hazard) {
        const hit = beginSampledInterruption(state, fastScenario, rng);
        if (hit.long) hadLong = true;
      }
    }

    profits.push(profit);
    if (hadLong) longCount += 1;
    downtimeTotal += downDays;
  }

  profits.sort((a, b) => a - b);
  return {
    paths,
    seed,
    meanCumulativeProfit: profits.reduce((a, b) => a + b, 0) / Math.max(paths, 1),
    medianCumulativeProfit: quantile(profits, 0.5),
    p10: quantile(profits, 0.1),
    p25: quantile(profits, 0.25),
    p75: quantile(profits, 0.75),
    p90: quantile(profits, 0.9),
    probabilityAtLeastOneLongReview: longCount / Math.max(paths, 1),
    averageDowntimeDays: downtimeTotal / Math.max(paths, 1),
  };
}
