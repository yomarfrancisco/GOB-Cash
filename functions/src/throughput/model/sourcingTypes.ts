/**
 * Slice 0 two-operator mandate / cycle types.
 *
 * Mandate versions are immutable economic terms. Lifecycle is append-only events.
 * Runtime status is derived. Utilization lives on the mandate lineage (cycle × mandate),
 * not on a version row — executions still cite the version that authorized them.
 */

export const DEMAND_OPERATOR_ID = "mz.operator";
export const SUPPLY_OPERATOR_ID = "za.operator";

export const SLICE0_QUOTE_KIND = "scenario_constant_operator_quote" as const;

/**
 * Configured simulation institutions for the Slice 0 fixture only.
 * Not verified product mappings and not production defaults.
 *
 *   BRICS   → mz.bim
 *   Ginav   → mz.fnb
 *   Vidrotec → mz.bci
 *   Wolf    → mz.vista
 *   Goblin  → mz.standard
 *   POS 1–2 → za.fnb
 *   POS 3–5 → za.capitec
 */
export const SLICE0_FIXTURE_CARD_INSTITUTIONS: Record<string, string> = {
  "card-1": "mz.bim",
  BRICS: "mz.bim",
  "card-2": "mz.fnb",
  Ginav: "mz.fnb",
  "card-3": "mz.bci",
  Vidrotec: "mz.bci",
  "card-4": "mz.vista",
  Wolf: "mz.vista",
  "card-5": "mz.standard",
  Goblin: "mz.standard",
};

export const SLICE0_FIXTURE_POS_INSTITUTIONS: Record<string, string> = {
  "pos-1": "za.fnb",
  "pos-2": "za.fnb",
  "pos-3": "za.capitec",
  "pos-4": "za.capitec",
  "pos-5": "za.capitec",
};

export type MandateLifecycleKind =
  | "activated"
  | "paused"
  | "resumed"
  | "withdrawn"
  | "expired"
  | "superseded";

export type MandateRuntimeStatus =
  | "draft"
  | "active"
  | "paused"
  | "withdrawn"
  | "expired"
  | "superseded";

/**
 * Partial execution or fragmentation of an individual ticket is never permitted.
 * Partial cycle fulfilment across several genuine whole tickets is permitted when
 * `allow_multiple_executions` (Slice 0 default).
 */
export type CycleFillPolicy = "allow_multiple_executions" | "all_or_nothing_cycle";

/**
 * Time-order greedy among whole tickets, skipping any ticket that does not fit
 * remaining authority. This is not FIFO prefix-stop (which would refuse a later
 * fitting ticket because an earlier ticket overshoots).
 */
export type ObligationPriority = "time_order_skip_oversized";

export type CycleStatus =
  | "open"
  | "active"
  | "waiting_for_supply"
  | "waiting_for_demand"
  | "no_compatible_intersection"
  | "completed"
  | "supply_exhausted"
  | "demand_exhausted"
  | "expired"
  | "cancelled";

export type AuthorizationOutcome = "success" | "failed";
export type SettlementOutcome = "success" | "pending" | "delayed" | "failed";
export type PostSuccessContinuityOutcome =
  | "none"
  | "review"
  | "capital_lock"
  | "resource_down"
  | "merchant_interruption";

export interface DemandMandateTerms {
  targetZar: number;
  expiresAtDay: number | null;
  allowedBeneficiaryIds: string[] | null;
  allowedCardIds: string[] | null;
  quotedMznPerZar: number;
  quoteKind: typeof SLICE0_QUOTE_KIND;
}

export interface SupplyMandateTerms {
  capacityZar: number;
  expiresAtDay: number | null;
  allowedPosIds: string[] | null;
  quotedMznPerZar: number;
  quoteKind: typeof SLICE0_QUOTE_KIND;
}

/** Immutable economic and authorization terms. Never mutated after insert. */
export interface DemandMandateVersion {
  mandateId: string;
  version: number;
  operatorId: string;
  recordedAtDay: number;
  terms: DemandMandateTerms;
}

/** Immutable economic and authorization terms. Never mutated after insert. */
export interface SupplyMandateVersion {
  mandateId: string;
  version: number;
  operatorId: string;
  recordedAtDay: number;
  terms: SupplyMandateTerms;
}

export interface MandateLifecycleEvent {
  mandateId: string;
  mandateVersion: number;
  kind: MandateLifecycleKind;
  actorOperatorId: string;
  atDay: number;
  note?: string;
}

export interface MandateRuntimeState {
  mandateId: string;
  activeVersion: number | null;
  status: MandateRuntimeStatus;
}

/**
 * Usage belongs to the mandate lineage inside a cycle. Each execution still
 * records the version that authorized it.
 */
export interface CycleMandateUtilization {
  cycleId: string;
  mandateId: string;
  activeVersion: number;
  activeEnvelopeZar: number;
  cumulativeConsumedZar: number;
  activeReservedZar: number;
  cumulativeReleasedZar: number;
  remainingAuthorizedZar: number;
}

export interface SourcingCycle {
  cycleId: string;
  demandMandateId: string;
  supplyMandateId: string;
  openedAtDay: number;
  deadlineDay: number | null;
  fillPolicy: CycleFillPolicy;
  obligationPriority: ObligationPriority;
  /** When true, exhausting supply is terminal. Slice 0 default is false (wait for a revision). */
  closeOnSupplyExhaustion: boolean;
  status: CycleStatus;
}

export interface CapitalReservation {
  reservationId: string;
  cycleId: string;
  mandateId: string;
  mandateVersion: number;
  economicPaymentId: string;
  amountZar: number;
  heldAtDay: number;
  /**
   * Slice 0 is single-cycle and non-concurrent: hold is taken after plan
   * selection and consumed on the same day as conversion.
   */
  concurrency: "synchronous_non_concurrent";
  status: "held" | "consumed" | "released";
}

export interface ConversionExecution {
  executionId: string;
  cycleId: string;
  day: number;
  economicPaymentId: string;
  amountZar: number;
  mznConsideration: number;
  quotedMznPerZar: number;
  quoteKind: typeof SLICE0_QUOTE_KIND;
  demandMandateId: string;
  demandMandateVersion: number;
  supplyMandateId: string;
  supplyMandateVersion: number;
  cardId: string;
  posId: string;
  authorizationOutcome: AuthorizationOutcome;
  settlementOutcome: SettlementOutcome;
  postSuccessContinuityOutcome: PostSuccessContinuityOutcome;
}

export type RelationshipManagerEventKind =
  | "CYCLE_OPENED"
  | "MANDATE_ACTIVATED"
  | "MANDATE_REVISED"
  | "SUPPLY_ENVELOPE"
  | "CAPACITY_UPDATE"
  | "EXECUTION_RESERVED"
  | "CONVERSION_SETTLED"
  | "WAITING_FOR_SUPPLY"
  | "NO_COMPATIBLE_INTERSECTION"
  | "CYCLE_RESUMED"
  | "CYCLE_COMPLETED"
  | "CYCLE_EXPIRED"
  | "CYCLE_CANCELLED";

export interface RelationshipManagerEvent {
  seq: number;
  atDay: number;
  kind: RelationshipManagerEventKind;
  actorOperatorId: string;
  cycleId: string;
  payload: Record<string, unknown>;
}

export interface OperatorProjection {
  operatorId: string;
  visibleCardIds: string[];
  visiblePosIds: string[];
  executions: ConversionExecution[];
  utilization: CycleMandateUtilization[];
  events: RelationshipManagerEvent[];
}
