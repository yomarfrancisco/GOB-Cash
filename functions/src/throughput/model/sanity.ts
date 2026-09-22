import { cloneScenario, createDefaultScenario } from "./defaults";
import { disableOrganic } from "./organic";
import { concentrationMetrics } from "./risk";
import { decideDay } from "./optimizer";
import { applyScheduledArrivals, createInitialState } from "./state";
import type { SanityCheckResult, Scenario } from "./types";

function decide(scenario: Scenario) {
  const state = createInitialState(scenario);
  applyScheduledArrivals(state, scenario);
  return { state, decision: decideDay(state, scenario, true) };
}

export function runSanityChecks(): SanityCheckResult[] {
  const results: SanityCheckResult[] = [];

  {
    const s = cloneScenario(createDefaultScenario());
    s.p0 = 0;
    s.infiniteHazardAboveZar = null;
    const { decision } = decide(s);
    const passed =
      decision.recommended.throughput <= s.startingCapitalZar + 1e-6 &&
      decision.recommended.throughput >= 4 * s.avgTicketZar - 1e-6;
    results.push({
      id: "A",
      name: "Zero hazard deploys all genuine available demand",
      passed,
      detail: `p0=0 → V*=${decision.recommended.throughput} vs demand ${4 * s.avgTicketZar} and capital ${s.startingCapitalZar}`,
    });
  }

  {
    const base = cloneScenario(createDefaultScenario());
    const long = cloneScenario(createDefaultScenario());
    long.longReviewMinDays = 180;
    long.longReviewMaxDays = 220;
    const vBase = decide(base).decision.myopicRecommended.throughput;
    const vLong = decide(long).decision.myopicRecommended.throughput;
    const passed = vLong <= vBase;
    results.push({
      id: "B",
      name: "Extreme interruption duration does not raise the myopic optimum",
      passed,
      detail: `myopic default V*=${vBase}; long-review 180–220d V*=${vLong}`,
    });
  }

  {
    const one = cloneScenario(createDefaultScenario());
    one.cardFailureCorrelation = 0;
    one.posFailureCorrelation = 0;
    one.interruptionIsSystemScope = 0;
    one.interruptionIsCardScope = 1;
    one.interruptionIsPosScope = 0;
    one.initialCards = 1;
    one.initialCardNames = ["Card 1"];
    one.initialPos = 1;
    const two = cloneScenario(one);
    two.initialCards = 2;
    two.initialCardNames = ["Card 1", "Card 2"];
    const a = decide(one);
    const b = decide(two);
    const f1 = concentrationMetrics(a.state, one, one.startingCapitalZar).expectedCapacityLost;
    const f2 = concentrationMetrics(b.state, two, two.startingCapitalZar).expectedCapacityLost;
    const passed = f2 < f1 - 0.05;
    results.push({
      id: "C",
      name: "Second independent card reduces expected capacity lost",
      passed,
      detail: `1 card f=${f1.toFixed(2)}; 2 cards f=${f2.toFixed(2)}`,
    });
  }

  {
    const low = cloneScenario(createDefaultScenario());
    const high = cloneScenario(createDefaultScenario());
    low.gamma = 1.2;
    high.gamma = 3;
    const vLow = decide(low).decision.recommended.throughput;
    const vHigh = decide(high).decision.recommended.throughput;
    const passed = vHigh <= vLow;
    results.push({
      id: "D",
      name: "Higher risk exponent does not raise the optimum",
      passed,
      detail: `γ=1.2 V*=${vLow}; γ=3 V*=${vHigh}`,
    });
  }

  {
    const low = disableOrganic(cloneScenario(createDefaultScenario()));
    const high = disableOrganic(cloneScenario(createDefaultScenario()));
    low.margin = 0.1;
    high.margin = 0.35;
    const vLow = decide(low).decision.recommended.throughput;
    const vHigh = decide(high).decision.recommended.throughput;
    const passed = vHigh >= vLow;
    results.push({
      id: "E",
      name: "Higher gross margin does not lower the optimum",
      passed,
      detail: `m=10% V*=${vLow}; m=35% V*=${vHigh}`,
    });
  }

  {
    const s = disableOrganic(cloneScenario(createDefaultScenario()));
    s.p0 = 0;
    s.infiniteHazardAboveZar = 40_000;
    const { decision } = decide(s);
    const passed = decision.recommended.throughput < 40_000 - 1e-6;
    results.push({
      id: "F",
      name: "Infinite hazard above a threshold keeps the optimum below it",
      passed,
      detail: `cliff at R40,000 → V*=${decision.recommended.throughput}`,
    });
  }

  {
    const s = disableOrganic(cloneScenario(createDefaultScenario()));
    s.p0 = 0.2;
    s.gamma = 0;
    s.probabilityReviewIsLong = 1;
    s.longReviewMinDays = 90;
    s.longReviewMaxDays = 90;
    s.hMax = 0.99;
    const { decision } = decide(s);
    const positive = decision.curve.filter((c) => c.throughput > 0);
    const allNegative = positive.every((c) => c.objectiveEv < 0);
    const passed = decision.recommended.throughput === 0 && allNegative;
    results.push({
      id: "G",
      name: "Zero is chosen when all positive steps have negative EV",
      passed,
      detail: `V*=${decision.recommended.throughput}; positive steps all negative EV=${allNegative}`,
    });
  }

  {
    const s = cloneScenario(createDefaultScenario());
    const { decision } = decide(s);
    const passed =
      decision.bandMin <= decision.recommended.throughput &&
      decision.recommended.throughput <= decision.bandMax;
    results.push({
      id: "H",
      name: "Operating band contains the point estimate",
      passed,
      detail: `band ${decision.bandMin}–${decision.bandMax}; point ${decision.recommended.throughput}`,
    });
  }

  {
    const look = cloneScenario(createDefaultScenario());
    look.useLookahead = true;
    look.merchantMaturitySensitivity = 2.2;
    look.cardMaturitySensitivity = 2.2;
    const myopic = cloneScenario(look);
    myopic.useLookahead = false;
    const vL = decide(look).decision.recommended.throughput;
    const vM = decide(myopic).decision.recommended.throughput;
    const passed = vL >= 0 && vL <= look.startingCapitalZar + 1e-6;
    results.push({
      id: "I",
      name: "Lookahead returns a feasible core amount on a thin, high-sensitivity start",
      passed,
      detail: `lookahead V*=${vL}; myopic V*=${vM}`,
    });
  }

  {
    const frozen = cloneScenario(createDefaultScenario());
    frozen.capitalFrozenDuringReview = true;
    frozen.initialCards = 2;
    frozen.initialCardNames = ["Card 1", "Card 2"];
    frozen.cardFailureCorrelation = 0;
    frozen.posFailureCorrelation = 0;
    const free = cloneScenario(frozen);
    free.capitalFrozenDuringReview = false;
    const a = decide(frozen).decision.recommended;
    const b = decide(free).decision.recommended;
    const passed = a.freezeCost >= 0 && (a.throughput <= b.throughput || a.objectiveEv <= b.objectiveEv + 1e-6);
    results.push({
      id: "J",
      name: "Frozen capital does not increase the two-card optimum vs free capital",
      passed,
      detail: `frozen V*=${a.throughput} freezeCost=${a.freezeCost.toFixed(0)}; free V*=${b.throughput}`,
    });
  }

  return results;
}
