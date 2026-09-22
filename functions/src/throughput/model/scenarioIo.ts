import { createDefaultScenario } from "./defaults";
import { emptyHistorySeed } from "./history";
import type { MaturityWeights, ResourceHistorySeed, Scenario } from "./types";

function isWeights(value: unknown): value is MaturityWeights {
  return Boolean(value && typeof value === "object" && "age" in (value as object));
}

function isSeed(value: unknown): value is ResourceHistorySeed {
  return Boolean(value && typeof value === "object" && "historicalVolumeZar" in (value as object));
}

export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function importScenario(json: string): Scenario {
  const parsed = JSON.parse(json) as Partial<Scenario> & { commonShockShare?: number };
  const base = createDefaultScenario();
  const mappedCardCorr =
    parsed.cardFailureCorrelation ?? parsed.commonShockShare ?? base.cardFailureCorrelation;
  const mappedPosCorr =
    parsed.posFailureCorrelation ?? parsed.commonShockShare ?? base.posFailureCorrelation;
  const names = Array.isArray(parsed.initialCardNames)
    ? parsed.initialCardNames.map(String)
    : base.initialCardNames;
  const initialCards = parsed.initialCards ?? names.length;
  const merged: Scenario = {
    ...base,
    ...parsed,
    initialCards,
    initialCardNames: names.length > 0 ? names : base.initialCardNames,
    cardFailureCorrelation: mappedCardCorr,
    posFailureCorrelation: mappedPosCorr,
    merchantMaturityWeights: {
      ...base.merchantMaturityWeights,
      ...(isWeights(parsed.merchantMaturityWeights) ? parsed.merchantMaturityWeights : {}),
    },
    cardMaturityWeights: {
      ...base.cardMaturityWeights,
      ...(isWeights(parsed.cardMaturityWeights) ? parsed.cardMaturityWeights : {}),
    },
    posMaturityWeights: {
      ...base.posMaturityWeights,
      ...(isWeights(parsed.posMaturityWeights) ? parsed.posMaturityWeights : {}),
    },
    startingCardHistory: {
      ...emptyHistorySeed(),
      ...base.startingCardHistory,
      ...(isSeed(parsed.startingCardHistory) ? parsed.startingCardHistory : {}),
    },
    startingPosHistory: {
      ...emptyHistorySeed(),
      ...base.startingPosHistory,
      ...(isSeed(parsed.startingPosHistory) ? parsed.startingPosHistory : {}),
    },
    startingCardHistories: Array.isArray(parsed.startingCardHistories)
      ? parsed.startingCardHistories.map((s) => (s && isSeed(s) ? s : null))
      : base.startingCardHistories,
    startingPosHistories: Array.isArray(parsed.startingPosHistories)
      ? parsed.startingPosHistories.map((s) => (s && isSeed(s) ? s : null))
      : base.startingPosHistories,
    preset: "custom",
    name: parsed.name ?? "Imported",
  };
  return merged;
}
