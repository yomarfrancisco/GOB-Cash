import { roundMoney } from "./math";
import type {
  CycleMandateUtilization,
  DemandMandateTerms,
  DemandMandateVersion,
  MandateLifecycleEvent,
  MandateLifecycleKind,
  MandateRuntimeState,
  MandateRuntimeStatus,
  SupplyMandateTerms,
  SupplyMandateVersion,
} from "./sourcingTypes";

function freezeVersion<T extends object>(value: T): T {
  return Object.freeze(value);
}

export function remainingAuthorizedZar(input: {
  activeEnvelopeZar: number;
  cumulativeConsumedZar: number;
  activeReservedZar: number;
}): number {
  return roundMoney(
    Math.max(0, input.activeEnvelopeZar - input.cumulativeConsumedZar - input.activeReservedZar),
  );
}

export function assertUtilizationInvariant(row: CycleMandateUtilization): void {
  const expected = remainingAuthorizedZar(row);
  if (Math.abs(row.remainingAuthorizedZar - expected) > 1e-9) {
    throw new Error(
      `utilization invariant: remainingAuthorizedZar=${row.remainingAuthorizedZar} ≠ max(0, envelope − consumed − reserved)=${expected}`,
    );
  }
}

export function createDemandMandateVersion(input: {
  mandateId: string;
  version: number;
  operatorId: string;
  recordedAtDay: number;
  terms: DemandMandateTerms;
}): DemandMandateVersion {
  return freezeVersion({
    mandateId: input.mandateId,
    version: input.version,
    operatorId: input.operatorId,
    recordedAtDay: input.recordedAtDay,
    terms: freezeVersion({ ...input.terms }),
  });
}

export function createSupplyMandateVersion(input: {
  mandateId: string;
  version: number;
  operatorId: string;
  recordedAtDay: number;
  terms: SupplyMandateTerms;
}): SupplyMandateVersion {
  return freezeVersion({
    mandateId: input.mandateId,
    version: input.version,
    operatorId: input.operatorId,
    recordedAtDay: input.recordedAtDay,
    terms: freezeVersion({ ...input.terms }),
  });
}

export function appendLifecycleEvent(input: {
  mandateId: string;
  mandateVersion: number;
  kind: MandateLifecycleKind;
  actorOperatorId: string;
  atDay: number;
  note?: string;
}): MandateLifecycleEvent {
  return {
    mandateId: input.mandateId,
    mandateVersion: input.mandateVersion,
    kind: input.kind,
    actorOperatorId: input.actorOperatorId,
    atDay: input.atDay,
    ...(input.note ? { note: input.note } : {}),
  };
}

function expiresAtDayOf(
  versions: Array<DemandMandateVersion | SupplyMandateVersion>,
  version: number,
): number | null {
  const row = versions.find((v) => v.version === version);
  if (!row) return null;
  return "targetZar" in row.terms ? row.terms.expiresAtDay : row.terms.expiresAtDay;
}

/**
 * Runtime status is derived from the version log and append-only lifecycle events.
 * Versions themselves are never mutated (no status field on a version row).
 */
export function deriveMandateRuntimeState(
  mandateId: string,
  versions: Array<DemandMandateVersion | SupplyMandateVersion>,
  events: MandateLifecycleEvent[],
  atDay: number,
): MandateRuntimeState {
  const mine = events
    .filter((e) => e.mandateId === mandateId)
    .sort((a, b) => a.atDay - b.atDay || a.mandateVersion - b.mandateVersion);
  if (mine.length === 0 || versions.length === 0) {
    return { mandateId, activeVersion: null, status: "draft" };
  }

  let status: MandateRuntimeStatus = "draft";
  let activeVersion: number | null = null;
  for (const event of mine) {
    if (event.kind === "activated" || event.kind === "resumed") {
      status = "active";
      activeVersion = event.mandateVersion;
    } else if (event.kind === "paused") {
      status = "paused";
      activeVersion = event.mandateVersion;
    } else if (event.kind === "withdrawn") {
      status = "withdrawn";
      activeVersion = event.mandateVersion;
    } else if (event.kind === "expired") {
      status = "expired";
      activeVersion = event.mandateVersion;
    } else if (event.kind === "superseded") {
      status = "superseded";
      activeVersion = event.mandateVersion;
    }
  }

  const expiry = activeVersion === null ? null : expiresAtDayOf(versions, activeVersion);
  if (status === "active" && expiry !== null && atDay > expiry) {
    status = "expired";
  }

  return { mandateId, activeVersion, status };
}

export function emptyUtilization(input: {
  cycleId: string;
  mandateId: string;
  activeVersion: number;
  activeEnvelopeZar: number;
}): CycleMandateUtilization {
  const row: CycleMandateUtilization = {
    cycleId: input.cycleId,
    mandateId: input.mandateId,
    activeVersion: input.activeVersion,
    activeEnvelopeZar: roundMoney(input.activeEnvelopeZar),
    cumulativeConsumedZar: 0,
    activeReservedZar: 0,
    cumulativeReleasedZar: 0,
    remainingAuthorizedZar: 0,
  };
  row.remainingAuthorizedZar = remainingAuthorizedZar(row);
  return row;
}

export function reserveUtilization(row: CycleMandateUtilization, amountZar: number): CycleMandateUtilization {
  const next = {
    ...row,
    activeReservedZar: roundMoney(row.activeReservedZar + Math.max(0, amountZar)),
    remainingAuthorizedZar: 0,
  };
  next.remainingAuthorizedZar = remainingAuthorizedZar(next);
  if (next.remainingAuthorizedZar + 1e-9 < 0) {
    throw new Error("reserveUtilization would exceed remaining authority");
  }
  return next;
}

export function consumeReservation(row: CycleMandateUtilization, amountZar: number): CycleMandateUtilization {
  const amount = Math.max(0, amountZar);
  const next = {
    ...row,
    activeReservedZar: roundMoney(Math.max(0, row.activeReservedZar - amount)),
    cumulativeConsumedZar: roundMoney(row.cumulativeConsumedZar + amount),
    remainingAuthorizedZar: 0,
  };
  next.remainingAuthorizedZar = remainingAuthorizedZar(next);
  return next;
}

export function releaseReservation(row: CycleMandateUtilization, amountZar: number): CycleMandateUtilization {
  const amount = Math.max(0, amountZar);
  const next = {
    ...row,
    activeReservedZar: roundMoney(Math.max(0, row.activeReservedZar - amount)),
    cumulativeReleasedZar: roundMoney(row.cumulativeReleasedZar + amount),
    remainingAuthorizedZar: 0,
  };
  next.remainingAuthorizedZar = remainingAuthorizedZar(next);
  return next;
}

/**
 * On revision, remaining authority = max(0, new active envelope − cumulative consumed − active reservations).
 * Historical consumption is carried; it is not reset and is visible on the utilization row.
 */
export function reviseUtilizationEnvelope(
  row: CycleMandateUtilization,
  newActiveVersion: number,
  newEnvelopeZar: number,
): CycleMandateUtilization {
  const next = {
    ...row,
    activeVersion: newActiveVersion,
    activeEnvelopeZar: roundMoney(newEnvelopeZar),
    remainingAuthorizedZar: 0,
  };
  next.remainingAuthorizedZar = remainingAuthorizedZar(next);
  return next;
}

export function demandEnvelope(version: DemandMandateVersion): number {
  return version.terms.targetZar;
}

export function supplyEnvelope(version: SupplyMandateVersion): number {
  return version.terms.capacityZar;
}
