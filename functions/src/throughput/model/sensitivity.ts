import { cardNamesForCount, cloneScenario, createDefaultScenario } from "./defaults";
import { decideDay } from "./optimizer";
import { applyScheduledArrivals, createInitialState } from "./state";
import type { Scenario, SensitivityRow } from "./types";

function day1(scenario: Scenario) {
  const state = createInitialState(scenario);
  applyScheduledArrivals(state, scenario);
  const decision = decideDay(state, scenario, true);
  return {
    throughput: decision.recommended.throughput,
    ev: decision.recommended.objectiveEv,
  };
}

export function runSensitivityTables(
  base: Scenario = createDefaultScenario(),
): Record<string, SensitivityRow[]> {
  function grid(
    parameter: string,
    values: number[],
    apply: (scenario: Scenario, value: number) => void,
  ): SensitivityRow[] {
    return values.map((value) => {
      const scenario = cloneScenario(base);
      apply(scenario, value);
      const result = day1(scenario);
      return {
        parameter,
        value,
        day1Optimum: result.throughput,
        day1ObjectiveEv: result.ev,
      };
    });
  }

  return {
    p0: grid("Base hazard p0", [0.0005, 0.001, 0.002, 0.004, 0.008], (s, v) => {
      s.p0 = v;
    }),
    gamma: grid("Throughput-risk exponent γ", [1.2, 1.5, 2, 2.5, 3], (s, v) => {
      s.gamma = v;
    }),
    longReviewDuration: grid(
      "Long-review duration (days, min=max)",
      [10, 21, 35, 42, 60, 90],
      (s, v) => {
        s.longReviewMinDays = v;
        s.longReviewMaxDays = v;
      },
    ),
    probabilityLong: grid("Probability review is long", [0.05, 0.1, 0.2, 0.35, 0.5], (s, v) => {
      s.probabilityReviewIsLong = v;
    }),
    merchantMaturity: grid("Merchant maturity state", [0, 0.25, 0.5, 0.75, 1], (s, v) => {
      s.merchantMaturityStateOverride = v;
    }),
    cardMaturity: grid("Card maturity state", [0, 0.25, 0.5, 0.75, 1], (s, v) => {
      s.cardMaturityStateOverride = v;
    }),
    merchantProfileFit: grid("Merchant profile fit", [0.75, 1, 1.5, 2, 3], (s, v) => {
      s.merchantProfileFit = v;
    }),
    concentrationSensitivity: grid("Concentration coefficient", [0, 0.4, 0.8, 1.2, 2], (s, v) => {
      s.concentrationSensitivity = v;
    }),
    initialCards: grid("Initial card count", [1, 2, 3, 5, 7], (s, v) => {
      s.initialCards = v;
      s.initialCardNames = cardNamesForCount(v, s.initialCardNames);
    }),
    initialPos: grid("Initial POS count", [1, 2, 3, 4], (s, v) => {
      s.initialPos = v;
      s.maximumPosDevices = Math.max(s.maximumPosDevices, v);
    }),
    maximumPos: grid("Maximum POS count", [2, 3, 5, 8], (s, v) => {
      s.maximumPosDevices = Math.max(s.initialPos, v);
    }),
    cardFailureCorrelation: grid(
      "Card failure correlation",
      [0, 0.25, 0.4, 0.6, 1],
      (s, v) => {
        s.cardFailureCorrelation = v;
      },
    ),
    posFailureCorrelation: grid("POS failure correlation", [0, 0.25, 0.4, 0.6, 1], (s, v) => {
      s.posFailureCorrelation = v;
    }),
  };
}
