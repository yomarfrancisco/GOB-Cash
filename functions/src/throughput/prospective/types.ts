import type { CoreTicket, SimState } from "../model/types";

export const PROSPECTIVE_QUOTE_MZN_PER_ZAR = 4.6;
export const PROSPECTIVE_HORIZON_DAYS = 14;
export const PROSPECTIVE_SEED = 21;
export const PROSPECTIVE_INITIAL_CARDS = 5;
export const PROSPECTIVE_INITIAL_POS = 4;

export type ProspectivePhase =
  | "day_0_ready"
  | "day_1_complete"
  | "day_2_complete"
  | "day_3_complete"
  | "day_4_complete"
  | "day_5_complete"
  | "day_6_complete"
  | "day_7_complete"
  | "day_8_complete"
  | "day_9_complete"
  | "day_10_complete"
  | "day_11_complete"
  | "day_12_complete"
  | "day_13_complete"
  | "day_14_complete"
  | "declined";

export interface ProspectiveRoute {
  cardId: string;
  posId: string;
  cardName: string;
  railLabel: string;
  issuingLabel: string | null;
  acquiringLabel: string | null;
  amountZar: number;
  economicPaymentId: string;
}

export interface ProspectiveDayRecord {
  day: number;
  weekday: string;
  weekend: boolean;
  recommendedZar: number;
  heldBackZar: number;
  settledZar: number;
  blockedZar: number;
  considerationMzn: number;
  paymentCount: number;
  blockedCount: number;
  routes: ProspectiveRoute[];
  blockedReasons: string[];
  concentrationReason: string;
  reviews: string[];
  learningNote: string;
  availableAfterZar: number;
  learnerUpdates: number;
  observationCount: number;
}

export interface ProspectiveTotals {
  offeredZar: number;
  settledZar: number;
  considerationMzn: number;
  marginRetainedZar: number;
  outstandingZar: number;
  reviews: string[];
}

export interface ProspectiveShock {
  kind: "print" | "capital";
  printMode?: "cap" | "raise";
  day: number;
  amountZar: number;
  at: string;
  rewind: boolean;
}

export interface ProspectiveDayPreview {
  day: number;
  recommendedZar: number;
  availableZar: number;
}

export type ProspectiveSpeaker = "sam" | "amina" | "leo";

export type ProspectiveOutcomeKind = "freeze" | "decline" | "delay" | "unpaid" | "rail_up";

export type ProspectiveActionType =
  | "set_opening_amount"
  | "start_day_1"
  | "advance_day"
  | "cap_day_print"
  | "raise_day_print"
  | "set_window_capital"
  | "report_outcome"
  | "confirm_pending";

export interface ProspectiveProposedAction {
  type: ProspectiveActionType;
  expectedDay: number;
  amountZar?: number;
  outcome?: ProspectiveOutcomeKind;
  rail?: string;
}

export type ProspectiveResidualStatus = "open" | "settled" | "rerouted" | "expired";

export interface ProspectivePathResidual {
  economicPaymentId: string;
  amountZar: number;
  originDay: number;
  cardId: string | null;
  posId: string | null;
  cardName: string | null;
  railLabel: string | null;
  acquiringLabel: string | null;
  issuingLabel: string | null;
  status: ProspectiveResidualStatus;
  settledDay?: number;
  rerouteRailLabel?: string | null;
}

export type ProspectiveExhaustionKind = "freeze" | "decline" | "delay" | "unpaid";

export interface ProspectiveExhaustionNote {
  day: number;
  kind: ProspectiveExhaustionKind;
  railLabel: string;
  posId: string | null;
  cardId: string | null;
  institutionLabel: string | null;
  amountZar: number | null;
  at: string;
}

export interface ProspectiveConversationMessage {
  id: string;
  at: string;
  speaker: "ygor" | ProspectiveSpeaker;
  text: string;
  sourceIds: string[];
  kind: "user" | "day_narrative" | "reply";
  day?: number;
}

export interface ProspectiveConversation {
  messages: ProspectiveConversationMessage[];
  suggestedQuestions: string[];
  modelId: string | null;
  factHash: string | null;
}

export interface ProspectiveDeskTurn {
  messages: Array<{ speaker: ProspectiveSpeaker; text: string; sourceIds: string[] }>;
  proposedAction?: ProspectiveProposedAction | null;
  suggestedQuestions: string[];
}

export interface ProspectiveSnapshot {
  book: Record<number, CoreTicket[]>;
  /** Raw engine state after the last completed day. Never written to a live CycleRun. */
  endingState: SimState | null;
  /** Engine state after the previous completed day. Used to rewind the latest day. */
  priorEndingState?: SimState | null;
  days: ProspectiveDayRecord[];
  totals: ProspectiveTotals;
  conversation?: ProspectiveConversation;
  shocks?: ProspectiveShock[];
  pendingShock?: ProspectiveShock | null;
  pendingConfirm?: ProspectiveProposedAction | null;
  residuals?: ProspectivePathResidual[];
  exhaustionNotes?: ProspectiveExhaustionNote[];
}

export interface ProspectiveBranch {
  branchId: string;
  cycleId: string;
  operatorId: string;
  openingAmountZar: number;
  quotedMznPerZar: number;
  seed: number;
  completedThroughDay: number;
  phase: ProspectivePhase;
  availableZar: number;
  snapshot: ProspectiveSnapshot;
  createdAt: string;
  updatedAt: string;
}

export function phaseForCompletedDay(day: number): ProspectivePhase {
  if (day <= 0) return "day_0_ready";
  if (day >= 14) return "day_14_complete";
  return `day_${day}_complete` as ProspectivePhase;
}

export function nextDayAfter(completedThroughDay: number): number | null {
  if (completedThroughDay >= 14) return null;
  return completedThroughDay + 1;
}

export function emptyConversation(): ProspectiveConversation {
  return {
    messages: [],
    suggestedQuestions: [],
    modelId: null,
    factHash: null,
  };
}

export function conversationOf(branch: ProspectiveBranch | null | undefined): ProspectiveConversation {
  return branch?.snapshot.conversation ?? emptyConversation();
}
