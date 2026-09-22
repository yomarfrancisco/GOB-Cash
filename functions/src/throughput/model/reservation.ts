import { roundMoney } from "./math";
import { consumeReservation, releaseReservation, reserveUtilization } from "./mandates";
import type { CapitalReservation, CycleMandateUtilization } from "./sourcingTypes";

let reservationSeq = 0;

export function resetReservationSeqForTests(): void {
  reservationSeq = 0;
}

/**
 * Slice 0: synchronous reservation after plan selection, labelled non-concurrent.
 * Does not add a second capital-physics lock on top of the execution kernel.
 */
export function holdReservations(input: {
  cycleId: string;
  mandateId: string;
  mandateVersion: number;
  day: number;
  tickets: Array<{ economicPaymentId: string; amountZar: number }>;
  utilization: CycleMandateUtilization;
}): { reservations: CapitalReservation[]; utilization: CycleMandateUtilization } {
  let utilization = input.utilization;
  const reservations: CapitalReservation[] = [];
  for (const ticket of input.tickets) {
    const amountZar = roundMoney(ticket.amountZar);
    utilization = reserveUtilization(utilization, amountZar);
    reservationSeq += 1;
    reservations.push({
      reservationId: `res-${reservationSeq}`,
      cycleId: input.cycleId,
      mandateId: input.mandateId,
      mandateVersion: input.mandateVersion,
      economicPaymentId: ticket.economicPaymentId,
      amountZar,
      heldAtDay: input.day,
      concurrency: "synchronous_non_concurrent",
      status: "held",
    });
  }
  return { reservations, utilization };
}

export function consumeHeldReservations(
  reservations: CapitalReservation[],
  utilization: CycleMandateUtilization,
): { reservations: CapitalReservation[]; utilization: CycleMandateUtilization } {
  let nextUtil = utilization;
  const next = reservations.map((row) => {
    if (row.status !== "held") return row;
    nextUtil = consumeReservation(nextUtil, row.amountZar);
    return { ...row, status: "consumed" as const };
  });
  return { reservations: next, utilization: nextUtil };
}

export function releaseHeldReservations(
  reservations: CapitalReservation[],
  utilization: CycleMandateUtilization,
): { reservations: CapitalReservation[]; utilization: CycleMandateUtilization } {
  let nextUtil = utilization;
  const next = reservations.map((row) => {
    if (row.status !== "held") return row;
    nextUtil = releaseReservation(nextUtil, row.amountZar);
    return { ...row, status: "released" as const };
  });
  return { reservations: next, utilization: nextUtil };
}
