import { isOperatingWeekday } from "./demand";
import type { AllocationPlan, Resource, Scenario, SimState } from "./types";

function keyOf(cardId: string, posId: string): string {
  return `${cardId}|${posId}`;
}

export function targetCardCount(throughput: number, scenario: Scenario): number {
  if (throughput <= 1e-9) return 0;
  if (throughput < scenario.coverThinThroughputZar) return 2;
  if (throughput < scenario.coverFatThroughputZar) return 3;
  return 4;
}

export function bannedPairKeys(state: SimState): Set<string> {
  return new Set(state.lastOperatingPairKeys ?? []);
}

export function lastCoverSignature(state: SimState): string {
  return state.lastOperatingCoverSig ?? "";
}

export function isCardRested(card: Resource, scenario: Scenario): boolean {
  return (card.consecutiveOperatingActiveDays ?? 0) >= Math.max(1, scenario.coverMaxConsecutiveOperatingDays);
}

export function eligibleCards(cards: Resource[], scenario: Scenario): Resource[] {
  return cards.filter((c) => !isCardRested(c, scenario));
}

export function noteOperatingAllocation(state: SimState, plan: AllocationPlan): void {
  if (!isOperatingWeekday(state.day)) return;
  const used = plan.pairs.filter((p) => p.amount > 1e-9);
  const usedCards = new Set(used.map((p) => p.cardId));
  if (used.length === 0) {
    for (const card of state.cards) card.consecutiveOperatingActiveDays = 0;
    return;
  }
  const keys = used.map((p) => keyOf(p.cardId, p.posId)).sort();
  state.lastOperatingPairKeys = keys;
  state.lastOperatingCoverSig = keys.join(",");
  for (const card of state.cards) {
    card.consecutiveOperatingActiveDays = usedCards.has(card.id)
      ? (card.consecutiveOperatingActiveDays ?? 0) + 1
      : 0;
  }
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) {
      acc.push(items[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function roundRobinKeys(cards: Resource[], pos: Resource[]): Set<string> {
  if (cards.length === 0 || pos.length === 0) return new Set();
  return new Set(cards.map((card, i) => keyOf(card.id, pos[i % pos.length]!.id)));
}

function matchingKeys(cards: Resource[], pos: Resource[]): Set<string> {
  const n = Math.min(cards.length, pos.length);
  return new Set(Array.from({ length: n }, (_, i) => keyOf(cards[i]!.id, pos[i]!.id)));
}

function coverUsesAllCards(keys: Set<string>, cards: Resource[]): boolean {
  const used = new Set([...keys].map((k) => k.split("|")[0]));
  return cards.every((c) => used.has(c.id));
}

function dropBanned(keys: Set<string>, banned: Set<string>): Set<string> {
  return new Set([...keys].filter((k) => !banned.has(k)));
}

function keysSignature(keys: Set<string>): string {
  return [...keys].sort().join(",");
}

function coversForCardSet(cards: Resource[], pos: Resource[], banned: Set<string>, lastSig: string): Set<string>[] {
  const covers: Set<string>[] = [];
  const seen = new Set<string>();
  const push = (raw: Set<string>) => {
    const keys = dropBanned(raw, banned);
    if (!coverUsesAllCards(keys, cards)) return;
    if (keys.size > cards.length + 1) return;
    const sig = keysSignature(keys);
    if (!sig || sig === lastSig || seen.has(sig)) return;
    seen.add(sig);
    covers.push(keys);
  };

  push(roundRobinKeys(cards, pos));
  push(matchingKeys(cards, pos));
  for (let kp = 1; kp <= pos.length; kp++) {
    push(roundRobinKeys(cards, pos.slice(0, kp)));
    push(matchingKeys(cards, pos.slice(0, kp)));
  }
  if (pos.length >= 2) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        push(roundRobinKeys(cards, [pos[i]!, pos[j]!]));
      }
    }
  }
  const legalCartesian = new Set(
    cards.flatMap((c) => pos.map((p) => keyOf(c.id, p.id))).filter((k) => !banned.has(k)),
  );
  push(legalCartesian);
  return covers;
}

export function feasibleCovers(
  state: SimState,
  scenario: Scenario,
  throughput: number,
  cards: Resource[],
  pos: Resource[],
): Set<string>[] {
  if (throughput <= 1e-9 || cards.length === 0 || pos.length === 0) return [];
  const banned = bannedPairKeys(state);
  const lastSig = lastCoverSignature(state);
  const eligible = eligibleCards(cards, scenario);
  const wanted = targetCardCount(throughput, scenario);
  const nStar = Math.min(Math.max(2, wanted), eligible.length);
  const tryNs = [...new Set([nStar, nStar - 1, nStar + 1, Math.min(4, eligible.length)].filter((n) => n >= 2 && n <= eligible.length))];

  const out: Set<string>[] = [];
  const seen = new Set<string>();
  for (const n of tryNs) {
    for (const subset of combinations(eligible, n)) {
      for (const keys of coversForCardSet(subset, pos, banned, lastSig)) {
        const sig = keysSignature(keys);
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(keys);
      }
    }
    if (out.length > 0 && n === nStar) break;
  }
  if (out.length > 0) return out;

  const loosened = eligible.length > 0 ? eligible : cards;
  for (const n of [Math.min(2, loosened.length), Math.min(3, loosened.length), Math.min(4, loosened.length)]) {
    if (n < 1) continue;
    for (const subset of combinations(loosened, n)) {
      for (const keys of coversForCardSet(subset, pos, new Set(), "")) {
        const sig = keysSignature(keys);
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(keys);
      }
    }
    if (out.length > 0) break;
  }
  return out;
}

export function legalOrganicKeys(
  state: SimState,
  scenario: Scenario,
  cards: Resource[],
  pos: Resource[],
  preferKeys: Set<string>,
): Set<string> {
  if (!scenario.coverMixEnabled) return preferKeys;
  const banned = bannedPairKeys(state);
  const legal = new Set<string>();
  for (const card of eligibleCards(cards, scenario)) {
    for (const device of pos) {
      const key = keyOf(card.id, device.id);
      if (!banned.has(key)) legal.add(key);
    }
  }
  const preferredLegal = new Set([...preferKeys].filter((k) => legal.has(k)));
  if (preferredLegal.size > 0) return preferredLegal;
  return legal;
}
