import type { ExpenseTimingDiagnosis, OrganicLedger, Scenario, SimState } from "./types";
import { formatZar } from "./math";

export function emptyOrganicLedger(): OrganicLedger {
  return {
    monthIndex: 0,
    weekIndex: 0,
    lastAccrualDay: 0,
    monthRevenueBudget: 0,
    monthRevenueAllocated: 0,
    monthRevenueRemaining: 0,
    profitLinkedStock: 0,
    weeklyMinimumStock: 0,
    pendingProfitLinked: 0,
    lifetimeProfitLinkedAccrued: 0,
    lifetimeWeeklyMinimumAccrued: 0,
    lifetimeExpenseEntitlement: 0,
    lifetimeOrganicRevenue: 0,
    lifetimeOrganicExpense: 0,
    lastGrossProfit: 0,
    lastProfitLinkedAccrual: 0,
    lastWeeklyMinimumAccrual: 0,
    lastExpenseEntitlementAdded: 0,
  };
}

export function monthIndexForDay(day: number, monthDays: number): number {
  return Math.floor(Math.max(0, day - 1) / Math.max(1, monthDays));
}

export function weekIndexForDay(day: number, weekDays: number): number {
  return Math.floor(Math.max(0, day - 1) / Math.max(1, weekDays));
}

export function daysLeftInPeriod(day: number, periodLength: number): number {
  const len = Math.max(1, periodLength);
  const pos = ((day - 1) % len) + 1;
  return len - pos + 1;
}

function openMonth(ledger: OrganicLedger, scenario: Scenario, monthIndex: number): void {
  ledger.monthIndex = monthIndex;
  ledger.monthRevenueBudget = Math.max(0, scenario.externalOrganicRevenueMonthlyZar);
  ledger.monthRevenueAllocated = 0;
  ledger.monthRevenueRemaining = ledger.monthRevenueBudget;
}

/**
 * Available expense budget is the max of the two entitlements, not the sum,
 * so the weekly floor is a minimum accrual rate rather than extra spend on
 * top of profit-linked opex.
 */
export function expenseBudgetAvailable(ledger: OrganicLedger): number {
  return Math.max(0, Math.max(ledger.profitLinkedStock, ledger.weeklyMinimumStock));
}

export function createOrganicLedger(scenario: Scenario, day = 1): OrganicLedger {
  const ledger = emptyOrganicLedger();
  openMonth(ledger, scenario, monthIndexForDay(day, scenario.organicMonthLengthDays));
  ledger.weekIndex = weekIndexForDay(day, scenario.organicWeekLengthDays);
  return ledger;
}

function accrueDayStart(ledger: OrganicLedger, scenario: Scenario, day: number): void {
  if (ledger.lastAccrualDay === day) return;
  const before = expenseBudgetAvailable(ledger);
  const released = Math.max(0, ledger.pendingProfitLinked);
  ledger.profitLinkedStock += released;
  ledger.lifetimeProfitLinkedAccrued += released;
  ledger.lastProfitLinkedAccrual = released;
  ledger.pendingProfitLinked = 0;

  const weekLen = Math.max(1, scenario.organicWeekLengthDays);
  const weeklyAdd = Math.max(0, scenario.weeklyExpenseFloorZar) / weekLen;
  ledger.weeklyMinimumStock += weeklyAdd;
  ledger.lifetimeWeeklyMinimumAccrued += weeklyAdd;
  ledger.lastWeeklyMinimumAccrual = weeklyAdd;

  const after = expenseBudgetAvailable(ledger);
  const added = Math.max(0, after - before);
  ledger.lastExpenseEntitlementAdded = added;
  ledger.lifetimeExpenseEntitlement += added;
  ledger.lastAccrualDay = day;
}

/**
 * Period rollover. Unused monthly revenue expires at month-end.
 * Expense stocks roll forward with no expiry and no silent cap.
 * Gross profit earned on day t becomes profit-linked entitlement on day t+1.
 */
export function syncOrganicPeriod(state: SimState, scenario: Scenario): void {
  const month = monthIndexForDay(state.day, scenario.organicMonthLengthDays);
  const week = weekIndexForDay(state.day, scenario.organicWeekLengthDays);
  if (month !== state.organic.monthIndex) {
    openMonth(state.organic, scenario, month);
  }
  state.organic.weekIndex = week;
  accrueDayStart(state.organic, scenario, state.day);
}

export interface OrganicOffer {
  revenue: number;
  expense: number;
  expenseFloor: number;
  profitLinked: number;
  monthRevenueRemaining: number;
  weekExpenseRemaining: number;
  profitLinkedRemaining: number;
  expenseBudgetAvailable: number;
  scheduledExpense: number;
  weeklyMinimumAccrual: number;
  profitLinkedAccrual: number;
  expenseEntitlementAdded: number;
}

/**
 * Lumpy spend from the opening stock: fire one weekly-floor-sized lump when
 * the available entitlement covers it. Unused stock stays on the ledger.
 */
function thresholdSpend(available: number, scenario: Scenario): number {
  const lump = Math.max(0, scenario.weeklyExpenseFloorZar);
  if (lump <= 1e-9 || available + 1e-9 < lump) return 0;
  return Math.min(available, lump);
}

/**
 * Most days, spend the daily floor rate plus a 1/14 drain of excess stock.
 * Never spends more than the opening entitlement.
 */
function distributedSpend(available: number, scenario: Scenario): number {
  if (available <= 1e-9) return 0;
  const weekLen = Math.max(1, scenario.organicWeekLengthDays);
  const dailyFloor = Math.max(0, scenario.weeklyExpenseFloorZar) / weekLen;
  const excess = Math.max(0, available - dailyFloor);
  return Math.min(available, dailyFloor + excess / 14);
}

/**
 * Recurring (weekdays 0–4), periodic (day 5 of week), occasional (every 14th day).
 * Amounts are fractions of the weekly floor plus a slow drain of leftover stock,
 * so 180-day totals stay inside the same entitlement.
 */
function mixedCadenceSpend(available: number, scenario: Scenario, day: number): number {
  if (available <= 1e-9) return 0;
  const W = Math.max(0, scenario.weeklyExpenseFloorZar);
  const weekLen = Math.max(1, scenario.organicWeekLengthDays);
  const wp = (Math.max(1, day) - 1) % weekLen;
  let fractionOfW = 0;
  let fractionOfStock = 0;
  if (wp < Math.max(1, weekLen - 2)) {
    fractionOfW = 0.5 / weekLen;
    fractionOfStock = 1 / 21;
  } else if (wp === weekLen - 2) {
    fractionOfW = 0.4;
    fractionOfStock = 1 / 10;
  } else {
    fractionOfW = 0;
    fractionOfStock = 1 / 30;
  }
  if (day % 14 === 0) {
    fractionOfW += 0.5;
    fractionOfStock += 1 / 8;
  }
  return Math.min(available, fractionOfW * W + fractionOfStock * available);
}

export function scheduledOrganicExpense(state: SimState, scenario: Scenario): number {
  const available = expenseBudgetAvailable(state.organic);
  switch (scenario.expenseTimingPolicy) {
    case "distributed":
      return distributedSpend(available, scenario);
    case "mixed":
      return mixedCadenceSpend(available, scenario, state.day);
    default:
      return thresholdSpend(available, scenario);
  }
}

export function emptyExpenseDiagnosis(): ExpenseTimingDiagnosis {
  return {
    maxLegitimateSpendAvailableToday: 0,
    scheduledSpend: 0,
    economicallyUsefulAdditionalSpend: 0,
    expenseEntitlementAvailable: 0,
    expenseScheduledToday: 0,
    expenseDeferred: 0,
    marginalValueOfAdditionalOrganicSpendToday: 0,
    bringForwardUpToZar: 0,
    guidance: "Do not accelerate additional expenditure today.",
  };
}

export function formatExpenseGuidance(diagnosis: ExpenseTimingDiagnosis): string {
  if (diagnosis.maxLegitimateSpendAvailableToday <= 1e-9) {
    return "No genuine expense entitlement is available today.";
  }
  if (diagnosis.economicallyUsefulAdditionalSpend <= 1) {
    return `Scheduled organic expense: ${formatZar(diagnosis.scheduledSpend)}. Do not accelerate additional expenditure today.`;
  }
  return `Scheduled organic expense: ${formatZar(diagnosis.scheduledSpend)}. Additional genuine expenditure worth bringing forward: up to ${formatZar(diagnosis.economicallyUsefulAdditionalSpend)}.`;
}

export function organicOffer(state: SimState, scenario: Scenario): OrganicOffer {
  const daysLeftMonth = daysLeftInPeriod(state.day, scenario.organicMonthLengthDays);
  const revenue = state.organic.monthRevenueRemaining / daysLeftMonth;
  const available = expenseBudgetAvailable(state.organic);
  const scheduled = scheduledOrganicExpense(state, scenario);
  return {
    revenue: Math.max(0, revenue),
    expense: scheduled,
    expenseFloor: state.organic.lastWeeklyMinimumAccrual,
    profitLinked: state.organic.lastProfitLinkedAccrual,
    monthRevenueRemaining: state.organic.monthRevenueRemaining,
    weekExpenseRemaining: state.organic.weeklyMinimumStock,
    profitLinkedRemaining: state.organic.profitLinkedStock,
    expenseBudgetAvailable: available,
    scheduledExpense: scheduled,
    weeklyMinimumAccrual: state.organic.lastWeeklyMinimumAccrual,
    profitLinkedAccrual: state.organic.lastProfitLinkedAccrual,
    expenseEntitlementAdded: state.organic.lastExpenseEntitlementAdded,
  };
}

export function consumeOrganic(state: SimState, revenue: number, expense: number): void {
  const r = Math.min(Math.max(0, revenue), state.organic.monthRevenueRemaining);
  state.organic.monthRevenueRemaining -= r;
  state.organic.monthRevenueAllocated += r;
  state.organic.lifetimeOrganicRevenue += r;

  const available = expenseBudgetAvailable(state.organic);
  const e = Math.min(Math.max(0, expense), available);
  state.organic.profitLinkedStock = Math.max(0, state.organic.profitLinkedStock - e);
  state.organic.weeklyMinimumStock = Math.max(0, state.organic.weeklyMinimumStock - e);
  state.organic.lifetimeOrganicExpense += e;
}

/**
 * Record today's gross profit as pending profit-linked entitlement.
 * It becomes available on the next calendar day (no same-day circularity).
 */
export function accrueProfitLinkedFromGrossProfit(
  state: SimState,
  scenario: Scenario,
  grossProfit: number,
): void {
  const gp = Math.max(0, grossProfit);
  state.organic.lastGrossProfit = gp;
  state.organic.pendingProfitLinked += gp * Math.max(0, scenario.monthlyProfitLinkedExpenseRate);
}

export function accrueMonthGrossProfit(
  state: SimState,
  scenario: Scenario,
  grossProfit: number,
): void {
  accrueProfitLinkedFromGrossProfit(state, scenario, grossProfit);
}

export function clampOrganicToOffer(
  state: SimState,
  scenario: Scenario,
  revenue: number,
  expense: number,
): { organicRevenue: number; organicExpense: number } {
  const offer = organicOffer(state, scenario);
  return {
    organicRevenue: Math.min(Math.max(0, revenue), offer.revenue),
    organicExpense: Math.min(Math.max(0, expense), expenseBudgetAvailable(state.organic)),
  };
}

export function disableOrganic(scenario: Scenario): Scenario {
  return {
    ...scenario,
    externalOrganicRevenueMonthlyZar: 0,
    weeklyExpenseFloorZar: 0,
    monthlyProfitLinkedExpenseRate: 0,
  };
}

export function organicExpenseRemaining(state: SimState): number {
  return expenseBudgetAvailable(state.organic);
}
