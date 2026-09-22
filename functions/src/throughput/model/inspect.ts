import { displayResourceName, pairKey } from "./allocation";
import { simulate } from "./simulation";
import { createInitialState } from "./state";
import type { CalendarEntry, Scenario, SimulationResult } from "./types";

export const INSPECT_7_DAYS = 7;
export const INSPECT_14_DAYS = 14;

export function runInspectedOptimize(
  scenario: Scenario,
  realizedThroughDay: number,
): SimulationResult {
  return simulate(createInitialState(scenario), scenario, "optimize", {
    realizedThroughDay,
  });
}

export interface EarlyInspectRow {
  day: number;
  coreThroughput: number;
  organicRevenue: number;
  organicExpense: number;
  posUsed: string;
  pairCount: number;
  posOmitted: string;
  largest7dPosShare: number;
  longestPosStreak: number;
  rolloutQ: number;
}

export function earlyInspectRow(entry: CalendarEntry): EarlyInspectRow {
  const used = new Set(entry.posUsedIds);
  const omitted = entry.posResources
    .filter((p) => p.available && !used.has(p.id))
    .map((p) => displayResourceName(p.id, p.name));
  return {
    day: entry.day,
    coreThroughput: entry.coreThroughput,
    organicRevenue: entry.organicRevenue,
    organicExpense: entry.organicExpense,
    posUsed: entry.posUsedIds
      .map((id) => displayResourceName(id, entry.posResources.find((p) => p.id === id)?.name))
      .join(", "),
    pairCount: entry.pairsUsed,
    posOmitted: omitted.length === 0 ? "—" : omitted.join(", "),
    largest7dPosShare: entry.hazardDecomposition.largestPosVolumeShare7d,
    longestPosStreak: Math.max(0, ...entry.posResources.map((p) => p.consecutiveActiveDays)),
    rolloutQ: entry.rolloutQ,
  };
}

export interface InspectParityMismatch {
  day: number;
  field: string;
  fast: string;
  full: string;
}

function round(value: number, digits = 6): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function sortedCorePairs(entry: CalendarEntry): Array<{ key: string; amount: number; cardId: string; posId: string }> {
  return entry.coreAllocations
    .map((p) => ({
      key: pairKey(p.cardId, p.posId),
      amount: round(p.amount, 4),
      cardId: p.cardId,
      posId: p.posId,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function rollingPosState(
  entry: CalendarEntry,
  window: 7 | 14,
): Array<{ id: string; volume: number; activeDays: number; share: number }> {
  return entry.posResources
    .map((p) => ({
      id: p.id,
      volume: round(window === 7 ? p.volume7d : p.volume14d, 4),
      activeDays: window === 7 ? p.activeDays7d : p.activeDays14d,
      share: round(window === 7 ? p.shareOfActiveDays7d : p.shareOfActiveDays14d, 6),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function calendarInspectParity(
  fast: CalendarEntry[],
  fullPrefix: CalendarEntry[],
  moneyTol = 0.05,
  scoreTol = 1e-6,
): InspectParityMismatch[] {
  const n = Math.min(fast.length, fullPrefix.length);
  const mismatches: InspectParityMismatch[] = [];
  const push = (day: number, field: string, a: unknown, b: unknown) => {
    mismatches.push({ day, field, fast: JSON.stringify(a), full: JSON.stringify(b) });
  };
  for (let i = 0; i < n; i++) {
    const a = fast[i]!;
    const b = fullPrefix[i]!;
    const day = a.day;
    if (Math.abs(a.coreThroughput - b.coreThroughput) > moneyTol) {
      push(day, "coreThroughput", a.coreThroughput, b.coreThroughput);
    }
    if (Math.abs(a.organicRevenue - b.organicRevenue) > moneyTol) {
      push(day, "organicRevenue", a.organicRevenue, b.organicRevenue);
    }
    if (Math.abs(a.organicExpense - b.organicExpense) > moneyTol) {
      push(day, "organicExpense", a.organicExpense, b.organicExpense);
    }
    const aCards = [...new Set(a.coreAllocations.map((p) => p.cardId))].sort();
    const bCards = [...new Set(b.coreAllocations.map((p) => p.cardId))].sort();
    if (aCards.join() !== bCards.join()) push(day, "selectedCards", aCards, bCards);
    const aPos = [...a.posUsedIds].sort();
    const bPos = [...b.posUsedIds].sort();
    if (aPos.join() !== bPos.join()) push(day, "selectedPOS", aPos, bPos);
    const aPairs = sortedCorePairs(a);
    const bPairs = sortedCorePairs(b);
    if (aPairs.map((p) => p.key).join() !== bPairs.map((p) => p.key).join()) {
      push(day, "selectedPairs", aPairs.map((p) => p.key), bPairs.map((p) => p.key));
    }
    for (let k = 0; k < Math.max(aPairs.length, bPairs.length); k++) {
      if (Math.abs((aPairs[k]?.amount ?? 0) - (bPairs[k]?.amount ?? 0)) > moneyTol) {
        push(day, "pairAmounts", aPairs, bPairs);
        break;
      }
    }
    if (Math.abs(a.hazard - b.hazard) > 1e-8) push(day, "hazard", a.hazard, b.hazard);
    if (Math.abs(a.rolloutQ - b.rolloutQ) > moneyTol) push(day, "rolloutQ", a.rolloutQ, b.rolloutQ);
    if (Math.abs(a.merchantMaturity.score - b.merchantMaturity.score) > scoreTol) {
      push(day, "maturity.merchant", a.merchantMaturity.score, b.merchantMaturity.score);
    }
    if (
      Math.abs((a.cardResources[0]?.maturityScore ?? 0) - (b.cardResources[0]?.maturityScore ?? 0)) >
      scoreTol
    ) {
      push(
        day,
        "maturity.card0",
        a.cardResources[0]?.maturityScore,
        b.cardResources[0]?.maturityScore,
      );
    }
    const roll7a = rollingPosState(a, 7);
    const roll7b = rollingPosState(b, 7);
    if (JSON.stringify(roll7a) !== JSON.stringify(roll7b)) push(day, "rolling7dState", roll7a, roll7b);
    const roll14a = rollingPosState(a, 14);
    const roll14b = rollingPosState(b, 14);
    if (JSON.stringify(roll14a) !== JSON.stringify(roll14b)) push(day, "rolling14dState", roll14a, roll14b);
    if (Math.abs(a.hazardDecomposition.concentration7d - b.hazardDecomposition.concentration7d) > scoreTol) {
      push(day, "concentration7d", a.hazardDecomposition.concentration7d, b.hazardDecomposition.concentration7d);
    }
    if (Math.abs(a.hazardDecomposition.concentration14d - b.hazardDecomposition.concentration14d) > scoreTol) {
      push(day, "concentration14d", a.hazardDecomposition.concentration14d, b.hazardDecomposition.concentration14d);
    }
  }
  if (fast.length !== fullPrefix.length) {
    mismatches.push({
      day: 0,
      field: "length",
      fast: String(fast.length),
      full: String(fullPrefix.length),
    });
  }
  return mismatches;
}
