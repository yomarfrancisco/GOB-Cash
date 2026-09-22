/**
 * N−1 exposure snapshot at the moment of a POS hit (severity-side diagnostics).
 *
 * For the book as it stood at T2 on the hit day (ledger including that day's rows):
 *   • per-POS exposure share and the capital a review of each terminal would trap,
 *   • expected lock given a POS hit (dependence-weighted like the loss model's target draw),
 *   • worst-case lock after loss of any one POS,
 *   • N−1 executable throughput: what the survivors could still execute next operating day
 *     after losing terminal j and its trapped capital (min over j),
 *   • N−1 minimum achievable max POS share: routing bound for the day's executed tickets
 *     after losing terminal j (max over j = worst case).
 * Hazard, persistence and bank coefficients are not involved.
 */
import { posExposures, type PosExposure } from "./eventLoss";
import { minMaxPosShareRouting } from "./posConcentration";
import { cloneState, maxFeasibleThroughput } from "./state";
import type { CalendarEntry, LedgerTransaction, PlannedTransaction, Scenario, SimState } from "./types";

export interface NMinusOneExposureSnapshot {
  day: number;
  posCount: number;
  workingCapital: number;
  exposures: PosExposure[];
  largestExposureShare: number;
  /** Σ_j w_j × lock_j with w_j = exposure share (the loss model draws POS targets by volume). */
  expectedLockGivenPosHit: number;
  /** max_j lock_j. */
  worstCaseLock: number;
  worstCasePosId: string | null;
  /** Executable throughput next operating day after losing terminal j and lock_j, min over j. */
  nMinusOneExecutableThroughput: number;
  nMinusOneExecutableThroughputPosId: string | null;
  /** Same, as a fraction of the day's executed demand (1 when demand was zero). */
  nMinusOneExecutableFraction: number;
  /** Worst-case (over lost terminal) minimum achievable max POS share for the day's tickets. */
  nMinusOneMinAchievableMaxShare: number;
  nMinusOneMinAchievablePosId: string | null;
  ticketCount: number;
  /** Per-terminal post-failure continuity of this packed plan. */
  byPos: NMinusOnePosLoss[];
}

export interface NMinusOnePosLoss {
  posId: string;
  lockZar: number;
  lockShare: number;
  executableZar: number;
  retention: number;
  minAchievableMaxShare: number;
}

function ledgerRowsFromPlan(day: number, txs: PlannedTransaction[]): LedgerTransaction[] {
  return txs.map((t) => ({
    day,
    economicPaymentId: t.economicPaymentId,
    cardId: t.cardId,
    posId: t.posId,
    amount: t.amount,
    source: t.source,
    cardOrigin: t.cardOrigin,
    highValue: t.highValue,
  }));
}

function mergeTodayLedger(state: SimState, today: LedgerTransaction[]): LedgerTransaction[] {
  const ledgerToday = new Set((state.bankLedger ?? []).filter((r) => r.day === state.day).map((r) => `${r.cardId}|${r.posId}|${r.amount}`));
  return [...(state.bankLedger ?? []), ...today.filter((r) => !ledgerToday.has(`${r.cardId}|${r.posId}|${r.amount}`))];
}

/**
 * Post-failure continuity of a packed plan: for every active POS j, take j down, lock the
 * capital economically exposed to j, and measure surviving executable capacity and the
 * minimum achievable max POS share of the same tickets on the survivors.
 *
 * Does not equalise ordinary-day shares. targetThroughput is the plan's packed core amount.
 */
export function nMinusOnePlanMetrics(
  state: SimState,
  scenario: Scenario,
  coreTickets: { cardId: string; posId: string; amount: number }[],
  extraLedger: LedgerTransaction[] = [],
  targetThroughput?: number,
): NMinusOneExposureSnapshot {
  const ledger = mergeTodayLedger(state, extraLedger);
  const working = Math.max(0, state.deployableCapital);
  const upPos = state.pos.filter((p) => p.downUntilDay === null || p.downUntilDay <= state.day);
  const exposures = posExposures(ledger, upPos, state.day, scenario, working);

  const shareSum = exposures.reduce((a, e) => a + e.share, 0);
  const expectedLock = shareSum > 1e-9 ? exposures.reduce((a, e) => a + (e.share / shareSum) * e.lockIfReviewed, 0) : 0;
  let worst = exposures[0] ?? null;
  for (const e of exposures) if (worst && e.lockIfReviewed > worst.lockIfReviewed) worst = e;

  const demand = targetThroughput ?? coreTickets.reduce((a, t) => a + t.amount, 0);

  let minExec = Number.POSITIVE_INFINITY;
  let minExecPos: string | null = null;
  let worstShare = 0;
  let worstSharePos: string | null = null;
  const byPos: NMinusOnePosLoss[] = [];
  for (const e of exposures) {
    const s = cloneState(state);
    s.day = state.day + 1;
    const p = s.pos.find((x) => x.id === e.posId);
    if (p) {
      p.downUntilDay = s.day + 30;
      p.frozenCapital += e.lockIfReviewed;
    }
    s.deployableCapital = Math.max(0, s.deployableCapital - e.lockIfReviewed);
    const exec = maxFeasibleThroughput(s, scenario);
    const share = coreTickets.length > 0 ? minMaxPosShareRouting(s, scenario, coreTickets).minAchievableMaxShare : 0;
    byPos.push({
      posId: e.posId,
      lockZar: e.lockIfReviewed,
      lockShare: working > 1e-9 ? e.lockIfReviewed / working : 0,
      executableZar: exec,
      retention: demand > 1e-9 ? Math.min(1, exec / demand) : 1,
      minAchievableMaxShare: share,
    });
    if (exec < minExec) {
      minExec = exec;
      minExecPos = e.posId;
    }
    if (coreTickets.length > 0 && share > worstShare) {
      worstShare = share;
      worstSharePos = e.posId;
    }
  }
  if (!Number.isFinite(minExec)) minExec = 0;

  return {
    day: state.day,
    posCount: upPos.length,
    workingCapital: working,
    exposures,
    largestExposureShare: Math.max(0, ...exposures.map((e) => e.share)),
    expectedLockGivenPosHit: expectedLock,
    worstCaseLock: worst?.lockIfReviewed ?? 0,
    worstCasePosId: worst?.posId ?? null,
    nMinusOneExecutableThroughput: minExec,
    nMinusOneExecutableThroughputPosId: minExecPos,
    nMinusOneExecutableFraction: demand > 1e-9 ? Math.min(1, minExec / demand) : 1,
    nMinusOneMinAchievableMaxShare: worstShare,
    nMinusOneMinAchievablePosId: worstSharePos,
    ticketCount: coreTickets.length,
    byPos,
  };
}

export function nMinusOneExposureSnapshot(entry: CalendarEntry, scenario: Scenario): NMinusOneExposureSnapshot {
  const txs = [...entry.actionPlan.transactions, ...entry.actionPlan.organicTransactions];
  const core = entry.actionPlan.transactions
    .filter((t) => t.source === "core")
    .map((t) => ({ cardId: t.cardId, posId: t.posId, amount: t.amount }));
  return nMinusOnePlanMetrics(
    entry.state,
    scenario,
    core,
    ledgerRowsFromPlan(entry.state.day, txs),
    core.reduce((a, t) => a + t.amount, 0),
  );
}

export function nMinusOneConstraintEnabled(scenario: Scenario): boolean {
  const r = scenario.nMinusOneRetentionMin;
  const b = scenario.nMinusOneMaxPosShareLimit;
  return (r !== null && r !== undefined && Number.isFinite(r)) || (b !== null && b !== undefined && Number.isFinite(b));
}

/**
 * Idle / zero-throughput does not count as satisfying N−1: the constraint is post-failure
 * continuity of an operating plan, not a licence to sit out.
 */
export function planSatisfiesNMinusOne(
  throughput: number,
  snap: Pick<NMinusOneExposureSnapshot, "nMinusOneExecutableFraction" | "nMinusOneMinAchievableMaxShare">,
  scenario: Scenario,
): boolean {
  if (!nMinusOneConstraintEnabled(scenario)) return true;
  if (throughput <= 1e-9) return false;
  const rMin = scenario.nMinusOneRetentionMin;
  const beta = scenario.nMinusOneMaxPosShareLimit;
  if (rMin !== null && rMin !== undefined && Number.isFinite(rMin) && snap.nMinusOneExecutableFraction + 1e-9 < rMin) return false;
  if (beta !== null && beta !== undefined && Number.isFinite(beta) && snap.nMinusOneMinAchievableMaxShare > beta + 1e-9) return false;
  return true;
}

export function nMinusOneFromPackedPlan(
  state: SimState,
  scenario: Scenario,
  transactions: PlannedTransaction[],
  organicTransactions: PlannedTransaction[] = [],
  packedThroughput: number,
): NMinusOneExposureSnapshot {
  const core = transactions.filter((t) => t.source === "core").map((t) => ({ cardId: t.cardId, posId: t.posId, amount: t.amount }));
  return nMinusOnePlanMetrics(
    state,
    scenario,
    core,
    ledgerRowsFromPlan(state.day, [...transactions, ...organicTransactions]),
    packedThroughput,
  );
}
