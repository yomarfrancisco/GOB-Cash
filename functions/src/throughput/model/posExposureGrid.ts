/**
 * 2 / 3 / 4 / 5 POS grid under exposure-weighted severity (experiment).
 *
 * Only the severity model changes between arms: legacy flat lock (posCapitalLockFraction = 0.50)
 * vs exposure-weighted lock (posExposureLockScale = 1, window 7 or 3 days). p0, γ,
 * concentrationSensitivity, persistence, κ = 0, bank rules, loss coefficients and the packer
 * (old, β flag off) are untouched.
 *
 * Two runs per cell:
 *   • conditional: forced POS review at T2, 5 operating days (the resilience question);
 *   • unconditional: ordinary path, no forced hit (the guardrail: does normal-state behaviour
 *     change, and does the optimizer start spreading on its own?).
 */
import { nMinusOneExposureSnapshot } from "./nMinusOneExposure";
import { summariseConcentrationPath } from "./posConcentration";
import { POS_STRESS_WINDOW_DAY, posStressScenario, runPosStressPath, type PosStressPath } from "./posStress";
import { simulate } from "./simulation";
import { createInitialState } from "./state";
import { isOperatingWeekday } from "./demand";

export type SeverityArm = { id: string; label: string; posExposureLockScale: number | null; posExposureWindowDays?: number };

export const SEVERITY_ARMS: readonly SeverityArm[] = [
  { id: "flat", label: "Flat lock 0.50 (legacy)", posExposureLockScale: null },
  { id: "exp7", label: "Exposure-weighted, scale 1, 7-day window", posExposureLockScale: 1, posExposureWindowDays: 7 },
  { id: "exp3", label: "Exposure-weighted, scale 1, 3-day window", posExposureLockScale: 1, posExposureWindowDays: 3 },
] as const;

export const GRID_POS_COUNTS = [2, 3, 4, 5] as const;

export interface UnconditionalPathSummary {
  seed: number;
  pos: number;
  windowCA: number;
  windowGross: number;
  windowThroughput: number;
  /** Operating days with executed core volume in days 1..W. */
  activeDays: number;
  meanLargestPosShare: number;
  meanPosHhi: number;
  /** Severity-side snapshot means over active days (share of working capital). */
  meanLargestExposureShare: number;
  meanExpectedLockShare: number;
  meanWorstCaseLockShare: number;
  meanNMinusOneExecutableFraction: number;
  worstNMinusOneMinAchievableMaxShare: number;
  realizedHits: number;
  peakBacklog: number;
}

export function runUnconditionalPosPath(initialPos: number, seed: number, arm: SeverityArm): UnconditionalPathSummary {
  const scenario = posStressScenario({
    initialPos,
    rngSeed: seed,
    posExposureLockScale: arm.posExposureLockScale,
    posExposureWindowDays: arm.posExposureWindowDays,
  });
  // Ordinary path: realized cascade on (production p0), no forced review.
  scenario.realizedCascadeEnabled = true;
  const result = simulate(createInitialState(scenario), scenario, "optimize", {
    realizedThroughDay: POS_STRESS_WINDOW_DAY,
    calendarThroughDay: POS_STRESS_WINDOW_DAY,
  });
  const cal = new Map(result.calendar.map((e) => [e.day, e]));
  const shares: number[] = [];
  const hhis: number[] = [];
  const largestExp: number[] = [];
  const expLock: number[] = [];
  const worstLock: number[] = [];
  const n1exec: number[] = [];
  let worstN1Share = 0;
  let peakBacklog = 0;
  for (const row of result.days) {
    if (row.day > POS_STRESS_WINDOW_DAY) break;
    peakBacklog = Math.max(peakBacklog, row.backlogZar ?? 0);
    if (!isOperatingWeekday(row.day) || row.throughput <= 1e-9) continue;
    const entry = cal.get(row.day);
    shares.push(row.largestPosShare);
    hhis.push(row.posHhi);
    if (entry) {
      const snap = nMinusOneExposureSnapshot(entry, scenario);
      const w = Math.max(1e-9, snap.workingCapital);
      largestExp.push(snap.largestExposureShare);
      expLock.push(snap.expectedLockGivenPosHit / w);
      worstLock.push(snap.worstCaseLock / w);
      n1exec.push(snap.nMinusOneExecutableFraction);
      worstN1Share = Math.max(worstN1Share, snap.nMinusOneMinAchievableMaxShare);
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const win = result.days.filter((d) => d.day <= POS_STRESS_WINDOW_DAY);
  return {
    seed,
    pos: initialPos,
    windowCA: win.reduce((a, d) => a + d.continuityAdjustedEv, 0),
    windowGross: win.reduce((a, d) => a + d.grossProfit, 0),
    windowThroughput: win.reduce((a, d) => a + d.throughput, 0),
    activeDays: shares.length,
    meanLargestPosShare: mean(shares),
    meanPosHhi: mean(hhis),
    meanLargestExposureShare: mean(largestExp),
    meanExpectedLockShare: mean(expLock),
    meanWorstCaseLockShare: mean(worstLock),
    meanNMinusOneExecutableFraction: mean(n1exec),
    worstNMinusOneMinAchievableMaxShare: worstN1Share,
    realizedHits: (result.endingState.interruptionEvents ?? []).filter((e) => e.day <= POS_STRESS_WINDOW_DAY).length,
    peakBacklog,
  };
}

export interface ConditionalCellSummary {
  pos: number;
  arm: string;
  n: number;
  /** Severity at the hit. */
  meanLargestExposureShareAtHit: number;
  meanExpectedLockShareAtHit: number;
  meanWorstCaseLockShareAtHit: number;
  meanLockedAtHitShare: number;
  meanNMinusOneExecutableFractionAtHit: number;
  meanNMinusOneMinAchievableMaxShareAtHit: number;
  /** Outcome. */
  pCritical: number;
  pCriticalBeta70: number;
  pCriticalBeta70Multi: number;
  pCollapse: number;
  pSecondHit: number;
  expectedCriticalDays: number;
  meanPeakLockedCapital: number;
  meanPeakPosConcentration: number;
  meanPeakHazard: number;
  meanBacklog: number;
  throughputRetained: number;
  meanWindowThroughput: number;
  meanWindowGross: number;
  meanWindowCA: number;
  meanDaysToRecovery: number | null;
}

export function summariseConditionalCell(paths: PosStressPath[], arm: string): ConditionalCellSummary {
  const n = paths.length || 1;
  const mean = (f: (p: PosStressPath) => number) => paths.reduce((a, p) => a + f(p), 0) / n;
  const w = (p: PosStressPath) => Math.max(1e-9, p.exposureAtHit?.workingCapital ?? p.peakCapitalLocked);
  const conc = paths.map((p) => summariseConcentrationPath(p, 0.7));
  const exec = paths.reduce((a, p) => a + p.throughputExecuted, 0);
  const def = paths.reduce((a, p) => a + p.throughputDeferred, 0);
  const recov = paths.map((p) => p.timeToFullRecoveryOperatingDays).filter((x): x is number => x !== null);
  return {
    pos: paths[0]?.pos ?? 0,
    arm,
    n: paths.length,
    meanLargestExposureShareAtHit: mean((p) => p.exposureAtHit?.largestExposureShare ?? 0),
    meanExpectedLockShareAtHit: mean((p) => (p.exposureAtHit?.expectedLockGivenPosHit ?? 0) / w(p)),
    meanWorstCaseLockShareAtHit: mean((p) => (p.exposureAtHit?.worstCaseLock ?? 0) / w(p)),
    meanLockedAtHitShare: mean((p) => p.lockedAtHit / w(p)),
    meanNMinusOneExecutableFractionAtHit: mean((p) => p.exposureAtHit?.nMinusOneExecutableFraction ?? 0),
    meanNMinusOneMinAchievableMaxShareAtHit: mean((p) => p.exposureAtHit?.nMinusOneMinAchievableMaxShare ?? 0),
    pCritical: paths.filter((p) => p.enteredCritical).length / n,
    pCriticalBeta70: conc.filter((c) => c.enteredCritical).length / n,
    pCriticalBeta70Multi: conc.filter((c) => c.enteredCriticalMultiTicket).length / n,
    pCollapse: paths.filter((p) => p.collapsed).length / n,
    pSecondHit: paths.filter((p) => p.secondHitBeforeFirstReviewClears).length / n,
    expectedCriticalDays: mean((p) => p.operatingDaysCritical),
    meanPeakLockedCapital: mean((p) => p.peakCapitalLocked),
    meanPeakPosConcentration: mean((p) => p.peakPosConcentration),
    meanPeakHazard: mean((p) => p.peakStructuralHazard),
    meanBacklog: mean((p) => p.backlogGenerated),
    throughputRetained: exec + def > 1e-9 ? exec / (exec + def) : 1,
    meanWindowThroughput: mean((p) => p.windowThroughput),
    meanWindowGross: mean((p) => p.windowGross),
    meanWindowCA: mean((p) => p.windowCA),
    meanDaysToRecovery: recov.length ? recov.reduce((a, b) => a + b, 0) / recov.length : null,
  };
}

export function runConditionalCell(pos: number, seeds: number[], arm: SeverityArm, operatingDaysDown = 5): PosStressPath[] {
  return seeds.map(
    (seed) =>
      runPosStressPath(pos, seed, operatingDaysDown, {
        posExposureLockScale: arm.posExposureLockScale,
        posExposureWindowDays: arm.posExposureWindowDays,
      }).path,
  );
}
