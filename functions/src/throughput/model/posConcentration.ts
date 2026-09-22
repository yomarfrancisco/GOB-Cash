/**
 * N−1 concentration resilience (experiment).
 *
 * N−1 availability asks whether a second POS survives. N−1 concentration resilience asks
 * whether the surviving system can route the day's genuine tickets without pushing more
 * than β of the remaining book through a single merchant POS.
 *
 * For each degraded day we compute the minimum achievable max-POS-share by re-routing the
 * tickets the optimizer actually executed across the surviving terminals (card assignment
 * fixed — one purchase per card per day is untouched; pair reviews and per-POS capacity
 * respected). That separates "the optimizer chose a concentrated plan" from "no less
 * concentrated feasible plan existed". Hazard coefficients are not involved.
 */
import { isPairUp, upResources } from "./state";
import type { PosStressPath } from "./posStress";
import type { CalendarEntry, Scenario, SimState } from "./types";

export const CONCENTRATION_BETAS = [0.6, 0.7, 0.8, 0.9] as const;

export type ConcentrationRegime = "normal" | "stressed" | "critical" | "collapsed";

export interface RoutingResult {
  /** Max POS share of the executed plan as actually routed. */
  actualMaxShare: number;
  actualHhi: number;
  /** Lowest max POS share any feasible re-routing of the same tickets can achieve. */
  minAchievableMaxShare: number;
  /** POS HHI of the re-routing that attains minAchievableMaxShare. */
  hhiAtMin: number;
  ticketCount: number;
  survivingPos: number;
  executedZar: number;
  /** True when the executed tickets could have been spread more evenly than they were. */
  optimizerChoseConcentrated: boolean;
}

function hhi(shares: number[]): number {
  return shares.reduce((a, s) => a + s * s, 0);
}

function sharesByPos(rows: { posId: string; amount: number }[]): { max: number; hhi: number } {
  const byPos = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    byPos.set(r.posId, (byPos.get(r.posId) ?? 0) + r.amount);
    total += r.amount;
  }
  if (total <= 1e-9) return { max: 0, hhi: 0 };
  const shares = [...byPos.values()].map((v) => v / total);
  return { max: Math.max(...shares), hhi: hhi(shares) };
}

/**
 * Exhaustive re-routing of the executed tickets over surviving POS. N ≤ 12 tickets is
 * exhaustive; above that a greedy largest-first fill is used (never seen at 4 tickets/day).
 */
export function minMaxPosShareRouting(
  state: SimState,
  scenario: Scenario,
  tickets: { cardId: string; posId: string; amount: number }[],
): RoutingResult {
  const survivors = upResources(state.pos, state.day);
  const actual = sharesByPos(tickets);
  const executedZar = tickets.reduce((a, t) => a + t.amount, 0);
  const base = {
    actualMaxShare: actual.max,
    actualHhi: actual.hhi,
    ticketCount: tickets.length,
    survivingPos: survivors.length,
    executedZar,
  };
  if (tickets.length === 0 || survivors.length === 0 || executedZar <= 1e-9) {
    return { ...base, minAchievableMaxShare: actual.max, hhiAtMin: actual.hhi, optimizerChoseConcentrated: false };
  }
  const cap = Math.max(0, scenario.perPosCapacityZar);
  const k = survivors.length;
  const n = tickets.length;
  const allowed = tickets.map((t) => survivors.map((p) => isPairUp(state, t.cardId, p.id)));

  let bestMax = Number.POSITIVE_INFINITY;
  let bestHhi = 1;

  const evaluate = (assign: number[]): void => {
    const load = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) load[assign[i]!]! += tickets[i]!.amount;
    if (load.some((l) => l > cap + 1e-9)) return;
    const shares = load.map((l) => l / executedZar);
    const mx = Math.max(...shares);
    const h = hhi(shares);
    if (mx < bestMax - 1e-12 || (Math.abs(mx - bestMax) <= 1e-12 && h < bestHhi)) {
      bestMax = mx;
      bestHhi = h;
    }
  };

  if (n <= 12 && k ** n <= 4096) {
    const assign = new Array<number>(n).fill(0);
    const rec = (i: number): void => {
      if (i === n) {
        evaluate(assign);
        return;
      }
      for (let p = 0; p < k; p++) {
        if (!allowed[i]![p]) continue;
        assign[i] = p;
        rec(i + 1);
      }
    };
    rec(0);
  } else {
    const order = tickets.map((t, i) => i).sort((a, b) => tickets[b]!.amount - tickets[a]!.amount);
    const load = new Array<number>(k).fill(0);
    const assign = new Array<number>(n).fill(0);
    for (const i of order) {
      let best = -1;
      for (let p = 0; p < k; p++) {
        if (!allowed[i]![p]) continue;
        if (best < 0 || load[p]! < load[best]!) best = p;
      }
      if (best < 0) best = 0;
      assign[i] = best;
      load[best]! += tickets[i]!.amount;
    }
    evaluate(assign);
  }

  if (!Number.isFinite(bestMax)) {
    // No pair-feasible re-routing found (should not happen: the actual plan is one).
    bestMax = actual.max;
    bestHhi = actual.hhi;
  }
  return {
    ...base,
    minAchievableMaxShare: bestMax,
    hhiAtMin: bestHhi,
    optimizerChoseConcentrated: actual.max > bestMax + 1e-9,
  };
}

export function routingFromCalendarEntry(entry: CalendarEntry, scenario: Scenario): RoutingResult {
  const core = entry.actionPlan.transactions
    .filter((t) => t.source === "core")
    .map((t) => ({ cardId: t.cardId, posId: t.posId, amount: t.amount }));
  return minMaxPosShareRouting(entry.state, scenario, core);
}

/**
 * β-regime for one operating day.
 * NORMAL: no active review and no trapped capital.
 * STRESSED: review active / capital trapped, and a plan with maxPosShare ≤ β exists.
 * CRITICAL: review active / capital trapped, and no feasible routing of the executed
 *   tickets keeps maxPosShare ≤ β (includes one-POS days: share is 1 by construction).
 * COLLAPSED: no economically viable execution path (from the continuity regime).
 */
export function classifyConcentrationRegime(
  beta: number,
  input: {
    degraded: boolean;
    collapsed: boolean;
    demand: boolean;
    routing: RoutingResult | null;
  },
): ConcentrationRegime {
  if (input.collapsed) return "collapsed";
  if (!input.degraded) return "normal";
  if (!input.demand || !input.routing || input.routing.ticketCount === 0) return "stressed";
  return input.routing.minAchievableMaxShare > beta + 1e-9 ? "critical" : "stressed";
}

export interface ConcentrationPathSummary {
  seed: number;
  pos: number;
  enteredCritical: boolean;
  /** CRITICAL on a day with ≥ 2 executed tickets: a genuine routing failure, not a one-ticket artefact. */
  enteredCriticalMultiTicket: boolean;
  daysStressed: number;
  daysCritical: number;
  daysCriticalMultiTicket: number;
  daysCollapsed: number;
  /** Degraded days where the plan exceeded β although a routing ≤ β existed. */
  daysOptimizerChoseAboveBeta: number;
  /** Degraded days with exactly one executed ticket (share is 1 by construction). */
  singleTicketDays: number;
  maxSurvivingShare: number;
  meanSurvivingShare: number;
  meanHhi: number;
  meanMinAchievableShare: number;
  throughputRetained: number;
  executedZar: number;
  deferredZar: number;
  backlogGenerated: number;
  secondHit: boolean;
  /** β-aware packer only: degraded days where the chosen routing differed from the old packer's. */
  daysRerouted: number;
  /** Σ (chosen Q − old-packer Q) over rerouted days: the structural price paid for compliance. */
  rerouteQDeltaZar: number;
  peakPairPersistenceDays: number;
  meanPersistenceFactor: number;
  /** Fixed-window (days 1..POS_STRESS_WINDOW_DAY) economics; comparable across arms. */
  totalCA: number;
  totalGross: number;
  throughputExecuted: number;
  horizonDays: number;
  peakStructuralHazard: number;
}

export function summariseConcentrationPath(path: PosStressPath, beta: number): ConcentrationPathSummary {
  let daysStressed = 0;
  let daysCritical = 0;
  let daysCriticalMulti = 0;
  let daysCollapsed = 0;
  let daysChose = 0;
  let single = 0;
  let maxShare = 0;
  const shares: number[] = [];
  const hhis: number[] = [];
  const mins: number[] = [];
  const persistDays: number[] = [];
  const persistFactors: number[] = [];
  let executed = 0;
  let deferred = 0;
  let backlog = 0;
  let rerouted = 0;
  let qDelta = 0;
  for (const row of path.feedback) {
    if (!row.degraded && !row.collapsed) continue;
    // When the β-aware packer ran, its rules-checked enumeration is the authoritative bound and
    // the chosen routing is the executed one; otherwise fall back to the POS-only re-routing bound.
    const d = row.degradedRouting;
    const routing: RoutingResult | null = d
      ? {
          actualMaxShare: d.chosenMaxShare,
          actualHhi: d.chosenHhi,
          minAchievableMaxShare: d.minAchievableMaxShare,
          hhiAtMin: d.chosenHhi,
          ticketCount: d.ticketCount,
          survivingPos: d.survivingPos,
          executedZar: row.throughput,
          optimizerChoseConcentrated: d.chosenMaxShare > d.minAchievableMaxShare + 1e-9,
        }
      : row.routing;
    const regime = classifyConcentrationRegime(beta, {
      degraded: row.degraded,
      collapsed: row.collapsed,
      demand: row.demandZar > 1e-9,
      routing,
    });
    if (regime === "stressed") daysStressed += 1;
    if (regime === "critical") {
      daysCritical += 1;
      if ((routing?.ticketCount ?? 0) >= 2) daysCriticalMulti += 1;
    }
    if (regime === "collapsed") daysCollapsed += 1;
    if (routing && routing.ticketCount > 0) {
      if (routing.ticketCount === 1) single += 1;
      if (routing.actualMaxShare > beta + 1e-9 && routing.minAchievableMaxShare <= beta + 1e-9) daysChose += 1;
      maxShare = Math.max(maxShare, routing.actualMaxShare);
      shares.push(routing.actualMaxShare);
      hhis.push(routing.actualHhi);
      mins.push(routing.minAchievableMaxShare);
    }
    if (d?.rerouted) {
      rerouted += 1;
      qDelta += d.chosenQ - d.baselineQ;
    }
    persistDays.push(row.pairPersistenceDays);
    persistFactors.push(row.persistenceFactor);
    executed += row.throughput;
    deferred += row.deferredZar;
    backlog = Math.max(backlog, row.backlogZar);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    seed: path.seed,
    pos: path.pos,
    enteredCritical: daysCritical > 0,
    enteredCriticalMultiTicket: daysCriticalMulti > 0,
    daysStressed,
    daysCritical,
    daysCriticalMultiTicket: daysCriticalMulti,
    daysCollapsed,
    daysOptimizerChoseAboveBeta: daysChose,
    singleTicketDays: single,
    maxSurvivingShare: maxShare,
    meanSurvivingShare: mean(shares),
    meanHhi: mean(hhis),
    meanMinAchievableShare: mean(mins),
    throughputRetained: executed + deferred > 1e-9 ? executed / (executed + deferred) : 1,
    executedZar: executed,
    deferredZar: deferred,
    backlogGenerated: backlog,
    secondHit: path.secondHitBeforeFirstReviewClears,
    daysRerouted: rerouted,
    rerouteQDeltaZar: qDelta,
    peakPairPersistenceDays: persistDays.length ? Math.max(...persistDays) : 0,
    meanPersistenceFactor: mean(persistFactors),
    totalCA: path.windowCA,
    totalGross: path.windowGross,
    throughputExecuted: path.windowThroughput,
    horizonDays: path.horizonDays,
    peakStructuralHazard: path.peakStructuralHazard,
  };
}

export interface ConcentrationArmSummary {
  pos: number;
  beta: number;
  n: number;
  pCritical: number;
  pCriticalMultiTicket: number;
  expectedDaysStressed: number;
  expectedDaysCritical: number;
  expectedDaysCriticalMultiTicket: number;
  expectedDaysCollapsed: number;
  expectedDaysOptimizerChoseAboveBeta: number;
  expectedSingleTicketDays: number;
  maxSurvivingShare: number;
  meanSurvivingShare: number;
  meanHhi: number;
  meanMinAchievableShare: number;
  throughputRetained: number;
  expectedBacklog: number;
  pSecondHit: number;
  expectedDaysRerouted: number;
  expectedRerouteQDeltaZar: number;
  meanPeakPairPersistenceDays: number;
  meanPersistenceFactor: number;
  /** Fixed-window means (days 1..POS_STRESS_WINDOW_DAY). */
  meanCA: number;
  meanGross: number;
  meanThroughputExecuted: number;
  meanHorizonDays: number;
  meanPeakStructuralHazard: number;
}

export function summariseConcentrationArm(paths: PosStressPath[], beta: number): ConcentrationArmSummary {
  const rows = paths.map((p) => summariseConcentrationPath(p, beta));
  const n = rows.length || 1;
  const mean = (f: (r: ConcentrationPathSummary) => number) => rows.reduce((a, r) => a + f(r), 0) / n;
  const totalExec = rows.reduce((a, r) => a + r.executedZar, 0);
  const totalDef = rows.reduce((a, r) => a + r.deferredZar, 0);
  return {
    pos: paths[0]?.pos ?? 0,
    beta,
    n: rows.length,
    pCritical: rows.filter((r) => r.enteredCritical).length / n,
    pCriticalMultiTicket: rows.filter((r) => r.enteredCriticalMultiTicket).length / n,
    expectedDaysStressed: mean((r) => r.daysStressed),
    expectedDaysCritical: mean((r) => r.daysCritical),
    expectedDaysCriticalMultiTicket: mean((r) => r.daysCriticalMultiTicket),
    expectedDaysCollapsed: mean((r) => r.daysCollapsed),
    expectedDaysOptimizerChoseAboveBeta: mean((r) => r.daysOptimizerChoseAboveBeta),
    expectedSingleTicketDays: mean((r) => r.singleTicketDays),
    maxSurvivingShare: Math.max(0, ...rows.map((r) => r.maxSurvivingShare)),
    meanSurvivingShare: mean((r) => r.meanSurvivingShare),
    meanHhi: mean((r) => r.meanHhi),
    meanMinAchievableShare: mean((r) => r.meanMinAchievableShare),
    throughputRetained: totalExec + totalDef > 1e-9 ? totalExec / (totalExec + totalDef) : 1,
    expectedBacklog: mean((r) => r.backlogGenerated),
    pSecondHit: rows.filter((r) => r.secondHit).length / n,
    expectedDaysRerouted: mean((r) => r.daysRerouted),
    expectedRerouteQDeltaZar: mean((r) => r.rerouteQDeltaZar),
    meanPeakPairPersistenceDays: mean((r) => r.peakPairPersistenceDays),
    meanPersistenceFactor: mean((r) => r.meanPersistenceFactor),
    meanCA: mean((r) => r.totalCA),
    meanGross: mean((r) => r.totalGross),
    meanThroughputExecuted: mean((r) => r.throughputExecuted),
    meanHorizonDays: mean((r) => r.horizonDays),
    meanPeakStructuralHazard: mean((r) => r.peakStructuralHazard),
  };
}
