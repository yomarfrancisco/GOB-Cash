/**
 * Thompson sampling glue between the economic residual posterior and the daily decision.
 *
 *   θ̃_t ~ posterior (once per realized day)
 *   a*_t = argmax_a  Q_base(s_t, a) + Δ_G(s_t, a | θ̃_t)
 *
 * Projected states inside the rollout carry no sample, so the continuation is scored
 * on the structural model alone (Δ = 0). The oracle used for offline regret sets the
 * sample to "hidden-truth" and scores Δ*(s,a) instead.
 */
import { streamRng } from "./demand";
import { hiddenEconomicDelta } from "./hiddenWorld";
import {
  deltaUnderTheta,
  learnerFeatures,
  learnerSampleSignature,
  predictDelta,
  sampleThetaForResources,
} from "./learner";
import { packedDesignFromPlan } from "./observations";
import type { AllocationPlan, PackedDesign, PlannedTransaction, Scenario, SimState } from "./types";

export function learnerActive(scenario: Scenario): boolean {
  return scenario.economicLearnerEnabled;
}

export function drawDailySample(state: SimState, scenario: Scenario): void {
  if (!learnerActive(scenario)) {
    state.learnerSample = null;
    return;
  }
  const resourceColumns = [
    ...state.cards.map((c) => `card:${c.id}`),
    ...state.pos.map((p) => `pos:${p.id}`),
  ];
  state.learnerSample = sampleThetaForResources(
    state.learner,
    resourceColumns,
    scenario,
    streamRng(scenario, state.day, "thompson"),
  );
}

export interface DeltaAssessment {
  posteriorDeltaMean: number;
  posteriorDeltaSd: number;
  decisionAdjustment: number;
}

export function assessDelta(state: SimState, scenario: Scenario, design: PackedDesign | null): DeltaAssessment {
  if (!learnerActive(scenario) || !design || design.throughputZar <= 1e-9) {
    return { posteriorDeltaMean: 0, posteriorDeltaSd: 0, decisionAdjustment: 0 };
  }
  const features = learnerFeatures(design, scenario);
  const pred = predictDelta(state.learner, features, scenario);
  let adjustment = 0;
  const sample = state.learnerSample;
  if (sample === "hidden-truth") adjustment = hiddenEconomicDelta(scenario, design);
  else if (sample) adjustment = deltaUnderTheta(sample, features);
  return { posteriorDeltaMean: pred.mean, posteriorDeltaSd: pred.sd, decisionAdjustment: adjustment };
}

export function assessDeltaForPlan(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  transactions: PlannedTransaction[],
): DeltaAssessment {
  if (!learnerActive(scenario)) return { posteriorDeltaMean: 0, posteriorDeltaSd: 0, decisionAdjustment: 0 };
  const design = packedDesignFromPlan(state, plan, transactions);
  if (design && transactions.length === 0 && design.throughputZar > 1e-9) {
    // Held-cover continuation days carry no packed tickets; use the expected count.
    design.transactionCount = Math.max(1, Math.round(design.throughputZar / Math.max(1, scenario.avgTicketZar)));
  }
  return assessDelta(state, scenario, design);
}

/** Cache-key fragment: today's draw (or oracle) plus how many updates the posterior has had. */
export function learnerStateSignature(state: SimState, scenario: Scenario): string {
  if (!learnerActive(scenario)) return "learner-off";
  return `${state.learner.updates}|${learnerSampleSignature(state.learnerSample)}`;
}
