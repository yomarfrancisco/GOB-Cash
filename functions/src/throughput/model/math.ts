export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function saturate(value: number, scale: number): number {
  if (scale <= 0) return value > 0 ? 1 : 0;
  return clamp(value / scale, 0, 1);
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => roundMoney(v)))].sort((a, b) => a - b);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function floorMoney(value: number): number {
  return Math.floor(Math.max(0, value) * 100 + 1e-9) / 100;
}

export function expectedUniform(min: number, max: number): number {
  return (min + max) / 2;
}

export function sharesFromWeights(weights: number[]): number[] {
  const total = sum(weights);
  if (weights.length === 0) return [];
  if (total <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / total);
}

export function hhi(shares: number[]): number {
  return sum(shares.map((s) => s * s));
}

/**
 * Saturating map: raw hazard units -> probability in (0, hMax).
 * h(0) = 0, h → hMax as raw → ∞. Stops multiplicative factors from
 * producing probabilities above 1.
 */
export function saturateHazard(raw: number, hMax: number): number {
  if (raw <= 0) return 0;
  if (hMax <= 0) return 0;
  return (hMax * raw) / (hMax + raw);
}

export function invertSaturatedHazard(h: number, hMax: number): number | null {
  if (h <= 0) return 0;
  if (h >= hMax) return null;
  return (hMax * h) / (hMax - h);
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: () => number, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function formatZar(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : 2;
  const [whole, frac] = abs.toFixed(digits).split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? `${sign}R${grouped}` : `${sign}R${grouped}.${frac}`;
}

export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
