import { hhi, sum } from "./math";
import { isOperatingWeekday } from "./demand";
import type {
  AllocationPlan,
  ConfigFeatures,
  OperatingObservation,
  OutcomePayload,
  PackedDesign,
  PlannedTransaction,
  Scenario,
  SimState,
} from "./types";

export function emptyObservationLog(): OperatingObservation[] {
  return [];
}

export function upsertObservation(log: OperatingObservation[], obs: OperatingObservation): OperatingObservation[] {
  const replaceId = obs.provenance.replacesId;
  const index = log.findIndex((row) => row.id === obs.id || (replaceId && row.id === replaceId));
  if (index >= 0) {
    const next = log.slice();
    next[index] = obs;
    return next;
  }
  return [...log, obs];
}

function pairKey(cardId: string, posId: string): string {
  return `${cardId}|${posId}`;
}

function recentActiveDays(history: number[], window: number): number {
  return history.slice(-window).filter((v) => v > 1e-9).length;
}

function timeBucket(transactions: PlannedTransaction[]): number {
  if (transactions.length === 0) return 0;
  const avg =
    transactions.reduce((s, t) => {
      const [h, m] = t.time.split(":").map(Number);
      return s + (h ?? 9) * 60 + (m ?? 0);
    }, 0) / transactions.length;
  return avg >= 12 * 60 ? 1 : 0;
}

export function packedDesignFromPlan(
  state: SimState,
  plan: AllocationPlan,
  transactions: PlannedTransaction[],
): PackedDesign | null {
  const pairs = plan.pairs.filter((p) => p.amount > 1e-9);
  const throughputZar = sum(pairs.map((p) => p.amount));
  if (throughputZar <= 1e-9 && transactions.length === 0) return null;
  const cardIds = [...new Set(pairs.map((p) => p.cardId))].sort();
  const posIds = [...new Set(pairs.map((p) => p.posId))].sort();
  const pairKeys = pairs.map((p) => pairKey(p.cardId, p.posId)).sort();
  const volumesByResource: Record<string, number> = {};
  const ticketsByResource: Record<string, number> = {};
  for (const pair of pairs) {
    volumesByResource[pair.cardId] = (volumesByResource[pair.cardId] ?? 0) + pair.amount;
    volumesByResource[pair.posId] = (volumesByResource[pair.posId] ?? 0) + pair.amount;
  }
  for (const tx of transactions) {
    ticketsByResource[tx.cardId] = (ticketsByResource[tx.cardId] ?? 0) + 1;
    ticketsByResource[tx.posId] = (ticketsByResource[tx.posId] ?? 0) + 1;
  }
  const cardVols = cardIds.map((id) => volumesByResource[id] ?? 0);
  const posVols = posIds.map((id) => volumesByResource[id] ?? 0);
  const cardTotal = sum(cardVols) || 1;
  const posTotal = sum(posVols) || 1;
  const cardShares = cardVols.map((v) => v / cardTotal);
  const posShares = posVols.map((v) => v / posTotal);
  const pairShares = pairs.map((p) => p.amount / throughputZar);
  return {
    throughputZar,
    transactionCount: transactions.length,
    cardIds,
    posIds,
    pairKeys,
    volumesByResource,
    ticketsByResource,
    largestCardShare: cardShares.length ? Math.max(...cardShares) : 1,
    largestPosShare: posShares.length ? Math.max(...posShares) : 1,
    pairHhi: hhi(pairShares.length ? pairShares : [1]),
    recentActiveDays7d: recentActiveDays(state.throughputHistory, 7),
    recentActiveDays14d: recentActiveDays(state.throughputHistory, 14),
    consecutiveIdleBusinessDays: state.consecutiveIdleBusinessDays,
    businessTimeBucket: timeBucket(transactions),
    weekday: isOperatingWeekday(state.day),
  };
}

export function featuresFromDesign(design: PackedDesign): ConfigFeatures {
  return {
    logV: Math.log10(Math.max(1, design.throughputZar)),
    tx: design.transactionCount,
    cards: design.cardIds.length,
    pos: design.posIds.length,
    pairs: design.pairKeys.length,
    maxCardShare: design.largestCardShare,
    maxPosShare: design.largestPosShare,
    pairHhi: design.pairHhi,
    active7: design.recentActiveDays7d,
    active14: design.recentActiveDays14d,
    idle: design.consecutiveIdleBusinessDays,
    timeBucket: design.businessTimeBucket,
  };
}

export function kernelLengthScales(scenario: Scenario): ConfigFeatures {
  return {
    logV: Math.max(1e-6, scenario.voiKernelLogV),
    tx: Math.max(1e-6, scenario.voiKernelTx),
    cards: Math.max(1e-6, scenario.voiKernelCards),
    pos: Math.max(1e-6, scenario.voiKernelPos),
    pairs: Math.max(1e-6, scenario.voiKernelPairs),
    maxCardShare: Math.max(1e-6, scenario.voiKernelMaxShare),
    maxPosShare: Math.max(1e-6, scenario.voiKernelMaxShare),
    pairHhi: Math.max(1e-6, scenario.voiKernelHhi),
    active7: Math.max(1e-6, scenario.voiKernelActive7),
    active14: Math.max(1e-6, scenario.voiKernelActive14),
    idle: Math.max(1e-6, scenario.voiKernelIdle),
    timeBucket: Math.max(1e-6, scenario.voiKernelTime),
  };
}

export function kernel(a: ConfigFeatures, b: ConfigFeatures, scales: ConfigFeatures): number {
  let q = 0;
  (Object.keys(a) as (keyof ConfigFeatures)[]).forEach((key) => {
    const d = (a[key] - b[key]) / scales[key];
    q += d * d;
  });
  return Math.exp(-0.5 * q);
}

export function confidenceFromEffectiveN(n: number, nStar: number): number {
  const nn = Math.max(0, n);
  const star = Math.max(1e-9, nStar);
  return nn / (nn + star);
}

export function uncertaintyFromEffectiveN(n: number, nStar: number): number {
  return 1 - confidenceFromEffectiveN(n, nStar);
}

export function deltaUncertaintyFromNewObservation(n: number, nStar: number): number {
  return Math.max(0, uncertaintyFromEffectiveN(n, nStar) - uncertaintyFromEffectiveN(n + 1, nStar));
}

export function posteriorVariance(nOutcome: number, nStar: number, priorSigmaZar: number): number {
  const s = Math.max(0, priorSigmaZar);
  return (s * s) / (1 + Math.max(0, nOutcome) / Math.max(1e-9, nStar));
}

export function configEffectiveN(
  query: ConfigFeatures,
  log: OperatingObservation[],
  scenario: Scenario,
): number {
  const scales = kernelLengthScales(scenario);
  let n = 0;
  for (const obs of log) {
    if (!obs.design) continue;
    n += kernel(query, featuresFromDesign(obs.design), scales);
  }
  return n;
}

export function resourceEffectiveN(
  resourceId: string,
  query: ConfigFeatures,
  log: OperatingObservation[],
  scenario: Scenario,
): number {
  const scales = kernelLengthScales(scenario);
  let n = 0;
  for (const obs of log) {
    if (!obs.design) continue;
    if ((obs.design.volumesByResource[resourceId] ?? 0) <= 1e-9) continue;
    n += kernel(query, featuresFromDesign(obs.design), scales);
  }
  return n;
}

export function outcomeEffectiveN(
  query: ConfigFeatures,
  log: OperatingObservation[],
  scenario: Scenario,
): number {
  const scales = kernelLengthScales(scenario);
  let n = 0;
  for (const obs of log) {
    if (!obs.design || obs.outcomeStatus !== "complete" || !obs.outcome) continue;
    n += kernel(query, featuresFromDesign(obs.design), scales);
  }
  return n;
}

export function predictedOutcome(
  query: ConfigFeatures,
  log: OperatingObservation[],
  scenario: Scenario,
): number | null {
  const scales = kernelLengthScales(scenario);
  let w = 0;
  let acc = 0;
  for (const obs of log) {
    if (!obs.design || obs.outcomeStatus !== "complete" || !obs.outcome) continue;
    const k = kernel(query, featuresFromDesign(obs.design), scales);
    w += k;
    acc += k * obs.outcome.myopicEv;
  }
  if (w <= 1e-12) return null;
  return acc / w;
}

export function appendSimulationObservation(
  state: SimState,
  plan: AllocationPlan,
  transactions: PlannedTransaction[],
  outcome: OutcomePayload | null,
): void {
  const design = packedDesignFromPlan(state, plan, transactions);
  const idle = !design;
  const obs: OperatingObservation = {
    id: `sim:${state.day}`,
    source: "simulation",
    observedAt: { simDay: state.day },
    design,
    outcome: idle ? null : outcome,
    outcomeStatus: idle ? "none" : outcome ? "complete" : "none",
    provenance: {},
  };
  state.observations = upsertObservation(state.observations, obs);
}

export function observationsFromProductionJson(json: string): OperatingObservation[] {
  const parsed = JSON.parse(json) as unknown;
  const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "observations" in parsed
    ? (parsed as { observations: unknown }).observations
    : [];
  if (!Array.isArray(rows)) return [];
  return rows.filter(isOperatingObservation);
}

function isOperatingObservation(value: unknown): value is OperatingObservation {
  if (!value || typeof value !== "object") return false;
  const row = value as OperatingObservation;
  return typeof row.id === "string" && (row.source === "simulation" || row.source === "production");
}

export function queryFeaturesFromPlan(
  state: SimState,
  plan: AllocationPlan,
  transactions: PlannedTransaction[],
): ConfigFeatures | null {
  const design = packedDesignFromPlan(state, plan, transactions);
  return design ? featuresFromDesign(design) : null;
}
