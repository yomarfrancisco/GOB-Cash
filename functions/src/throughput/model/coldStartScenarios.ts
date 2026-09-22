import { cloneScenario, createDefaultScenario } from "./defaults";
import { establishedHistorySeed, partialHistorySeed } from "./history";
import { disableOrganic } from "./organic";
import type { Scenario } from "./types";

export function fullyColdNoOrganicScenario(): Scenario {
  const s = disableOrganic(cloneScenario(createDefaultScenario()));
  s.name = "Fully cold (no organic)";
  s.preset = "custom";
  return s;
}

export function coldCoreExistingCardHistoryScenario(): Scenario {
  const s = disableOrganic(cloneScenario(createDefaultScenario()));
  s.name = "Cold core, existing card history";
  s.preset = "custom";
  s.startingCardHistory = establishedHistorySeed();
  return s;
}

export function existingCardAndPosHistoryScenario(): Scenario {
  const s = disableOrganic(cloneScenario(createDefaultScenario()));
  s.name = "Existing card + POS history";
  s.preset = "custom";
  s.startingCardHistory = establishedHistorySeed();
  s.startingPosHistory = establishedHistorySeed();
  return s;
}

export function fullyColdWithOrganicScenario(): Scenario {
  const s = cloneScenario(createDefaultScenario());
  s.name = "Fully cold + organic activity";
  s.preset = "custom";
  return s;
}

export function mixedHistoryWithOrganicScenario(): Scenario {
  const s = cloneScenario(createDefaultScenario());
  s.name = "Partial history + organic";
  s.preset = "custom";
  s.startingCardHistories = [
    establishedHistorySeed(),
    establishedHistorySeed(),
    partialHistorySeed(),
    null,
    null,
  ];
  s.startingPosHistories = [partialHistorySeed(), null];
  return s;
}

export function coldStartScenarioSuite(): Scenario[] {
  return [
    fullyColdNoOrganicScenario(),
    coldCoreExistingCardHistoryScenario(),
    existingCardAndPosHistoryScenario(),
    fullyColdWithOrganicScenario(),
    mixedHistoryWithOrganicScenario(),
  ];
}
