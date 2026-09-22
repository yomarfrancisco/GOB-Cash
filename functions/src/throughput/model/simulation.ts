import { emptyAction, parseAction } from "./activity";
import { buildCalendarEntry } from "./calendar";
import { bindRealizedOffer, isOperatingWeekday, operatingOrganic } from "./demand";
import { expenseBudgetAvailable, disableOrganic, syncOrganicPeriod } from "./organic";
import {
  decideDay,
  dominantBindingConstraint,
  evaluateThroughput,
  forcedDecision,
  organicChoices,
} from "./optimizer";
import {
  applyScheduledArrivals,
  cloneState,
  maxFeasibleThroughput,
  releaseRecoveredResources,
  upResources,
} from "./state";
import { drawDailySample } from "./thompson";
import { applyCleanDay } from "./transition";
import { collectSurpriseFlags } from "./pathFlags";
import { evaluationOpenItems } from "./eventLoss";
import {
  applyRegimeToDayRow,
  cascadeFieldsFromOpen,
  operationalFeasibility,
  resourcesStillDegraded,
  summarizeCascadePath,
} from "./cascade";
import type {
  CalendarEntry,
  CandidateEvaluation,
  DayAction,
  EvaluationTailResult,
  Scenario,
  SimState,
  SimulationDayRow,
  SimulationResult,
} from "./types";

export type PolicyName =
  | "optimize"
  | "full-capital"
  | "conservative"
  | "warmup-then-optimize"
  | "idle"
  | "core-only"
  | "organic-then-optimize";

export interface SimulateOptions {
  warmupThroughput?: number;
  warmupDays?: number;
  /** When set, calendar inspector rows are only stored through this day (180-day CA still runs). */
  calendarThroughDay?: number;
  /**
   * Stop after this many realized operating days. Does not change scenario.horizonDays
   * or lookaheadDays, and does not cap the internal L-day rollout.
   */
  realizedThroughDay?: number;
  /**
   * First calendar day to realize. Default 1. Used to continue from a persisted
   * intra-horizon state without replaying earlier days. Absent = existing behaviour.
   */
  startDay?: number;
  /**
   * Fixed-policy repricing: per day, the exact genuine tickets (economicPaymentIds) and organic
   * amounts to execute. The offer is re-ordered so those tickets are packed first; everything is
   * then scored (myopic, rollout Q, fates, expected loss) under the scenario in force. Days not
   * listed are idle.
   */
  forcedPlans?: Record<number, ForcedDayPlan>;
  /**
   * After realizedThroughDay, continue with no new ordinary demand until backlog, active
   * reviews and locked settlement capital are clear, or until maxCalendarDays extra calendar
   * days (default 30). Does not change the optimizer's beliefs during the first realizedThroughDay
   * days — lookahead there still assumes ordinary demand continues.
   */
  evaluationTail?: { maxCalendarDays?: number };
  /**
   * After realizedThroughDay, continue with ordinary demand while any review is still open
   * (POS/card/pair down or frozen capital), up to maxExtraDays. Used by the cascade experiment
   * so a long review can finish and a second hit can arrive before recovery.
   */
  extendWhileDegraded?: { maxExtraDays?: number };
  /**
   * After this day's T2, force a POS-scoped review lasting `operatingDaysDown` subsequent
   * operating mornings (lock = posCapitalLockFraction). Random hits are skipped that day and
   * enabled afterwards if realizedCascadeEnabled is set on the scenario going forward.
   */
  forcePosReview?: { afterDay: number; operatingDaysDown: number };
  /** Slice 0: mutate mandate/cycle state after arrivals, before today's offer is drawn. */
  beforeBindOffer?: (state: SimState, day: number) => void;
  /** Slice 0: reshape today's exogenous offer (authority clip). No-op when unset. */
  reshapeOffer?: (state: SimState, scenario: Scenario) => void;
  /** Slice 0: observe the packed day after it is applied. */
  afterDay?: (input: {
    state: SimState;
    day: number;
    evaluation: CandidateEvaluation;
    calendarEntry: CalendarEntry | undefined;
  }) => void;
}

function evaluationTailScenario(scenario: Scenario): Scenario {
  return { ...scenario, suppressNewDemand: true, meanDailyCoreTickets: 0 };
}

export interface ForcedDayPlan {
  paymentIds: string[];
  organicRevenue: number;
  organicExpense: number;
}

function bestForcedCore(
  state: SimState,
  scenario: Scenario,
  core: number,
  useLookahead: boolean,
): CandidateEvaluation {
  const maxV = maxFeasibleThroughput(state, scenario);
  const clamped = Math.min(Math.max(0, core), maxV);
  const orgs = organicChoices(state, scenario);
  let best = evaluateThroughput(state, scenario, { coreThroughput: clamped, ...orgs[0]! }, useLookahead);
  for (const org of orgs.slice(1)) {
    const ev = evaluateThroughput(state, scenario, { coreThroughput: clamped, ...org }, useLookahead);
    const score = (c: CandidateEvaluation) => (useLookahead ? c.lookaheadEv : c.myopicEv);
    if (score(ev) > score(best) + 1e-9) best = ev;
  }
  return best;
}

function actionFromEval(evaluation: CandidateEvaluation): DayAction {
  return parseAction({
    coreThroughput: evaluation.throughput,
    organicRevenue: evaluation.organicRevenue,
    organicExpense: evaluation.organicExpense,
  });
}

export function simulate(
  stateIn: SimState,
  scenario: Scenario,
  policy: PolicyName,
  options: SimulateOptions = {},
): SimulationResult {
  let decisionScenario =
    policy === "core-only" ? disableOrganic(scenario) : scenario;
  const state = cloneState(stateIn);
  const days: SimulationDayRow[] = [];
  const calendar: CalendarEntry[] = [];
  let cumulativeGross = 0;
  let cumulativeEv = 0;
  let totalExpectedDowntimeDays = 0;
  let totalCoreThroughput = 0;
  let totalOrganicBroughtForward = 0;
  let totalOrganicRevenue = 0;
  let totalOrganicExpense = 0;
  let cumulativeExpenseEntitlement = 0;
  const warmupDays = Math.max(0, options.warmupDays ?? 0);
  const warmupThroughput = Math.max(0, options.warmupThroughput ?? 0);
  const realizedThroughDay = Math.max(
    1,
    Math.min(scenario.horizonDays, options.realizedThroughDay ?? scenario.horizonDays),
  );

  const runDay = (day: number, inTail: boolean, keepCalendar = false): void => {
    state.day = day;
    const arrived = applyScheduledArrivals(state, decisionScenario);
    const arrivingCardIds = arrived.filter((id) => id.startsWith("card-"));
    const arrivingPosIds = arrived.filter((id) => id.startsWith("pos-"));
    releaseRecoveredResources(state);
    syncOrganicPeriod(state, decisionScenario);
    options.beforeBindOffer?.(state, day);
    bindRealizedOffer(state, decisionScenario);
    options.reshapeOffer?.(state, decisionScenario);
    const feasibility = operationalFeasibility(state, decisionScenario);
    const cascadeOpen = cascadeFieldsFromOpen(state, decisionScenario);
    // Thompson: one draw θ̃_t ~ posterior per realized day; all of today's candidates share it.
    drawDailySample(state, decisionScenario);

    const openingBudget = expenseBudgetAvailable(state.organic);
    const entitlementAdded = state.organic.lastExpenseEntitlementAdded;
    const weeklyAccrual = state.organic.lastWeeklyMinimumAccrual;
    const profitLinkedAccrual = state.organic.lastProfitLinkedAccrual;

    let evaluation: CandidateEvaluation;
    const inWarmup = policy === "warmup-then-optimize" && day <= warmupDays;
    const inOrganicWarmup = policy === "organic-then-optimize" && day <= warmupDays;
    if (options.forcedPlans && !inTail) {
      const forced = options.forcedPlans[day];
      const offer = state.exogenousOffer;
      let core = 0;
      if (forced && offer) {
        const wanted = new Set(forced.paymentIds);
        const first = offer.coreTickets.filter((t) => wanted.has(t.economicPaymentId ?? ""));
        const rest = offer.coreTickets.filter((t) => !wanted.has(t.economicPaymentId ?? ""));
        state.exogenousOffer = { ...offer, coreTickets: [...first, ...rest] };
        core = first.reduce((a, t) => a + t.amount, 0);
      }
      const useLookahead = isOperatingWeekday(day) && decisionScenario.useLookahead;
      evaluation = evaluateThroughput(
        state,
        decisionScenario,
        { coreThroughput: core, organicRevenue: forced?.organicRevenue ?? 0, organicExpense: forced?.organicExpense ?? 0 },
        useLookahead,
      );
      const calLimit = options.calendarThroughDay ?? (inTail || keepCalendar ? Number.POSITIVE_INFINITY : realizedThroughDay);
      if (day <= calLimit) {
        calendar.push(
          buildCalendarEntry(
            state,
            decisionScenario,
            forcedDecision(state, decisionScenario, evaluation, "Fixed policy: plan imposed from another run and re-priced under the scenario in force."),
            arrivingCardIds,
            arrivingPosIds,
          ),
        );
      }
    } else if (policy === "idle") {
      evaluation = evaluateThroughput(state, decisionScenario, emptyAction(), false);
    } else if (inWarmup) {
      evaluation = bestForcedCore(
        state,
        decisionScenario,
        warmupThroughput,
        false,
      );
    } else if (inOrganicWarmup) {
      evaluation = bestForcedCore(state, decisionScenario, 0, decisionScenario.useLookahead);
    } else if (policy === "optimize" || policy === "warmup-then-optimize" || policy === "organic-then-optimize" || policy === "core-only") {
      const operatingScenario = isOperatingWeekday(day)
        ? decisionScenario
        : { ...decisionScenario, useLookahead: false };
      const decision = decideDay(state, operatingScenario, operatingScenario.useLookahead);
      evaluation = decision.recommended;
      const calLimit = options.calendarThroughDay ?? (inTail || keepCalendar ? Number.POSITIVE_INFINITY : realizedThroughDay);
      if (day <= calLimit) {
        calendar.push(buildCalendarEntry(state, decisionScenario, decision, arrivingCardIds, arrivingPosIds));
      }
    } else {
      const maxV = maxFeasibleThroughput(state, decisionScenario);
      const throughput =
        policy === "full-capital"
          ? maxV
          : Math.min(scenario.conservativeThroughputZar, maxV);
      evaluation = bestForcedCore(state, decisionScenario, throughput, false);
    }

    const gross = evaluation.grossProfit;
    const ev = evaluation.myopicEv;
    cumulativeGross += gross;
    cumulativeEv += ev;
    totalExpectedDowntimeDays += evaluation.expectedDowntimeShare;
    totalCoreThroughput += evaluation.throughput;
    totalOrganicRevenue += evaluation.organicRevenue;
    totalOrganicExpense += evaluation.organicExpense;
    cumulativeExpenseEntitlement += entitlementAdded;
    const cadenceSpend = operatingOrganic(state, decisionScenario).expense;
    totalOrganicBroughtForward += Math.max(0, evaluation.organicExpense - cadenceSpend);
    const closingBudget = Math.max(0, openingBudget - evaluation.organicExpense);

    if (scenario.capitalMode === "reinvest") {
      state.deployableCapital += gross;
    } else {
      state.extractedProfit += gross;
    }

    days.push({
      day,
      throughput: evaluation.throughput,
      grossProfit: gross,
      continuityAdjustedEv: ev,
      cumulativeGross,
      cumulativeEv,
      capital: state.deployableCapital,
      hazard: evaluation.hazard,
      cardCount: state.cards.length,
      posCount: state.pos.length,
      activeCardCount: upResources(state.cards, day).length,
      activePosCount: upResources(state.pos, day).length,
      merchantMaturity: evaluation.merchantMaturity.score,
      cardMaturity: evaluation.cardMaturity.score,
      merchantCategory: evaluation.merchantMaturity.category,
      cardCategory: evaluation.cardMaturity.category,
      largestCardShare: evaluation.concentration.largestCardShare,
      cardHhi: evaluation.concentration.cardHhi,
      largestPosShare: evaluation.concentration.largestPosShare,
      posHhi: evaluation.concentration.posHhi,
      pairHhi: evaluation.concentration.pairHhi,
      expectedCapacityLost: evaluation.concentration.expectedCapacityLost,
      expectedCapacityLostIfCardInterrupted:
        evaluation.concentration.expectedCapacityLostIfCardInterrupted,
      expectedCapacityLostIfPosInterrupted:
        evaluation.concentration.expectedCapacityLostIfPosInterrupted,
      dominantBindingConstraint: dominantBindingConstraint(evaluation, scenario),
      coreThroughput: evaluation.throughput,
      organicRevenue: evaluation.organicRevenue,
      organicExpense: evaluation.organicExpense,
      totalActivity: evaluation.observedActivity,
      pairsUsed: calendar[calendar.length - 1]?.day === day ? calendar[calendar.length - 1]!.pairsUsed : 0,
      expenseEntitlementAdded: entitlementAdded,
      expenseBudgetOpening: openingBudget,
      expenseBudgetClosing: closingBudget,
      weeklyMinimumAccrual: weeklyAccrual,
      profitLinkedAccrual: profitLinkedAccrual,
      cumulativeExpenseEntitlement,
      cumulativeOrganicExpense: totalOrganicExpense,
      largestPosShare7d: evaluation.hazardDecomposition.largestPosShare7d,
      largestPosShare14d: evaluation.hazardDecomposition.largestPosShare14d,
      largestPairShare7d: evaluation.hazardDecomposition.largestPairShare7d,
      largestPairShare14d: evaluation.hazardDecomposition.largestPairShare14d,
      largestPairShare30d: evaluation.hazardDecomposition.largestPairShare30d,
      maxConsecutivePosDays: evaluation.hazardDecomposition.maxConsecutivePosDays,
      maxConsecutivePairDays: evaluation.hazardDecomposition.maxConsecutivePairDays,
      largestPosShare30d: evaluation.hazardDecomposition.largestPosVolumeShare30d,
      largestPosActiveShare7d: evaluation.hazardDecomposition.largestPosActiveShare7d,
      largestPosActiveShare14d: evaluation.hazardDecomposition.largestPosActiveShare14d,
      largestPosActiveShare30d: evaluation.hazardDecomposition.largestPosActiveShare30d,
      largestPairActiveShare7d: evaluation.hazardDecomposition.largestPairActiveShare7d,
      largestPairActiveShare14d: evaluation.hazardDecomposition.largestPairActiveShare14d,
      largestPairActiveShare30d: evaluation.hazardDecomposition.largestPairActiveShare30d,
      organicSpendBroughtForward: Math.max(0, evaluation.organicExpense - cadenceSpend),
      nMinusOneThroughputRetention: evaluation.nMinusOneThroughputRetention,
      nMinusOneMaxPosShare: evaluation.nMinusOneMaxPosShare,
      nMinusOneWorstCaseLock: evaluation.nMinusOneWorstCaseLock,
      nMinusOneResilienceFeasible: evaluation.nMinusOneResilienceFeasible,
      nMinusOneResilienceFallback: evaluation.nMinusOneResilienceFallback,
      ...cascadeOpen,
    });
    applyRegimeToDayRow(days[days.length - 1]!, feasibility, evaluation);

    const lastCal = calendar[calendar.length - 1];
    if (lastCal && lastCal.day === day) {
      lastCal.cumulativeGrossProfit = cumulativeGross;
      lastCal.cumulativeExpenseEntitlement = cumulativeExpenseEntitlement;
      lastCal.cumulativeOrganicExpense = totalOrganicExpense;
      lastCal.unusedExpenseBudget = closingBudget;
      lastCal.expenseBudgetClosing = closingBudget;
      lastCal.organicExpenseSpentToday = evaluation.organicExpense;
      lastCal.inEvaluationTail = inTail;
    }

    applyCleanDay(state, decisionScenario, actionFromEval(evaluation), {
      realized: true,
      skipRandomHit: Boolean(options.forcePosReview && day === options.forcePosReview.afterDay),
      forcePosReview:
        options.forcePosReview && day === options.forcePosReview.afterDay
          ? { operatingDaysDown: options.forcePosReview.operatingDaysDown }
          : undefined,
    });
    if (options.forcePosReview && day === options.forcePosReview.afterDay) {
      decisionScenario = { ...decisionScenario, realizedCascadeEnabled: true };
    }
    const lastHit = (state.interruptionEvents ?? []).at(-1);
    const row = days[days.length - 1];
    if (row && lastHit && lastHit.day === day) row.hitDomain = lastHit.domain;
    options.afterDay?.({
      state,
      day,
      evaluation,
      calendarEntry: calendar[calendar.length - 1]?.day === day ? calendar[calendar.length - 1] : undefined,
    });
  };

  const startDay = Math.max(1, Math.min(realizedThroughDay, options.startDay ?? 1));
  for (let day = startDay; day <= realizedThroughDay; day++) runDay(day, false);

  let evaluationTail: EvaluationTailResult | undefined;
  if (options.evaluationTail) {
    const maxCalendarDays = Math.max(0, Math.round(options.evaluationTail.maxCalendarDays ?? 30));
    const backlogAtHorizon = (state.backlog ?? []).reduce((a, t) => a + t.amount, 0);
    let daysToClearBacklog: number | null = backlogAtHorizon <= 1e-9 ? 0 : null;
    let daysRun = 0;
    let resolved = true;
    let day = realizedThroughDay;
    while (evaluationOpenItems(state, decisionScenario, day + 1).open) {
      if (daysRun >= maxCalendarDays) {
        resolved = false;
        break;
      }
      if (daysRun === 0) decisionScenario = evaluationTailScenario(decisionScenario);
      day += 1;
      daysRun += 1;
      runDay(day, true);
      if (daysToClearBacklog === null && (state.backlog ?? []).reduce((a, t) => a + t.amount, 0) <= 1e-9) {
        daysToClearBacklog = daysRun;
      }
    }
    const leftover = evaluationOpenItems(state, decisionScenario, state.day + 1);
    evaluationTail = {
      maxCalendarDays,
      daysRun,
      endDay: state.day,
      resolved: resolved && !leftover.open,
      daysToClearBacklog,
      unresolvedBacklogZar: leftover.backlogZar,
      unresolvedReviewCount: leftover.reviewCount,
      unresolvedFrozenCapital: leftover.frozenCapital,
      unresolvedInFlightZar: leftover.inFlightZar,
    };
  }

  if (options.extendWhileDegraded) {
    const maxExtra = Math.max(0, Math.round(options.extendWhileDegraded.maxExtraDays ?? 42));
    let extra = 0;
    let day = realizedThroughDay;
    while (extra < maxExtra && resourcesStillDegraded(state)) {
      day += 1;
      extra += 1;
      runDay(day, false, true);
    }
  }

  const endingMerchant = days[days.length - 1]?.merchantMaturity ?? 0;
  const totalObserved = totalCoreThroughput + totalOrganicRevenue + totalOrganicExpense;

  const result: SimulationResult = {
    policy:
      policy === "warmup-then-optimize"
        ? `warmup-${warmupThroughput}/${warmupDays}d`
        : policy === "organic-then-optimize"
          ? `organic-then-optimize/${warmupDays}d`
          : policy,
    days,
    calendar,
    totalGrossProfit: cumulativeGross,
    totalContinuityAdjusted: cumulativeEv,
    totalExpectedDowntimeDays,
    endingCapital:
      scenario.capitalMode === "reinvest"
        ? state.deployableCapital
        : state.deployableCapital + state.extractedProfit,
    endingExtractedProfit: state.extractedProfit,
    totalCoreThroughput,
    totalOrganicRevenue,
    totalOrganicExpense,
    totalOrganicBroughtForward,
    endingUnusedExpenseEntitlement: days[days.length - 1]?.expenseBudgetClosing ?? 0,
    totalExpenseEntitlementAccrued: cumulativeExpenseEntitlement,
    endingMerchantMaturity: endingMerchant,
    coreShareOfTotal: totalObserved > 1e-9 ? totalCoreThroughput / totalObserved : 0,
    surpriseFlags: collectSurpriseFlags(days, calendar),
    endingState: cloneState(state),
    ...(evaluationTail
      ? { optimizationEndDay: realizedThroughDay, evaluationTail }
      : {}),
  };
  if (decisionScenario.realizedCascadeEnabled) result.cascade = summarizeCascadePath(result);
  return result;
}
