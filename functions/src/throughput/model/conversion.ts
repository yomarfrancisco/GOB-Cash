import { roundMoney } from "./math";
import { SLICE0_QUOTE_KIND } from "./sourcingTypes";
import type {
  ConversionExecution,
  PostSuccessContinuityOutcome,
} from "./sourcingTypes";
import type { InterruptionEvent, PlannedTransaction } from "./types";

let executionSeq = 0;

export function resetConversionSeqForTests(): void {
  executionSeq = 0;
}

export function mznConsideration(amountZar: number, quotedMznPerZar: number): number {
  if (!Number.isFinite(quotedMznPerZar) || quotedMznPerZar <= 0) {
    throw new Error("quotedMznPerZar is required and must be a positive finite number (no silent FX fallback)");
  }
  return roundMoney(amountZar * quotedMznPerZar);
}

export function continuityFromInterruption(
  event: InterruptionEvent | undefined,
  day: number,
): PostSuccessContinuityOutcome {
  if (!event || event.day !== day) return "none";
  if (event.domain === "merchant") return "merchant_interruption";
  if (event.lockedCapital > 1e-9) return "capital_lock";
  if (event.domain === "pos" || event.domain === "card" || event.domain === "pair") return "review";
  return "resource_down";
}

/**
 * Slice 0 conversion rows. T1 authorization/settlement stay success even if a later T2
 * cascade fires; that belongs on postSuccessContinuityOutcome, not settlementOutcome.
 */
export function conversionFromTransaction(input: {
  cycleId: string;
  day: number;
  tx: PlannedTransaction;
  quotedMznPerZar: number;
  demandMandateId: string;
  demandMandateVersion: number;
  supplyMandateId: string;
  supplyMandateVersion: number;
  postSuccessContinuityOutcome?: PostSuccessContinuityOutcome;
}): ConversionExecution {
  const amountZar = roundMoney(input.tx.amount);
  executionSeq += 1;
  return {
    executionId: `ex-${executionSeq}`,
    cycleId: input.cycleId,
    day: input.day,
    economicPaymentId: input.tx.economicPaymentId,
    amountZar,
    mznConsideration: mznConsideration(amountZar, input.quotedMznPerZar),
    quotedMznPerZar: input.quotedMznPerZar,
    quoteKind: SLICE0_QUOTE_KIND,
    demandMandateId: input.demandMandateId,
    demandMandateVersion: input.demandMandateVersion,
    supplyMandateId: input.supplyMandateId,
    supplyMandateVersion: input.supplyMandateVersion,
    cardId: input.tx.cardId,
    posId: input.tx.posId,
    authorizationOutcome: "success",
    settlementOutcome: "success",
    postSuccessContinuityOutcome: input.postSuccessContinuityOutcome ?? "none",
  };
}
