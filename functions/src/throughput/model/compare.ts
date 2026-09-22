import { createInitialState } from "./state";
import { simulate } from "./simulation";
import { cloneScenario, createDefaultScenario, legacyOneCardOnePosScenario } from "./defaults";
import type { Scenario, SimulationResult } from "./types";

export interface ScenarioSnapshot {
  name: string;
  preset: string;
  day1: number;
  day30: number;
  day60: number;
  day90: number;
  day180: number;
  grossThroughput: number;
  grossProfit: number;
  continuityAdjusted: number;
  expectedDowntime: number;
  longReviewProbability: number;
  endingCapital: number;
  bindingDay1: string;
  bindingDay30: string;
  bindingDay60: string;
  bindingDay90: string;
  bindingDay180: string;
}

function throughputOn(sim: SimulationResult, day: number): number {
  const row = sim.days.find((d) => d.day === day) ?? sim.days[sim.days.length - 1];
  return row?.throughput ?? 0;
}

function bindingOn(sim: SimulationResult, day: number): string {
  const row = sim.days.find((d) => d.day === day) ?? sim.days[sim.days.length - 1];
  return row?.dominantBindingConstraint ?? "—";
}

function longReviewProbability(sim: SimulationResult, q: number): number {
  let survival = 1;
  for (const day of sim.days) {
    survival *= 1 - Math.min(1, day.hazard * q);
  }
  return 1 - survival;
}

export function snapshotFromSimulation(scenario: Scenario, sim: SimulationResult): ScenarioSnapshot {
  const grossThroughput = sim.days.reduce((acc, d) => acc + d.throughput, 0);
  return {
    name: scenario.name,
    preset: scenario.preset,
    day1: throughputOn(sim, 1),
    day30: throughputOn(sim, 30),
    day60: throughputOn(sim, 60),
    day90: throughputOn(sim, 90),
    day180: throughputOn(sim, 180),
    grossThroughput,
    grossProfit: sim.totalGrossProfit,
    continuityAdjusted: sim.totalContinuityAdjusted,
    expectedDowntime: sim.totalExpectedDowntimeDays,
    longReviewProbability: longReviewProbability(sim, scenario.probabilityReviewIsLong),
    endingCapital: sim.endingCapital,
    bindingDay1: bindingOn(sim, 1),
    bindingDay30: bindingOn(sim, 30),
    bindingDay60: bindingOn(sim, 60),
    bindingDay90: bindingOn(sim, 90),
    bindingDay180: bindingOn(sim, 180),
  };
}

export function compareScenario(scenario: Scenario): ScenarioSnapshot {
  const sim = simulate(createInitialState(scenario), scenario, "optimize");
  return snapshotFromSimulation(scenario, sim);
}

export function compareScenarios(scenarios: Scenario[]): ScenarioSnapshot[] {
  return scenarios.map(compareScenario);
}

export function compareLegacyVsCurrent(current: Scenario = createDefaultScenario()): {
  old: ScenarioSnapshot;
  current: ScenarioSnapshot;
  sameDay1Optimum: boolean;
} {
  const oldScenario = legacyOneCardOnePosScenario(cloneScenario(current));
  const oldSnap = compareScenario(oldScenario);
  const newSnap = compareScenario(current);
  return {
    old: oldSnap,
    current: { ...newSnap, name: `New: ${current.initialCards} cards / ${current.initialPos} POS (max ${current.maximumPosDevices} POS)` },
    sameDay1Optimum: Math.abs(oldSnap.day1 - newSnap.day1) < 1,
  };
}
