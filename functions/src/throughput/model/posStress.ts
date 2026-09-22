/**
 * Conditional POS-resilience stress experiment.
 *
 * Conditions on a POS-scoped review at T2 (not on unconditional Monte Carlo frequency).
 * Compares 2 POS → 1 remaining vs 3 POS → 2 remaining under identical demand tickets
 * (same rngSeed). Production hazard / persistence / bank coefficients are not retuned.
 * Account / institution / system events are excluded: POS 3 is not hypothesised to
 * protect against those; this test asks whether it prevents the first POS failure from
 * converting a diversified book into a one-POS concentration state.
 */
import { cascadeScenario } from "./cascade";
import { isOperatingWeekday, weekdayName } from "./demand";
import { nMinusOneExposureSnapshot, type NMinusOneExposureSnapshot } from "./nMinusOneExposure";
import { routingFromCalendarEntry, type RoutingResult } from "./posConcentration";
import { simulate } from "./simulation";
import { createInitialState } from "./state";
import type {
  CalendarEntry,
  ContinuityRegime,
  DegradedRoutingDiagnostics,
  LossDomainProbabilities,
  Scenario,
  SimulationDayRow,
  SimulationResult,
} from "./types";

export const POS_STRESS_HIT_DAY = 3;
export const POS_STRESS_LOCK_FRACTION = 0.5;
export const POS_STRESS_DURATIONS = [1, 2, 3, 5] as const;
export const POS_STRESS_POS_COUNTS = [2, 3] as const;

/** Family A POS-scoped mass only, renormalised. Merchant/institution/system stay out of this test. */
export const POS_SCOPED_DOMAIN_MIX: LossDomainProbabilities = {
  pair: 0.15 / 0.8,
  card: 0.45 / 0.8,
  pos: 0.2 / 0.8,
  merchant: 0,
  institution: 0,
  system: 0,
};

export interface PosStressScenarioOpts {
  initialPos: number;
  rngSeed: number;
  /** When true, second-hit Bernoulli draws are suppressed (geometry tests). */
  silentCascade?: boolean;
  /** CRITICAL-regime surviving-POS persistence κ. 0 = off. */
  criticalPersistenceSensitivity?: number;
  /** β-aware degraded-state packer. null / undefined = old packer. */
  degradedMaxPosShare?: number | null;
  /**
   * Severity model for a POS review. undefined / null = legacy flat lock (posCapitalLockFraction
   * = 0.50 of the working book). A number = exposure-weighted lock with that scale
   * (scale 1: a 50/50 two-POS book traps 50%; a 90/10 book traps 90% on the big terminal).
   */
  posExposureLockScale?: number | null;
  /** Ledger window (calendar days) for the exposure share. Default 7. */
  posExposureWindowDays?: number;
  nMinusOneRetentionMin?: number | null;
  nMinusOneMaxPosShareLimit?: number | null;
  /** Larger daily demand / tickets relative to R100k capital (scale sensitivity). */
  largeBook?: boolean;
}

export function posStressScenario(opts: PosStressScenarioOpts): Scenario {
  const s = cascadeScenario(opts.initialPos, {
    posCapitalLockFraction: POS_STRESS_LOCK_FRACTION,
    concentrationSensitivity: 0.8,
    shortReviewMinDays: 1,
    shortReviewMaxDays: 3,
    longReviewMinDays: 35,
    longReviewMaxDays: 42,
    rngSeed: opts.rngSeed,
  });
  s.realizedCascadeEnabled = false;
  s.hiddenWorldEnabled = false;
  s.maximumPosDevices = opts.initialPos;
  s.posEveryDays = 0;
  s.lossDomainProbabilities = { ...POS_SCOPED_DOMAIN_MIX };
  s.criticalPersistenceSensitivity = opts.criticalPersistenceSensitivity ?? 0;
  s.degradedMaxPosShare = opts.degradedMaxPosShare ?? null;
  s.posExposureLockScale = opts.posExposureLockScale ?? null;
  if (opts.posExposureWindowDays !== undefined) s.posExposureWindowDays = opts.posExposureWindowDays;
  s.nMinusOneRetentionMin = opts.nMinusOneRetentionMin ?? null;
  s.nMinusOneMaxPosShareLimit = opts.nMinusOneMaxPosShareLimit ?? null;
  if (opts.largeBook) {
    s.initialCards = 8;
    s.meanDailyCoreTickets = 8;
    s.avgTicketZar = 10_000;
    s.expectedTicketMinZar = 4_000;
    s.expectedTicketMaxZar = 16_000;
    s.throughputStepZar = 10_000;
  }
  if (opts.silentCascade) {
    s.p0 = 0;
  }
  return s;
}

export interface HazardFeedbackRow {
  day: number;
  weekday: string;
  regime: ContinuityRegime;
  availablePos: number;
  availableCapital: number;
  lockedCapital: number;
  posShares: Record<string, number>;
  largestPosShare: number;
  posHhi: number;
  concentrationFactor: number;
  pairPersistenceDays: number;
  largestPairShare: number;
  persistenceFactor: number;
  criticalPersistenceFactor: number;
  survivingPosConsecutiveDays: number;
  structuralHazard: number;
  deltaHazardVsPreHit: number;
  throughput: number;
  deferredZar: number;
  backlogZar: number;
  /** Executed-ticket re-routing bound: could the same tickets have been spread more evenly? */
  routing: RoutingResult | null;
  /** β-aware packer diagnostics when the flag was on for this day (rules-checked enumeration). */
  degradedRouting: DegradedRoutingDiagnostics | null;
  /** True when a review is open or capital is trapped at the start of the day. */
  degraded: boolean;
  collapsed: boolean;
  demandZar: number;
}

export interface PosStressPath {
  seed: number;
  pos: number;
  operatingDaysDown: number;
  hitDay: number;
  hitPosId: string | null;
  enteredCritical: boolean;
  collapsed: boolean;
  collapseReason: SimulationDayRow["collapseReason"];
  secondHitBeforeFirstReviewClears: boolean;
  secondHitWhileCritical: boolean;
  secondHitDomain: string | null;
  operatingDaysCritical: number;
  peakPosConcentration: number;
  peakStructuralHazard: number;
  peakCapitalLocked: number;
  throughputExecuted: number;
  throughputDeferred: number;
  backlogGenerated: number;
  expiredZar: number;
  timeToFullRecoveryOperatingDays: number | null;
  recovered: boolean;
  preHitHazard: number;
  preHitLargestPosShare: number;
  preHitActivePos: number;
  preHitThroughput: number;
  totalGross: number;
  totalCA: number;
  /** Days actually simulated (the run extends while resources stay degraded). */
  horizonDays: number;
  /**
   * Fixed-window economics through POS_STRESS_WINDOW_DAY so arms with different degraded
   * horizons are comparable: Σ throughput, gross profit and continuity-adjusted EV over days 1..W.
   */
  windowThroughDay: number;
  windowThroughput: number;
  windowGross: number;
  windowCA: number;
  peakCriticalPersistenceFactor: number;
  /** Severity-side N−1 snapshot of the book on the hit day (before the hit is applied). */
  exposureAtHit: NMinusOneExposureSnapshot | null;
  /** Capital the forced review actually trapped (from the interruption event). */
  lockedAtHit: number;
  /** Pre-hit operating days (healthy-state planner behaviour). */
  healthyOperatingDays: number;
  healthyThroughput: number;
  healthyCA: number;
  healthyMeanLargestPosShare: number;
  healthyMeanPosHhi: number;
  healthyMeanRetention: number;
  healthyMeanN1MaxShare: number;
  healthyMeanWorstCaseLockShare: number;
  /** Operating days whose chosen plan failed the N−1 constraint (Q fallback). */
  resilienceInfeasibleDays: number;
  healthyResilienceInfeasibleDays: number;
  feedback: HazardFeedbackRow[];
}

/** Fixed comparison window: hit at T2 (day 4), the longest tested review (5 operating days), and recovery. */
export const POS_STRESS_WINDOW_DAY = 16;

function posSharesFromCalendar(entry: CalendarEntry | undefined): Record<string, number> {
  const shares: Record<string, number> = {};
  if (!entry) return shares;
  let total = 0;
  for (const row of entry.coreAllocations) {
    shares[row.posId] = (shares[row.posId] ?? 0) + row.amount;
    total += row.amount;
  }
  if (total <= 1e-9) return shares;
  for (const id of Object.keys(shares)) shares[id] = shares[id]! / total;
  return shares;
}

function calendarByDay(result: SimulationResult): Map<number, CalendarEntry> {
  const m = new Map<number, CalendarEntry>();
  for (const e of result.calendar) m.set(e.day, e);
  return m;
}

function observedPosConcentration(row: SimulationDayRow, demandZar: number): number {
  if (row.activePosCount === 1 && demandZar > 1e-9) return 1;
  return row.largestPosShare;
}

export function summarizePosStressPath(
  result: SimulationResult,
  opts: { seed: number; pos: number; operatingDaysDown: number; hitDay: number },
  scenario: Scenario,
): PosStressPath {
  const cal = calendarByDay(result);
  const events = [...(result.endingState.interruptionEvents ?? [])].sort((a, b) => a.day - b.day);
  const firstPos = events.find((e) => e.domain === "pos" && e.day === opts.hitDay) ?? events.find((e) => e.domain === "pos");
  const firstClear = firstPos?.downUntilDay ?? Number.POSITIVE_INFINITY;
  const preHit = result.days.find((d) => d.day === opts.hitDay);
  const hitEntry = cal.get(opts.hitDay);
  const preHitHazard = preHit?.hazard ?? 0;
  const laterEvents = events.filter((e) => e.day > opts.hitDay);
  const secondBeforeClear = laterEvents.find((e) => e.day < firstClear) ?? null;

  const feedback: HazardFeedbackRow[] = [];
  let enteredCritical = false;
  let collapsed = false;
  let collapseReason: SimulationDayRow["collapseReason"] = null;
  let operatingDaysCritical = 0;
  let peakPosConcentration = 0;
  let peakStructuralHazard = preHitHazard;
  let peakCapitalLocked = 0;
  let peakCriticalPersistenceFactor = 1;
  let throughputExecuted = 0;
  let throughputDeferred = 0;
  let backlogGenerated = 0;
  let secondHitWhileCritical = false;
  let firstDegradedOperatingDay: number | null = null;
  let recoveryOperatingDay: number | null = null;
  let operatingDaysAfterHit = 0;

  for (const row of result.days) {
    if (row.day <= opts.hitDay) continue;
    const entry = cal.get(row.day);
    const demandZar = entry?.demandFates
      ? entry.demandFates.arrivalsZar + entry.demandFates.backlogInZar
      : row.throughput;
    const operating = isOperatingWeekday(row.day);
    if (operating) operatingDaysAfterHit += 1;

    const shares = posSharesFromCalendar(entry);
    const conc = observedPosConcentration(row, demandZar);
    const regime = row.regime ?? "normal";
    if (operating && firstDegradedOperatingDay === null && (regime !== "normal" || (row.activeReviews ?? 0) > 0 || (row.lockedCapital ?? 0) > 1e-9)) {
      firstDegradedOperatingDay = row.day;
    }
    const fullyRecovered =
      operating &&
      regime === "normal" &&
      (row.activeReviews ?? 0) === 0 &&
      (row.lockedCapital ?? 0) <= 1e-9 &&
      row.activePosCount >= 2;
    if (fullyRecovered && recoveryOperatingDay === null && firstDegradedOperatingDay !== null) {
      recoveryOperatingDay = operatingDaysAfterHit;
    }

    if (regime === "critical") {
      enteredCritical = true;
      if (operating) operatingDaysCritical += 1;
    }
    if (regime === "collapsed" && !collapsed) {
      collapsed = true;
      collapseReason = row.collapseReason ?? "zero-capital";
    }
    if (row.hitDomain && regime === "critical") secondHitWhileCritical = true;
    if (row.hitDomain && laterEvents.some((e) => e.day === row.day) && enteredCritical) {
      secondHitWhileCritical = true;
    }

    peakPosConcentration = Math.max(peakPosConcentration, conc);
    peakStructuralHazard = Math.max(peakStructuralHazard, row.hazard);
    peakCapitalLocked = Math.max(peakCapitalLocked, row.lockedCapital ?? 0);
    peakCriticalPersistenceFactor = Math.max(
      peakCriticalPersistenceFactor,
      row.criticalPersistenceFactor ?? entry?.hazardDecomposition.criticalPersistenceFactor ?? 1,
    );
    if (operating) {
      throughputExecuted += row.throughput;
      const deferred = entry?.demandFates?.deferredZar ?? 0;
      throughputDeferred += deferred;
      backlogGenerated = Math.max(backlogGenerated, row.backlogZar ?? 0);
    }

    const stillDegraded = regime !== "normal" || (row.activeReviews ?? 0) > 0 || (row.lockedCapital ?? 0) > 1e-9;
    if (operating && (stillDegraded || row.day < firstClear)) {
      feedback.push({
        day: row.day,
        weekday: weekdayName(row.day),
        regime,
        availablePos: row.activePosCount,
        availableCapital: row.availableCapital ?? entry?.availableCapital ?? 0,
        lockedCapital: row.lockedCapital ?? 0,
        posShares: shares,
        largestPosShare: conc,
        posHhi: row.posHhi,
        concentrationFactor: row.concentrationFactor ?? entry?.hazardDecomposition.concentrationFactor ?? 1,
        pairPersistenceDays: row.maxConsecutivePairDays,
        largestPairShare: row.largestPairShare14d,
        persistenceFactor: row.persistenceFactor ?? entry?.hazardDecomposition.persistenceFactor ?? 1,
        criticalPersistenceFactor:
          row.criticalPersistenceFactor ?? entry?.hazardDecomposition.criticalPersistenceFactor ?? 1,
        survivingPosConsecutiveDays: entry?.hazardDecomposition.survivingPosConsecutiveDays ?? 0,
        structuralHazard: row.hazard,
        deltaHazardVsPreHit: row.hazard - preHitHazard,
        throughput: row.throughput,
        deferredZar: entry?.demandFates?.deferredZar ?? 0,
        backlogZar: row.backlogZar ?? 0,
        routing: entry ? routingFromCalendarEntry(entry, scenario) : null,
        degradedRouting: entry?.degradedRouting ?? null,
        degraded: (row.activeReviews ?? 0) > 0 || (row.lockedCapital ?? 0) > 1e-9,
        collapsed: regime === "collapsed",
        demandZar,
      });
    }
  }

  const recovered =
    recoveryOperatingDay !== null ||
    ((result.endingState.pos.every((p) => p.downUntilDay === null || p.downUntilDay <= result.endingState.day) &&
      (result.endingState.trappedCapital ?? 0) <= 1e-9));

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const healthyDays = result.days.filter((d) => d.day < opts.hitDay && isOperatingWeekday(d.day) && d.throughput > 1e-9);

  return {
    seed: opts.seed,
    pos: opts.pos,
    operatingDaysDown: opts.operatingDaysDown,
    hitDay: opts.hitDay,
    hitPosId: firstPos?.targetIds[0] ?? null,
    enteredCritical,
    collapsed,
    collapseReason,
    secondHitBeforeFirstReviewClears: secondBeforeClear !== null,
    secondHitWhileCritical,
    secondHitDomain: secondBeforeClear?.domain ?? null,
    operatingDaysCritical,
    peakPosConcentration,
    peakStructuralHazard,
    peakCapitalLocked,
    throughputExecuted,
    throughputDeferred,
    backlogGenerated,
    expiredZar: result.endingState.expiredDemandZar ?? 0,
    timeToFullRecoveryOperatingDays: recoveryOperatingDay,
    recovered,
    preHitHazard,
    preHitLargestPosShare: preHit?.largestPosShare ?? 0,
    preHitActivePos: preHit?.activePosCount ?? opts.pos,
    preHitThroughput: preHit?.throughput ?? 0,
    totalGross: result.totalGrossProfit,
    totalCA: result.totalContinuityAdjusted,
    horizonDays: result.days.length,
    windowThroughDay: POS_STRESS_WINDOW_DAY,
    windowThroughput: result.days.filter((d) => d.day <= POS_STRESS_WINDOW_DAY).reduce((a, d) => a + d.throughput, 0),
    windowGross: result.days.filter((d) => d.day <= POS_STRESS_WINDOW_DAY).reduce((a, d) => a + d.grossProfit, 0),
    windowCA: result.days.filter((d) => d.day <= POS_STRESS_WINDOW_DAY).reduce((a, d) => a + d.continuityAdjustedEv, 0),
    peakCriticalPersistenceFactor,
    exposureAtHit: hitEntry ? nMinusOneExposureSnapshot(hitEntry, scenario) : null,
    lockedAtHit: firstPos?.lockedCapital ?? 0,
    healthyOperatingDays: healthyDays.length,
    healthyThroughput: healthyDays.reduce((a, d) => a + d.throughput, 0),
    healthyCA: healthyDays.reduce((a, d) => a + d.continuityAdjustedEv, 0),
    healthyMeanLargestPosShare: mean(healthyDays.map((d) => d.largestPosShare).filter((x) => x > 0)),
    healthyMeanPosHhi: mean(healthyDays.map((d) => d.posHhi).filter((x) => x > 0)),
    healthyMeanRetention: mean(healthyDays.map((d) => d.nMinusOneThroughputRetention).filter((x): x is number => x !== undefined)),
    healthyMeanN1MaxShare: mean(healthyDays.map((d) => d.nMinusOneMaxPosShare).filter((x): x is number => x !== undefined)),
    healthyMeanWorstCaseLockShare: mean(
      healthyDays
        .map((d) => {
          const cap = d.availableCapital ?? d.capital;
          return d.nMinusOneWorstCaseLock !== undefined && cap > 1e-9 ? d.nMinusOneWorstCaseLock / cap : null;
        })
        .filter((x): x is number => x !== null),
    ),
    resilienceInfeasibleDays: result.days.filter((d) => isOperatingWeekday(d.day) && d.nMinusOneResilienceFallback).length,
    healthyResilienceInfeasibleDays: healthyDays.filter((d) => d.nMinusOneResilienceFallback).length,
    feedback,
  };
}

export function runPosStressPath(
  initialPos: number,
  seed: number,
  operatingDaysDown: number,
  extras: {
    silentCascade?: boolean;
    realizedThroughDay?: number;
    criticalPersistenceSensitivity?: number;
    degradedMaxPosShare?: number | null;
    posExposureLockScale?: number | null;
    posExposureWindowDays?: number;
    nMinusOneRetentionMin?: number | null;
    nMinusOneMaxPosShareLimit?: number | null;
    largeBook?: boolean;
  } = {},
): { result: SimulationResult; path: PosStressPath } {
  const scenario = posStressScenario({
    initialPos,
    rngSeed: seed,
    silentCascade: extras.silentCascade,
    criticalPersistenceSensitivity: extras.criticalPersistenceSensitivity,
    degradedMaxPosShare: extras.degradedMaxPosShare,
    posExposureLockScale: extras.posExposureLockScale,
    posExposureWindowDays: extras.posExposureWindowDays,
    nMinusOneRetentionMin: extras.nMinusOneRetentionMin,
    nMinusOneMaxPosShareLimit: extras.nMinusOneMaxPosShareLimit,
    largeBook: extras.largeBook,
  });
  const result = simulate(createInitialState(scenario), scenario, "optimize", {
    realizedThroughDay: extras.realizedThroughDay ?? 16,
    extendWhileDegraded: { maxExtraDays: 21 },
    forcePosReview: { afterDay: POS_STRESS_HIT_DAY, operatingDaysDown },
    calendarThroughDay: 40,
  });
  return {
    result,
    path: summarizePosStressPath(
      result,
      {
        seed,
        pos: initialPos,
        operatingDaysDown,
        hitDay: POS_STRESS_HIT_DAY,
      },
      scenario,
    ),
  };
}

export interface PosStressArmSummary {
  pos: number;
  operatingDaysDown: number;
  n: number;
  pEnterCritical: number;
  nCritical: number;
  pSecondHitGivenHit: number;
  pSecondHitGivenCritical: number;
  pCollapseGivenHit: number;
  expectedOperatingDaysCritical: number;
  expectedPeakPosConcentration: number;
  expectedPeakHazard: number;
  expectedPeakLocked: number;
  expectedThroughputExecuted: number;
  expectedThroughputDeferred: number;
  expectedBacklog: number;
  expectedExpired: number;
  expectedTimeToRecovery: number | null;
  pRecovered: number;
  expectedGross: number;
  expectedCA: number;
  cvarCA80: number;
  cvarCA90: number;
  cvarCriticalDays80: number;
  expectedPeakCriticalPersistence: number;
  meanPreHitHazard: number;
  meanDeltaHazardFirstDegraded: number;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Mean of the lowest (1 − β) fraction. For CA, this is the downside tail. */
export function cvarLower(xs: number[], beta: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil((1 - beta) * sorted.length));
  return mean(sorted.slice(0, k));
}

/** Mean of the highest (1 − β) fraction. For critical days, this is the continuity tail. */
export function cvarUpper(xs: number[], beta: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil((1 - beta) * sorted.length));
  return mean(sorted.slice(0, k));
}

export function summarisePosStressArm(paths: PosStressPath[]): PosStressArmSummary {
  const n = paths.length || 1;
  const critical = paths.filter((p) => p.enteredCritical);
  const recoveredTimes = paths.map((p) => p.timeToFullRecoveryOperatingDays).filter((t): t is number => t !== null);
  const firstDelta = paths.map((p) => p.feedback[0]?.deltaHazardVsPreHit ?? 0);
  return {
    pos: paths[0]?.pos ?? 0,
    operatingDaysDown: paths[0]?.operatingDaysDown ?? 0,
    n: paths.length,
    pEnterCritical: paths.filter((p) => p.enteredCritical).length / n,
    nCritical: critical.length,
    pSecondHitGivenHit: paths.filter((p) => p.secondHitBeforeFirstReviewClears).length / n,
    pSecondHitGivenCritical: critical.length
      ? critical.filter((p) => p.secondHitBeforeFirstReviewClears).length / critical.length
      : 0,
    pCollapseGivenHit: paths.filter((p) => p.collapsed).length / n,
    expectedOperatingDaysCritical: mean(paths.map((p) => p.operatingDaysCritical)),
    expectedPeakPosConcentration: mean(paths.map((p) => p.peakPosConcentration)),
    expectedPeakHazard: mean(paths.map((p) => p.peakStructuralHazard)),
    expectedPeakLocked: mean(paths.map((p) => p.peakCapitalLocked)),
    expectedThroughputExecuted: mean(paths.map((p) => p.throughputExecuted)),
    expectedThroughputDeferred: mean(paths.map((p) => p.throughputDeferred)),
    expectedBacklog: mean(paths.map((p) => p.backlogGenerated)),
    expectedExpired: mean(paths.map((p) => p.expiredZar)),
    expectedTimeToRecovery: recoveredTimes.length ? mean(recoveredTimes) : null,
    pRecovered: paths.filter((p) => p.recovered).length / n,
    expectedGross: mean(paths.map((p) => p.totalGross)),
    expectedCA: mean(paths.map((p) => p.totalCA)),
    cvarCA80: cvarLower(paths.map((p) => p.totalCA), 0.8),
    cvarCA90: cvarLower(paths.map((p) => p.totalCA), 0.9),
    cvarCriticalDays80: cvarUpper(paths.map((p) => p.operatingDaysCritical), 0.8),
    expectedPeakCriticalPersistence: mean(paths.map((p) => p.peakCriticalPersistenceFactor)),
    meanPreHitHazard: mean(paths.map((p) => p.preHitHazard)),
    meanDeltaHazardFirstDegraded: mean(firstDelta),
  };
}

export interface PosStressCell {
  operatingDaysDown: number;
  two: PosStressArmSummary;
  three: PosStressArmSummary;
  paths: PosStressPath[];
}

export interface ConditionalPosStressReport {
  hitDay: number;
  lockFraction: number;
  seeds: number[];
  cells: PosStressCell[];
  /** Illustrative: P(POS-scoped hit on an operating day) ≈ h × π_POS. Not used in the conditional answers. */
  illustrativePiPos: number;
  illustrativeDailyPosHitRate: number;
}

export function runConditionalPosStress(opts: {
  seeds?: number[];
  durations?: readonly number[];
  silentCascade?: boolean;
} = {}): ConditionalPosStressReport {
  const seeds = opts.seeds ?? Array.from({ length: 24 }, (_, i) => 14 + i);
  const durations = opts.durations ?? POS_STRESS_DURATIONS;
  const cells: PosStressCell[] = [];
  let meanPreHitH = 0;
  let preHitN = 0;
  for (const operatingDaysDown of durations) {
    const paths: PosStressPath[] = [];
    for (const pos of POS_STRESS_POS_COUNTS) {
      for (const seed of seeds) {
        const { path } = runPosStressPath(pos, seed, operatingDaysDown, {
          silentCascade: opts.silentCascade,
        });
        paths.push(path);
        meanPreHitH += path.preHitHazard;
        preHitN += 1;
      }
    }
    const two = summarisePosStressArm(paths.filter((p) => p.pos === 2));
    const three = summarisePosStressArm(paths.filter((p) => p.pos === 3));
    cells.push({ operatingDaysDown, two, three, paths });
  }
  const h = preHitN ? meanPreHitH / preHitN : 0.06;
  return {
    hitDay: POS_STRESS_HIT_DAY,
    lockFraction: POS_STRESS_LOCK_FRACTION,
    seeds,
    cells,
    illustrativePiPos: 0.2,
    illustrativeDailyPosHitRate: h * 0.2,
  };
}
