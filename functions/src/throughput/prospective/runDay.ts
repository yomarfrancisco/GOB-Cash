import { mznConsideration } from "../model/conversion";
import { isOperatingWeekday } from "../model/demand";
import { disableOrganic } from "../model/organic";
import { emptyOffer } from "../model/demand";
import { roundMoney } from "../model/math";
import { createSlice0Scenario } from "../model/slice0Scenario";
import { simulate } from "../model/simulation";
import { cloneState, createInitialState } from "../model/state";
import type { CoreTicket, Scenario, SimState } from "../model/types";
import { identitiesFromScenario } from "./identities";
import { formatExactZar } from "./format";
import { formatInstitutionLabel, formatRailLabel } from "./labels";
import { RETAINED_MARGIN_RATE } from "./constants";
import {
  PROSPECTIVE_HORIZON_DAYS,
  PROSPECTIVE_INITIAL_CARDS,
  PROSPECTIVE_INITIAL_POS,
  PROSPECTIVE_QUOTE_MZN_PER_ZAR,
  type ProspectiveDayRecord,
  type ProspectiveRoute,
} from "./types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function prospectiveScenario(input: { seed: number; availableZar: number }): Scenario {
  const scenario = disableOrganic(
    createSlice0Scenario({
      quotedMznPerZar: PROSPECTIVE_QUOTE_MZN_PER_ZAR,
      seed: input.seed,
      initialPos: PROSPECTIVE_INITIAL_POS,
      demandTargetZar: 10_000_000,
      supplyCapacityZar: 10_000_000,
      demandExpiresAtDay: PROSPECTIVE_HORIZON_DAYS,
      supplyExpiresAtDay: PROSPECTIVE_HORIZON_DAYS,
    }),
  );
  scenario.startingCapitalZar = Math.max(0, input.availableZar);
  scenario.horizonDays = PROSPECTIVE_HORIZON_DAYS;
  scenario.initialCards = PROSPECTIVE_INITIAL_CARDS;
  scenario.initialPos = PROSPECTIVE_INITIAL_POS;
  scenario.maximumPosDevices = Math.max(scenario.maximumPosDevices, PROSPECTIVE_INITIAL_POS);
  scenario.hiddenWorldEnabled = true;
  scenario.economicLearnerEnabled = true;
  return scenario;
}

export function weekdayLabel(day: number): string {
  return WEEKDAYS[(day - 1) % 7] ?? "Mon";
}

export function initialProspectiveState(scenario: Scenario, availableZar: number): SimState {
  const state = createInitialState(scenario);
  state.deployableCapital = Math.max(0, availableZar);
  return state;
}

export function runProspectiveDay(input: {
  day: number;
  availableZar: number;
  tickets: CoreTicket[];
  seed: number;
  previousState: SimState | null;
  maxPrintZar?: number;
}): { record: ProspectiveDayRecord; endingState: SimState; availableZar: number } {
  const tickets = ticketsWithinPrintCap(input.tickets, input.maxPrintZar);
  const scenario = prospectiveScenario({ seed: input.seed, availableZar: input.availableZar });
  const starting = input.previousState
    ? cloneState(input.previousState)
    : initialProspectiveState(scenario, input.availableZar);
  starting.deployableCapital = Math.max(0, input.availableZar);
  starting.exogenousOffer = undefined;
  const priorReviews = reviewLabels(starting, input.day, scenario);
  const priorUpdates = starting.learner.updates;
  const result = simulate(starting, scenario, "core-only", {
    startDay: input.day,
    realizedThroughDay: input.day,
    reshapeOffer: (state) => {
      const offer = emptyOffer("realized");
      offer.coreTickets = [...tickets];
      offer.coreDemandZar = roundMoney(tickets.reduce((sum, ticket) => sum + ticket.amount, 0));
      state.exogenousOffer = offer;
    },
  });
  const ending = cloneState(result.endingState);
  const calendar = result.calendar.find((entry) => entry.day === input.day);
  const dayRow = result.days.find((row) => row.day === input.day);
  const planned = (calendar?.actionPlan.transactions ?? []).filter((row) => row.source === "core");
  const blocked = calendar?.actionPlan.blocked ?? [];
  const identities = identitiesFromScenario(scenario, ending);
  const universe = [
    ...Object.values(identities.cards).map((card) => card.institutionId),
    ...Object.values(identities.pos).map((pos) => pos.institutionId),
  ].filter((id): id is string => Boolean(id));
  const routes: ProspectiveRoute[] = planned.map((tx) => {
    const card = identities.cards[tx.cardId];
    const pos = identities.pos[tx.posId];
    const cardName = card?.name && !/^card/i.test(card.name) ? card.name : tx.cardId;
    const issuing = formatInstitutionLabel(card?.institutionId, universe);
    const acquiring = formatInstitutionLabel(pos?.institutionId, universe);
    return {
      cardId: tx.cardId,
      posId: tx.posId,
      cardName,
      railLabel: formatRailLabel(tx.posId, acquiring),
      issuingLabel: issuing,
      acquiringLabel: acquiring,
      amountZar: tx.amount,
      economicPaymentId: tx.economicPaymentId ?? `${tx.cardId}:${tx.posId}`,
    };
  });
  const recommendedZar = roundMoney(calendar?.recommendedThroughput ?? calendar?.coreThroughput ?? 0);
  const settledZar = roundMoney(calendar?.coreThroughput ?? 0);
  const blockedZar = roundMoney(blocked.reduce((sum, row) => sum + row.amount, 0));
  const heldBackZar = roundMoney(Math.max(0, input.availableZar - recommendedZar));
  const availableZar = roundMoney(input.availableZar + settledZar * RETAINED_MARGIN_RATE);
  const reviews = reviewLabels(ending, input.day + 1, scenario).filter((label) => !priorReviews.includes(label));
  const weekend = !isOperatingWeekday(input.day);
  const binding = dayRow?.dominantBindingConstraint;
  const concentrationReason =
    binding && binding !== "none"
      ? binding
      : weekend
        ? "weekend"
        : settledZar > 0
          ? "continuity"
          : "no_eligible_payment";
  const learningNote = learningCopy({
    weekend,
    reviews,
    learnerUpdates: ending.learner.updates - priorUpdates,
    settledZar,
    recommendedZar,
    heldBackZar,
    concentrationReason,
  });
  return {
    endingState: ending,
    availableZar,
    record: {
      day: input.day,
      weekday: weekdayLabel(input.day),
      weekend,
      recommendedZar,
      heldBackZar,
      settledZar,
      blockedZar,
      considerationMzn: mznConsideration(settledZar, PROSPECTIVE_QUOTE_MZN_PER_ZAR),
      paymentCount: planned.length,
      blockedCount: blocked.length,
      routes,
      blockedReasons: [...new Set(blocked.map((row) => row.reason || String(row.rule)))],
      concentrationReason,
      reviews,
      learningNote,
      availableAfterZar: availableZar,
      learnerUpdates: ending.learner.updates,
      observationCount: ending.observations.length,
    },
  };
}

export function ticketsWithinPrintCap(tickets: CoreTicket[], maxPrintZar?: number): CoreTicket[] {
  if (maxPrintZar == null || !(maxPrintZar > 0)) return tickets;
  const cap = roundMoney(maxPrintZar);
  const selected: CoreTicket[] = [];
  let filled = 0;
  for (const ticket of tickets) {
    const next = roundMoney(filled + ticket.amount);
    if (next <= cap + 1e-9) {
      selected.push(ticket);
      filled = next;
    }
  }
  return selected;
}

function reviewLabels(state: SimState, asOfDay: number, scenario: Scenario): string[] {
  const identities = identitiesFromScenario(scenario, state);
  const universe = [
    ...Object.values(identities.cards).map((card) => card.institutionId),
    ...Object.values(identities.pos).map((pos) => pos.institutionId),
  ].filter((id): id is string => Boolean(id));
  const labels: string[] = [];
  for (const resource of [...state.cards, ...state.pos]) {
    if (resource.downUntilDay != null && resource.downUntilDay > asOfDay) {
      const institution =
        formatInstitutionLabel(resource.institutionId ?? identities.cards[resource.id]?.institutionId ?? identities.pos[resource.id]?.institutionId, universe) ??
        resource.name;
      labels.push(institution);
    }
  }
  return [...new Set(labels)];
}

function learningCopy(input: {
  weekend: boolean;
  reviews: string[];
  learnerUpdates: number;
  settledZar: number;
  recommendedZar: number;
  heldBackZar: number;
  concentrationReason: string;
}): string {
  if (input.weekend) return "Weekend. Rails rest; nothing to learn from new flow.";
  if (input.reviews.length > 0) {
    return `${input.reviews.join(", ")} entered review. Tomorrow I’m reducing exposure there.`;
  }
  if (input.settledZar <= 1e-9) {
    return input.heldBackZar > 0
      ? "I held the print. Continuity and concentration limits stay in force."
      : "No eligible whole payment today. The book is unchanged.";
  }
  if (input.learnerUpdates > 0) {
    return `I recorded ${formatExactZar(input.settledZar)} that settled.`;
  }
  if (input.concentrationReason !== "continuity" && input.concentrationReason !== "weekend") {
    return "I kept the print inside the binding operating constraint.";
  }
  return `All planned payments settled. I have ${formatExactZar(input.recommendedZar)} on the book.`;
}
