import { recordDecline } from "../model/bankRules";
import { roundMoney } from "../model/math";
import { cloneState } from "../model/state";
import type { CoreTicket, SimState } from "../model/types";
import { identitiesFromScenario } from "./identities";
import { formatInstitutionLabel, formatRailLabel } from "./labels";
import { prospectiveScenario } from "./runDay";
import type {
  ProspectiveBranch,
  ProspectiveExhaustionNote,
  ProspectiveOutcomeKind,
  ProspectivePathResidual,
  ProspectiveProposedAction,
  ProspectiveRoute,
} from "./types";
import { PROSPECTIVE_HORIZON_DAYS } from "./types";

export interface ResolvedRail {
  posId: string;
  cardId: string | null;
  railLabel: string;
  acquiringLabel: string | null;
  issuingLabel: string | null;
  cardName: string | null;
}

export function parseOutcomeAction(
  prompt: string,
  completedThroughDay: number,
): ProspectiveProposedAction | null {
  if (completedThroughDay <= 0) return null;
  const outcome = outcomeKind(prompt);
  if (!outcome) return null;
  const rail = parseRailQuery(prompt);
  if (!rail && outcome !== "unpaid") return null;
  const namedDay = prompt.match(/\bday\s+(\d+)\b/i);
  const day = namedDay ? Number(namedDay[1]) : completedThroughDay;
  if (!Number.isFinite(day) || day < 1) return null;
  return {
    type: "report_outcome",
    expectedDay: day,
    amountZar: parseOutcomeAmount(prompt) ?? undefined,
    outcome,
    rail: rail ?? undefined,
  };
}

export function outcomeKind(prompt: string): ProspectiveOutcomeKind | null {
  if (/\b(back up|unfrozen|is up again|live again|clear(?:ed)? the freeze|no longer frozen)\b/i.test(prompt)) {
    return "rail_up";
  }
  if (/\b(froze|frozen|freeze|under review|went down|took (?:it )?down)\b/i.test(prompt)) return "freeze";
  if (/\b(declin(?:ed|e)|didn'?t go through|did not go through|was refused)\b/i.test(prompt)) return "decline";
  if (/\b(delay(?:ed)?|still in flight|hasn'?t settled|has not settled|settlement delay)\b/i.test(prompt)) {
    return "delay";
  }
  if (/\b(didn'?t land|did not land|didn'?t (?:get )?paid|not paid|unpaid|didn'?t deliver|did not deliver)\b/i.test(prompt)) {
    return "unpaid";
  }
  return null;
}

export function parseRailQuery(prompt: string): string | null {
  const railN = prompt.match(/\brail\s+(\d+)\b/i);
  const bank = prompt.match(/\b(fnb|capitec|bim|bci|vista|standard bank|standard)\b/i);
  if (railN && bank) return `rail ${railN[1]} ${normalizeBank(bank[1]!)}`;
  if (railN) return `rail ${railN[1]}`;
  if (bank) return normalizeBank(bank[1]!);
  return null;
}

function normalizeBank(raw: string): string {
  const value = raw.toLowerCase();
  if (value.startsWith("standard")) return "standard bank";
  return value;
}

function parseOutcomeAmount(prompt: string): number | null {
  const found = [...prompt.matchAll(/\br\s*([\d,]+(?:\.\d+)?)\s*(k)?\b/gi)];
  const last = found.at(-1);
  if (!last?.[1]) return null;
  let amount = Number(last[1].replace(/,/g, ""));
  if (last[2] && amount < 1000) amount *= 1000;
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

export function resolveRail(branch: ProspectiveBranch, query: string | undefined): ResolvedRail | null {
  if (!query) return null;
  const needle = query.toLowerCase();
  const routes = [...(branch.snapshot.days.at(-1)?.routes ?? [])];
  const scored = routes
    .map((route) => ({ route, score: railScore(route, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored[0]) {
    const route = scored[0].route;
    return {
      posId: route.posId,
      cardId: route.cardId,
      railLabel: route.railLabel,
      acquiringLabel: route.acquiringLabel,
      issuingLabel: route.issuingLabel,
      cardName: route.cardName,
    };
  }
  const state = branch.snapshot.endingState;
  if (!state) return null;
  const scenario = prospectiveScenario({ seed: branch.seed, availableZar: branch.availableZar });
  const identities = identitiesFromScenario(scenario, state);
  const universe = [
    ...Object.values(identities.pos).map((pos) => pos.institutionId),
    ...Object.values(identities.cards).map((card) => card.institutionId),
  ].filter((id): id is string => Boolean(id));
  for (const pos of state.pos) {
    const acquiring = formatInstitutionLabel(pos.institutionId ?? identities.pos[pos.id]?.institutionId, universe);
    const label = formatRailLabel(pos.id, acquiring);
    if (railScore({ railLabel: label, acquiringLabel: acquiring, cardName: "", issuingLabel: null, posId: pos.id }, needle) > 0) {
      return {
        posId: pos.id,
        cardId: null,
        railLabel: label,
        acquiringLabel: acquiring,
        issuingLabel: null,
        cardName: null,
      };
    }
  }
  return null;
}

function railScore(route: Pick<ProspectiveRoute, "railLabel" | "acquiringLabel" | "cardName" | "issuingLabel" | "posId">, needle: string): number {
  const hay = [route.railLabel, route.acquiringLabel, route.cardName, route.issuingLabel, route.posId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (hay.includes(needle)) return 3;
  const parts = needle.split(/\s+/).filter(Boolean);
  return parts.every((part) => hay.includes(part)) ? 2 : 0;
}

export function applyOutcome(
  branch: ProspectiveBranch,
  action: ProspectiveProposedAction,
  at: string,
): ProspectiveBranch {
  if (action.type !== "report_outcome" || !action.outcome) {
    throw new Error("that is not a live rail update");
  }
  const rail = resolveRail(branch, action.rail) ?? (action.outcome === "unpaid" ? inferRailFromAmount(branch, action.amountZar) : null);
  if (!rail) throw new Error("name the rail (for example Rail 1 FNB or Capitec).");
  const day = branch.completedThroughDay;
  const state = branch.snapshot.endingState ? cloneState(branch.snapshot.endingState) : null;
  if (!state) throw new Error("start Day 1 before updating the window");
  const residuals = [...(branch.snapshot.residuals ?? [])];
  const notes = [...(branch.snapshot.exhaustionNotes ?? [])];

  if (action.outcome === "freeze" || action.outcome === "rail_up") {
    applyRailAvailability(state, rail.posId, action.outcome === "freeze", day);
  }
  if (action.outcome === "decline" && rail.cardId) {
    const payment = matchRoute(branch, rail, action.amountZar);
    recordDecline(state, rail.cardId, payment?.economicPaymentId ?? `live:${day}:${rail.posId}`);
  }
  if (action.outcome === "decline" || action.outcome === "delay" || action.outcome === "unpaid") {
    const opened = openResidualsFromReport(branch, rail, action.amountZar, day);
    residuals.push(...opened);
  }
  if (action.outcome !== "rail_up") {
    notes.push({
      day,
      kind: action.outcome,
      railLabel: rail.railLabel,
      posId: rail.posId,
      cardId: rail.cardId,
      institutionLabel: rail.acquiringLabel,
      amountZar: action.amountZar ?? matchRoute(branch, rail, action.amountZar)?.amountZar ?? null,
      at,
    });
  }

  return {
    ...branch,
    snapshot: {
      ...branch.snapshot,
      endingState: state,
      residuals,
      exhaustionNotes: notes,
      pendingConfirm: null,
    },
    updatedAt: at,
  };
}

function applyRailAvailability(state: SimState, posId: string, freeze: boolean, day: number): void {
  for (const pos of state.pos) {
    if (pos.id !== posId) continue;
    if (freeze) {
      pos.downUntilDay = day + PROSPECTIVE_HORIZON_DAYS;
      pos.interruptionCount += 1;
      pos.cleanHistoryDays = 0;
    } else {
      pos.downUntilDay = null;
      pos.frozenCapital = 0;
    }
  }
}

function inferRailFromAmount(branch: ProspectiveBranch, amountZar?: number): ResolvedRail | null {
  const routes = branch.snapshot.days.at(-1)?.routes ?? [];
  const match = amountZar
    ? routes.find((route) => Math.abs(route.amountZar - amountZar) < 0.02)
    : routes.at(-1);
  if (!match) return null;
  return {
    posId: match.posId,
    cardId: match.cardId,
    railLabel: match.railLabel,
    acquiringLabel: match.acquiringLabel,
    issuingLabel: match.issuingLabel,
    cardName: match.cardName,
  };
}

function matchRoute(
  branch: ProspectiveBranch,
  rail: ResolvedRail,
  amountZar?: number,
): ProspectiveRoute | undefined {
  const routes = (branch.snapshot.days.at(-1)?.routes ?? []).filter((route) => route.posId === rail.posId);
  if (amountZar) return routes.find((route) => Math.abs(route.amountZar - amountZar) < 0.02) ?? routes[0];
  return routes[0];
}

function openResidualsFromReport(
  branch: ProspectiveBranch,
  rail: ResolvedRail,
  amountZar: number | undefined,
  day: number,
): ProspectivePathResidual[] {
  const routes = (branch.snapshot.days.at(-1)?.routes ?? []).filter((route) => route.posId === rail.posId);
  const chosen = amountZar
    ? routes.filter((route) => Math.abs(route.amountZar - amountZar) < 0.02)
    : routes;
  const source = chosen.length > 0 ? chosen : amountZar
    ? [
        {
          economicPaymentId: `live:${day}:${rail.posId}`,
          amountZar,
          cardId: rail.cardId ?? "",
          posId: rail.posId,
          cardName: rail.cardName ?? "",
          railLabel: rail.railLabel,
          acquiringLabel: rail.acquiringLabel,
          issuingLabel: rail.issuingLabel,
        } satisfies ProspectiveRoute,
      ]
    : [];
  const existing = new Set((branch.snapshot.residuals ?? []).filter((row) => row.status === "open").map((row) => row.economicPaymentId));
  return source
    .filter((route) => !existing.has(route.economicPaymentId))
    .map((route) => ({
      economicPaymentId: route.economicPaymentId,
      amountZar: route.amountZar,
      originDay: day,
      cardId: route.cardId,
      posId: route.posId,
      cardName: route.cardName,
      railLabel: route.railLabel,
      acquiringLabel: route.acquiringLabel,
      issuingLabel: route.issuingLabel,
      status: "open" as const,
    }));
}

export function residualTickets(branch: ProspectiveBranch): CoreTicket[] {
  return (branch.snapshot.residuals ?? [])
    .filter((row) => row.status === "open")
    .map((row) => ({
      amount: row.amountZar,
      timeMinutes: 9 * 60,
      economicPaymentId: row.economicPaymentId,
      supportingInvoicePresent: true,
    }));
}

export function mergeDayTickets(dayTickets: CoreTicket[], residuals: CoreTicket[]): CoreTicket[] {
  const seen = new Set(residuals.map((ticket) => ticket.economicPaymentId).filter(Boolean));
  return [...residuals, ...dayTickets.filter((ticket) => !ticket.economicPaymentId || !seen.has(ticket.economicPaymentId))];
}

export function reconcileResiduals(
  residuals: ProspectivePathResidual[],
  routes: ProspectiveRoute[],
  day: number,
): ProspectivePathResidual[] {
  return residuals.map((row) => {
    if (row.status !== "open") return row;
    const landed = routes.find((route) => route.economicPaymentId === row.economicPaymentId);
    if (!landed) return row;
    const samePath = landed.posId === row.posId;
    return {
      ...row,
      status: samePath ? "settled" : "rerouted",
      settledDay: day,
      rerouteRailLabel: samePath ? null : landed.railLabel,
    };
  });
}

export function tightnessRanks(branch: ProspectiveBranch): Array<{ label: string; score: number; side: "within" | "across" }> {
  const scores = new Map<string, number>();
  const bump = (label: string | null | undefined, amount: number) => {
    if (!label) return;
    scores.set(label, (scores.get(label) ?? 0) + amount);
  };
  for (const note of branch.snapshot.exhaustionNotes ?? []) {
    bump(note.institutionLabel ?? note.railLabel, note.kind === "freeze" ? 2 : 1);
  }
  for (const row of branch.snapshot.residuals ?? []) {
    if (row.status === "open") bump(row.acquiringLabel ?? row.railLabel, 1);
  }
  const state = branch.snapshot.endingState;
  if (state) {
    const scenario = prospectiveScenario({ seed: branch.seed, availableZar: branch.availableZar });
    const identities = identitiesFromScenario(scenario, state);
    const universe = Object.values(identities.pos)
      .map((pos) => pos.institutionId)
      .filter((id): id is string => Boolean(id));
    for (const pos of state.pos) {
      if (pos.downUntilDay != null && pos.downUntilDay > branch.completedThroughDay) {
        bump(formatInstitutionLabel(pos.institutionId ?? identities.pos[pos.id]?.institutionId, universe), 2);
      }
    }
  }
  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, score], index) => ({ label, score, side: index === 0 ? "across" : "across" }));
}

export function outcomeConfirmCopy(action: ProspectiveProposedAction): string {
  const rail = action.rail ?? "that rail";
  const amount = action.amountZar ? ` (${roundMoney(action.amountZar)} named)` : "";
  switch (action.outcome) {
    case "freeze":
      return `I’ll mark ${rail} frozen from Day ${action.expectedDay}. It won’t take tickets until you say it’s up. Save that into this window?`;
    case "rail_up":
      return `I’ll mark ${rail} back up from Day ${action.expectedDay}. Save that into this window?`;
    case "decline":
      return `I’ll record a decline on ${rail}${amount} and keep that payment as still to deliver. The next day can take the best live path. Save that into this window?`;
    case "delay":
      return `I’ll record a settlement delay on ${rail}${amount}. That is still to deliver; it is not a print cap. Save that into this window?`;
    case "unpaid":
      return `I’ll keep that payment as still to deliver on ${rail}${amount}. Tomorrow I’ll route it on the best live path. Save that into this window?`;
    default:
      return "Say what happened on the rail if you want me to update this window.";
  }
}
