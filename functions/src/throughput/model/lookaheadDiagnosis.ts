import { cloneScenario } from "./defaults";
import { merchantMaturity, resourceMaturity } from "./maturity";
import {
  assembleCandidate,
  continuationPolicy,
  decideDay,
  decomposeLookahead,
  type LookaheadDecomposition,
} from "./optimizer";
import { simulate, type SimulateOptions } from "./simulation";
import { applyScheduledArrivals, createInitialState, releaseRecoveredResources } from "./state";
import { applyCleanDay, projectCleanState } from "./transition";
import type { MaturityCategory, Scenario, SimState, SimulationResult } from "./types";

export const WARMUP_THROUGHPUTS = [10_000, 20_000, 30_000] as const;
export const WARMUP_DAYS = 14;
export const CARD_COUNT_GRID = [1, 2, 3, 5, 7] as const;
export const LOOKAHEAD_WINDOW_GRID = [1, 7, 14, 30] as const;
export const IDLE_INSPECT_DAYS = [1, 14, 45, 78, 90, 180] as const;

export interface CardCountRow {
  cards: number;
  myopicV: number;
  lookaheadV: number;
  myopicEvAtLookahead: number;
  lookaheadEvAtLookahead: number;
  probePiIdle: number;
  probePiClean: number;
  probePiHit: number;
  probeMyopicEv: number;
  probeLookaheadEv: number;
  probeSeasoning: number;
  probeHitStateDelta: number;
}

export interface WindowRow {
  lookaheadDays: number;
  lookaheadV: number;
  lookaheadEv: number;
  myopicV: number;
}

export interface IdleSnapshot {
  day: number;
  merchantScore: number;
  merchantCategory: MaturityCategory;
  cardScore: number;
  cardCategory: MaturityCategory;
  lifetimeVolume: number;
  lifetimeCount: number;
  activeTradingDays: number;
  cleanHistoryDays: number;
  daysActive: number;
  lookaheadV: number;
  myopicV: number;
}

export interface WarmupBenchmark {
  warmupThroughput: number;
  warmupDays: number;
  totalContinuityAdjusted: number;
  totalGrossProfit: number;
  dayAfterWarmupThroughput: number;
  endingThroughput: number;
  positiveDaysAfterWarmup: number;
  dominatesPermanentIdle: boolean;
}

export interface DayValueComparison {
  throughput: number;
  myopicEv: number;
  lookaheadEv: number;
  decomposition: LookaheadDecomposition;
}

export interface LookaheadDiagnosis {
  myopicDay1V: number;
  lookaheadDay1V: number;
  probeThroughput: number;
  idleDay: DayValueComparison;
  probeDay: DayValueComparison;
  myopicDay: DayValueComparison;
  cardCounts: CardCountRow[];
  windows: WindowRow[];
  idlePath: IdleSnapshot[];
  daysIdleUntilNotThin: number | null;
  idlePreservesThinForever: boolean;
  transactionComponentsStayZeroIfIdle: boolean;
  afterWarmupDay15: Array<{
    throughput: number;
    lookaheadV: number;
    myopicV: number;
    merchantScore: number;
    cardScore: number;
  }>;
  bellmanInconsistent: boolean;
}

function continuationPolicyAfterIdle(state: SimState, scenario: Scenario): number {
  const idleNext = projectCleanState(state, scenario, 0);
  return continuationPolicy(idleNext, scenario).coreThroughput;
}

function day1State(scenario: Scenario): SimState {
  const state = createInitialState(scenario);
  applyScheduledArrivals(state, scenario);
  return state;
}

function replayForced(
  scenario: Scenario,
  throughput: number,
  days: number,
): SimState {
  const state = createInitialState(scenario);
  const n = Math.max(0, Math.min(days, scenario.horizonDays));
  for (let day = 1; day <= n; day++) {
    state.day = day;
    applyScheduledArrivals(state, scenario);
    releaseRecoveredResources(state);
    applyCleanDay(state, scenario, throughput);
  }
  return state;
}

function inspectDay(state: SimState, scenario: Scenario): IdleSnapshot {
  const merchant = merchantMaturity(state, scenario);
  const card = state.cards[0]
    ? resourceMaturity(state.cards[0], scenario)
    : { score: 0, category: "Thin" as const, components: { age: 0, count: 0, volume: 0, activeDays: 0, clean: 0 } };
  const decision = decideDay(state, scenario, true);
  return {
    day: state.day,
    merchantScore: merchant.score,
    merchantCategory: merchant.category,
    cardScore: card.score,
    cardCategory: card.category,
    lifetimeVolume: state.merchantLifetimeVolume,
    lifetimeCount: state.merchantLifetimeCount,
    activeTradingDays: state.merchantActiveTradingDays,
    cleanHistoryDays: state.merchantCleanHistoryDays,
    daysActive: state.merchantDaysActive,
    lookaheadV: decision.lookaheadRecommended.throughput,
    myopicV: decision.myopicRecommended.throughput,
  };
}

function idleScoreAfterDays(scenario: Scenario, days: number): number {
  const w = scenario.merchantMaturityWeights;
  const total = w.age + w.count + w.volume + w.activeDays + w.clean;
  if (total <= 0) return 0;
  const age = Math.min(1, days / Math.max(1, scenario.merchantAgeDaysToMature));
  const clean = Math.min(1, days / Math.max(1, scenario.merchantCleanDaysToMature));
  return (w.age * age + w.clean * clean) / total;
}

export function daysIdleUntilNotThin(scenario: Scenario): number | null {
  const horizon = Math.max(1, scenario.horizonDays);
  for (let d = 1; d <= horizon; d++) {
    if (idleScoreAfterDays(scenario, d) >= scenario.thinMax) return d;
  }
  return null;
}

function valueAt(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  includeLookaheadContinuation: boolean,
): DayValueComparison {
  const candidate = assembleCandidate(state, scenario, throughput);
  const decomposition = decomposeLookahead(
    state,
    scenario,
    candidate,
    includeLookaheadContinuation,
  );
  return {
    throughput,
    myopicEv: candidate.myopicEv,
    lookaheadEv: decomposition.lookaheadEv,
    decomposition,
  };
}

export function diagnoseLookahead(scenario: Scenario): LookaheadDiagnosis {
  const state = day1State(scenario);
  const day1 = decideDay(state, scenario, true);
  const myopicDay1V = day1.myopicRecommended.throughput;
  const lookaheadDay1V = day1.lookaheadRecommended.throughput;
  const probeThroughput =
    myopicDay1V > 0 ? Math.min(20_000, myopicDay1V) : 20_000;

  const idleDay = valueAt(state, scenario, 0, true);
  const probeDay = valueAt(state, scenario, probeThroughput, true);
  const myopicDay = valueAt(state, scenario, myopicDay1V, myopicDay1V !== probeThroughput);

  const cardCounts: CardCountRow[] = CARD_COUNT_GRID.map((cards) => {
    const s = cloneScenario(scenario);
    s.initialCards = cards;
    const cardState = day1State(s);
    const d = decideDay(cardState, s, true);
    const probe = decomposeLookahead(
      cardState,
      s,
      assembleCandidate(cardState, s, probeThroughput),
      false,
    );
    return {
      cards,
      myopicV: d.myopicRecommended.throughput,
      lookaheadV: d.lookaheadRecommended.throughput,
      myopicEvAtLookahead: d.lookaheadRecommended.myopicEv,
      lookaheadEvAtLookahead: d.lookaheadRecommended.lookaheadEv,
      probePiIdle: probe.piIdle,
      probePiClean: probe.piClean,
      probePiHit: probe.piHit,
      probeMyopicEv: probe.myopicEv,
      probeLookaheadEv: probe.lookaheadEv,
      probeSeasoning: probe.seasoning,
      probeHitStateDelta: probe.hitStateDelta,
    };
  });

  const windows: WindowRow[] = LOOKAHEAD_WINDOW_GRID.map((lookaheadDays) => {
    const s = cloneScenario(scenario);
    s.lookaheadDays = lookaheadDays;
    s.useLookahead = true;
    const d = decideDay(day1State(s), s, true);
    return {
      lookaheadDays,
      lookaheadV: d.lookaheadRecommended.throughput,
      lookaheadEv: d.lookaheadRecommended.lookaheadEv,
      myopicV: d.myopicRecommended.throughput,
    };
  });

  const idlePath: IdleSnapshot[] = IDLE_INSPECT_DAYS.filter((d) => d <= scenario.horizonDays).map(
    (day) => {
      const replayed = replayForced(scenario, 0, day - 1);
      replayed.day = day;
      applyScheduledArrivals(replayed, scenario);
      releaseRecoveredResources(replayed);
      return inspectDay(replayed, scenario);
    },
  );

  const untilThin = daysIdleUntilNotThin(scenario);
  const lastIdle = idlePath[idlePath.length - 1];
  const idlePreservesThinForever =
    untilThin === null && lastIdle?.merchantCategory === "Thin";

  const afterWarmupDay15 = [0, ...WARMUP_THROUGHPUTS].map((throughput) => {
    const replayed = replayForced(scenario, throughput, WARMUP_DAYS);
    replayed.day = WARMUP_DAYS + 1;
    applyScheduledArrivals(replayed, scenario);
    releaseRecoveredResources(replayed);
    const decision = decideDay(replayed, scenario, true);
    const merchant = merchantMaturity(replayed, scenario);
    const card = replayed.cards[0]
      ? resourceMaturity(replayed.cards[0], scenario)
      : { score: 0 };
    return {
      throughput,
      lookaheadV: decision.lookaheadRecommended.throughput,
      myopicV: decision.myopicRecommended.throughput,
      merchantScore: merchant.score,
      cardScore: card.score,
    };
  });

  const idleContinuation = continuationPolicyAfterIdle(state, scenario);
  const bellmanInconsistent =
    lookaheadDay1V === 0 &&
    myopicDay1V > 0 &&
    idleContinuation > 0 &&
    probeDay.decomposition.idleLookaheadV === 0;

  return {
    myopicDay1V,
    lookaheadDay1V,
    probeThroughput,
    idleDay,
    probeDay,
    myopicDay,
    cardCounts,
    windows,
    idlePath,
    daysIdleUntilNotThin: untilThin,
    idlePreservesThinForever,
    transactionComponentsStayZeroIfIdle: idlePath.every(
      (snap) => snap.lifetimeVolume === 0 && snap.activeTradingDays === 0 && snap.lifetimeCount === 0,
    ),
    afterWarmupDay15,
    bellmanInconsistent,
  };
}

export function simulateWarmupThenOptimize(
  scenario: Scenario,
  warmupThroughput: number,
  warmupDays = WARMUP_DAYS,
  options: SimulateOptions = {},
): SimulationResult {
  const state = createInitialState(scenario);
  return simulate(state, scenario, "warmup-then-optimize", {
    ...options,
    warmupThroughput,
    warmupDays,
  });
}

export function runWarmupBenchmarks(
  scenario: Scenario,
  idleCa: number,
  throughputs: readonly number[] = WARMUP_THROUGHPUTS,
  warmupDays = WARMUP_DAYS,
): WarmupBenchmark[] {
  return throughputs.map((warmupThroughput) => {
    const result = simulateWarmupThenOptimize(scenario, warmupThroughput, warmupDays);
    const after = result.days[warmupDays];
    const ending = result.days[result.days.length - 1];
    const positiveDaysAfterWarmup = result.days
      .slice(warmupDays)
      .filter((row) => row.throughput > 0).length;
    return {
      warmupThroughput,
      warmupDays,
      totalContinuityAdjusted: result.totalContinuityAdjusted,
      totalGrossProfit: result.totalGrossProfit,
      dayAfterWarmupThroughput: after?.throughput ?? 0,
      endingThroughput: ending?.throughput ?? 0,
      positiveDaysAfterWarmup,
      dominatesPermanentIdle: result.totalContinuityAdjusted > idleCa + 1e-6,
    };
  });
}

export interface PolicyBenchmark {
  policy: string;
  totalCoreThroughput: number;
  totalGrossProfit: number;
  totalContinuityAdjusted: number;
  expectedDowntime: number;
  endingMaturity: number;
  organicActivityUsed: number;
  coreShareOfTotal: number;
  day1Core: number;
  day1Organic: number;
}

export function runPolicyComparisons(
  scenario: Scenario,
  warmupDays = WARMUP_DAYS,
): PolicyBenchmark[] {
  const state = createInitialState(scenario);
  const rows: Array<{ policy: Parameters<typeof simulate>[2]; label: string; options?: SimulateOptions }> = [
    { policy: "idle", label: "A. Permanent idle" },
    { policy: "core-only", label: "B. Core-only optimized" },
    { policy: "organic-then-optimize", label: "C. Organic-only then optimize", options: { warmupDays } },
    { policy: "optimize", label: "D. Core + organic optimized" },
    { policy: "full-capital", label: "E. Full-capital every day" },
    { policy: "conservative", label: "F. Fixed conservative core" },
  ];
  return rows.map(({ policy, label, options }) => {
    const result = simulate(state, scenario, policy, options);
    const day1 = result.days[0];
    return {
      policy: label,
      totalCoreThroughput: result.totalCoreThroughput,
      totalGrossProfit: result.totalGrossProfit,
      totalContinuityAdjusted: result.totalContinuityAdjusted,
      expectedDowntime: result.totalExpectedDowntimeDays,
      endingMaturity: result.endingMerchantMaturity,
      organicActivityUsed: result.totalOrganicRevenue + result.totalOrganicExpense,
      coreShareOfTotal: result.coreShareOfTotal,
      day1Core: day1?.coreThroughput ?? 0,
      day1Organic: (day1?.organicRevenue ?? 0) + (day1?.organicExpense ?? 0),
    };
  });
}
