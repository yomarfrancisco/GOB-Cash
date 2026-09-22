import { selectTickets } from "./demand";
import { roundMoney, sum } from "./math";
import { upResources } from "./state";
import type { CycleMandateUtilization } from "./sourcingTypes";
import type { CoreTicket, ExogenousOffer, Resource, SimState } from "./types";

export type ObligationPriority = "time_order_skip_oversized";

export interface AuthorityClip {
  demandRemainingZar: number;
  supplyRemainingZar: number;
  allowedCardIds: string[] | null;
  allowedPosIds: string[] | null;
  allowedBeneficiaryIds: string[] | null;
  obligationPriority: ObligationPriority;
}

export function remainingPair(
  demand: CycleMandateUtilization,
  supply: CycleMandateUtilization,
): { demandRemainingZar: number; supplyRemainingZar: number } {
  return {
    demandRemainingZar: demand.remainingAuthorizedZar,
    supplyRemainingZar: supply.remainingAuthorizedZar,
  };
}

function allowedSet(ids: string[] | null | undefined): Set<string> | null {
  if (!ids || ids.length === 0) return null;
  return new Set(ids);
}

export function cardInAllowList(card: Resource, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  return allowed.has(card.id) || allowed.has(card.name);
}

export function compatibleIntersection(input: {
  state: SimState;
  allowedCardIds: string[] | null;
  allowedPosIds: string[] | null;
}): { cards: Resource[]; pos: Resource[]; compatible: boolean } {
  const cardAllow = allowedSet(input.allowedCardIds);
  const posAllow = allowedSet(input.allowedPosIds);
  const cards = upResources(input.state.cards, input.state.day).filter((c) => cardInAllowList(c, cardAllow));
  const pos = upResources(input.state.pos, input.state.day).filter(
    (p) => !posAllow || posAllow.has(p.id),
  );
  return { cards, pos, compatible: cards.length > 0 && pos.length > 0 };
}

function beneficiaryAllowed(ticket: CoreTicket, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  const id = ticket.beneficiaryId;
  if (id === undefined || id === null || id === "") return true;
  return allowed.has(id);
}

/**
 * Prefix-stop (rejected): walk in order and halt at the first ticket that does not fit.
 * Kept here only so tests can prove Slice 0 does not use it.
 */
export function prefixStopSelect(tickets: CoreTicket[], budgetZar: number): CoreTicket[] {
  const cap = Math.max(0, budgetZar);
  const chosen: CoreTicket[] = [];
  let used = 0;
  for (const ticket of tickets) {
    if (used + ticket.amount > cap + 1e-9) break;
    chosen.push(ticket);
    used += ticket.amount;
  }
  return chosen;
}

/**
 * Constrain the packer's candidate ticket set: whole tickets only, skip oversized
 * (time-order greedy). Unselected tickets stay on the offer so event-based backlog
 * can still see them. coreDemandZar is the authorized subset so volume candidates
 * are prefixes of that subset, not of an oversized blocker.
 */
export function clipOfferToAuthority(offer: ExogenousOffer, clip: AuthorityClip): ExogenousOffer {
  const budget = roundMoney(Math.max(0, Math.min(clip.demandRemainingZar, clip.supplyRemainingZar)));
  const beneficiaries = allowedSet(clip.allowedBeneficiaryIds);
  const eligible = offer.coreTickets.filter((t) => beneficiaryAllowed(t, beneficiaries));
  const blocked = offer.coreTickets.filter((t) => !beneficiaryAllowed(t, beneficiaries));
  const selected = selectTickets(eligible, budget);
  if (
    selected.length === eligible.length &&
    blocked.length === 0 &&
    budget + 1e-9 >= offer.coreDemandZar
  ) {
    return offer;
  }
  const selectedIds = new Set(selected.map((t) => t.economicPaymentId ?? `${t.timeMinutes}:${t.amount}`));
  const remainder = eligible.filter((t) => !selectedIds.has(t.economicPaymentId ?? `${t.timeMinutes}:${t.amount}`));
  const coreTickets = [...selected, ...remainder, ...blocked];
  return {
    ...offer,
    coreTickets,
    coreDemandZar: roundMoney(sum(selected.map((t) => t.amount))),
  };
}

export function assertWholeTickets(tickets: CoreTicket[]): void {
  const seen = new Set<string>();
  for (const ticket of tickets) {
    const id = ticket.economicPaymentId;
    if (!id) continue;
    if (seen.has(id)) {
      throw new Error(`split or duplicate economicPaymentId ${id}`);
    }
    seen.add(id);
  }
}

export function bindClippedOffer(state: SimState, offer: ExogenousOffer): ExogenousOffer {
  assertWholeTickets(offer.coreTickets);
  state.exogenousOffer = offer;
  return offer;
}
