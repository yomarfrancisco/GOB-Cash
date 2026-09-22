export type { Scenario, SimState, DayDecision, CandidateEvaluation, CalendarEntry, CounterfactualResult, DailyActionPlan, PlannedTransaction } from "./types";
export { createDefaultScenario, conservativeScenario, aggressiveScenario, cloneScenario, PARAMETER_TOOLTIPS, ILLUSTRATIVE_NOTE, DEFAULT_INITIAL_CARD_NAMES, cardNamesForCount, legacyOneCardOnePosScenario } from "./defaults";
export { createInitialState, applyScheduledArrivals } from "./state";
export { decideDay, evaluateCurve, evaluateThroughput, dominantBindingConstraint, continuationPolicy, rolloutFirstAction, effectiveRolloutHorizon } from "./optimizer";
export { simulate } from "./simulation";
export { runInspectedOptimize, earlyInspectRow, INSPECT_7_DAYS, INSPECT_14_DAYS } from "./inspect";
export { allocatePairs, allocatePairsOnKeys, allocateAction, packCoreTickets, packTicketsOnKeys, displayResourceName, explainAllocation, pairKey } from "./allocation";
export { buildCalendarEntry, counterfactualDay, resourceUtilization } from "./calendar";
export { runMonteCarlo } from "./monteCarlo";
export {
  cascadeScenario,
  cascadeCellSpecs,
  operationalFeasibility,
  summarizeCascadePath,
  summariseArm,
} from "./cascade";
export {
  posStressScenario,
  runPosStressPath,
  runConditionalPosStress,
  summarisePosStressArm,
  POS_STRESS_HIT_DAY,
  POS_STRESS_LOCK_FRACTION,
  POS_STRESS_DURATIONS,
} from "./posStress";
export {
  nMinusOnePlanMetrics,
  nMinusOneExposureSnapshot,
  nMinusOneConstraintEnabled,
  planSatisfiesNMinusOne,
} from "./nMinusOneExposure";
export {
  CONCENTRATION_BETAS,
  classifyConcentrationRegime,
  minMaxPosShareRouting,
  summariseConcentrationArm,
  summariseConcentrationPath,
} from "./posConcentration";
export { runSensitivityTables } from "./sensitivity";
export { runSanityChecks } from "./sanity";
export { applyPresetKeepingCustomName, diffFromBalanced, scenarioFromPreset } from "./presets";
export { compareScenarios, compareLegacyVsCurrent } from "./compare";
export { FORMULATION } from "./formulation";
export { exportScenario, importScenario } from "./scenarioIo";
export { formatZar, formatPct } from "./math";
export { coldStartScenarioSuite } from "./coldStartScenarios";
export { disableOrganic, organicOffer, expenseBudgetAvailable, scheduledOrganicExpense } from "./organic";
export { runRollingComparisonMatrix, runRollingCell, runPersistenceComparison } from "./rollingComparison";
export { decomposeHazard } from "./rolling";
export {
  bindRealizedOffer,
  candidateCoreVolumes,
  isOperatingWeekday,
  resolveExogenousOffer,
  weekdayName,
} from "./demand";
export { runWeeklyEnsemble, weeksFromCalendar, weeklyDayRow } from "./weekly";
export type { WeeklyEnsembleSummary, WeeklyPlan } from "./weekly";
export { targetCardCount, feasibleCovers } from "./coverRules";
export {
  diagnoseValueOfInformation,
  informationValueForPackedPlan,
  informationValueForPlan,
  remainingInformativeDays,
} from "./voi";
export {
  appendSimulationObservation,
  observationsFromProductionJson,
  resourceEffectiveN,
  configEffectiveN,
} from "./observations";
export type { CoverVoiDiagnosis, ResourceVoiDiagnostic, OperatingObservation } from "./types";
export { createLearnerPosterior, learnerFeatures, predictDelta, updatePosterior, sampleTheta } from "./learner";
export { continuityPosterior, continuityMultiplier, recordContinuityObservation } from "./continuity";
export { hiddenEconomicDelta, hiddenContinuityMultiplier, hiddenContinuityCoefficients } from "./hiddenWorld";
export { drawDailySample, assessDelta, assessDeltaForPlan } from "./thompson";
export { runLearningLab, runLearningLabWorlds, labPolicyScenario } from "./learningLab";
export type { LearningLabReport, LabPolicyResult, LabDayRow, WorldsSummary } from "./learningLab";
export type { LearnerPosterior, ContinuityEvidence, LearningDiagnosis, HiddenWorldClass } from "./types";
export {
  BANK_CATEGORY_LABELS,
  HARD_RULE_META,
  HARD_RULE_IDS,
  bankRiskFeatures,
  checkHardRules,
  recordDecline,
  recordLedgerTransactions,
  sameAmountHistory,
  withTicketIdentity,
} from "./bankRules";
export { placeOrganicAtomically } from "./allocation";
export { runBankRulesComparison, persistenceStats } from "./bankRulesComparison";
export type { BankRulesComparison, BankComparisonDayRow, PairReuseEconomics, PersistenceStats, PersistenceSweepRow } from "./bankRulesComparison";
export { coverAlternatives } from "./allocation";
export type { CoverAlternative, CoverHoldDetail } from "./allocation";
export type {
  BankDayDiagnosis,
  BankDaySummary,
  BankRiskFeatures,
  BankRuleCategory,
  BlockedObligation,
  CardOrigin,
  HardBankRuleId,
  HazardContributionRow,
  LedgerTransaction,
  DeclineRecord,
  RepeatedAmountPolicy,
} from "./types";
export {
  runSlice0Cycle,
  projectForOperator,
} from "./cycle";
export type { Slice0Transcript, Slice0CycleOptions, Slice0DayRow } from "./cycle";
export { createSlice0Scenario, slice0KernelScenario, requireQuotedMznPerZar } from "./slice0Scenario";
export {
  remainingAuthorizedZar,
  createDemandMandateVersion,
  createSupplyMandateVersion,
  deriveMandateRuntimeState,
  emptyUtilization,
  assertUtilizationInvariant,
} from "./mandates";
export { clipOfferToAuthority, prefixStopSelect } from "./projections";
export {
  DEMAND_OPERATOR_ID,
  SUPPLY_OPERATOR_ID,
  SLICE0_QUOTE_KIND,
} from "./sourcingTypes";
export type {
  ConversionExecution,
  CycleMandateUtilization,
  CycleFillPolicy,
  MandateLifecycleEvent,
} from "./sourcingTypes";
