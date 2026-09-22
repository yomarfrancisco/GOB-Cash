import { allocateAction, explainAllocation, pairKey } from "./allocation";
import { bankNotes, emptyBankRiskFeatures, hazardContributionRows } from "./bankRules";
import { continuityMultiplier, continuityPosterior } from "./continuity";
import { coefficientRows } from "./learner";
import { clamp, formatZar } from "./math";
import { emptyExpenseDiagnosis, organicOffer } from "./organic";
import { resourceMaturity } from "./maturity";
import { assembleCandidate } from "./optimizer";
import { activeDaysN, emptyHazardDecomposition, pushRolling, shareOfActiveDaysN, volumeN } from "./rolling";
import { cloneState, maxFeasibleThroughput } from "./state";
import type {
  BankDayDiagnosis,
  CalendarEntry,
  CandidateEvaluation,
  CounterfactualResult,
  DayDecision,
  LearningDiagnosis,
  PairRecord,
  Resource,
  ResourceSnapshot,
  ResourceUtilizationRow,
  RollingWindow,
  Scenario,
  SimState,
} from "./types";
import { diagnoseValueOfInformation } from "./voi";

function previewRolling(window: RollingWindow, todayVolume: number): RollingWindow {
  const copy: RollingWindow = {
    volumes: [...window.volumes],
    counts: [...window.counts],
    consecutiveActiveDays: window.consecutiveActiveDays,
    daysSinceLastUse: window.daysSinceLastUse,
  };
  pushRolling(copy, todayVolume, todayVolume > 1e-9 ? 1 : 0);
  return copy;
}

export function snapshotResource(
  resource: Resource,
  scenario: Scenario,
  day: number,
  todayVolume = 0,
): ResourceSnapshot {
  const maturity = resourceMaturity(resource, scenario);
  const rolling = previewRolling(resource.rolling, todayVolume);
  return {
    id: resource.id,
    name: resource.name,
    kind: resource.kind,
    installedOnDay: resource.installedOnDay,
    available: resource.downUntilDay === null || resource.downUntilDay <= day,
    downUntilDay: resource.downUntilDay,
    maturityScore: maturity.score,
    maturityCategory: maturity.category,
    daysActive: resource.daysActive,
    lifetimeVolume: resource.lifetimeVolume,
    lifetimeCount: resource.lifetimeCount,
    activeTradingDays: resource.activeTradingDays,
    cleanHistoryDays: resource.cleanHistoryDays,
    coreVolume: resource.coreVolume,
    organicRevenueVolume: resource.organicRevenueVolume,
    organicExpenseVolume: resource.organicExpenseVolume,
    importedHistoryVolume: resource.importedHistoryVolume,
    consecutiveActiveDays: rolling.consecutiveActiveDays,
    volume7d: volumeN(rolling, 7),
    volume14d: volumeN(rolling, 14),
    volume30d: volumeN(rolling, 30),
    activeDays7d: activeDaysN(rolling, 7),
    activeDays14d: activeDaysN(rolling, 14),
    activeDays30d: activeDaysN(rolling, 30),
    daysSinceLastUse: rolling.daysSinceLastUse,
    shareOfActiveDays7d: shareOfActiveDaysN(rolling, 7),
    shareOfActiveDays14d: shareOfActiveDaysN(rolling, 14),
    shareOfActiveDays30d: shareOfActiveDaysN(rolling, 30),
  };
}

export function buildCalendarEntry(
  state: SimState,
  scenario: Scenario,
  decision: DayDecision,
  arrivingCardIds: string[],
  arrivingPosIds: string[],
): CalendarEntry {
  const chosen = decision.recommended;
  const plans = allocateAction(
    state,
    scenario,
    chosen.throughput,
    chosen.organicRevenue,
    chosen.organicExpense,
  );
  const offer = organicOffer(state, scenario);
  const cards = [...state.cards].sort((a, b) => a.id.localeCompare(b.id));
  const pos = [...state.pos].sort((a, b) => a.id.localeCompare(b.id));
  const opening = offer.expenseBudgetAvailable;
  const spent = chosen.organicExpense;
  const closing = Math.max(0, opening - spent);
  const volumeById = new Map<string, number>();
  for (const pair of plans.merged.pairs) {
    volumeById.set(pair.cardId, (volumeById.get(pair.cardId) ?? 0) + pair.amount);
    volumeById.set(pair.posId, (volumeById.get(pair.posId) ?? 0) + pair.amount);
  }
  const pairRecords: PairRecord[] = structuredClone(state.pairs);
  const seenPairs = new Set(pairRecords.map((p) => pairKey(p.cardId, p.posId)));
  for (const pair of plans.merged.pairs) {
    const key = pairKey(pair.cardId, pair.posId);
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    pairRecords.push({
      cardId: pair.cardId,
      posId: pair.posId,
      firstActiveDay: state.day,
      lastUsedDay: state.day,
      lifetimeVolume: 0,
      lifetimeCount: 0,
      activeTradingDays: 0,
      cleanHistoryDays: 0,
      coreVolume: 0,
      organicVolume: 0,
      rolling: {
        volumes: [],
        counts: [],
        consecutiveActiveDays: 0,
        daysSinceLastUse: 0,
      },
    });
  }
  const todayByPair = new Map<string, number>();
  for (const pair of plans.merged.pairs) {
    const key = pairKey(pair.cardId, pair.posId);
    todayByPair.set(key, (todayByPair.get(key) ?? 0) + pair.amount);
  }
  for (const rec of pairRecords) {
    rec.rolling = previewRolling(rec.rolling, todayByPair.get(pairKey(rec.cardId, rec.posId)) ?? 0);
  }

  return {
    day: state.day,
    availableCapital: state.deployableCapital,
    recommendedThroughput: chosen.throughput,
    coreThroughput: chosen.throughput,
    organicRevenue: chosen.organicRevenue,
    organicExpense: chosen.organicExpense,
    totalActivity: chosen.observedActivity,
    organicRevenueRemaining: offer.monthRevenueRemaining - chosen.organicRevenue,
    organicExpenseRemaining: closing,
    monthRevenueRemaining: offer.monthRevenueRemaining - chosen.organicRevenue,
    grossProfitToday: chosen.grossProfit,
    expenseEntitlementAddedToday: offer.expenseEntitlementAdded,
    expenseBudgetOpening: opening,
    organicExpenseSpentToday: spent,
    expenseBudgetClosing: closing,
    weeklyMinimumAccrual: offer.weeklyMinimumAccrual,
    profitLinkedAccrual: offer.profitLinkedAccrual,
    expenseScheduledToday: offer.scheduledExpense,
    expenseDelayedToday: Math.max(0, offer.scheduledExpense - spent),
    cumulativeGrossProfit: 0,
    cumulativeExpenseEntitlement: 0,
    cumulativeOrganicExpense: 0,
    unusedExpenseBudget: closing,
    pairsUsed: plans.merged.pairs.length,
    degradedRouting: plans.degradedRouting,
    nMinusOneThroughputRetention: chosen.nMinusOneThroughputRetention,
    nMinusOneMaxPosShare: chosen.nMinusOneMaxPosShare,
    nMinusOneWorstCaseLock: chosen.nMinusOneWorstCaseLock,
    nMinusOneResilienceFeasible: chosen.nMinusOneResilienceFeasible,
    nMinusOneResilienceFallback: chosen.nMinusOneResilienceFallback,
    allocations: plans.merged.pairs,
    coreAllocations: plans.core.pairs,
    organicAllocations: plans.organic.pairs,
    idleCapital: decision.idleCapital,
    grossProfit: chosen.grossProfit,
    continuityAdjustedEv: chosen.myopicEv,
    expectedContinuityCost: chosen.expectedContinuityCost,
    hazard: chosen.hazard,
    factors: chosen.factors,
    merchantMaturity: chosen.merchantMaturity,
    cardResources: cards.map((r) => snapshotResource(r, scenario, state.day, volumeById.get(r.id) ?? 0)),
    posResources: pos.map((r) => snapshotResource(r, scenario, state.day, volumeById.get(r.id) ?? 0)),
    pairRecords,
    concentration: chosen.concentration,
    rampIndex: chosen.rampIndex,
    hazardDecomposition: chosen.hazardDecomposition ?? emptyHazardDecomposition(scenario.concentrationModel),
    expenseDiagnosis: decision.expenseDiagnosis ?? emptyExpenseDiagnosis(),
    posUsedIds: [...new Set(plans.merged.pairs.map((p) => p.posId))],
    pairKeysUsed: plans.merged.pairs.map((p) => pairKey(p.cardId, p.posId)),
    candidates: decision.curve.map((c) => ({
      throughput: c.throughput,
      organicRevenue: c.organicRevenue,
      organicExpense: c.organicExpense,
      grossProfit: c.grossProfit,
      expectedContinuityCost: c.expectedContinuityCost,
      myopicEv: c.myopicEv,
      objectiveEv: c.objectiveEv,
      hazard: c.hazard,
      rolloutCumulativeEv: c.rolloutCumulativeEv,
      endingMerchantMaturity: c.endingMerchantMaturity,
      expectedDowntime: c.expectedDowntimeShare,
      posteriorDeltaMean: c.posteriorDeltaMean,
      posteriorDeltaSd: c.posteriorDeltaSd,
      decisionAdjustment: c.decisionAdjustment,
    })),
    selectedThroughput: chosen.throughput,
    bindingFactors: decision.bindingFactors,
    totalExplanation: decision.explanation,
    allocationExplanation: explainAllocation(plans.merged, chosen.observedActivity),
    arrivingCardIds: [...arrivingCardIds].sort(),
    arrivingPosIds: [...arrivingPosIds].sort(),
    rolloutQ: chosen.lookaheadEv,
    actionPlan: decision.actionPlan,
    voi: scenario.valueOfInformationEnabled
      ? diagnoseValueOfInformation(
          state,
          scenario,
          plans.core,
          decision.actionPlan.transactions,
          chosen.throughput,
          chosen.concentration.expectedCapacityLost,
          chosen.hazard,
          chosen.myopicEv,
          new Map(
            [...cards, ...pos].map((r) => [r.id, resourceMaturity(r, scenario).score]),
          ),
        )
      : null,
    learning: scenario.economicLearnerEnabled ? learningDiagnosis(state, scenario, chosen) : null,
    bank: bankDiagnosis(state, scenario, chosen, decision),
    demandFates: chosen.demandFates ?? null,
    eventLoss: chosen.eventLoss ?? null,
    state: cloneState(state),
  };
}

function bankDiagnosis(state: SimState, scenario: Scenario, chosen: CandidateEvaluation, decision: DayDecision): BankDayDiagnosis {
  const summary = decision.actionPlan.bankSummary;
  const features = chosen.bankFeatures ?? emptyBankRiskFeatures(scenario);
  return {
    summary,
    features,
    hazardContributions: hazardContributionRows(
      chosen.pBase,
      chosen.factors,
      chosen.rawHazard,
      chosen.hazard,
      continuityMultiplier(state, scenario),
      features,
      scenario,
    ),
    notes: bankNotes(features, summary, scenario),
  };
}

function learningDiagnosis(state: SimState, scenario: Scenario, chosen: CandidateEvaluation): LearningDiagnosis {
  const cont = continuityPosterior(state.continuity, scenario);
  return {
    sampledDelta: chosen.decisionAdjustment,
    posteriorDeltaMean: chosen.posteriorDeltaMean,
    posteriorDeltaSd: chosen.posteriorDeltaSd,
    posteriorSdShareOfGross: chosen.grossProfit > 1e-9 ? chosen.posteriorDeltaSd / chosen.grossProfit : 0,
    updates: state.learner.updates,
    coefficients: coefficientRows(state.learner),
    continuity: {
      posteriorMean: cont.posteriorMean,
      lo90: cont.lo90,
      hi90: cont.hi90,
      exposure: cont.exposure,
      hits: cont.hits,
      days: cont.days,
      inProduction: cont.inProduction,
    },
  };
}

export function counterfactualDay(
  entry: CalendarEntry,
  scenario: Scenario,
  requestedThroughput: number,
): CounterfactualResult {
  const maxV = maxFeasibleThroughput(entry.state, scenario);
  const evaluated = clamp(Math.max(0, requestedThroughput), 0, maxV);
  const clamped = Math.abs(evaluated - requestedThroughput) > 0.005;
  const alt = assembleCandidate(entry.state, scenario, {
    coreThroughput: evaluated,
    organicRevenue: entry.organicRevenue,
    organicExpense: entry.organicExpense,
  });
  const plans = allocateAction(entry.state, scenario, evaluated, entry.organicRevenue, entry.organicExpense);
  const plan = plans.merged;
  const factorChanges = alt.factors.map((f) => {
    const baseline = entry.factors.find((b) => b.id === f.id);
    const baseVal = baseline?.value ?? 1;
    return {
      id: f.id,
      label: f.label,
      baseline: baseVal,
      counterfactual: f.value,
      delta: f.value - baseVal,
    };
  });

  const incrementalGrossProfit = alt.grossProfit - entry.grossProfit;
  const incrementalContinuityCost = alt.expectedContinuityCost - entry.expectedContinuityCost;
  const evDifference = alt.myopicEv - entry.continuityAdjustedEv;

  const parts: string[] = [];
  if (clamped) {
    parts.push(
      `Requested ${formatZar(requestedThroughput)} exceeds the feasible range on this day, so the counterfactual is evaluated at ${formatZar(evaluated)} (capital and physical capacity).`,
    );
  }
  if (Math.abs(evaluated - entry.recommendedThroughput) < 0.01) {
    parts.push("This is the saved recommended amount, so incremental gross profit, continuity cost and EV are zero.");
  } else if (evDifference < -1e-6) {
    parts.push(
      `Relative to the saved choice of ${formatZar(entry.recommendedThroughput)}, ${formatZar(evaluated)} changes myopic EV by ${formatZar(evDifference)} because incremental continuity cost (${formatZar(incrementalContinuityCost)}) is not offset by incremental gross profit (${formatZar(incrementalGrossProfit)}).`,
    );
  } else if (evDifference > 1e-6) {
    parts.push(
      `Relative to the saved choice of ${formatZar(entry.recommendedThroughput)}, ${formatZar(evaluated)} raises same-day myopic EV by ${formatZar(evDifference)}. The operational calendar still uses the saved optimum; this is a what-if on today's myopic identity only.`,
    );
  } else {
    parts.push(
      `Same-day myopic EV is unchanged versus ${formatZar(entry.recommendedThroughput)} at the current step size.`,
    );
  }

  return {
    requestedThroughput,
    evaluatedThroughput: evaluated,
    clamped,
    allocations: plan.pairs,
    idleCapital: Math.max(0, entry.availableCapital - evaluated),
    grossProfit: alt.grossProfit,
    expectedContinuityCost: alt.expectedContinuityCost,
    myopicEv: alt.myopicEv,
    hazard: alt.hazard,
    incrementalGrossProfit,
    incrementalContinuityCost,
    evDifference,
    factorChanges,
    concentration: alt.concentration,
    explanation: parts.join(" "),
  };
}

export function resourceUtilization(calendar: CalendarEntry[]): ResourceUtilizationRow[] {
  const rows = new Map<string, ResourceUtilizationRow>();

  const ensure = (snap: ResourceSnapshot) => {
    if (!rows.has(snap.id)) {
      rows.set(snap.id, {
        id: snap.id,
        name: snap.name,
        kind: snap.kind,
        installedOnDay: snap.installedOnDay,
        daysPresent: 0,
        daysAvailable: 0,
        daysWithVolume: 0,
        lifetimeVolume: 0,
        utilization: 0,
        maturityScore: snap.maturityScore,
        maturityCategory: snap.maturityCategory,
      });
    }
    return rows.get(snap.id)!;
  };

  for (const entry of calendar) {
    const volumeById = new Map<string, number>();
    for (const pair of entry.allocations) {
      volumeById.set(pair.cardId, (volumeById.get(pair.cardId) ?? 0) + pair.amount);
      volumeById.set(pair.posId, (volumeById.get(pair.posId) ?? 0) + pair.amount);
    }
    for (const snap of [...entry.cardResources, ...entry.posResources]) {
      const row = ensure(snap);
      row.daysPresent += 1;
      if (snap.available) row.daysAvailable += 1;
      const vol = volumeById.get(snap.id) ?? 0;
      if (vol > 0) row.daysWithVolume += 1;
      row.lifetimeVolume += vol;
      row.maturityScore = snap.maturityScore;
      row.maturityCategory = snap.maturityCategory;
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      utilization: row.daysPresent > 0 ? row.daysWithVolume / row.daysPresent : 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
