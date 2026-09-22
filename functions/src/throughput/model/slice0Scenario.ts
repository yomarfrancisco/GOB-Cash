import { cascadeScenario } from "./cascade";
import { cloneScenario } from "./defaults";
import {
  DEMAND_OPERATOR_ID,
  SLICE0_FIXTURE_CARD_INSTITUTIONS,
  SLICE0_FIXTURE_POS_INSTITUTIONS,
  SLICE0_QUOTE_KIND,
  SUPPLY_OPERATOR_ID,
} from "./sourcingTypes";
import type { DemandMandateTerms, SupplyMandateTerms } from "./sourcingTypes";
import type { Scenario } from "./types";

export const SLICE0_CALENDAR_SEED = 21;
export const SLICE0_CALENDAR_DAYS = 14;
const R_MIN = 0.9;
const BETA_PLAN = 0.7;

/**
 * Same kernel as the unwrapped seed-21 operating calendar. Does not change
 * createDefaultScenario().lossModel.
 */
export function slice0KernelScenario(seed = SLICE0_CALENDAR_SEED, initialPos = 3): Scenario {
  const s = cascadeScenario(initialPos, {
    posCapitalLockFraction: 0.5,
    concentrationSensitivity: 0.8,
    shortReviewMinDays: 1,
    shortReviewMaxDays: 3,
    longReviewMinDays: 35,
    longReviewMaxDays: 42,
    rngSeed: seed,
  });
  s.initialCards = 5;
  s.initialCardNames = ["BRICS", "Ginav", "Vidrotec", "Wolf", "Goblin"];
  s.initialPos = initialPos;
  s.posEveryDays = 7;
  s.cardEveryDays = 0;
  s.maximumPosDevices = 5;
  s.posExposureLockScale = 1;
  s.posExposureWindowDays = 7;
  s.nMinusOneRetentionMin = R_MIN;
  s.nMinusOneMaxPosShareLimit = BETA_PLAN;
  s.degradedMaxPosShare = null;
  s.realizedCascadeEnabled = false;
  s.criticalPersistenceSensitivity = 0;
  s.horizonDays = SLICE0_CALENDAR_DAYS;
  return s;
}

export interface Slice0ScenarioInput {
  /** Required. Slice 0 fixture is 4.3; never silently substituted. */
  quotedMznPerZar: number;
  seed?: number;
  initialPos?: number;
  demandTargetZar?: number;
  supplyCapacityZar?: number;
  demandExpiresAtDay?: number | null;
  supplyExpiresAtDay?: number | null;
  allowedCardIds?: string[] | null;
  allowedPosIds?: string[] | null;
  allowedBeneficiaryIds?: string[] | null;
}

export function requireQuotedMznPerZar(quotedMznPerZar: number | undefined): number {
  if (quotedMznPerZar === undefined || !Number.isFinite(quotedMznPerZar) || quotedMznPerZar <= 0) {
    throw new Error(
      "Slice 0 requires an explicit quotedMznPerZar (scenario_constant_operator_quote). There is no silent 4.3 fallback.",
    );
  }
  return quotedMznPerZar;
}

export function createSlice0Scenario(input: Slice0ScenarioInput): Scenario {
  const quotedMznPerZar = requireQuotedMznPerZar(input.quotedMznPerZar);
  const scenario = cloneScenario(slice0KernelScenario(input.seed, input.initialPos));
  scenario.name = "Slice 0 sourcing cycle (configured simulation identities)";
  scenario.slice0Fixtures = {
    quotedMznPerZar,
    quoteKind: SLICE0_QUOTE_KIND,
    demandOperatorId: DEMAND_OPERATOR_ID,
    supplyOperatorId: SUPPLY_OPERATOR_ID,
    cardInstitutionByResourceId: { ...SLICE0_FIXTURE_CARD_INSTITUTIONS },
    posInstitutionByResourceId: { ...SLICE0_FIXTURE_POS_INSTITUTIONS },
  };
  return scenario;
}

export function slice0DemandTerms(input: Slice0ScenarioInput): DemandMandateTerms {
  const quotedMznPerZar = requireQuotedMznPerZar(input.quotedMznPerZar);
  return {
    targetZar: input.demandTargetZar ?? 150_000,
    expiresAtDay: input.demandExpiresAtDay ?? SLICE0_CALENDAR_DAYS,
    allowedBeneficiaryIds: input.allowedBeneficiaryIds ?? null,
    allowedCardIds: input.allowedCardIds ?? null,
    quotedMznPerZar,
    quoteKind: SLICE0_QUOTE_KIND,
  };
}

export function slice0SupplyTerms(input: Slice0ScenarioInput): SupplyMandateTerms {
  const quotedMznPerZar = requireQuotedMznPerZar(input.quotedMznPerZar);
  return {
    capacityZar: input.supplyCapacityZar ?? 150_000,
    expiresAtDay: input.supplyExpiresAtDay ?? SLICE0_CALENDAR_DAYS,
    allowedPosIds: input.allowedPosIds ?? null,
    quotedMznPerZar,
    quoteKind: SLICE0_QUOTE_KIND,
  };
}
