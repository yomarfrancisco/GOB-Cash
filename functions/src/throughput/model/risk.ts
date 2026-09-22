import { allocatePairs } from "./allocation";
import { bankFeatureFactors, bankRiskFeatures, type TodayTransactionLike } from "./bankRules";
import { continuityMultiplier } from "./continuity";
import {
  clamp,
  expectedUniform,
  hhi,
  saturateHazard,
  sharesFromWeights,
} from "./math";
import {
  merchantMaturity,
  pooledResourceMaturity,
  resourceMaturity,
  usableFraction,
} from "./maturity";
import {
  decomposeHazard,
  expectedCapacityLostFromShares,
  systemRampIndex,
} from "./rolling";
import { isResourceUp, upResources } from "./state";
import type {
  AllocationPlan,
  BankRiskFeatures,
  ConcentrationMetrics,
  HazardDecomposition,
  NamedFactor,
  Resource,
  Scenario,
  SimState,
} from "./types";

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function expectedReviewDuration(scenario: Scenario): {
  short: number;
  long: number;
  blended: number;
} {
  const short = expectedUniform(scenario.shortReviewMinDays, scenario.shortReviewMaxDays);
  const long = expectedUniform(scenario.longReviewMinDays, scenario.longReviewMaxDays);
  const blended =
    (1 - scenario.probabilityReviewIsLong) * short +
    scenario.probabilityReviewIsLong * long;
  return { short, long, blended };
}

export function rampIndex(state: SimState, scenario: Scenario, throughput: number): number {
  return systemRampIndex(state, scenario, throughput);
}

export function ticketFitDeviation(scenario: Scenario): number {
  const t = scenario.avgTicketZar;
  if (t >= scenario.expectedTicketMinZar && t <= scenario.expectedTicketMaxZar) {
    return 0;
  }
  const mid = (scenario.expectedTicketMinZar + scenario.expectedTicketMaxZar) / 2;
  if (mid <= 0) return 0;
  if (t < scenario.expectedTicketMinZar) {
    return (scenario.expectedTicketMinZar - t) / mid;
  }
  return (t - scenario.expectedTicketMaxZar) / mid;
}

function allocationWeights(resources: Resource[], scenario: Scenario, day: number): number[] {
  return upResources(resources, day).map((r) => {
    const m = resourceMaturity(r, scenario).score;
    return Math.max(1e-6, usableFraction(m));
  });
}

export function allocateThroughput(
  resources: Resource[],
  scenario: Scenario,
  day: number,
  throughput: number,
): { resources: Resource[]; volumes: number[]; shares: number[] } {
  const up = upResources(resources, day);
  const weights = allocationWeights(resources, scenario, day);
  const shares = sharesFromWeights(weights);
  const volumes = shares.map((s) => s * throughput);
  return { resources: up, volumes, shares };
}

export function concentrationFromPlan(
  plan: AllocationPlan,
  scenario: Scenario,
): ConcentrationMetrics {
  const cardHhi = hhi(plan.cardShares);
  const posHhi = hhi(plan.posShares);
  const largestCardShare = plan.cardShares.length ? Math.max(...plan.cardShares) : 1;
  const largestPosShare = plan.posShares.length ? Math.max(...plan.posShares) : 1;

  const cardRho = clamp(scenario.cardFailureCorrelation, 0, 1);
  const posRho = clamp(scenario.posFailureCorrelation, 0, 1);
  const expectedCapacityLostIfCardInterrupted = Math.min(
    1,
    cardRho + (1 - cardRho) * largestCardShare,
  );
  const expectedCapacityLostIfPosInterrupted = Math.min(
    1,
    posRho + (1 - posRho) * largestPosShare,
  );

  const expectedCapacityLost = expectedCapacityLostFromShares(
    plan.cardShares,
    plan.posShares,
    scenario,
  );

  return {
    largestCardShare,
    largestPosShare,
    largestPairShare: plan.largestPairShare,
    cardHhi,
    posHhi,
    pairHhi: plan.pairHhi,
    expectedCapacityLost,
    expectedCapacityLostIfCardInterrupted,
    expectedCapacityLostIfPosInterrupted,
    usableIndependentCards: plan.cardIds.length,
    usableIndependentPos: plan.posIds.length,
    activeCardCount: plan.cardIds.length,
    activePosCount: plan.posIds.length,
    cardShares: plan.cardShares,
    posShares: plan.posShares,
  };
}

export function concentrationMetrics(
  state: SimState,
  scenario: Scenario,
  throughput: number,
): ConcentrationMetrics {
  return concentrationFromPlan(allocatePairs(state, scenario, throughput), scenario);
}

export interface RiskSnapshot {
  pBase: number;
  rawHazard: number;
  hazard: number;
  factors: NamedFactor[];
  factorProduct: number;
  concentration: ConcentrationMetrics;
  merchantMaturity: ReturnType<typeof merchantMaturity>;
  cardMaturity: ReturnType<typeof pooledResourceMaturity>;
  posMaturity: ReturnType<typeof pooledResourceMaturity>;
  ramp: number;
  ticketDeviation: number;
  ticketCount: number;
  decomposition: HazardDecomposition;
  /** Banker-identified continuity features on this exact plan (realized plan, not abstract cover). */
  bankFeatures: BankRiskFeatures;
  /** m̂ applied to the raw hazard (1 unless usePosteriorContinuityCalibration). */
  continuityMultiplier: number;
}

function factor(id: string, label: string, value: number, kind: NamedFactor["kind"]): NamedFactor {
  return { id, label, value, kind };
}

/** One synthetic transaction per pair when no packed transaction list is available (held covers). */
function transactionsFromPlan(plan: AllocationPlan): TodayTransactionLike[] {
  return plan.pairs.filter((p) => p.amount > 1e-9).map((p) => ({ cardId: p.cardId, posId: p.posId, amount: p.amount }));
}

export function evaluateRisk(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  planOverride?: AllocationPlan,
  transactions?: TodayTransactionLike[],
): RiskSnapshot {
  const plan = planOverride ?? allocatePairs(state, scenario, throughput);
  const conc = concentrationFromPlan(plan, scenario);
  // Banker-identified features are computed on the actual packed transactions when known.
  const bank = bankRiskFeatures(state, scenario, transactions && transactions.length > 0 ? transactions : transactionsFromPlan(plan));
  const merchant = merchantMaturity(state, scenario);
  if (scenario.merchantMaturityStateOverride !== null) {
    merchant.score = clamp01(scenario.merchantMaturityStateOverride);
    merchant.category =
      merchant.score < scenario.thinMax
        ? "Thin"
        : merchant.score < scenario.developingMax
          ? "Developing"
          : "Established";
  }
  const upCards = upResources(state.cards, state.day);
  const upPos = upResources(state.pos, state.day);
  const cardVol = Object.fromEntries(plan.cardIds.map((id, i) => [id, plan.cardVolumes[i] ?? 0]));
  const posVol = Object.fromEntries(plan.posIds.map((id, i) => [id, plan.posVolumes[i] ?? 0]));
  const cards = pooledResourceMaturity(
    upCards,
    scenario,
    upCards.map((c) => cardVol[c.id] ?? 0),
  );
  if (scenario.cardMaturityStateOverride !== null) {
    cards.score = clamp01(scenario.cardMaturityStateOverride);
    cards.category =
      cards.score < scenario.thinMax
        ? "Thin"
        : cards.score < scenario.developingMax
          ? "Developing"
          : "Established";
  }
  const pos = pooledResourceMaturity(
    upPos,
    scenario,
    upPos.map((p) => posVol[p.id] ?? 0),
  );
  const decomp = decomposeHazard(state, scenario, plan, throughput);
  const ramp = decomp.todayRamp;
  const ticketDev = ticketFitDeviation(scenario);
  const ticketCount = plan.transactionCount > 0
    ? plan.transactionCount
    : scenario.avgTicketZar > 0
      ? throughput / scenario.avgTicketZar
      : 0;

  const fMerchantMat = 1 + scenario.merchantMaturitySensitivity * (1 - merchant.score);
  const fCardMat = 1 + scenario.cardMaturitySensitivity * (1 - cards.score);
  const fPosMat = 1 + scenario.posMaturitySensitivity * (1 - pos.score);
  const fConc = decomp.concentrationFactor;
  const fRamp = decomp.rampFactor;
  const fPersist = decomp.persistenceFactor;
  const fCritPersist = decomp.criticalPersistenceFactor;
  const fTicket = 1 + scenario.ticketFitSensitivity * ticketDev;
  const fPrior =
    1 + scenario.priorReviewSensitivity * Math.min(1, state.merchantInterruptionCount);
  const fClean = 1 + scenario.cleanHistorySensitivity * (1 - merchant.components.clean);

  const factors: NamedFactor[] = [
    factor("profile", "Merchant profile fit", scenario.merchantProfileFit, "direct-input"),
    factor("merchantMaturity", "Merchant maturity", fMerchantMat, "state-derived"),
    factor("cardMaturity", "Card maturity", fCardMat, "state-derived"),
    factor("posMaturity", "POS maturity", fPosMat, "state-derived"),
    factor("concentration", "Concentration (volume)", fConc, "state-derived"),
    factor("persistence", "Persistence / use-frequency", fPersist, "state-derived"),
    factor("criticalPersistence", "CRITICAL-regime surviving POS persistence", fCritPersist, "state-derived"),
    factor("ramp", "Ramp / acceleration", fRamp, "state-derived"),
    // Banker-identified features as explicitly named structural terms. Coefficients are
    // provisional (illustrative / uncalibrated) and default to 0 ⇒ factor 1 ⇒ h unchanged.
    ...bankFeatureFactors(bank),
    factor("ticketFit", "Ticket fit", fTicket, "direct-input"),
    factor("crossBorder", "Cross-border profile", scenario.crossBorderProfile, "direct-input"),
    factor("relatedParty", "Related-party context", scenario.relatedPartyContext, "direct-input"),
    factor("priorReview", "Prior review history", fPrior, "state-derived"),
    factor("cleanHistory", "Clean-history effect", fClean, "state-derived"),
  ];

  const factorProduct = factors.reduce((acc, f) => acc * f.value, 1);

  if (throughput <= 0) {
    return {
      pBase: 0,
      rawHazard: 0,
      hazard: 0,
      factors,
      factorProduct,
      concentration: conc,
      merchantMaturity: merchant,
      cardMaturity: cards,
      posMaturity: pos,
      ramp,
      ticketDeviation: ticketDev,
      ticketCount: 0,
      decomposition: decomp,
      bankFeatures: bank,
      continuityMultiplier: 1,
    };
  }

  if (
    scenario.infiniteHazardAboveZar !== null &&
    throughput >= scenario.infiniteHazardAboveZar
  ) {
    return {
      pBase: 1,
      rawHazard: Number.POSITIVE_INFINITY,
      hazard: 1,
      factors,
      factorProduct,
      concentration: conc,
      merchantMaturity: merchant,
      cardMaturity: cards,
      posMaturity: pos,
      ramp,
      ticketDeviation: ticketDev,
      ticketCount,
      decomposition: decomp,
      bankFeatures: bank,
      continuityMultiplier: 1,
    };
  }

  const ratio = throughput / Math.max(scenario.vRefZar, 1e-9);
  const pBase = scenario.p0 * ratio ** scenario.gamma;
  const rawHazard = pBase * factorProduct;
  // h_structural unless usePosteriorContinuityCalibration is on (then h_post = m̂ · h_structural).
  const m = continuityMultiplier(state, scenario);
  const hazard = saturateHazard(rawHazard * m, scenario.hMax);

  return {
    pBase,
    rawHazard,
    hazard,
    factors,
    factorProduct,
    concentration: conc,
    merchantMaturity: merchant,
    cardMaturity: cards,
    posMaturity: pos,
    ramp,
    ticketDeviation: ticketDev,
    ticketCount,
    decomposition: decomp,
    bankFeatures: bank,
    continuityMultiplier: m,
  };
}

export function remainingPhysicalAfterHit(
  state: SimState,
  scenario: Scenario,
  f: number,
): number {
  const cardCap =
    upResources(state.cards, state.day).length * scenario.perCardCapacityZar;
  const posCap =
    upResources(state.pos, state.day).length * scenario.perPosCapacityZar;
  const remaining = (1 - f) * Math.min(cardCap, posCap);
  return Math.max(0, remaining);
}

export function operatingResources(state: SimState): boolean {
  return (
    state.cards.some((c) => isResourceUp(c, state.day)) &&
    state.pos.some((p) => isResourceUp(p, state.day))
  );
}
