import { saturate } from "./math";
import type {
  MaturityBreakdown,
  MaturityCategory,
  MaturityWeights,
  Resource,
  Scenario,
  SimState,
} from "./types";

function categoryOf(score: number, scenario: Scenario): MaturityCategory {
  if (score < scenario.thinMax) return "Thin";
  if (score < scenario.developingMax) return "Developing";
  return "Established";
}

function weightedScore(
  components: MaturityBreakdown["components"],
  weights: MaturityWeights,
): number {
  const total =
    weights.age + weights.count + weights.volume + weights.activeDays + weights.clean;
  if (total <= 0) return 0;
  return (
    (weights.age * components.age +
      weights.count * components.count +
      weights.volume * components.volume +
      weights.activeDays * components.activeDays +
      weights.clean * components.clean) /
    total
  );
}

export function resourceMaturity(
  resource: Resource,
  scenario: Scenario,
): MaturityBreakdown {
  const isCard = resource.kind === "card";
  const components = {
    age: saturate(
      resource.daysActive,
      isCard ? scenario.cardAgeDaysToMature : scenario.posAgeDaysToMature,
    ),
    count: saturate(
      resource.lifetimeCount,
      isCard ? scenario.cardCountToMature : scenario.posCountToMature,
    ),
    volume: saturate(
      resource.lifetimeVolume,
      isCard ? scenario.cardVolumeToMature : scenario.posVolumeToMature,
    ),
    activeDays: saturate(
      resource.activeTradingDays,
      isCard ? scenario.cardActiveDaysToMature : scenario.posActiveDaysToMature,
    ),
    clean: saturate(
      resource.cleanHistoryDays,
      isCard ? scenario.cardCleanDaysToMature : scenario.posCleanDaysToMature,
    ),
  };
  const score = weightedScore(
    components,
    isCard ? scenario.cardMaturityWeights : scenario.posMaturityWeights,
  );
  return { score, category: categoryOf(score, scenario), components };
}

export function merchantMaturity(
  state: SimState,
  scenario: Scenario,
): MaturityBreakdown {
  const components = {
    age: saturate(state.merchantDaysActive, scenario.merchantAgeDaysToMature),
    count: saturate(state.merchantLifetimeCount, scenario.merchantCountToMature),
    volume: saturate(state.merchantLifetimeVolume, scenario.merchantVolumeToMature),
    activeDays: saturate(
      state.merchantActiveTradingDays,
      scenario.merchantActiveDaysToMature,
    ),
    clean: saturate(state.merchantCleanHistoryDays, scenario.merchantCleanDaysToMature),
  };
  const score = weightedScore(components, scenario.merchantMaturityWeights);
  return { score, category: categoryOf(score, scenario), components };
}

export function pooledResourceMaturity(
  resources: Resource[],
  scenario: Scenario,
  volumes: number[],
): MaturityBreakdown {
  if (resources.length === 0) {
    return {
      score: 0,
      category: "Thin",
      components: { age: 0, count: 0, volume: 0, activeDays: 0, clean: 0 },
    };
  }
  const breakdowns = resources.map((r) => resourceMaturity(r, scenario));
  const weightSum = volumes.reduce((a, b) => a + b, 0);
  const weights =
    weightSum > 0 ? volumes : resources.map(() => 1 / resources.length);
  const wTotal = weights.reduce((a, b) => a + b, 0);
  const score =
    breakdowns.reduce((acc, b, i) => acc + b.score * (weights[i] ?? 0), 0) / wTotal;
  const components = {
    age: breakdowns.reduce((acc, b, i) => acc + b.components.age * (weights[i] ?? 0), 0) / wTotal,
    count:
      breakdowns.reduce((acc, b, i) => acc + b.components.count * (weights[i] ?? 0), 0) / wTotal,
    volume:
      breakdowns.reduce((acc, b, i) => acc + b.components.volume * (weights[i] ?? 0), 0) / wTotal,
    activeDays:
      breakdowns.reduce(
        (acc, b, i) => acc + b.components.activeDays * (weights[i] ?? 0),
        0,
      ) / wTotal,
    clean:
      breakdowns.reduce((acc, b, i) => acc + b.components.clean * (weights[i] ?? 0), 0) / wTotal,
  };
  return {
    score,
    category: categoryOf(score, scenario),
    components,
  };
}

/** Continuity-adjusted usable fraction of a resource's physical capacity. */
export function usableFraction(maturityScore: number): number {
  const floor = 0.15;
  return floor + (1 - floor) * maturityScore;
}
