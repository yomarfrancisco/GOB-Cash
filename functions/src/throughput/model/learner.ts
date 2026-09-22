/**
 * Economic residual learner Δ_G(s,a).
 *
 *   y_gross(s,a) = G_structural(s,a) + Δ_G(s,a) + ε,     ε ~ N(0, (c_ε · G)²)
 *   Δ_G(s,a)     = G(a) · [ z(a)ᵀβ + Σ_cards s_i(a) u_i + Σ_pos s_j(a) w_j ]
 *
 * with G(a) = margin · V the structural gross profit of the packed action, z(a) a
 * dimensionless configuration vector, and s_i share-weighted card / POS indicators.
 * The posterior over θ = (β, u, w) is Gaussian and updated with the conjugate rank-1
 * rule, so one realized day is O(d²). Thompson sampling draws θ̃ ~ N(μ, Σ) once per
 * realized day.
 *
 * Δ_G is a gross-economic residual only. It is never updated from interruption or
 * review outcomes and never enters the hazard or the continuity cost.
 */
import type { LearnerPosterior, LearnerSample, PackedDesign, Scenario } from "./types";

export const CONFIG_COLUMNS = [
  "z:intercept",
  "z:logV",
  "z:tickets",
  "z:cards",
  "z:pos",
  "z:extraPairs",
  "z:maxCardShare",
  "z:maxPosShare",
  "z:idleRunUp",
] as const;

export interface LearnerFeatures {
  columns: string[];
  /** Feature values already multiplied by G (Rands), so θ is a fraction of gross. */
  values: number[];
  gross: number;
}

export function columnPriorSigma(column: string, scenario: Scenario): number {
  if (column.startsWith("card:")) return Math.max(0, scenario.learnerPriorSigmaCard);
  if (column.startsWith("pos:")) return Math.max(0, scenario.learnerPriorSigmaPos);
  return Math.max(0, scenario.learnerPriorSigmaConfig);
}

/** Dimensionless configuration vector z(a). Scaled so each entry is roughly O(1). */
export function configurationVector(design: PackedDesign, scenario: Scenario): number[] {
  const vRef = Math.max(1, scenario.vRefZar);
  const cards = design.cardIds.length;
  const pos = design.posIds.length;
  const extraPairs = Math.max(0, design.pairKeys.length - cards);
  return [
    1,
    Math.log10(Math.max(1, design.throughputZar) / vRef),
    design.transactionCount / 10,
    cards / 5,
    pos / 5,
    extraPairs / 5,
    design.largestCardShare,
    design.largestPosShare,
    Math.min(5, design.consecutiveIdleBusinessDays) / 5,
  ];
}

export function learnerFeatures(design: PackedDesign | null, scenario: Scenario): LearnerFeatures {
  if (!design || design.throughputZar <= 1e-9) return { columns: [], values: [], gross: 0 };
  const gross = design.throughputZar * scenario.margin;
  const columns: string[] = [...CONFIG_COLUMNS];
  const values = configurationVector(design, scenario).map((z) => z * gross);
  const cardTotal = design.cardIds.reduce((s, id) => s + (design.volumesByResource[id] ?? 0), 0) || 1;
  const posTotal = design.posIds.reduce((s, id) => s + (design.volumesByResource[id] ?? 0), 0) || 1;
  for (const id of design.cardIds) {
    const share = (design.volumesByResource[id] ?? 0) / cardTotal;
    if (share <= 1e-12) continue;
    columns.push(`card:${id}`);
    values.push(share * gross);
  }
  for (const id of design.posIds) {
    const share = (design.volumesByResource[id] ?? 0) / posTotal;
    if (share <= 1e-12) continue;
    columns.push(`pos:${id}`);
    values.push(share * gross);
  }
  return { columns, values, gross };
}

export function createLearnerPosterior(scenario: Scenario): LearnerPosterior {
  const columns = [...CONFIG_COLUMNS];
  const s = columnPriorSigma("z", scenario);
  return {
    columns,
    mu: columns.map(() => 0),
    cov: columns.map((_, i) => columns.map((__, j) => (i === j ? s * s : 0))),
    updates: 0,
  };
}

/** Add any missing columns with their independent prior. Mutates in place. */
export function ensureColumns(post: LearnerPosterior, columns: string[], scenario: Scenario): void {
  for (const col of columns) {
    if (post.columns.includes(col)) continue;
    const s = columnPriorSigma(col, scenario);
    post.columns.push(col);
    post.mu.push(0);
    for (const row of post.cov) row.push(0);
    post.cov.push(post.columns.map((_, j) => (j === post.columns.length - 1 ? s * s : 0)));
  }
}

function denseVector(post: LearnerPosterior, features: LearnerFeatures): number[] {
  const x = post.columns.map(() => 0);
  for (let k = 0; k < features.columns.length; k++) {
    const idx = post.columns.indexOf(features.columns[k]!);
    if (idx >= 0) x[idx] = features.values[k]!;
  }
  return x;
}

export function noiseVariance(scenario: Scenario, gross: number): number {
  const sd = Math.max(1e-6, scenario.learnerNoiseFraction) * Math.max(gross, 1);
  return sd * sd;
}

/** Posterior predictive of Δ_G for a packed action: mean and SD in Rands. */
export function predictDelta(
  post: LearnerPosterior,
  features: LearnerFeatures,
  scenario: Scenario,
): { mean: number; sd: number } {
  if (features.columns.length === 0) return { mean: 0, sd: 0 };
  // Columns not yet in the posterior contribute their independent prior variance.
  let mean = 0;
  let variance = 0;
  const x = denseVector(post, features);
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 0) continue;
    mean += x[i]! * post.mu[i]!;
    let acc = 0;
    for (let j = 0; j < x.length; j++) {
      if (x[j] === 0) continue;
      acc += post.cov[i]![j]! * x[j]!;
    }
    variance += x[i]! * acc;
  }
  for (let k = 0; k < features.columns.length; k++) {
    const col = features.columns[k]!;
    if (post.columns.includes(col)) continue;
    const s = columnPriorSigma(col, scenario);
    variance += (features.values[k]! * s) ** 2;
  }
  return { mean, sd: Math.sqrt(Math.max(0, variance)) };
}

/**
 * Conjugate rank-1 update with known noise variance σ²:
 *   Σ' = Σ − Σx xᵀΣ / (σ² + xᵀΣx),   μ' = μ + Σx (r − xᵀμ) / (σ² + xᵀΣx).
 */
export function updatePosterior(
  post: LearnerPosterior,
  features: LearnerFeatures,
  residual: number,
  scenario: Scenario,
): void {
  if (features.columns.length === 0 || !Number.isFinite(residual)) return;
  ensureColumns(post, features.columns, scenario);
  const x = denseVector(post, features);
  const d = x.length;
  const sx = new Array<number>(d).fill(0);
  for (let i = 0; i < d; i++) {
    let acc = 0;
    for (let j = 0; j < d; j++) acc += post.cov[i]![j]! * x[j]!;
    sx[i] = acc;
  }
  let xsx = 0;
  let xmu = 0;
  for (let i = 0; i < d; i++) {
    xsx += x[i]! * sx[i]!;
    xmu += x[i]! * post.mu[i]!;
  }
  const denom = noiseVariance(scenario, features.gross) + xsx;
  if (denom <= 1e-18) return;
  const gain = (residual - xmu) / denom;
  for (let i = 0; i < d; i++) {
    post.mu[i] = post.mu[i]! + sx[i]! * gain;
    for (let j = 0; j < d; j++) {
      post.cov[i]![j] = post.cov[i]![j]! - (sx[i]! * sx[j]!) / denom;
    }
  }
  // Keep the matrix symmetric against floating drift.
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      const v = 0.5 * (post.cov[i]![j]! + post.cov[j]![i]!);
      post.cov[i]![j] = v;
      post.cov[j]![i] = v;
    }
    post.cov[i]![i] = Math.max(0, post.cov[i]![i]!);
  }
  post.updates += 1;
}

function cholesky(a: number[][]): number[][] {
  const n = a.length;
  const l = a.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) l[i]![j] = Math.sqrt(Math.max(s, 0));
      else l[i]![j] = l[j]![j]! > 1e-300 ? s / l[j]![j]! : 0;
    }
  }
  return l;
}

export function standardNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Thompson draw θ̃ ~ N(μ, Σ) over the posterior's columns. */
export function sampleTheta(post: LearnerPosterior, rng: () => number): Record<string, number> {
  const l = cholesky(post.cov);
  const z = post.columns.map(() => standardNormal(rng));
  const theta: Record<string, number> = {};
  for (let i = 0; i < post.columns.length; i++) {
    let v = post.mu[i]!;
    for (let k = 0; k <= i; k++) v += l[i]![k]! * z[k]!;
    theta[post.columns[i]!] = v;
  }
  return theta;
}

/**
 * Thompson draw covering the posterior columns plus every installed resource: a card
 * or POS not yet in the posterior is drawn from its independent prior, so an unseen
 * resource carries full prior uncertainty into today's ranking.
 */
export function sampleThetaForResources(
  post: LearnerPosterior,
  resourceColumns: string[],
  scenario: Scenario,
  rng: () => number,
): Record<string, number> {
  const theta = sampleTheta(post, rng);
  for (const col of resourceColumns) {
    if (col in theta) continue;
    theta[col] = columnPriorSigma(col, scenario) * standardNormal(rng);
  }
  return theta;
}

/** Δ_G under a given θ. Columns absent from θ contribute 0. */
export function deltaUnderTheta(theta: Record<string, number>, features: LearnerFeatures): number {
  let acc = 0;
  for (let k = 0; k < features.columns.length; k++) {
    acc += features.values[k]! * (theta[features.columns[k]!] ?? 0);
  }
  return acc;
}

export function learnerSampleSignature(sample: LearnerSample): string {
  if (sample === null) return "none";
  if (sample === "hidden-truth") return "oracle";
  const keys = Object.keys(sample).sort();
  return keys.map((k) => `${k}=${(sample[k] ?? 0).toFixed(5)}`).join(",");
}

export function coefficientRows(post: LearnerPosterior): Array<{ column: string; mean: number; sd: number }> {
  return post.columns.map((column, i) => ({
    column,
    mean: post.mu[i]!,
    sd: Math.sqrt(Math.max(0, post.cov[i]![i]!)),
  }));
}
