import {
  daysLeftInPeriod,
  expenseBudgetAvailable,
  scheduledOrganicExpense,
} from "./organic";
import { bankDaySummary, withTicketIdentity } from "./bankRules";
import { mulberry32, roundMoney, floorMoney, sum, uniqueSorted } from "./math";
import { maxFeasibleThroughput, throughputCandidates } from "./state";
import type {
  BlockedObligation,
  CoreTicket,
  DailyActionPlan,
  DayAction,
  ExogenousOffer,
  PlannedTransaction,
  Scenario,
  SimState,
} from "./types";

export const OPERATING_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export const WEEKDAY_NAMES = [...OPERATING_WEEKDAYS, "Saturday", "Sunday"] as const;
export const OPERATING_HOUR_START = 9;
export const OPERATING_HOUR_END = 17;

const OPEN_MINUTES = OPERATING_HOUR_START * 60;
const CLOSE_MINUTES = OPERATING_HOUR_END * 60;

export function weekdayIndex(day: number): number {
  return ((Math.max(1, day) - 1) % 7 + 7) % 7;
}

export function isOperatingWeekday(day: number): boolean {
  return weekdayIndex(day) < 5;
}

/** The n-th operating weekday strictly after `day`. n=1 is the next Monday–Friday. */
export function nthOperatingDayAfter(day: number, n: number): number {
  const need = Math.max(0, Math.round(n));
  if (need === 0) return day;
  let d = day;
  let seen = 0;
  while (seen < need) {
    d += 1;
    if (isOperatingWeekday(d)) seen += 1;
  }
  return d;
}

/**
 * Exclusive downUntilDay so that the next `n` operating mornings still see the resource as down
 * (released at the start of the calendar day after the last degraded operating day).
 * n=1 after a Wednesday hit ⇒ Thursday down, Friday morning up.
 */
export function downUntilAfterOperatingDays(hitDay: number, operatingDaysDown: number): number {
  return nthOperatingDayAfter(hitDay, Math.max(1, Math.round(operatingDaysDown))) + 1;
}

export function weekdayName(day: number): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[weekdayIndex(day)]!;
}

export function formatClock(timeMinutes: number): string {
  const wrapped = Math.max(0, Math.floor(timeMinutes));
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mixSeed(base: number, day: number, stream: string): number {
  let h = (base >>> 0) ^ Math.imul(Math.max(0, day), 2654435761);
  for (let i = 0; i < stream.length; i++) {
    h = Math.imul(h ^ stream.charCodeAt(i), 1597334677);
  }
  return h >>> 0;
}

export function streamRng(scenario: Scenario, day: number, stream: string): () => number {
  return mulberry32(mixSeed(scenario.rngSeed, day, stream));
}

export function poisson(rng: () => number, lambda: number): number {
  const l = Math.max(0, lambda);
  if (l <= 0) return 0;
  if (l > 40) {
    const z = Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
    return Math.max(0, Math.round(l + Math.sqrt(l) * z));
  }
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function sampleTriangular(rng: () => number, a: number, b: number, c: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo <= 1e-9) return lo;
  const mode = Math.min(hi, Math.max(lo, c));
  const u = rng();
  const fc = (mode - lo) / (hi - lo);
  if (u < fc) return lo + Math.sqrt(u * (hi - lo) * (mode - lo));
  return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
}

export function drawTicketSize(rng: () => number, scenario: Scenario): number {
  const min = Math.max(1, scenario.expectedTicketMinZar);
  const max = Math.max(min, scenario.expectedTicketMaxZar);
  const mode = Math.min(max, Math.max(min, scenario.avgTicketZar));
  return roundMoney(sampleTriangular(rng, min, max, mode));
}

function drawMeanPreservingSpike(rng: () => number, mean: number, pZero = 0.35): number {
  if (mean <= 1e-9) return 0;
  const p = Math.min(0.9, Math.max(0, pZero));
  if (rng() < p) return 0;
  return roundMoney(mean / (1 - p));
}

function expectedOrganicMeans(state: SimState, scenario: Scenario): {
  revenue: number;
  expense: number;
} {
  if (!isOperatingWeekday(state.day)) return { revenue: 0, expense: 0 };
  const daysLeft = daysLeftInPeriod(state.day, scenario.organicMonthLengthDays);
  const revenue = Math.max(0, state.organic.monthRevenueRemaining / Math.max(1, daysLeft));
  const expense = Math.min(expenseBudgetAvailable(state.organic), scheduledOrganicExpense(state, scenario));
  return { revenue: roundMoney(revenue), expense: roundMoney(expense) };
}

/**
 * Expected (lookahead) placeholders: n tickets of avgTicket. Identity ids mark them as
 * expected so the repeated-amount rule does not treat identical placeholders as genuine repeats.
 */
function expectedCoreTickets(scenario: Scenario, day: number): CoreTicket[] {
  const n = Math.max(0, Math.round(scenario.meanDailyCoreTickets));
  if (n === 0) return [];
  const amount = roundMoney(Math.max(1, scenario.avgTicketZar));
  const span = Math.max(1, CLOSE_MINUTES - OPEN_MINUTES - 30);
  return Array.from({ length: n }, (_, i) => ({
    amount,
    timeMinutes: OPEN_MINUTES + 15 + Math.round((span * (i + 0.5)) / n),
    economicPaymentId: `exp:${day}:${i + 1}`,
    supportingInvoicePresent: true,
  }));
}

function drawCoreTickets(rngCount: () => number, rngSize: () => number, rngTime: () => number, scenario: Scenario, day: number): CoreTicket[] {
  const n = poisson(rngCount, Math.max(0, scenario.meanDailyCoreTickets));
  const tickets: CoreTicket[] = [];
  for (let i = 0; i < n; i++) {
    const span = Math.max(1, CLOSE_MINUTES - OPEN_MINUTES);
    tickets.push({
      amount: drawTicketSize(rngSize, scenario),
      timeMinutes: OPEN_MINUTES + Math.floor(rngTime() * span),
    });
  }
  tickets.sort((a, b) => a.timeMinutes - b.timeMinutes || a.amount - b.amount);
  // Genuine obligations: one economicPaymentId + invoiceId per ticket, in time order.
  return withTicketIdentity(tickets, day);
}

function offerFromTickets(
  mode: ExogenousOffer["mode"],
  tickets: CoreTicket[],
  organicRevenueArrivalZar: number,
  organicExpenseArrivalZar: number,
): ExogenousOffer {
  return {
    mode,
    coreTickets: tickets,
    coreDemandZar: roundMoney(sum(tickets.map((t) => t.amount))),
    organicRevenueArrivalZar: roundMoney(Math.max(0, organicRevenueArrivalZar)),
    organicExpenseArrivalZar: roundMoney(Math.max(0, organicExpenseArrivalZar)),
  };
}

export function emptyOffer(mode: ExogenousOffer["mode"] = "expected"): ExogenousOffer {
  return offerFromTickets(mode, [], 0, 0);
}

/**
 * Event-based loss model: genuine tickets deferred from earlier operating days are offered
 * first (oldest first), ahead of today's arrivals. They keep their original identity so the
 * anti-split and repeated-amount rules see the same economic payment.
 */
export function backlogTickets(state: SimState, scenario: Scenario): CoreTicket[] {
  if (scenario.lossModel !== "eventBased" || !scenario.eventLossAblation.backlog) return [];
  const rows = state.backlog ?? [];
  if (rows.length === 0) return [];
  return [...rows]
    .sort((a, b) => a.arrivalDay - b.arrivalDay || a.timeMinutes - b.timeMinutes || a.economicPaymentId.localeCompare(b.economicPaymentId))
    .map((t) => ({
      amount: t.amount,
      timeMinutes: t.timeMinutes,
      economicPaymentId: t.economicPaymentId,
      invoiceId: t.invoiceId,
      supportingInvoicePresent: t.supportingInvoicePresent ?? true,
    }));
}

export function expectedOffer(state: SimState, scenario: Scenario): ExogenousOffer {
  if (!isOperatingWeekday(state.day)) return emptyOffer("expected");
  if (scenario.suppressNewDemand) {
    return offerFromTickets("expected", backlogTickets(state, scenario), 0, 0);
  }
  const organic = expectedOrganicMeans(state, scenario);
  return offerFromTickets(
    "expected",
    [...backlogTickets(state, scenario), ...expectedCoreTickets(scenario, state.day)],
    organic.revenue,
    organic.expense,
  );
}

export function drawRealizedOffer(state: SimState, scenario: Scenario): ExogenousOffer {
  if (!isOperatingWeekday(state.day)) return emptyOffer("realized");
  if (scenario.suppressNewDemand) {
    return offerFromTickets("realized", backlogTickets(state, scenario), 0, 0);
  }
  const organic = expectedOrganicMeans(state, scenario);
  const tickets = drawCoreTickets(
    streamRng(scenario, state.day, "dailyDemandArrival"),
    streamRng(scenario, state.day, "transactionSize"),
    streamRng(scenario, state.day, "transactionTime"),
    scenario,
    state.day,
  );
  return offerFromTickets(
    "realized",
    [...backlogTickets(state, scenario), ...tickets],
    drawMeanPreservingSpike(streamRng(scenario, state.day, "organicRevenueArrival"), organic.revenue),
    drawMeanPreservingSpike(streamRng(scenario, state.day, "organicExpenseArrival"), organic.expense),
  );
}

export function resolveExogenousOffer(state: SimState, scenario: Scenario): ExogenousOffer {
  return state.exogenousOffer ?? expectedOffer(state, scenario);
}

export function bindRealizedOffer(state: SimState, scenario: Scenario): ExogenousOffer {
  const offer = drawRealizedOffer(state, scenario);
  state.exogenousOffer = offer;
  return offer;
}

export function clearExogenousOffer(state: SimState): void {
  delete state.exogenousOffer;
}

export function selectTickets(tickets: CoreTicket[], budgetZar: number): CoreTicket[] {
  const cap = Math.max(0, budgetZar);
  const chosen: CoreTicket[] = [];
  let used = 0;
  for (const ticket of tickets) {
    if (used + ticket.amount > cap + 1e-9) continue;
    chosen.push(ticket);
    used += ticket.amount;
  }
  return chosen;
}

export function prefixSums(tickets: CoreTicket[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const ticket of tickets) {
    run = roundMoney(run + ticket.amount);
    out.push(run);
  }
  return out;
}

export function candidateCoreVolumes(state: SimState, scenario: Scenario): number[] {
  const offer = resolveExogenousOffer(state, scenario);
  if (!isOperatingWeekday(state.day) || offer.coreDemandZar <= 1e-9) return [0];
  const cap = Math.min(maxFeasibleThroughput(state, scenario), offer.coreDemandZar);
  const prefixes = prefixSums(offer.coreTickets).filter((v) => v <= cap + 1e-9);
  return uniqueSorted([0, ...prefixes, ...throughputCandidates(cap, scenario.throughputStepZar)]);
}

export function operatingOrganic(state: SimState, scenario: Scenario): {
  revenue: number;
  expense: number;
} {
  const offer = resolveExogenousOffer(state, scenario);
  const remainingRev = Math.max(0, state.organic.monthRevenueRemaining);
  const remainingExp = expenseBudgetAvailable(state.organic);
  return {
    revenue: floorMoney(Math.min(remainingRev, offer.organicRevenueArrivalZar)),
    expense: floorMoney(Math.min(remainingExp, offer.organicExpenseArrivalZar)),
  };
}

export function offerSignature(offer: ExogenousOffer): string {
  return [
    offer.mode,
    offer.coreTickets.length,
    Math.round(offer.coreDemandZar),
    Math.round(offer.organicRevenueArrivalZar),
    Math.round(offer.organicExpenseArrivalZar),
    offer.coreTickets.map((t) => `${t.timeMinutes}:${Math.round(t.amount)}`).join(","),
  ].join("|");
}

export function buildDailyActionPlan(
  state: SimState,
  scenario: Scenario,
  action: Pick<DayAction, "coreThroughput" | "organicRevenue" | "organicExpense">,
  transactions: PlannedTransaction[],
  organicTransactions: PlannedTransaction[] = [],
  blocked: BlockedObligation[] = [],
  feasibleCoreDemand?: number,
): DailyActionPlan {
  const core = roundMoney(sum(transactions.map((t) => t.amount)));
  const offer = resolveExogenousOffer(state, scenario);
  return {
    date: weekdayName(state.day),
    transact: core > 1e-9,
    totalCoreAmount: core,
    organicAmount: roundMoney(action.organicRevenue + action.organicExpense),
    transactions,
    organicTransactions,
    blocked,
    bankSummary: bankDaySummary(
      scenario,
      offer.coreDemandZar,
      feasibleCoreDemand ?? offer.coreDemandZar,
      action.coreThroughput,
      transactions,
      organicTransactions,
      blocked,
    ),
  };
}

export function idleActionPlan(state: SimState, scenario: Scenario, organicAmount = 0): DailyActionPlan {
  const offer = resolveExogenousOffer(state, scenario);
  return {
    date: weekdayName(state.day),
    transact: false,
    totalCoreAmount: 0,
    organicAmount: roundMoney(organicAmount),
    transactions: [],
    organicTransactions: [],
    blocked: [],
    bankSummary: bankDaySummary(scenario, offer.coreDemandZar, offer.coreDemandZar, 0, [], [], []),
  };
}
