import { pairKey } from "./allocation";
import type { CalendarEntry, SimulationDayRow } from "./types";

function nearlyUnchanged(prev: SimulationDayRow, next: SimulationDayRow): boolean {
  const maturityDelta = Math.abs(next.merchantMaturity - prev.merchantMaturity);
  const fDelta = Math.abs(next.expectedCapacityLost - prev.expectedCapacityLost);
  return maturityDelta < 0.03 && fDelta < 0.03;
}

export function collectSurpriseFlags(
  days: SimulationDayRow[],
  calendar: CalendarEntry[],
): string[] {
  const flags: string[] = [];
  const posBest = longestStreak(calendar.map((e) => e.posUsedIds));
  const pairBest = longestStreak(calendar.map((e) => e.pairKeysUsed));

  if (posBest.length >= 7) {
    flags.push(
      `POS ${posBest.key} used on ${posBest.length} consecutive days. Cause: volume concentration does not distinguish daily use from the same 30-day Rands on fewer days; consecutive-use is diagnostic unless persistence is in the hazard. Neutral/id prefixes still keep early POS in the cheapest cover until resting it improves the cover metric enough to beat complexity.`,
    );
  }
  if (pairBest.length >= 7) {
    flags.push(
      `Pair ${pairBest.key} used on ${pairBest.length} consecutive days. Organic spend rides preferred core pairs, which reinforces reuse.`,
    );
  }

  for (const entry of calendar) {
    const nCards = entry.cardResources.length;
    const nPos = entry.posResources.length;
    if (nPos >= 3 && nCards >= 3 && entry.pairsUsed >= nCards * nPos && entry.pairsUsed >= 12) {
      flags.push(
        `Day ${entry.day}: full card×POS cartesian (${entry.pairsUsed} pairs). Same-day capacity-lost of sparse covers exceeded the 0.02 band around the best cover, so complexity lost to the dense plan.`,
      );
    }
    if (
      entry.expenseDiagnosis.expenseDeferred > 100 &&
      entry.expenseDiagnosis.marginalValueOfAdditionalOrganicSpendToday > 0 &&
      entry.expenseDiagnosis.bringForwardUpToZar <= 1
    ) {
      flags.push(
        `Day ${entry.day}: expense entitlement ${entry.expenseDiagnosis.expenseDeferred.toFixed(0)} deferred while myopic marginal value of spending is positive, but the multi-period Q check rejected bringing it forward (or the scheduler is holding to cadence).`,
      );
    }
  }

  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]!;
    const next = days[i]!;
    if (prev.coreThroughput <= 1e-9) continue;
    const ratio = next.coreThroughput / prev.coreThroughput;
    if (ratio >= 1.5 || ratio <= 1 / 1.5) {
      if (nearlyUnchanged(prev, next)) {
        flags.push(
          `Day ${next.day}: core moved from ${prev.coreThroughput.toFixed(0)} to ${next.coreThroughput.toFixed(0)} (${(ratio * 100).toFixed(0)}% of prior) while merchant maturity Δ=${Math.abs(next.merchantMaturity - prev.merchantMaturity).toFixed(3)} and today-f Δ=${Math.abs(next.expectedCapacityLost - prev.expectedCapacityLost).toFixed(3)}. Cause: discrete V grid plus lookahead continuation, not a large one-day state jump.`,
        );
      }
    }
  }

  return [...new Set(flags)];
}

export function longestStreak(keysPerDay: string[][]): { key: string; length: number } {
  const run: Record<string, number> = {};
  let best = { key: "", length: 0 };
  for (const keys of keysPerDay) {
    const today = new Set(keys);
    for (const key of Object.keys(run)) {
      run[key] = today.has(key) ? run[key]! + 1 : 0;
    }
    for (const key of today) {
      run[key] = (run[key] ?? 0) > 0 ? run[key]! : 1;
      if (run[key]! > best.length) best = { key, length: run[key]! };
    }
  }
  return best;
}

export function pairKeysFromEntry(entry: CalendarEntry): string[] {
  return entry.allocations.map((p) => pairKey(p.cardId, p.posId));
}
