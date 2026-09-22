/**
 * Offline learning lab: A (Cover Mix benchmark), B (structural Q_base only) and
 * C (Thompson economic learner) on the same demand, in the same hidden world.
 *
 * Reports for C: calendar, posterior uncertainty over time, configuration regions
 * explored / abandoned, inferred vs true optimum region, exploration cost (belief and
 * realized), per-day regret against the hidden-θ* oracle, and the structural
 * continuity-adjusted total (which never contains Δ). The continuity layer is reported
 * separately from the economic layer.
 */
import { continuityPosterior, type ContinuityPosterior } from "./continuity";
import { cloneScenario } from "./defaults";
import { isOperatingWeekday, weekdayName } from "./demand";
import { hiddenContinuityCoefficients, hiddenEconomicCoefficient, hiddenEconomicDelta } from "./hiddenWorld";
import { CONFIG_COLUMNS, columnPriorSigma, learnerFeatures, predictDelta } from "./learner";
import { roundMoney, sum } from "./math";
import { decideDay } from "./optimizer";
import { simulate } from "./simulation";
import { cloneState, createInitialState } from "./state";
import type {
  CalendarEntry,
  LearnerPosterior,
  OperatingObservation,
  PackedDesign,
  Scenario,
  SimState,
  SimulationResult,
} from "./types";

export type LabPolicyId = "A" | "B" | "C";

export interface LabDayRow {
  day: number;
  weekday: string;
  operating: boolean;
  throughput: number;
  cards: number;
  pos: number;
  pairs: number;
  tickets: number;
  pairLabels: string[];
  grossProfit: number;
  /** Structural continuity-adjusted EV (Q_base myopic identity). */
  continuityAdjustedEv: number;
  /** Hidden-world Δ*(s,a) for the executed action (noise-free). */
  deltaStar: number;
  /** continuityAdjustedEv + deltaStar. */
  trueValue: number;
  /** Realized gross residual observed by the learner (Δ* + ε). */
  residual: number | null;
  interruptionObserved: boolean | null;
  sampledDelta: number;
  posteriorDeltaMean: number;
  posteriorDeltaSd: number;
  /** Same-day true-value gap vs the θ*-oracle at this state: [Q+Δ*](oracle a) − [Q+Δ*](chosen a). C only. */
  regret: number | null;
  oracleThroughput: number | null;
  oracleCards: number | null;
  region: string;
}

export interface RegionRow {
  key: string;
  daysChosen: number;
  lastChosenDay: number | null;
  /** Mean over region days of (CA + Δ̂_final) / G. */
  inferredScore: number;
  /** Mean over region days of (CA + Δ*) / G. */
  trueScore: number;
  /** Posterior SD of Δ̂/G at the region's last design under the final posterior. */
  finalSdShare: number;
  status: "explored" | "abandoned";
}

export interface LabPolicyResult {
  id: LabPolicyId;
  label: string;
  description: string;
  days: LabDayRow[];
  totalGross: number;
  totalContinuityAdjusted: number;
  sumDeltaStar: number;
  totalTrueValue: number;
  operatingDays: number;
  cardsUsedHistogram: Record<string, number>;
  distinctCards: number;
  distinctPos: number;
  distinctPairs: number;
  maxCardDaysPerWeek: number;
  regions: RegionRow[];
  /** Σ same-day regret over the horizon = realized exploration cost against θ*. C only. */
  cumulativeRegret: number | null;
  continuity: ContinuityPosterior;
}

export interface UncertaintyPoint {
  day: number;
  configSdShare: number;
  cardSdShare: number;
  posSdShare: number;
  predictiveSdShare: number;
  updates: number;
}

export interface CoefficientRecovery {
  column: string;
  priorSd: number;
  posteriorMean: number;
  posteriorSd: number;
  truth: number;
  /** |truth − mean| / posteriorSd. */
  zScore: number;
}

export interface LearningLabReport {
  days: number;
  rngSeed: number;
  hiddenWorldSeed: number;
  hiddenWorldClass: Scenario["hiddenWorldClass"];
  sameDemand: boolean;
  policies: LabPolicyResult[];
  learner: {
    uncertaintyTrace: UncertaintyPoint[];
    coefficients: CoefficientRecovery[];
    inferredOptimumRegion: string | null;
    trueOptimumRegion: string | null;
    optimumAgrees: boolean;
    regretTrace: Array<{ day: number; regret: number; cumulative: number }>;
    cumulativeRegret: number;
    /** Day-1 posterior SD of Δ_G on the chosen action ÷ the structural EV gap to the neighbouring V step. */
    gateRatioDay1: number;
  };
  continuity: {
    posterior: ContinuityPosterior;
    trueC0: number;
    trueC1: number;
    trueMultiplierAtVref: number;
    truthInInterval: boolean;
    note: string;
  };
  runtimeMs: number;
}

export interface LearningLabOptions {
  days?: number;
  onProgress?: (message: string) => void;
  /** Skip the per-day oracle (regret) to save runtime. */
  skipOracle?: boolean;
}

export function labPolicyScenario(base: Scenario, id: LabPolicyId): Scenario {
  const s = cloneScenario(base);
  s.hiddenWorldEnabled = true;
  s.valueOfInformationEnabled = false;
  s.usePosteriorContinuityCalibration = false;
  if (id === "A") {
    s.coverMixEnabled = true;
    s.economicLearnerEnabled = false;
  } else if (id === "B") {
    s.coverMixEnabled = false;
    s.economicLearnerEnabled = false;
  } else {
    s.coverMixEnabled = false;
    s.economicLearnerEnabled = true;
  }
  return s;
}

const POLICY_META: Record<LabPolicyId, { label: string; description: string }> = {
  A: { label: "A · Cover Mix benchmark", description: "4→3→2 card targets, no next-day pair repeat, card rest. Prescribed shape; no learning." },
  B: { label: "B · Structural Q_base only", description: "Pack-then-score on the deterministic continuity economics. No Mix, no VOI, no learner." },
  C: { label: "C · Thompson economic learner", description: "θ̃ ~ posterior daily; a* = argmax Q_base + Δ_G(θ̃). Δ_G updated from gross residuals only." },
};

function regionKey(design: PackedDesign | null, scenario: Scenario): string {
  if (!design || design.throughputZar <= 1e-9) return "idle";
  const band =
    design.throughputZar < scenario.coverThinThroughputZar
      ? "thin"
      : design.throughputZar < scenario.coverFatThroughputZar
        ? "mid"
        : "fat";
  return `${design.cardIds.length}c·${design.posIds.length}p·${band}`;
}

function observationFor(state: SimState, day: number): OperatingObservation | undefined {
  return state.observations.find((o) => o.id === `sim:${day}`);
}

function sdShare(post: LearnerPosterior, prefix: string, fallbackColumns: string[], scenario: Scenario): number {
  const sds: number[] = [];
  post.columns.forEach((c, i) => {
    if (c.startsWith(prefix)) sds.push(Math.sqrt(Math.max(0, post.cov[i]![i]!)));
  });
  for (const c of fallbackColumns) {
    if (!post.columns.includes(c)) sds.push(columnPriorSigma(c, scenario));
  }
  if (sds.length === 0) return 0;
  return Math.sqrt(sum(sds.map((s) => s * s)) / sds.length);
}

/**
 * θ*-oracle at the same state: the rolling policy with Δ* in place of Δ̃. Its same-day
 * true value is Q_base(myopic) + Δ*(its packed action).
 */
export function oracleForDay(entry: CalendarEntry, scenario: Scenario): { trueValue: number; throughput: number; cards: number } {
  const state = cloneState(entry.state);
  state.learnerSample = "hidden-truth";
  const operatingScenario = isOperatingWeekday(entry.day) ? scenario : { ...scenario, useLookahead: false };
  const decision = decideDay(state, operatingScenario, operatingScenario.useLookahead);
  const cards = new Set(decision.actionPlan.transactions.map((t) => t.cardId)).size;
  return {
    trueValue: decision.recommended.myopicEv + decision.recommended.decisionAdjustment,
    throughput: decision.recommended.throughput,
    cards,
  };
}

function policyRows(
  id: LabPolicyId,
  result: SimulationResult,
  scenario: Scenario,
  options: LearningLabOptions,
): LabPolicyResult {
  const ending = result.endingState;
  const finalPost = ending.learner;
  const rows: LabDayRow[] = [];
  const regionDays = new Map<string, { days: number[]; inferred: number[]; truth: number[]; lastDesign: PackedDesign | null }>();
  let cumulativeRegret = 0;
  const weekCards = new Map<number, Map<string, number>>();

  for (const entry of result.calendar) {
    const obs = observationFor(ending, entry.day);
    const design = obs?.design ?? null;
    const deltaStar = obs?.outcome?.hiddenEconomicDelta ?? hiddenEconomicDelta(scenario, design);
    const cards = new Set(entry.coreAllocations.map((p) => p.cardId));
    const pos = new Set(entry.coreAllocations.map((p) => p.posId));
    const region = regionKey(design, scenario);
    const gross = entry.grossProfit;
    let regret: number | null = null;
    let oracleThroughput: number | null = null;
    let oracleCards: number | null = null;
    if (id === "C") {
      if (!options.skipOracle) {
        // Same-day true-value gap: [Q_base + Δ*](oracle a) − [Q_base + Δ*](chosen a) at this state.
        // Consistent with the cumulative true-value identity Σ(CA + Δ*). Can be negative on
        // days where the rolling oracle trades same-day value for continuation.
        const oracle = oracleForDay(entry, scenario);
        regret = oracle.trueValue - (entry.continuityAdjustedEv + deltaStar);
        oracleThroughput = oracle.throughput;
        oracleCards = oracle.cards;
        cumulativeRegret += regret;
      }
      if (design && gross > 1e-9) {
        const features = learnerFeatures(design, scenario);
        const inferred = predictDelta(finalPost, features, scenario).mean;
        const bucket = regionDays.get(region) ?? { days: [], inferred: [], truth: [], lastDesign: null };
        bucket.days.push(entry.day);
        bucket.inferred.push((entry.continuityAdjustedEv + inferred) / gross);
        bucket.truth.push((entry.continuityAdjustedEv + deltaStar) / gross);
        bucket.lastDesign = design;
        regionDays.set(region, bucket);
      }
    }
    const week = Math.floor((entry.day - 1) / 7);
    const wc = weekCards.get(week) ?? new Map<string, number>();
    for (const c of cards) wc.set(c, (wc.get(c) ?? 0) + 1);
    weekCards.set(week, wc);

    rows.push({
      day: entry.day,
      weekday: weekdayName(entry.day),
      operating: entry.coreThroughput > 1e-9,
      throughput: entry.coreThroughput,
      cards: cards.size,
      pos: pos.size,
      pairs: entry.coreAllocations.length,
      tickets: design?.transactionCount ?? 0,
      pairLabels: entry.coreAllocations.map((p) => `${p.cardName}→${p.posName} ${roundMoney(p.amount).toLocaleString("en-ZA")}`),
      grossProfit: gross,
      continuityAdjustedEv: entry.continuityAdjustedEv,
      deltaStar,
      trueValue: entry.continuityAdjustedEv + deltaStar,
      residual: obs?.outcome?.economicResidual ?? null,
      interruptionObserved: obs?.outcome?.interruptionObserved ?? null,
      sampledDelta: entry.learning?.sampledDelta ?? 0,
      posteriorDeltaMean: entry.learning?.posteriorDeltaMean ?? 0,
      posteriorDeltaSd: entry.learning?.posteriorDeltaSd ?? 0,
      regret,
      oracleThroughput,
      oracleCards,
      region,
    });
  }

  const lastDay = result.calendar.at(-1)?.day ?? 0;
  const regions: RegionRow[] = [...regionDays.entries()].map(([key, b]) => {
    const features = learnerFeatures(b.lastDesign, scenario);
    const finalSd = predictDelta(finalPost, features, scenario).sd / Math.max(1e-9, features.gross);
    return {
      key,
      daysChosen: b.days.length,
      lastChosenDay: b.days.at(-1) ?? null,
      inferredScore: sum(b.inferred) / b.inferred.length,
      trueScore: sum(b.truth) / b.truth.length,
      finalSdShare: finalSd,
      status: "explored" as const,
    };
  });
  if (regions.length > 0) {
    const best = Math.max(...regions.map((r) => r.inferredScore));
    for (const r of regions) {
      const stale = r.lastChosenDay !== null && lastDay - r.lastChosenDay >= 7;
      if (stale && r.inferredScore < best - r.finalSdShare) r.status = "abandoned";
    }
    regions.sort((a, b) => b.inferredScore - a.inferredScore);
  }

  const operating = rows.filter((r) => r.operating);
  const histogram: Record<string, number> = {};
  for (const r of operating) histogram[String(r.cards)] = (histogram[String(r.cards)] ?? 0) + 1;
  const allPairs = new Set<string>();
  const allCards = new Set<string>();
  const allPos = new Set<string>();
  for (const entry of result.calendar) {
    for (const p of entry.coreAllocations) {
      allPairs.add(`${p.cardId}|${p.posId}`);
      allCards.add(p.cardId);
      allPos.add(p.posId);
    }
  }
  let maxCardDaysPerWeek = 0;
  for (const wc of weekCards.values()) for (const n of wc.values()) maxCardDaysPerWeek = Math.max(maxCardDaysPerWeek, n);

  const sumDeltaStar = sum(rows.map((r) => r.deltaStar));
  return {
    id,
    label: POLICY_META[id].label,
    description: POLICY_META[id].description,
    days: rows,
    totalGross: result.totalGrossProfit,
    totalContinuityAdjusted: result.totalContinuityAdjusted,
    sumDeltaStar,
    totalTrueValue: result.totalContinuityAdjusted + sumDeltaStar,
    operatingDays: operating.length,
    cardsUsedHistogram: histogram,
    distinctCards: allCards.size,
    distinctPos: allPos.size,
    distinctPairs: allPairs.size,
    maxCardDaysPerWeek,
    regions,
    cumulativeRegret: id === "C" && !options.skipOracle ? cumulativeRegret : null,
    continuity: continuityPosterior(ending.continuity, scenario),
  };
}

function sameDemand(results: SimulationResult[]): boolean {
  const sig = (r: SimulationResult) =>
    r.calendar
      .map((e) => `${e.day}:${(e.state.exogenousOffer?.coreTickets ?? []).map((t) => `${t.amount}@${t.timeMinutes}`).join(",")}`)
      .join("|");
  const first = sig(results[0]!);
  return results.every((r) => sig(r) === first);
}

export function runLearningLab(base: Scenario, options: LearningLabOptions = {}): LearningLabReport {
  const started = Date.now();
  const days = Math.max(5, Math.min(base.horizonDays, options.days ?? 30));
  const ids: LabPolicyId[] = ["A", "B", "C"];
  const scenarios = Object.fromEntries(ids.map((id) => [id, labPolicyScenario(base, id)])) as Record<LabPolicyId, Scenario>;
  const results: Partial<Record<LabPolicyId, SimulationResult>> = {};
  for (const id of ids) {
    options.onProgress?.(`Running policy ${id} for ${days} days…`);
    results[id] = simulate(createInitialState(scenarios[id]), scenarios[id], "optimize", { realizedThroughDay: days });
  }
  options.onProgress?.(options.skipOracle ? "Assembling report…" : "Scoring C against the hidden-θ* oracle…");
  const policies = ids.map((id) => policyRows(id, results[id]!, scenarios[id], options));
  const c = policies[2]!;
  const cResult = results.C!;
  const cScenario = scenarios.C;

  const uncertaintyTrace: UncertaintyPoint[] = cResult.calendar.map((entry) => {
    const post = entry.state.learner;
    const cardCols = entry.state.cards.map((r) => `card:${r.id}`);
    const posCols = entry.state.pos.map((r) => `pos:${r.id}`);
    return {
      day: entry.day,
      configSdShare: sdShare(post, "z:", [...CONFIG_COLUMNS], cScenario),
      cardSdShare: sdShare(post, "card:", cardCols, cScenario),
      posSdShare: sdShare(post, "pos:", posCols, cScenario),
      predictiveSdShare: entry.learning?.posteriorSdShareOfGross ?? 0,
      updates: post.updates,
    };
  });
  const finalPost = cResult.endingState.learner;
  const coefficients: CoefficientRecovery[] = finalPost.columns.map((column, i) => {
    const sd = Math.sqrt(Math.max(0, finalPost.cov[i]![i]!));
    const truth = hiddenEconomicCoefficient(cScenario, column);
    return {
      column,
      priorSd: columnPriorSigma(column, cScenario),
      posteriorMean: finalPost.mu[i]!,
      posteriorSd: sd,
      truth,
      zScore: sd > 1e-12 ? Math.abs(truth - finalPost.mu[i]!) / sd : 0,
    };
  });
  const inferred = c.regions[0]?.key ?? null;
  const trueBest = c.regions.length ? [...c.regions].sort((a, b) => b.trueScore - a.trueScore)[0]!.key : null;
  let cumulative = 0;
  const regretTrace = c.days
    .filter((d) => d.regret !== null)
    .map((d) => {
      cumulative += d.regret ?? 0;
      return { day: d.day, regret: d.regret ?? 0, cumulative };
    });
  const day1 = cResult.calendar[0];
  const gateRatioDay1 = day1?.learning && day1.learning.posteriorDeltaSd > 0
    ? day1.learning.posteriorDeltaSd / Math.max(1, Math.abs((day1.candidates.at(-1)?.objectiveEv ?? 0) - (day1.candidates.at(-2)?.objectiveEv ?? 0)))
    : 0;

  const cont = hiddenContinuityCoefficients(cScenario);
  const mStar = Math.exp(cont.c0);
  const post = c.continuity;
  const truthInInterval = mStar >= post.lo90 && mStar <= post.hi90;
  const note =
    post.exposure < post.priorStrength
      ? `Exposure E = ${post.exposure.toFixed(2)} expected structural hits against a prior strength of ${post.priorStrength}: the posterior is prior-dominated and cannot recalibrate from ${days} days. This is the intended v1 behaviour; the layer is diagnostic.`
      : `Exposure E = ${post.exposure.toFixed(1)} exceeds the prior strength; the data now dominate the multiplier estimate.`;

  return {
    days,
    rngSeed: base.rngSeed,
    hiddenWorldSeed: base.hiddenWorldSeed,
    hiddenWorldClass: base.hiddenWorldClass,
    sameDemand: sameDemand(ids.map((id) => results[id]!)),
    policies,
    learner: {
      uncertaintyTrace,
      coefficients,
      inferredOptimumRegion: inferred,
      trueOptimumRegion: trueBest,
      optimumAgrees: inferred !== null && inferred === trueBest,
      regretTrace,
      cumulativeRegret: cumulative,
      gateRatioDay1,
    },
    continuity: {
      posterior: post,
      trueC0: cont.c0,
      trueC1: cont.c1,
      trueMultiplierAtVref: mStar,
      truthInInterval,
      note,
    },
    runtimeMs: Date.now() - started,
  };
}

export interface WorldsSummary {
  worlds: number;
  days: number;
  fast: boolean;
  perPolicy: Array<{
    id: LabPolicyId;
    label: string;
    meanTrueValue: number;
    medianTrueValue: number;
    meanContinuityAdjusted: number;
    wins: number;
  }>;
  /** RMSE of C's posterior mean vs θ* over configuration columns, averaged across worlds. */
  configRmsePrior: number;
  configRmsePosterior: number;
  /** Share of worlds in which C's final inferred optimum region equals the true optimum region. */
  optimumAgreementRate: number;
  continuityCoverage90: number;
  runtimeMs: number;
}

export function runLearningLabWorlds(
  base: Scenario,
  options: { worlds?: number; days?: number; fast?: boolean; onProgress?: (m: string) => void } = {},
): WorldsSummary {
  const started = Date.now();
  const worlds = Math.max(1, Math.floor(options.worlds ?? 8));
  const days = Math.max(5, Math.min(base.horizonDays, options.days ?? 30));
  const fast = options.fast ?? true;
  const ids: LabPolicyId[] = ["A", "B", "C"];
  const trueValues: Record<LabPolicyId, number[]> = { A: [], B: [], C: [] };
  const cas: Record<LabPolicyId, number[]> = { A: [], B: [], C: [] };
  const wins: Record<LabPolicyId, number> = { A: 0, B: 0, C: 0 };
  let rmsePrior = 0;
  let rmsePost = 0;
  let agree = 0;
  let coverage = 0;
  for (let w = 0; w < worlds; w++) {
    options.onProgress?.(`World ${w + 1}/${worlds}…`);
    const worldBase = cloneScenario(base);
    worldBase.hiddenWorldSeed = (base.hiddenWorldSeed + Math.imul(w + 1, 7919)) >>> 0;
    if (fast) worldBase.useLookahead = false;
    const report = runLearningLab(worldBase, { days, skipOracle: true });
    let bestId: LabPolicyId = "A";
    let bestVal = -Infinity;
    for (const p of report.policies) {
      trueValues[p.id].push(p.totalTrueValue);
      cas[p.id].push(p.totalContinuityAdjusted);
      if (p.totalTrueValue > bestVal + 1e-9) {
        bestVal = p.totalTrueValue;
        bestId = p.id;
      }
    }
    wins[bestId] += 1;
    const cfg = report.learner.coefficients.filter((c) => c.column.startsWith("z:"));
    if (cfg.length > 0) {
      rmsePrior += Math.sqrt(sum(cfg.map((c) => c.truth ** 2)) / cfg.length);
      rmsePost += Math.sqrt(sum(cfg.map((c) => (c.truth - c.posteriorMean) ** 2)) / cfg.length);
    }
    if (report.learner.optimumAgrees) agree += 1;
    if (report.continuity.truthInInterval) coverage += 1;
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0;
  };
  return {
    worlds,
    days,
    fast,
    perPolicy: ids.map((id) => ({
      id,
      label: POLICY_META[id].label,
      meanTrueValue: sum(trueValues[id]) / worlds,
      medianTrueValue: median(trueValues[id]),
      meanContinuityAdjusted: sum(cas[id]) / worlds,
      wins: wins[id],
    })),
    configRmsePrior: rmsePrior / worlds,
    configRmsePosterior: rmsePost / worlds,
    optimumAgreementRate: agree / worlds,
    continuityCoverage90: coverage / worlds,
    runtimeMs: Date.now() - started,
  };
}
