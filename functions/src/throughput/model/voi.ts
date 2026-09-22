import { expectedUniform } from "./math";
import {
  configEffectiveN,
  deltaUncertaintyFromNewObservation,
  outcomeEffectiveN,
  posteriorVariance,
  predictedOutcome,
  queryFeaturesFromPlan,
  resourceEffectiveN,
  uncertaintyFromEffectiveN,
} from "./observations";
import type {
  AllocationPlan,
  CoverVoiDiagnosis,
  PlannedTransaction,
  Resource,
  ResourceVoiDiagnostic,
  Scenario,
  SimState,
} from "./types";

function blendedReviewDuration(scenario: Scenario): number {
  const short = expectedUniform(scenario.shortReviewMinDays, scenario.shortReviewMaxDays);
  const long = expectedUniform(scenario.longReviewMinDays, scenario.longReviewMaxDays);
  return (1 - scenario.probabilityReviewIsLong) * short + scenario.probabilityReviewIsLong * long;
}

export function remainingInformativeDays(_state: SimState, scenario: Scenario): number {
  const L = scenario.useLookahead ? Math.max(1, scenario.lookaheadDays) : 7;
  return Math.max(0, Math.min(L, 8) - 1);
}

export function independentCapacityFactor(effectiveCount: number, rho: number): number {
  const n = Math.max(0, effectiveCount);
  const r = Math.min(1, Math.max(0, rho));
  if (n < 1 - 1e-9) return 1;
  return Math.min(1, r + (1 - r) / n);
}

export function deltaIndependentCapacity(effectiveCount: number, rho: number): number {
  return independentCapacityFactor(effectiveCount, rho) - independentCapacityFactor(effectiveCount + 1, rho);
}

function scopeWeights(scenario: Scenario): { pCard: number; pPos: number } {
  const sum =
    scenario.interruptionIsCardScope + scenario.interruptionIsPosScope + scenario.interruptionIsSystemScope;
  if (sum <= 0) return { pCard: 0, pPos: 0 };
  return {
    pCard: scenario.interruptionIsCardScope / sum,
    pPos: scenario.interruptionIsPosScope / sum,
  };
}

function lossPerDayIfHit(state: SimState, scenario: Scenario, throughput: number, f: number): number {
  const cardCap =
    state.cards.filter((c) => c.downUntilDay === null || c.downUntilDay <= state.day).length * scenario.perCardCapacityZar;
  const posCap =
    state.pos.filter((p) => p.downUntilDay === null || p.downUntilDay <= state.day).length * scenario.perPosCapacityZar;
  const remainingPhysical = Math.max(0, (1 - f) * Math.min(cardCap, posCap));
  const capital = Math.max(0, state.deployableCapital);
  const lockedCapital = scenario.capitalFrozenDuringReview ? f * capital : 0;
  const freeCapital = Math.max(0, capital - lockedCapital);
  const operableThroughput = Math.min(throughput, remainingPhysical, freeCapital);
  const lostThroughputPerDay = Math.max(0, throughput - operableThroughput);
  const turnoverLossPerDay = lostThroughputPerDay * scenario.margin;
  const liquidityLossPerDay = scenario.capitalFrozenDuringReview
    ? lockedCapital * scenario.frozenCapitalDailyRate
    : 0;
  return turnoverLossPerDay + liquidityLossPerDay;
}

function dailyLambda(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  f: number,
  hazard: number,
  kind: "card" | "pos",
  effectiveIndependent: number,
): number {
  if (throughput <= 1e-9 || remainingInformativeDays(state, scenario) <= 0) return 0;
  const rho = kind === "pos" ? scenario.posFailureCorrelation : scenario.cardFailureCorrelation;
  const df = deltaIndependentCapacity(effectiveIndependent, rho);
  if (df <= 1e-12) return 0;
  const { pCard, pPos } = scopeWeights(scenario);
  const weight = kind === "pos" ? pPos : pCard;
  if (weight <= 1e-12) return 0;
  const lossNow = lossPerDayIfHit(state, scenario, throughput, f);
  const lossBetter = lossPerDayIfHit(state, scenario, throughput, Math.max(0, f - weight * df));
  return hazard * blendedReviewDuration(scenario) * Math.max(0, lossNow - lossBetter);
}

function standardNormalCdf(x: number): number {
  const a = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * a * (0.319381530 + a * (-0.356563782 + a * (1.781477937 + a * (-1.821255978 + a * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function volumesByResource(plan: AllocationPlan): { cards: Map<string, number>; pos: Map<string, number> } {
  const cards = new Map<string, number>();
  const pos = new Map<string, number>();
  for (const pair of plan.pairs) {
    if (pair.amount <= 1e-9) continue;
    cards.set(pair.cardId, (cards.get(pair.cardId) ?? 0) + pair.amount);
    pos.set(pair.posId, (pos.get(pair.posId) ?? 0) + pair.amount);
  }
  return { cards, pos };
}

export function informationValueForPackedPlan(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  transactions: PlannedTransaction[],
  throughput: number,
  f: number,
  hazard: number,
  economicQ: number,
  economicBestQ: number,
): { resource: number; configuration: number; total: number; byId: Map<string, number>; deltaU: Map<string, number> } {
  const empty = {
    resource: 0,
    configuration: 0,
    total: 0,
    byId: new Map<string, number>(),
    deltaU: new Map<string, number>(),
  };
  if (!scenario.valueOfInformationEnabled || throughput <= 1e-9 || plan.pairs.length === 0) {
    return empty;
  }
  const T = remainingInformativeDays(state, scenario);
  if (T <= 0) return empty;
  const query = queryFeaturesFromPlan(state, plan, transactions);
  if (!query) return empty;
  const log = state.observations ?? [];
  const vols = volumesByResource(plan);
  const nStar = scenario.voiNStarResource;
  const byId = new Map<string, number>();
  const deltaU = new Map<string, number>();

  const cardKappas = state.cards.map((c) => {
    const n = resourceEffectiveN(c.id, query, log, scenario);
    return { id: c.id, n, kappa: n / (n + Math.max(1e-9, nStar)) };
  });
  const posKappas = state.pos.map((p) => {
    const n = resourceEffectiveN(p.id, query, log, scenario);
    return { id: p.id, n, kappa: n / (n + Math.max(1e-9, nStar)) };
  });

  let resource = 0;
  let iCard = cardKappas.reduce((s, r) => s + r.kappa, 0);
  for (const card of state.cards.filter((c) => (vols.cards.get(c.id) ?? 0) > 1e-9).sort((a, b) => a.id.localeCompare(b.id))) {
    const row = cardKappas.find((r) => r.id === card.id)!;
    const du = deltaUncertaintyFromNewObservation(row.n, nStar);
    const kappaAfter = (row.n + 1) / (row.n + 1 + Math.max(1e-9, nStar));
    const others = Math.max(0, iCard - row.kappa);
    const lam = dailyLambda(state, scenario, throughput, f, hazard, "card", others);
    const iv = du * lam * T;
    byId.set(card.id, iv);
    deltaU.set(card.id, du);
    resource += iv;
    iCard = others + kappaAfter;
  }

  let iPos = posKappas.reduce((s, r) => s + r.kappa, 0);
  for (const pos of state.pos.filter((p) => (vols.pos.get(p.id) ?? 0) > 1e-9).sort((a, b) => a.id.localeCompare(b.id))) {
    const row = posKappas.find((r) => r.id === pos.id)!;
    const du = deltaUncertaintyFromNewObservation(row.n, nStar);
    const kappaAfter = (row.n + 1) / (row.n + 1 + Math.max(1e-9, nStar));
    const others = Math.max(0, iPos - row.kappa);
    const lam = dailyLambda(state, scenario, throughput, f, hazard, "pos", others);
    const iv = du * lam * T;
    byId.set(pos.id, iv);
    deltaU.set(pos.id, du);
    resource += iv;
    iPos = others + kappaAfter;
  }

  let configuration = 0;
  if (scenario.voiConfigurationEnabled) {
    const nCfg = configEffectiveN(query, log, scenario);
    const duCfg = deltaUncertaintyFromNewObservation(nCfg, scenario.voiNStarConfig);
    const nY = outcomeEffectiveN(query, log, scenario);
    const sigma = Math.sqrt(posteriorVariance(nY, scenario.voiNStarConfig, scenario.voiPriorSigmaCfgZar));
    const gap = Math.abs(economicBestQ - economicQ);
    const prFlip = sigma <= 1e-9 ? 0 : standardNormalCdf(-gap / sigma);
    const yHat = predictedOutcome(query, log, scenario);
    const residualScale = yHat === null ? scenario.voiPriorSigmaCfgZar : Math.abs(economicQ - yHat);
    const stake = Math.max(sigma, residualScale * 0.25);
    configuration = duCfg * sigma * prFlip * stake * T / Math.max(1, scenario.voiPriorSigmaCfgZar);
  }

  return { resource, configuration, total: resource + configuration, byId, deltaU };
}

/** @deprecated pack-then-score uses informationValueForPackedPlan */
export function informationValueForPlan(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  throughput: number,
  f: number,
  hazard: number,
): { total: number; byId: Map<string, number>; deltaU: Map<string, number> } {
  const iv = informationValueForPackedPlan(state, scenario, plan, [], throughput, f, hazard, 0, 0);
  return { total: iv.total, byId: iv.byId, deltaU: iv.deltaU };
}

export function diagnoseValueOfInformation(
  state: SimState,
  scenario: Scenario,
  plan: AllocationPlan,
  transactions: PlannedTransaction[],
  throughput: number,
  f: number,
  hazard: number,
  economicQ: number,
  maturityById: Map<string, number>,
): CoverVoiDiagnosis {
  const iv = informationValueForPackedPlan(
    state,
    scenario,
    plan,
    transactions,
    throughput,
    f,
    hazard,
    economicQ,
    economicQ,
  );
  const vols = volumesByResource(plan);
  const totalVol = [...vols.cards.values()].reduce((s, v) => s + v, 0) || 1;
  const query = queryFeaturesFromPlan(state, plan, transactions);
  const log = state.observations ?? [];
  const nStar = scenario.voiNStarResource;
  const T = remainingInformativeDays(state, scenario);
  const nCfg = query ? configEffectiveN(query, log, scenario) : 0;

  const rows: ResourceVoiDiagnostic[] = [];
  for (const resource of [...state.cards, ...state.pos].sort((a, b) => a.id.localeCompare(b.id))) {
    const inCover = resource.kind === "card" ? (vols.cards.get(resource.id) ?? 0) > 1e-9 : (vols.pos.get(resource.id) ?? 0) > 1e-9;
    const amount = resource.kind === "card" ? (vols.cards.get(resource.id) ?? 0) : (vols.pos.get(resource.id) ?? 0);
    const n = query ? resourceEffectiveN(resource.id, query, log, scenario) : 0;
    const u = uncertaintyFromEffectiveN(n, nStar);
    const du = inCover
      ? (iv.deltaU.get(resource.id) ?? deltaUncertaintyFromNewObservation(n, nStar))
      : deltaUncertaintyFromNewObservation(n, nStar);
    const informationValue = inCover ? (iv.byId.get(resource.id) ?? 0) : 0;
    const obsDays = log.filter((o) => (o.design?.volumesByResource[resource.id] ?? 0) > 1e-9).length;
    const obsVol = log.reduce((s, o) => s + (o.design?.volumesByResource[resource.id] ?? 0), 0);
    const obsN = log.reduce((s, o) => s + (o.design?.ticketsByResource[resource.id] ?? 0), 0);
    rows.push({
      id: resource.id,
      name: resource.name,
      kind: resource.kind,
      inCover,
      economicQ,
      maturityScore: maturityById.get(resource.id) ?? 0,
      dependencyShare: amount / totalVol,
      observationCount: obsN,
      activeObservationDays: obsDays,
      observedVolume: obsVol,
      effectiveN: n,
      confidence: 1 - u,
      uncertainty: u,
      expectedUncertaintyReduction: du,
      informationValue,
      totalQ: economicQ + informationValue,
    });
  }

  return {
    economicQ,
    resourceInformationValue: iv.resource,
    configurationInformationValue: iv.configuration,
    informationValue: iv.total,
    totalQ: economicQ + iv.total,
    remainingInformativeDays: T,
    configEffectiveN: nCfg,
    configUncertainty: uncertaintyFromEffectiveN(nCfg, scenario.voiNStarConfig),
    resources: rows,
  };
}

export function resourceQueryUncertainty(resource: Resource, state: SimState, scenario: Scenario, plan: AllocationPlan): number {
  const query = queryFeaturesFromPlan(state, plan, []);
  if (!query) return 1;
  const n = resourceEffectiveN(resource.id, query, state.observations ?? [], scenario);
  return uncertaintyFromEffectiveN(n, scenario.voiNStarResource);
}

export { uncertaintyFromEffectiveN, deltaUncertaintyFromNewObservation };
