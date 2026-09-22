import {
  aggressiveScenario,
  cloneScenario,
  conservativeScenario,
  createDefaultScenario,
} from "./defaults";
import type { PresetId, Scenario } from "./types";

export const FIELD_LABELS: Record<string, string> = {
  name: "Scenario name",
  preset: "Preset",
  startingCapitalZar: "Starting capital (ZAR)",
  startingCapitalMzn: "Starting capital (MZN label)",
  margin: "Gross margin",
  capitalMode: "Capital mode",
  initialCards: "Initial cards",
  initialCardNames: "Initial card names",
  initialPos: "Initial POS",
  maximumPosDevices: "Maximum POS devices",
  posEveryDays: "POS every N completed days",
  cardEveryDays: "Card every N completed days",
  perCardCapacityZar: "Per-card capacity",
  perPosCapacityZar: "Per-POS capacity",
  horizonDays: "Horizon (days)",
  throughputStepZar: "Throughput step",
  avgTicketZar: "Average ticket",
  expectedTicketMinZar: "Expected ticket min",
  expectedTicketMaxZar: "Expected ticket max",
  meanDailyCoreTickets: "Mean weekday core tickets",
  weeklyEnsemblePaths: "Weekly ensemble paths",
  p0: "Base hazard p0",
  vRefZar: "Reference throughput Vref",
  gamma: "Throughput-risk exponent γ",
  hMax: "Hazard cap hMax",
  infiniteHazardAboveZar: "Infinite-hazard cliff",
  shortReviewMinDays: "Short review min",
  shortReviewMaxDays: "Short review max",
  longReviewMinDays: "Long review min",
  longReviewMaxDays: "Long review max",
  probabilityReviewIsLong: "P(review is long)",
  interruptionIsCardScope: "Card-scope weight",
  interruptionIsPosScope: "POS-scope weight",
  interruptionIsSystemScope: "System-scope weight",
  cardFailureCorrelation: "Card failure correlation",
  posFailureCorrelation: "POS failure correlation",
  merchantProfileFit: "Merchant profile fit",
  crossBorderProfile: "Cross-border profile",
  relatedPartyContext: "Related-party context",
  merchantMaturitySensitivity: "Merchant maturity coefficient",
  cardMaturitySensitivity: "Card maturity coefficient",
  posMaturitySensitivity: "POS maturity coefficient",
  concentrationSensitivity: "Concentration coefficient",
  rampSensitivity: "Ramp coefficient",
  ticketFitSensitivity: "Ticket-fit coefficient",
  priorReviewSensitivity: "Prior-review coefficient",
  cleanHistorySensitivity: "Clean-history coefficient",
  useLookahead: "Lookahead",
  lookaheadDays: "Lookahead days",
  capitalFrozenDuringReview: "Capital frozen during review",
  frozenCapitalDailyRate: "Frozen-capital daily rate",
  showOperatingBand: "Show operating band",
  bandEvTolerance: "Band EV tolerance",
  showBreakEvenHazard: "Show break-even hazard",
  riskConstraintEnabled: "Risk constraint",
  maxExpectedDowntimeShare: "Max expected downtime share",
  maxProbLongReview30d: "Max 30d long-review probability",
  conservativeThroughputZar: "Conservative policy throughput",
  monteCarloPaths: "Monte Carlo paths",
  rngSeed: "Random seed",
  merchantMaturityStateOverride: "Merchant maturity state override",
  cardMaturityStateOverride: "Card maturity state override",
  startingCardHistory: "Starting card history",
  startingPosHistory: "Starting POS history",
  externalOrganicRevenueMonthlyZar: "Monthly organic revenue",
  weeklyExpenseFloorZar: "Weekly organic expense floor",
  monthlyProfitLinkedExpenseRate: "Profit-linked expense rate",
  organicMonthLengthDays: "Organic month length (days)",
  organicWeekLengthDays: "Organic week length (days)",
};

export function scenarioFromPreset(id: PresetId): Scenario {
  if (id === "conservative") return conservativeScenario();
  if (id === "aggressive") return aggressiveScenario();
  if (id === "balanced") return createDefaultScenario();
  const s = createDefaultScenario();
  s.preset = "custom";
  s.name = "Custom";
  return s;
}

export interface ParameterChange {
  path: string;
  label: string;
  from: string;
  to: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function walkDiff(prefix: string, a: unknown, b: unknown, out: ParameterChange[]): void {
  if (Object.is(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const root = prefix.split(".")[0] ?? prefix;
    out.push({
      path: prefix,
      label: FIELD_LABELS[prefix] ?? FIELD_LABELS[root] ?? prefix,
      from: formatValue(a),
      to: formatValue(b),
    });
    return;
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const key of keys) {
      const next = prefix ? `${prefix}.${key}` : key;
      walkDiff(next, (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], out);
    }
    return;
  }
  const root = prefix.split(".")[0] ?? prefix;
  out.push({
    path: prefix,
    label: FIELD_LABELS[prefix] ?? FIELD_LABELS[root] ?? prefix,
    from: formatValue(a),
    to: formatValue(b),
  });
}

export function diffScenarios(from: Scenario, to: Scenario): ParameterChange[] {
  const out: ParameterChange[] = [];
  const skip = new Set(["name", "preset"]);
  const fromCopy = { ...from } as unknown as Record<string, unknown>;
  const toCopy = { ...to } as unknown as Record<string, unknown>;
  for (const key of skip) {
    delete fromCopy[key];
    delete toCopy[key];
  }
  walkDiff("", fromCopy, toCopy, out);
  return out;
}

export function diffFromBalanced(scenario: Scenario): ParameterChange[] {
  return diffScenarios(createDefaultScenario(), scenario);
}

export function applyPresetKeepingCustomName(id: Exclude<PresetId, "custom">): Scenario {
  return cloneScenario(scenarioFromPreset(id));
}
