import { extractCarriedBeliefs, seedStateFromCarried, type CarriedBeliefs } from "./carriedBeliefs";
import { conversionFromTransaction, continuityFromInterruption } from "./conversion";
import {
  appendLifecycleEvent,
  assertUtilizationInvariant,
  createDemandMandateVersion,
  createSupplyMandateVersion,
  deriveMandateRuntimeState,
  demandEnvelope,
  emptyUtilization,
  reviseUtilizationEnvelope,
  supplyEnvelope,
} from "./mandates";
import { roundMoney, sum } from "./math";
import { disableOrganic } from "./organic";
import { bindClippedOffer, clipOfferToAuthority, compatibleIntersection } from "./projections";
import { consumeHeldReservations, holdReservations } from "./reservation";
import { simulate } from "./simulation";
import {
  createSlice0Scenario,
  slice0DemandTerms,
  slice0SupplyTerms,
  type Slice0ScenarioInput,
} from "./slice0Scenario";
import {
  DEMAND_OPERATOR_ID,
  SUPPLY_OPERATOR_ID,
  type CapitalReservation,
  type ConversionExecution,
  type CycleFillPolicy,
  type CycleMandateUtilization,
  type CycleStatus,
  type DemandMandateVersion,
  type MandateLifecycleEvent,
  type OperatorProjection,
  type RelationshipManagerEvent,
  type SourcingCycle,
  type SupplyMandateVersion,
} from "./sourcingTypes";
import { createInitialState } from "./state";
import type { CalendarEntry, Scenario } from "./types";

export interface SupplyRevision {
  atDay: number;
  capacityZar: number;
  allowedPosIds?: string[] | null;
  actorOperatorId?: string;
  kind?: "SUPPLY_ENVELOPE" | "CAPACITY_UPDATE";
}

export interface Slice0CycleOptions extends Slice0ScenarioInput {
  cycleId?: string;
  fillPolicy?: CycleFillPolicy;
  closeOnSupplyExhaustion?: boolean;
  supplyRevisions?: SupplyRevision[];
  realizedThroughDay?: number;
  /**
   * Beliefs learned by the predecessor cycle. When present the engine starts from them
   * instead of the scenario's cold priors. Capital, authority and demand are not carried.
   */
  carriedBeliefs?: CarriedBeliefs;
}

export interface Slice0DayRow {
  day: number;
  status: CycleStatus;
  executedZar: number;
  demandRemainingZar: number;
  supplyRemainingZar: number;
}

export interface Slice0Transcript {
  cycle: SourcingCycle;
  demandVersions: DemandMandateVersion[];
  supplyVersions: SupplyMandateVersion[];
  lifecycle: MandateLifecycleEvent[];
  demandUtilization: CycleMandateUtilization;
  supplyUtilization: CycleMandateUtilization;
  executions: ConversionExecution[];
  reservations: CapitalReservation[];
  events: RelationshipManagerEvent[];
  days: Slice0DayRow[];
  calendar: CalendarEntry[];
  coreThroughputZar: number;
  endingBacklog: Array<{
    economicPaymentId: string;
    amount: number;
    deferrals: number;
    arrivalDay: number;
  }>;
  stopReason:
    | "simulation_horizon_ended"
    | "cycle_completed"
    | "cycle_expired"
    | "cycle_cancelled"
    | "supply_exhausted";
  note: string;
  /** What this cycle learned, packaged for a successor cycle to start from. */
  endingBeliefs: CarriedBeliefs;
}

/** Remaining authority cannot fund any whole ticket on today's offer. */
export function authorityCannotFundOffer(remainingZar: number, tickets: Array<{ amount: number }>): boolean {
  if (remainingZar <= 1e-9) return true;
  if (tickets.length === 0) return false;
  return tickets.every((t) => t.amount > remainingZar + 1e-9);
}

function nextStatus(input: {
  cycle: SourcingCycle;
  demandActive: boolean;
  supplyActive: boolean;
  demandRemaining: number;
  supplyRemaining: number;
  compatible: boolean;
  day: number;
  offeredTickets: Array<{ amount: number }>;
}): CycleStatus {
  const { cycle, demandActive, supplyActive, demandRemaining, supplyRemaining, compatible, day, offeredTickets } =
    input;
  if (cycle.status === "completed" || cycle.status === "cancelled" || cycle.status === "expired") {
    return cycle.status;
  }
  if (cycle.deadlineDay !== null && day > cycle.deadlineDay) return "expired";
  if (demandRemaining <= 1e-9) return "completed";
  if (!demandActive) return "cancelled";
  if (!compatible) return "no_compatible_intersection";

  const operatingOffer = offeredTickets.length > 0;
  const supplyCanFund =
    supplyActive && (!operatingOffer || !authorityCannotFundOffer(supplyRemaining, offeredTickets));

  if (cycle.status === "waiting_for_supply") {
    if (operatingOffer && supplyCanFund) return "active";
    return cycle.closeOnSupplyExhaustion ? "supply_exhausted" : "waiting_for_supply";
  }

  if (!supplyCanFund && (operatingOffer || supplyRemaining <= 1e-9 || !supplyActive)) {
    return cycle.closeOnSupplyExhaustion ? "supply_exhausted" : "waiting_for_supply";
  }
  return "active";
}

export function projectForOperator(transcript: Slice0Transcript, operatorId: string): OperatorProjection {
  const demandSide = operatorId === DEMAND_OPERATOR_ID;
  return {
    operatorId,
    visibleCardIds: demandSide ? [...new Set(transcript.executions.map((e) => e.cardId))] : [],
    visiblePosIds: demandSide ? [] : [...new Set(transcript.executions.map((e) => e.posId))],
    executions: transcript.executions.map((ex) =>
      demandSide ? { ...ex, posId: "redacted" } : { ...ex, cardId: "redacted" },
    ),
    utilization: demandSide ? [transcript.demandUtilization] : [transcript.supplyUtilization],
    events: transcript.events.filter(
      (ev) =>
        ev.actorOperatorId === operatorId ||
        ev.kind === "CYCLE_OPENED" ||
        ev.kind === "CYCLE_COMPLETED" ||
        ev.kind === "WAITING_FOR_SUPPLY" ||
        ev.kind === "CYCLE_RESUMED" ||
        ev.kind === "NO_COMPATIBLE_INTERSECTION",
    ),
  };
}

export function runSlice0Cycle(options: Slice0CycleOptions): Slice0Transcript {
  const quotedMznPerZar = options.quotedMznPerZar;
  const scenario = createSlice0Scenario(options);
  const kernel: Scenario = disableOrganic(scenario);
  const coldState = createInitialState(scenario);
  const state = options.carriedBeliefs ? seedStateFromCarried(coldState, options.carriedBeliefs) : coldState;
  const cycleId = options.cycleId ?? "cycle-slice0-1";
  const fillPolicy: CycleFillPolicy = options.fillPolicy ?? "allow_multiple_executions";
  const closeOnSupplyExhaustion = options.closeOnSupplyExhaustion ?? false;
  const deadlineDay = slice0DemandTerms(options).expiresAtDay;
  const realizedThroughDay = Math.max(
    1,
    Math.min(kernel.horizonDays, options.realizedThroughDay ?? kernel.horizonDays),
  );

  const demandVersion = createDemandMandateVersion({
    mandateId: "demand-1",
    version: 1,
    operatorId: DEMAND_OPERATOR_ID,
    recordedAtDay: 1,
    terms: slice0DemandTerms(options),
  });
  let supplyVersion = createSupplyMandateVersion({
    mandateId: "supply-1",
    version: 1,
    operatorId: SUPPLY_OPERATOR_ID,
    recordedAtDay: 1,
    terms: slice0SupplyTerms(options),
  });
  const demandVersions = [demandVersion];
  const supplyVersions = [supplyVersion];
  const lifecycle: MandateLifecycleEvent[] = [
    appendLifecycleEvent({
      mandateId: demandVersion.mandateId,
      mandateVersion: 1,
      kind: "activated",
      actorOperatorId: DEMAND_OPERATOR_ID,
      atDay: 1,
    }),
    appendLifecycleEvent({
      mandateId: supplyVersion.mandateId,
      mandateVersion: 1,
      kind: "activated",
      actorOperatorId: SUPPLY_OPERATOR_ID,
      atDay: 1,
    }),
  ];

  const cycle: SourcingCycle = {
    cycleId,
    demandMandateId: demandVersion.mandateId,
    supplyMandateId: supplyVersion.mandateId,
    openedAtDay: 1,
    deadlineDay,
    fillPolicy,
    obligationPriority: "time_order_skip_oversized",
    closeOnSupplyExhaustion,
    status: "open",
  };

  let demandUtilization = emptyUtilization({
    cycleId,
    mandateId: demandVersion.mandateId,
    activeVersion: 1,
    activeEnvelopeZar: demandEnvelope(demandVersion),
  });
  let supplyUtilization = emptyUtilization({
    cycleId,
    mandateId: supplyVersion.mandateId,
    activeVersion: 1,
    activeEnvelopeZar: supplyEnvelope(supplyVersion),
  });
  assertUtilizationInvariant(demandUtilization);
  assertUtilizationInvariant(supplyUtilization);

  const executions: ConversionExecution[] = [];
  const reservations: CapitalReservation[] = [];
  const events: RelationshipManagerEvent[] = [];
  const days: Slice0DayRow[] = [];
  let seq = 0;
  const pushEvent = (
    atDay: number,
    kind: RelationshipManagerEvent["kind"],
    actorOperatorId: string,
    payload: Record<string, unknown>,
  ) => {
    seq += 1;
    events.push({ seq, atDay, kind, actorOperatorId, cycleId, payload });
  };

  pushEvent(1, "CYCLE_OPENED", DEMAND_OPERATOR_ID, {
    demandTargetZar: demandVersion.terms.targetZar,
    supplyCapacityZar: supplyVersion.terms.capacityZar,
    quoteKind: demandVersion.terms.quoteKind,
    quotedMznPerZar,
    institutions: "configured simulation identities (not verified product mappings)",
    reservation: "synchronous_non_concurrent",
  });
  pushEvent(1, "MANDATE_ACTIVATED", DEMAND_OPERATOR_ID, { mandateId: demandVersion.mandateId, version: 1 });
  pushEvent(1, "MANDATE_ACTIVATED", SUPPLY_OPERATOR_ID, { mandateId: supplyVersion.mandateId, version: 1 });

  const revisions = [...(options.supplyRevisions ?? [])].sort((a, b) => a.atDay - b.atDay);
  let coreThroughputZar = 0;
  let previousStatus: CycleStatus = cycle.status;

  const applyRevision = (day: number): void => {
    for (const revision of revisions) {
      if (revision.atDay !== day) continue;
      const prev = supplyVersions[supplyVersions.length - 1]!;
      lifecycle.push(
        appendLifecycleEvent({
          mandateId: prev.mandateId,
          mandateVersion: prev.version,
          kind: "superseded",
          actorOperatorId: revision.actorOperatorId ?? SUPPLY_OPERATOR_ID,
          atDay: day,
        }),
      );
      supplyVersion = createSupplyMandateVersion({
        mandateId: prev.mandateId,
        version: prev.version + 1,
        operatorId: SUPPLY_OPERATOR_ID,
        recordedAtDay: day,
        terms: {
          ...prev.terms,
          capacityZar: revision.capacityZar,
          allowedPosIds: revision.allowedPosIds !== undefined ? revision.allowedPosIds : prev.terms.allowedPosIds,
        },
      });
      supplyVersions.push(supplyVersion);
      lifecycle.push(
        appendLifecycleEvent({
          mandateId: supplyVersion.mandateId,
          mandateVersion: supplyVersion.version,
          kind: "activated",
          actorOperatorId: revision.actorOperatorId ?? SUPPLY_OPERATOR_ID,
          atDay: day,
        }),
      );
      supplyUtilization = reviseUtilizationEnvelope(
        supplyUtilization,
        supplyVersion.version,
        supplyVersion.terms.capacityZar,
      );
      assertUtilizationInvariant(supplyUtilization);
      pushEvent(day, revision.kind ?? "SUPPLY_ENVELOPE", revision.actorOperatorId ?? SUPPLY_OPERATOR_ID, {
        mandateId: supplyVersion.mandateId,
        version: supplyVersion.version,
        newCapacityZar: supplyVersion.terms.capacityZar,
        cumulativeConsumedZar: supplyUtilization.cumulativeConsumedZar,
        remainingAuthorizedZar: supplyUtilization.remainingAuthorizedZar,
      });
    }
  };

  const emitStatusChange = (status: CycleStatus, from: CycleStatus, day: number): void => {
    if (status === from) return;
    if (status === "waiting_for_supply") {
      pushEvent(day, "WAITING_FOR_SUPPLY", SUPPLY_OPERATOR_ID, {
        demandRemainingZar: demandUtilization.remainingAuthorizedZar,
        supplyRemainingZar: supplyUtilization.remainingAuthorizedZar,
      });
    } else if (status === "no_compatible_intersection") {
      pushEvent(day, "NO_COMPATIBLE_INTERSECTION", DEMAND_OPERATOR_ID, {
        allowedCardIds: demandVersion.terms.allowedCardIds,
        allowedPosIds: supplyVersion.terms.allowedPosIds,
      });
    } else if (status === "active" && (from === "waiting_for_supply" || from === "no_compatible_intersection")) {
      pushEvent(day, "CYCLE_RESUMED", SUPPLY_OPERATOR_ID, { from });
    } else if (status === "completed") {
      pushEvent(day, "CYCLE_COMPLETED", DEMAND_OPERATOR_ID, {
        consumedZar: demandUtilization.cumulativeConsumedZar,
      });
    } else if (status === "expired") {
      pushEvent(day, "CYCLE_EXPIRED", DEMAND_OPERATOR_ID, { day });
    }
  };

  const refreshStatus = (day: number, offeredTickets: Array<{ amount: number }>, simState: typeof state): CycleStatus => {
    const demandRuntime = deriveMandateRuntimeState(demandVersion.mandateId, demandVersions, lifecycle, day);
    const supplyRuntime = deriveMandateRuntimeState(supplyVersion.mandateId, supplyVersions, lifecycle, day);
    const activeDemand = demandVersions.find((v) => v.version === demandRuntime.activeVersion) ?? demandVersion;
    const activeSupply = supplyVersions.find((v) => v.version === supplyRuntime.activeVersion) ?? supplyVersion;
    const intersection = compatibleIntersection({
      state: simState,
      allowedCardIds: activeDemand.terms.allowedCardIds,
      allowedPosIds: activeSupply.terms.allowedPosIds,
    });
    return nextStatus({
      cycle,
      demandActive: demandRuntime.status === "active",
      supplyActive: supplyRuntime.status === "active",
      demandRemaining: demandUtilization.remainingAuthorizedZar,
      supplyRemaining: supplyUtilization.remainingAuthorizedZar,
      compatible: intersection.compatible,
      day,
      offeredTickets,
    });
  };

  const sim = simulate(state, kernel, "core-only", {
    realizedThroughDay,
    beforeBindOffer: (simState, day) => {
      applyRevision(day);
    },
    reshapeOffer: (simState) => {
      const day = simState.day;
      const offeredTickets = simState.exogenousOffer?.coreTickets ?? [];
      cycle.status = refreshStatus(day, offeredTickets, simState);
      emitStatusChange(cycle.status, previousStatus, day);
      previousStatus = cycle.status;
      const idleStatuses: CycleStatus[] = [
        "waiting_for_supply",
        "no_compatible_intersection",
        "expired",
        "completed",
        "cancelled",
        "supply_exhausted",
      ];
      const waiting = idleStatuses.includes(cycle.status);
      const offer = simState.exogenousOffer;
      if (!offer) return;
      const demandRuntime = deriveMandateRuntimeState(demandVersion.mandateId, demandVersions, lifecycle, day);
      const supplyRuntime = deriveMandateRuntimeState(supplyVersion.mandateId, supplyVersions, lifecycle, day);
      const activeDemand = demandVersions.find((v) => v.version === demandRuntime.activeVersion) ?? demandVersion;
      const activeSupply = supplyVersions.find((v) => v.version === supplyRuntime.activeVersion) ?? supplyVersion;
      bindClippedOffer(
        simState,
        clipOfferToAuthority(offer, {
          demandRemainingZar: waiting ? 0 : demandUtilization.remainingAuthorizedZar,
          supplyRemainingZar: waiting ? 0 : supplyUtilization.remainingAuthorizedZar,
          allowedCardIds: activeDemand.terms.allowedCardIds,
          allowedPosIds: activeSupply.terms.allowedPosIds,
          allowedBeneficiaryIds: activeDemand.terms.allowedBeneficiaryIds,
          obligationPriority: "time_order_skip_oversized",
        }),
      );
    },
    afterDay: ({ state: simState, day, evaluation, calendarEntry }) => {
      const offeredTickets = calendarEntry?.actionPlan
        ? calendarEntry.actionPlan.transactions.map((t) => ({ amount: t.amount }))
        : (simState.exogenousOffer?.coreTickets ?? []);
      const dayTx = (calendarEntry?.actionPlan.transactions ?? []).filter((t) => t.source === "core");
      let executedZar = 0;
      const plannedZar = roundMoney(sum(dayTx.map((t) => t.amount)));
      const accept =
        fillPolicy === "all_or_nothing_cycle"
          ? plannedZar + 1e-9 >= demandUtilization.remainingAuthorizedZar || plannedZar <= 1e-9
          : true;
      if (accept && dayTx.length > 0) {
        const demandHold = holdReservations({
          cycleId,
          mandateId: demandUtilization.mandateId,
          mandateVersion: demandUtilization.activeVersion,
          day,
          tickets: dayTx.map((t) => ({ economicPaymentId: t.economicPaymentId, amountZar: t.amount })),
          utilization: demandUtilization,
        });
        const supplyHold = holdReservations({
          cycleId,
          mandateId: supplyUtilization.mandateId,
          mandateVersion: supplyUtilization.activeVersion,
          day,
          tickets: dayTx.map((t) => ({ economicPaymentId: t.economicPaymentId, amountZar: t.amount })),
          utilization: supplyUtilization,
        });
        demandUtilization = demandHold.utilization;
        supplyUtilization = supplyHold.utilization;
        reservations.push(...demandHold.reservations, ...supplyHold.reservations);
        pushEvent(day, "EXECUTION_RESERVED", SUPPLY_OPERATOR_ID, {
          concurrency: "synchronous_non_concurrent",
          tickets: dayTx.length,
          reservedZar: plannedZar,
        });
        const continuity = continuityFromInterruption((simState.interruptionEvents ?? []).at(-1), day);
        demandUtilization = consumeHeldReservations(demandHold.reservations, demandUtilization).utilization;
        supplyUtilization = consumeHeldReservations(supplyHold.reservations, supplyUtilization).utilization;
        assertUtilizationInvariant(demandUtilization);
        assertUtilizationInvariant(supplyUtilization);
        const demandVer = demandHold.reservations[0]?.mandateVersion ?? demandUtilization.activeVersion;
        const supplyVer = supplyHold.reservations[0]?.mandateVersion ?? supplyUtilization.activeVersion;
        for (const tx of dayTx) {
          const row = conversionFromTransaction({
            cycleId,
            day,
            tx,
            quotedMznPerZar,
            demandMandateId: demandUtilization.mandateId,
            demandMandateVersion: demandVer,
            supplyMandateId: supplyUtilization.mandateId,
            supplyMandateVersion: supplyVer,
            postSuccessContinuityOutcome: continuity,
          });
          executions.push(row);
          executedZar = roundMoney(executedZar + row.amountZar);
          pushEvent(day, "CONVERSION_SETTLED", SUPPLY_OPERATOR_ID, {
            executionId: row.executionId,
            economicPaymentId: row.economicPaymentId,
            amountZar: row.amountZar,
            mznConsideration: row.mznConsideration,
            authorizationOutcome: row.authorizationOutcome,
            settlementOutcome: row.settlementOutcome,
            postSuccessContinuityOutcome: row.postSuccessContinuityOutcome,
            demandMandateVersion: row.demandMandateVersion,
            supplyMandateVersion: row.supplyMandateVersion,
          });
        }
        coreThroughputZar = roundMoney(coreThroughputZar + executedZar);
      }
      void evaluation;
      cycle.status = refreshStatus(day, offeredTickets, simState);
      emitStatusChange(cycle.status, previousStatus, day);
      previousStatus = cycle.status;
      days.push({
        day,
        status: cycle.status,
        executedZar,
        demandRemainingZar: demandUtilization.remainingAuthorizedZar,
        supplyRemainingZar: supplyUtilization.remainingAuthorizedZar,
      });
    },
  });

  const terminal =
    cycle.status === "completed" ||
    cycle.status === "expired" ||
    cycle.status === "cancelled" ||
    cycle.status === "supply_exhausted";
  const stopReason = !terminal
    ? "simulation_horizon_ended"
    : cycle.status === "completed"
      ? "cycle_completed"
      : cycle.status === "expired"
        ? "cycle_expired"
        : cycle.status === "cancelled"
          ? "cycle_cancelled"
          : "supply_exhausted";

  return {
    cycle,
    demandVersions,
    supplyVersions,
    lifecycle,
    demandUtilization,
    supplyUtilization,
    executions,
    reservations,
    events,
    days,
    calendar: sim.calendar,
    coreThroughputZar,
    endingBacklog: (sim.endingState.backlog ?? []).map((t) => ({
      economicPaymentId: t.economicPaymentId,
      amount: t.amount,
      deferrals: t.deferrals,
      arrivalDay: t.arrivalDay,
    })),
    stopReason,
    endingBeliefs: extractCarriedBeliefs(sim.endingState),
    note:
      "Slice 0 demonstration. Institution maps and quotedMznPerZar are configured simulation fixtures, not verified live data. Organic is disabled on this cycle path only. Reservation is synchronous and non-concurrent.",
  };
}
