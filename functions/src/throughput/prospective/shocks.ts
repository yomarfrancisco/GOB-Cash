import { rebuildRemainingBook } from "../model/prospectiveBook";
import { roundMoney } from "../model/math";
import { mergeDayTickets, residualTickets } from "./outcomes";
import { prospectiveScenario, runProspectiveDay, ticketsWithinPrintCap } from "./runDay";
import { jsonClone } from "./snapshot";
import {
  horizonOf,
  nextDayAfter,
  type ProspectiveBranch,
  type ProspectiveDayPreview,
  type ProspectiveProposedAction,
  type ProspectiveShock,
  type ProspectiveSnapshot,
} from "./types";

export function previewNextDay(branch: ProspectiveBranch): ProspectiveDayPreview | null {
  const day = nextDayAfter(branch.completedThroughDay, horizonOf(branch));
  if (day == null) return null;
  const shock = matchingPending(branch, day);
  const availableZar = shock?.kind === "capital" ? shock.amountZar : branch.availableZar;
  const tickets = ticketsForShock(branch, day, shock, availableZar);
  const horizonDays = horizonOf(branch)
  const ran = runProspectiveDay({
    day,
    availableZar,
    tickets,
    seed: branch.seed,
    previousState: branch.snapshot.endingState,
    maxPrintZar: shock?.kind === "print" ? shock.amountZar : undefined,
    horizonDays,
  });
  return { day, recommendedZar: ran.record.recommendedZar, availableZar };
}

export function matchingPending(branch: ProspectiveBranch, day: number): ProspectiveShock | null {
  const pending = branch.snapshot.pendingShock;
  if (!pending || pending.day !== day) return null;
  return pending;
}

export function shockDayAllowed(
  completedThroughDay: number,
  expectedDay: number,
  horizonDays?: number
): boolean {
  if (expectedDay === completedThroughDay && completedThroughDay > 0) return true;
  return nextDayAfter(completedThroughDay, horizonDays) === expectedDay;
}

export function shockFromAction(
  action: ProspectiveProposedAction,
  at: string,
  rewind: boolean,
): ProspectiveShock | null {
  if (action.type === "cap_day_print" || action.type === "raise_day_print") {
    if (!(action.amountZar && action.amountZar > 0)) return null;
    return {
      kind: "print",
      printMode: action.type === "raise_day_print" ? "raise" : "cap",
      day: action.expectedDay,
      amountZar: roundMoney(action.amountZar),
      at,
      rewind,
    };
  }
  if (action.type === "set_window_capital") {
    if (!(action.amountZar && action.amountZar > 0)) return null;
    return { kind: "capital", day: action.expectedDay, amountZar: roundMoney(action.amountZar), at, rewind };
  }
  return null;
}

export function applyPendingToRun(branch: ProspectiveBranch, day: number): {
  availableZar: number;
  tickets: ReturnType<typeof ticketsWithinPrintCap>;
  maxPrintZar?: number;
} {
  const shock = matchingPending(branch, day);
  const availableZar = shock?.kind === "capital" ? shock.amountZar : branch.availableZar;
  return {
    availableZar,
    tickets: ticketsForShock(branch, day, shock, availableZar),
    maxPrintZar: shock?.kind === "print" ? shock.amountZar : undefined,
  };
}

/** Print cap keeps this day's tickets. A print raise larger than the day's book may rebuild from that day. */
export function prepareRewind(
  branch: ProspectiveBranch,
  shock: ProspectiveShock,
  startAvailable: number,
): {
  availableZar: number;
  tickets: ReturnType<typeof ticketsWithinPrintCap>;
  book: ProspectiveBranch["snapshot"]["book"];
} {
  const availableZar = shock.kind === "capital" ? shock.amountZar : startAvailable;
  if (shock.kind === "capital") {
    const book = withRebuiltRemaining(branch, shock.day, availableZar);
    return { availableZar, tickets: mergeDayTickets(book[shock.day] ?? [], residualTickets(branch)), book };
  }
  const current = branch.snapshot.book[shock.day] ?? [];
  const currentSum = current.reduce((sum, ticket) => sum + ticket.amount, 0);
  if (shock.printMode === "raise" && shock.amountZar > currentSum + 1e-9) {
    const book = withRebuiltRemaining(branch, shock.day, Math.max(availableZar, shock.amountZar));
    return {
      availableZar,
      tickets: mergeDayTickets(ticketsWithinPrintCap(book[shock.day] ?? [], shock.amountZar), residualTickets(branch)),
      book,
    };
  }
  return {
    availableZar,
    tickets: mergeDayTickets(ticketsWithinPrintCap(current, shock.amountZar), residualTickets(branch)),
    book: branch.snapshot.book,
  };
}

export function pruneLiveOverlay(branch: ProspectiveBranch, fromDay: number): ProspectiveBranch {
  return {
    ...branch,
    snapshot: {
      ...branch.snapshot,
      residuals: (branch.snapshot.residuals ?? []).filter((row) => row.originDay < fromDay),
      exhaustionNotes: (branch.snapshot.exhaustionNotes ?? []).filter((note) => note.day < fromDay),
    },
  };
}

function ticketsForShock(
  branch: ProspectiveBranch,
  day: number,
  shock: ProspectiveShock | null,
  availableZar: number,
) {
  let book = branch.snapshot.book;
  if (shock?.kind === "print" && shock.amountZar > availableZar) {
    // Cannot print more than stock; still try the day's tickets under the stock cap.
    return mergeDayTickets(ticketsWithinPrintCap(book[day] ?? [], availableZar), residualTickets(branch));
  }
  if (shock?.kind === "print") {
    const current = book[day] ?? [];
    const currentSum = current.reduce((sum, ticket) => sum + ticket.amount, 0);
    if (shock.printMode === "raise" && shock.amountZar > currentSum + 1e-9) {
      book = rebuildRemainingBook({
        scenario: prospectiveScenario({
          seed: branch.seed,
          availableZar: Math.max(availableZar, shock.amountZar),
          horizonDays: horizonOf(branch),
        }),
        availableZar: Math.max(availableZar, shock.amountZar),
        horizonDays: horizonOf(branch),
        fromDay: day,
        existing: book,
      });
    }
    return mergeDayTickets(ticketsWithinPrintCap(book[day] ?? [], shock.amountZar), residualTickets(branch));
  }
  return mergeDayTickets(book[day] ?? [], residualTickets(branch));
}

export function withRebuiltRemaining(
  branch: ProspectiveBranch,
  fromDay: number,
  availableZar: number,
): ProspectiveBranch["snapshot"]["book"] {
  const horizonDays = horizonOf(branch)
  return rebuildRemainingBook({
    scenario: prospectiveScenario({ seed: branch.seed, availableZar, horizonDays }),
    availableZar,
    horizonDays,
    fromDay,
    existing: branch.snapshot.book,
  });
}

export function snapshotAfterDayRun(
  branch: ProspectiveBranch,
  days: ProspectiveSnapshot["days"],
  endingState: ProspectiveSnapshot["endingState"],
  priorEndingState: ProspectiveSnapshot["endingState"],
  extra: Partial<ProspectiveSnapshot> = {},
): ProspectiveSnapshot {
  return jsonClone({
    ...branch.snapshot,
    endingState,
    priorEndingState,
    days,
    totals: {
      offeredZar: branch.openingAmountZar,
      settledZar: roundMoney(days.reduce((sum, day) => sum + day.settledZar, 0)),
      considerationMzn: branch.snapshot.totals.considerationMzn,
      marginRetainedZar: roundMoney(days.reduce((sum, day) => sum + day.settledZar, 0) * 0.1),
      outstandingZar: roundMoney(days.at(-1)?.availableAfterZar ?? branch.openingAmountZar),
      reviews: [...new Set(days.flatMap((day) => day.reviews))],
    },
    pendingShock: null,
    pendingConfirm: null,
    ...extra,
  });
}
