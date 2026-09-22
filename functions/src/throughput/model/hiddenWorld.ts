/**
 * Offline test world with two independent hidden components.
 *
 *   θ*_econ : realized gross  y = G_structural + Δ*(s,a) + ε,   Δ* = x(a)ᵀθ*_econ (+ misspecified terms)
 *   θ*_cont : true hazard     h_true(s,a) = m*(V) · h_structural(s,a),
 *             log m*(V) = c0 + c1 · log(V / Vref)
 *
 * θ* is drawn once per (seed, column) so it is stable across days, policies and
 * lazily-added resources. The agent never reads θ*; only realized outcomes flow to the
 * learner through the observation log. In production this module is inert.
 */
import { mulberry32 } from "./math";
import { columnPriorSigma, learnerFeatures, standardNormal, type LearnerFeatures } from "./learner";
import type { PackedDesign, Scenario } from "./types";

function mixSeed(base: number, day: number, stream: string): number {
  let h = (base >>> 0) ^ Math.imul(Math.max(0, day), 2654435761);
  for (let i = 0; i < stream.length; i++) {
    h = Math.imul(h ^ stream.charCodeAt(i), 1597334677);
  }
  return h >>> 0;
}

export function worldRng(scenario: Scenario, day: number, stream: string): () => number {
  return mulberry32(mixSeed(scenario.hiddenWorldSeed, day, stream));
}

/** Cascade experiment draws (demand seed, not hidden-world θ*). Same seed ⇒ same uniforms per day. */
export function cascadeRng(scenario: Scenario, day: number, stream: string): () => number {
  return mulberry32(mixSeed(scenario.rngSeed, day, stream));
}

/** Deterministic N(0,1) for a named hidden coefficient. */
function unitDraw(scenario: Scenario, name: string): number {
  return standardNormal(worldRng(scenario, 0, `theta:${name}`));
}

export function hiddenEconomicCoefficient(scenario: Scenario, column: string): number {
  return columnPriorSigma(column, scenario) * Math.max(0, scenario.hiddenEconomicSigmaScale) * unitDraw(scenario, column);
}

/** Terms present in the misspecified world that the agent's linear model cannot express. */
function misspecifiedTerms(design: PackedDesign, features: LearnerFeatures, scenario: Scenario): number {
  if (scenario.hiddenWorldClass !== "misspecified") return 0;
  const G = features.gross;
  let acc = 0;
  if (design.cardIds.length >= 4) {
    acc += G * 1.5 * scenario.learnerPriorSigmaConfig * unitDraw(scenario, "x:fourCardThreshold");
  }
  for (const key of design.pairKeys) {
    const [cardId, posId] = key.split("|");
    const vol = Math.min(design.volumesByResource[cardId ?? ""] ?? 0, design.volumesByResource[posId ?? ""] ?? 0);
    const share = design.throughputZar > 0 ? vol / design.throughputZar : 0;
    acc += G * share * scenario.learnerPriorSigmaCard * unitDraw(scenario, `x:pair:${key}`);
  }
  return acc;
}

/** Noise-free Δ*(s,a) under θ*_econ. 0 when the hidden world is off or V = 0. */
export function hiddenEconomicDelta(scenario: Scenario, design: PackedDesign | null): number {
  if (!scenario.hiddenWorldEnabled || !design || design.throughputZar <= 1e-9) return 0;
  const features = learnerFeatures(design, scenario);
  let acc = 0;
  for (let k = 0; k < features.columns.length; k++) {
    acc += features.values[k]! * hiddenEconomicCoefficient(scenario, features.columns[k]!);
  }
  return acc + misspecifiedTerms(design, features, scenario);
}

/** ε_t for the realized day, σ_ε = c_ε · G. Same noise for every policy on the same day and gross. */
export function economicNoise(scenario: Scenario, day: number, gross: number): number {
  if (!scenario.hiddenWorldEnabled || gross <= 1e-9) return 0;
  return Math.max(0, scenario.learnerNoiseFraction) * gross * standardNormal(worldRng(scenario, day, "economicNoise"));
}

export function hiddenContinuityCoefficients(scenario: Scenario): { c0: number; c1: number } {
  if (!scenario.hiddenWorldEnabled) return { c0: 0, c1: 0 };
  return {
    c0: Math.max(0, scenario.hiddenContinuityLogSigma) * unitDraw(scenario, "cont:c0"),
    c1: Math.max(0, scenario.hiddenContinuitySlopeSigma) * unitDraw(scenario, "cont:c1"),
  };
}

/** True multiplier m*(V) on the structural hazard. 1 when the hidden world is off. */
export function hiddenContinuityMultiplier(scenario: Scenario, throughput: number): number {
  if (!scenario.hiddenWorldEnabled || throughput <= 1e-9) return 1;
  const { c0, c1 } = hiddenContinuityCoefficients(scenario);
  const ratio = Math.max(1e-6, throughput / Math.max(1, scenario.vRefZar));
  return Math.exp(c0 + c1 * Math.log(ratio));
}

/** Genuine Bernoulli interruption draw for the realized day under h_true. */
export function drawInterruption(scenario: Scenario, day: number, hTrue: number): boolean {
  if (hTrue <= 0) return false;
  if (scenario.hiddenWorldEnabled) {
    return worldRng(scenario, day, "continuityDraw")() < Math.min(1, hTrue);
  }
  if (scenario.realizedCascadeEnabled) {
    return cascadeRng(scenario, day, "cascadeHit")() < Math.min(1, hTrue);
  }
  return false;
}
