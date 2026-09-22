import { cloneScenario, createDefaultScenario } from "./defaults";
import { longestStreak } from "./pathFlags";
import { simulate } from "./simulation";
import { createInitialState } from "./state";
import type {
  CalendarEntry,
  ConcentrationModel,
  ExpenseTimingPolicy,
  PairTieBreak,
  Scenario,
  SimulationResult,
} from "./types";

export interface RollingComparisonRow {
  label: string;
  concentrationModel: ConcentrationModel;
  expenseTimingPolicy: ExpenseTimingPolicy;
  includePersistence: boolean;
  pairTieBreak: PairTieBreak;
  day1to30Core: number[];
  dailyOrganicExpense: number[];
  posUsedEachDay: number[];
  pairsUsedEachDay: number[];
  longestPosStreak: number;
  longestPosStreakId: string;
  longestPairStreak: number;
  longestPairStreakKey: string;
  activePosDays: Record<string, number>;
  max7dPosShare: number;
  max14dPosShare: number;
  max30dPosShare: number;
  max7dPairShare: number;
  max14dPairShare: number;
  max30dPairShare: number;
  max7dPosActiveShare: number;
  max14dPosActiveShare: number;
  max30dPosActiveShare: number;
  max7dPairActiveShare: number;
  max14dPairActiveShare: number;
  max30dPairActiveShare: number;
  totalOrganicSpend: number;
  organicSpendBroughtForward: number;
  deferredExpenseEntitlement: number;
  day30Maturity: number;
  ca180: number | null;
  totalCore30: number;
  surpriseFlags: string[];
}

const MODELS: ConcentrationModel[] = ["today", "rolling-card-pos", "rolling-card-pos-pair"];
const TIMINGS: ExpenseTimingPolicy[] = ["threshold", "distributed", "mixed"];
const TIE_BREAKS: PairTieBreak[] = ["history", "neutral", "low-dependency"];

function modelLabel(model: ConcentrationModel): string {
  if (model === "today") return "A today card/POS";
  if (model === "rolling-card-pos") return "B rolling card/POS";
  return "C rolling + pair";
}

function tieLabel(rule: PairTieBreak): string {
  if (rule === "history") return "A history";
  if (rule === "neutral") return "B neutral";
  return "C low-dependency";
}

function maxWindowShare(
  calendar: CalendarEntry[],
  window: number,
  kind: "volume" | "active",
  keyKind: "pos" | "pair",
): number {
  let best = 0;
  for (let i = 0; i < calendar.length; i++) {
    const slice = calendar.slice(Math.max(0, i + 1 - window), i + 1);
    const totals = new Map<string, number>();
    for (const entry of slice) {
      if (keyKind === "pos") {
        const byPos = new Map<string, number>();
        for (const pair of entry.allocations) {
          byPos.set(pair.posId, (byPos.get(pair.posId) ?? 0) + pair.amount);
        }
        for (const [id, vol] of byPos) {
          if (kind === "volume") totals.set(id, (totals.get(id) ?? 0) + vol);
          else if (vol > 1e-9) totals.set(id, (totals.get(id) ?? 0) + 1);
        }
      } else {
        for (const pair of entry.allocations) {
          const key = `${pair.cardId}|${pair.posId}`;
          if (kind === "volume") totals.set(key, (totals.get(key) ?? 0) + pair.amount);
          else if (pair.amount > 1e-9) totals.set(key, (totals.get(key) ?? 0) + 1);
        }
      }
    }
    const values = [...totals.values()];
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 1e-9) continue;
    best = Math.max(best, Math.max(...values) / total);
  }
  return best;
}

function activePosDays(calendar: CalendarEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of calendar) {
    for (const id of new Set(entry.posUsedIds)) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

function summarise(
  result: SimulationResult,
  scenario: Scenario,
  ca180: number | null,
): RollingComparisonRow {
  const first30 = result.days.filter((d) => d.day <= 30);
  const cal30 = result.calendar.filter((e) => e.day <= 30);
  const posBest = longestStreak(cal30.map((e) => e.posUsedIds));
  const pairBest = longestStreak(cal30.map((e) => e.pairKeysUsed));
  return {
    label: `${modelLabel(scenario.concentrationModel)} × ${scenario.expenseTimingPolicy} × ${tieLabel(scenario.pairTieBreak)} × ${scenario.includePersistenceInHazard ? "persist" : "volume-only"}`,
    concentrationModel: scenario.concentrationModel,
    expenseTimingPolicy: scenario.expenseTimingPolicy,
    includePersistence: scenario.includePersistenceInHazard,
    pairTieBreak: scenario.pairTieBreak,
    day1to30Core: first30.map((d) => d.coreThroughput),
    dailyOrganicExpense: first30.map((d) => d.organicExpense),
    posUsedEachDay: cal30.map((e) => e.posUsedIds.length),
    pairsUsedEachDay: cal30.map((e) => e.pairsUsed),
    longestPosStreak: posBest.length,
    longestPosStreakId: posBest.key,
    longestPairStreak: pairBest.length,
    longestPairStreakKey: pairBest.key,
    activePosDays: activePosDays(cal30),
    max7dPosShare: maxWindowShare(cal30, 7, "volume", "pos"),
    max14dPosShare: maxWindowShare(cal30, 14, "volume", "pos"),
    max30dPosShare: maxWindowShare(cal30, 30, "volume", "pos"),
    max7dPairShare: maxWindowShare(cal30, 7, "volume", "pair"),
    max14dPairShare: maxWindowShare(cal30, 14, "volume", "pair"),
    max30dPairShare: maxWindowShare(cal30, 30, "volume", "pair"),
    max7dPosActiveShare: maxWindowShare(cal30, 7, "active", "pos"),
    max14dPosActiveShare: maxWindowShare(cal30, 14, "active", "pos"),
    max30dPosActiveShare: maxWindowShare(cal30, 30, "active", "pos"),
    max7dPairActiveShare: maxWindowShare(cal30, 7, "active", "pair"),
    max14dPairActiveShare: maxWindowShare(cal30, 14, "active", "pair"),
    max30dPairActiveShare: maxWindowShare(cal30, 30, "active", "pair"),
    totalOrganicSpend: first30.reduce((s, d) => s + d.organicExpense, 0),
    organicSpendBroughtForward: first30.reduce((s, d) => s + d.organicSpendBroughtForward, 0),
    deferredExpenseEntitlement: first30[first30.length - 1]?.expenseBudgetClosing ?? 0,
    day30Maturity: first30[first30.length - 1]?.merchantMaturity ?? 0,
    ca180,
    totalCore30: first30.reduce((s, d) => s + d.coreThroughput, 0),
    surpriseFlags: result.surpriseFlags,
  };
}

export function comparisonScenario(
  model: ConcentrationModel,
  timing: ExpenseTimingPolicy,
  horizonDays: number,
  extra: Partial<Scenario> = {},
): Scenario {
  const s = cloneScenario(createDefaultScenario());
  s.concentrationModel = model;
  s.expenseTimingPolicy = timing;
  s.horizonDays = horizonDays;
  Object.assign(s, extra);
  return s;
}

export function runRollingCell(
  model: ConcentrationModel,
  timing: ExpenseTimingPolicy,
  horizonDays: number,
  calendarThroughDay = 30,
  extra: Partial<Scenario> = {},
): RollingComparisonRow {
  const scenario = comparisonScenario(model, timing, horizonDays, extra);
  const result = simulate(createInitialState(scenario), scenario, "optimize", {
    calendarThroughDay,
  });
  const ca180 = horizonDays >= 180 ? result.totalContinuityAdjusted : null;
  return summarise(result, scenario, ca180);
}

export function runRollingComparisonMatrix(horizonDays = 30, include180 = false): RollingComparisonRow[] {
  const rows: RollingComparisonRow[] = [];
  for (const model of MODELS) {
    for (const timing of TIMINGS) {
      if (include180) {
        rows.push(runRollingCell(model, timing, 180, 30));
      } else {
        rows.push(runRollingCell(model, timing, horizonDays, Math.min(30, horizonDays)));
      }
    }
  }
  return rows;
}

export interface PersistenceCellSpec {
  includePersistence: boolean;
  pairTieBreak: PairTieBreak;
}

export const PERSISTENCE_COMPARISON_CELLS: PersistenceCellSpec[] = [
  { includePersistence: false, pairTieBreak: "history" },
  { includePersistence: false, pairTieBreak: "neutral" },
  { includePersistence: false, pairTieBreak: "low-dependency" },
  { includePersistence: true, pairTieBreak: "history" },
  { includePersistence: true, pairTieBreak: "neutral" },
  { includePersistence: true, pairTieBreak: "low-dependency" },
];

export function runPersistenceComparison(
  horizonDays = 30,
  include180 = false,
  extra: Partial<Scenario> = {},
): RollingComparisonRow[] {
  return PERSISTENCE_COMPARISON_CELLS.map((cell) =>
    runRollingCell("rolling-card-pos", "mixed", include180 ? 180 : horizonDays, Math.min(30, include180 ? 180 : horizonDays), {
      includePersistenceInHazard: cell.includePersistence,
      pairTieBreak: cell.pairTieBreak,
      ...extra,
    }),
  );
}

export { TIE_BREAKS };
