/**
 * State-dependent interruption cascade (experiment).
 *
 * A realized hit can fire from today's structural hazard while a previous review is still
 * open. POS-scoped hits lock `posCapitalLockFraction` of working capital in addition to
 * that terminal's in-flight exposure. Collapse is operational infeasibility (genuine demand
 * and zero executable capacity), not a monetary penalty. Account / institution / system
 * events still take every POS down; POS 3 cannot protect against those.
 */
import { isOperatingWeekday, resolveExogenousOffer } from "./demand";
import { createDefaultScenario } from "./defaults";
import { maxFeasibleThroughput, upResources } from "./state";
import type {
  CandidateEvaluation,
  CascadePathOutcome,
  ContinuityRegime,
  LossDomain,
  Scenario,
  SimState,
  SimulationDayRow,
  SimulationResult,
} from "./types";

export const ACCOUNT_WIDE_DOMAINS: LossDomain[] = ["merchant", "institution", "system"];

export interface OperationalFeasibility {
  operating: boolean;
  demandZar: number;
  activePOS: number;
  installedPOS: number;
  activeCards: number;
  lockedCapital: number;
  availableCapital: number;
  activeReviews: number;
  onePosDegraded: boolean;
  collapsed: boolean;
  collapseReason: CascadePathOutcome["collapseReason"];
  feasibleThroughput: number;
}

/**
 * Continuity regime after today's plan is known.
 *
 * NORMAL: at least two viable POS (or a non-operating / no-demand day).
 * CRITICAL: exactly one viable POS with genuine demand — throughput is necessarily concentrated.
 *   A 50% capital lock with two POS still up is stressed, not critical.
 * COLLAPSED: no economically viable executable path for required throughput (zero feasible
 *   capacity, or the optimizer idles while a review is open and demand remains).
 */
export function classifyContinuityRegime(
  f: OperationalFeasibility,
  plannedThroughput: number,
): { regime: ContinuityRegime; collapseReason: SimulationDayRow["collapseReason"] } {
  const required = f.demandZar;
  const operatingDemand = f.operating && required > 1e-9;
  if (operatingDemand && f.feasibleThroughput <= 1e-9) {
    return { regime: "collapsed", collapseReason: f.collapseReason ?? "zero-capital" };
  }
  if (operatingDemand && plannedThroughput <= 1e-9 && f.activeReviews > 0) {
    return { regime: "collapsed", collapseReason: "economic-idle" };
  }
  if (operatingDemand && f.activePOS === 1) {
    return { regime: "critical", collapseReason: null };
  }
  return { regime: "normal", collapseReason: null };
}

function reviewOpen(state: SimState, day: number): number {
  let n = 0;
  for (const r of [...state.cards, ...state.pos]) {
    if (r.downUntilDay !== null && r.downUntilDay > day) n += 1;
  }
  for (const p of state.pairs) {
    if (p.downUntilDay !== null && p.downUntilDay !== undefined && p.downUntilDay > day) n += 1;
  }
  return n;
}

function lockedCapitalOf(state: SimState): number {
  let z = 0;
  for (const r of [...state.cards, ...state.pos]) z += r.frozenCapital;
  for (const p of state.pairs) z += p.frozenCapital ?? 0;
  return z;
}

export function operationalFeasibility(state: SimState, scenario: Scenario): OperationalFeasibility {
  const day = state.day;
  const operating = isOperatingWeekday(day);
  const offer = resolveExogenousOffer(state, scenario);
  const backlogZar = (state.backlog ?? []).reduce((a, t) => a + t.amount, 0);
  const demandZar = operating ? offer.coreDemandZar : backlogZar;
  const activePOS = upResources(state.pos, day).length;
  const installedPOS = state.pos.length;
  const activeCards = upResources(state.cards, day).length;
  const downPOS = installedPOS - activePOS;
  const feasibleThroughput = maxFeasibleThroughput(state, scenario);
  const onePosDegraded = activePOS === 1 && downPOS >= 1;
  let collapseReason: CascadePathOutcome["collapseReason"] = null;
  if (operating && demandZar > 1e-9 && feasibleThroughput <= 1e-9) {
    if (activePOS <= 0) collapseReason = "zero-pos";
    else if (activeCards <= 0) collapseReason = "zero-card";
    else collapseReason = "zero-capital";
  }
  return {
    operating,
    demandZar,
    activePOS,
    installedPOS,
    activeCards,
    lockedCapital: lockedCapitalOf(state),
    availableCapital: Math.max(0, state.deployableCapital),
    activeReviews: reviewOpen(state, day),
    onePosDegraded,
    collapsed: collapseReason !== null,
    collapseReason,
    feasibleThroughput,
  };
}

export function resourcesStillDegraded(state: SimState): boolean {
  const day = state.day;
  if (reviewOpen(state, day) > 0) return true;
  if (lockedCapitalOf(state) > 1e-9) return true;
  return false;
}

export function summarizeCascadePath(result: SimulationResult): CascadePathOutcome {
  const rows = result.days;
  const events = result.endingState.interruptionEvents ?? [];
  const accountWideHit = events.some((e) => ACCOUNT_WIDE_DOMAINS.includes(e.domain));
  const posScopedHit = events.some((e) => e.domain === "pos");
  let enteredOnePos = false;
  let onePosDay: number | null = null;
  let collapsed = false;
  let collapseReason: CascadePathOutcome["collapseReason"] = null;
  let collapseDay: number | null = null;
  let daysDegraded = 0;
  let peakLocked = 0;
  let backlogSum = 0;
  let backlogN = 0;
  let maxBacklog = 0;
  let reviewsOpenAtHit = false;
  let secondHitDuringReview = false;
  for (const row of rows) {
    if (row.onePosDegraded) {
      if (!enteredOnePos) {
        enteredOnePos = true;
        onePosDay = row.day;
      }
    }
    if (row.collapsed && !collapsed) {
      collapsed = true;
      collapseReason = row.collapseReason ?? "zero-pos";
      collapseDay = row.day;
    }
    if ((row.activeReviews ?? 0) > 0 || row.onePosDegraded) daysDegraded += 1;
    peakLocked = Math.max(peakLocked, row.lockedCapital ?? 0);
    const b = row.backlogZar ?? 0;
    backlogSum += b;
    backlogN += 1;
    maxBacklog = Math.max(maxBacklog, b);
  }
  const byDay = [...events].sort((a, b) => a.day - b.day);
  for (const ev of byDay) {
    const prior = byDay.filter((e) => e.day < ev.day && e.downUntilDay > ev.day);
    if (prior.length > 0) {
      secondHitDuringReview = true;
      break;
    }
  }
  if (!secondHitDuringReview) {
    for (const row of rows) {
      if ((row.activeReviews ?? 0) > 0) reviewsOpenAtHit = true;
      if (row.hitDomain && reviewsOpenAtHit && (row.activeReviews ?? 0) > 0) {
        secondHitDuringReview = true;
        break;
      }
      if (row.hitDomain) reviewsOpenAtHit = true;
    }
  }
  const recovered = !resourcesStillDegraded(result.endingState);
  const expiredZar = result.endingState.expiredDemandZar ?? 0;
  const endingTrapped = result.endingState.trappedCapital ?? 0;
  const recoveredValue = result.totalGrossProfit - 0.1 * expiredZar;
  return {
    enteredOnePos,
    onePosDay,
    secondHitDuringReview,
    collapsed,
    collapseReason,
    collapseDay,
    accountWideHit,
    posScopedHit,
    daysDegraded,
    peakLockedCapital: peakLocked,
    meanBacklog: backlogN ? backlogSum / backlogN : 0,
    maxBacklog,
    recovered,
    recoveredValue,
    totalCA: result.totalContinuityAdjusted,
    totalGross: result.totalGrossProfit,
    expiredZar,
    endingTrapped,
  };
}

export function cascadeScenario(initialPos: number, opts: {
  posCapitalLockFraction: number;
  concentrationSensitivity: number;
  shortReviewMinDays: number;
  shortReviewMaxDays: number;
  longReviewMinDays: number;
  longReviewMaxDays: number;
  probabilityReviewIsLong?: number;
  rngSeed?: number;
}): Scenario {
  const s = createDefaultScenario();
  s.initialPos = initialPos;
  s.maximumPosDevices = initialPos;
  s.repeatWeightSameDay = 5;
  s.repeatWeight7d = 3;
  s.repeatWeight14d = 0.25;
  s.repeatCardSensitivity = 0.8;
  s.economicLearnerEnabled = false;
  s.hiddenWorldEnabled = false;
  s.valueOfInformationEnabled = false;
  s.coverMixEnabled = false;
  s.useLookahead = false;
  s.lossModel = "eventBased";
  s.realizedCascadeEnabled = true;
  s.posCapitalLockFraction = opts.posCapitalLockFraction;
  s.concentrationSensitivity = opts.concentrationSensitivity;
  s.shortReviewMinDays = opts.shortReviewMinDays;
  s.shortReviewMaxDays = opts.shortReviewMaxDays;
  s.longReviewMinDays = opts.longReviewMinDays;
  s.longReviewMaxDays = opts.longReviewMaxDays;
  if (opts.probabilityReviewIsLong !== undefined) s.probabilityReviewIsLong = opts.probabilityReviewIsLong;
  if (opts.rngSeed !== undefined) {
    s.rngSeed = opts.rngSeed;
    s.hiddenWorldSeed = opts.rngSeed;
  }
  return s;
}

export interface CascadeCellSpec {
  id: string;
  lock: number;
  conc: number;
  concLabel: string;
  durationLabel: string;
  shortMin: number;
  shortMax: number;
  longMin: number;
  longMax: number;
}

export function cascadeCellSpecs(): CascadeCellSpec[] {
  const current = { shortMin: 1, shortMax: 3, longMin: 35, longMax: 42 };
  const longer = { shortMin: 7, shortMax: 14, longMin: 50, longMax: 70 };
  const cells: CascadeCellSpec[] = [];
  for (const lock of [0.25, 0.5, 0.75]) {
    cells.push({
      id: `lock${lock}-concCurrent-durCurrent`,
      lock,
      conc: 0.8,
      concLabel: "current",
      durationLabel: "current",
      ...current,
    });
  }
  cells.push({
    id: "lock0.5-concModerate-durCurrent",
    lock: 0.5,
    conc: 1.6,
    concLabel: "moderate",
    durationLabel: "current",
    ...current,
  });
  cells.push({
    id: "lock0.5-concHigh-durCurrent",
    lock: 0.5,
    conc: 2.4,
    concLabel: "high",
    durationLabel: "current",
    ...current,
  });
  cells.push({
    id: "lock0.5-concCurrent-durLonger",
    lock: 0.5,
    conc: 0.8,
    concLabel: "current",
    durationLabel: "longer",
    ...longer,
  });
  return cells;
}

export interface CascadePathRecord {
  seed: number;
  pos: number;
  outcome: CascadePathOutcome;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export interface CascadeArmSummary {
  pos: number;
  n: number;
  pOnePos: number;
  pSecondHit: number;
  pCollapse: number;
  pCollapseZeroPos: number;
  pCollapseCapital: number;
  pAccountWideHit: number;
  pPosScopedHit: number;
  pOnePosGivenPosHit: number;
  pCollapseGivenPosHit: number;
  pCollapseGivenAccountHit: number;
  pRecovered: number;
  expectedDaysDegraded: number;
  expectedPeakLocked: number;
  expectedBacklog: number;
  expectedRecoveredValue: number;
  expectedCA: number;
  expectedGross: number;
  expectedExpired: number;
}

export function summariseArm(rows: CascadePathRecord[]): CascadeArmSummary {
  const n = rows.length || 1;
  const posHit = rows.filter((r) => r.outcome.posScopedHit);
  const acctHit = rows.filter((r) => r.outcome.accountWideHit);
  const zeroPos = rows.filter((r) => r.outcome.collapseReason === "zero-pos").length;
  const zeroCap = rows.filter((r) => r.outcome.collapseReason === "zero-capital").length;
  return {
    pos: rows[0]?.pos ?? 0,
    n: rows.length,
    pOnePos: rows.filter((r) => r.outcome.enteredOnePos).length / n,
    pSecondHit: rows.filter((r) => r.outcome.secondHitDuringReview).length / n,
    pCollapse: rows.filter((r) => r.outcome.collapsed).length / n,
    pCollapseZeroPos: zeroPos / n,
    pCollapseCapital: zeroCap / n,
    pAccountWideHit: acctHit.length / n,
    pPosScopedHit: posHit.length / n,
    pOnePosGivenPosHit: posHit.length ? posHit.filter((r) => r.outcome.enteredOnePos).length / posHit.length : 0,
    pCollapseGivenPosHit: posHit.length ? posHit.filter((r) => r.outcome.collapsed).length / posHit.length : 0,
    pCollapseGivenAccountHit: acctHit.length ? acctHit.filter((r) => r.outcome.collapsed).length / acctHit.length : 0,
    pRecovered: rows.filter((r) => r.outcome.recovered).length / n,
    expectedDaysDegraded: mean(rows.map((r) => r.outcome.daysDegraded)),
    expectedPeakLocked: mean(rows.map((r) => r.outcome.peakLockedCapital)),
    expectedBacklog: mean(rows.map((r) => r.outcome.meanBacklog)),
    expectedRecoveredValue: mean(rows.map((r) => r.outcome.recoveredValue)),
    expectedCA: mean(rows.map((r) => r.outcome.totalCA)),
    expectedGross: mean(rows.map((r) => r.outcome.totalGross)),
    expectedExpired: mean(rows.map((r) => r.outcome.expiredZar)),
  };
}

export function cascadeFieldsFromOpen(
  state: SimState,
  scenario: Scenario,
): Pick<
  SimulationDayRow,
  | "lockedCapital"
  | "activeReviews"
  | "backlogZar"
  | "collapsed"
  | "collapseReason"
  | "onePosDegraded"
  | "hitDomain"
  | "feasibleZar"
  | "availableCapital"
> {
  const f = operationalFeasibility(state, scenario);
  return {
    lockedCapital: f.lockedCapital,
    activeReviews: f.activeReviews,
    backlogZar: (state.backlog ?? []).reduce((a, t) => a + t.amount, 0),
    collapsed: f.collapsed,
    collapseReason: f.collapseReason,
    onePosDegraded: f.onePosDegraded,
    hitDomain: null,
    feasibleZar: f.feasibleThroughput,
    availableCapital: f.availableCapital,
  };
}

export function applyRegimeToDayRow(
  row: SimulationDayRow,
  f: OperationalFeasibility,
  evaluation: Pick<CandidateEvaluation, "throughput" | "hazardDecomposition">,
): void {
  const classified = classifyContinuityRegime(f, evaluation.throughput);
  row.regime = classified.regime;
  row.collapsed = classified.regime === "collapsed";
  row.collapseReason = classified.collapseReason;
  row.concentrationFactor = evaluation.hazardDecomposition.concentrationFactor;
  row.persistenceFactor = evaluation.hazardDecomposition.persistenceFactor;
  row.criticalPersistenceFactor = evaluation.hazardDecomposition.criticalPersistenceFactor;
  row.feasibleZar = f.feasibleThroughput;
  row.availableCapital = f.availableCapital;
}
