/**
 * Continuity calibration layer (separate from the economic residual).
 *
 *   h_true(s,a) = m · h_structural(s,a),      m ~ Gamma(α0, α0)   (prior mean 1)
 *   K hits over exposure E = Σ_t h_structural(s_t, a_t)  ⇒  m | data ~ Gamma(α0 + K, α0 + E)
 *
 * Only genuine observed interruption / review outcomes update this posterior. In v1 it is
 * diagnostic; with usePosteriorContinuityCalibration the production hazard becomes
 * h_post = m̂ · h_structural with m̂ the posterior mean.
 */
import type { ContinuityEvidence, Scenario, SimState } from "./types";

export function emptyContinuityEvidence(): ContinuityEvidence {
  return { exposure: 0, hits: 0, days: 0 };
}

export function recordContinuityObservation(
  state: SimState,
  structuralHazard: number,
  interruptionObserved: boolean,
): void {
  if (!(structuralHazard > 0)) return;
  state.continuity.exposure += structuralHazard;
  state.continuity.hits += interruptionObserved ? 1 : 0;
  state.continuity.days += 1;
}

/** Wilson–Hilferty quantile of Gamma(shape a, rate b). */
function gammaQuantile(shape: number, rate: number, z: number): number {
  const a = Math.max(1e-9, shape);
  const t = 1 / (9 * a);
  const cube = 1 - t + z * Math.sqrt(t);
  return (a / rate) * Math.max(0, cube) ** 3;
}

export interface ContinuityPosterior {
  posteriorMean: number;
  lo90: number;
  hi90: number;
  exposure: number;
  hits: number;
  days: number;
  priorStrength: number;
  inProduction: boolean;
}

export function continuityPosterior(evidence: ContinuityEvidence, scenario: Scenario): ContinuityPosterior {
  const a0 = Math.max(1e-6, scenario.continuityPriorStrength);
  const shape = a0 + evidence.hits;
  const rate = a0 + evidence.exposure;
  return {
    posteriorMean: shape / rate,
    lo90: gammaQuantile(shape, rate, -1.6449),
    hi90: gammaQuantile(shape, rate, 1.6449),
    exposure: evidence.exposure,
    hits: evidence.hits,
    days: evidence.days,
    priorStrength: a0,
    inProduction: scenario.usePosteriorContinuityCalibration,
  };
}

/** Multiplier applied to the raw structural hazard in production. 1 unless calibration is on. */
export function continuityMultiplier(state: SimState, scenario: Scenario): number {
  if (!scenario.usePosteriorContinuityCalibration) return 1;
  return continuityPosterior(state.continuity, scenario).posteriorMean;
}
