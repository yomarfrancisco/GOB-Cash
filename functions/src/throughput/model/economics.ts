import { eventBased, projectEventLoss, type ActivityRow, type FatesResult } from "./eventLoss";
import { invertSaturatedHazard } from "./math";
import { remainingPhysicalAfterHit } from "./risk";
import type { CandidateEvaluation, Scenario, SimState } from "./types";
import type { RiskSnapshot } from "./risk";

export interface LossBreakdown {
  remainingPhysical: number;
  lockedCapital: number;
  operableThroughput: number;
  lostThroughputPerDay: number;
  turnoverLossPerDay: number;
  liquidityLossPerDay: number;
  lossPerDayIfHit: number;
}

export function interruptionLoss(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  f: number,
): LossBreakdown {
  const remainingPhysical = remainingPhysicalAfterHit(state, scenario, f);
  const capital = Math.max(0, state.deployableCapital);
  const lockedCapital = scenario.capitalFrozenDuringReview ? f * capital : 0;
  const freeCapital = Math.max(0, capital - lockedCapital);
  const operableThroughput = Math.min(throughput, remainingPhysical, freeCapital);
  const lostThroughputPerDay = Math.max(0, throughput - operableThroughput);
  const turnoverLossPerDay = lostThroughputPerDay * scenario.margin;
  const liquidityLossPerDay = scenario.capitalFrozenDuringReview
    ? lockedCapital * scenario.frozenCapitalDailyRate
    : 0;
  return {
    remainingPhysical,
    lockedCapital,
    operableThroughput,
    lostThroughputPerDay,
    turnoverLossPerDay,
    liquidityLossPerDay,
    lossPerDayIfHit: turnoverLossPerDay + liquidityLossPerDay,
  };
}

export function myopicEv(grossProfit: number, expectedContinuityCost: number): number {
  return grossProfit - expectedContinuityCost;
}

export function breakEvenHazard(
  grossProfit: number,
  lossPerDayIfHit: number,
  expectedDuration: number,
): number | null {
  const denom = lossPerDayIfHit * expectedDuration;
  if (denom <= 1e-12) return null;
  return grossProfit / denom;
}

export function impliedP0FromHazard(
  hazard: number,
  scenario: Scenario,
  throughput: number,
  factorProduct: number,
): number | null {
  if (throughput <= 0) return null;
  const raw = invertSaturatedHazard(hazard, scenario.hMax);
  if (raw === null) return null;
  const ratio = throughput / Math.max(scenario.vRefZar, 1e-9);
  const baseShape = ratio ** scenario.gamma * Math.max(factorProduct, 1e-12);
  if (baseShape <= 0) return null;
  return raw / baseShape;
}

/**
 * Event-based loss model inputs. `activity` is today's packed plan (core + organic rows) —
 * dependence weights and in-flight exposure come from it. `fates` are today's demand fates
 * under this action (deferral / expiry charged today); omitted for abstract cover scoring,
 * where they are identical across covers of the same volume.
 */
export interface EconomicsEventInput {
  activity: ActivityRow[];
  fates?: FatesResult;
}

export type EconomicsFill = Pick<
  CandidateEvaluation,
  | "grossProfit"
  | "expectedDurationDays"
  | "expectedShortCost"
  | "expectedLongCost"
  | "freezeCost"
  | "expectedContinuityCost"
  | "myopicEv"
  | "capitalVelocity"
  | "resourceUtilization"
  | "expectedDowntimeShare"
  | "probLongReview30d"
  | "passesRiskConstraint"
  | "demandFates"
  | "eventLoss"
>;

export function fillEconomics(
  state: SimState,
  scenario: Scenario,
  profitableThroughput: number,
  risk: RiskSnapshot,
  durations: { short: number; long: number; blended: number },
  eventInput?: EconomicsEventInput,
): EconomicsFill {
  if (eventBased(scenario)) {
    return fillEventEconomics(state, scenario, profitableThroughput, risk, durations, eventInput);
  }
  const grossProfit = profitableThroughput * scenario.margin;
  const loss = interruptionLoss(
    state,
    scenario,
    profitableThroughput,
    risk.concentration.expectedCapacityLost,
  );
  const h = risk.hazard;
  const q = scenario.probabilityReviewIsLong;
  const expectedShortCost = h * (1 - q) * durations.short * loss.lossPerDayIfHit;
  const expectedLongCost = h * q * durations.long * loss.lossPerDayIfHit;
  const freezeCost = h * durations.blended * loss.liquidityLossPerDay;
  const expectedContinuityCost = expectedShortCost + expectedLongCost;
  const lostShare =
    profitableThroughput > 0
      ? loss.lostThroughputPerDay / profitableThroughput
      : risk.concentration.expectedCapacityLost;
  const expectedDowntimeShare = h * durations.blended * lostShare;
  const probLongReview30d = 1 - (1 - h * q) ** 30;
  const passesRiskConstraint = !scenario.riskConstraintEnabled
    ? true
    : expectedDowntimeShare <= scenario.maxExpectedDowntimeShare &&
      probLongReview30d <= scenario.maxProbLongReview30d;

  const cardCap =
    risk.concentration.usableIndependentCards * scenario.perCardCapacityZar;
  const posCap = risk.concentration.usableIndependentPos * scenario.perPosCapacityZar;
  const physical = Math.max(1e-9, Math.min(cardCap, posCap));

  return {
    grossProfit,
    expectedDurationDays: durations.blended,
    expectedShortCost,
    expectedLongCost,
    freezeCost,
    expectedContinuityCost,
    myopicEv: myopicEv(grossProfit, expectedContinuityCost),
    capitalVelocity: state.deployableCapital > 0 ? profitableThroughput / state.deployableCapital : 0,
    resourceUtilization: profitableThroughput / physical,
    expectedDowntimeShare,
    probLongReview30d,
    passesRiskConstraint,
  };
}

/**
 * lossModel = "eventBased":
 *   myopicEv = gross − deferral cost today − expiry cost today − rerouting cost today
 *              − h · Σ_k π_k Loss_k
 * Loss_k is the event state machine's hit-vs-clean difference (margin on expired demand,
 * δ on backlog Rand-days, c_reroute on rerouted tickets, ρ on locked Rand-days). The
 * interruption is valued here once; the rollout carries no separate hit branch.
 */
function fillEventEconomics(
  state: SimState,
  scenario: Scenario,
  profitableThroughput: number,
  risk: RiskSnapshot,
  durations: { short: number; long: number; blended: number },
  eventInput?: EconomicsEventInput,
): EconomicsFill {
  const grossProfit = profitableThroughput * scenario.margin;
  const h = risk.hazard;
  const q = scenario.probabilityReviewIsLong;
  const activity = eventInput?.activity ?? [];
  const fates = eventInput?.fates?.fates;
  const backlogAfterToday = eventInput?.fates?.nextBacklog ?? (state.backlog ?? []);
  const event = projectEventLoss(state, scenario, { activity, backlogAfterToday }, h, durations);
  const expectedContinuityCost = event.expected.total;
  const todayFateCost = fates ? fates.deferralCostZar + fates.expiryCostZar + fates.rerouteCostZar : 0;
  // Short / long split of the same expected loss (diagnostic only; durations enter Loss_k directly).
  const expectedShortCost = expectedContinuityCost * (1 - q);
  const expectedLongCost = expectedContinuityCost * q;
  const freezeCost = event.expected.carry;
  // Expected days of today's throughput lost to interruption: h-weighted execution shortfall / V.
  const shortfall = event.byDomain.reduce((a, r) => a + r.probability * r.executionShortfallZar, 0);
  const expectedDowntimeShare = profitableThroughput > 1e-9 ? (h * shortfall) / profitableThroughput : h * event.expectedOperatingDaysImpaired;
  const probLongReview30d = 1 - (1 - h * q) ** 30;
  const passesRiskConstraint = !scenario.riskConstraintEnabled
    ? true
    : expectedDowntimeShare <= scenario.maxExpectedDowntimeShare && probLongReview30d <= scenario.maxProbLongReview30d;
  const cardCap = risk.concentration.usableIndependentCards * scenario.perCardCapacityZar;
  const posCap = risk.concentration.usableIndependentPos * scenario.perPosCapacityZar;
  const physical = Math.max(1e-9, Math.min(cardCap, posCap));
  return {
    grossProfit,
    expectedDurationDays: durations.blended,
    expectedShortCost,
    expectedLongCost,
    freezeCost,
    expectedContinuityCost,
    myopicEv: grossProfit - todayFateCost - expectedContinuityCost,
    capitalVelocity: state.deployableCapital > 0 ? profitableThroughput / state.deployableCapital : 0,
    resourceUtilization: profitableThroughput / physical,
    expectedDowntimeShare,
    probLongReview30d,
    passesRiskConstraint,
    demandFates: fates,
    eventLoss: event,
  };
}
