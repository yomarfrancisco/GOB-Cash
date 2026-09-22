/**
 * Event-based interruption-loss model (lossModel = "eventBased").
 *
 * One state machine is used for realized hits and for the expected-loss projection inside the
 * optimizer:
 *
 *   interruption at T2 (after today's execution, before the next operating day)
 *     → failure domain k ~ π_k                       (MODEL HYPOTHESES)
 *     → target drawn ∝ its share of today's activity   (dependence-weighted, never "largest POS")
 *     → in-flight volume on the affected resources is locked (not f × capital)
 *     → affected resources / pairs are unusable until review end
 *     → every following operating day: executable capacity from eligible unused cards, up POS,
 *       usable pairs and available capital; genuine tickets are packed whole; what cannot be
 *       placed is deferred (δ per operating day) and expires after m operating days (margin lost once)
 *
 * Ticket fates are mutually exclusive: executed as planned | rerouted and executed |
 * deferred then executed | expired. Costs sit on disjoint bases:
 *   margin      → expired tickets            δ         → backlog Rand-days (operating days)
 *   c_reroute   → rerouted tickets           ρ_carry   → locked Rand-days  (calendar days)
 *
 * Loss_k = Σ_days (costs on the hit path − costs on the clean path) until both paths coincide.
 * E[loss | interruption] = Σ_k π_k Loss_k.  The optimizer charges h × that, once.
 */
import { isOperatingWeekday } from "./demand";
import { roundMoney } from "./math";
import { emptyRolling } from "./rolling";
import type {
  BacklogTicket,
  CoreTicket,
  DemandFates,
  EventLossAblation,
  EventLossComponents,
  EventLossDomainRow,
  EventLossSummary,
  InterruptionEvent,
  LedgerTransaction,
  LossDomain,
  LossDomainProbabilities,
  Resource,
  Scenario,
  SimState,
} from "./types";

export const LOSS_DOMAINS: LossDomain[] = ["pair", "card", "pos", "merchant", "institution", "system"];

export const LOSS_DOMAIN_LABELS: Record<LossDomain, string> = {
  pair: "pair-scoped (one card×POS relationship)",
  card: "card-scoped (one card)",
  pos: "POS-scoped (one terminal)",
  merchant: "merchant-scoped (acquiring account: all POS)",
  institution: "account / institution (issuer side: all cards)",
  system: "full system (everything; balance frozen)",
};

export function eventBased(scenario: Scenario): boolean {
  return scenario.lossModel === "eventBased";
}

export function ablation(scenario: Scenario): EventLossAblation {
  return (
    scenario.eventLossAblation ?? {
      backlog: true,
      resourceAwareCapacity: true,
      posFailureDomain: true,
      accountContagion: true,
      operatingDayDistinction: true,
      removeSeverityDoubleCount: true,
    }
  );
}

/** Domain probabilities after the ablation switches, normalised to 1. */
export function effectiveDomainProbabilities(scenario: Scenario): LossDomainProbabilities {
  const p = { ...scenario.lossDomainProbabilities };
  const ab = ablation(scenario);
  if (!ab.posFailureDomain) {
    p.card += p.pair + p.pos;
    p.pair = 0;
    p.pos = 0;
  }
  if (!ab.accountContagion) {
    p.card += p.merchant + p.institution + p.system;
    p.merchant = 0;
    p.institution = 0;
    p.system = 0;
  }
  const total = LOSS_DOMAINS.reduce((a, k) => a + Math.max(0, p[k]), 0);
  if (total <= 1e-12) return { pair: 0, card: 1, pos: 0, merchant: 0, institution: 0, system: 0 };
  for (const k of LOSS_DOMAINS) p[k] = Math.max(0, p[k]) / total;
  return p;
}

/* ------------------------------------------------------------------------------------------
 * Activity dependence and in-flight exposure
 * ------------------------------------------------------------------------------------------ */

export interface ActivityRow {
  cardId: string;
  posId: string;
  amount: number;
}

export interface Dependence {
  total: number;
  cards: Map<string, number>;
  pos: Map<string, number>;
  pairs: Map<string, number>;
}

export function pairKeyOf(cardId: string, posId: string): string {
  return `${cardId}|${posId}`;
}

export function activityDependence(rows: ActivityRow[]): Dependence {
  const cards = new Map<string, number>();
  const pos = new Map<string, number>();
  const pairs = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (r.amount <= 1e-9) continue;
    total += r.amount;
    cards.set(r.cardId, (cards.get(r.cardId) ?? 0) + r.amount);
    pos.set(r.posId, (pos.get(r.posId) ?? 0) + r.amount);
    const key = pairKeyOf(r.cardId, r.posId);
    pairs.set(key, (pairs.get(key) ?? 0) + r.amount);
  }
  return { total, cards, pos, pairs };
}

/** Unsettled (in-flight) volume: ledger rows executed on days (today − lag, today]. */
export function inFlightExposure(
  ledger: LedgerTransaction[],
  today: number,
  lagDays: number,
  keep: (row: LedgerTransaction) => boolean,
): number {
  const from = today - Math.max(1, Math.round(lagDays)) + 1;
  let total = 0;
  for (const row of ledger) {
    if (row.day < from || row.day > today) continue;
    if (keep(row)) total += row.amount;
  }
  return total;
}

export interface EvaluationOpenItems {
  backlogZar: number;
  reviewCount: number;
  frozenCapital: number;
  inFlightZar: number;
  open: boolean;
}

/** True while the evaluation tail still has backlog, an active review, frozen capital, or unsettled volume. */
export function evaluationOpenItems(state: SimState, scenario: Scenario, day: number = state.day): EvaluationOpenItems {
  const backlogZar = roundMoney((state.backlog ?? []).reduce((a, t) => a + t.amount, 0));
  let reviewCount = 0;
  let frozenCapital = 0;
  for (const r of [...state.cards, ...state.pos]) {
    if (r.downUntilDay !== null && r.downUntilDay > day) {
      reviewCount += 1;
      frozenCapital += r.frozenCapital;
    }
  }
  for (const rec of state.pairs) {
    if (rec.downUntilDay !== null && rec.downUntilDay !== undefined && rec.downUntilDay > day) {
      reviewCount += 1;
      frozenCapital += rec.frozenCapital ?? 0;
    }
  }
  const inFlightZar = inFlightExposure(state.bankLedger ?? [], day, scenario.settlementLagDays, () => true);
  return {
    backlogZar,
    reviewCount,
    frozenCapital,
    inFlightZar,
    open: backlogZar > 1e-9 || reviewCount > 0 || frozenCapital > 1e-9 || inFlightZar > 1e-9,
  };
}

/* ------------------------------------------------------------------------------------------
 * Per-POS exposure (severity side)
 * ------------------------------------------------------------------------------------------ */

export interface PosExposure {
  posId: string;
  /** Ledger volume through this terminal in the exposure window. */
  windowVolume: number;
  /** Share of all ledger volume in the window (0 when the window is empty). */
  share: number;
  /** Unsettled volume through this terminal (settlement-lag window). */
  inFlight: number;
  /** Working capital economically exposed to this terminal: scale × share × working. */
  workingCapitalExposure: number;
  /** Capital a review of this terminal would trap: min(working, max(inFlight, workingCapitalExposure)). */
  lockIfReviewed: number;
}

export function posExposureWindowDays(scenario: Scenario): number {
  return Math.max(1, Math.round(scenario.posExposureWindowDays ?? 7));
}

/**
 * Exposure of the working book to each terminal. Uses ledger volume (core + organic) over the
 * exposure window; in-flight is the settlement-lag subset and is not double counted.
 */
export function posExposures(
  ledger: LedgerTransaction[],
  pos: Resource[],
  day: number,
  scenario: Scenario,
  workingCapital: number,
): PosExposure[] {
  const window = posExposureWindowDays(scenario);
  const from = day - window + 1;
  const byPos = new Map<string, number>();
  let total = 0;
  for (const row of ledger) {
    if (row.day < from || row.day > day) continue;
    byPos.set(row.posId, (byPos.get(row.posId) ?? 0) + row.amount);
    total += row.amount;
  }
  const scale = scenario.posExposureLockScale;
  const working = Math.max(0, workingCapital);
  const lag = scenario.settlementLagDays;
  return pos
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => {
      const vol = byPos.get(p.id) ?? 0;
      const share = total > 1e-9 ? vol / total : 0;
      const inFlight = scenario.capitalFrozenDuringReview ? inFlightExposure(ledger, day, lag, (r) => r.posId === p.id) : 0;
      const wce = scale === null || scale === undefined ? 0 : Math.max(0, scale) * share * working;
      return {
        posId: p.id,
        windowVolume: vol,
        share,
        inFlight,
        workingCapitalExposure: wce,
        lockIfReviewed: Math.min(working, Math.max(inFlight, wce)),
      };
    });
}

/* ------------------------------------------------------------------------------------------
 * Domain hit resolution (shared by realized hits and the projection)
 * ------------------------------------------------------------------------------------------ */

export interface DomainHit {
  domain: LossDomain;
  targetIds: string[];
  cardIds: string[];
  posIds: string[];
  pairKeys: string[];
  lockedCapital: number;
  durationDays: number;
  downUntilDay: number;
  /** system domain: the account balance is frozen as well as the in-flight volume. */
  balanceFrozen: boolean;
}

export interface HitContext {
  day: number;
  cards: Resource[];
  pos: Resource[];
  /** Today's executed rows (already on the ledger) plus the ledger for the in-flight window. */
  ledger: LedgerTransaction[];
  todayRows: ActivityRow[];
  deployableCapital: number;
  scenario: Scenario;
}

export function resolveDomainHit(ctx: HitContext, domain: LossDomain, targetId: string | null, durationDays: number): DomainHit {
  const { scenario } = ctx;
  const freeze = scenario.capitalFrozenDuringReview;
  const lag = scenario.settlementLagDays;
  const inFlight = (keep: (row: LedgerTransaction) => boolean) => (freeze ? inFlightExposure(ctx.ledger, ctx.day, lag, keep) : 0);
  const duration = Math.max(1, Math.round(durationDays));
  const downUntilDay = ctx.day + duration;
  const base = { domain, durationDays: duration, downUntilDay, balanceFrozen: false };
  switch (domain) {
    case "pair": {
      const key = targetId ?? "";
      const [cardId, posId] = key.split("|") as [string, string];
      return {
        ...base,
        targetIds: [key],
        cardIds: [],
        posIds: [],
        pairKeys: [key],
        lockedCapital: inFlight((r) => r.cardId === cardId && r.posId === posId),
      };
    }
    case "card": {
      const id = targetId ?? "";
      return { ...base, targetIds: [id], cardIds: [id], posIds: [], pairKeys: [], lockedCapital: inFlight((r) => r.cardId === id) };
    }
    case "pos": {
      const id = targetId ?? "";
      const inF = inFlight((r) => r.posId === id);
      const working = Math.max(0, ctx.deployableCapital);
      const scale = scenario.posExposureLockScale;
      let locked: number;
      if (scale !== null && scale !== undefined && Number.isFinite(scale)) {
        // Exposure-weighted severity: the review traps the capital economically exposed to this
        // terminal. In-flight is a subset of that exposure, not an addition to it.
        const exposure = posExposures(ctx.ledger, ctx.pos, ctx.day, scenario, working).find((e) => e.posId === id);
        locked = exposure ? exposure.lockIfReviewed : Math.min(working, inF);
      } else {
        // Legacy flat lock: in-flight plus a fixed fraction of the working book.
        const frac = Math.min(1, Math.max(0, scenario.posCapitalLockFraction ?? 0));
        locked = Math.min(working, inF + frac * working);
      }
      return {
        ...base,
        targetIds: [id],
        cardIds: [],
        posIds: [id],
        pairKeys: [],
        lockedCapital: locked,
      };
    }
    case "merchant": {
      const ids = ctx.pos.map((p) => p.id);
      return { ...base, targetIds: ids, cardIds: [], posIds: ids, pairKeys: [], lockedCapital: inFlight(() => true) };
    }
    case "institution": {
      const ids = ctx.cards.map((c) => c.id);
      return { ...base, targetIds: ids, cardIds: ids, posIds: [], pairKeys: [], lockedCapital: inFlight(() => true) };
    }
    case "system": {
      const cardIds = ctx.cards.map((c) => c.id);
      const posIds = ctx.pos.map((p) => p.id);
      return {
        ...base,
        targetIds: [...cardIds, ...posIds],
        cardIds,
        posIds,
        pairKeys: [],
        lockedCapital: inFlight(() => true) + (freeze ? Math.max(0, ctx.deployableCapital) : 0),
        balanceFrozen: true,
      };
    }
  }
}

/** Dependence-weighted targets for a domain (weights sum to 1; empty for whole-system domains). */
export function domainTargets(domain: LossDomain, dep: Dependence): Array<{ id: string; weight: number }> {
  const pick = (m: Map<string, number>) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (total <= 1e-9) return [];
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, v]) => ({ id, weight: v / total }));
  };
  if (domain === "pair") return pick(dep.pairs);
  if (domain === "card") return pick(dep.cards);
  if (domain === "pos") return pick(dep.pos);
  return [];
}

/* ------------------------------------------------------------------------------------------
 * Realized application to a SimState (T2: after today's transactions were recorded)
 * ------------------------------------------------------------------------------------------ */

export function applyDomainHitToState(state: SimState, hit: DomainHit): InterruptionEvent {
  const affectedCards = new Set(hit.cardIds);
  const affectedPos = new Set(hit.posIds);
  const affectedPairs = new Set(hit.pairKeys);
  const units = hit.cardIds.length + hit.posIds.length + hit.pairKeys.length;
  const lock = Math.min(Math.max(0, hit.lockedCapital), Math.max(0, state.deployableCapital));
  const lockEach = units > 0 ? lock / units : 0;
  for (const r of [...state.cards, ...state.pos]) {
    if (!affectedCards.has(r.id) && !affectedPos.has(r.id)) continue;
    r.downUntilDay = Math.max(r.downUntilDay ?? 0, hit.downUntilDay);
    r.interruptionCount += 1;
    r.cleanHistoryDays = 0;
    r.frozenCapital += lockEach;
  }
  for (const key of affectedPairs) {
    const [cardId, posId] = key.split("|") as [string, string];
    let rec = state.pairs.find((p) => p.cardId === cardId && p.posId === posId);
    if (!rec) {
      rec = {
        cardId,
        posId,
        firstActiveDay: null,
        lastUsedDay: null,
        lifetimeVolume: 0,
        lifetimeCount: 0,
        activeTradingDays: 0,
        cleanHistoryDays: 0,
        coreVolume: 0,
        organicVolume: 0,
        rolling: emptyRolling(),
      };
      state.pairs.push(rec);
    }
    rec.downUntilDay = Math.max(rec.downUntilDay ?? 0, hit.downUntilDay);
    rec.frozenCapital = (rec.frozenCapital ?? 0) + lockEach;
    rec.cleanHistoryDays = 0;
  }
  for (const pair of state.pairs) {
    if (affectedCards.has(pair.cardId) || affectedPos.has(pair.posId)) pair.cleanHistoryDays = 0;
  }
  state.deployableCapital -= lock;
  state.trappedCapital += lock;
  state.merchantInterruptionCount += 1;
  state.merchantCleanHistoryDays = 0;
  const event: InterruptionEvent = {
    day: state.day,
    domain: hit.domain,
    targetIds: hit.targetIds,
    durationDays: hit.durationDays,
    downUntilDay: hit.downUntilDay,
    lockedCapital: lock,
  };
  if (!state.interruptionEvents) state.interruptionEvents = [];
  state.interruptionEvents.push(event);
  return event;
}

/* ------------------------------------------------------------------------------------------
 * Today's demand fates (the same function updates the state's backlog after execution)
 * ------------------------------------------------------------------------------------------ */

export interface FatesResult {
  fates: DemandFates;
  nextBacklog: BacklogTicket[];
}

export function demandFatesForAction(
  state: SimState,
  scenario: Scenario,
  offerTickets: CoreTicket[],
  executedPaymentIds: Set<string>,
  reroutedPaymentIds: Set<string> = new Set(),
): FatesResult {
  const ab = ablation(scenario);
  const prior = new Map<string, BacklogTicket>();
  for (const t of state.backlog ?? []) prior.set(t.economicPaymentId, t);
  const m = Math.max(1, Math.round(scenario.ticketMaxDeferralOperatingDays));
  const f: DemandFates = {
    arrivalsZar: 0,
    arrivalsCount: 0,
    backlogInZar: 0,
    backlogInCount: 0,
    executedZar: 0,
    executedCount: 0,
    reroutedZar: 0,
    reroutedCount: 0,
    deferredZar: 0,
    deferredCount: 0,
    expiredZar: 0,
    expiredCount: 0,
    backlogEndZar: 0,
    backlogEndCount: 0,
    deferralCostZar: 0,
    expiryCostZar: 0,
    rerouteCostZar: 0,
  };
  const next: BacklogTicket[] = [];
  const operating = isOperatingWeekday(state.day) || !ab.operatingDayDistinction;
  for (const t of offerTickets) {
    const id = t.economicPaymentId ?? "";
    const wasBacklog = prior.get(id);
    if (wasBacklog) {
      f.backlogInZar += t.amount;
      f.backlogInCount += 1;
    } else {
      f.arrivalsZar += t.amount;
      f.arrivalsCount += 1;
    }
    if (executedPaymentIds.has(id)) {
      f.executedZar += t.amount;
      f.executedCount += 1;
      if (reroutedPaymentIds.has(id)) {
        f.reroutedZar += t.amount;
        f.reroutedCount += 1;
      }
      continue;
    }
    if (!ab.backlog) continue; // legacy behaviour: unexecuted demand vanishes without a fate cost
    const deferrals = (wasBacklog?.deferrals ?? 0) + (operating ? 1 : 0);
    if (deferrals >= m) {
      f.expiredZar += t.amount;
      f.expiredCount += 1;
      continue;
    }
    f.deferredZar += t.amount;
    f.deferredCount += 1;
    next.push({
      amount: t.amount,
      timeMinutes: t.timeMinutes,
      economicPaymentId: id,
      invoiceId: t.invoiceId,
      supportingInvoicePresent: t.supportingInvoicePresent ?? true,
      arrivalDay: wasBacklog?.arrivalDay ?? state.day,
      deferrals,
    });
  }
  // Backlog rows not in today's offer (non-operating day, or offer suppressed) carry unchanged.
  const offered = new Set(offerTickets.map((t) => t.economicPaymentId ?? ""));
  for (const t of state.backlog ?? []) {
    if (!offered.has(t.economicPaymentId) && ab.backlog) next.push({ ...t });
  }
  f.backlogEndZar = roundMoney(next.reduce((a, t) => a + t.amount, 0));
  f.backlogEndCount = next.length;
  f.deferralCostZar = operating ? scenario.deferralCostDailyRate * f.backlogEndZar : 0;
  f.expiryCostZar = scenario.margin * f.expiredZar;
  f.rerouteCostZar = scenario.rerouteCostPerTicketZar * f.reroutedCount;
  for (const k of Object.keys(f) as Array<keyof DemandFates>) f[k] = roundMoney(f[k]);
  return { fates: f, nextBacklog: next };
}

/* ------------------------------------------------------------------------------------------
 * Projection: light capacity state machine (same rules, same domain hit, deterministic)
 * ------------------------------------------------------------------------------------------ */

interface LightRes {
  id: string;
  downUntil: number; // up when downUntil <= day
}

interface LightTicket {
  id: string;
  amount: number;
  deferrals: number;
  arrivalDay: number;
}

interface LightState {
  cards: LightRes[];
  pos: LightRes[];
  pairsDown: Map<string, number>;
  capital: number; // deployable before locks
  locked: Array<{ amount: number; releaseDay: number }>;
  backlog: LightTicket[];
  /** ticket id → pair key it executed on */
  assignments: Map<string, string>;
  executedZar: number;
  expiredZar: number;
  backlogZarDays: number;
  reroutedCount: number;
  lockedRandDays: number;
  impairedDays: number;
}

function lightFromState(state: SimState, nextDay: number, backlogAfterToday: BacklogTicket[]): LightState {
  const locked = [
      ...[...state.cards, ...state.pos]
        .filter((r) => r.frozenCapital > 0 && r.downUntilDay !== null && r.downUntilDay > nextDay)
        .map((r) => ({ amount: r.frozenCapital, releaseDay: r.downUntilDay as number })),
      ...state.pairs
        .filter((p) => (p.frozenCapital ?? 0) > 0 && p.downUntilDay !== null && p.downUntilDay !== undefined && p.downUntilDay > nextDay)
        .map((p) => ({ amount: p.frozenCapital as number, releaseDay: p.downUntilDay as number })),
  ];
  return {
    cards: state.cards.map((c) => ({ id: c.id, downUntil: c.downUntilDay ?? 0 })),
    pos: state.pos.map((p) => ({ id: p.id, downUntil: p.downUntilDay ?? 0 })),
    pairsDown: new Map(
      state.pairs
        .filter((p) => p.downUntilDay !== null && p.downUntilDay !== undefined && p.downUntilDay > nextDay)
        .map((p) => [pairKeyOf(p.cardId, p.posId), p.downUntilDay as number]),
    ),
    // deployableCapital already excludes what is locked; the light state keeps gross capital and
    // subtracts unreleased locks day by day, so add the outstanding locks back here.
    capital: Math.max(0, state.deployableCapital) + locked.reduce((a, l) => a + l.amount, 0),
    locked,
    backlog: backlogAfterToday.map((t) => ({ id: t.economicPaymentId, amount: t.amount, deferrals: t.deferrals, arrivalDay: t.arrivalDay })),
    assignments: new Map(),
    executedZar: 0,
    expiredZar: 0,
    backlogZarDays: 0,
    reroutedCount: 0,
    lockedRandDays: 0,
    impairedDays: 0,
  };
}

function cloneLight(s: LightState): LightState {
  return {
    cards: s.cards.map((c) => ({ ...c })),
    pos: s.pos.map((p) => ({ ...p })),
    pairsDown: new Map(s.pairsDown),
    capital: s.capital,
    locked: s.locked.map((l) => ({ ...l })),
    backlog: s.backlog.map((t) => ({ ...t })),
    assignments: new Map(s.assignments),
    executedZar: s.executedZar,
    expiredZar: s.expiredZar,
    backlogZarDays: s.backlogZarDays,
    reroutedCount: s.reroutedCount,
    lockedRandDays: s.lockedRandDays,
    impairedDays: s.impairedDays,
  };
}

function applyHitToLight(s: LightState, hit: DomainHit): void {
  for (const c of s.cards) if (hit.cardIds.includes(c.id)) c.downUntil = Math.max(c.downUntil, hit.downUntilDay);
  for (const p of s.pos) if (hit.posIds.includes(p.id)) p.downUntil = Math.max(p.downUntil, hit.downUntilDay);
  for (const key of hit.pairKeys) s.pairsDown.set(key, Math.max(s.pairsDown.get(key) ?? 0, hit.downUntilDay));
  const lock = Math.min(Math.max(0, hit.lockedCapital), s.capital - s.locked.reduce((a, l) => a + l.amount, 0));
  if (lock > 0) s.locked.push({ amount: lock, releaseDay: hit.downUntilDay });
}

function expectedArrivals(scenario: Scenario, day: number): LightTicket[] {
  if (scenario.suppressNewDemand) return [];
  const n = Math.max(0, Math.round(scenario.meanDailyCoreTickets));
  const amount = roundMoney(Math.max(1, scenario.avgTicketZar));
  return Array.from({ length: n }, (_, i) => ({ id: `proj:${day}:${i + 1}`, amount, deferrals: 0, arrivalDay: day }));
}

/**
 * One operating day of the light state machine. Executable capacity comes from eligible unused
 * cards (one purchase per card per day when bank rules are on), up POS, usable pairs and
 * available (unlocked) capital. Tickets are packed whole, backlog first. `reference` is the
 * clean path's assignment for the same ticket: reused when feasible, otherwise the ticket is
 * rerouted (counted) or deferred.
 */
function stepOperatingDay(
  s: LightState,
  day: number,
  scenario: Scenario,
  arrivals: LightTicket[],
  reference: Map<string, string> | null,
): number {
  const ab = ablation(scenario);
  const resourceAware = ab.resourceAwareCapacity;
  const maxUses = scenario.bankRulesEnabled && resourceAware ? Math.max(1, scenario.maxEligiblePurchasesPerCardPerDay) : Number.POSITIVE_INFINITY;
  const m = Math.max(1, Math.round(scenario.ticketMaxDeferralOperatingDays));
  const cards = s.cards.filter((c) => c.downUntil <= day).sort((a, b) => a.id.localeCompare(b.id));
  const pos = s.pos.filter((p) => p.downUntil <= day).sort((a, b) => a.id.localeCompare(b.id));
  const uses = new Map<string, number>();
  const cardRoom = new Map<string, number>(cards.map((c) => [c.id, scenario.perCardCapacityZar]));
  const posRoom = new Map<string, number>(pos.map((p) => [p.id, scenario.perPosCapacityZar]));
  let capitalRoom = Math.max(0, s.capital - s.locked.filter((l) => l.releaseDay > day).reduce((a, l) => a + l.amount, 0));

  const demand = [...s.backlog.sort((a, b) => a.arrivalDay - b.arrivalDay || a.id.localeCompare(b.id)), ...arrivals];
  const feasible = (cardId: string, posId: string, amount: number): boolean => {
    if ((cardRoom.get(cardId) ?? -1) + 1e-9 < amount) return false;
    if ((posRoom.get(posId) ?? -1) + 1e-9 < amount) return false;
    if ((uses.get(cardId) ?? 0) >= maxUses) return false;
    if (resourceAware && (s.pairsDown.get(pairKeyOf(cardId, posId)) ?? 0) > day) return false;
    return capitalRoom + 1e-9 >= amount;
  };
  const take = (t: LightTicket, cardId: string, posId: string) => {
    cardRoom.set(cardId, (cardRoom.get(cardId) ?? 0) - t.amount);
    posRoom.set(posId, (posRoom.get(posId) ?? 0) - t.amount);
    uses.set(cardId, (uses.get(cardId) ?? 0) + 1);
    capitalRoom -= t.amount;
    s.executedZar += t.amount;
    s.assignments.set(t.id, pairKeyOf(cardId, posId));
  };

  const nextBacklog: LightTicket[] = [];
  let executed = 0;
  // Pass 1: tickets keep their planned (clean-path) resources when those are still usable, so an
  // interruption only displaces the tickets that depended on the affected resource.
  const placed = new Set<string>();
  if (reference) {
    for (const t of demand) {
      const ref = reference.get(t.id);
      if (!ref) continue;
      const [c, p] = ref.split("|") as [string, string];
      if (feasible(c, p, t.amount)) {
        take(t, c, p);
        placed.add(t.id);
        executed += t.amount;
      }
    }
  }
  // Pass 2: everything else is packed on the first usable card×POS (rerouted if it had a plan).
  for (const t of demand) {
    if (placed.has(t.id)) continue;
    const ref = reference?.get(t.id);
    let done = false;
    outer: for (const c of cards) {
      for (const p of pos) {
        if (feasible(c.id, p.id, t.amount)) {
          take(t, c.id, p.id);
          if (ref && ref !== pairKeyOf(c.id, p.id)) s.reroutedCount += 1;
          done = true;
          break outer;
        }
      }
    }
    if (done) {
      executed += t.amount;
      continue;
    }
    if (!ab.backlog) {
      // Ablation "no backlog": demand that cannot execute today is lost immediately (legacy
      // semantics of lost turnover) instead of being deferred and given a chance to catch up.
      s.expiredZar += t.amount;
      continue;
    }
    const deferrals = t.deferrals + 1;
    if (deferrals >= m) {
      s.expiredZar += t.amount;
      continue;
    }
    nextBacklog.push({ ...t, deferrals });
  }
  s.backlog = nextBacklog;
  s.backlogZarDays += nextBacklog.reduce((a, t) => a + t.amount, 0);
  return executed;
}

function stepCalendarDay(s: LightState, day: number): void {
  s.lockedRandDays += s.locked.filter((l) => l.releaseDay > day).reduce((a, l) => a + l.amount, 0);
  s.locked = s.locked.filter((l) => l.releaseDay > day);
}

function backlogSignature(s: LightState): string {
  return s.backlog
    .map((t) => `${t.id}:${t.deferrals}`)
    .sort()
    .join(",");
}

function emptyComponents(): EventLossComponents {
  return { lostMargin: 0, deferral: 0, rerouting: 0, carry: 0, total: 0 };
}

function addComponents(into: EventLossComponents, from: EventLossComponents, w: number): void {
  into.lostMargin += w * from.lostMargin;
  into.deferral += w * from.deferral;
  into.rerouting += w * from.rerouting;
  into.carry += w * from.carry;
  into.total += w * from.total;
}

interface PathOutcome {
  /** Non-carry loss components of the hit path relative to the clean path. */
  lostMargin: number;
  deferral: number;
  rerouting: number;
  impairedDays: number;
  expiredZar: number;
  deferredZarDays: number;
  reroutedTickets: number;
  executionShortfallZar: number;
}

/**
 * Hit path vs clean path from day t+1 in lockstep until the review has ended and both backlogs
 * coincide (deferred tickets have executed or expired), so every ticket has reached a final fate.
 * Capital locks are not applied here: in-flight exposure never binds executable capacity while
 * the affected resources are down (the volume that would use it cannot execute), so carry is
 * added analytically per dependence-weighted target (ρ × locked × duration).
 */
function runHitVsClean(base: LightState, hit: DomainHit, scenario: Scenario, startDay: number): PathOutcome {
  const ab = ablation(scenario);
  const clean = cloneLight(base);
  const hitS = cloneLight(base);
  applyHitToLight(hitS, { ...hit, lockedCapital: 0 });
  const cap = hit.downUntilDay + 7 * (Math.max(1, Math.round(scenario.ticketMaxDeferralOperatingDays)) + 4);
  let impaired = 0;
  let shortfall = 0;
  let cumClean = 0;
  let cumHit = 0;
  for (let day = startDay; day <= cap; day++) {
    stepCalendarDay(clean, day);
    stepCalendarDay(hitS, day);
    const operating = isOperatingWeekday(day) || !ab.operatingDayDistinction;
    if (operating) {
      const arrivals = expectedArrivals(scenario, day);
      const execClean = stepOperatingDay(clean, day, scenario, arrivals.map((t) => ({ ...t })), null);
      const execHit = stepOperatingDay(hitS, day, scenario, arrivals.map((t) => ({ ...t })), clean.assignments);
      cumClean += execClean;
      cumHit += execHit;
      if (execHit < execClean - 1e-6) impaired += 1;
      shortfall = Math.max(shortfall, cumClean - cumHit);
    }
    if (day >= hit.downUntilDay && backlogSignature(clean) === backlogSignature(hitS)) break;
  }
  return {
    lostMargin: scenario.margin * (hitS.expiredZar - clean.expiredZar),
    deferral: scenario.deferralCostDailyRate * (hitS.backlogZarDays - clean.backlogZarDays),
    rerouting: scenario.rerouteCostPerTicketZar * hitS.reroutedCount,
    impairedDays: impaired,
    expiredZar: hitS.expiredZar - clean.expiredZar,
    deferredZarDays: hitS.backlogZarDays - clean.backlogZarDays,
    reroutedTickets: hitS.reroutedCount,
    executionShortfallZar: shortfall,
  };
}

/* ------------------------------------------------------------------------------------------
 * Capacity kernels: the capacity consequence of a domain hit depends on WHICH KIND of resource
 * goes down, not on which individual card / POS / pair (they are symmetric in capacity), so one
 * path per kind and duration is computed and cached per (state availability, backlog) key.
 * Dependence enters through the target weights (locked capital → carry) and, for whole-system
 * domains, through the activity itself.
 * ------------------------------------------------------------------------------------------ */

type KernelKind = "pair" | "card" | "pos" | "all";

interface KernelSet {
  short: Record<KernelKind, PathOutcome>;
  long: Record<KernelKind, PathOutcome>;
}

const kernelCache = new Map<string, KernelSet>();

function zeroOutcome(): PathOutcome {
  return { lostMargin: 0, deferral: 0, rerouting: 0, impairedDays: 0, expiredZar: 0, deferredZarDays: 0, reroutedTickets: 0, executionShortfallZar: 0 };
}

function kernelKey(state: SimState, scenario: Scenario, backlogAfterToday: BacklogTicket[]): string {
  const ab = ablation(scenario);
  return [
    state.day,
    Math.round(state.deployableCapital),
    state.cards.map((c) => `${c.id}:${c.downUntilDay ?? 0}`).join(","),
    state.pos.map((c) => `${c.id}:${c.downUntilDay ?? 0}`).join(","),
    state.pairs.filter((x) => (x.downUntilDay ?? 0) > state.day).map((x) => `${x.cardId}|${x.posId}:${x.downUntilDay}`).join(","),
    backlogAfterToday.map((t) => `${t.deferrals}:${Math.round(t.amount)}`).join(","),
    `${scenario.deferralCostDailyRate}/${scenario.rerouteCostPerTicketZar}/${scenario.ticketMaxDeferralOperatingDays}`,
    `${scenario.shortReviewMinDays}/${scenario.shortReviewMaxDays}/${scenario.longReviewMinDays}/${scenario.longReviewMaxDays}`,
    `${scenario.margin}/${scenario.meanDailyCoreTickets}/${scenario.avgTicketZar}/${scenario.perCardCapacityZar}/${scenario.perPosCapacityZar}/${scenario.maxEligiblePurchasesPerCardPerDay}/${scenario.bankRulesEnabled ? 1 : 0}/${scenario.suppressNewDemand ? 1 : 0}/${scenario.posCapitalLockFraction ?? 0}/${scenario.posExposureLockScale ?? "flat"}/${scenario.posExposureWindowDays ?? 7}`,
    Object.values(ab).map((v) => (v ? 1 : 0)).join(""),
  ].join("|");
}

function representativeHit(kind: KernelKind, state: SimState, day: number, duration: number): DomainHit {
  const dur = Math.max(1, Math.round(duration));
  const downUntilDay = day + dur;
  const card = state.cards.filter((c) => (c.downUntilDay ?? 0) <= day + 1).sort((a, b) => a.id.localeCompare(b.id))[0] ?? state.cards[0];
  const pos = state.pos.filter((p) => (p.downUntilDay ?? 0) <= day + 1).sort((a, b) => a.id.localeCompare(b.id))[0] ?? state.pos[0];
  const base = { durationDays: dur, downUntilDay, lockedCapital: 0, balanceFrozen: false };
  switch (kind) {
    case "pair": {
      const key = pairKeyOf(card?.id ?? "", pos?.id ?? "");
      return { ...base, domain: "pair", targetIds: [key], cardIds: [], posIds: [], pairKeys: [key] };
    }
    case "card":
      return { ...base, domain: "card", targetIds: [card?.id ?? ""], cardIds: [card?.id ?? ""], posIds: [], pairKeys: [] };
    case "pos":
      return { ...base, domain: "pos", targetIds: [pos?.id ?? ""], cardIds: [], posIds: [pos?.id ?? ""], pairKeys: [] };
    case "all":
      return {
        ...base,
        domain: "system",
        targetIds: [],
        cardIds: state.cards.map((c) => c.id),
        posIds: state.pos.map((p) => p.id),
        pairKeys: [],
        balanceFrozen: true,
      };
  }
}

function kernelsFor(state: SimState, scenario: Scenario, backlogAfterToday: BacklogTicket[], durations: { short: number; long: number }): KernelSet {
  const key = kernelKey(state, scenario, backlogAfterToday);
  const cached = kernelCache.get(key);
  if (cached) return cached;
  const nextDay = state.day + 1;
  const base = lightFromState(state, nextDay, backlogAfterToday);
  const q = scenario.probabilityReviewIsLong;
  const run = (duration: number): Record<KernelKind, PathOutcome> => {
    const out = {} as Record<KernelKind, PathOutcome>;
    for (const kind of ["pair", "card", "pos", "all"] as KernelKind[]) {
      out[kind] = runHitVsClean(base, representativeHit(kind, state, state.day, duration), scenario, nextDay);
    }
    return out;
  };
  const set: KernelSet = {
    short: q < 1 - 1e-12 ? run(durations.short) : { pair: zeroOutcome(), card: zeroOutcome(), pos: zeroOutcome(), all: zeroOutcome() },
    long: q > 1e-12 ? run(durations.long) : { pair: zeroOutcome(), card: zeroOutcome(), pos: zeroOutcome(), all: zeroOutcome() },
  };
  if (kernelCache.size > 4000) kernelCache.clear();
  kernelCache.set(key, set);
  return set;
}

/* ------------------------------------------------------------------------------------------
 * Expected loss for a candidate (state before today's action, today's plan)
 * ------------------------------------------------------------------------------------------ */

export interface EventLossInput {
  /** Today's executed rows (core + organic) — dependence weights and in-flight exposure. */
  activity: ActivityRow[];
  /** Backlog after today's execution (from demandFatesForAction). Empty when unknown. */
  backlogAfterToday: BacklogTicket[];
}

function domainKind(domain: LossDomain): KernelKind {
  if (domain === "pair" || domain === "card" || domain === "pos") return domain;
  return "all";
}

function zeroSummary(probs: LossDomainProbabilities): EventLossSummary {
  return {
    lossGivenInterruption: emptyComponents(),
    expected: emptyComponents(),
    byDomain: LOSS_DOMAINS.map((domain) => ({
      domain,
      probability: probs[domain],
      loss: emptyComponents(),
      lockedCapital: 0,
      operatingDaysImpaired: 0,
      expiredZar: 0,
      deferredZarDays: 0,
      reroutedTickets: 0,
      executionShortfallZar: 0,
      targets: [],
    })),
    expectedLockedCapital: 0,
    expectedOperatingDaysImpaired: 0,
    expectedReroutedTickets: 0,
    expectedExpiredZar: 0,
    expectedDeferredZarDays: 0,
    reconciliationError: 0,
  };
}

export function projectEventLoss(
  state: SimState,
  scenario: Scenario,
  input: EventLossInput,
  hazard: number,
  durations: { short: number; long: number },
): EventLossSummary {
  const probs = effectiveDomainProbabilities(scenario);
  const dep = activityDependence(input.activity);
  // No activity today ⇒ nothing can trigger a review of today's activity (h is 0 as well).
  if (hazard <= 0 || dep.total <= 1e-9) return zeroSummary(probs);

  const q = Math.min(1, Math.max(0, scenario.probabilityReviewIsLong));
  const kernels = kernelsFor(state, scenario, input.backlogAfterToday, durations);
  // Ledger view at T2: today's rows are added when the candidate is scored before execution.
  const ledgerToday = new Set((state.bankLedger ?? []).filter((r) => r.day === state.day).map((r) => `${r.cardId}|${r.posId}|${r.amount}`));
  const ledger: LedgerTransaction[] = [...(state.bankLedger ?? [])];
  for (const a of input.activity) {
    const sig = `${a.cardId}|${a.posId}|${a.amount}`;
    if (ledgerToday.has(sig)) continue;
    ledger.push({ day: state.day, economicPaymentId: "", cardId: a.cardId, posId: a.posId, amount: a.amount, source: "core", cardOrigin: "international", highValue: false });
  }
  const ctx: HitContext = {
    day: state.day,
    cards: state.cards,
    pos: state.pos,
    ledger,
    todayRows: input.activity,
    deployableCapital: state.deployableCapital,
    scenario,
  };

  const rows: EventLossDomainRow[] = [];
  const given = emptyComponents();
  let lockedExp = 0;
  let impairedExp = 0;
  let reroutedExp = 0;
  let expiredExp = 0;
  let deferredExp = 0;
  let reconciliation = 0;
  for (const domain of LOSS_DOMAINS) {
    const pi = probs[domain];
    const targets = domainTargets(domain, dep);
    const isSingle = domain === "pair" || domain === "card" || domain === "pos";
    const targetList: Array<{ id: string | null; weight: number }> = isSingle ? targets : [{ id: null, weight: 1 }];
    const kind = domainKind(domain);
    const rowLoss = emptyComponents();
    let rowLocked = 0;
    let rowImpaired = 0;
    let rowRerouted = 0;
    let rowExpired = 0;
    let rowDeferred = 0;
    let rowShortfall = 0;
    if (pi > 1e-12 && targetList.length > 0) {
      for (const [set, dur, wDur] of [
        [kernels.short, durations.short, 1 - q],
        [kernels.long, durations.long, q],
      ] as Array<[Record<KernelKind, PathOutcome>, number, number]>) {
        if (wDur <= 1e-12) continue;
        const k = set[kind];
        const durationDays = Math.max(1, Math.round(dur));
        for (const tgt of targetList) {
          const hit = resolveDomainHit(ctx, domain, tgt.id, dur);
          const carry = scenario.capitalFrozenDuringReview ? scenario.frozenCapitalDailyRate * hit.lockedCapital * durationDays : 0;
          const w = tgt.weight * wDur;
          rowLoss.lostMargin += w * k.lostMargin;
          rowLoss.deferral += w * k.deferral;
          rowLoss.rerouting += w * k.rerouting;
          rowLoss.carry += w * carry;
          rowLoss.total += w * (k.lostMargin + k.deferral + k.rerouting + carry);
          rowLocked += w * hit.lockedCapital;
          rowImpaired += w * k.impairedDays;
          rowRerouted += w * k.reroutedTickets;
          rowExpired += w * k.expiredZar;
          rowDeferred += w * k.deferredZarDays;
          rowShortfall += w * k.executionShortfallZar;
        }
      }
    }
    reconciliation += Math.abs(rowLoss.lostMargin + rowLoss.deferral + rowLoss.rerouting + rowLoss.carry - rowLoss.total);
    rows.push({
      domain,
      probability: pi,
      loss: rowLoss,
      lockedCapital: rowLocked,
      operatingDaysImpaired: rowImpaired,
      expiredZar: rowExpired,
      deferredZarDays: rowDeferred,
      reroutedTickets: rowRerouted,
      executionShortfallZar: rowShortfall,
      targets,
    });
    addComponents(given, rowLoss, pi);
    lockedExp += pi * rowLocked;
    impairedExp += pi * rowImpaired;
    reroutedExp += pi * rowRerouted;
    expiredExp += pi * rowExpired;
    deferredExp += pi * rowDeferred;
  }
  const expected = emptyComponents();
  addComponents(expected, given, hazard);
  return {
    lossGivenInterruption: given,
    expected,
    byDomain: rows,
    expectedLockedCapital: hazard * lockedExp,
    expectedOperatingDaysImpaired: hazard * impairedExp,
    expectedReroutedTickets: hazard * reroutedExp,
    expectedExpiredZar: hazard * expiredExp,
    expectedDeferredZarDays: hazard * deferredExp,
    reconciliationError: reconciliation,
  };
}

/** Realized draw of a domain and target (hidden world on). Returns null when nothing can be hit. */
export function drawDomainHit(
  ctx: HitContext,
  rng: () => number,
): DomainHit | null {
  const probs = effectiveDomainProbabilities(ctx.scenario);
  const dep = activityDependence(ctx.todayRows);
  let u = rng();
  let domain: LossDomain = "card";
  for (const k of LOSS_DOMAINS) {
    u -= probs[k];
    if (u <= 0) {
      domain = k;
      break;
    }
  }
  const targets = domainTargets(domain, dep);
  let targetId: string | null = null;
  if (domain === "pair" || domain === "card" || domain === "pos") {
    if (targets.length === 0) return null;
    let v = rng();
    targetId = targets[targets.length - 1]!.id;
    for (const t of targets) {
      v -= t.weight;
      if (v <= 0) {
        targetId = t.id;
        break;
      }
    }
  }
  const s = ctx.scenario;
  const long = rng() < s.probabilityReviewIsLong;
  const lo = long ? s.longReviewMinDays : s.shortReviewMinDays;
  const hi = long ? s.longReviewMaxDays : s.shortReviewMaxDays;
  const duration = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
  return resolveDomainHit(ctx, domain, targetId, duration);
}
