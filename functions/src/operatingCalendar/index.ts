export {
  OPERATING_POLICY_V1,
  OPERATING_POLICY_VERSION,
  networkDailyCeilingZar,
  merchantPrincipalOfTerminal,
  acquirerOfTerminal,
  type OperatingPolicyV1,
  type LifecycleState,
  type CardId,
  type TerminalId,
  type MerchantPrincipalId,
  type AcquirerId,
  type NetworkColdState,
} from './operatingPolicyV1'

export {
  REFERENCE_CARDS_M1,
  REFERENCE_TERMINALS,
  NEW_CARD_M2,
  modeledEligiblePairs,
  terminalById,
  assertLiveExecutable,
  type TerminalRecord,
  type CardRecord,
} from './referenceNetwork'

export { MONTH1_OCTOBER_2026, MONTH2_NOVEMBER_2026, type DayTarget } from './monthFixtures'
export { buildUnsignedMonthBook, buildDayAmounts, buildDayTimes, type UnsignedSlot } from './paymentBook'
export { allocateRoutes, cardsForMonth, type PlannedPayment } from './allocateRoutes'
export { allocateDeskRoutes, cardsForOctoberDesk } from './allocateDeskRoutes'
export {
  PAYER_FAMILIES,
  OCTOBER_ACTIVE_PAYER_FAMILIES,
  EXTERNAL_DAILY_CAPACITY_MZN,
  FAMILY_CARD_SPLIT,
  eligibleCardsForPayer,
  payerFamilyOf,
  payerFamilyOfCard,
  isMozaCard,
  type PayerFamilyId,
  type PayerFamilyRecord,
} from './payerCardRegistry'
export { validateOperatingCalendar, computeLiquidity, type GateResult } from './validateCalendar'
export {
  evaluateFinalDeskLedger,
  assertFinalDeskLedger,
  assignmentPreservesFinalCountBands,
  repairRolling7PosConcentration,
  minCountForPos,
  maxCountForPos,
  type FinalLedgerVerdict,
  type LedgerPayment,
} from './finalLedgerConstraints'
export {
  emptyContinuityState,
  recordIssuedAttempt,
  recordLifecycleProgress,
  recordUsableZar,
  freezeCard,
  markOverdueFromExpectedBy,
  pendingExposureZar,
  rollingCount,
  rolloverMonth,
  hashPayload,
  withHashes,
  maturityStageFor,
  type ContinuityStateV1,
  type RouteProof,
} from './continuityState'
export {
  planReferenceMonth,
  replanAfterInterruption,
  rollingDeskSlice,
  month2VolumeWithoutGrowthAuthority,
  month2VolumeWithGrowthAuthority,
  type MonthCalendar,
  type DeskSlice,
} from './monthPlanner'
export {
  evaluateConfirmGate,
  validateCommercialIdentity,
  terminalIdFromMachineId,
  type ConfirmInstruction,
  type ConfirmGateResult,
} from './confirmGate'
export {
  buildDeskOpsBrief,
  formatDeskOpsLines,
  type DeskOpsBrief,
} from './deskOpsBrief'
