import { cloneScenario } from "./defaults";
import {
  isOperatingWeekday,
  weekdayName,
} from "./demand";
import { quantile, roundMoney, sum } from "./math";
import { simulate } from "./simulation";
import { createInitialState } from "./state";
import type { CalendarEntry, DailyActionPlan, Scenario } from "./types";

export interface WeeklyDayRow {
  day: number;
  weekday: string;
  activity: "Operate" | "No activity";
  amount: number;
  txCount: number;
  cards: string;
  pos: string;
  organic: number;
  idleCapital: number;
  plan: DailyActionPlan;
}

export interface WeeklyPlan {
  weekIndex: number;
  label: string;
  days: WeeklyDayRow[];
  weeklyThroughput: number;
  activeDays: number;
  continuityAdjusted: number;
  grossProfit: number;
}

export interface WeeklyEnsembleSummary {
  paths: number;
  medianWeeklyThroughput: number;
  medianActiveDaysPerWeek: number;
  medianTxPerActiveDay: number;
  medianCardsUsedPerWeek: number;
  medianPosUsedPerWeek: number;
  medianWeeklyGrossProfit: number;
  medianWeeklyContinuityAdjusted: number;
  ticketSizeP10: number;
  ticketSizeP50: number;
  ticketSizeP90: number;
  ticketCount: number;
}

function resourceLabel(id: string, name: string | undefined): string {
  if (name && name.trim()) return name;
  const [kind, n] = id.split("-");
  if (kind === "card") return `Card ${n}`;
  if (kind === "pos") return `POS ${n}`;
  return id;
}

export function weeklyDayRow(entry: CalendarEntry): WeeklyDayRow {
  const plan = entry.actionPlan;
  const cardNames = [
    ...new Set(
      plan.transactions.map((tx) => {
        const card = entry.cardResources.find((c) => c.id === tx.cardId);
        return resourceLabel(tx.cardId, card?.name);
      }),
    ),
  ];
  const posNames = [
    ...new Set(
      plan.transactions.map((tx) => {
        const pos = entry.posResources.find((p) => p.id === tx.posId);
        return resourceLabel(tx.posId, pos?.name);
      }),
    ),
  ];
  return {
    day: entry.day,
    weekday: weekdayName(entry.day).slice(0, 3),
    activity: plan.transact ? "Operate" : "No activity",
    amount: plan.totalCoreAmount,
    txCount: plan.transactions.length,
    cards: plan.transact ? cardNames.join(", ") : "—",
    pos: plan.transact ? posNames.join(", ") : "—",
    organic: plan.organicAmount,
    idleCapital: entry.idleCapital,
    plan,
  };
}

export function weeksFromCalendar(calendar: CalendarEntry[]): WeeklyPlan[] {
  const weeks = new Map<number, CalendarEntry[]>();
  for (const entry of calendar) {
    if (!isOperatingWeekday(entry.day)) continue;
    const weekIndex = Math.floor((entry.day - 1) / 7);
    const list = weeks.get(weekIndex) ?? [];
    list.push(entry);
    weeks.set(weekIndex, list);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekIndex, entries]) => {
      const days = entries.sort((a, b) => a.day - b.day).map(weeklyDayRow);
      return {
        weekIndex,
        label: `Week ${weekIndex + 1}`,
        days,
        weeklyThroughput: roundMoney(sum(days.map((d) => d.amount))),
        activeDays: days.filter((d) => d.activity === "Operate").length,
        continuityAdjusted: roundMoney(sum(entries.map((e) => e.continuityAdjustedEv))),
        grossProfit: roundMoney(sum(entries.map((e) => e.grossProfit))),
      };
    });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

export function runWeeklyEnsemble(scenario: Scenario, paths?: number): WeeklyEnsembleSummary {
  const n = Math.max(1, Math.floor(paths ?? scenario.weeklyEnsemblePaths));
  const weeklyThroughput: number[] = [];
  const activeDays: number[] = [];
  const txPerActive: number[] = [];
  const cardsUsed: number[] = [];
  const posUsed: number[] = [];
  const gross: number[] = [];
  const ca: number[] = [];
  const ticketSizes: number[] = [];

  for (let p = 0; p < n; p++) {
    const run = cloneScenario(scenario);
    run.useLookahead = false;
    run.rngSeed = (scenario.rngSeed + Math.imul(p + 1, 9973)) >>> 0;
    run.horizonDays = Math.max(run.horizonDays, 7);
    const result = simulate(createInitialState(run), run, "optimize", { realizedThroughDay: 7 });
    const week = weeksFromCalendar(result.calendar)[0];
    if (!week) continue;
    weeklyThroughput.push(week.weeklyThroughput);
    activeDays.push(week.activeDays);
    gross.push(week.grossProfit);
    ca.push(week.continuityAdjusted);
    const active = week.days.filter((d) => d.txCount > 0);
    if (active.length > 0) {
      txPerActive.push(sum(active.map((d) => d.txCount)) / active.length);
    }
    const cardSet = new Set<string>();
    const posSet = new Set<string>();
    for (const day of week.days) {
      for (const tx of day.plan.transactions) {
        cardSet.add(tx.cardId);
        posSet.add(tx.posId);
        ticketSizes.push(tx.amount);
      }
    }
    cardsUsed.push(cardSet.size);
    posUsed.push(posSet.size);
  }

  const sortedTickets = [...ticketSizes].sort((a, b) => a - b);
  return {
    paths: n,
    medianWeeklyThroughput: median(weeklyThroughput),
    medianActiveDaysPerWeek: median(activeDays),
    medianTxPerActiveDay: median(txPerActive),
    medianCardsUsedPerWeek: median(cardsUsed),
    medianPosUsedPerWeek: median(posUsed),
    medianWeeklyGrossProfit: median(gross),
    medianWeeklyContinuityAdjusted: median(ca),
    ticketSizeP10: quantile(sortedTickets, 0.1),
    ticketSizeP50: quantile(sortedTickets, 0.5),
    ticketSizeP90: quantile(sortedTickets, 0.9),
    ticketCount: ticketSizes.length,
  };
}
