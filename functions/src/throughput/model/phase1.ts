import { createDefaultScenario, cloneScenario, legacyOneCardOnePosScenario } from "./defaults";
import { FORMULATION } from "./formulation";
import { bindRealizedOffer } from "./demand";
import { syncOrganicPeriod } from "./organic";
import { runMonteCarlo } from "./monteCarlo";
import { decideDay } from "./optimizer";
import { runSanityChecks } from "./sanity";
import { runSensitivityTables } from "./sensitivity";
import { simulate } from "./simulation";
import { applyScheduledArrivals, createInitialState } from "./state";
import type {
  DayDecision,
  MonteCarloSummary,
  SanityCheckResult,
  Scenario,
  SensitivityRow,
  SimulationResult,
} from "./types";

export interface Phase1Report {
  scenario: Scenario;
  formulation: typeof FORMULATION;
  day1: DayDecision;
  optimized: SimulationResult;
  fullCapital: SimulationResult;
  conservative: SimulationResult;
  sensitivity: Record<string, SensitivityRow[]>;
  sanity: SanityCheckResult[];
  monteCarlo: MonteCarloSummary;
  notes: string[];
}

export function runDay1(scenario: Scenario = createDefaultScenario()): DayDecision {
  const state = createInitialState(scenario);
  applyScheduledArrivals(state, scenario);
  syncOrganicPeriod(state, scenario);
  bindRealizedOffer(state, scenario);
  return decideDay(state, scenario, true);
}

export function buildNotes(
  scenario: Scenario,
  day1: DayDecision,
  optimized: SimulationResult,
  fullCapital: SimulationResult,
): string[] {
  const notes: string[] = [];
  if (day1.lookaheadRecommended.throughput === 0 && day1.myopicRecommended.throughput > 0) {
    notes.unshift(
      `Rollout Day-1 core V* is 0 while myopic V* is ${day1.myopicRecommended.throughput}. Organic today is ${day1.organicRevenue + day1.organicExpense}. R0 core is allowed when the L-day continuation does not justify deploying working capital.`,
    );
  }
  if (
    optimized.days.length > 0 &&
    optimized.days.every((d) => d.throughput === 0) &&
    fullCapital.totalContinuityAdjusted > 0
  ) {
    notes.unshift(
      `The optimized path stays at R0 core for all ${optimized.days.length} days while full-capital 180-day continuity-adjusted value is ${Math.round(fullCapital.totalContinuityAdjusted)}. Check organic activity and the candidate rollout table before treating this as a coefficient problem.`,
    );
  }
  if (day1.lookaheadRecommended.throughput < day1.myopicRecommended.throughput) {
    notes.push(
      "Lookahead Day-1 optimum is below the myopic optimum: the model is paying for seasoning / not blowing a thin history.",
    );
  }
  if (day1.lookaheadRecommended.throughput > day1.myopicRecommended.throughput) {
    notes.push(
      "Lookahead Day-1 optimum is above the myopic optimum: some volume today is treated as an investment in maturity.",
    );
  }
  if (optimized.totalContinuityAdjusted > fullCapital.totalContinuityAdjusted) {
    notes.push(
      "Under the current assumptions, deliberately operating below full capital produces higher 180-day continuity-adjusted value than deploying all capital every day.",
    );
  } else {
    notes.push(
      "Under the current assumptions, the full-capital policy’s continuity-adjusted 180-day value is at least as high as the optimiser. Check whether hazard is too mild relative to margin.",
    );
  }
  if (Math.abs(day1.bandMax - day1.bandMin) >= scenario.throughputStepZar) {
    notes.push(
      `The objective is relatively flat near the peak. Treat ${day1.bandMin}–${day1.bandMax} as the operating band, not a single precise Rand amount.`,
    );
  }
  notes.push(
    "EV-mode 180-day paths never realise downtime, so they keep accumulating hazard every calendar day. Monte Carlo means will usually sit below EV-mode cumulative EV for that reason.",
  );
  if (day1.cardCount <= 1) {
    notes.push(
      "On a one-card cold start, frozen capital mainly adds the illustrative liquidity term. The freeze switch becomes first-order once a second independent resource could still operate.",
    );
  } else {
    notes.push(
      `Day 1 has ${day1.cardCount} cards and ${day1.posCount} POS. Card failure correlation is ${(scenario.cardFailureCorrelation * 100).toFixed(0)}%, so extra cards reduce expected capacity lost only on the independent share.`,
    );
  }
  return notes;
}

export function runHorizon(scenario: Scenario, day1: DayDecision) {
  const state = createInitialState(scenario);
  const optimized = simulate(state, scenario, "optimize");
  const fullCapital = simulate(state, scenario, "full-capital");
  const conservative = simulate(state, scenario, "conservative");
  return {
    optimized,
    fullCapital,
    conservative,
    notes: buildNotes(scenario, day1, optimized, fullCapital),
  };
}

export function inspectVersusOneCard(scenario: Scenario, day1: DayDecision): {
  oneCardThroughput: number;
  sameDay1Optimum: boolean;
} {
  const one = runDay1(legacyOneCardOnePosScenario(cloneScenario(scenario)));
  return {
    oneCardThroughput: one.recommended.throughput,
    sameDay1Optimum: Math.abs(one.recommended.throughput - day1.recommended.throughput) < 1,
  };
}

export function runPhase1Report(
  scenario: Scenario = createDefaultScenario(),
  monteCarloPaths = 200,
): Phase1Report {
  const day1 = runDay1(scenario);
  const horizon = runHorizon(scenario, day1);
  return {
    scenario,
    formulation: FORMULATION,
    day1,
    ...horizon,
    sensitivity: runSensitivityTables(scenario),
    sanity: runSanityChecks(),
    monteCarlo: runMonteCarlo(scenario, monteCarloPaths, scenario.rngSeed),
    notes: horizon.notes,
  };
}
