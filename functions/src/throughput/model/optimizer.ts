import { allocateAction, packCoreTickets, withFastCoverSearch, type AllocatedAction } from "./allocation";
import { ledgerSignature } from "./bankRules";
import { ablation, demandFatesForAction, eventBased } from "./eventLoss";
import {
  emptyAction,
  hasTransactionEvidence,
  observedActivity,
  parseAction,
  profitableActivity,
} from "./activity";
import {
  buildDailyActionPlan,
  candidateCoreVolumes,
  offerSignature,
  operatingOrganic,
  resolveExogenousOffer,
} from "./demand";
import { breakEvenHazard, fillEconomics, interruptionLoss, type EconomicsEventInput } from "./economics";
import { organicOffer, syncOrganicPeriod, expenseBudgetAvailable, formatExpenseGuidance, emptyExpenseDiagnosis } from "./organic";
import { expectedReviewDuration, evaluateRisk } from "./risk";
import { nMinusOneConstraintEnabled, nMinusOneFromPackedPlan, planSatisfiesNMinusOne } from "./nMinusOneExposure";
import { maxFeasibleThroughput } from "./state";
import { assessDeltaForPlan, learnerStateSignature } from "./thompson";
import { projectCleanState, projectHitState } from "./transition";
import { formatZar as zar, floorMoney, roundMoney, sum } from "./math";
import type {
  BindingFactor,
  CandidateEvaluation,
  DayAction,
  DayDecision,
  ExpenseTimingDiagnosis,
  Scenario,
  SimState,
} from "./types";

/**
 * Event-based loss model: today's executed rows (dependence weights, in-flight exposure) and the
 * fates of today's genuine demand under this exact packed plan. Undefined under "legacy".
 */
export function eventEconomicsInput(
  state: SimState,
  scenario: Scenario,
  plans: Pick<AllocatedAction, "merged" | "transactions">,
): EconomicsEventInput | undefined {
  if (!eventBased(scenario)) return undefined;
  const offer = resolveExogenousOffer(state, scenario);
  const executed = new Set(plans.transactions.map((t) => t.economicPaymentId));
  return {
    activity: plans.merged.pairs,
    fates: demandFatesForAction(state, scenario, offer.coreTickets, executed),
  };
}

export function assembleCandidate(
  state: SimState,
  scenario: Scenario,
  throughputOrAction: number | DayAction,
): CandidateEvaluation {
  const requested = parseAction(throughputOrAction);
  const arrived = operatingOrganic(state, scenario);
  // Feasibility layer runs inside allocateAction: the plan below already satisfies every hard
  // issuer rule, and any genuine obligation it could not carry is listed in plans.blocked.
  const plans = allocateAction(
    state,
    scenario,
    requested.coreThroughput,
    Math.min(requested.organicRevenue, arrived.revenue),
    Math.min(requested.organicExpense, arrived.expense, expenseBudgetAvailable(state.organic)),
  );
  const corePacked = roundMoney(sum(plans.core.pairs.map((p) => p.amount)));
  // Scored action = executed action: organic amounts are what the feasible plan actually placed.
  const action = {
    coreThroughput: corePacked,
    organicRevenue: floorMoney(Math.min(plans.organicRevenue, requested.organicRevenue, arrived.revenue)),
    organicExpense: floorMoney(
      Math.min(plans.organicExpense, requested.organicExpense, arrived.expense, expenseBudgetAvailable(state.organic)),
    ),
  };
  const observed = observedActivity(action);
  const risk = evaluateRisk(state, scenario, observed, plans.merged, [...plans.transactions, ...plans.organicTransactions]);
  const durations = expectedReviewDuration(scenario);
  const econ = fillEconomics(state, scenario, profitableActivity(action), risk, durations, eventEconomicsInput(state, scenario, plans));
  // Δ_G for this exact packed action: posterior mean / SD (diagnostic) and today's draw (ranking).
  // Only bank-feasible plans reach this point, so the learner never sees or ranks an ineligible action.
  const delta = assessDeltaForPlan(state, scenario, plans.core, plans.transactions);
  const n1 = nMinusOneConstraintEnabled(scenario)
    ? nMinusOneFromPackedPlan(state, scenario, plans.transactions, plans.organicTransactions, action.coreThroughput)
    : null;
  return {
    throughput: action.coreThroughput,
    organicRevenue: action.organicRevenue,
    organicExpense: action.organicExpense,
    observedActivity: observed,
    pBase: risk.pBase,
    rawHazard: risk.rawHazard,
    hazard: risk.hazard,
    factors: risk.factors,
    factorProduct: risk.factorProduct,
    concentration: risk.concentration,
    merchantMaturity: risk.merchantMaturity,
    cardMaturity: risk.cardMaturity,
    posMaturity: risk.posMaturity,
    ticketCount: plans.core.transactionCount || risk.ticketCount,
    ticketFitDeviation: risk.ticketDeviation,
    rampIndex: risk.ramp,
    lookaheadEv: econ.myopicEv,
    objectiveEv: econ.myopicEv,
    rolloutCumulativeEv: econ.myopicEv,
    endingMerchantMaturity: risk.merchantMaturity.score,
    endingCardMaturity: risk.cardMaturity.score,
    continuationCoreThroughput: action.coreThroughput,
    hazardDecomposition: risk.decomposition,
    ...econ,
    posteriorDeltaMean: delta.posteriorDeltaMean,
    posteriorDeltaSd: delta.posteriorDeltaSd,
    decisionAdjustment: delta.decisionAdjustment,
    decisionEv: econ.myopicEv + delta.decisionAdjustment,
    bankFeatures: risk.bankFeatures,
    blocked: plans.blocked,
    nMinusOneThroughputRetention: n1?.nMinusOneExecutableFraction,
    nMinusOneMaxPosShare: n1?.nMinusOneMinAchievableMaxShare,
    nMinusOneWorstCaseLock: n1?.worstCaseLock,
    nMinusOneResilienceFeasible: n1 ? planSatisfiesNMinusOne(action.coreThroughput, n1, scenario) : true,
    nMinusOneResilienceFallback: false,
  };
}

/** decisionEv = objectiveEv + Δ_G(θ̃): the quantity today's action maximises. */
function withDecisionEv(c: CandidateEvaluation): CandidateEvaluation {
  c.decisionEv = c.objectiveEv + c.decisionAdjustment;
  return c;
}

function hasEvidence(state: SimState): boolean {
  return hasTransactionEvidence(
    state.merchantLifetimeVolume,
    state.merchantLifetimeCount,
    state.merchantActiveTradingDays,
  );
}

function myopicStateKey(state: SimState, scenario: Scenario): string {
  return [
    state.day,
    Math.round(state.merchantLifetimeVolume),
    state.merchantActiveTradingDays,
    state.throughputHistory.length,
    Math.round(state.throughputHistory.at(-1) ?? 0),
    Math.round(state.organic.profitLinkedStock),
    Math.round(state.organic.weeklyMinimumStock),
    Math.round(state.organic.monthRevenueRemaining),
    Math.round(state.organic.pendingProfitLinked),
    state.cards.length,
    state.pos.length,
    scenario.meanDailyCoreTickets,
    offerSignature(resolveExogenousOffer(state, scenario)),
    (state.lastOperatingPairKeys ?? []).join(","),
    state.cards.map((c) => `${c.id}:${c.consecutiveOperatingActiveDays ?? 0}`).join(","),
    ledgerSignature(state, scenario),
    // Resource availability / locked capital / backlog (hit states must not share a clean state's entry).
    [...state.cards, ...state.pos].map((r) => `${r.downUntilDay ?? 0}:${Math.round(r.frozenCapital)}`).join(","),
    state.pairs.filter((p) => (p.downUntilDay ?? 0) > state.day).map((p) => `${p.cardId}|${p.posId}:${p.downUntilDay}`).join(","),
    Math.round(state.deployableCapital),
    (state.backlog ?? []).map((t) => `${t.economicPaymentId}:${t.deferrals}`).join(","),
    scenario.lossModel,
    eventBased(scenario)
      ? `${Object.values(scenario.lossDomainProbabilities).join("/")}|${scenario.deferralCostDailyRate}|${scenario.rerouteCostPerTicketZar}|${scenario.ticketMaxDeferralOperatingDays}|${scenario.settlementLagDays}|${scenario.posCapitalLockFraction ?? 0}|${scenario.posExposureLockScale ?? "flat"}|${scenario.posExposureWindowDays ?? 7}|${Object.values(scenario.eventLossAblation).map((v) => (v ? 1 : 0)).join("")}`
      : "",
    scenario.maxEligiblePurchasesPerCardPerDay,
    scenario.repeatedAmountPolicy,
    scenario.highValueSensitivity,
    scenario.repeatCardSensitivity,
    scenario.repeatPairSensitivity,
    scenario.localMixSensitivity,
    `${scenario.repeatWeightSameDay}/${scenario.repeatWeight7d}/${scenario.repeatWeight14d}/${scenario.pairRepeatWeightPrevDay}/${scenario.pairRepeatWeight7d}/${scenario.pairRepeatWeight14d}`,
  ].join("|");
}

const myopicCache = new Map<string, CandidateEvaluation>();

export function myopicBestOn(state: SimState, scenario: Scenario): CandidateEvaluation {
  return withFastCoverSearch(() => {
  const key = [
    scenario.p0,
    scenario.gamma,
    scenario.margin,
    scenario.lookaheadDays,
    scenario.externalOrganicRevenueMonthlyZar,
    scenario.weeklyExpenseFloorZar,
    scenario.monthlyProfitLinkedExpenseRate,
    scenario.concentrationModel,
    scenario.expenseTimingPolicy,
    scenario.pairTieBreak,
    scenario.includePersistenceInHazard ? "1" : "0",
    String(scenario.criticalPersistenceSensitivity ?? 0),
    `beta:${scenario.degradedMaxPosShare ?? "off"}`,
    `n1r:${scenario.nMinusOneRetentionMin ?? "off"}`,
    `n1b:${scenario.nMinusOneMaxPosShareLimit ?? "off"}`,
    scenario.pairOperatingCostZar,
    scenario.newPairCostZar,
    scenario.newPosCostZar,
    scenario.hotPosUseCostZar,
    scenario.coverMixEnabled ? "mix" : "nomix",
    scenario.valueOfInformationEnabled ? "voi" : "novoi",
    scenario.voiConfigurationEnabled ? "cfg" : "nocfg",
    String((state.observations ?? []).length),
    learnerStateSignature(state, scenario),
    scenario.usePosteriorContinuityCalibration ? `cal:${state.continuity.hits}/${state.continuity.exposure.toFixed(4)}` : "nocal",
    myopicStateKey(state, scenario),
  ].join("|");
  const cached = myopicCache.get(key);
  if (cached) return cached;
  const candidates = candidateCoreVolumes(state, scenario);
  const scheduled = { organicRevenue: 0, organicExpense: operatingOrganic(state, scenario).expense };
  // Continuation policy under the model in force: structural when the learner is off,
  // Q_base + Δ_G(θ̃) when a Thompson draw is on the state (decisionEv === myopicEv otherwise).
  let best = assembleCandidate(state, scenario, withOrganic(0, scheduled));
  const evaluated: CandidateEvaluation[] = [best];
  for (const v of candidates) {
    const ev = assembleCandidate(state, scenario, withOrganic(v, scheduled));
    evaluated.push(ev);
  }
  best = pickBest(evaluated, (c) => c.decisionEv, false, scenario);
  if (myopicCache.size > 800) myopicCache.clear();
  myopicCache.set(key, best);
  return best;
  });
}

export function organicChoices(state: SimState, scenario: Scenario): Array<Pick<DayAction, "organicRevenue" | "organicExpense">> {
  const arrived = operatingOrganic(state, scenario);
  const none = { organicRevenue: 0, organicExpense: arrived.expense };
  if (arrived.revenue <= 1e-9) return [none];
  return [none, { organicRevenue: arrived.revenue, organicExpense: arrived.expense }];
}

function withOrganic(core: number, org: Pick<DayAction, "organicRevenue" | "organicExpense">): DayAction {
  return {
    coreThroughput: core,
    organicRevenue: org.organicRevenue,
    organicExpense: org.organicExpense,
  };
}

function myopicBestAction(
  state: SimState,
  scenario: Scenario,
  cores: number[],
  underSampledModel = false,
): DayAction {
  const best = emptyAction();
  const bestEv = -Infinity;
  const orgs = organicChoices(state, scenario);
  const evaluated: CandidateEvaluation[] = [];
  for (const core of cores) {
    for (const org of orgs) {
      evaluated.push(assembleCandidate(state, scenario, withOrganic(core, org)));
    }
  }
  if (evaluated.length === 0) return best;
  const chosen = pickBest(evaluated, (c) => (underSampledModel ? c.decisionEv : c.myopicEv), false, scenario);
  return {
    coreThroughput: chosen.throughput,
    organicRevenue: chosen.organicRevenue,
    organicExpense: chosen.organicExpense,
  };
}

/**
 * Continuation policy used inside the L-day rollout.
 * With transaction evidence (including organic or imported history), follow myopic EV
 * for core, with expense already scheduled from the entitlement stock.
 * While still cold, do not credit a myopic core punch the production policy has not taken;
 * organic revenue 0 vs today’s offer is still chosen by one-day EV.
 */
export function continuationPolicy(state: SimState, scenario: Scenario): DayAction {
  if (hasEvidence(state)) {
    const core = myopicBestOn(state, scenario).throughput;
    return myopicBestAction(state, scenario, [core], true);
  }
  return myopicBestAction(state, scenario, [0], true);
}

export function effectiveRolloutHorizon(state: SimState, scenario: Scenario): number {
  if (!scenario.useLookahead) return 1;
  return Math.max(1, scenario.lookaheadDays);
}

function pathValue(
  state: SimState,
  scenario: Scenario,
  horizon: number,
  forcedCore: number | null = null,
): {
  value: number;
  firstCore: number;
  endingMerchantMaturity: number;
  endingCardMaturity: number;
} {
  return withFastCoverSearch(() => {
  if (horizon <= 0) {
    return {
      value: 0,
      firstCore: 0,
      endingMerchantMaturity: 0,
      endingCardMaturity: 0,
    };
  }
  let cursor = state;
  let value = 0;
  let firstCore = 0;
  let last = assembleCandidate(cursor, scenario, 0);
  let heldCore: number | null = forcedCore;
  for (let t = 0; t < horizon; t++) {
    const action: DayAction =
      heldCore === null
        ? continuationPolicy(cursor, scenario)
        : withOrganic(heldCore, {
            organicRevenue: 0,
            organicExpense: operatingOrganic(cursor, scenario).expense,
          });
    if (t === 0) firstCore = action.coreThroughput;
    last = assembleCandidate(cursor, scenario, action);
    // Continuation days are valued under the same sampled model as today (Δ̃ = 0 when
    // the learner is off or no draw is on the state). The recorded CA stays structural.
    value += last.myopicEv + last.decisionAdjustment;
    cursor = projectCleanState(cursor, scenario, action);
    if (hasEvidence(cursor)) heldCore = action.coreThroughput;
  }
  return {
    value,
    firstCore,
    endingMerchantMaturity: last.merchantMaturity.score,
    endingCardMaturity: last.cardMaturity.score,
  };
  });
}

export function rolloutFirstAction(
  state: SimState,
  scenario: Scenario,
  action: DayAction,
  horizon: number,
): { value: number; today: CandidateEvaluation; continuationCore: number; endingMerchantMaturity: number; endingCardMaturity: number } {
  const today = assembleCandidate(state, scenario, action);
  const H = Math.max(1, horizon);
  if (H <= 1) {
    return {
      value: today.myopicEv,
      today,
      continuationCore: action.coreThroughput,
      endingMerchantMaturity: today.merchantMaturity.score,
      endingCardMaturity: today.cardMaturity.score,
    };
  }
  const clean = projectCleanState(state, scenario, action);
  const h = today.hazard;
  // After any transaction evidence, inner continuation holds the current
  // myopic core rather than re-searching it on every projected first action.
  // Today's a0 is still ranked by the receding L-day Q (horizon does not
  // collapse to 1).
  const continuationCore = hasEvidence(state) ? myopicBestOn(state, scenario).throughput : null;
  const cleanPath = pathValue(clean, scenario, H - 1, continuationCore);
  // Event-based loss model: today's myopicEv already carries h · E[Loss | interruption] from the
  // event state machine (review window, deferred demand catching up, expiry, carry). Valuing a
  // separate hit branch here would charge the same interruption twice, so the continuation is the
  // clean path alone. (Ablation switch keeps the legacy hit branch for attribution only.)
  if (eventBased(scenario) && ablation(scenario).removeSeverityDoubleCount) {
    return {
      value: today.myopicEv + cleanPath.value,
      today,
      continuationCore: cleanPath.firstCore,
      endingMerchantMaturity: cleanPath.endingMerchantMaturity,
      endingCardMaturity: cleanPath.endingCardMaturity,
    };
  }
  const hit = projectHitState(
    state,
    scenario,
    action,
    today.expectedDurationDays,
    today.concentration.expectedCapacityLost,
  );
  const hitPath = pathValue(hit, scenario, H - 1, continuationCore);
  return {
    value: today.myopicEv + (1 - h) * cleanPath.value + h * hitPath.value,
    today,
    continuationCore: cleanPath.firstCore,
    endingMerchantMaturity: cleanPath.endingMerchantMaturity,
    endingCardMaturity: cleanPath.endingCardMaturity,
  };
}

function decorateRollout(base: CandidateEvaluation, rolled: ReturnType<typeof rolloutFirstAction>): CandidateEvaluation {
  return withDecisionEv({
    ...base,
    ...rolled.today,
    lookaheadEv: rolled.value,
    objectiveEv: rolled.value,
    rolloutCumulativeEv: rolled.value,
    continuationCoreThroughput: rolled.continuationCore,
    endingMerchantMaturity: rolled.endingMerchantMaturity,
    endingCardMaturity: rolled.endingCardMaturity,
  });
}

function projectedContinuation(
  state: SimState,
  scenario: Scenario,
  candidate: CandidateEvaluation,
) {
  const action: DayAction = {
    coreThroughput: candidate.throughput,
    organicRevenue: candidate.organicRevenue,
    organicExpense: candidate.organicExpense,
  };
  const idleState = projectCleanState(state, scenario, emptyAction());
  const successState = projectCleanState(state, scenario, action);
  const hitState = projectHitState(
    state,
    scenario,
    action,
    candidate.expectedDurationDays,
    candidate.concentration.expectedCapacityLost,
  );
  const idleMyopic = myopicBestOn(idleState, scenario);
  const cleanMyopic = myopicBestOn(successState, scenario);
  const hitMyopic = myopicBestOn(hitState, scenario);
  const L = Math.max(1, scenario.lookaheadDays);
  const h = candidate.hazard;
  const piIdle = Math.max(0, idleMyopic.myopicEv);
  const piClean = Math.max(0, cleanMyopic.myopicEv);
  const piHit = Math.max(0, hitMyopic.myopicEv);
  return {
    L,
    h,
    idleState,
    successState,
    idleMyopic,
    cleanMyopic,
    hitMyopic,
    piIdle,
    piClean,
    piHit,
    seasoning: (1 - h) * L * (piClean - piIdle),
    hitStateDelta: h * L * (piHit - piIdle),
  };
}

export interface LookaheadDecomposition {
  throughput: number;
  myopicEv: number;
  lookaheadEv: number;
  hazard: number;
  lookaheadDays: number;
  piIdle: number;
  piClean: number;
  piHit: number;
  idleBestV: number;
  cleanBestV: number;
  hitBestV: number;
  idleLookaheadV: number;
  cleanLookaheadV: number;
  idleLookaheadMyopicEv: number;
  cleanLookaheadMyopicEv: number;
  policyConsistentEv: number;
  seasoning: number;
  hitStateDelta: number;
  continuationGap: number;
  idleMerchantMaturity: number;
  cleanMerchantMaturity: number;
  idleCardMaturity: number;
  cleanCardMaturity: number;
  idleRampIndex: number;
  cleanRampIndex: number;
}

export function decomposeLookahead(
  state: SimState,
  scenario: Scenario,
  candidate: CandidateEvaluation,
  includeLookaheadContinuation = true,
): LookaheadDecomposition {
  const proj = projectedContinuation(state, scenario, candidate);
  const idleLookahead = includeLookaheadContinuation
    ? pickBest(evaluateCurve(proj.idleState, scenario, true), (c) => c.lookaheadEv, false, scenario)
    : proj.idleMyopic;
  const cleanLookahead = includeLookaheadContinuation
    ? pickBest(evaluateCurve(proj.successState, scenario, true), (c) => c.lookaheadEv, false, scenario)
    : proj.cleanMyopic;
  const idlePolicyPi = Math.max(0, idleLookahead.myopicEv);
  const cleanPolicyPi = Math.max(0, cleanLookahead.myopicEv);
  const hitPolicyPi = Math.max(0, proj.piHit);
  const policyConsistentEv =
    candidate.myopicEv +
    (1 - proj.h) * proj.L * (cleanPolicyPi - idlePolicyPi) +
    proj.h * proj.L * (hitPolicyPi - idlePolicyPi);
  return {
    throughput: candidate.throughput,
    myopicEv: candidate.myopicEv,
    lookaheadEv: candidate.myopicEv + proj.seasoning + proj.hitStateDelta,
    hazard: proj.h,
    lookaheadDays: proj.L,
    piIdle: proj.piIdle,
    piClean: proj.piClean,
    piHit: proj.piHit,
    idleBestV: proj.idleMyopic.throughput,
    cleanBestV: proj.cleanMyopic.throughput,
    hitBestV: proj.hitMyopic.throughput,
    idleLookaheadV: idleLookahead.throughput,
    cleanLookaheadV: cleanLookahead.throughput,
    idleLookaheadMyopicEv: idleLookahead.myopicEv,
    cleanLookaheadMyopicEv: cleanLookahead.myopicEv,
    policyConsistentEv,
    seasoning: proj.seasoning,
    hitStateDelta: proj.hitStateDelta,
    continuationGap: proj.piClean - proj.piIdle,
    idleMerchantMaturity: proj.idleMyopic.merchantMaturity.score,
    cleanMerchantMaturity: proj.cleanMyopic.merchantMaturity.score,
    idleCardMaturity: proj.idleMyopic.cardMaturity.score,
    cleanCardMaturity: proj.cleanMyopic.cardMaturity.score,
    idleRampIndex: proj.idleMyopic.rampIndex,
    cleanRampIndex: proj.cleanMyopic.rampIndex,
  };
}

function lookaheadValue(
  state: SimState,
  scenario: Scenario,
  candidate: CandidateEvaluation,
): number {
  const action: DayAction = {
    coreThroughput: candidate.throughput,
    organicRevenue: candidate.organicRevenue,
    organicExpense: candidate.organicExpense,
  };
  return rolloutFirstAction(state, scenario, action, Math.max(1, scenario.lookaheadDays)).value;
}

export function evaluateThroughput(
  state: SimState,
  scenario: Scenario,
  throughputOrAction: number | DayAction,
  compareLookahead = scenario.useLookahead,
): CandidateEvaluation {
  const action = parseAction(throughputOrAction);
  const base = assembleCandidate(state, scenario, action);
  if (compareLookahead || scenario.useLookahead) {
    const rolled = rolloutFirstAction(state, scenario, action, effectiveRolloutHorizon(state, scenario));
    return decorateRollout(base, rolled);
  }
  base.lookaheadEv = base.myopicEv;
  base.objectiveEv = base.myopicEv;
  base.rolloutCumulativeEv = base.myopicEv;
  return withDecisionEv(base);
}

export function evaluateCurve(
  state: SimState,
  scenario: Scenario,
  compareLookahead = scenario.useLookahead,
): CandidateEvaluation[] {
  const org = {
    organicRevenue: 0,
    organicExpense: operatingOrganic(state, scenario).expense,
  };
  const seen = new Set<number>();
  const curve: CandidateEvaluation[] = [];
  for (const v of candidateCoreVolumes(state, scenario)) {
    const best = evaluateThroughput(state, scenario, withOrganic(v, org), compareLookahead);
    best.objectiveEv = scenario.useLookahead ? best.lookaheadEv : best.myopicEv;
    withDecisionEv(best);
    const key = Math.round(best.throughput * 100);
    if (seen.has(key)) continue;
    seen.add(key);
    curve.push(best);
  }
  if (!curve.some((c) => c.throughput === 0)) {
    const idle = evaluateThroughput(state, scenario, withOrganic(0, org), compareLookahead);
    idle.objectiveEv = scenario.useLookahead ? idle.lookaheadEv : idle.myopicEv;
    withDecisionEv(idle);
    curve.unshift(idle);
  }
  return curve;
}

function pickBest(
  curve: CandidateEvaluation[],
  score: (c: CandidateEvaluation) => number,
  requireConstraint: boolean,
  scenario?: Scenario,
): CandidateEvaluation {
  const riskPool = requireConstraint ? curve.filter((c) => c.passesRiskConstraint) : curve;
  const resilient = scenario && nMinusOneConstraintEnabled(scenario)
    ? riskPool.filter((c) => c.nMinusOneResilienceFeasible)
    : riskPool;
  const fallback = resilient.length === 0;
  const pool = !fallback ? resilient : riskPool.length > 0 ? riskPool : curve.filter((c) => c.throughput === 0);
  const usable = pool.length > 0 ? pool : curve;
  let best = usable[0] ?? curve[0]!;
  for (const c of usable) {
    if (score(c) > score(best) + 1e-9) best = c;
    else if (Math.abs(score(c) - score(best)) <= 1e-9 && c.throughput < best.throughput) {
      best = c;
    }
  }
  if (fallback && scenario && nMinusOneConstraintEnabled(scenario)) {
    best = { ...best, nMinusOneResilienceFallback: true, nMinusOneResilienceFeasible: false };
  }
  return best;
}

function operatingBand(
  curve: CandidateEvaluation[],
  chosen: CandidateEvaluation,
  scenario: Scenario,
): { min: number; max: number } {
  if (!scenario.showOperatingBand) {
    return { min: chosen.throughput, max: chosen.throughput };
  }
  const best = chosen.objectiveEv;
  if (best <= 0) return { min: 0, max: 0 };
  const cutoff = best * (1 - scenario.bandEvTolerance);
  const inBand = curve.filter((c) => c.objectiveEv >= cutoff && c.objectiveEv >= 0);
  if (inBand.length === 0) return { min: chosen.throughput, max: chosen.throughput };
  return {
    min: Math.min(...inBand.map((c) => c.throughput)),
    max: Math.max(...inBand.map((c) => c.throughput)),
  };
}

function bindingFactors(
  chosen: CandidateEvaluation,
  state: SimState,
  scenario: Scenario,
): BindingFactor[] {
  const factors: BindingFactor[] = [
    {
      id: "cardMaturity",
      label: "Card maturity",
      detail: `${chosen.cardMaturity.category} (${chosen.cardMaturity.score.toFixed(2)})`,
    },
    {
      id: "merchantMaturity",
      label: "Merchant maturity",
      detail: `${chosen.merchantMaturity.category} (${chosen.merchantMaturity.score.toFixed(2)})`,
    },
    {
      id: "cardConcentration",
      label: "Card concentration",
      detail: `${(chosen.concentration.largestCardShare * 100).toFixed(0)}% · HHI ${chosen.concentration.cardHhi.toFixed(2)}`,
    },
    {
      id: "posConcentration",
      label: "POS concentration",
      detail: `${(chosen.concentration.largestPosShare * 100).toFixed(0)}% · HHI ${chosen.concentration.posHhi.toFixed(2)}`,
    },
    {
      id: "pairConcentration",
      label: "Pair concentration",
      detail: `largest pair ${(chosen.concentration.largestPairShare * 100).toFixed(0)}%; pair HHI ${chosen.concentration.pairHhi.toFixed(2)}`,
    },
    {
      id: "rollingConcentration",
      label: "Rolling concentration (hazard input)",
      detail: `today ${chosen.hazardDecomposition.todayConcentration.toFixed(3)} · 7d ${chosen.hazardDecomposition.concentration7d.toFixed(3)} · 14d ${chosen.hazardDecomposition.concentration14d.toFixed(3)} · used ${chosen.hazardDecomposition.combinedConcentrationInput.toFixed(3)} (${chosen.hazardDecomposition.model})`,
    },
    {
      id: "cardHitLoss",
      label: "If one card is interrupted",
      detail: `${(chosen.concentration.expectedCapacityLostIfCardInterrupted * 100).toFixed(0)}% of card capacity (correlation ${(scenario.cardFailureCorrelation * 100).toFixed(0)}%)`,
    },
    {
      id: "posHitLoss",
      label: "If one POS is interrupted",
      detail: `${(chosen.concentration.expectedCapacityLostIfPosInterrupted * 100).toFixed(0)}% of POS capacity (correlation ${(scenario.posFailureCorrelation * 100).toFixed(0)}%)`,
    },
  ];
  if (chosen.nMinusOneThroughputRetention !== undefined) {
    factors.push({
      id: "nMinusOne",
      label: "N−1 post-failure continuity",
      detail: `retention ${(chosen.nMinusOneThroughputRetention * 100).toFixed(0)}% · max surviving share ${((chosen.nMinusOneMaxPosShare ?? 0) * 100).toFixed(0)}%${chosen.nMinusOneResilienceFallback ? " · resilience-infeasible (Q fallback)" : ""}`,
    });
  }
  if (state.cards.length === 1) {
    factors.push({
      id: "singleCard",
      label: "Independent cards",
      detail: "1 — an interruption removes essentially all card capacity",
    });
  } else if (scenario.cardFailureCorrelation > 0) {
    factors.push({
      id: "cardCorrelation",
      label: "Card failure correlation",
      detail: `${state.cards.length} cards are not ${state.cards.length} independent failure domains`,
    });
  }
  return factors;
}

export function dominantBindingConstraint(
  chosen: CandidateEvaluation,
  scenario: Scenario,
): string {
  if (chosen.nMinusOneResilienceFallback) return "N−1 resilience (no candidate met r_min / β)";
  if (chosen.throughput <= 0) return "All positive steps have negative EV";
  if (chosen.concentration.largestCardShare >= 0.99) return "Card concentration (single active card)";
  if (chosen.concentration.largestPosShare >= 0.99) return "POS concentration";
  if (scenario.cardFailureCorrelation >= 0.5 && chosen.concentration.usableIndependentCards >= 2) {
    return "Card failure correlation";
  }
  if (chosen.cardMaturity.category === "Thin" || chosen.merchantMaturity.category === "Thin") {
    return "Thin maturity";
  }
  if (chosen.concentration.pairHhi >= 0.5) return "Card×POS pair concentration";
  return "Continuity cost vs gross margin at the next step";
}

function explainDecision(
  chosen: CandidateEvaluation,
  curve: CandidateEvaluation[],
  scenario: Scenario,
  myopic: CandidateEvaluation,
  lookahead: CandidateEvaluation,
  band: { min: number; max: number },
): string {
  const step = scenario.throughputStepZar;
  const next = curve.find((c) => c.throughput >= chosen.throughput + step - 1e-9);
  const parts: string[] = [];

  if (chosen.throughput === 0) {
    if (chosen.organicRevenue + chosen.organicExpense > 0) {
      parts.push(
        `Core throughput is ${zar(0)}. The model still allocates ${zar(chosen.organicRevenue)} genuine organic revenue and ${zar(chosen.organicExpense)} genuine organic expense to build operating history without deploying core working capital.`,
      );
    } else if (scenario.useLookahead && myopic.throughput > 0) {
      parts.push(
        `The rolling ${scenario.lookaheadDays}-day rollout scores every positive core step at or below idle, so core V* is ${zar(0)}. Myopic same-day EV is still maximised at ${zar(myopic.throughput)}/day. R0 is a valid core recommendation when neither history nor economically available organic activity supports core deployment.`,
      );
    } else {
      parts.push(
        "Under the current assumptions, no positive-value core or organic activity is available, so the model stays idle.",
      );
    }
  } else if (next && next.throughput > chosen.throughput) {
    const extraGross = next.grossProfit - chosen.grossProfit;
    const extraCost = next.expectedContinuityCost - chosen.expectedContinuityCost;
    if (extraCost > extraGross) {
      parts.push(
        `The model stops at ${zar(chosen.throughput)}/day because the next ${zar(step)} adds ${zar(extraGross)} gross profit but increases expected continuity cost by ${zar(extraCost)}.`,
      );
    } else {
      parts.push(
        `Under the current assumptions, ${zar(chosen.throughput)}/day maximises the selected objective even though the next step still adds some gross profit.`,
      );
    }
  }

  if (chosen.concentration.largestCardShare >= 0.99) {
    parts.push(
      "Card concentration is a binding factor. Adding another POS has little continuity effect until independent card capacity increases.",
    );
  } else if (chosen.concentration.usableIndependentCards >= 2) {
    parts.push(
      `A second independent card materially changes the optimum because interruption of one card no longer removes 100% of operating capacity (expected capacity lost ${(chosen.concentration.expectedCapacityLost * 100).toFixed(0)}%).`,
    );
  }

  if (chosen.cardMaturity.category === "Thin" || chosen.merchantMaturity.category === "Thin") {
    parts.push(
      "The system is still Thin: a 60-day idle calendar would not count as established without transaction and clean-history evidence.",
    );
  }

  if (Math.abs(lookahead.throughput - myopic.throughput) > 1) {
    if (scenario.useLookahead && lookahead.throughput < myopic.throughput) {
      parts.push(
        `The L-day rollout recommends core ${zar(lookahead.throughput)} rather than myopic ${zar(myopic.throughput)} because later continuation under the production policy does not justify the extra same-day core exposure.`,
      );
    } else if (scenario.useLookahead && lookahead.throughput > myopic.throughput) {
      parts.push(
        `The L-day rollout recommends core ${zar(lookahead.throughput)} rather than myopic ${zar(myopic.throughput)} because the first operating days raise later continuation value enough to justify more core today.`,
      );
    }
  }

  if (scenario.capitalFrozenDuringReview && chosen.freezeCost > 0) {
    parts.push(
      `Frozen-capital is on: an interruption locks the interrupted share of working capital, adding ${zar(chosen.freezeCost)} of expected liquidity cost at this step.`,
    );
  }

  if (scenario.showOperatingBand && band.max > band.min) {
    parts.push(
      `The useful operating band is ${zar(band.min)}–${zar(band.max)} (within ${(scenario.bandEvTolerance * 100).toFixed(0)}% of the best objective value). ${zar(chosen.throughput)} is the point estimate, not a bank-safe limit.`,
    );
  }

  if (scenario.showBreakEvenHazard) {
    parts.push(
      "Break-even hazard is the interruption probability at which this throughput’s myopic EV would be zero under the same duration and freeze assumptions.",
    );
  }

  const d = chosen.hazardDecomposition;
  if (d.model !== "today") {
    parts.push(
      `Concentration in the hazard uses ${d.model === "rolling-card-pos-pair" ? "Model C (rolling card/POS + pair)" : "Model B (rolling card/POS)"}: today ${d.todayConcentration.toFixed(3)}, 7d ${d.concentration7d.toFixed(3)}, 14d ${d.concentration14d.toFixed(3)} → input ${d.combinedConcentrationInput.toFixed(3)} (coefficient ${scenario.concentrationSensitivity} unchanged). Same-day interruption loss still uses today's physical f=${chosen.concentration.expectedCapacityLost.toFixed(3)}.`,
    );
  }

  return parts.join(" ");
}

function attachOrganicRevenue(
  state: SimState,
  scenario: Scenario,
  chosen: CandidateEvaluation,
  compareLookahead: boolean,
): CandidateEvaluation {
  const arrived = operatingOrganic(state, scenario);
  if (arrived.revenue <= 1e-9) return chosen;
  const alt = evaluateThroughput(
    state,
    scenario,
    withOrganic(chosen.throughput, {
      organicRevenue: arrived.revenue,
      organicExpense: chosen.organicExpense,
    }),
    compareLookahead,
  );
  const score = (c: CandidateEvaluation) =>
    (compareLookahead || scenario.useLookahead ? c.lookaheadEv : c.myopicEv) + c.decisionAdjustment;
  if (score(alt) > score(chosen) + 1e-9) {
    return {
      ...alt,
      nMinusOneResilienceFallback: chosen.nMinusOneResilienceFallback,
      nMinusOneResilienceFeasible: Boolean(alt.nMinusOneResilienceFeasible) && !chosen.nMinusOneResilienceFallback,
    };
  }
  return chosen;
}

function applyOrganicBringForward(
  state: SimState,
  scenario: Scenario,
  chosen: CandidateEvaluation,
  compareLookahead: boolean,
): { chosen: CandidateEvaluation; diagnosis: ExpenseTimingDiagnosis } {
  const available = expenseBudgetAvailable(state.organic);
  const scheduled = operatingOrganic(state, scenario).expense;
  const realized = resolveExogenousOffer(state, scenario).mode === "realized";
  const deferred = realized ? 0 : Math.max(0, available - scheduled);
  const diagnosis: ExpenseTimingDiagnosis = {
    maxLegitimateSpendAvailableToday: realized ? scheduled : available,
    scheduledSpend: scheduled,
    economicallyUsefulAdditionalSpend: 0,
    expenseEntitlementAvailable: available,
    expenseScheduledToday: scheduled,
    expenseDeferred: Math.max(0, available - scheduled),
    marginalValueOfAdditionalOrganicSpendToday: 0,
    bringForwardUpToZar: 0,
    guidance: "",
  };

  const score = (c: CandidateEvaluation) =>
    (compareLookahead || scenario.useLookahead ? c.lookaheadEv : c.myopicEv) + c.decisionAdjustment;

  if (deferred <= 1) {
    diagnosis.guidance = formatExpenseGuidance(diagnosis);
    return { chosen, diagnosis };
  }

  const step = Math.min(1000, deferred);
  const probeMyopic = assembleCandidate(
    state,
    scenario,
    withOrganic(chosen.throughput, {
      organicRevenue: chosen.organicRevenue,
      organicExpense: Math.min(available, scheduled + step),
    }),
  );
  diagnosis.marginalValueOfAdditionalOrganicSpendToday =
    (probeMyopic.myopicEv - chosen.myopicEv) / step;

  const extras = [Math.min(3000, deferred)].filter((d) => d > 1);

  let best = chosen;
  let bestExtra = 0;
  for (const delta of extras) {
    const expense = Math.min(available, scheduled + delta);
    const ev = evaluateThroughput(
      state,
      scenario,
      withOrganic(chosen.throughput, {
        organicRevenue: chosen.organicRevenue,
        organicExpense: expense,
      }),
      compareLookahead,
    );
    if (score(ev) > score(best) + 1e-9) {
      best = ev;
      bestExtra = expense - scheduled;
    }
  }

  diagnosis.economicallyUsefulAdditionalSpend = Math.max(0, bestExtra);
  diagnosis.bringForwardUpToZar = diagnosis.economicallyUsefulAdditionalSpend;
  diagnosis.expenseScheduledToday = scheduled;
  diagnosis.guidance = formatExpenseGuidance(diagnosis);
  return { chosen: best, diagnosis };
}

/**
 * Fixed-policy day: the executed plan is imposed (repricing a plan optimised under another loss
 * model). The evaluation is still the full scorer (myopic + rollout Q) under the scenario in force.
 */
export function forcedDecision(state: SimState, scenario: Scenario, evaluation: CandidateEvaluation, note: string): DayDecision {
  const plans = allocateAction(state, scenario, evaluation.throughput, evaluation.organicRevenue, evaluation.organicExpense);
  const offer = resolveExogenousOffer(state, scenario);
  const actionPlan = buildDailyActionPlan(
    state,
    scenario,
    { coreThroughput: evaluation.throughput, organicRevenue: evaluation.organicRevenue, organicExpense: evaluation.organicExpense },
    plans.transactions,
    plans.organicTransactions,
    plans.blocked,
    offer.coreDemandZar,
  );
  const arrived = operatingOrganic(state, scenario);
  const envelope = organicOffer(state, scenario);
  return {
    day: state.day,
    capital: state.deployableCapital,
    idleCapital: Math.max(0, state.deployableCapital - evaluation.throughput),
    recommended: evaluation,
    myopicRecommended: evaluation,
    lookaheadRecommended: evaluation,
    riskConstrained: evaluation,
    curve: [evaluation],
    bandMin: evaluation.throughput,
    bandMax: evaluation.throughput,
    breakEvenHazard: null,
    impliedHazard: evaluation.hazard,
    hazardSafetyRatio: null,
    bindingFactors: bindingFactors(evaluation, state, scenario),
    explanation: note,
    cardCount: state.cards.length,
    posCount: state.pos.length,
    usableCardCapacity: maxFeasibleThroughput(state, scenario),
    usablePosCapacity: maxFeasibleThroughput(state, scenario),
    organicRevenue: evaluation.organicRevenue,
    organicExpense: evaluation.organicExpense,
    observedActivity: evaluation.observedActivity,
    organicOfferRevenue: arrived.revenue,
    organicOfferExpense: arrived.expense,
    expenseBudgetOpening: envelope.expenseBudgetAvailable,
    expenseScheduledToday: arrived.expense,
    expenseDiagnosis: emptyExpenseDiagnosis(),
    actionPlan,
  };
}

export function decideDay(
  state: SimState,
  scenario: Scenario,
  compareLookahead = true,
): DayDecision {
  syncOrganicPeriod(state, scenario);
  const curve = evaluateCurve(state, scenario, compareLookahead);
  const myopicAction = myopicBestAction(state, scenario, candidateCoreVolumes(state, scenario));
  const myopicRecommended = evaluateThroughput(state, scenario, myopicAction, false);
  const lookaheadRecommended = attachOrganicRevenue(
    state,
    scenario,
    pickBest(curve, (c) => c.lookaheadEv, false, scenario),
    true,
  );
  // Today's action maximises decisionEv = structural objective + Δ_G(θ̃). With the
  // learner off, decisionEv === objectiveEv and this is the previous structural argmax.
  const unconstrained = attachOrganicRevenue(
    state,
    scenario,
    pickBest(curve, (c) => c.decisionEv, false, scenario),
    compareLookahead,
  );
  const riskConstrained = attachOrganicRevenue(
    state,
    scenario,
    pickBest(curve, (c) => c.decisionEv, true, scenario),
    compareLookahead,
  );
  let chosen = scenario.riskConstraintEnabled ? riskConstrained : unconstrained;
  const brought = applyOrganicBringForward(state, scenario, chosen, compareLookahead);
  chosen = brought.chosen;
  const expenseDiagnosis = brought.diagnosis;
  const band = operatingBand(curve, chosen, scenario);
  const durations = expectedReviewDuration(scenario);
  const lossPerDay =
    chosen.hazard > 1e-12 && durations.blended > 0
      ? chosen.expectedContinuityCost / (chosen.hazard * durations.blended)
      : interruptionLoss(
          state,
          scenario,
          profitableActivity({
            coreThroughput: chosen.throughput,
            organicRevenue: chosen.organicRevenue,
            organicExpense: chosen.organicExpense,
          }),
          chosen.concentration.expectedCapacityLost,
        ).lossPerDayIfHit;
  const be = scenario.showBreakEvenHazard
    ? breakEvenHazard(chosen.grossProfit, lossPerDay, chosen.expectedDurationDays)
    : null;
  const maxV = maxFeasibleThroughput(state, scenario);
  const envelope = organicOffer(state, scenario);
  const arrived = operatingOrganic(state, scenario);
  const plans = allocateAction(
    state,
    scenario,
    chosen.throughput,
    chosen.organicRevenue,
    chosen.organicExpense,
  );
  // How much of today's whole genuine offer could pass the hard rules at all (independent of
  // the choice), and which offered tickets no feasible plan could carry. Those are reported as
  // blocked alongside anything the chosen action itself could not execute.
  const offer = resolveExogenousOffer(state, scenario);
  let feasibleCoreDemand = offer.coreDemandZar;
  let blocked = plans.blocked;
  if (scenario.bankRulesEnabled) {
    const offerPack = packCoreTickets(state, scenario, offer.coreTickets);
    feasibleCoreDemand = roundMoney(sum(offerPack.transactions.map((t) => t.amount)));
    const seen = new Set([
      ...plans.transactions.map((t) => t.economicPaymentId),
      ...plans.blocked.map((b) => b.economicPaymentId),
    ]);
    blocked = [...plans.blocked, ...offerPack.blocked.filter((b) => !seen.has(b.economicPaymentId))];
  }
  const actionPlan = buildDailyActionPlan(
    state,
    scenario,
    { coreThroughput: chosen.throughput, organicRevenue: chosen.organicRevenue, organicExpense: chosen.organicExpense },
    plans.transactions,
    plans.organicTransactions,
    blocked,
    feasibleCoreDemand,
  );

  return {
    day: state.day,
    capital: state.deployableCapital,
    idleCapital: Math.max(0, state.deployableCapital - chosen.throughput),
    recommended: chosen,
    myopicRecommended,
    lookaheadRecommended,
    riskConstrained,
    curve,
    bandMin: band.min,
    bandMax: band.max,
    breakEvenHazard: be !== null && Number.isFinite(be) ? be : null,
    impliedHazard: chosen.hazard,
    hazardSafetyRatio:
      be !== null && chosen.hazard > 1e-12 ? be / chosen.hazard : null,
    bindingFactors: bindingFactors(chosen, state, scenario),
    explanation: explainDecision(
      chosen,
      curve,
      scenario,
      myopicRecommended,
      lookaheadRecommended,
      band,
    ),
    cardCount: state.cards.length,
    posCount: state.pos.length,
    usableCardCapacity: maxV,
    usablePosCapacity: maxV,
    organicRevenue: chosen.organicRevenue,
    organicExpense: chosen.organicExpense,
    observedActivity: chosen.observedActivity,
    organicOfferRevenue: arrived.revenue,
    organicOfferExpense: arrived.expense,
    expenseBudgetOpening: envelope.expenseBudgetAvailable,
    expenseScheduledToday: arrived.expense,
    expenseDiagnosis,
    actionPlan,
  };
}
