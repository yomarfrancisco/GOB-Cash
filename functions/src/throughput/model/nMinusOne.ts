/**
 * N−1 continuity scoring for the POS-3 experiment.
 *
 * CRITICAL (one viable POS + genuine demand + trapped capital + forced concentration)
 * is itself a continuity failure. These formulations price that state. They do not
 * attach an arbitrary lump-sum collapse penalty. Production hazard coefficients
 * are unchanged; criticalPersistenceSensitivity is an experiment-only interaction
 * that fires only while the book is already one-POS CRITICAL.
 */
import {
  POS_STRESS_POS_COUNTS,
  runPosStressPath,
  summarisePosStressArm,
  type PosStressArmSummary,
  type PosStressPath,
} from "./posStress";

export const N1_ALPHAS = [0, 0.05, 0.1] as const;
export const N1_LAMBDAS = [0, 1000, 2500, 5000, 10_000] as const;
export const N1_CVAR_GAMMAS = [0, 0.5, 1] as const;
export const N1_KAPPAS = [0, 0.8, 1.6] as const;
export const N1_DURATIONS = [3, 5] as const;

export function chanceConstraintHolds(pCritical: number, alpha: number): boolean {
  return pCritical <= alpha + 1e-12;
}

/** E[CA] − λ × E[critical operating days]. λ is Rands per critical operating day. */
export function criticalDaysObjective(arm: PosStressArmSummary, lambda: number): number {
  return arm.expectedCA - lambda * arm.expectedOperatingDaysCritical;
}

/**
 * (1 − γ) E[CA] + γ CVaR_0.8(CA).
 * CVaR_0.8(CA) is the mean of the worst 20% of continuity-adjusted paths (lower CA).
 */
export function cvarCaObjective(arm: PosStressArmSummary, gamma: number): number {
  const g = Math.min(1, Math.max(0, gamma));
  return (1 - g) * arm.expectedCA + g * arm.cvarCA80;
}

export function scoreArm(arm: PosStressArmSummary): {
  chance: { alpha: number; feasible: boolean }[];
  criticalDays: { lambda: number; objective: number }[];
  cvarCa: { gamma: number; objective: number }[];
} {
  return {
    chance: N1_ALPHAS.map((alpha) => ({
      alpha,
      feasible: chanceConstraintHolds(arm.pEnterCritical, alpha),
    })),
    criticalDays: N1_LAMBDAS.map((lambda) => ({
      lambda,
      objective: criticalDaysObjective(arm, lambda),
    })),
    cvarCa: N1_CVAR_GAMMAS.map((gamma) => ({
      gamma,
      objective: cvarCaObjective(arm, gamma),
    })),
  };
}

export interface NMinusOneCell {
  operatingDaysDown: number;
  kappa: number;
  two: PosStressArmSummary;
  three: PosStressArmSummary;
  twoScore: ReturnType<typeof scoreArm>;
  threeScore: ReturnType<typeof scoreArm>;
  exampleFeedback2: PosStressPath["feedback"];
  exampleFeedback3: PosStressPath["feedback"];
  collapseSeeds2: { seed: number; reason: PosStressPath["collapseReason"] }[];
  collapseSeeds3: { seed: number; reason: PosStressPath["collapseReason"] }[];
}

export interface NMinusOneReport {
  seeds: number[];
  lockFraction: number;
  alphas: readonly number[];
  lambdas: readonly number[];
  gammas: readonly number[];
  kappas: readonly number[];
  cells: NMinusOneCell[];
}

export function runNMinusOneStress(opts: {
  seeds?: number[];
  durations?: readonly number[];
  kappas?: readonly number[];
} = {}): NMinusOneReport {
  const seeds = opts.seeds ?? Array.from({ length: 16 }, (_, i) => 14 + i);
  const durations = opts.durations ?? N1_DURATIONS;
  const kappas = opts.kappas ?? N1_KAPPAS;
  const cells: NMinusOneCell[] = [];
  for (const kappa of kappas) {
    for (const operatingDaysDown of durations) {
      const paths: PosStressPath[] = [];
      for (const pos of POS_STRESS_POS_COUNTS) {
        for (const seed of seeds) {
          const { path } = runPosStressPath(pos, seed, operatingDaysDown, {
            criticalPersistenceSensitivity: kappa,
          });
          paths.push(path);
        }
      }
      const two = summarisePosStressArm(paths.filter((p) => p.pos === 2));
      const three = summarisePosStressArm(paths.filter((p) => p.pos === 3));
      const ex2 = paths.find((p) => p.pos === 2 && p.seed === seeds[0]) ?? paths.find((p) => p.pos === 2);
      const ex3 = paths.find((p) => p.pos === 3 && p.seed === seeds[0]) ?? paths.find((p) => p.pos === 3);
      cells.push({
        operatingDaysDown,
        kappa,
        two,
        three,
        twoScore: scoreArm(two),
        threeScore: scoreArm(three),
        exampleFeedback2: ex2?.feedback ?? [],
        exampleFeedback3: ex3?.feedback ?? [],
        collapseSeeds2: paths
          .filter((p) => p.pos === 2 && p.collapsed)
          .map((p) => ({ seed: p.seed, reason: p.collapseReason })),
        collapseSeeds3: paths
          .filter((p) => p.pos === 3 && p.collapsed)
          .map((p) => ({ seed: p.seed, reason: p.collapseReason })),
      });
    }
  }
  return {
    seeds,
    lockFraction: 0.5,
    alphas: N1_ALPHAS,
    lambdas: N1_LAMBDAS,
    gammas: N1_CVAR_GAMMAS,
    kappas,
    cells,
  };
}
