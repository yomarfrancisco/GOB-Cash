import { withTicketIdentity } from "./bankRules";
import { drawTicketSize, isOperatingWeekday, streamRng } from "./demand";
import { roundMoney, sum } from "./math";
import type { CoreTicket, Scenario } from "./types";

/** Same retained-margin headroom the desk uses (10% of confirmed settled ZAR). */
export const ABSORBING_BOOK_HEADROOM = 0.1;

export const PROSPECTIVE_PAYMENT_PREFIX = "pro";

export type ProspectiveBook = Record<number, CoreTicket[]>;

/**
 * Whole-payment book sized to absorb `availableZar` plus retained-margin headroom.
 * Weekends are empty. Deterministic in (scenario.rngSeed, availableZar).
 */
export function buildAbsorbingPaymentBook(input: {
  scenario: Scenario;
  availableZar: number;
  horizonDays: number;
  startDay?: number;
}): ProspectiveBook {
  const horizon = Math.max(1, input.horizonDays);
  const startDay = Math.max(1, input.startDay ?? 1);
  const target = roundMoney(Math.max(0, input.availableZar) * (1 + ABSORBING_BOOK_HEADROOM));
  const book: ProspectiveBook = {};
  for (let day = 1; day <= horizon; day += 1) book[day] = [];
  if (!(target > 0)) return book;

  const weekdays = Array.from({ length: horizon }, (_, i) => i + 1).filter(
    (day) => day >= startDay && isOperatingWeekday(day),
  );
  const rng = streamRng(input.scenario, 0, `prospective-book:${target}:${startDay}`);
  let filled = 0;
  let index = 0;
  while (filled < target - 1e-9 && index < 2_000 && weekdays.length > 0) {
    const day = weekdays[index % weekdays.length]!;
    const amount = drawTicketSize(rng, input.scenario);
    const tickets = book[day]!;
    tickets.push({
      amount,
      timeMinutes: 9 * 60 + ((tickets.length * 17) % (8 * 60)),
      economicPaymentId: `${PROSPECTIVE_PAYMENT_PREFIX}:${day}:${tickets.length + 1}`,
      supportingInvoicePresent: true,
    });
    filled = roundMoney(filled + amount);
    index += 1;
  }
  for (const day of weekdays) {
    book[day] = withTicketIdentity(
      (book[day] ?? []).sort((a, b) => a.timeMinutes - b.timeMinutes || a.amount - b.amount),
      day,
    );
  }
  return book;
}

/** Keep days before `fromDay`; replace the rest with a book sized to the new stock. */
export function rebuildRemainingBook(input: {
  scenario: Scenario;
  availableZar: number;
  horizonDays: number;
  fromDay: number;
  existing: ProspectiveBook;
}): ProspectiveBook {
  const fromDay = Math.max(1, input.fromDay);
  const rebuilt = buildAbsorbingPaymentBook({
    scenario: input.scenario,
    availableZar: input.availableZar,
    horizonDays: input.horizonDays,
    startDay: fromDay,
  });
  const next: ProspectiveBook = {};
  for (let day = 1; day <= input.horizonDays; day += 1) {
    next[day] = day < fromDay ? [...(input.existing[day] ?? [])] : [...(rebuilt[day] ?? [])];
  }
  return next;
}

export function bookTotalZar(book: ProspectiveBook): number {
  return roundMoney(sum(Object.values(book).flatMap((tickets) => tickets.map((ticket) => ticket.amount))));
}
