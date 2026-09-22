import type { DayAction } from "./types";

export function emptyAction(): DayAction {
  return { coreThroughput: 0, organicRevenue: 0, organicExpense: 0 };
}

export function parseAction(input: number | DayAction): DayAction {
  if (typeof input === "number") {
    return { coreThroughput: Math.max(0, input), organicRevenue: 0, organicExpense: 0 };
  }
  return {
    coreThroughput: Math.max(0, input.coreThroughput),
    organicRevenue: Math.max(0, input.organicRevenue),
    organicExpense: Math.max(0, input.organicExpense),
  };
}

export function observedActivity(action: DayAction): number {
  return action.coreThroughput + action.organicRevenue + action.organicExpense;
}

export function profitableActivity(action: DayAction): number {
  return action.coreThroughput + action.organicRevenue;
}

export function hasTransactionEvidence(volume: number, count: number, activeDays: number): boolean {
  return volume > 1e-6 || count > 1e-9 || activeDays > 0;
}
