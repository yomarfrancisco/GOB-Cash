/**
 * Test-only admin conversion routing assistant.
 * Issues instructions to one admin UID. Does not execute FX.
 * Advances only when that admin confirms the current cycle.
 */

import * as functions from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import {
  CONVERSION_ROUTING_KIND,
  DEFAULT_TEST_CONFIG,
  PRODUCTION_DESK_CONFIG,
  ROUTING_ADMIN_UID,
  buildActivityCopy,
  buildAgentReplyCopy,
  buildNotificationCopy,
  buildReplenishActivityCopy,
  buildReplenishNotificationCopy,
  applySell,
  applyCardPosContact,
  applyCapitalShock,
  applyRestockLanding,
  createInitialState,
  residualToTarget,
  windowIsFinished,
  nextWindowOffer,
  formatAskImpactBody,
  planCycle,
  roundMoney,
  planReplenish,
  previewAskImpact,
  weightedBankCostEconomics,
  type CyclePlan,
  type ReplenishPlan,
  type RoutingConfig,
  formatZar,
  parseRoutingDecision,
  stampAssignmentDecisions,
  type RoutingState,
} from '../routing/conversionRouter'
import { payerDisplay } from '../settlement/railDisplay'
import { resolveBuyerCardLast4 } from '../settlement/register'
import {
  advanceEftBookPlannedDay,
  channelMixOf,
  defaultEftCorridorId,
  markOverdueEftTickets,
  mergeEftBook,
  openEftZar,
  splitReplacementChannels,
  type EftDeskBook,
} from '../routing/channelSplit'
import { openWindowAtCapitalWithBook } from '../routing/throughputPlan'
import {
  evidenceFromEftInstructed,
} from '../belief/emitters'
import { persistRouteEvidence } from '../belief/persist'
import { formatDeskClock, scheduleTicketPath } from '../routing/attemptSchedule'
import { beliefHintForAssignments, rankAssignmentsByBelief } from '../routing/beliefRank'
import {
  assignmentsFingerprint,
  shouldReplayDayAfterFlowRevision,
} from '../routing/flowScore'
import type { RouteEvidence } from '../belief/types'
import { ROUTE_EVIDENCE_COLLECTION } from '../belief/collections'
import { mznCoversRestock, receiptsCoverRestock } from '../inbound/restockMatch'
import {
  applyWindowPathWrite,
  DESK_MONTH_TARGET_ZAR,
  hydrateWindow,
  persistWindow,
  ROUTING_ENGINE_ID,
} from '../routing/throughputPlan'
import {
  parseFrictionNote,
  swipeIdFor,
  type FrictionNote,
  type SwipeRecord,
} from '../routing/friction'
import {
  DESK_REVIEW_COLLECTION,
  DESK_TX_COLLECTION,
  deskTxFromSwipe,
  mergeDeskHistory,
  omitUndefined,
  outcomeFromLegacy,
  type DeskReview,
  type DeskTx,
} from '../routing/frictionHistory'
import {
  EMPTY_OVERLAY,
  applyIntentsToState,
  expireConstraints,
  expireConstraintsByTime,
  normalizeStoredConstraint,
  overlayFromConstraints,
  parseFastPath,
  sanitizeIntent,
  usefulClarification,
  contextualClarify,
  validateIntent,
  type RoutingIntent,
  type StoredConstraint,
} from '../routing/constraints'
import {
  ASK_INTENT_MIN_CONFIDENCE,
  classifyAskIntent,
  mayAmendSchedule,
  mayMutateRoute,
  type AskClassification,
} from '../routing/askIntent'
import {
  applySalesScheduleAmendment,
  beliefFingerprint,
  dailyCapForDate,
  formatPlanRevisedBody,
  parseSalesScheduleAmendment,
  replanScopeForStep,
  salesScheduleFromDoc,
  sastIsoDate,
  type SalesScheduleState,
} from '../routing/salesScheduleAmendment'
import { interpretAdminFeedback, llmApiKey } from '../routing/interpretFeedback'
import {
  converseAtDesk,
  isCannedDeskAdvice,
  type DeskExchange,
  type DeskMoment,
  type DeskOperator,
} from '../routing/deskPrompt'
import { buildDeskVisuals } from '../routing/deskVisuals'
import type { RecentRestockBrief } from '../routing/historicalAsk'
import {
  answerMemoryQuestion,
  attachResolvedExpiry,
  buildRoutingLedgerBrief,
  ledgerFromRoutingState,
  type RecentCycleBrief,
  type RecentFeedbackBrief,
} from '../routing/interpretContext'
import {
  addOneSastCalendarDay,
  firestoreTimestampMs,
  formatSast,
  formatVisibleSast,
  sastParts,
  hasFutureTimeConstraint,
  isBankerQuestion,
  isMemoryOrHistoryQuestion,
  isWhatIfAsk,
  shouldNotApplyAskIntents,
  wantsNewRoutingRun,
  acceptsNextWindow,
  addressedDeskAgent,
  isNextWindowAsk,
  zarAmountFromMessage,
  isExecutionContinuityAsk,
  isAdminContinueOverrideAsk,
} from '../routing/routingTime'
import { adviseDesk, deskPursueLabel, isDeskChoiceReply, type DeskRouteSnapshot } from '../routing/deskAdvisor'
import {
  fetchQuotedMznPerZar,
  liveGrossSpreadRate,
} from '../fx/quotedMznZar'
import {
  applyPathWrites,
  classifyPathWrite,
  frozenQuoteFromSell,
  parsePathBook,
  parsePathWrite,
  residualPaymentId,
  settleResidualOnConfirm,
  zarProfitFromQuote,
  type FrozenQuote,
  type PathBook,
  type PathWrite,
} from '../routing/pathEngine'
import {
  OPERATING_POLICY_V1,
  OPERATING_POLICY_VERSION,
  buildDeskOpsBrief,
  emptyContinuityState,
  evaluateConfirmGate,
  formatDeskOpsLines,
  hashPayload,
  merchantPrincipalOfTerminal,
  terminalById,
  terminalIdFromMachineId,
  type ContinuityStateV1,
  type ConfirmInstruction,
} from '../operatingCalendar'
import { expectedMznForOrder, stepForPhase, type CyclePhase } from '../routing/continuousCycle'
import { askCardTitle, sideCardTitle, stepCardTitle, windowCardTitle } from '../routing/deskTitles'
import { buildOrderStepMessage } from '../routing/routingStepMessage'
import {
  assertOrderLedger,
  buildOrderLedger,
  coverVsSaleLine,
  formatMznMoney,
  formatRate4,
  formatZarMoney,
  parseOrderLedger,
  type OrderLedger,
} from '../routing/orderLedger'
import { cardShortName, machineShortName, DEFAULT_CARDS } from '../routing/inventory'
import {
  buildBankEmailRound,
  expectedRepliesForRound,
  isExpectedBankReplyDue,
  type BankEmailRoundPreview,
} from '../routing/bankEmailRound'

const inboundSecret = defineSecret('RESEND_INBOUND_SECRET')
const db = admin.firestore()
const TESTS = 'adminConversionTests'
const CURRENT = 'adminConversionCurrent'

type CycleStatus = 'awaiting_execution' | 'completed' | 'cancelled'

function assertRoutingAdmin(context: functions.https.CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required')
  }
  if (context.auth.uid !== ROUTING_ADMIN_UID) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Conversion routing test is limited to the designated admin user'
    )
  }
  return context.auth.uid
}

function eventId(testRunId: string, cycleNumber: number): string {
  return `routing-${testRunId}-c${cycleNumber}`
}

function revisionEventId(testRunId: string, cycleNumber: number, revision: number): string {
  return `routing-${testRunId}-c${cycleNumber}-r${revision}`
}

function currentRoutingEventId(
  testRunId: string,
  cycleNumber: number,
  data: admin.firestore.DocumentData
): string {
  if (typeof data.activityEventId === 'string' && data.activityEventId) return data.activityEventId
  const revisionCount = num(data.revisionCount, 0)
  return revisionCount > 0
    ? revisionEventId(testRunId, cycleNumber, revisionCount)
    : eventId(testRunId, cycleNumber)
}

function replenishEventId(testRunId: string, cycleNumber: number): string {
  return `routing-${testRunId}-c${cycleNumber}-liq`
}

function parseConfig(raw: unknown): RoutingConfig {
  const data = raw && typeof raw === 'object' ? (raw as Partial<RoutingConfig>) : {}
  return {
    machineCount: num(data.machineCount, DEFAULT_TEST_CONFIG.machineCount),
    spread: num(data.spread, DEFAULT_TEST_CONFIG.spread),
    recycleRate: num(data.recycleRate, DEFAULT_TEST_CONFIG.recycleRate),
    cycleCount: num(data.cycleCount, DEFAULT_TEST_CONFIG.cycleCount),
    ...(typeof data.cardCount === 'number' && data.cardCount > 0 ? { cardCount: data.cardCount } : {}),
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function constraintsFromDoc(data: admin.firestore.DocumentData): StoredConstraint[] {
  if (!Array.isArray(data.constraints)) return []
  return data.constraints
    .map((row) => normalizeStoredConstraint(row))
    .filter((row): row is StoredConstraint => Boolean(row))
}

function storedPlanFromCycle(
  data: admin.firestore.DocumentData,
  cycleNumber: number
): CyclePlan {
  const assignments = Array.isArray(data.cardAssignments) ? data.cardAssignments : []
  return {
    cycleNumber: num(data.cycleNumber, cycleNumber),
    availableCapital: num(data.availableCapital, 0),
    deployedAmount: num(data.deployedAmount, 0),
    idleCapital: num(data.idleCapital, 0),
    expectedProfit: num(data.expectedProfit, 0),
    cardCountUsed: assignments.length,
    cardAssignments: assignments,
    restingCardIds: Array.isArray(data.restingCardIds) ? data.restingCardIds : [],
    restingMachineIds: Array.isArray(data.restingMachineIds) ? data.restingMachineIds : [],
    bufferUsedBefore: num(data.bufferUsed, 0),
    bufferActionRequired: data.bufferActionRequired === true,
    selectionReason: typeof data.selectionReason === 'string' ? data.selectionReason : '',
    holdReason: typeof data.holdReason === 'string' ? data.holdReason : undefined,
  }
}

function overlayForDoc(data: admin.firestore.DocumentData) {
  return overlayFromConstraints(constraintsFromDoc(data))
}

function asSwipe(row: unknown): SwipeRecord | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Partial<SwipeRecord>
  if (typeof item.cardId !== 'number' || typeof item.machineId !== 'number' || typeof item.atMs !== 'number') {
    return null
  }
  return {
    id: typeof item.id === 'string' ? item.id : swipeIdFor(item.cycleNumber || 0, item.cardId, item.machineId),
    atMs: item.atMs,
    cardId: item.cardId,
    machineId: item.machineId,
    amount: typeof item.amount === 'number' ? item.amount : 0,
    cycleNumber: typeof item.cycleNumber === 'number' ? item.cycleNumber : 0,
  }
}

function asNote(row: unknown): FrictionNote | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Partial<FrictionNote>
  if (item.kind !== 'outcome' && item.kind !== 'profile') return null
  if (typeof item.atMs !== 'number' || typeof item.text !== 'string') return null
  return item as FrictionNote
}

function frictionFromDoc(
  data: admin.firestore.DocumentData,
  nowMs: number
): { swipes: SwipeRecord[]; notes: FrictionNote[]; nowMs: number } {
  const swipes = Array.isArray(data.recentSwipes)
    ? data.recentSwipes.map(asSwipe).filter((row): row is SwipeRecord => Boolean(row))
    : []
  const notes = Array.isArray(data.frictionNotes)
    ? data.frictionNotes.map(asNote).filter((row): row is FrictionNote => Boolean(row))
    : []
  return { swipes, notes, nowMs }
}

type FrictionBag = {
  swipes: SwipeRecord[]
  notes: FrictionNote[]
  nowMs: number
  history: DeskTx[]
  reviews: DeskReview[]
}

function reviewsFromNotes(notes: FrictionNote[]): DeskReview[] {
  return notes.flatMap((note) => {
    const outcome = outcomeFromLegacy(note.outcome, note.text)
    if (!outcome) return []
    return [
      {
        id: note.id,
        reviewId: note.swipeId || note.id,
        transactionId: note.swipeId,
        cardId: note.cardId,
        merchantId: note.machineId,
        outcome,
        startedAt: note.atMs,
        reviewSource: 'unknown',
        sourceConfidence: 'medium',
        side: 'unknown',
        severity: outcome === 'declined' ? 'high' : outcome === 'documents_requested' ? 'medium' : 'low',
        notes: note.text,
        rawText: note.text,
        source: 'live_desk',
      } satisfies DeskReview,
    ]
  })
}

function asDeskTx(row: unknown): DeskTx | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Partial<DeskTx>
  if (typeof item.occurredAt !== 'number' || typeof item.cardId !== 'number' || typeof item.machineId !== 'number') {
    return null
  }
  return {
    id: typeof item.id === 'string' ? item.id : deskTxFromSwipe({
      id: 'legacy',
      atMs: item.occurredAt,
      cardId: item.cardId,
      machineId: item.machineId,
      amount: item.amountZar || 0,
      cycleNumber: 0,
    }).id,
    occurredAt: item.occurredAt,
    cardId: item.cardId,
    merchantId: typeof item.merchantId === 'number' ? item.merchantId : item.machineId,
    machineId: item.machineId,
    amountZar: typeof item.amountZar === 'number' ? item.amountZar : 0,
    currency: 'ZAR',
    country: 'ZA',
    channel: 'card_present',
    consortium: item.consortium !== false,
    status: item.status === 'proposed' ? 'proposed' : 'executed',
    source: item.source || 'live_desk',
    testRunId: item.testRunId,
    cycleNumber: item.cycleNumber,
    proposedAt: item.proposedAt,
    executedAt: item.executedAt,
    proposalSnapshotId: item.proposalSnapshotId,
    executionSnapshotId: item.executionSnapshotId,
    restockGroupId: item.restockGroupId,
    assignmentIndex: typeof item.assignmentIndex === 'number' ? item.assignmentIndex : undefined,
    reconstruction: item.reconstruction === true,
  }
}

function asDeskReview(row: unknown): DeskReview | null {
  if (!row || typeof row !== 'object') return null
  const item = row as Partial<DeskReview>
  if (typeof item.startedAt !== 'number' || typeof item.outcome !== 'string' || typeof item.id !== 'string') {
    return null
  }
  return {
    ...(item as DeskReview),
    reviewId: typeof item.reviewId === 'string' ? item.reviewId : item.id,
  }
}

async function loadDeskLedger(): Promise<{ txs: DeskTx[]; reviews: DeskReview[] }> {
  const [txSnap, reviewSnap] = await Promise.all([
    db.collection(DESK_TX_COLLECTION).orderBy('occurredAt', 'desc').limit(400).get(),
    db.collection(DESK_REVIEW_COLLECTION).orderBy('startedAt', 'desc').limit(80).get(),
  ])
  return {
    txs: txSnap.docs.map((docSnap) => asDeskTx({ id: docSnap.id, ...docSnap.data() })).filter((row): row is DeskTx => Boolean(row)),
    reviews: reviewSnap.docs
      .map((docSnap) => asDeskReview({ id: docSnap.id, ...docSnap.data() }))
      .filter((row): row is DeskReview => Boolean(row)),
  }
}

function enrichFriction(
  bag: { swipes: SwipeRecord[]; notes: FrictionNote[]; nowMs: number },
  ledger: { txs: DeskTx[]; reviews: DeskReview[] },
  testRunId?: string
): FrictionBag {
  return {
    ...bag,
    history: mergeDeskHistory(ledger.txs, bag.swipes, testRunId),
    reviews: [...ledger.reviews, ...reviewsFromNotes(bag.notes)],
  }
}

function persistDeskReview(tx: admin.firestore.Transaction, review: DeskReview, now: admin.firestore.Timestamp) {
  tx.set(db.collection(DESK_REVIEW_COLLECTION).doc(review.id), {
    ...omitUndefined(review as unknown as Record<string, unknown>),
    createdAt: now,
  })
}

function assignmentsFromUnknown(raw: unknown): Array<{
  cardId: number
  machineId: number
  amount: number
  posReason?: string
}> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const item = row as {
      cardId?: unknown
      machineId?: unknown
      amount?: unknown
      posReason?: unknown
      routingDecision?: unknown
    }
    if (typeof item.cardId !== 'number' || typeof item.machineId !== 'number') return []
    const routingDecision = parseRoutingDecision(item.routingDecision)
    const posReason =
      (typeof item.posReason === 'string' && item.posReason) || routingDecision?.selectionReason || ''
    return [
      {
        cardId: item.cardId,
        machineId: item.machineId,
        amount: typeof item.amount === 'number' ? item.amount : 0,
        ...(posReason ? { posReason } : {}),
        ...(routingDecision ? { routingDecision } : {}),
      },
    ]
  })
}

function currentDeskRoute(
  testData: admin.firestore.DocumentData,
  stored: CyclePlan,
  awaitingKind: string
): DeskRouteSnapshot {
  if (awaitingKind === 'replenish') {
    return {
      kind: 'replenish',
      assignments: assignmentsFromUnknown(testData.replenishAssignments),
      amountZar: num(testData.replenishAmountZar, 0),
    }
  }
  return {
    kind: 'deploy',
    assignments: stored.cardAssignments,
    amountZar: stored.deployedAmount,
  }
}

function shortConstraintTitle(acknowledgement: string, blocked: boolean, awaitingKind: string): string {
  if (blocked) return awaitingKind === 'replenish' ? 'No restock possible' : 'No sale possible'
  const first = acknowledgement.split(/(?<=\.)\s/)[0] || acknowledgement
  if (/;\s/.test(first) || (first.match(/resting/gi) || []).length > 1 || first.length > 72) {
    return 'Rule recorded'
  }
  return first.replace(/\.$/, '') || 'Rule recorded'
}

function recentRestocksFromDoc(data: admin.firestore.DocumentData): RecentRestockBrief[] {
  const raw = data.recentRestocks
  if (!Array.isArray(raw)) return []
  return raw.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const item = row as { cycleNumber?: unknown; confirmedAtMs?: unknown; assignments?: unknown }
    const assignments = assignmentsFromUnknown(item.assignments)
    if (!assignments.length) return []
    return [
      {
        cycleNumber: typeof item.cycleNumber === 'number' ? item.cycleNumber : 0,
        confirmedAtMs: typeof item.confirmedAtMs === 'number' ? item.confirmedAtMs : 0,
        assignments,
      },
    ]
  })
}

async function loadRecentCycleBriefs(testRunId: string): Promise<RecentCycleBrief[]> {
  const snap = await db
    .collection(TESTS)
    .doc(testRunId)
    .collection('cycles')
    .orderBy('cycleNumber', 'desc')
    .limit(14)
    .get()
  return snap.docs.map((docSnap) => {
    const data = docSnap.data()
    const assignments = Array.isArray(data.cardAssignments)
      ? data.cardAssignments
          .map((row: unknown) => {
            if (!row || typeof row !== 'object') return null
            const item = row as {
              cardId?: unknown
              machineId?: unknown
              amount?: unknown
              posReason?: unknown
              routingDecision?: unknown
            }
            if (typeof item.cardId !== 'number' || typeof item.machineId !== 'number') return null
            const routingDecision = parseRoutingDecision(item.routingDecision)
            const posReason =
              (typeof item.posReason === 'string' && item.posReason) || routingDecision?.selectionReason || ''
            return {
              cardId: item.cardId,
              machineId: item.machineId,
              amount: typeof item.amount === 'number' ? item.amount : 0,
              ...(posReason ? { posReason } : {}),
              ...(routingDecision ? { routingDecision } : {}),
            }
          })
          .filter(
            (row: { cardId: number; machineId: number; amount: number; posReason?: string } | null): row is {
              cardId: number
              machineId: number
              amount: number
              posReason?: string
            } => Boolean(row)
          )
      : []
    return {
      cycleNumber: num(data.cycleNumber, 0),
      status: typeof data.status === 'string' ? data.status : '',
      createdAtMs: firestoreTimestampMs(data.createdAt),
      completedAtMs: firestoreTimestampMs(data.completedAt),
      deployedAmount: typeof data.deployedAmount === 'number' ? data.deployedAmount : undefined,
      actualProfit: typeof data.actualProfit === 'number' ? data.actualProfit : undefined,
      assignments,
    }
  })
}

async function loadRecentFeedbackBriefs(testRunId: string): Promise<RecentFeedbackBrief[]> {
  try {
    const snap = await db
      .collection(TESTS)
      .doc(testRunId)
      .collection('feedback')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
    return snap.docs.map((docSnap) => {
      const data = docSnap.data()
      return {
        rawMessage: typeof data.rawMessage === 'string' ? data.rawMessage : '',
        summary: typeof data.interpretationSummary === 'string' ? data.interpretationSummary : null,
        createdAtMs: firestoreTimestampMs(data.createdAt),
        status: typeof data.status === 'string' ? data.status : '',
        questionKind: typeof data.questionKind === 'string' ? data.questionKind : null,
        replyBody: typeof data.replyBody === 'string' ? data.replyBody : null,
        speaker:
          data.deskSpeaker === 'leo' || data.deskSpeaker === 'amina' || data.deskSpeaker === 'sam'
            ? data.deskSpeaker
            : null,
      }
    })
  } catch {
    return []
  }
}

function publishAgentRevision(
  tx: admin.firestore.Transaction,
  params: {
    adminUid: string
    testRunId: string
    cycleNumber: number
    previousEventId: string
    revisionCount: number
    now: admin.firestore.Timestamp
    title: string
    body: string
    dropdownTitle: string
    dropdownBody: string
    amountValue: number
    awaitingConfirm: boolean
    routingBlocked: boolean
    avatarKind?: string
    userReply?: string
  }
): { activityEventId: string; revisionCount: number } {
  const nextRevision = params.revisionCount + 1
  const activityEventId = revisionEventId(params.testRunId, params.cycleNumber, nextRevision)
  const previousRef = db
    .collection('users')
    .doc(params.adminUid)
    .collection('activityEvents')
    .doc(params.previousEventId)
  const nextRef = db
    .collection('users')
    .doc(params.adminUid)
    .collection('activityEvents')
    .doc(activityEventId)
  tx.set(
    previousRef,
    {
      awaitingConfirm: false,
      status: 'superseded',
      routingBlocked: false,
      ...(params.userReply
        ? {
            userReply: params.userReply,
            userRepliedAt: params.now,
          }
        : {}),
      updatedAt: params.now,
    },
    { merge: true }
  )
  tx.set(nextRef, {
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title: params.title,
    body: params.body,
    dropdownTitle: params.dropdownTitle,
    dropdownBody: params.dropdownBody,
    actorType: 'ai_manager',
    avatarKind: params.avatarKind || 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: params.amountValue,
    amountSign: 'debit',
    txId: activityEventId,
    hasDownloadButton: false,
    awaitingConfirm: params.awaitingConfirm,
    routingBlocked: params.routingBlocked,
    status: 'awaiting_execution',
    routingAction: 'deploy',
    routingRevision: true,
    testRunId: params.testRunId,
    cycleNumber: params.cycleNumber,
    createdAt: params.now,
    recordingSource: 'SYSTEM',
  })
  return { activityEventId, revisionCount: nextRevision }
}

function adviceEventId(testRunId: string, feedbackId: string): string {
  return `routing-${testRunId}-ask-${feedbackId}`
}

function previewStateForAsk(
  state: RoutingState,
  awaitingKind: string | undefined
): RoutingState {
  if (awaitingKind === 'replenish') return { ...state, bufferUsed: 0 }
  return state
}

function publishAdviceCard(
  tx: admin.firestore.Transaction,
  params: {
    adminUid: string
    testRunId: string
    cycleNumber: number
    feedbackId: string
    now: admin.firestore.Timestamp
    title: string
    body: string
    userReply: string
    routingAction: 'advice' | 'proposal'
    proposalId?: string
    awaitingProposalAccept?: boolean
    pursueLabel?: string | null
    optionCount?: number
    recommendedOptionId?: string | null
    questionKind?: string | null
    startNextRun?: boolean
    deskSpeaker?: 'sam' | 'leo' | 'amina'
    deskTable?: { id: string; title: string; columns: string[]; rows: Array<{ cells: string[] }> }
    deskChart?: {
      id: string
      title: string
      unit: 'ZAR' | 'MZN'
      series: Array<{ label: string; points: Array<{ label: string; value: number }> }>
    }
  }
): string {
  const activityEventId = adviceEventId(params.testRunId, params.feedbackId)
  const eventRef = db
    .collection('users')
    .doc(params.adminUid)
    .collection('activityEvents')
    .doc(activityEventId)
  const title = sideCardTitle(params.routingAction, params.title)
  tx.set(eventRef, {
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title,
    body: params.body,
    dropdownTitle: title,
    dropdownBody: params.body.split('\n')[0] || title,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: 0,
    amountSign: 'debit',
    txId: activityEventId,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: params.awaitingProposalAccept ? 'awaiting_proposal' : 'recorded',
    routingAction: params.routingAction,
    routingRevision: false,
    proposalId: params.proposalId || null,
    awaitingProposalAccept: params.awaitingProposalAccept === true,
    pursueLabel: params.pursueLabel || null,
    optionCount: params.optionCount || 0,
    recommendedOptionId: params.recommendedOptionId || null,
    questionKind: params.questionKind || null,
    startNextRun: params.startNextRun === true,
    deskSpeaker: params.deskSpeaker || 'sam',
    ...(params.deskTable ? { deskTable: params.deskTable } : {}),
    ...(params.deskChart ? { deskChart: params.deskChart } : {}),
    testRunId: params.testRunId,
    cycleNumber: params.cycleNumber,
    userReply: params.userReply,
    userRepliedAt: params.now,
    createdAt: params.now,
    recordingSource: 'SYSTEM',
  })
  return activityEventId
}

function mergeById<T extends { id: number }>(stored: unknown, fallback: T[]): T[] {
  if (!Array.isArray(stored) || !stored.length) return fallback
  const byId = new Map<number, T>()
  for (const row of stored) {
    if (row && typeof row === 'object' && typeof (row as T).id === 'number') {
      byId.set((row as T).id, row as T)
    }
  }
  const merged = fallback.map((row) => byId.get(row.id) || row)
  for (const [id, row] of byId) {
    if (!fallback.some((item) => item.id === id)) merged.push(row)
  }
  return merged
}

function stateFromDoc(data: admin.firestore.DocumentData): RoutingState {
  const base = createInitialState(parseConfig(data.config))
  const cards = mergeById(data.cards, base.cards)
  const machines = mergeById(data.machines, base.machines)
  return {
    ...base,
    availableCapital: num(data.availableCapital, base.availableCapital),
    bufferUsed: num(data.bufferUsed, 0),
    completedCycles: num(data.completedCycles, 0),
    cumulativeDeployed: num(data.cumulativeDeployed, 0),
    cumulativeSpread: num(data.cumulativeSpread, 0),
    cards,
    machines,
    pairings: data.pairings && typeof data.pairings === 'object' ? data.pairings : {},
    authorisedZar: num(data.authorisedZar, num(data.startingCapital, base.authorisedZar)),
    cycledZar: num(data.cycledZar, 0),
    mznInventory: num(data.mznInventory, 0),
    window: hydrateWindow(data.throughputWindow),
    windowNeedsAdvance: data.windowNeedsAdvance === true,
    config: {
      ...base.config,
      machineCount: machines.length,
    },
  }
}

/** Deep-strip undefined; keeps Timestamp/FieldValue instances intact. */
function firestoreSafe<T>(value: T): T {
  return omitUndefined(value)
}

function persistCapital(state: RoutingState) {
  return {
    authorisedZar: state.authorisedZar || 0,
    cycledZar: state.cycledZar || 0,
    mznInventory: state.mznInventory || 0,
    throughputWindow: state.window ? persistWindow(state.window) : null,
    windowNeedsAdvance: state.windowNeedsAdvance === true,
    routingEngine: ROUTING_ENGINE_ID,
  }
}

/** Additive migration: missing continuity doc → empty OperatingPolicyV1 state. */
function continuityFromDoc(data: admin.firestore.DocumentData | undefined): ContinuityStateV1 {
  const raw = data?.operatingContinuity
  if (raw && typeof raw === 'object' && raw.policyVersion === OPERATING_POLICY_VERSION) {
    return raw as ContinuityStateV1
  }
  return emptyContinuityState({
    networkState: 'cold_start',
    workingLiquidityZar: num(data?.authorisedZar, num(data?.availableCapital, 0)),
  })
}

function assertConfirmTimingAndPolicy(params: {
  nowMs: number
  eventData: admin.firestore.DocumentData | undefined
  cycleData: admin.firestore.DocumentData | undefined
  state: RoutingState
  continuity: ContinuityStateV1
  plan: CyclePlan
  /** Admin Continue — skip the calendar earliest-attempt gate. */
  overrideEarliest?: boolean
}): void {
  const earliestRaw =
    (typeof params.eventData?.earliestAttemptAt === 'string' && params.eventData.earliestAttemptAt) ||
    (typeof params.cycleData?.earliestAttemptAt === 'string' && params.cycleData.earliestAttemptAt) ||
    null
  const planHash =
    (typeof params.cycleData?.planHash === 'string' && params.cycleData.planHash) ||
    (typeof params.eventData?.planHash === 'string' && params.eventData.planHash) ||
    ''
  const currentPlanHash =
    (typeof params.cycleData?.planHash === 'string' && params.cycleData.planHash) || planHash

  for (const row of params.plan.cardAssignments) {
    const terminalId = terminalIdFromMachineId(row.machineId)
    if (!terminalId) continue
    if (terminalId === 'Econometrica') {
      const ecm = terminalById('Econometrica')
      if (!ecm.liveExecutable || !ecm.liveMerchantId) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Econometrica is model-eligible but not live-executable until its real Capitec merchant ID is recorded'
        )
      }
    }
    const principal = merchantPrincipalOfTerminal(terminalId)
    const instruction: ConfirmInstruction = {
      instructionId: `cycle-${params.plan.cycleNumber}-${row.cardId}-${row.machineId}`,
      invoiceId:
        (typeof params.cycleData?.invoiceId === 'string' && params.cycleData.invoiceId) ||
        `DESK-${params.plan.cycleNumber}-${row.cardId}`,
      mozambiqueDebtor: `card-${row.cardId}`,
      cardId: String(row.cardId),
      issuerBankId: 'desk',
      merchantPrincipalId: principal,
      invoiceIssuerId: principal,
      terminalId,
      acquirerBankId:
        terminalId === 'BricsCapitec' || terminalId === 'Econometrica' ? 'capitec' : 'fnb',
      zarRecipientId: principal,
      amountZar: row.amount,
      legalEligibilityRef: `DESK-ELIG-${row.cardId}-${row.machineId}`,
      earliestAt: params.overrideEarliest
        ? new Date(0).toISOString()
        : earliestRaw || new Date(0).toISOString(),
      planHash: planHash || currentPlanHash || 'legacy-unhashed',
      liveExecutable: true,
    }
    const peak = Math.max(params.state.bufferUsed, params.plan.deployedAmount, row.amount)
    const bufferPct = params.continuity.operatingBufferPct
    const required = Math.round((peak + peak * bufferPct) * 100) / 100
    const gate = evaluateConfirmGate({
      instruction,
      nowIso: new Date(params.nowMs).toISOString(),
      currentPlanHash: planHash ? currentPlanHash : instruction.planHash,
      continuity: params.continuity,
      requiredWorkingLiquidityZar: required,
      availableWorkingLiquidityZar: Math.max(
        params.state.availableCapital,
        params.continuity.workingLiquidityZar,
        params.state.authorisedZar || 0
      ),
    })
    if (!gate.ok) {
      if (gate.code === 'early' || gate.code === 'stale') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          gate.message,
          gate.updatedInstruction ? { updatedInstruction: gate.updatedInstruction } : undefined
        )
      }
      if (gate.code === 'live_ineligible' || gate.code === 'liquidity' || gate.code === 'frozen_card') {
        throw new functions.https.HttpsError('failed-precondition', gate.message)
      }
      // commercial/principal checks use desk defaults; do not block legacy tickets on missing invoice fields
    }
  }

  // Binding earliestAt even when terminal mapping is absent
  if (!params.overrideEarliest && earliestRaw) {
    const earliest = Date.parse(earliestRaw)
    if (Number.isFinite(earliest) && params.nowMs < earliest) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Confirm rejected: attempt is before ${earliestRaw}`,
        { earliestAttemptAt: earliestRaw }
      )
    }
  }
}

function shouldStartFreshWindow(data: admin.firestore.DocumentData | undefined): boolean {
  if (!data) return true
  if (data.status === 'completed' || data.status === 'declined' || data.status === 'superseded') {
    return false
  }
  return data.routingEngine !== ROUTING_ENGINE_ID
}

function publicSummary(state: RoutingState, extra: Record<string, unknown> = {}) {
  return {
    testRunId: extra.testRunId,
    status: extra.status,
    cycleNumber: extra.cycleNumber ?? state.completedCycles,
    availableCapital: state.availableCapital,
    bufferUsed: state.bufferUsed,
    cumulativeDeployed: state.cumulativeDeployed,
    cumulativeSpread: state.cumulativeSpread,
    completedCycles: state.completedCycles,
    cycleCount: state.config.cycleCount,
    ...extra,
  }
}

async function currentTestId(adminUid: string): Promise<string | null> {
  const snap = await db.collection(CURRENT).doc(adminUid).get()
  const testRunId = snap.data()?.testRunId
  return typeof testRunId === 'string' && testRunId ? testRunId : null
}

function eftBookFromDoc(data: admin.firestore.DocumentData | undefined): EftDeskBook | null {
  const raw = data?.eftBook
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tickets)) return null
  return {
    tickets: raw.tickets,
    lastSplitSummary: typeof raw.lastSplitSummary === 'string' ? raw.lastSplitSummary : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

function pathBookFromDoc(data: admin.firestore.DocumentData | undefined, quote?: FrozenQuote): PathBook {
  const parsed = parsePathBook({
    residuals: data?.pathResiduals,
    notes: data?.exhaustionNotes,
    quote: data?.frozenQuote || data?.quote,
    lastShockLine: data?.lastShockLine,
  })
  const eftBook = eftBookFromDoc(data) || parsed.eftBook
  return {
    residuals: parsed.residuals || [],
    notes: parsed.notes || [],
    quote: quote || parsed.quote,
    lastShockLine: parsed.lastShockLine,
    ...(eftBook ? { eftBook } : {}),
    ...(typeof data?.channelSplitSummary === 'string'
      ? { channelSplitSummary: data.channelSplitSummary }
      : eftBook?.lastSplitSummary
        ? { channelSplitSummary: eftBook.lastSplitSummary }
        : {}),
  }
}

function persistPathBook(
  extra: Record<string, unknown>,
  book: PathBook
): Record<string, unknown> {
  return {
    ...extra,
    pathResiduals: book.residuals || [],
    exhaustionNotes: book.notes || [],
    ...(book.quote ? { frozenQuote: book.quote } : {}),
    lastShockLine: book.lastShockLine || null,
    ...(book.eftBook ? { eftBook: book.eftBook } : {}),
    ...(book.channelSplitSummary ? { channelSplitSummary: book.channelSplitSummary } : {}),
  }
}

async function applyLiveQuotes(state: RoutingState): Promise<{
  state: RoutingState
  sellRate: number
  costRate: number
  quote: FrozenQuote
}> {
  const sellRate = await fetchQuotedMznPerZar()
  const quote = frozenQuoteFromSell(sellRate, Date.now())
  const spread = liveGrossSpreadRate(quote.sellRate, quote.costRate)
  return {
    state: {
      ...state,
      config: { ...state.config, spread },
    },
    sellRate: quote.sellRate,
    costRate: quote.costRate,
    quote,
  }
}

/** Compact ticket weights so the desk can reprice Step 4 spread/COST live. */
function ticketSplitsFromAssignments(
  assignments: Array<{ cardId: number; amount: number }>
): Array<{ cardId: number; amountZar: number; bankShort: string }> {
  return assignments
    .filter((row) => row.cardId > 0 && row.amount > 0)
    .map((row) => ({
      cardId: row.cardId,
      amountZar: roundMoney(row.amount),
      bankShort: payerDisplay(row.cardId).bankShort,
    }))
}

function writeIssuedReplenish(
  tx: admin.firestore.Transaction,
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  replenish: ReplenishPlan,
  now: admin.firestore.Timestamp,
  overlay = EMPTY_OVERLAY,
  book: PathBook = {},
  ticketPath = scheduleTicketPath({ assignments: [] }),
  orderLedger: OrderLedger | null = null,
  deskPlanChip?: string | null,
  plannedMeta: { simulated?: true; planRunId?: string } = {}
): { plan: CyclePlan; activityEventId: string; kind: 'replenish' } {
  const plan = planCycle(state, overlay, { ...book, residuals: [] })
  const proposedAt = now.toMillis()
  const issued = {
    ...replenish,
    cardAssignments: stampAssignmentDecisions(replenish.cardAssignments, proposedAt),
  }
  const path =
    ticketPath.tickets.length > 0
      ? ticketPath
      : scheduleTicketPath({
          assignments: issued.cardAssignments,
          nowMs: now.toMillis(),
          pendingExposureZar: 0,
        })
  const notification = buildReplenishNotificationCopy(issued, path)
  const activity = buildReplenishActivityCopy(
    issued,
    state.config.cycleCount,
    'awaiting_execution',
    state,
    path
  )
  const activityEventId = replenishEventId(testRunId, replenish.cycleNumber)
  const testRef = db.collection(TESTS).doc(testRunId)
  const eventRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(activityEventId)
  const primary = issued.cardAssignments[0]
  const cardMeta = primary ? DEFAULT_CARDS.find((row) => row.id === primary.cardId) : null
  const swipeTime =
    path.tickets.find((t) => typeof t.timeLabel === 'string' && t.timeLabel)?.timeLabel || null
  const sentence = activity.body.split(/\n|Next:|Status:/)[0]!.trim() || activity.body
  // Prefer frozen OrderLedger cost figures so Step 5 matches Steps 1–4.
  const amountZar =
    orderLedger && orderLedger.zar > 0 ? orderLedger.zar : replenish.amountZar
  const amountMzn =
    orderLedger && orderLedger.mznAtCost > 0 ? orderLedger.mznAtCost : replenish.amountMzn
  const costRate =
    orderLedger && orderLedger.costRate > 0 ? orderLedger.costRate : replenish.costRate
  const deskLedgerRows = [
    { label: 'Swiped', value: formatZarMoney(amountZar), valueStrong: true },
    {
      label: 'Card',
      value: primary
        ? `${cardShortName(primary.cardId)}${cardMeta?.mozBank ? ` · ${cardMeta.mozBank.replace(/ Mozambique$/, ' Moz')}` : ''}`
        : '—',
    },
    {
      label: 'Terminal',
      value: primary ? machineShortName(primary.machineId) : '—',
    },
    {
      label: 'MZN out',
      value: formatMznMoney(amountMzn),
      secondLine: `at cost ${formatRate4(costRate)} MZN/ZAR`,
    },
    ...(swipeTime ? [{ label: 'Time', value: swipeTime }] : []),
  ]

  const step5Title = stepCardTitle(5)
  tx.set(eventRef, {
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title: step5Title,
    body: sentence,
    deskSentence: sentence,
    deskStatusChip: 'Swiped',
    deskNextFooter: 'Step 6 · Day lookback',
    deskLedgerRows,
    orderLedger: orderLedger || null,
    ...(deskPlanChip ? { deskPlanChip } : {}),
    ...(plannedMeta.simulated ? { simulated: true } : {}),
    ...(plannedMeta.planRunId ? { planRunId: plannedMeta.planRunId } : {}),
    dropdownTitle: step5Title,
    dropdownBody: notification.body,
    actorType: 'ai_manager',
    avatarKind: 'convert_mzn',
    amountCurrency: 'MZN',
    amountValue: amountMzn,
    amountSign: 'debit',
    pairedAmountValue: amountZar,
    pairedAmountCurrency: 'ZAR',
    txId: activityEventId,
    hasDownloadButton: true,
    awaitingConfirm: true,
    status: 'awaiting_execution',
    routingAction: 'replenish',
    deskSpeaker: 'amina',
    cyclePhase: 'awaiting_recycle',
    deskStep: 5,
    earliestAttemptAt: path.earliestAt,
    ticketPath: path,
    testRunId,
    cycleNumber: replenish.cycleNumber,
    createdAt: now,
    recordingSource: 'SYSTEM',
  })
  tx.set(
    testRef,
    firestoreSafe({
      testRunId,
      adminUid,
      status: 'active',
      config: state.config,
      availableCapital: state.availableCapital,
      bufferUsed: state.bufferUsed,
      completedCycles: state.completedCycles,
      cumulativeDeployed: state.cumulativeDeployed,
      cumulativeSpread: state.cumulativeSpread,
      cards: state.cards,
      machines: state.machines,
      pairings: state.pairings,
      ...persistCapital(state),
      awaitingCycleNumber: replenish.cycleNumber,
      awaitingKind: 'replenish',
      cyclePhase: 'awaiting_recycle' as CyclePhase,
      replenishAmountMzn: amountMzn,
      replenishAmountZar: amountZar,
      replenishCostRate: costRate,
      replenishAssignments: issued.cardAssignments,
      replenishRestingCardIds: replenish.restingCardIds,
      replenishRestingMachineIds: replenish.restingMachineIds,
      ...persistPathBook({}, book),
      updatedAt: now,
    }),
    { merge: true }
  )
  return { plan, activityEventId, kind: 'replenish' }
}

async function loadRecentRouteEvidence(limit = 80): Promise<RouteEvidence[]> {
  try {
    const snap = await db
      .collection(ROUTE_EVIDENCE_COLLECTION)
      .orderBy('eventAt', 'desc')
      .limit(limit)
      .get()
    return snap.docs.map((doc) => doc.data() as RouteEvidence).reverse()
  } catch (error) {
    console.warn('[routeEvidence] load skipped', error)
    return []
  }
}

/** Chip + simulated tags stamped only on Planned writes. */
function plannedWriteFields(
  data: FirebaseFirestore.DocumentData | Record<string, unknown> | undefined,
  cycleNumber?: number
): { simulated?: true; planRunId?: string; deskPlanChip?: string } {
  if (!data || data.deskMode !== 'planned') return {}
  const planRunId = typeof data.planRunId === 'string' && data.planRunId ? data.planRunId : undefined
  const horizon = num(data.plannedHorizonHours, 24) >= 72 ? 72 : 24
  const anchor = num(data.plannedAnchorCycle, 0)
  const cycle =
    typeof cycleNumber === 'number' && cycleNumber > 0
      ? cycleNumber
      : num(data.awaitingCycleNumber, 0) || num(data.completedCycles, 0) + 1
  const dayIndex =
    horizon === 72 && anchor > 0 ? Math.min(3, Math.max(1, cycle - anchor + 1)) : 1
  const deskPlanChip = horizon === 72 ? `72h plan · day ${dayIndex}` : '24h plan'
  return {
    simulated: true,
    ...(planRunId ? { planRunId } : {}),
    deskPlanChip,
  }
}

function deskPlanChipFromDoc(
  data: FirebaseFirestore.DocumentData | Record<string, unknown> | undefined,
  cycleNumber?: number
): string | null {
  return plannedWriteFields(data, cycleNumber).deskPlanChip || null
}

function parsePlannedBankEmailRounds(raw: unknown): BankEmailRoundPreview[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is BankEmailRoundPreview =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          (entry as BankEmailRoundPreview).due === true &&
          typeof (entry as BankEmailRoundPreview).roundId === 'string' &&
          typeof (entry as BankEmailRoundPreview).expectedReplyAtMs === 'number' &&
          Array.isArray((entry as BankEmailRoundPreview).selected)
      )
  )
}

async function publishDueExpectedBankReplies(params: {
  adminUid: string
  testRunId: string
  testData: FirebaseFirestore.DocumentData | Record<string, unknown>
  plannedClockMs: number
}): Promise<void> {
  if (params.testData.deskMode !== 'planned') return
  const planRunId =
    typeof params.testData.planRunId === 'string' ? params.testData.planRunId : ''
  if (!planRunId) return
  const published = new Set(
    Array.isArray(params.testData.publishedBankReplyRoundIds)
      ? params.testData.publishedBankReplyRoundIds.filter(
          (value: unknown): value is string => typeof value === 'string'
        )
      : []
  )
  const dueRounds = parsePlannedBankEmailRounds(params.testData.plannedBankEmailRounds).filter(
    (round) =>
      isExpectedBankReplyDue(round, params.plannedClockMs) && !published.has(round.roundId)
  )
  if (!dueRounds.length) return

  const events = db.collection('users').doc(params.adminUid).collection('activityEvents')
  for (const round of dueRounds) {
    const replies = expectedRepliesForRound(round)
    if (!replies) continue
    const id = `expected-bank-replies-${planRunId}-${round.roundId}`
    const planned = plannedWriteFields(params.testData, round.cycleNumber + 1)
    await events.doc(id).set(
      {
        id,
        kind: CONVERSION_ROUTING_KIND,
        title: 'Expected bank replies',
        body: `${replies.rows.length} expected replies would test amount acceptance, timing and document needs. No bank response has been received.`,
        deskSentence: `${replies.rows.length} expected replies show what this round is intended to learn — not bank evidence.`,
        deskStatusChip: 'Expected',
        deskBankExpectedReplies: {
          roundId: round.roundId,
          roundLabel: round.dayLabel,
          replies,
        },
        actorType: 'ai_manager',
        avatarKind: 'convert_zar',
        deskSpeaker: 'leo',
        routingAction: 'bank_reply_preview',
        status: 'recorded',
        awaitingConfirm: false,
        hasDownloadButton: false,
        testRunId: params.testRunId,
        cycleNumber: round.cycleNumber + 1,
        simulated: true,
        planRunId,
        deskPlanChip: planned.deskPlanChip || '24h plan',
        synthetic: true,
        // Publish only once the simulated day is due, but keep feed order tied to
        // actual write order so this preview cannot jump above later Step cards.
        createdAt: admin.firestore.Timestamp.now(),
        recordingSource: 'SYSTEM',
      },
      { merge: true }
    )
    await db.collection(TESTS).doc(params.testRunId).set(
      {
        publishedBankReplyRoundIds: admin.firestore.FieldValue.arrayUnion(round.roundId),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    )
  }
}

/** Part 2 desk line after restock confirm — bank-style without competing with Step 5. */
async function writeSwipeApprovedNotice(params: {
  adminUid: string
  testRunId: string
  cycleNumber: number
  conversionTxId?: string
  testData: FirebaseFirestore.DocumentData | Record<string, unknown>
}): Promise<void> {
  const id = `swipe-approved-${params.testRunId}-${params.cycleNumber}`
  const ref = db.collection('users').doc(params.adminUid).collection('activityEvents').doc(id)
  if ((await ref.get()).exists) return
  const planned = plannedWriteFields(params.testData, params.cycleNumber)
  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: 'Card swipe approved',
    body: 'Card POS approved the restock swipe.',
    deskStatusChip: 'Approved',
    dropdownTitle: 'Card swipe approved',
    dropdownBody: 'Card POS approved the restock swipe.',
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    deskSpeaker: 'leo',
    routingAction: 'swipe_notice',
    status: 'recorded',
    awaitingConfirm: false,
    hasDownloadButton: false,
    testRunId: params.testRunId,
    cycleNumber: params.cycleNumber,
    ...(params.conversionTxId ? { txId: params.conversionTxId } : {}),
    ...planned,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    recordingSource: 'SYSTEM',
  })
}

function writeIssuedCycle(
  tx: admin.firestore.Transaction,
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp,
  quotes: { sellRate: number; costRate: number; quote?: FrozenQuote },
  overlay = EMPTY_OVERLAY,
  book: PathBook = {},
  evidence: RouteEvidence[] = [],
  immediateAttempts = false,
  priorOrderLedger: OrderLedger | null = null,
  plannedMeta: { simulated?: true; planRunId?: string; deskPlanChip?: string } = {}
): { plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' } {
  const liveBook: PathBook = {
    ...book,
    quote: quotes.quote || book.quote,
  }
  const replenish = planReplenish(state, quotes.costRate, overlay, liveBook)
  if (replenish) {
    const restockPath = scheduleTicketPath({
      assignments: replenish.cardAssignments,
      nowMs: now.toMillis(),
      pendingExposureZar: immediateAttempts ? 0 : state.bufferUsed,
      immediate: immediateAttempts,
    })
    return writeIssuedReplenish(
      tx,
      adminUid,
      testRunId,
      state,
      replenish,
      now,
      overlay,
      liveBook,
      restockPath,
      priorOrderLedger,
      plannedMeta.deskPlanChip || null,
      plannedMeta
    )
  }

  const planned = planCycle(state, overlay, liveBook)
  const rankedAssignments =
    evidence.length > 0 && planned.cardAssignments.length > 0
      ? rankAssignmentsByBelief(planned.cardAssignments, evidence, {
          pendingExposureZar: state.bufferUsed,
          sellRate: quotes.sellRate,
          baseCostRate: quotes.costRate,
          state,
          notes: liveBook.notes,
          residuals: liveBook.residuals,
        })
      : planned.cardAssignments
  const shockLine = liveBook.lastShockLine
  const persistBook: PathBook = { ...liveBook, lastShockLine: undefined }
  const plan = {
    ...planned,
    cardAssignments: stampAssignmentDecisions(rankedAssignments, now.toMillis()),
  }
  const ticketPath = scheduleTicketPath({
    assignments: plan.cardAssignments,
    nowMs: now.toMillis(),
    pendingExposureZar: immediateAttempts ? 0 : state.bufferUsed,
    immediate: immediateAttempts,
  })
  const beliefHint = beliefHintForAssignments(plan.cardAssignments, evidence, state.bufferUsed)
  const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
  const orderZar = blocked ? 0 : plan.deployedAmount
  const orderMzn = expectedMznForOrder(orderZar, quotes.sellRate)
  const openEftForLedger = (liveBook.eftBook?.tickets || []).filter(
    (t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed')
  )
  const orderLedger = blocked
    ? null
    : buildOrderLedger({
        zar: orderZar,
        sellRate: quotes.sellRate,
        baseCostRate: quotes.costRate,
        cardAssignments: plan.cardAssignments,
        windowZar: state.authorisedZar || 0,
        eftTickets: openEftForLedger.map((t) => ({
          amount: t.amountZar,
          dueIso: t.expectedSettledBy || null,
        })),
      })
  if (orderLedger) assertOrderLedger(orderLedger, { soft: true })
  // Sequential desk: Day open is Step 1 only. Leo's Step 4 card is created later.
  const cyclePhase: CyclePhase = blocked ? 'hold' : 'order_open'
  const planHash = hashPayload({
    cycleNumber: plan.cycleNumber,
    assignments: plan.cardAssignments.map((r) => ({
      cardId: r.cardId,
      machineId: r.machineId,
      amount: r.amount,
    })),
    earliestAt: ticketPath.earliestAt,
  })
  const peakUnsettled = Math.max(state.bufferUsed, plan.deployedAmount)
  const opsBrief = buildDeskOpsBrief({
    monthLabel: sastParts(now.toMillis()).year + '-' + String(sastParts(now.toMillis()).month).padStart(2, '0'),
    operatingDayIndex: Math.min(state.config.cycleCount, plan.cycleNumber),
    operatingDayCount: state.config.cycleCount,
    networkState: state.completedCycles < 3 ? 'cold_start' : 'established',
    monthPlannedZar: state.authorisedZar || state.availableCapital,
    monthCompletedZar: state.cumulativeDeployed,
    peakUnsettledExposureZar: peakUnsettled,
    continuity: emptyContinuityState({
      networkState: state.completedCycles < 3 ? 'cold_start' : 'established',
      workingLiquidityZar: state.authorisedZar || state.availableCapital,
    }),
    availableWorkingLiquidityZar: state.authorisedZar || state.availableCapital,
    earliestAttemptAt: blocked ? null : ticketPath.earliestAt,
    attemptTimeLabel: blocked ? null : ticketPath.timeLabel,
    routeReason: beliefHint || plan.selectionReason || null,
    replanReason: shockLine || null,
  })
  const activityEventId = eventId(testRunId, plan.cycleNumber)
  const testRef = db.collection(TESTS).doc(testRunId)
  const cycleRef = testRef.collection('cycles').doc(String(plan.cycleNumber))

  tx.set(cycleRef, firestoreSafe({
    testRunId,
    cycleNumber: plan.cycleNumber,
    availableCapital: plan.availableCapital,
    deployedAmount: plan.deployedAmount,
    idleCapital: plan.idleCapital,
    expectedProfit: plan.expectedProfit,
    actualProfit: null,
    cardAssignments: plan.cardAssignments,
    machineAssignments: plan.cardAssignments.map((row) => ({
      machineId: row.machineId,
      cardId: row.cardId,
      amount: row.amount,
    })),
    restingCardIds: plan.restingCardIds,
    restingMachineIds: plan.restingMachineIds,
    bufferUsed: plan.bufferUsedBefore,
    bufferActionRequired: plan.bufferActionRequired,
    sellRate: quotes.sellRate,
    costRate: quotes.costRate,
    spreadRate: state.config.spread,
    quote: liveBook.quote || quotes.quote,
    orderLedger,
    selectionReason: plan.selectionReason,
    holdReason: plan.holdReason || null,
    routingBlocked: true,
    cyclePhase,
    deskStep: blocked ? 4 : 1,
    expectedOrderZar: orderZar,
    expectedOrderMzn: orderLedger?.mznAtSell ?? orderMzn,
    earliestAttemptAt: ticketPath.earliestAt,
    ticketPath,
    planHash,
    operatingPolicyVersion: OPERATING_POLICY_VERSION,
    operatingBrief: opsBrief,
    beliefHint: beliefHint || null,
    status: 'awaiting_execution' as CycleStatus,
    createdAt: now,
    completedAt: null,
    activityEventId: null,
    leoEventPending: !blocked,
  }))
  tx.set(
    testRef,
    firestoreSafe({
      testRunId,
      adminUid,
      status: 'active',
      config: state.config,
      availableCapital: state.availableCapital,
      bufferUsed: state.bufferUsed,
      completedCycles: state.completedCycles,
      cumulativeDeployed: state.cumulativeDeployed,
      cumulativeSpread: state.cumulativeSpread,
      cards: state.cards,
      machines: state.machines,
      pairings: state.pairings,
      ...persistCapital({ ...state, window: plan.window ?? state.window }),
      operatingPolicyVersion: OPERATING_POLICY_VERSION,
      operatingContinuity: {
        ...emptyContinuityState({
          networkState: state.completedCycles < 3 ? 'cold_start' : 'established',
          workingLiquidityZar: state.authorisedZar || state.availableCapital,
        }),
        workingLiquidityZar: state.authorisedZar || state.availableCapital,
      },
      awaitingCycleNumber: plan.cycleNumber,
      awaitingKind: blocked ? 'deploy' : 'step',
      cyclePhase,
      deskStep: blocked ? 4 : 1,
      expectedOrderZar: orderZar,
      expectedOrderMzn: orderLedger?.mznAtSell ?? orderMzn,
      orderSellRate: quotes.sellRate,
      orderLedger,
      salesCommittedZar: 0,
      channelMix: plan.channelMix || 'card',
      openEftZar: plan.openEftZar || 0,
      eftTicketCount: plan.eftTicketCount || 0,
      ...persistPathBook({}, persistBook),
      updatedAt: now,
    }),
    { merge: true }
  )

  return { plan, activityEventId, kind: 'deploy' }
}

async function zarWalletBalance(adminUid: string): Promise<number> {
  const snap = await db.collection('users').doc(adminUid).collection('wallets').doc('cashZAR').get()
  return roundMoney(Number(snap.exists ? snap.data()?.fiatBalance || 0 : 0))
}

async function mznWalletBalance(adminUid: string): Promise<number> {
  const snap = await db.collection('users').doc(adminUid).collection('wallets').doc('cashMZN').get()
  return roundMoney(Number(snap.exists ? snap.data()?.fiatBalance || 0 : 0))
}

async function completeStepCard(adminUid: string, cardId: string, now: admin.firestore.Timestamp) {
  const ref = db.collection('users').doc(adminUid).collection('activityEvents').doc(cardId)
  const snap = await ref.get()
  if (!snap.exists) return
  await ref.set(
    {
      awaitingConfirm: false,
      routingBlocked: false,
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    },
    { merge: true }
  )
}

function dayTicketRevision(data: FirebaseFirestore.DocumentData | Record<string, unknown> | undefined): number {
  return Math.max(1, Math.floor(num(data?.dayTicketRevision, 1)))
}

function dayTicketIds(testRunId: string, cycleNumber: number, revision: number) {
  const tag = revision > 1 ? `-v${revision}` : ''
  return {
    order: `sam-day-brief-${testRunId}-c${cycleNumber}${tag}`,
    invoicePack: `invoice-pack-${testRunId}-c${cycleNumber}${tag}`,
    invoicePrompt: `step-invoice-${testRunId}-c${cycleNumber}${tag}`,
    mzn: `step-mzn-${testRunId}-c${cycleNumber}${tag}`,
    whatHappened: `sam-what-happened-${testRunId}-c${cycleNumber}${tag}`,
  }
}

async function supersedeDayTicketCard(
  adminUid: string,
  cardId: string,
  now: admin.firestore.Timestamp,
  reason: string
) {
  const ref = db.collection('users').doc(adminUid).collection('activityEvents').doc(cardId)
  const snap = await ref.get()
  if (!snap.exists) return
  const status = String(snap.data()?.status || '')
  if (status === 'superseded' || status === 'cancelled') return
  await ref.set(
    {
      awaitingConfirm: false,
      routingBlocked: false,
      status: 'superseded',
      supersedeReason: reason,
      updatedAt: now,
    },
    { merge: true }
  )
}

/** Create Leo's Step 4 card from the frozen OrderLedger (never re-quotes live). */
async function ensureLeoSendEvent(
  adminUid: string,
  testRunId: string,
  cycleNumber: number,
  now: admin.firestore.Timestamp
): Promise<FirebaseFirestore.DocumentReference> {
  const activityEventId = eventId(testRunId, cycleNumber)
  const eventRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(activityEventId)
  if ((await eventRef.get()).exists) return eventRef

  const [cycleSnap, testSnap] = await Promise.all([
    db.collection(TESTS).doc(testRunId).collection('cycles').doc(String(cycleNumber)).get(),
    db.collection(TESTS).doc(testRunId).get(),
  ])
  const cycle = cycleSnap.data() || {}
  const testData = testSnap.data() || {}
  const amountZar = num(cycle.deployedAmount, num(cycle.expectedOrderZar, 0))
  const assignments = Array.isArray(cycle.cardAssignments)
    ? (cycle.cardAssignments as CyclePlan['cardAssignments'])
    : []
  const ticketSplits = ticketSplitsFromAssignments(assignments)
  const state = stateFromDoc(testData)
  let ledger =
    parseOrderLedger(cycle.orderLedger) || parseOrderLedger(testData.orderLedger) || null
  if (!ledger && amountZar > 0) {
    const sellRate = num(cycle.sellRate, num(testData.orderSellRate, 0))
    const costRate = num(cycle.costRate, 0)
    if (sellRate > 0 && costRate > 0) {
      ledger = buildOrderLedger({
        zar: amountZar,
        sellRate,
        baseCostRate: costRate,
        cardAssignments: assignments,
        windowZar: state.authorisedZar || 0,
        eftTickets: (eftBookFromDoc(testData)?.tickets || [])
          .filter((t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed'))
          .map((t) => ({ amount: t.amountZar, dueIso: t.expectedSettledBy || null })),
      })
    }
  }
  const coverLine = ledger ? coverVsSaleLine(ledger) : null
  const sentence = coverLine
    ? `ZAR sold for MZN by COB, once the cover landed. ${coverLine}.`
    : 'ZAR sold for MZN by COB, once the cover landed.'
  const title = stepCardTitle(4)
  const plannedStep4 = plannedWriteFields(testData, cycleNumber)
  await eventRef.set({
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title,
    body: sentence,
    dropdownTitle: title,
    dropdownBody: `${formatZar(amountZar)} send`,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: amountZar,
    amountSign: 'debit',
    txId: activityEventId,
    hasDownloadButton: true,
    awaitingConfirm: false,
    routingBlocked: true,
    deskStatusChip: 'Executed',
    deskSentence: sentence,
    orderLedger: ledger || null,
    ...plannedStep4,
    deskLedgerRows: ledger
      ? [
          { label: 'Sold', value: formatZarMoney(amountZar), valueStrong: true },
          { label: 'Received', value: formatMznMoney(ledger.mznAtSell) },
          { label: 'Sell rate', value: `${formatRate4(ledger.sellRate)} MZN/ZAR` },
          { label: 'Cost rate', value: `${formatRate4(ledger.costRate)} MZN/ZAR` },
          {
            label: 'Spread',
            value: `${formatMznMoney(ledger.spreadMzn)} gross`,
            valueStrong: true,
            secondLine: `${formatRate4(ledger.spreadPerZar)} MZN/ZAR`,
          },
          {
            label: 'Window left',
            value: formatZarMoney(ledger.windowLeftZar),
            secondLine: `of ${formatZarMoney(ledger.windowZar)}`,
          },
        ]
      : null,
    status: 'pending_mzn',
    routingAction: 'deploy',
    deskSpeaker: 'leo',
    cyclePhase: 'awaiting_mzn',
    deskStep: 4,
    earliestAttemptAt: typeof cycle.earliestAttemptAt === 'string' ? cycle.earliestAttemptAt : null,
    ticketPath: cycle.ticketPath || null,
    planHash: cycle.planHash || null,
    operatingPolicyVersion: OPERATING_POLICY_VERSION,
    operatingBrief: cycle.operatingBrief || null,
    ticketSplits,
    testRunId,
    cycleNumber,
    createdAt: now,
    recordingSource: 'SYSTEM',
  })
  await db
    .collection(TESTS)
    .doc(testRunId)
    .collection('cycles')
    .doc(String(cycleNumber))
    .set({ activityEventId, leoEventPending: false, updatedAt: now }, { merge: true })
  return eventRef
}

/**
 * Walk Steps 1→2→3→4 one Continue at a time. Never jumps ahead.
 */
export async function advanceSequentialStep(adminUid: string): Promise<{
  title: string
  body: string
  advanced: boolean
  deskStep: number
}> {
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) {
    return { title: 'No desk', body: 'No active desk run.', advanced: false, deskStep: 0 }
  }
  const testRef = db.collection(TESTS).doc(testRunId)
  const snap = await testRef.get()
  const data = snap.data() || {}
  if (data.status !== 'active') {
    return { title: 'Desk closed', body: 'This desk run is not active.', advanced: false, deskStep: 0 }
  }
  const phase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
  const cycleNumber = num(data.awaitingCycleNumber, 0)
  const deskStep = num(data.deskStep, 0)
  const awaitingKind = typeof data.awaitingKind === 'string' ? data.awaitingKind : ''
  const now = admin.firestore.Timestamp.now()
  if (!(cycleNumber > 0)) {
    return { title: 'No day open', body: 'Open Day 1 with $ first.', advanced: false, deskStep: 0 }
  }
  // Recycle / Leo confirm own their Continue — never steal them via a stale deskStep.
  if (awaitingKind === 'replenish' || phase === 'awaiting_recycle') {
    return {
      title: stepCardTitle(5),
      body: 'Step 5 · Replace ZAR is open — Continue on Amina’s restock card after the COST swipe.',
      advanced: false,
      deskStep: 5,
    }
  }
  if (awaitingKind === 'deploy' && (phase === 'awaiting_send' || phase === 'awaiting_continue' || deskStep >= 4)) {
    return {
      title: stepCardTitle(4),
      body: 'Step 4 is already open — Continue / I’ve sent ZAR on Leo’s card.',
      advanced: false,
      deskStep: 4,
    }
  }

  // Step 6 · What happened → open Day n+1 Order
  if (phase === 'awaiting_day_close' || deskStep === 6) {
    const ticketsClose = dayTicketIds(testRunId, cycleNumber, dayTicketRevision(data))
    await completeStepCard(adminUid, ticketsClose.whatHappened, now)
    const state = stateFromDoc(data)
    try {
      const issued = await issueCycle(adminUid, testRunId, state, now)
      if (issued.kind === 'deploy') {
        await bumpPlannedClockIfNeeded(testRef, adminUid, testRunId, cycleNumber)
      }
      return {
        title: stepCardTitle(1),
        body:
          issued.kind === 'deploy'
            ? `Step 6 done. Day ${issued.plan.cycleNumber} · Order is on the desk.`
            : `Step 6 done. Restock is open for Day ${issued.plan.cycleNumber}.`,
        advanced: true,
        deskStep: issued.kind === 'deploy' ? 1 : 5,
      }
    } catch (error) {
      console.error('[advanceSequential] Step 6 → next day failed', error)
      return {
        title: stepCardTitle(6),
        body: 'Day recap is still open — could not open the next day yet.',
        advanced: false,
        deskStep: 6,
      }
    }
  }

  const tickets = dayTicketIds(testRunId, cycleNumber, dayTicketRevision(data))

  // Step 1 · Order → Step 2 · Invoice
  if (phase === 'order_open' || (deskStep === 1 && !phase)) {
    await completeStepCard(adminUid, tickets.order, now)
    const cycleSnap = await testRef.collection('cycles').doc(String(cycleNumber)).get()
    const assignments = Array.isArray(cycleSnap.data()?.cardAssignments)
      ? (cycleSnap.data()?.cardAssignments as Array<{
          cardId: number
          machineId: number
          amount: number
          economicPaymentId?: string
        }>)
      : []
    const plannedMeta = plannedWriteFields(data, cycleNumber)
    const orderLedger = parseOrderLedger(data.orderLedger)
    const bankEmailRound = plannedMeta.simulated
      ? buildBankEmailRound({
          cycleNumber,
          clockMs: num(data.plannedClockMs, now.toMillis()),
          horizonHours: num(data.plannedHorizonHours, 24) >= 72 ? 72 : 24,
          eftTickets:
            orderLedger?.eftTickets.map((ticket, index) => ({
              ...ticket,
              ticketId: `eft-c${cycleNumber}-${index + 1}`,
            })) || [],
        })
      : null
    if (bankEmailRound?.due) {
      await testRef.set(
        {
          plannedBankEmailRounds: admin.firestore.FieldValue.arrayUnion(bankEmailRound),
          updatedAt: now,
        },
        { merge: true }
      )
    }
    // One Step 2 card only: the invoice pack itself carries Continue (latest post).
    if (assignments.length) {
      try {
        const { raiseInvoicesForCycle } = await import('../settlement/issueInvoices')
        await raiseInvoicesForCycle({
          testRunId,
          cycleNumber,
          assignments,
          sequentialContinue: true,
          revision: dayTicketRevision(data),
          plannedMeta,
          bankEmailRound,
        })
      } catch (error) {
        console.error('[advanceSequential] invoice raise failed', error)
      }
    } else {
      const packId = tickets.invoicePack
      await db
        .collection('users')
        .doc(adminUid)
        .collection('activityEvents')
        .doc(packId)
        .set(
          {
            id: packId,
            kind: CONVERSION_ROUTING_KIND,
            title: stepCardTitle(2),
            body: bankEmailRound
              ? bankEmailRound.due
                ? `No card invoices were required. Today’s single expected bank email bundles every due EFT invoice.`
                : `No card invoices were required. No bank email round today.`
              : `Invoices for ${formatZar(num(data.expectedOrderZar, 0))} are on the desk.\nNext 24h opens Step 3 · MZN prefunded.`,
            awaitingConfirm: true,
            routingBlocked: false,
            status: 'awaiting_execution',
            routingAction: 'step',
            deskSpeaker: 'amina',
            cyclePhase: 'awaiting_invoice',
            deskStep: 2,
            ...(bankEmailRound?.due
              ? { deskPendingChip: `Email round · ${bankEmailRound.selected.length} expected` }
              : {}),
            testRunId,
            cycleNumber,
            ...(bankEmailRound ? { deskBankEmailRound: bankEmailRound } : {}),
            ...plannedMeta,
            createdAt: now,
            recordingSource: 'SYSTEM',
          },
          { merge: true }
        )
    }
    // Retire any legacy duplicate Step 2 prompt so Continue lives only on the pack.
    await completeStepCard(adminUid, tickets.invoicePrompt, now)
    await testRef.set(
      {
        cyclePhase: 'awaiting_invoice',
        deskStep: 2,
        awaitingKind: 'step',
        updatedAt: now,
      },
      { merge: true }
    )
    return {
      title: stepCardTitle(2),
      body: 'Step 1 done. Step 2 · FX invoices raised is the latest card — Continue there.',
      advanced: true,
      deskStep: 2,
    }
  }

  // Step 2 · Invoice → Step 3 · MZN
  if (phase === 'awaiting_invoice' || (deskStep === 2 && !phase)) {
    await completeStepCard(adminUid, tickets.invoicePrompt, now)
    await completeStepCard(adminUid, tickets.invoicePack, now)
    const ledger =
      parseOrderLedger(data.orderLedger) ||
      (num(data.orderSellRate, 0) > 0
        ? buildOrderLedger({
            zar: num(data.expectedOrderZar, 0),
            sellRate: num(data.orderSellRate, 0),
            baseCostRate:
              num((data.frozenQuote as { costRate?: number } | undefined)?.costRate, 0) ||
              num(data.orderSellRate, 0) / 1.1,
            windowZar: num(data.authorisedZar, 0),
          })
        : null)
    const expectedMzn = ledger?.mznAtSell ?? num(data.expectedOrderMzn, 0)
    const orderZar = ledger?.zar ?? num(data.expectedOrderZar, 0)
    const bal = await mznWalletBalance(adminUid)
    const step3Id = tickets.mzn
    const covered = mznCoversRestock(expectedMzn, bal, [])
    const sentence = covered
      ? 'MZN cover is on the books, sized at the sell rate.'
      : 'Waiting for full MZN cover, sized at the sell rate.'
    const plannedStep3 = plannedWriteFields(data, cycleNumber)
    await db
      .collection('users')
      .doc(adminUid)
      .collection('activityEvents')
      .doc(step3Id)
      .set(
        {
          id: step3Id,
          kind: CONVERSION_ROUTING_KIND,
          title: stepCardTitle(3),
          body: sentence,
          deskSentence: sentence,
          deskStatusChip: covered ? 'Covered' : 'Waiting',
          deskNextFooter: 'Step 4 · Send ZAR opens in 24h',
          deskLedgerRows: [
            { label: 'Cover needed', value: formatMznMoney(expectedMzn), valueStrong: true },
            { label: 'For', value: formatZarMoney(orderZar) },
            {
              label: 'Sell rate',
              value: ledger ? `${formatRate4(ledger.sellRate)} MZN/ZAR` : '—',
            },
            { label: 'Wallet', value: formatMznMoney(bal) },
          ],
          orderLedger: ledger,
          ...plannedStep3,
          dropdownTitle: stepCardTitle(3),
          dropdownBody: covered ? 'MZN covered — Next 24h to send' : 'Waiting on MZN',
          actorType: 'ai_manager',
          avatarKind: 'convert_mzn',
          amountCurrency: 'MZN',
          amountValue: expectedMzn,
          amountSign: 'credit',
          txId: step3Id,
          hasDownloadButton: false,
          awaitingConfirm: true,
          routingBlocked: false,
          status: 'awaiting_execution',
          routingAction: 'step',
          deskSpeaker: 'amina',
          cyclePhase: 'awaiting_mzn',
          deskStep: 3,
          testRunId,
          cycleNumber,
          createdAt: now,
          recordingSource: 'SYSTEM',
        },
        { merge: true }
      )
    await testRef.set(
      {
        cyclePhase: 'awaiting_mzn',
        deskStep: 3,
        awaitingKind: 'step',
        updatedAt: now,
      },
      { merge: true }
    )
    return {
      title: stepCardTitle(3),
      body: covered
        ? 'Step 2 done. Step 3 · MZN is prefunded — Continue to open Leo’s send.'
        : 'Step 2 done. Step 3 · MZN is waiting on full cover — Continue when funded.',
      advanced: true,
      deskStep: 3,
    }
  }

  // Step 3 · MZN → Step 4 · Send
  if (phase === 'awaiting_mzn' || (deskStep === 3 && !phase)) {
    const expectedMzn = num(data.expectedOrderMzn, 0)
    const bal = await mznWalletBalance(adminUid)
    if (!mznCoversRestock(expectedMzn, bal, [])) {
      return {
        title: stepCardTitle(3),
        body: `Still short on MZN (need ~${roundMoney(expectedMzn).toLocaleString('en-ZA')}; wallet ${roundMoney(bal).toLocaleString('en-ZA')}). Fund then Continue.`,
        advanced: false,
        deskStep: 3,
      }
    }
    await completeStepCard(adminUid, tickets.mzn, now)
    await ensureLeoSendEvent(adminUid, testRunId, cycleNumber, now)
    await testRef.set(
      {
        cyclePhase: 'awaiting_mzn',
        deskStep: 4,
        awaitingKind: 'deploy',
        updatedAt: now,
      },
      { merge: true }
    )
    await tryAdvanceContinuousCycle()
    const after = (await testRef.get()).data() || {}
    const afterPhase = String(after.cyclePhase || '')
    return {
      title: stepCardTitle(4),
      body:
        afterPhase === 'awaiting_send'
          ? 'Step 3 done. Step 4 · Send ZAR is open — Continue when ZAR has left.'
          : afterPhase === 'awaiting_continue'
            ? 'Step 3 done. ZAR float is short — add ZAR, then Continue on Step 4.'
            : 'Step 3 done. Opening Step 4 · Send ZAR.',
      advanced: true,
      deskStep: 4,
    }
  }

  if (phase === 'awaiting_send' || phase === 'awaiting_continue') {
    return {
      title: stepCardTitle(4),
      body: 'Step 4 is already open — Continue / I’ve sent ZAR on Leo’s card.',
      advanced: false,
      deskStep: 4,
    }
  }

  return {
    title: 'Nothing to advance',
    body: 'No sequential step is waiting on Continue.',
    advanced: false,
    deskStep: deskStep || 0,
  }
}

/**
 * Continuous cycle advance:
 * awaiting_mzn → (MZN in full) → ZAR float check → awaiting_send | awaiting_continue
 * awaiting_continue → (ZAR injected) → awaiting_send
 */
export async function tryAdvanceContinuousCycle(): Promise<void> {
  const adminUid = ROUTING_ADMIN_UID
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) return
  const testRef = db.collection(TESTS).doc(testRunId)
  const snap = await testRef.get()
  const data = snap.data() || {}
  if (data.status !== 'active') return
  const phase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
  // Only unlock Leo after Step 3 Continue (deskStep >= 4). Legacy runs use deskStep 0.
  const deskStep = num(data.deskStep, 0)
  if (phase !== 'awaiting_mzn' && phase !== 'awaiting_continue') return
  if (deskStep >= 1 && deskStep < 4) return

  const cycleNumber = num(data.awaitingCycleNumber, 0)
  const expectedZar = num(data.expectedOrderZar, 0)
  const expectedMzn = num(data.expectedOrderMzn, 0)
  if (!(cycleNumber > 0) || !(expectedZar > 0)) return

  const nowGate = admin.firestore.Timestamp.now()
  const eventRef = await ensureLeoSendEvent(adminUid, testRunId, cycleNumber, nowGate)
  const eventSnap = await eventRef.get()
  if (!eventSnap.exists) return
  const issuedAt = eventSnap.data()?.createdAt
  const issuedMs = typeof issuedAt?.toMillis === 'function' ? issuedAt.toMillis() : 0

  if (phase === 'awaiting_mzn') {
    const [mznBal, mznEvents] = await Promise.all([
      mznWalletBalance(adminUid),
      db.collection('bankMznEvents').limit(80).get(),
    ])
    const received = mznEvents.docs
      .filter((doc) => {
        if (doc.data().matchedCycle) return false
        const at = Date.parse(String(doc.data().createdAt || ''))
        return Number.isFinite(at) && (!issuedMs || at >= issuedMs)
      })
      .map((doc) => Number(doc.data().amountMzn || 0))
    if (!mznCoversRestock(expectedMzn, mznBal, received)) return
  }

  const zarBal = await zarWalletBalance(adminUid)
  const now = admin.firestore.Timestamp.now()

  if (zarBal + 0.5 < expectedZar) {
    const continueId = `continue-zar-${testRunId}-c${cycleNumber}`
    const continueRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(continueId)
    if (!(await continueRef.get()).exists) {
      const shortfall = roundMoney(expectedZar - zarBal)
      await continueRef.set({
        id: continueId,
        kind: CONVERSION_ROUTING_KIND,
        title: stepCardTitle(4, 'Add ZAR'),
        body: [
          `Order ${formatZar(expectedZar)} is funded in MZN.`,
          `ZAR float is short by ${formatZar(shortfall)}.`,
          'Add ZAR (or tap $ within the daily ceiling). Continue walks the schedule — this does not raise the daily volume ceiling.',
        ].join('\n'),
        dropdownTitle: stepCardTitle(4, 'Add ZAR'),
        dropdownBody: `Need ${formatZar(shortfall)} more ZAR for order ${cycleNumber}`,
        actorType: 'ai_manager',
        avatarKind: 'convert_zar',
        amountCurrency: 'ZAR',
        amountValue: shortfall,
        amountSign: 'debit',
        txId: continueId,
        hasDownloadButton: false,
        awaitingConfirm: false,
        routingBlocked: true,
        status: 'recorded',
        routingAction: 'advice',
        deskSpeaker: 'sam',
        testRunId,
        cycleNumber,
        cyclePhase: 'awaiting_continue',
        deskStep: 4,
        createdAt: now,
        recordingSource: 'SYSTEM',
      })
    }
    await testRef.set(
      {
        cyclePhase: 'awaiting_continue',
        updatedAt: now,
      },
      { merge: true }
    )
    return
  }

  // Unlock Leo send for the scheduled order — rewrite body with live weighted bank COST.
  const cycleSnapForUnlock = await testRef.collection('cycles').doc(String(cycleNumber)).get()
  const cycleForUnlock = cycleSnapForUnlock.data() || {}
  const unlockAssignments = Array.isArray(cycleForUnlock.cardAssignments)
    ? (cycleForUnlock.cardAssignments as CyclePlan['cardAssignments'])
    : []
  const unlockSplits = ticketSplitsFromAssignments(unlockAssignments)
  const unlockState = stateFromDoc(data)
  const unlockQuotes = await applyLiveQuotes(unlockState)
  const unlockEcon =
    unlockAssignments.length > 0
      ? weightedBankCostEconomics(unlockAssignments, unlockQuotes.sellRate, unlockQuotes.costRate)
      : null
  const unlockPlan = {
    cycleNumber,
    availableCapital: num(cycleForUnlock.availableCapital, unlockState.availableCapital),
    deployedAmount: expectedZar,
    idleCapital: num(cycleForUnlock.idleCapital, 0),
    expectedProfit: unlockEcon?.grossProfitMzn ?? num(cycleForUnlock.expectedProfit, 0),
    expectedZarProfit: num(cycleForUnlock.expectedZarProfit, 0),
    cardCountUsed: unlockAssignments.length,
    cardAssignments: unlockAssignments,
    restingCardIds: Array.isArray(cycleForUnlock.restingCardIds) ? cycleForUnlock.restingCardIds : [],
    restingMachineIds: Array.isArray(cycleForUnlock.restingMachineIds)
      ? cycleForUnlock.restingMachineIds
      : [],
    bufferUsedBefore: num(cycleForUnlock.bufferUsed, unlockState.bufferUsed),
    bufferActionRequired: false,
    selectionReason: typeof cycleForUnlock.selectionReason === 'string' ? cycleForUnlock.selectionReason : '',
  } as CyclePlan
  const unlockCopy = buildActivityCopy(
    unlockPlan,
    unlockState.config.cycleCount,
    'awaiting_execution',
    unlockState.config.spread,
    unlockQuotes,
    { state: unlockState }
  )

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(testRef)
    const freshPhase = fresh.data()?.cyclePhase
    if (freshPhase !== 'awaiting_mzn' && freshPhase !== 'awaiting_continue') return
    tx.update(eventRef, {
      awaitingConfirm: true,
      routingBlocked: false,
      status: 'awaiting_execution',
      cyclePhase: 'awaiting_send',
      deskStep: 4,
      title: stepCardTitle(4),
      body: `${unlockCopy.body} Send ZAR opens the keypad — then Next 24h can finish the day.`,
      ticketSplits: unlockSplits,
    })
    tx.set(
      testRef,
      {
        cyclePhase: 'awaiting_send',
        awaitingKind: 'deploy',
        awaitingCycleNumber: cycleNumber,
        updatedAt: now,
      },
      { merge: true }
    )
    tx.set(
      testRef.collection('cycles').doc(String(cycleNumber)),
      {
        cyclePhase: 'awaiting_send',
        routingBlocked: false,
        status: 'awaiting_execution',
        updatedAt: now,
      },
      { merge: true }
    )
  })

  // Mark recent MZN receipts as matched to this cycle (best-effort).
  const mark = `${testRunId}:${cycleNumber}`
  const mznEvents = await db.collection('bankMznEvents').limit(80).get()
  await Promise.all(
    mznEvents.docs
      .filter((doc) => {
        if (doc.data().matchedCycle) return false
        const at = Date.parse(String(doc.data().createdAt || ''))
        return Number.isFinite(at) && (!issuedMs || at >= issuedMs)
      })
      .slice(0, 20)
      .map((doc) => doc.ref.set({ matchedCycle: mark }, { merge: true }))
  )
}

async function loadFnbDeskLines(): Promise<string> {
  try {
    const [events, floats, mznEvents, capitecEvents, mozaEvents] = await Promise.all([
      db.collection('bankFnbEvents').limit(20).get(),
      db.collection('fnbCardFloat').limit(20).get(),
      db.collection('bankMznEvents').limit(20).get(),
      db.collection('bankCapitecEvents').limit(20).get(),
      db.collection('bankMozaEvents').limit(20).get(),
    ])
    const lines: string[] = []
    for (const doc of floats.docs) {
      const row = doc.data() as { reservedZar?: number; receiptedZar?: number; availableZar?: number | null }
      const available = typeof row.availableZar === 'number' ? `R${row.availableZar.toFixed(2)} available` : 'available ZAR not set'
      lines.push(
        `FNB card ${doc.id}: reserved R${Number(row.reservedZar || 0).toFixed(2)}, receipted R${Number(row.receiptedZar || 0).toFixed(2)}, ${available}.`
      )
    }
    for (const doc of mozaEvents.docs) {
      const row = doc.data() as {
        kind?: string
        amountZar?: number
        amountMzn?: number
        canonicalCardId?: string
        merchant?: string | null
        canEmitUsableZar?: boolean
      }
      if (row.kind !== 'card_purchase' || !(Number(row.amountZar) > 0)) continue
      const card = row.canonicalCardId || doc.id
      const where = row.merchant ? ` @ ${row.merchant}` : ''
      const usable = row.canEmitUsableZar === true ? 'processed ZAR' : 'evidence only'
      lines.push(`Moza ${card}: R${Number(row.amountZar || 0).toFixed(2)}${where} (${usable}).`)
    }
    const notices = events.docs
      .map((doc) => doc.data() as {
        kind?: string
        amountZar?: number
        cardLast4?: string | null
        accountLast4?: string
        counterparty?: string
        reference?: string | null
        paidOn?: string | null
        merchant?: string
        forwarded?: boolean
        reservedOn?: string
        status?: string
        occurredAt?: string
        authCode?: string
        rrn?: string
        uti?: string
        createdAt?: string
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 8)
    for (const row of notices) {
      const amount = typeof row.amountZar === 'number' ? `R${row.amountZar.toFixed(2)}` : 'an amount'
      const card = row.cardLast4 ? `card ${row.cardLast4}` : 'a card'
      const merchant = row.merchant ? ` at ${row.merchant}` : ''
      const via = row.forwarded === true ? ' Forwarded from Gmail, sender was not FNB.' : ' Direct from FNB.'
      if (row.kind === 'card_spend') {
        lines.push(`FNB reserved ${amount} on ${card}${merchant}.${row.reservedOn ? ` ${row.reservedOn}.` : ''}${via}`)
      } else if (row.kind === 'conversion_receipt') {
        const refs = [row.authCode ? `auth ${row.authCode}` : '', row.rrn ? `RRN ${row.rrn}` : '', row.uti ? `UTI ${row.uti}` : '']
          .filter(Boolean)
          .join(', ')
        lines.push(
          `FNB ${row.status || 'recorded'} ${amount} on ${card}${merchant}${row.occurredAt ? `, ${row.occurredAt}` : ''}.${refs ? ` ${refs}.` : ''}${via}`
        )
      } else if (row.kind === 'pos_credit') {
        const acct = row.accountLast4 ? `account ${row.accountLast4}` : 'a current account'
        const who = row.counterparty ? ` from ${row.counterparty}` : ''
        const ref = row.reference ? ` Ref ${row.reference}.` : ''
        const when = row.paidOn ? ` ${row.paidOn}.` : ''
        lines.push(`FNB POS paid in ${amount} to ${acct}${who}.${ref}${when}${via}`)
      }
    }
    for (const doc of mznEvents.docs) {
      const row = doc.data() as { amountMzn?: number; beneficiary?: string | null; operationNumber?: string | null }
      const amount = typeof row.amountMzn === 'number' ? `${row.amountMzn.toFixed(2)} MZN` : 'an MZN amount'
      const who = row.beneficiary ? ` for ${row.beneficiary}` : ''
      const ref = row.operationNumber ? ` Operation ${row.operationNumber}.` : ''
      lines.push(`MZN received ${amount}${who}.${ref} Screenshot proof, added to the MZN wallet.`)
    }
    for (const doc of capitecEvents.docs) {
      const row = doc.data() as {
        kind?: string
        amountZar?: number
        paidOutZar?: number
        salesZar?: number
        commissionZar?: number
        vatZar?: number
        merchant?: string | null
        status?: string
        transactionNumber?: string | null
        cardLast4?: string | null
        reference?: string | null
        payoutOn?: string | null
      }
      if (row.kind === 'settlement_summary') {
        const net = typeof row.paidOutZar === 'number' ? `R${row.paidOutZar.toFixed(2)}` : 'a net amount'
        const sales = typeof row.salesZar === 'number' ? ` Sales R${row.salesZar.toFixed(2)}` : ''
        const fee = typeof row.commissionZar === 'number' ? `, commission R${row.commissionZar.toFixed(2)}, VAT R${Number(row.vatZar || 0).toFixed(2)}` : ''
        const when = row.payoutOn ? ` on ${row.payoutOn}` : ''
        const ref = row.reference ? ` Reference ${row.reference}.` : ''
        lines.push(`Capitec settlement paid out ${net}${when}.${sales}${fee}.${ref} The ZAR card is unchanged.`)
        continue
      }
      const amount = typeof row.amountZar === 'number' ? `R${row.amountZar.toFixed(2)}` : 'an amount'
      const where = row.merchant ? ` at ${row.merchant}` : ''
      const card = row.cardLast4 ? ` on card ${row.cardLast4}` : ''
      const ref = row.transactionNumber ? ` Transaction ${row.transactionNumber}.` : ''
      lines.push(`Capitec ${row.status || 'recorded'} ${amount}${where}${card}.${ref}`)
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

async function loadDeskOperator(adminUid: string): Promise<DeskOperator> {
  try {
    const snap = await db.collection('users').doc(adminUid).get()
    const data = snap.exists ? snap.data() || {} : {}
    const fullName = typeof data.fullName === 'string' && data.fullName.trim() ? data.fullName.trim() : undefined
    const rawHandle =
      typeof data.userHandle === 'string' && data.userHandle.trim()
        ? data.userHandle.trim()
        : typeof data.handle === 'string' && data.handle.trim()
          ? data.handle.trim()
          : undefined
    const handle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : undefined
    return {
      fullName,
      firstName: fullName ? fullName.split(/\s+/)[0] : undefined,
      handle,
    }
  } catch {
    return {}
  }
}

function partOfDaySast(nowMs: number): string {
  const hour = sastParts(nowMs).hour
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

function minutesAgoLabel(thenMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - thenMs) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

function deskMoment(params: {
  nowMs: number
  recentCycles?: RecentCycleBrief[]
  awaiting?: { kind?: string; issuedAtMs?: number | null; amountZar?: number }
}): DeskMoment {
  const parts = sastParts(params.nowMs)
  const activity: string[] = []
  const cycles = [...(params.recentCycles || [])]
    .filter((row) => row.cycleNumber > 0 && (row.completedAtMs || row.createdAtMs))
    .sort((a, b) => (a.completedAtMs || a.createdAtMs || 0) - (b.completedAtMs || b.createdAtMs || 0))
    .slice(-4)
  for (const row of cycles) {
    const at = row.completedAtMs || row.createdAtMs || 0
    const sold = row.deployedAmount ?? row.assignments.reduce((sum, item) => sum + (item.amount || 0), 0)
    activity.push(
      `${formatVisibleSast(at, params.nowMs)} (${minutesAgoLabel(at, params.nowMs)}): Day ${row.cycleNumber} ${row.status === 'completed' ? 'sold' : row.status || 'issued'} ${formatZar(sold)}.`
    )
  }
  if (params.awaiting?.issuedAtMs) {
    const who = params.awaiting.kind === 'replenish' ? 'Amina' : 'Leo'
    const what = params.awaiting.kind === 'replenish' ? 'restock' : 'ZAR sale'
    activity.push(
      `${formatVisibleSast(params.awaiting.issuedAtMs, params.nowMs)} (${minutesAgoLabel(params.awaiting.issuedAtMs, params.nowMs)}): ${who} put the ${what}${params.awaiting.amountZar ? ` of ${formatZar(params.awaiting.amountZar)}` : ''} on the desk. Still waiting.`
    )
  }
  return {
    clockLine: formatSast(params.nowMs),
    partOfDay: partOfDaySast(params.nowMs),
    weekend: parts.weekday === 0,
    activity,
  }
}

function deskThread(recentFeedback: RecentFeedbackBrief[], nowMs: number): DeskExchange[] {
  return [...recentFeedback]
    .filter((row) => row.rawMessage.trim() && (row.replyBody || row.summary))
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0))
    .slice(-6)
    .map((row) => ({
      atLabel: row.createdAtMs ? formatVisibleSast(row.createdAtMs, nowMs) : 'earlier',
      you: row.rawMessage.trim(),
      speaker: row.speaker || 'sam',
      desk: (row.replyBody || row.summary || '').trim().slice(0, 600),
    }))
}

async function voiceDeskCard(params: {
  adminUid: string
  testRunId: string
  speaker: 'sam' | 'leo' | 'amina'
  message: string
  state: RoutingState
  walletZar: number
  fact?: string
  sellRate?: number
  costRate?: number
  awaitingKind?: string
  current?: { kind: 'replenish' | 'deploy'; assignments: Array<{ cardId: number; machineId: number; amount: number }>; amountZar: number } | null
  holdReason?: string | null
  routingBlocked?: boolean
}) {
  const nowMs = Date.now()
  const [operator, recentCycles, recentFeedback, bankLines] = await Promise.all([
    loadDeskOperator(params.adminUid),
    loadRecentCycleBriefs(params.testRunId).catch(() => [] as RecentCycleBrief[]),
    loadRecentFeedbackBriefs(params.testRunId),
    loadFnbDeskLines(),
  ])
  const visuals = buildDeskVisuals({
    state: params.state,
    recentCycles,
    current: params.current || null,
    awaitingKind: params.awaitingKind,
    holdReason: params.holdReason,
    routingBlocked: params.routingBlocked,
    sellRate: params.sellRate,
    costRate: params.costRate,
    walletZar: params.walletZar,
  })
  return converseAtDesk({
    speaker: params.speaker,
    message: params.message,
    brief: [visuals.snapshot, bankLines].filter(Boolean).join('\n'),
    visuals,
    deskFact: params.fact,
    operator,
    thread: deskThread(recentFeedback, nowMs),
    moment: deskMoment({ nowMs, recentCycles }),
  })
}

async function publishNextWindowCard(params: {
  adminUid: string
  testRunId: string
  state: RoutingState
  message: string
  walletZar: number
}): Promise<{ title: string; body: string; recommendedZar: number; canOpen: boolean }> {
  const offer = nextWindowOffer({
    authorisedZar: params.state.authorisedZar,
    profitZar: params.state.cumulativeSpread,
    walletZar: params.walletZar,
  })
  const named = zarAmountFromMessage(params.message)
  const speaker = addressedDeskAgent(params.message)
  const finished = windowIsFinished(params.state)
  const opening = finished && (acceptsNextWindow(params.message) || (named != null && /\b(open|start|use|inject)\b/i.test(params.message)))
  if (opening) {
    const amount = named && named > 0 ? named : offer.recommendedZar
    if (!(amount > 0) || amount > params.walletZar + 0.01) {
      const fact = !(params.walletZar > 0)
        ? offer.body
        : `The ZAR wallet has ${formatZar(params.walletZar)}. That does not cover ${formatZar(amount)}. Add ZAR, or name an amount the wallet can fund.`
      const spoken = await voiceDeskCard({
        adminUid: params.adminUid,
        testRunId: params.testRunId,
        speaker,
        message: params.message,
        state: params.state,
        walletZar: params.walletZar,
        fact,
      })
      await writeNextWindowAdvice({
        ...params,
        speaker,
        title: spoken.title ? sideCardTitle('advice', spoken.title) : windowCardTitle('Add ZAR'),
        body: spoken.body,
        canOpen: false,
        recommendedZar: offer.recommendedZar,
        cancelOpen: true,
        deskTable: spoken.table,
        deskChart: spoken.chart,
      })
      return { title: spoken.title ? sideCardTitle('advice', spoken.title) : windowCardTitle('Add ZAR'), body: spoken.body, recommendedZar: offer.recommendedZar, canOpen: false }
    }
    await startNewTest(
      params.adminUid,
      true,
      amount,
      `Window opened: ${formatZar(amount)} to convert over 14 weekdays.`
    )
    const body = `Next window opened at ${formatZar(amount)}. Day 1 is on the desk.`
    return { title: windowCardTitle('Opened'), body, recommendedZar: amount, canOpen: true }
  }
  const fact = finished
    ? offer.body
    : `This window still has ${formatZar(residualToTarget(params.state))} of ${formatZar(params.state.authorisedZar)} to convert. I open the next one when that reaches zero.`
  const spoken = await voiceDeskCard({
    adminUid: params.adminUid,
    testRunId: params.testRunId,
    speaker,
    message: params.message,
    state: params.state,
    walletZar: params.walletZar,
    fact,
  })
  const title = spoken.title
    ? sideCardTitle('advice', spoken.title)
    : finished
      ? windowCardTitle(offer.canOpen ? 'Opened' : 'Add ZAR')
      : askCardTitle('Window')
  await writeNextWindowAdvice({
    ...params,
    speaker,
    title,
    body: spoken.body,
    canOpen: finished && offer.canOpen,
    recommendedZar: offer.recommendedZar,
    cancelOpen: finished,
    deskTable: spoken.table,
    deskChart: spoken.chart,
  })
  return { title, body: spoken.body, recommendedZar: offer.recommendedZar, canOpen: finished && offer.canOpen }
}

async function writeNextWindowAdvice(params: {
  adminUid: string
  testRunId: string
  state: RoutingState
  message: string
  speaker: 'sam' | 'leo' | 'amina'
  title: string
  body: string
  canOpen: boolean
  recommendedZar: number
  cancelOpen: boolean
  deskTable?: { id: string; title: string; columns: string[]; rows: Array<{ cells: string[] }> }
  deskChart?: {
    id: string
    title: string
    unit: 'ZAR' | 'MZN'
    series: Array<{ label: string; points: Array<{ label: string; value: number }> }>
  }
}): Promise<void> {
  const now = admin.firestore.Timestamp.now()
  const feedbackId = `window-${now.toMillis()}`
  const testRef = db.collection(TESTS).doc(params.testRunId)
  if (params.cancelOpen) {
    await cancelAwaitingRoutingEvents(params.adminUid, now, (row) => row.testRunId === params.testRunId)
  }
  await db.runTransaction(async (tx) => {
    publishAdviceCard(tx, {
      adminUid: params.adminUid,
      testRunId: params.testRunId,
      cycleNumber: params.state.completedCycles || params.state.config.cycleCount,
      feedbackId,
      now,
      title: params.title,
      body: params.body,
      userReply: params.message,
      routingAction: 'advice',
      startNextRun: params.canOpen,
      deskSpeaker: params.speaker,
      deskTable: params.deskTable,
      deskChart: params.deskChart,
    })
    if (params.message.trim()) {
      tx.set(testRef.collection('feedback').doc(feedbackId), {
        id: feedbackId,
        adminUserId: params.adminUid,
        cycleNumber: params.state.completedCycles || params.state.config.cycleCount,
        rawMessage: params.message,
        replyBody: params.body,
        deskSpeaker: params.speaker,
        status: 'advice',
        createdAt: now,
      })
    }
    tx.set(
      testRef,
      {
        ...(params.cancelOpen ? { awaitingCycleNumber: null, awaitingKind: null } : {}),
        nextWindowZar: params.recommendedZar,
        updatedAt: now,
      },
      { merge: true }
    )
  })
}

async function issueCycle(
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp,
  options?: { immediateAttempts?: boolean; skipInvoices?: boolean }
): Promise<{ plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' }> {
  // Continuous desk: first swipe is now — the calendar path must not interrupt Day 0…n.
  const immediateAttempts = options?.immediateAttempts !== false
  const skipInvoices = options?.skipInvoices === true
  if (windowIsFinished(state)) {
    const walletZar = await zarWalletBalance(adminUid)
    const offer = nextWindowOffer({
      authorisedZar: state.authorisedZar,
      profitZar: state.cumulativeSpread,
      walletZar,
    })
    const feedbackId = `window-${now.toMillis()}`
    const testRef = db.collection(TESTS).doc(testRunId)
    const spoken = await voiceDeskCard({
      adminUid,
      testRunId,
      speaker: 'sam',
      message: '',
      state,
      walletZar,
      fact: offer.body,
    })
    const activityEventId = await db.runTransaction(async (tx) => {
      const id = publishAdviceCard(tx, {
        adminUid,
        testRunId,
        cycleNumber: state.completedCycles || state.config.cycleCount,
        feedbackId,
        now,
        title: spoken.title || offer.title,
        body: spoken.body,
        userReply: '',
        routingAction: 'advice',
        startNextRun: offer.canOpen,
        deskSpeaker: 'sam',
        deskTable: spoken.table,
        deskChart: spoken.chart,
      })
      tx.set(
        testRef,
        {
          awaitingCycleNumber: null,
          awaitingKind: null,
          nextWindowZar: offer.recommendedZar,
          updatedAt: now,
        },
        { merge: true }
      )
      return id
    })
    const plan = planCycle(state)
    return {
      plan: { ...plan, deployedAmount: 0, cardCountUsed: 0, cardAssignments: [], holdReason: offer.body },
      activityEventId,
      kind: 'deploy',
    }
  }
  const quoted = await applyLiveQuotes(state)
  const testSnap = await db.collection(TESTS).doc(testRunId).get()
  const testData = testSnap.data() || {}
  const book = pathBookFromDoc(testData, quoted.quote)
  const plannedMeta = plannedWriteFields(testData)
  // Frozen ledger from the completed sale — Step 5 restock must read the same cost figures.
  const priorOrderLedger =
    parseOrderLedger(testData.orderLedger) ||
    (state.completedCycles > 0
      ? parseOrderLedger(
          (
            await db
              .collection(TESTS)
              .doc(testRunId)
              .collection('cycles')
              .doc(String(state.completedCycles))
              .get()
          ).data()?.orderLedger
        )
      : null)
  // Cold open (Day 1) does not need the full belief history — keep `$` under the callable limit.
  const evidence = state.completedCycles > 0 ? await loadRecentRouteEvidence(80) : []
  try {
    return await db.runTransaction(async (tx) =>
      writeIssuedCycle(
        tx,
        adminUid,
        testRunId,
        quoted.state,
        now,
        quoted,
        EMPTY_OVERLAY,
        book,
        evidence,
        immediateAttempts,
        priorOrderLedger,
        plannedMeta
      )
    ).then(async (issued) => {
      // Continuous order: Sam Step 1 only. Leo / invoices wait for Continue.
      try {
        await publishSamDayBrief({
          adminUid,
          testRunId,
          state: quoted.state,
          plan: issued.plan,
          kind: issued.kind,
          now,
        })
      } catch (error) {
        console.warn('[issueCycle] Sam day brief skipped', error)
      }
      // Retire any premature Leo card so Step 4 cannot appear before Step 1.
      if (issued.kind === 'deploy') {
        const leoId = eventId(testRunId, issued.plan.cycleNumber)
        const leoRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(leoId)
        const leoSnap = await leoRef.get()
        if (leoSnap.exists && leoSnap.data()?.status !== 'completed') {
          await leoRef.set(
            {
              awaitingConfirm: false,
              routingBlocked: true,
              status: 'cancelled',
              title: stepCardTitle(4, 'Waiting'),
              body: 'Step 4 unlocks after Step 1 → 2 → 3 Continue.',
              updatedAt: now,
            },
            { merge: true }
          )
        }
      }
      void skipInvoices
      return issued
    })
  } catch (error) {
    console.error('[issueCycle] persist failed; writing instruction only', error)
    return writeInstructionOnly(adminUid, testRunId, quoted.state, now, quoted, book)
  }
}

async function publishSamDayBrief(input: {
  adminUid: string
  testRunId: string
  state: RoutingState
  plan: CyclePlan
  kind: 'deploy' | 'replenish'
  now: admin.firestore.Timestamp
  revision?: number
  forceReplay?: boolean
}): Promise<void> {
  // Recycle is Step 5 on Amina's restock card — never post a fake Step 1 for it.
  if (input.kind === 'replenish') return

  const schedule = scheduleTicketPath({
    assignments: input.plan.cardAssignments.length
      ? input.plan.cardAssignments
      : [{ cardId: 0, machineId: 0, amount: 0 }],
    nowMs: input.now.toMillis(),
    immediate: true,
  })
  const rev = Math.max(1, Math.floor(Number(input.revision) || 1))
  const id = dayTicketIds(input.testRunId, input.plan.cycleNumber, rev).order
  const ref = db.collection('users').doc(input.adminUid).collection('activityEvents').doc(id)
  const existing = await ref.get()
  const existingStatus = String(existing.data()?.status || '')
  // Already advanced past this Step 1 — leave the completed card alone (unless schedule replay).
  if (
    !input.forceReplay &&
    existing.exists &&
    (existingStatus === 'completed' || existingStatus === 'cancelled' || existingStatus === 'superseded')
  ) {
    return
  }

  const hold = !(input.plan.deployedAmount > 0)
  const testSnap = await db.collection(TESTS).doc(input.testRunId).get()
  const testData = testSnap.data() || {}
  const eftBook = eftBookFromDoc(testData)
  const sellRate = num(testData.orderSellRate, 0) || undefined
  const orderLedger =
    parseOrderLedger(testData.orderLedger) ||
    (sellRate && input.plan.deployedAmount > 0
      ? buildOrderLedger({
          zar: input.plan.deployedAmount,
          sellRate,
          baseCostRate:
            num((testData.frozenQuote as { costRate?: number } | undefined)?.costRate, 0) || sellRate / 1.1,
          cardAssignments: input.plan.cardAssignments || [],
          windowZar: num(testData.authorisedZar, 0),
          eftTickets: (eftBook?.tickets || [])
            .filter((t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed'))
            .map((t) => ({ amount: t.amountZar, dueIso: t.expectedSettledBy || null })),
        })
      : null)
  const mznInventory = await mznWalletBalance(input.adminUid).catch(() => undefined)
  const routingStepMessage = buildOrderStepMessage({
    cycleNumber: input.plan.cycleNumber,
    sentAt: formatVisibleSast(input.now.toMillis()),
    cardAssignments: input.plan.cardAssignments || [],
    eftTickets: eftBook?.tickets,
    orderLedger,
    sellRate: orderLedger?.sellRate ?? sellRate,
    mznInventory,
    cardLaneComplete: false,
    invoicesRaised: false,
    next: hold
      ? { stepNumber: 1, stepName: 'Order', opensIn: 'next day' }
      : { stepNumber: 2, stepName: 'Invoice', opensIn: '24h' },
  })
  const eftZar = num(input.plan.openEftZar, routingStepMessage.rails.find((r) => r.kind === 'eft')?.total || 0)
  const mix =
    input.plan.channelMix ||
    (eftZar > 0 && (input.plan.deployedAmount || 0) > 0 ? 'mixed' : eftZar > 0 ? 'eft' : 'card')
  const body = routingStepMessage.summary
  const title = stepCardTitle(1)
  const planned = plannedWriteFields(testData, input.plan.cycleNumber)
  // Upsert so a stale recycle-mislabeled brief (no Continue) is repaired on Day n open.
  await ref.set(
    {
      id,
      kind: CONVERSION_ROUTING_KIND,
      title,
      body,
      deskSentence: body,
      dropdownTitle: title,
      dropdownBody: body,
      actorType: 'ai_manager',
      avatarKind: 'convert_zar',
      amountCurrency: 'ZAR',
      amountValue: routingStepMessage.clientTotal || input.plan.deployedAmount || 0,
      amountSign: 'debit',
      txId: id,
      hasDownloadButton: false,
      awaitingConfirm: !hold,
      routingBlocked: false,
      status: hold ? 'recorded' : 'awaiting_execution',
      routingAction: hold ? 'advice' : 'step',
      deskSpeaker: 'sam',
      deskChannel: mix,
      openEftZar: eftZar,
      routingStepMessage,
      orderLedger,
      ...planned,
      cyclePhase: hold ? 'hold' : 'order_open',
      deskStep: 1,
      dayTicketRevision: rev,
      testRunId: input.testRunId,
      cycleNumber: input.plan.cycleNumber,
      earliestAttemptAt: schedule.earliestAt,
      ticketPath: schedule,
      recordingSource: 'SYSTEM',
      createdAt: input.now,
      updatedAt: input.now,
    },
    { merge: true }
  )
}

/**
 * Step 6 · What happened — same card as Order with card lane marked complete.
 * Gates Day n+1 until Continue / Next 24h advances it.
 */
async function publishWhatHappened(input: {
  adminUid: string
  testRunId: string
  cycleNumber: number
  now: admin.firestore.Timestamp
}): Promise<void> {
  const testRef = db.collection(TESTS).doc(input.testRunId)
  const testSnap = await testRef.get()
  const testData = testSnap.data() || {}
  const rev = dayTicketRevision(testData)
  const id = dayTicketIds(input.testRunId, input.cycleNumber, rev).whatHappened
  const cycleSnap = await testRef.collection('cycles').doc(String(input.cycleNumber)).get()
  const cycleData = cycleSnap.data() || {}
  const assignments = Array.isArray(cycleData.cardAssignments)
    ? (cycleData.cardAssignments as Array<{ cardId: number; machineId: number; amount: number }>)
    : []
  const eftBook = eftBookFromDoc(testData)
  const sellRate = num(cycleData.sellRate, num(testData.orderSellRate, 0)) || undefined
  const orderLedger =
    parseOrderLedger(cycleData.orderLedger) ||
    parseOrderLedger(testData.orderLedger) ||
    (sellRate && assignments.length
      ? buildOrderLedger({
          zar: roundMoney(assignments.reduce((s, r) => s + r.amount, 0)),
          sellRate,
          baseCostRate: num(cycleData.costRate, 0) || sellRate / 1.1,
          cardAssignments: assignments,
          windowZar: num(testData.authorisedZar, 0),
          eftTickets: (eftBook?.tickets || [])
            .filter((t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed'))
            .map((t) => ({ amount: t.amountZar, dueIso: t.expectedSettledBy || null })),
        })
      : null)
  const mznInventory = await mznWalletBalance(input.adminUid).catch(() => undefined)
  const ticketPath = cycleData.ticketPath as { tickets?: Array<{ timeLabel?: string | null }> } | undefined
  const swipeTimeLabel = ticketPath?.tickets?.[0]?.timeLabel || null
  const routingStepMessage = buildOrderStepMessage({
    cycleNumber: input.cycleNumber,
    sentAt: formatVisibleSast(input.now.toMillis()),
    cardAssignments: assignments,
    eftTickets: eftBook?.tickets,
    orderLedger,
    sellRate: orderLedger?.sellRate ?? sellRate,
    mznInventory,
    cardLaneComplete: true,
    invoicesRaised: true,
    swipeTimeLabel,
    next: {
      stepNumber: 1,
      stepName: 'Order',
      opensIn: 'tomorrow',
      dayLabel: `Day ${input.cycleNumber + 1}`,
    },
  })
  const title = stepCardTitle(6)
  const body = routingStepMessage.summary
  const eftZar = openEftZar(eftBook)
  const planned = plannedWriteFields(testData, input.cycleNumber)
  const nextDay = input.cycleNumber + 1
  await db
    .collection('users')
    .doc(input.adminUid)
    .collection('activityEvents')
    .doc(id)
    .set(
      {
        id,
        kind: CONVERSION_ROUTING_KIND,
        title,
        body,
        deskSentence: body,
        deskNextFooter: `Day ${nextDay} · Step 1 Order opens tomorrow`,
        deskAdvanceDay: nextDay,
        dropdownTitle: title,
        dropdownBody: body,
        actorType: 'ai_manager',
        avatarKind: 'convert_zar',
        amountCurrency: 'ZAR',
        amountValue: routingStepMessage.clientTotal,
        amountSign: 'debit',
        txId: id,
        hasDownloadButton: false,
        awaitingConfirm: true,
        routingBlocked: false,
        status: 'awaiting_execution',
        routingAction: 'step',
        deskSpeaker: 'sam',
        deskChannel: eftZar > 0 ? 'mixed' : 'card',
        openEftZar: eftZar,
        routingStepMessage,
        orderLedger,
        ...planned,
        cyclePhase: 'awaiting_day_close',
        deskStep: 6,
        dayTicketRevision: rev,
        testRunId: input.testRunId,
        cycleNumber: input.cycleNumber,
        recordingSource: 'SYSTEM',
        createdAt: input.now,
        updatedAt: input.now,
      },
      { merge: true }
    )
  await testRef.set(
    {
      cyclePhase: 'awaiting_day_close',
      deskStep: 6,
      awaitingKind: 'step',
      awaitingCycleNumber: input.cycleNumber,
      updatedAt: input.now,
    },
    { merge: true }
  )
}

/**
 * After a same-day schedule amendment with nothing irrevocable committed:
 * supersede prior Order/Invoice/MZN(/unconfirmed Send) tickets and replay them
 * at the revised amounts up to the step the desk had reached — like a hard refresh.
 */
async function replayDayTicketsAfterScheduleAmendment(params: {
  adminUid: string
  testRunId: string
  testRef: FirebaseFirestore.DocumentReference
  cycleRef: FirebaseFirestore.DocumentReference
  cycleNumber: number
  liveState: RoutingState
  nextOrderZar: number
  nextAssignments: Array<{ cardId: number; machineId: number; amount: number; economicPaymentId?: string }>
  sellRate: number
  previousDeskStep: number
  planVersion: number
  now: admin.firestore.Timestamp
}): Promise<{ replayedToStep: number }> {
  const {
    adminUid,
    testRunId,
    testRef,
    cycleRef,
    cycleNumber,
    liveState,
    nextOrderZar,
    nextAssignments,
    sellRate,
    previousDeskStep,
    planVersion,
    now,
  } = params

  const testSnap = await testRef.get()
  const priorRev = dayTicketRevision(testSnap.data() || {})
  const nextRev = Math.max(priorRev + 1, planVersion)
  const oldIds = dayTicketIds(testRunId, cycleNumber, priorRev)
  const legacyIds = dayTicketIds(testRunId, cycleNumber, 1)
  const reason = `Schedule amendment plan v${planVersion}`

  for (const id of [
    oldIds.order,
    oldIds.invoicePack,
    oldIds.invoicePrompt,
    oldIds.mzn,
    oldIds.whatHappened,
    legacyIds.order,
    legacyIds.invoicePack,
    legacyIds.invoicePrompt,
    legacyIds.mzn,
    legacyIds.whatHappened,
    eventId(testRunId, cycleNumber),
  ]) {
    await supersedeDayTicketCard(adminUid, id, now, reason)
  }

  const orderMzn = expectedMznForOrder(nextOrderZar, sellRate)
  const targetStep = Math.min(Math.max(1, previousDeskStep || 1), 4)

  await cycleRef.set(
    {
      cardAssignments: nextAssignments,
      machineAssignments: nextAssignments.map((row) => ({
        machineId: row.machineId,
        cardId: row.cardId,
        amount: row.amount,
      })),
      deployedAmount: nextOrderZar,
      expectedOrderZar: nextOrderZar,
      planVersion,
      dayTicketRevision: nextRev,
      status: 'awaiting_execution',
      updatedAt: now,
    },
    { merge: true }
  )

  await testRef.set(
    {
      expectedOrderZar: nextOrderZar,
      expectedOrderMzn: orderMzn,
      orderSellRate: sellRate,
      dayTicketRevision: nextRev,
      cyclePhase: 'order_open',
      deskStep: 1,
      awaitingKind: 'step',
      awaitingCycleNumber: cycleNumber,
      updatedAt: now,
    },
    { merge: true }
  )

  const plan: CyclePlan = {
    cycleNumber,
    availableCapital: liveState.availableCapital,
    deployedAmount: nextOrderZar,
    idleCapital: Math.max(0, liveState.availableCapital - nextOrderZar),
    expectedProfit: 0,
    cardCountUsed: nextAssignments.length,
    cardAssignments: nextAssignments,
    restingCardIds: [],
    restingMachineIds: [],
    bufferUsedBefore: liveState.bufferUsed,
    bufferActionRequired: false,
    selectionReason: reason,
  }

  await publishSamDayBrief({
    adminUid,
    testRunId,
    state: liveState,
    plan,
    kind: 'deploy',
    now,
    revision: nextRev,
    forceReplay: true,
  })

  // Auto-advance through the same phase chain the desk had already reached.
  for (let step = 1; step < targetStep; step++) {
    const advanced = await advanceSequentialStep(adminUid)
    if (!advanced.advanced && advanced.deskStep < targetStep) break
  }

  // If we need Step 4 open, supersede any stale Leo card so ensureLeo can rewrite amounts.
  if (targetStep >= 4) {
    await supersedeDayTicketCard(adminUid, eventId(testRunId, cycleNumber), now, reason)
    // Clear the existence guard by writing a fresh Leo card via ensure after phase unlock.
    const leoRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(eventId(testRunId, cycleNumber))
    const leoSnap = await leoRef.get()
    if (leoSnap.exists && String(leoSnap.data()?.status) === 'superseded') {
      // ensureLeoSendEvent returns early if exists — delete is not allowed; write updated body on superseded→awaiting
      const cycleSnap = await cycleRef.get()
      const amountZar = num(cycleSnap.data()?.deployedAmount, nextOrderZar)
      await leoRef.set(
        {
          status: 'awaiting_execution',
          awaitingConfirm: true,
          routingBlocked: false,
          amountValue: amountZar,
          title: stepCardTitle(4),
          body: `${formatZar(amountZar)} scheduled order is funded. ZAR float covers the send. Send ZAR opens the keypad — then Next 24h can finish the day.`,
          dropdownBody: `${formatZar(amountZar)} send`,
          dayTicketRevision: nextRev,
          planVersion,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      )
      await testRef.set(
        {
          cyclePhase: 'awaiting_send',
          deskStep: 4,
          awaitingKind: 'deploy',
          updatedAt: now,
        },
        { merge: true }
      )
    } else {
      await ensureLeoSendEvent(adminUid, testRunId, cycleNumber, now)
    }
  }

  const after = (await testRef.get()).data() || {}
  return { replayedToStep: num(after.deskStep, targetStep) }
}

function writeInstructionOnly(
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp,
  quotes: { sellRate: number; costRate: number; quote?: FrozenQuote },
  book: PathBook
): Promise<{ plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' }> {
  const planned = planCycle(state, EMPTY_OVERLAY, book)
  const plan = {
    ...planned,
    cardAssignments: stampAssignmentDecisions(planned.cardAssignments, now.toMillis()),
  }
  const activity = buildActivityCopy(
    plan,
    state.config.cycleCount,
    'awaiting_execution',
    state.config.spread,
    quotes,
    { state, overlay: EMPTY_OVERLAY }
  )
  const activityEventId = `${eventId(testRunId, plan.cycleNumber)}-${now.toMillis()}`
  return db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .doc(activityEventId)
    .set({
      id: activityEventId,
      kind: CONVERSION_ROUTING_KIND,
      title: activity.title,
      body: activity.body,
      dropdownTitle: stepCardTitle(4),
      dropdownBody: buildNotificationCopy(plan, state.config.cycleCount).body,
      actorType: 'ai_manager',
      avatarKind: 'convert_zar',
      amountCurrency: 'ZAR',
      amountValue: plan.deployedAmount,
      amountSign: 'debit',
      txId: activityEventId,
      hasDownloadButton: false,
      awaitingConfirm: plan.deployedAmount > 0,
      routingBlocked: plan.deployedAmount <= 0,
      status: 'awaiting_execution',
      routingAction: 'deploy',
      ticketSplits: ticketSplitsFromAssignments(plan.cardAssignments),
      testRunId,
      cycleNumber: plan.cycleNumber,
      createdAt: now,
      recordingSource: 'SYSTEM',
    })
    .then(() => ({ plan, activityEventId, kind: 'deploy' as const }))
}

async function cancelAwaitingCycle(
  adminUid: string,
  testRunId: string,
  cycleNumber: number,
  now: admin.firestore.Timestamp
): Promise<void> {
  const cycleRef = db.collection(TESTS).doc(testRunId).collection('cycles').doc(String(cycleNumber))
  const cycleSnapForCancel = await cycleRef.get()
  const latestId = cycleSnapForCancel.exists
    ? currentRoutingEventId(testRunId, cycleNumber, cycleSnapForCancel.data() || {})
    : eventId(testRunId, cycleNumber)
  const ids = Array.from(new Set([eventId(testRunId, cycleNumber), latestId]))
  for (const id of ids) {
    const eventRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(id)
    const eventSnap = await eventRef.get()
    if (eventSnap.exists && eventSnap.data()?.status === 'awaiting_execution') {
      const prev = eventSnap.data() || {}
      await eventRef.update({
        status: 'cancelled',
        awaitingConfirm: false,
        body: `${prev.body || ''}\nStatus: Cancelled`.replace(/\nStatus: Awaiting execution/, '\nStatus: Cancelled'),
        completedAt: now,
      })
    }
  }
  const liqRef = db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .doc(replenishEventId(testRunId, cycleNumber))
  const liqSnap = await liqRef.get()
  if (liqSnap.exists && liqSnap.data()?.status === 'awaiting_execution') {
    const prev = liqSnap.data() || {}
    await liqRef.update({
      status: 'cancelled',
      awaitingConfirm: false,
      body: `${prev.body || ''}\nStatus: Cancelled`.replace(/\nStatus: Awaiting execution/, '\nStatus: Cancelled'),
      completedAt: now,
    })
  }
  const cycleSnap = await cycleRef.get()
  if (cycleSnap.exists && cycleSnap.data()?.status === 'awaiting_execution') {
    await cycleRef.update({ status: 'cancelled', completedAt: now })
  }
  // Instruction-only fallbacks use suffixed ids; sweep anything still awaiting on this run.
  await cancelAwaitingRoutingEvents(adminUid, now, (data) => data.testRunId === testRunId)
}

/** Cancel every awaiting desk instruction matching `match`. Keeps retired runs off the chat. */
async function cancelAwaitingRoutingEvents(
  adminUid: string,
  now: admin.firestore.Timestamp,
  match: (data: admin.firestore.DocumentData) => boolean
): Promise<number> {
  const strays = await db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .where('kind', '==', CONVERSION_ROUTING_KIND)
    .where('status', '==', 'awaiting_execution')
    .get()
  let cancelled = 0
  for (const doc of strays.docs) {
    const prev = doc.data() || {}
    if (!match(prev)) continue
    await doc.ref.update({
      status: 'cancelled',
      awaitingConfirm: false,
      body: `${prev.body || ''}\nStatus: Cancelled`.replace(/\nStatus: Awaiting execution/, '\nStatus: Cancelled'),
      completedAt: now,
    })
    cancelled += 1
  }
  return cancelled
}

async function startNewTest(
  adminUid: string,
  forceNew: boolean,
  startingCapital?: number,
  lastShockLine?: string,
  /** Optional absorbing book (equitable desk calendar tickets + forced routes). */
  absorbingBook?: import('../throughput/model/prospectiveBook').ProspectiveBook
) {
  const now = admin.firestore.Timestamp.now()
  const existingId = await currentTestId(adminUid)
  if (existingId && !forceNew) {
    const existing = await db.collection(TESTS).doc(existingId).get()
    if (existing.exists) {
      const data = existing.data() || {}
      if (!shouldStartFreshWindow(data)) {
        const state = stateFromDoc(data)
        // Cards from retired runs must not stay tappable on the chat.
        await cancelAwaitingRoutingEvents(adminUid, now, (row) => row.testRunId !== existingId)
        return publicSummary(state, {
          testRunId: existingId,
          status: data.status || 'active',
          cycleNumber: data.awaitingCycleNumber || state.completedCycles,
          started: false,
        })
      }
      forceNew = true
    }
  }

  if (existingId && forceNew) {
    const existing = await db.collection(TESTS).doc(existingId).get()
    const awaiting = num(existing.data()?.awaitingCycleNumber, 0)
    const status = existing.data()?.status
    if (status === 'active' && awaiting > 0) {
      await cancelAwaitingCycle(adminUid, existingId, awaiting, now)
    }
    if (existing.exists) {
      await existing.ref.set({ status: 'superseded', updatedAt: now }, { merge: true })
    }
    // Regardless of awaitingCycleNumber, nothing from the retired run may stay tappable.
    await cancelAwaitingRoutingEvents(adminUid, now, (row) => row.testRunId === existingId)
  }

  const testRunId = db.collection(TESTS).doc().id
  let state = createInitialState(
    PRODUCTION_DESK_CONFIG,
    typeof startingCapital === 'number' && startingCapital > 0 ? startingCapital : 0
  )
  const authorised =
    typeof startingCapital === 'number' && startingCapital > 0 ? startingCapital : 0
  // Full ZAR sale → EN ROUTE (authorised). Card absorbing book = replacement card share; EFT book = rest.
  const split =
    authorised > 0
      ? splitReplacementChannels({
          amountZar: authorised,
          nowMs: now.toMillis(),
          shockId: testRunId,
        })
      : null
  const eftBook = split && split.eftZar > 0 ? mergeEftBook(null, split) : null
  const shockSummary = split?.summary || lastShockLine || null
  if (authorised > 0 && absorbingBook) {
    const { startWindow } = await import('../throughput/prospective/window')
    const { DESK_MONTH_HORIZON_DAYS } = await import('../routing/deskMonth')
    const { KERNEL_SEED } = await import('../routing/throughputPlan')
    const cardBookZar = split && split.cardZar > 0 ? split.cardZar : authorised
    const window = startWindow({
      availableZar: cardBookZar,
      seed: KERNEL_SEED,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
      initialPos: state.config.machineCount,
      initialCards: state.config.cardCount || state.cards.length,
      book: absorbingBook,
    })
    state = {
      ...state,
      authorisedZar: authorised,
      availableCapital: window.availableZar,
      window,
      windowNeedsAdvance: false,
    }
  } else if (authorised > 0) {
    const cardBookZar = split && split.cardZar > 0 ? split.cardZar : authorised
    state = openWindowAtCapitalWithBook(state, authorised, cardBookZar)
  }
  await db.collection(TESTS).doc(testRunId).set({
    testRunId,
    adminUid,
    status: 'active',
    config: state.config,
    availableCapital: state.availableCapital,
    bufferUsed: 0,
    completedCycles: 0,
    cumulativeDeployed: 0,
    cumulativeSpread: 0,
    cards: state.cards,
    machines: state.machines,
    pairings: {},
    ...persistCapital(state),
    routingEngine: ROUTING_ENGINE_ID,
    constraints: [],
    lastShockLine: shockSummary,
    channelSplitSummary: shockSummary,
    channelMix: split ? channelMixOf(split) : 'card',
    eftBook: eftBook || null,
    openEftZar: openEftZar(eftBook),
    createdAt: now,
    updatedAt: now,
  })
  await db.collection(CURRENT).doc(adminUid).set({
    testRunId,
    adminUid,
    updatedAt: now,
  })
  if (!(authorised > 0)) {
    return publicSummary(state, {
      testRunId,
      status: 'active',
      cycleNumber: 0,
      started: false,
    })
  }
  // Window open from `$` must return before invoice PDF work or the client 408s.
  const issued = await issueCycle(adminUid, testRunId, state, now, {
    immediateAttempts: true,
    skipInvoices: true,
  })
  if (eftBook && eftBook.tickets.length) {
    await publishEftLaneNotice(adminUid, testRunId, eftBook, now, issued.plan.cycleNumber)
    void recordEftInstructedEvidence(testRunId, eftBook, issued.plan.cycleNumber)
  }
  const notification =
    issued.kind === 'replenish'
      ? buildReplenishNotificationCopy({
          cycleNumber: issued.plan.cycleNumber,
          amountZar: state.bufferUsed,
          amountMzn: 0,
          costRate: 0,
          cardAssignments: [],
          restingCardIds: [],
          restingMachineIds: [],
        })
      : buildNotificationCopy(issued.plan, state.config.cycleCount)
  return publicSummary(state, {
    testRunId,
    status: 'active',
    cycleNumber: issued.plan.cycleNumber,
    deployedAmount: issued.plan.deployedAmount,
    started: true,
    activityEventId: issued.activityEventId,
    dropdownTitle: notification.title,
    dropdownBody: notification.body,
    channelMix: split ? channelMixOf(split) : 'card',
    openEftZar: openEftZar(eftBook),
    channelSplitSummary: shockSummary,
  })
}

/** Desk-facing EFT lands date — never paste shock lastSplitSummary (EN ROUTE R100k…). */
function formatEftLandsLabel(iso: string | undefined | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const sast = new Date(ms + 2 * 60 * 60 * 1000)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[sast.getUTCDay()]} ${sast.getUTCDate()} ${months[sast.getUTCMonth()]}`
}

async function publishEftLaneNotice(
  adminUid: string,
  testRunId: string,
  eftBook: EftDeskBook,
  now: admin.firestore.Timestamp,
  cycleNumber: number
): Promise<void> {
  const openZar = openEftZar(eftBook)
  if (!(openZar > 0)) return
  const id = `eft-lane-${testRunId}-${cycleNumber}`
  const ref = db.collection('users').doc(adminUid).collection('activityEvents').doc(id)
  const existing = await ref.get()
  if (existing.exists) return
  const openTickets = eftBook.tickets.filter(
    (t) => t.channel === 'eft' && (t.status === 'open' || t.status === 'submitted' || t.status === 'delayed')
  )
  const count = openTickets.length
  let latestDue: string | null = null
  for (const t of openTickets) {
    if (!t.expectedSettledBy) continue
    if (!latestDue || Date.parse(t.expectedSettledBy) > Date.parse(latestDue)) {
      latestDue = t.expectedSettledBy
    }
  }
  const lands = formatEftLandsLabel(latestDue)
  const ticketLine =
    count > 0
      ? `${count} ticket${count === 1 ? '' : 's'}${lands ? ` · lands latest ${lands}` : ''} (T+2)`
      : null
  // Totals from open EFT tickets only — never lastSplitSummary shock replacement line.
  const body = [
    `EFT instructed: ${formatZarMoney(openZar)}.`,
    ticketLine,
    'Waiting for the bank’s credit notice.',
  ]
    .filter(Boolean)
    .join('\n')
  await ref.set({
    id,
    kind: CONVERSION_ROUTING_KIND,
    title: 'EFT instructed',
    body,
    deskStatusChip: 'Pending',
    deskSentence: body,
    dropdownTitle: 'EFT instructed',
    dropdownBody: `EFT ${formatZarMoney(openZar)} pending`,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: openZar,
    amountSign: 'debit',
    txId: id,
    hasDownloadButton: false,
    awaitingConfirm: false,
    routingBlocked: false,
    status: 'recorded',
    routingAction: 'advice',
    deskSpeaker: 'sam',
    deskChannel: 'eft',
    channelChip: 'EFT',
    testRunId,
    cycleNumber,
    createdAt: now,
    updatedAt: now,
    recordingSource: 'SYSTEM',
  })
}

async function recordEftInstructedEvidence(
  testRunId: string,
  eftBook: EftDeskBook,
  cycleNumber: number
): Promise<void> {
  const corridor = defaultEftCorridorId()
  for (const ticket of eftBook.tickets) {
    if (ticket.channel !== 'eft' || ticket.status === 'settled') continue
    try {
      await persistRouteEvidence(
        evidenceFromEftInstructed({
          eftCorridorId: corridor,
          cardIssuerBankId: 'fnb_mozambique',
          economicPaymentId: ticket.economicPaymentId,
          testRunId,
          cycleNumber,
          requestedZar: ticket.amountZar,
          eventAt: ticket.instructedAt,
        })
      )
    } catch (error) {
      console.warn('[eft] instructed evidence skipped', error)
    }
  }
}

export type RoutingPlayRequest = {
  testRunId: string
  cycleNumber: number
  action: 'deploy' | 'replenish'
}

export function parseRoutingPlay(raw: unknown): RoutingPlayRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const testRunId = typeof row.testRunId === 'string' ? row.testRunId : ''
  const cycleNumber = typeof row.cycleNumber === 'number' ? row.cycleNumber : NaN
  const action = row.action === 'replenish' ? 'replenish' : row.action === 'deploy' ? 'deploy' : null
  if (!testRunId || !Number.isFinite(cycleNumber) || cycleNumber <= 0 || !action) return null
  return { testRunId, cycleNumber, action }
}

/**
 * Before a play records a conversion, make sure the card is the desk's current
 * step and the ZAR entered equals the ticket total. Throws a readable
 * failed-precondition otherwise, so nothing is written for a stale or wrong card.
 */
export async function assertRoutingPlayMatches(
  adminUid: string,
  play: RoutingPlayRequest,
  amountZar: number,
  amountMzn?: number
): Promise<{ expectedZar: number; expectedMzn: number | null }> {
  const now = admin.firestore.Timestamp.now()
  const currentRun = await currentTestId(adminUid)
  if (!currentRun || play.testRunId !== currentRun) {
    await cancelAwaitingRoutingEvents(adminUid, now, (row) => row.testRunId === play.testRunId)
    throw new functions.https.HttpsError(
      'failed-precondition',
      'That instruction was from a retired desk run and has been cleared. Tap $ and sell ZAR to open Day 1.'
    )
  }
  const testRef = db.collection(TESTS).doc(currentRun)
  const testSnap = await testRef.get()
  const data = testSnap.data() || {}
  if (data.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'Conversion routing test is not active')
  }
  const awaitingCycle = num(data.awaitingCycleNumber, 0)
  const awaitingKind = typeof data.awaitingKind === 'string' ? data.awaitingKind : 'deploy'
  const cyclePhase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
  if (awaitingCycle !== play.cycleNumber || awaitingKind !== play.action) {
    const step = awaitingKind === 'replenish' ? 'the restock' : 'the sale'
    throw new functions.https.HttpsError(
      'failed-precondition',
      awaitingCycle > 0
        ? `That card is no longer the current step. The desk is waiting on ${step} for cycle ${awaitingCycle}.`
        : 'That card is no longer the current step. Open the desk for the next instruction.'
    )
  }
  if (
    play.action === 'deploy' &&
    cyclePhase &&
    cyclePhase !== 'awaiting_send' &&
    cyclePhase !== 'hold'
  ) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      cyclePhase === 'awaiting_mzn'
        ? 'MZN for this invoice has not cleared yet. Wait for the batch receipt before sending ZAR.'
        : cyclePhase === 'awaiting_continue'
          ? 'ZAR float is short for this scheduled order. Add ZAR to continue.'
          : 'This order is not ready for the ZAR send yet.'
    )
  }

  let expected = 0
  let expectedMzn: number | null = null
  if (play.action === 'replenish') {
    expected = num(data.replenishAmountZar, 0)
    const ticketMzn = roundMoney(num(data.replenishAmountMzn, 0))
    expectedMzn = ticketMzn > 0 ? ticketMzn : null
  } else {
    const cycleSnap = await testRef.collection('cycles').doc(String(play.cycleNumber)).get()
    expected = num(cycleSnap.data()?.deployedAmount, 0)
    if (!(expected > 0)) expected = planCycle(stateFromDoc(data)).deployedAmount
  }
  const entered = roundMoney(amountZar)
  if (expected > 0 && Math.abs(expected - entered) > 0.005) {
    // A restock keypad types the card's bank-COST MZN total; that may not
    // invert cleanly through a single live COST rate back to ticket ZAR.
    if (play.action === 'replenish') {
      const typedMzn = typeof amountMzn === 'number' ? roundMoney(amountMzn) : 0
      if (expectedMzn != null && typedMzn > 0 && Math.abs(expectedMzn - typedMzn) <= 0.02) {
        return { expectedZar: expected, expectedMzn }
      }
    }
    const diff = roundMoney(expected - entered)
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Tickets total ${formatZar(expected)} but ${formatZar(entered)} was entered — ${formatZar(Math.abs(diff))} ${diff > 0 ? 'short' : 'over'}. Enter the ticket total exactly.`
    )
  }
  return { expectedZar: expected > 0 ? expected : entered, expectedMzn }
}

export async function applyAdminCapitalShock(params: {
  adminUid: string
  kind: 'sell_zar' | 'add_zar' | 'add_mzn'
  amountZar: number
  amountMzn?: number
}): Promise<void> {
  const { adminUid, kind, amountZar, amountMzn } = params
  if (adminUid !== ROUTING_ADMIN_UID) return
  const amount = Number(amountZar) || 0
  const mzn = Number(amountMzn) || 0
  if (kind !== 'add_mzn' && !(amount > 0)) return
  if (kind === 'add_mzn' && !(mzn > 0)) return

  const existingId = await currentTestId(adminUid)
  const existing = existingId ? await db.collection(TESTS).doc(existingId).get() : null
  const status = existing?.data()?.status
  const now = admin.firestore.Timestamp.now()
  const split =
    kind === 'sell_zar' || kind === 'add_zar'
      ? splitReplacementChannels({
          amountZar: amount,
          nowMs: now.toMillis(),
          shockId: `${existingId || 'new'}-${now.toMillis()}`,
        })
      : null
  const shockLine =
    split?.summary ||
    (kind === 'sell_zar'
      ? `Window opened: ${formatZar(amount)} to convert over 14 weekdays.`
      : kind === 'add_zar'
        ? `${formatZar(amount)} added to the window. Book re-solved.`
        : `MZN added to the window. Book re-solved.`)

  // Do not restart an active Day-0 window on every sell — that wiped Next 24h.
  if (
    !existingId ||
    !existing?.exists ||
    status !== 'active' ||
    shouldStartFreshWindow(existing.data())
  ) {
    if (kind === 'sell_zar' || kind === 'add_zar') {
      await startNewTest(adminUid, true, amount, shockLine)
    }
    return
  }

  const data = existing.data() || {}
  const phase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
  // Continue path: inject ZAR into the open scheduled order — do not cancel Day n.
  if ((phase === 'awaiting_continue' || phase === 'awaiting_mzn') && (kind === 'add_zar' || kind === 'add_mzn')) {
    const state = applyCapitalShock(stateFromDoc(data), { kind, amountZar: amount, amountMzn: mzn })
    await db.collection(TESTS).doc(existingId).set(
      {
        availableCapital: state.availableCapital,
        ...persistCapital(state),
        lastShockLine: shockLine,
        updatedAt: now,
      },
      { merge: true }
    )
    await tryAdvanceContinuousCycle()
    return
  }

  let state = applyCapitalShock(stateFromDoc(data), { kind, amountZar: amount, amountMzn: mzn })
  const priorEft = eftBookFromDoc(data)
  const eftBook = split && split.eftZar > 0 ? mergeEftBook(priorEft, split) : priorEft
  // Large sell on an open window: keep full EN ROUTE authorised; card book absorbs card share.
  if (kind === 'sell_zar' && split && split.cardZar > 0) {
    state = openWindowAtCapitalWithBook(state, state.authorisedZar || amount, split.cardZar)
  }
  const awaiting = num(data.awaitingCycleNumber, 0)
  if (awaiting > 0) {
    await cancelAwaitingCycle(adminUid, existingId, awaiting, now)
  }
  await db.collection(TESTS).doc(existingId).set(
    {
      availableCapital: state.availableCapital,
      ...persistCapital(state),
      lastShockLine: shockLine,
      channelSplitSummary: shockLine,
      channelMix: split ? channelMixOf(split) : data.channelMix || 'card',
      eftBook: eftBook || null,
      openEftZar: openEftZar(eftBook),
      updatedAt: now,
    },
    { merge: true }
  )
  const issued = await issueCycle(adminUid, existingId, state, now, { immediateAttempts: true })
  if (split && split.eftZar > 0 && eftBook) {
    await publishEftLaneNotice(adminUid, existingId, eftBook, now, issued.plan.cycleNumber)
    void recordEftInstructedEvidence(existingId, { tickets: split.eftTickets, lastSplitSummary: split.summary, updatedAt: now.toDate().toISOString() }, issued.plan.cycleNumber)
  }
}

/** Script/admin helper: supersede the active run and open Day 1 under current policy. */
export async function forceFreshDeskRun(params?: {
  capitalZar?: number
  note?: string
  /** Equitable / desk-calendar absorbing book with optional forced card×POS. */
  absorbingBook?: import('../throughput/model/prospectiveBook').ProspectiveBook
}): Promise<Record<string, unknown>> {
  const adminUid = ROUTING_ADMIN_UID
  const capital =
    params?.capitalZar && params.capitalZar > 0 ? params.capitalZar : DESK_MONTH_TARGET_ZAR
  try {
    await exitDeskPlan(adminUid)
  } catch {
    // No planned sim — continue with force-new.
  }
  return startNewTest(
    adminUid,
    true,
    capital,
    params?.note ||
      `October month desk · R${DESK_MONTH_TARGET_ZAR.toLocaleString('en-ZA')} · max R${OPERATING_POLICY_V1.payment.maxAmountZar.toLocaleString('en-ZA')}`,
    params?.absorbingBook
  )
}

export const admin_startConversionRoutingTest = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const adminUid = assertRoutingAdmin(context)
    const forceNew = data?.forceNew === true
    return startNewTest(adminUid, forceNew)
  })

export const admin_ensureConversionRoutingTest = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    const adminUid = assertRoutingAdmin(context)
    return startNewTest(adminUid, false)
  })

export const admin_getConversionRoutingStatus = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    const adminUid = assertRoutingAdmin(context)
    const testRunId = await currentTestId(adminUid)
    if (!testRunId) {
      return { status: 'none' }
    }
    const snap = await db.collection(TESTS).doc(testRunId).get()
    if (!snap.exists) {
      return { status: 'none' }
    }
    const data = snap.data() || {}
    const state = stateFromDoc(data)
    return publicSummary(state, {
      testRunId,
      status: data.status || 'active',
      cycleNumber: data.awaitingCycleNumber || state.completedCycles,
      cards: state.cards,
      machines: state.machines,
      pairings: state.pairings,
      deskMode: data.deskMode === 'planned' ? 'planned' : 'live',
      plannedClockMs: num(data.plannedClockMs, 0) || null,
    })
  })

export const admin_confirmConversionRoutingCycle = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => confirmOpenCycle(assertRoutingAdmin(context), (data || {}) as Record<string, unknown>))

export async function confirmOpenCycle(adminUid: string, data: Record<string, unknown>) {
    const now = admin.firestore.Timestamp.now()
    const requestedCycle =
      typeof data?.cycleNumber === 'number' ? data.cycleNumber : undefined
    const requestedRun = typeof data?.testRunId === 'string' ? data.testRunId : undefined
    const conversionTxId = typeof data?.conversionTxId === 'string' ? data.conversionTxId : undefined
    // Admin desk continuity: never pause Day n on the swipe clock. Schedule stays
    // informational; Continue / I've swiped always advance.
    const overrideEarliest = true
    const suppliedProfit =
      typeof data?.actualProfit === 'number' && Number.isFinite(data.actualProfit)
        ? data.actualProfit
        : undefined

    const currentRun = await currentTestId(adminUid)
    const testRunId = requestedRun || currentRun
    if (!testRunId) {
      throw new functions.https.HttpsError('not-found', 'No conversion routing test is active')
    }
    if (requestedRun && currentRun && requestedRun !== currentRun) {
      // A card from a retired run was tapped. Clear it so it cannot be tapped again.
      await cancelAwaitingRoutingEvents(adminUid, now, (row) => row.testRunId === requestedRun)
      throw new functions.https.HttpsError(
        'failed-precondition',
        'That instruction was from a retired desk run and has been cleared. Tap $ and sell ZAR to open Day 1.'
      )
    }

    // Steps 1–3 use Continue to walk the sequence — not Leo confirm.
    {
      const gateSnap = await db.collection(TESTS).doc(testRunId).get()
      const gate = gateSnap.data() || {}
      const gatePhase = typeof gate.cyclePhase === 'string' ? gate.cyclePhase : ''
      const gateStep = num(gate.deskStep, 0)
      if (
        gatePhase === 'order_open' ||
        gatePhase === 'awaiting_invoice' ||
        (gatePhase === 'awaiting_mzn' && gateStep >= 1 && gateStep < 4)
      ) {
        const stepped = await advanceSequentialStep(adminUid)
        const state = stateFromDoc((await db.collection(TESTS).doc(testRunId).get()).data() || {})
        return publicSummary(state, {
          testRunId,
          status: 'active',
          cycleNumber: num(gate.awaitingCycleNumber, 0),
          deskStep: stepped.deskStep,
          acknowledgement: stepped.body,
          sequential: true,
        })
      }
    }

    const quotes = await applyLiveQuotes(createInitialState())
    const liveSpread = quotes.state.config.spread
    const testRef = db.collection(TESTS).doc(testRunId)

    const result: {
      nextState: RoutingState
      nextCycle: CyclePlan | null
      testComplete: boolean
      cycleNumber: number
      confirmedKind: 'deploy' | 'replenish'
      issueNext?: boolean
    } = await db.runTransaction(async (tx) => {
      const testSnap = await tx.get(testRef)
      if (!testSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Conversion routing test not found')
      }
      const testData = testSnap.data() || {}
      if (testData.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'Conversion routing test is not active')
      }

      const storedAwaiting = num(testData.awaitingCycleNumber, 0)
      const cycleNumber = requestedCycle || storedAwaiting
      if (cycleNumber <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'No cycle is awaiting execution')
      }
      if (storedAwaiting > 0 && storedAwaiting !== cycleNumber) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Cycle ${cycleNumber} is not the current awaiting instruction`
        )
      }

      const state = stateFromDoc(testData)
      const awaitingKind = testData.awaitingKind === 'replenish' ? 'replenish' : 'deploy'
      const book = pathBookFromDoc(testData, quotes.quote)

      if (awaitingKind === 'replenish') {
        const overlay = overlayForDoc(testData)
        const replenish = planReplenish(state, num(testData.replenishCostRate, quotes.costRate), overlay, book)
        if (!replenish) {
          throw new functions.https.HttpsError('failed-precondition', 'No ZAR restock is awaiting')
        }
        const assignments = Array.isArray(testData.replenishAssignments)
          ? (testData.replenishAssignments as ReplenishPlan['cardAssignments'])
          : replenish.cardAssignments
        const eventRef = db
          .collection('users')
          .doc(adminUid)
          .collection('activityEvents')
          .doc(replenishEventId(testRunId, cycleNumber))
        const eventSnap = await tx.get(eventRef)
        if (!eventSnap.exists || eventSnap.data()?.status !== 'awaiting_execution') {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Restock ZAR @ COST is not awaiting execution'
          )
        }
        const earliestRestock = eventSnap.data()?.earliestAttemptAt
        if (!overrideEarliest && typeof earliestRestock === 'string') {
          const earliestMs = Date.parse(earliestRestock)
          if (Number.isFinite(earliestMs) && now.toMillis() < earliestMs) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              `Confirm rejected: attempt is before ${earliestRestock}`,
              { earliestAttemptAt: earliestRestock }
            )
          }
        }
        const storedTicketPath = eventSnap.data()?.ticketPath as
          | Parameters<typeof buildReplenishActivityCopy>[4]
          | undefined
        const completedPath =
          storedTicketPath &&
          Array.isArray(storedTicketPath.tickets) &&
          storedTicketPath.tickets.length > 0
            ? storedTicketPath
            : scheduleTicketPath({
                assignments,
                nowMs: now.toMillis(),
                pendingExposureZar: 0,
              })
        const completedCopy = buildReplenishActivityCopy(
          {
            ...replenish,
            cardAssignments: assignments,
            restingCardIds: Array.isArray(testData.replenishRestingCardIds)
              ? testData.replenishRestingCardIds
              : replenish.restingCardIds,
            restingMachineIds: Array.isArray(testData.replenishRestingMachineIds)
              ? testData.replenishRestingMachineIds
              : replenish.restingMachineIds,
          },
          state.config.cycleCount,
          'completed',
          state,
          completedPath
        )
        const contacted = applyCardPosContact(state, assignments, cycleNumber)
        const nowMs = now.toMillis()
        const friction = frictionFromDoc(testData, nowMs)
        const added: SwipeRecord[] = assignments.map((row) => ({
          id: swipeIdFor(cycleNumber, row.cardId, row.machineId),
          atMs: nowMs,
          cardId: row.cardId,
          machineId: row.machineId,
          amount: row.amount,
          cycleNumber,
        }))
        const nextFriction = {
          swipes: [...friction.swipes, ...added].slice(-40),
          notes: friction.notes,
          nowMs,
        }
        const cleared: RoutingState = applyRestockLanding(
          {
            ...contacted,
            bufferUsed: 0,
            config: { ...contacted.config, spread: liveSpread },
          },
          assignments.reduce((sum, row) => sum + row.amount, 0)
        )
        tx.update(eventRef, {
          title: completedCopy.title,
          body: completedCopy.body,
          // Keep scheduled swipe times on the step card after Confirm / Planned finish.
          dropdownBody: completedCopy.body
            .split('\n')
            .filter((line) => /^- \d{1,2}[:h]\d{2}:/.test(line) || /^- Swipe /.test(line))
            .join('\n')
            .slice(0, 500),
          ticketPath: completedPath,
          status: 'completed',
          awaitingConfirm: false,
          completedAt: now,
          ...(conversionTxId ? { txId: conversionTxId } : {}),
        })
        tx.set(
          testRef,
          {
            recentSwipes: nextFriction.swipes,
            recentRestocks: [
              {
                cycleNumber,
                confirmedAtMs: nowMs,
                assignments: assignments.map((row) => ({
                  cardId: row.cardId,
                  machineId: row.machineId,
                  amount: row.amount,
                  ...(row.posReason || row.routingDecision?.selectionReason
                    ? { posReason: row.posReason || row.routingDecision?.selectionReason }
                    : {}),
                  ...(row.routingDecision ? { routingDecision: row.routingDecision } : {}),
                })),
              },
              ...recentRestocksFromDoc(testData),
            ].slice(0, 12),
            updatedAt: now,
          },
          { merge: true }
        )
        const settledBook: PathBook = {
          ...book,
          residuals: assignments.reduce(
            (rows, row) => settleResidualOnConfirm(rows, row, residualPaymentId(cycleNumber, row.cardId, row.machineId)),
            book.residuals || []
          ),
          quote: quotes.quote,
        }
        tx.set(
          testRef,
          {
            ...persistCapital(cleared),
            availableCapital: cleared.availableCapital,
            bufferUsed: cleared.bufferUsed,
            completedCycles: cleared.completedCycles,
            cards: cleared.cards,
            machines: cleared.machines,
            pairings: cleared.pairings,
            awaitingCycleNumber: null,
            awaitingKind: null,
            ...persistPathBook({}, settledBook),
            updatedAt: now,
          },
          { merge: true }
        )
        return {
          nextState: cleared,
          nextCycle: null,
          testComplete: false,
          cycleNumber,
          confirmedKind: 'replenish',
          issueNext: true,
          nextFriction,
          settledBook,
        }
      }

      const cycleRef = testRef.collection('cycles').doc(String(cycleNumber))
      const cycleSnap = await tx.get(cycleRef)
      const openEvents = await tx.get(
        db.collection('users').doc(adminUid).collection('activityEvents').where('testRunId', '==', testRunId)
      )
      if (!cycleSnap.exists) {
        const open = openEvents.docs.find((docSnap) => {
          const row = docSnap.data() || {}
          return row.status === 'awaiting_execution' && num(row.cycleNumber, 0) === cycleNumber
        })
        const plan = planCycle(state, overlayForDoc(testData), book)
        if (plan.deployedAmount <= 0) {
          throw new functions.https.HttpsError('failed-precondition', 'No executable route is available.')
        }
        const nextState = applySell({ ...state, completedCycles: Math.max(0, cycleNumber - 1) }, plan)
        if (open) {
          tx.update(open.ref, {
            status: 'completed',
            awaitingConfirm: false,
            completedAt: now,
            ...(conversionTxId ? { txId: conversionTxId } : {}),
          })
        }
        tx.set(
          testRef,
          firestoreSafe({
            ...persistCapital(nextState),
            availableCapital: nextState.availableCapital,
            bufferUsed: nextState.bufferUsed,
            completedCycles: cycleNumber,
            awaitingCycleNumber: null,
            awaitingKind: null,
            updatedAt: now,
          }),
          { merge: true }
        )
        return {
          nextState: { ...nextState, completedCycles: cycleNumber },
          nextCycle: null,
          testComplete: false,
          cycleNumber,
          confirmedKind: 'deploy' as const,
          issueNext: true,
        }
      }
      const cycleData = cycleSnap.data() || {}
      if (cycleData.status !== 'awaiting_execution') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Cycle ${cycleNumber} is already ${cycleData.status}`
        )
      }

      const plan = storedPlanFromCycle(cycleData, cycleNumber)
      if (plan.cycleNumber !== cycleNumber) {
        throw new functions.https.HttpsError('internal', 'Stored cycle does not match routing engine state')
      }
      if (plan.deployedAmount <= 0 || plan.cardCountUsed <= 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'No executable route is available. Reply to restore a card or machine first.'
        )
      }

      const eventRefForGate = db
        .collection('users')
        .doc(adminUid)
        .collection('activityEvents')
        .doc(currentRoutingEventId(testRunId, cycleNumber, cycleData))
      const eventSnapForGate = await tx.get(eventRefForGate)
      assertConfirmTimingAndPolicy({
        nowMs: now.toMillis(),
        eventData: eventSnapForGate.data(),
        cycleData,
        state,
        continuity: continuityFromDoc(testData),
        plan,
        overrideEarliest,
      })

      const frozen = plan.cardAssignments[0]?.routingDecision?.quote || book.quote || quotes.quote
      const actualProfit = suppliedProfit ?? zarProfitFromQuote(plan.deployedAmount, frozen)
      const overlay = overlayForDoc(testData)
      const nextState = applySell(state, plan, actualProfit)
      const remainingConstraints = expireConstraints(constraintsFromDoc(testData), cycleNumber)
      const completedCopy = buildActivityCopy(
        plan,
        state.config.cycleCount,
        'completed',
        liveSpread,
        { sellRate: quotes.sellRate, costRate: quotes.costRate },
        { state, overlay }
      )
      const eventRef = db
        .collection('users')
        .doc(adminUid)
        .collection('activityEvents')
        .doc(currentRoutingEventId(testRunId, cycleNumber, cycleData))
      const testComplete = nextState.completedCycles >= nextState.config.cycleCount

      const soldZar = plan.cardAssignments.reduce((sum, row) => sum + (row.amount || 0), 0)
      tx.update(cycleRef, {
        status: 'completed' as CycleStatus,
        actualProfit,
        completedAt: now,
        availableCapitalAfter: nextState.availableCapital,
        bufferUsedAfter: nextState.bufferUsed,
        cumulativeDeployedAfter: nextState.cumulativeDeployed,
        cumulativeSpreadAfter: nextState.cumulativeSpread,
      })
      tx.update(eventRef, {
        title: completedCopy.title,
        body: completedCopy.body,
        status: 'completed',
        awaitingConfirm: false,
        completedAt: now,
        ...(conversionTxId ? { txId: conversionTxId } : {}),
      })

      let nextCycle: CyclePlan | null = null
      if (testComplete) {
        tx.set(
          testRef,
          {
            ...nextState,
            testRunId,
            adminUid,
            status: 'completed',
            salesCommittedZar: soldZar,
            awaitingCycleNumber: null,
            awaitingKind: null,
            constraints: remainingConstraints,
            ...persistPathBook(
              {},
              {
                ...book,
                residuals: plan.cardAssignments.reduce(
                  (rows, row) =>
                    settleResidualOnConfirm(rows, row, residualPaymentId(cycleNumber, row.cardId, row.machineId)),
                  book.residuals || []
                ),
              }
            ),
            completedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      } else {
        const settledBook: PathBook = {
          ...book,
          residuals: plan.cardAssignments.reduce(
            (rows, row) => settleResidualOnConfirm(rows, row, residualPaymentId(cycleNumber, row.cardId, row.machineId)),
            book.residuals || []
          ),
          quote: quotes.quote,
        }
        tx.set(
          testRef,
          {
            ...persistCapital(nextState),
            availableCapital: nextState.availableCapital,
            bufferUsed: nextState.bufferUsed,
            completedCycles: nextState.completedCycles,
            cumulativeDeployed: nextState.cumulativeDeployed,
            cumulativeSpread: nextState.cumulativeSpread,
            cards: nextState.cards,
            machines: nextState.machines,
            pairings: nextState.pairings,
            salesCommittedZar: soldZar,
            awaitingCycleNumber: null,
            awaitingKind: null,
            constraints: remainingConstraints,
            ...persistPathBook({}, settledBook),
            updatedAt: now,
          },
          { merge: true }
        )
        nextCycle = null
        return {
          nextState,
          nextCycle,
          testComplete,
          cycleNumber,
          confirmedKind: 'deploy',
          issueNext: true,
          settledBook,
        }
      }

      return {
        nextState,
        nextCycle,
        testComplete,
        cycleNumber,
        confirmedKind: 'deploy',
      }
    })

    let nextCycle = result.nextCycle
    if (conversionTxId && (result.confirmedKind === 'deploy' || result.confirmedKind === 'replenish')) {
      try {
        const { publishPopPackDeskNotice } = await import('../settlement/publishPopPack')
        await publishPopPackDeskNotice({
          conversionTxIds: [conversionTxId],
          testRunId,
          cycleNumber: result.cycleNumber,
          adminUid,
          attachAction: result.confirmedKind,
        })
      } catch (error) {
        console.warn('[confirm] POP zip on step card skipped', error)
      }
    }
    if (result.confirmedKind === 'replenish') {
      try {
        const modeDoc = (await testRef.get()).data() || {}
        await writeSwipeApprovedNotice({
          adminUid,
          testRunId,
          cycleNumber: result.cycleNumber,
          conversionTxId,
          testData: modeDoc,
        })
      } catch (error) {
        console.warn('[confirm] Swipe approved notice skipped', error)
      }
    }
    if (result.confirmedKind === 'deploy') {
      try {
        const modeDoc = (await testRef.get()).data() || {}
        if (modeDoc.deskMode === 'planned') {
          const { settleDueEnRouteLots } = await import('./enRouteSettle')
          await settleDueEnRouteLots(40)
        }
      } catch (error) {
        console.warn('[confirm] Planned EN ROUTE clear skipped', error)
      }
      try {
        const cycleSnap = await db.collection(TESTS).doc(testRunId).collection('cycles').doc(String(result.cycleNumber)).get()
        const assignments = Array.isArray(cycleSnap.data()?.cardAssignments)
          ? (cycleSnap.data()?.cardAssignments as Array<{ cardId: number; machineId: number; amount: number }>)
          : []
        if (assignments.length) {
          const { recordAuthorisationsFromAssignments } = await import('../belief/recordProduction')
          await recordAuthorisationsFromAssignments({
            assignments,
            testRunId,
            cycleNumber: result.cycleNumber,
          })
        }
      } catch (error) {
        console.warn('[belief] authorisation evidence skipped', error)
      }
    }
    let issuedKind: 'deploy' | 'replenish' | null = null
    let dayClosePending = false
    if (result.issueNext && !result.testComplete) {
      try {
        // After recycle (or a day with no restock), gate Day n+1 behind Step 6 · What happened.
        if (result.confirmedKind === 'replenish') {
          await publishWhatHappened({
            adminUid,
            testRunId,
            cycleNumber: result.cycleNumber,
            now,
          })
          dayClosePending = true
        } else {
          const quoted = await applyLiveQuotes({
            ...result.nextState,
            config: { ...result.nextState.config, spread: liveSpread },
          })
          const book = pathBookFromDoc(
            (await testRef.get()).data() || {},
            quoted.quote
          )
          const peekReplenish = planReplenish(quoted.state, quoted.costRate, EMPTY_OVERLAY, book)
          if (!peekReplenish) {
            await publishWhatHappened({
              adminUid,
              testRunId,
              cycleNumber: result.cycleNumber,
              now,
            })
            dayClosePending = true
          } else {
            const issued = await issueCycle(adminUid, testRunId, quoted.state, now)
            nextCycle = issued.plan
            issuedKind = issued.kind
          }
        }
      } catch (error) {
        console.error('[confirm] next instruction failed after cycle completed', error)
      }
    }

    const modeSnap = await testRef.get()
    const modeDoc = modeSnap.data() || {}
    const deskMode = modeDoc.deskMode === 'planned' ? 'planned' : 'live'
    const endGate = keypadGateFromDoc(modeDoc)
    const restockZar =
      endGate === 'restock'
        ? num(modeDoc.replenishAmountZar, num(modeDoc.expectedOrderZar, 0))
        : 0
    const restockMzn =
      endGate === 'restock'
        ? num(modeDoc.replenishAmountMzn, num(modeDoc.expectedOrderMzn, 0))
        : 0

    return publicSummary(result.nextState, {
      testRunId,
      status: result.testComplete ? 'completed' : 'active',
      confirmedCycle: result.cycleNumber,
      cycleNumber: dayClosePending
        ? result.cycleNumber
        : nextCycle?.cycleNumber ?? result.nextState.completedCycles,
      nextDeployedAmount: nextCycle?.deployedAmount ?? null,
      completed: result.testComplete,
      deskMode,
      plannedClockMs: num(modeDoc.plannedClockMs, 0) || null,
      plannedHorizonHours: num(modeDoc.plannedHorizonHours, 0) || null,
      planRunId: typeof modeDoc.planRunId === 'string' && modeDoc.planRunId ? modeDoc.planRunId : null,
      ...(dayClosePending ? { awaitingDayClose: true } : {}),
      // After Send confirm, Step 5 is open — client should pop the restock keypad.
      ...(endGate
        ? {
            awaitingKeypad: endGate,
            keypadAmountZar: endGate === 'restock' ? restockZar : num(modeDoc.expectedOrderZar, 0),
            keypadAmountMzn: endGate === 'restock' ? restockMzn : num(modeDoc.expectedOrderMzn, 0),
          }
        : {}),
    })
  }

/**
 * Bank decline PDF → friction note + path decline so leftover can reroute
 * and Ask blocks "switch cards" without a typed note.
 */
export async function recordBankReceiptDecline(params: {
  evidenceId: string
  amountZar: number
  cardLast4: string | null
  merchant: string | null
  bankLabel: string
}): Promise<void> {
  const adminUid = ROUTING_ADMIN_UID
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) return
  const resolved = params.cardLast4 ? resolveBuyerCardLast4(params.cardLast4) : null
  const deskCardId = resolved?.ok ? resolved.buyer.deskCardId : undefined
  const nowMs = Date.now()
  const noteId = `bank-decline-${params.evidenceId}`
  const amountBit = `R${params.amountZar.toFixed(2)}`
  const where = params.merchant ? ` at ${params.merchant}` : ''
  const cardBit = params.cardLast4 ? ` on card ${params.cardLast4}` : ''
  const noteText = `${params.bankLabel} declined ${amountBit}${where}${cardBit}.`
  const testRef = db.collection(TESTS).doc(testRunId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(testRef)
    if (!snap.exists) return
    const data = snap.data() || {}
    if (data.status && data.status !== 'active') return
    const notes = Array.isArray(data.frictionNotes) ? [...data.frictionNotes] : []
    if (notes.some((row) => row && typeof row === 'object' && (row as { id?: string }).id === noteId)) {
      return
    }
    const frictionNote: FrictionNote = {
      id: noteId,
      kind: 'outcome',
      atMs: nowMs,
      outcome: 'declined',
      text: noteText.slice(0, 240),
      ...(typeof deskCardId === 'number' ? { cardId: deskCardId } : {}),
    }
    notes.push(frictionNote)

    const cycleNumber = Math.max(1, num(data.awaitingCycleNumber, 0) || num(data.completedCycles, 0) + 1)
    const assignments = Array.isArray(data.cardAssignments)
      ? (data.cardAssignments as Array<{ cardId?: number; machineId?: number; amount?: number }>)
      : []
    const open =
      (typeof deskCardId === 'number'
        ? assignments.find(
            (row) =>
              row.cardId === deskCardId &&
              Math.abs(Number(row.amount || 0) - params.amountZar) < 0.02
          )
        : null) ||
      assignments.find((row) => Math.abs(Number(row.amount || 0) - params.amountZar) < 0.02) ||
      assignments[0] ||
      null
    const paymentId =
      open && typeof open.cardId === 'number' && typeof open.machineId === 'number'
        ? residualPaymentId(cycleNumber, open.cardId, open.machineId)
        : `bank-decline-${params.evidenceId}`
    const book = pathBookFromDoc(data)
    const pathAlready = (book.notes || []).some(
      (row) => row.kind === 'decline' && row.economicPaymentId === paymentId
    )
    const write: PathWrite = {
      kind: 'decline',
      cardId: typeof deskCardId === 'number' ? deskCardId : open?.cardId ?? null,
      machineId: typeof open?.machineId === 'number' ? open.machineId : null,
      amountZar: params.amountZar,
      economicPaymentId: paymentId,
      summary: `${noteText} Leftover will reroute on the next live flow.`,
    }
    const nextBook = pathAlready
      ? book
      : applyPathWrites(book, [write], {
          cycleNumber,
          nowIso: new Date(nowMs).toISOString(),
        })
    tx.set(
      testRef,
      persistPathBook(
        {
          frictionNotes: notes.slice(-40),
          updatedAt: admin.firestore.Timestamp.fromMillis(nowMs),
        },
        nextBook
      ),
      { merge: true }
    )
  })
  try {
    const { recordDeclineFromBankReceipt } = await import('../belief/recordProduction')
    await recordDeclineFromBankReceipt({
      evidenceId: params.evidenceId,
      amountZar: params.amountZar,
      cardLast4: params.cardLast4,
      merchant: params.merchant,
      bankLabel: params.bankLabel,
    })
  } catch (error) {
    console.warn('[belief] decline evidence skipped', error)
  }
}

/** Close an open restock when bank receipts add up to the tickets. */
export async function tryAutoConfirmOpenRestock(overrideEarliest = false): Promise<boolean> {
  const adminUid = ROUTING_ADMIN_UID
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) return false
  const snap = await db.collection(TESTS).doc(testRunId).get()
  const data = snap.data() || {}
  if (data.status !== 'active' || data.awaitingKind !== 'replenish') return false
  const expectedZar = num(data.replenishAmountZar, 0)
  const expectedMzn = num(data.replenishAmountMzn, 0)
  const cycle = num(data.awaitingCycleNumber, 0)
  if (!(expectedZar > 0) || cycle <= 0) return false
  const issued = await db.collection('users').doc(adminUid).collection('activityEvents').doc(replenishEventId(testRunId, cycle)).get()
  const issuedAt = issued.data()?.createdAt
  const issuedMs = typeof issuedAt?.toMillis === 'function' ? issuedAt.toMillis() : 0
  if (!(issuedMs > 0)) return false
  const [fnb, capitec, moza, mznSnap, mznEvents] = await Promise.all([
    db.collection('bankFnbEvents').limit(40).get(),
    db.collection('bankCapitecEvents').limit(40).get(),
    db.collection('bankMozaEvents').limit(40).get(),
    db.collection('users').doc(adminUid).collection('wallets').doc('cashMZN').get(),
    db.collection('bankMznEvents').limit(40).get(),
  ])
  const zar: Array<{ ref: FirebaseFirestore.DocumentReference; amount: number }> = []
  const take = (
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    amount: number,
    status: string,
    kind?: string,
    opts?: { allowCardPurchase?: boolean }
  ) => {
    if (doc.data().matchedRestock) return
    const okKind =
      kind === 'conversion_receipt' || (opts?.allowCardPurchase === true && kind === 'card_purchase')
    if (kind && !okKind) return
    if (status !== 'approved') return
    const at = Date.parse(String(doc.data().createdAt || ''))
    if (!Number.isFinite(at) || at < issuedMs) return
    if (!(amount > 0)) return
    zar.push({ ref: doc.ref, amount })
  }
  fnb.docs.forEach((doc) => take(doc, Number(doc.data().amountZar || 0), String(doc.data().status || ''), String(doc.data().kind || '')))
  capitec.docs.forEach((doc) => take(doc, Number(doc.data().amountZar || 0), String(doc.data().status || ''), String(doc.data().kind || '')))
  moza.docs.forEach((doc) => {
    const data = doc.data()
    if (data.canEmitUsableZar !== true) return
    take(doc, Number(data.amountZar || 0), String(data.status || 'approved'), String(data.kind || ''), {
      allowCardPurchase: true,
    })
  })
  const mznIn = mznEvents.docs
    .filter((doc) => !doc.data().matchedRestock && Date.parse(String(doc.data().createdAt || '')) >= issuedMs)
    .map((doc) => Number(doc.data().amountMzn || 0))
  const balance = Number(mznSnap.data()?.fiatBalance || 0)
  const phase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
  // Continuous recycle: MZN already on the books is enough to continue; ZAR POS
  // receipts are not required to unblock the next calendar day.
  const zarOk =
    phase === 'awaiting_recycle' || receiptsCoverRestock(expectedZar, zar.map((row) => row.amount))
  if (!zarOk) return false
  if (!mznCoversRestock(expectedMzn, balance, mznIn)) return false
  await confirmOpenCycle(adminUid, { testRunId, cycleNumber: cycle, overrideEarliest })
  const mark = `${testRunId}:${cycle}`
  await Promise.all(zar.map((row) => row.ref.set({ matchedRestock: mark }, { merge: true })))
  return true
}

/** Operator said proceed — advance recycle when MZN covers, even without bank ZAR receipts. */
async function tryConfirmRecycleOnProceed(overrideEarliest = false): Promise<boolean> {
  const adminUid = ROUTING_ADMIN_UID
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) return false
  const snap = await db.collection(TESTS).doc(testRunId).get()
  const data = snap.data() || {}
  if (data.status !== 'active' || data.awaitingKind !== 'replenish') return false
  const expectedMzn = num(data.replenishAmountMzn, 0)
  const cycle = num(data.awaitingCycleNumber, 0)
  if (!(cycle > 0) || !(expectedMzn > 0)) return false
  const balance = await mznWalletBalance(adminUid)
  if (!mznCoversRestock(expectedMzn, balance, [])) return false
  await confirmOpenCycle(adminUid, { testRunId, cycleNumber: cycle, overrideEarliest })
  return true
}

function earliestAttemptFromDoc(data: FirebaseFirestore.DocumentData | undefined): string | null {
  const raw = typeof data?.earliestAttemptAt === 'string' ? data.earliestAttemptAt : null
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? raw : null
}

function isBeforeEarliest(earliestRaw: string | null, nowMs: number): boolean {
  if (!earliestRaw) return false
  const earliest = Date.parse(earliestRaw)
  return Number.isFinite(earliest) && nowMs < earliest
}

function isConfirmTooEarlyError(error: unknown): string | null {
  if (!(error instanceof functions.https.HttpsError)) return null
  const details = error.details as { earliestAttemptAt?: string } | undefined
  if (typeof details?.earliestAttemptAt === 'string') return details.earliestAttemptAt
  const match = error.message.match(/attempt is before (.+)$/)
  return match?.[1] || null
}

function scaleAssignmentsToAmount(
  assignments: Array<{ cardId: number; machineId: number; amount: number }>,
  targetZar: number
): Array<{ cardId: number; machineId: number; amount: number }> {
  if (!(targetZar > 0) || !assignments.length) return []
  const total = assignments.reduce((s, row) => s + (row.amount || 0), 0)
  if (!(total > 0)) return assignments.map((row) => ({ ...row, amount: 0 }))
  const scaled = assignments.map((row) => ({
    ...row,
    amount: Math.round(((row.amount || 0) / total) * targetZar * 100) / 100,
  }))
  const drift = Math.round((targetZar - scaled.reduce((s, row) => s + row.amount, 0)) * 100) / 100
  if (scaled[0]) scaled[0] = { ...scaled[0], amount: Math.round((scaled[0].amount + drift) * 100) / 100 }
  return scaled.filter((row) => row.amount > 0)
}

async function applySalesScheduleAmendmentOnDesk(params: {
  adminUid: string
  testRunId: string
  testRef: FirebaseFirestore.DocumentReference
  testData: FirebaseFirestore.DocumentData
  cycleRef: FirebaseFirestore.DocumentReference
  cycleSnap: FirebaseFirestore.DocumentSnapshot
  cycleNumber: number
  askMessage: string
  liveState: RoutingState
  nowMs: number
  awaitingKind: string
}): Promise<{
  testRunId: string
  cycleNumber: number
  status: string
  acknowledgement: string
  planVersion?: number
}> {
  const {
    adminUid,
    testRunId,
    testRef,
    testData,
    cycleRef,
    cycleSnap,
    cycleNumber,
    askMessage,
    liveState,
    nowMs,
    awaitingKind,
  } = params

  const schedule = salesScheduleFromDoc(testData as Record<string, unknown>)
  const idempotencyKeyHint = `${askMessage.trim().toLowerCase().replace(/\s+/g, ' ')}|v${schedule.planVersion}`
  const priorAmendments = Array.isArray(testData.salesScheduleAmendments)
    ? (testData.salesScheduleAmendments as Array<Record<string, unknown>>)
    : []
  const priorHit = priorAmendments.find((row) => row.idempotencyKey === idempotencyKeyHint || row.rawMessageNorm === idempotencyKeyHint.split('|')[0] && row.expectedPlanVersion === schedule.planVersion)
  if (priorHit && typeof priorHit.replyBody === 'string') {
    return {
      testRunId,
      cycleNumber,
      status: 'idempotent',
      acknowledgement: priorHit.replyBody,
      planVersion: schedule.planVersion,
    }
  }

  const parsed = parseSalesScheduleAmendment(askMessage, {
    nowMs,
    expectedPlanVersion: schedule.planVersion,
  })
  if ('clarification' in parsed) {
    const now = admin.firestore.Timestamp.now()
    const feedbackId = testRef.collection('feedback').doc().id
    const body = parsed.clarification
    await db.runTransaction(async (tx) => {
      publishAdviceCard(tx, {
        adminUid,
        testRunId,
        cycleNumber,
        feedbackId,
        now,
        title: 'Clarify',
        body,
        userReply: askMessage,
        routingAction: 'advice',
        deskSpeaker: 'sam',
      })
      tx.set(testRef.collection('feedback').doc(feedbackId), {
        id: feedbackId,
        adminUserId: adminUid,
        cycleNumber,
        rawMessage: askMessage,
        replyBody: body,
        status: 'question',
        askIntent: 'schedule_amendment',
        createdAt: now,
      })
    })
    return { testRunId, cycleNumber, status: 'question', acknowledgement: body }
  }

  const deskStep = num(testData.deskStep, stepForPhase(String(testData.cyclePhase || '')) || 1)
  const scope = replanScopeForStep(deskStep)
  const cycleData = cycleSnap.exists ? cycleSnap.data() || {} : {}
  const previousDaily = num(
    cycleData.deployedAmount,
    num(testData.expectedOrderZar, num(liveState.window?.snapshot.days.at(-1)?.recommendedZar, 25_000))
  )
  const committedZar = num(testData.salesCommittedZar, 0)
  const beliefBefore = beliefFingerprint({
    pathResiduals: testData.pathResiduals,
    pairings: liveState.pairings,
    routeEvidenceVersion: testData.routeEvidenceVersion as string | number | null,
  })

  let effectiveProposal = parsed
  if (scope.applyFromNextDay && effectiveProposal.effectiveDate === sastIsoDate(nowMs)) {
    // Step 6: push to next open operating day if they said "today" after close.
    const tomorrow = sastIsoDate(nowMs + 86_400_000)
    effectiveProposal = {
      ...effectiveProposal,
      effectiveDate: tomorrow,
      dateOverrides: Object.fromEntries(
        Object.entries(effectiveProposal.dateOverrides).map(([k, v]) =>
          k === sastIsoDate(nowMs) ? [tomorrow, v] : [k, v]
        )
      ),
    }
  }

  const result = applySalesScheduleAmendment(effectiveProposal, {
    nowMs,
    plan: schedule,
    floor: {
      deskStep,
      cyclePhase: typeof testData.cyclePhase === 'string' ? testData.cyclePhase : null,
      expectedOrderZar: num(testData.expectedOrderZar, previousDaily),
      deployedAmount: num(cycleData.deployedAmount, previousDaily),
      committedZar,
      cycleStatus: typeof cycleData.status === 'string' ? cycleData.status : null,
    },
    previousDailyAmountZar: dailyCapForDate(schedule, effectiveProposal.effectiveDate, previousDaily),
    safeDailyCeilingZar: OPERATING_POLICY_V1.network.establishedDailyCeilingZar,
    beliefFingerprintBefore: beliefBefore,
  })

  if (!result.ok) {
    const now = admin.firestore.Timestamp.now()
    const feedbackId = testRef.collection('feedback').doc().id
    const body = result.clarification
    await db.runTransaction(async (tx) => {
      publishAdviceCard(tx, {
        adminUid,
        testRunId,
        cycleNumber,
        feedbackId,
        now,
        title: result.status === 'stale_version' ? 'Plan revised' : 'Clarify',
        body,
        userReply: askMessage,
        routingAction: 'advice',
        deskSpeaker: 'sam',
      })
      tx.set(testRef.collection('feedback').doc(feedbackId), {
        id: feedbackId,
        adminUserId: adminUid,
        cycleNumber,
        rawMessage: askMessage,
        replyBody: body,
        status: result.status,
        askIntent: 'schedule_amendment',
        expectedPlanVersion: effectiveProposal.expectedPlanVersion,
        currentPlanVersion: result.currentPlanVersion,
        createdAt: now,
      })
    })
    return { testRunId, cycleNumber, status: result.status, acknowledgement: body, planVersion: result.currentPlanVersion }
  }

  const todayIso = sastIsoDate(nowMs)
  const revisesToday =
    effectiveProposal.effectiveDate === todayIso ||
    Object.prototype.hasOwnProperty.call(result.nextPlan.dateOverrides, todayIso)
  const nextOrderZar = revisesToday
    ? dailyCapForDate(result.nextPlan, todayIso, result.revisedDailyAmountZar)
    : num(testData.expectedOrderZar, previousDaily)
  const remaining = Math.max(0, nextOrderZar - committedZar)
  const priorAssignments = Array.isArray(cycleData.cardAssignments)
    ? (cycleData.cardAssignments as Array<{ cardId: number; machineId: number; amount: number }>)
    : []
  const nextAssignments =
    revisesToday && (awaitingKind === 'deploy' || awaitingKind === 'step') && cycleSnap.exists
      ? scaleAssignmentsToAmount(priorAssignments, remaining > 0 ? remaining : nextOrderZar)
      : priorAssignments

  const now = admin.firestore.Timestamp.now()
  const feedbackId = testRef.collection('feedback').doc().id
  const planMomentId = `${feedbackId}-plan`
  const samBody = result.explanation
  const planBody = formatPlanRevisedBody(result)
  const amendmentRecord = {
    id: feedbackId,
    action: 'revise_sales_schedule',
    rawMessage: askMessage,
    rawMessageNorm: askMessage.trim().toLowerCase().replace(/\s+/g, ' '),
    idempotencyKey: effectiveProposal.idempotencyKey || idempotencyKeyHint,
    expectedPlanVersion: effectiveProposal.expectedPlanVersion,
    oldPlanVersion: result.previousPlan.planVersion,
    newPlanVersion: result.nextPlan.planVersion,
    effectiveDate: result.effectiveDate,
    previousDailyAmountZar: result.previousDailyAmountZar,
    revisedDailyAmountZar: result.revisedDailyAmountZar,
    committedFloorZar: result.committedFloorZar,
    remainingToScheduleZar: result.remainingToScheduleZar,
    residualBeforeZar: result.residualBeforeZar,
    residualAfterZar: result.residualAfterZar,
    previousProjectedCompletionDate: result.previousProjectedCompletionDate,
    revisedProjectedCompletionDate: result.revisedProjectedCompletionDate,
    supersededInstructionIds: result.supersededInstructionIds,
    newlyPlannedInstructionIds: result.newlyPlannedInstructionIds,
    reasonClass: effectiveProposal.reasonClass,
    parsedProposal: effectiveProposal,
    replyBody: samBody,
    planBody,
    actor: adminUid,
    policyVersion: result.nextPlan.policyVersion,
    stateHash: result.nextPlan.stateHash,
    beliefFingerprintBefore: beliefBefore,
    beliefFingerprintAfter: result.beliefFingerprintAfter,
    touchedBeliefs: false,
    deskStep,
    createdAtMs: nowMs,
  }

  const sellRate =
    num(cycleData.sellRate, 0) ||
    num((testData.frozenQuote as { sellRate?: number } | undefined)?.sellRate, 0) ||
    num(testData.orderSellRate, 0)
  const shouldReplayDayTickets =
    revisesToday &&
    cycleSnap.exists &&
    committedZar <= 0 &&
    deskStep >= 1 &&
    deskStep <= 4 &&
    (scope.mayRebuildFullDay || deskStep <= 3)

  const replayNote = shouldReplayDayTickets
    ? ' I’ve replayed today’s Order → Invoice → MZN tickets at the revised amounts (prior drafts superseded).'
    : ''
  const samBodyWithReplay = `${samBody}${replayNote}`
  const planBodyWithReplay = shouldReplayDayTickets
    ? `${planBody}\nDay tickets replayed through Step ${Math.min(deskStep, 4)}.`
    : planBody

  await db.runTransaction(async (tx) => {
    // Sam conversational reply
    publishAdviceCard(tx, {
      adminUid,
      testRunId,
      cycleNumber,
      feedbackId,
      now,
      title: 'Schedule',
      body: samBodyWithReplay,
      userReply: askMessage,
      routingAction: 'advice',
      deskSpeaker: 'sam',
    })
    // Compact Plan revised moment (separate card)
    publishAdviceCard(tx, {
      adminUid,
      testRunId,
      cycleNumber,
      feedbackId: planMomentId,
      now,
      title: 'Plan revised',
      body: planBodyWithReplay,
      userReply: '',
      routingAction: 'advice',
      deskSpeaker: 'sam',
    })

    const nextSchedule: SalesScheduleState = result.nextPlan
    tx.set(
      testRef,
      {
        salesSchedule: nextSchedule,
        salesScheduleAmendments: [
          ...priorAmendments.slice(-40),
          { ...amendmentRecord, replyBody: samBodyWithReplay, planBody: planBodyWithReplay, dayTicketsReplayed: shouldReplayDayTickets },
        ],
        ...(revisesToday
          ? {
              expectedOrderZar: nextOrderZar,
              expectedOrderMzn: expectedMznForOrder(nextOrderZar, sellRate),
            }
          : {}),
        updatedAt: now,
      },
      { merge: true }
    )

    // Persist cycle amounts now; full ticket replay runs after the transaction.
    if (revisesToday && cycleSnap.exists) {
      tx.set(
        cycleRef,
        {
          expectedOrderZar: nextOrderZar,
          deployedAmount: nextOrderZar,
          cardAssignments: nextAssignments.length ? nextAssignments : priorAssignments,
          planVersion: nextSchedule.planVersion,
          supersededPlanVersion: result.previousPlan.planVersion,
          updatedAt: now,
        },
        { merge: true }
      )
    }

    // If something is already committed, only revise the uncommitted Leo remainder (no full rewind).
    if (revisesToday && cycleSnap.exists && committedZar > 0 && awaitingKind === 'deploy') {
      const previousEventId = currentRoutingEventId(testRunId, cycleNumber, cycleData)
      if (previousEventId) {
        const revisionCount = num(cycleData.revisionCount, 0)
        const blocked = remaining <= 0
        const published = publishAgentRevision(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          previousEventId,
          revisionCount,
          now,
          title: stepCardTitle(4),
          body: [
            samBodyWithReplay,
            '',
            `Revised day order ${formatZar(nextOrderZar)} (${formatZar(committedZar)} committed · ${formatZar(remaining)} still to schedule).`,
          ].join('\n'),
          dropdownTitle: stepCardTitle(4),
          dropdownBody: `Revised to ${formatZar(nextOrderZar)}`,
          amountValue: Math.max(remaining, committedZar),
          awaitingConfirm: !blocked && remaining > 0,
          routingBlocked: blocked,
          userReply: askMessage,
        })
        tx.update(cycleRef, {
          activityEventId: published.activityEventId,
          revisionCount: published.revisionCount,
          status: 'awaiting_execution',
          updatedAt: now,
        })
      }
    }

    tx.set(testRef.collection('feedback').doc(feedbackId), {
      ...amendmentRecord,
      replyBody: samBodyWithReplay,
      planBody: planBodyWithReplay,
      dayTicketsReplayed: shouldReplayDayTickets,
      createdAt: now,
      status: 'applied',
      askIntent: 'schedule_amendment',
    })
    tx.set(testRef.collection('planVersions').doc(String(nextSchedule.planVersion)), {
      ...nextSchedule,
      amendmentId: feedbackId,
      createdAt: now,
      status: 'current',
    })
    tx.set(
      testRef.collection('planVersions').doc(String(result.previousPlan.planVersion)),
      { status: 'superseded', supersededAt: now, supersededBy: nextSchedule.planVersion },
      { merge: true }
    )
  })

  if (shouldReplayDayTickets) {
    try {
      await replayDayTicketsAfterScheduleAmendment({
        adminUid,
        testRunId,
        testRef,
        cycleRef,
        cycleNumber,
        liveState,
        nextOrderZar,
        nextAssignments: (nextAssignments.length ? nextAssignments : priorAssignments).map((row) => ({
          ...row,
          economicPaymentId: `sched-${testRunId}-c${cycleNumber}-${row.cardId}-${row.machineId}`,
        })),
        sellRate,
        previousDeskStep: deskStep,
        planVersion: result.nextPlan.planVersion,
        now,
      })
    } catch (error) {
      console.error('[scheduleAmendment] day ticket replay failed', error)
    }
  }

  return {
    testRunId,
    cycleNumber,
    status: 'applied',
    acknowledgement: samBodyWithReplay,
    planVersion: result.nextPlan.planVersion,
  }
}

/** Opens the next sale when a confirm saved the swipe and then timed out. */
export const admin_resumeRoutingCycle = functions
  .region('us-central1')
  .runWith({ secrets: [inboundSecret], timeoutSeconds: 120, memory: '512MB' })
  .https.onRequest(async (req, res) => {
    const provided = req.get('x-inbound-secret') || ''
    if (!provided || provided !== inboundSecret.value()) {
      res.status(401).json({ ok: false })
      return
    }
    const adminUid = ROUTING_ADMIN_UID
    const testRunId = await currentTestId(adminUid)
    if (!testRunId) {
      res.status(404).json({ ok: false, reason: 'no_run' })
      return
    }
    const snap = await db.collection(TESTS).doc(testRunId).get()
    const data = snap.data() || {}
    if (data.status !== 'active') {
      res.status(409).json({ ok: false, reason: 'not_active' })
      return
    }
    const awaiting = num(data.awaitingCycleNumber, 0)
    if (awaiting > 0) {
      res.status(200).json({ ok: true, already: data.awaitingKind || 'deploy', cycle: awaiting })
      return
    }
    const state = stateFromDoc(data)
    if (windowIsFinished(state)) {
      res.status(200).json({ ok: true, finished: true })
      return
    }
    const issued = await issueCycle(adminUid, testRunId, state, admin.firestore.Timestamp.now())
    res.status(200).json({
      ok: true,
      kind: issued.kind,
      cycle: issued.plan.cycleNumber,
      amountZar: issued.plan.deployedAmount,
    })
  })

export const admin_submitConversionRoutingFeedback = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const adminUid = assertRoutingAdmin(context)
    const acceptProposalId =
      typeof data?.acceptProposalId === 'string' ? data.acceptProposalId.trim() : ''
    const discardProposalId =
      typeof data?.discardProposalId === 'string' ? data.discardProposalId.trim() : ''
    const rawMessage = typeof data?.message === 'string' ? data.message.trim() : ''
    if (!rawMessage && !acceptProposalId && !discardProposalId) {
      throw new functions.https.HttpsError('invalid-argument', 'Ask text is required')
    }

    if (
      !acceptProposalId &&
      !discardProposalId &&
      /^(?:restart(?: the)?(?: desk| system| book| run)?|start over|reset(?: the)? desk)(?:\s*[.!])?$/i.test(
        rawMessage
      )
    ) {
      const started = await startNewTest(adminUid, true)
      const newRunId = String(started.testRunId || '')
      if (!newRunId) {
        throw new functions.https.HttpsError('internal', 'Desk restart failed to open a run')
      }
      const now = admin.firestore.Timestamp.now()
      const feedbackId = `restart-${now.toMillis()}`
      const body =
        'Desk restarted at Day 0. Tap $ and sell ZAR to open Day 1. Then the book walks Steps 1–6 without a clock pause: Order → Invoice → MZN → Send → Recycle → What happened.'
      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId: newRunId,
          cycleNumber: 0,
          feedbackId,
          now,
          title: stepCardTitle(6),
          body,
          userReply: rawMessage,
          routingAction: 'advice',
          deskSpeaker: 'sam',
        })
        tx.set(db.collection(TESTS).doc(newRunId).collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber: 0,
          rawMessage,
          interpretationSummary: 'Desk restarted',
          replyBody: body,
          status: 'applied',
          createdAt: now,
        })
      })
      return {
        testRunId: newRunId,
        cycleNumber: 0,
        status: 'applied',
        acknowledgement: body,
        interpreter: 'fast_path',
      }
    }

    const requestedRun = typeof data?.testRunId === 'string' ? data.testRunId : undefined
    const requestedCycle = typeof data?.cycleNumber === 'number' ? data.cycleNumber : undefined
    const testRunId = requestedRun || (await currentTestId(adminUid))
    if (!testRunId) {
      throw new functions.https.HttpsError('not-found', 'No conversion routing test is active')
    }

    const testRef = db.collection(TESTS).doc(testRunId)
    const testSnap = await testRef.get()
    if (!testSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Conversion routing test not found')
    }
    const testData = testSnap.data() || {}
    if (testData.status !== 'active') {
      const now = admin.firestore.Timestamp.now()
      const feedbackId = testRef.collection('feedback').doc().id
      const finishedCycle = num(testData.completedCycles, num(testData.awaitingCycleNumber, 0))
      if (
        (wantsNewRoutingRun(rawMessage) || acceptsNextWindow(rawMessage) || isNextWindowAsk(rawMessage)) &&
        !acceptProposalId &&
        !discardProposalId
      ) {
        const closed = stateFromDoc(testData)
        const walletZar = await zarWalletBalance(adminUid)
        const offer = nextWindowOffer({
          authorisedZar: closed.authorisedZar,
          profitZar: closed.cumulativeSpread,
          walletZar,
        })
        const named = zarAmountFromMessage(rawMessage)
        const amount = named && named > 0 ? named : offer.recommendedZar
        if (!(amount > 0) || amount > walletZar + 0.01) {
          const answered = await publishNextWindowCard({
            adminUid,
            testRunId,
            state: closed,
            message: rawMessage,
            walletZar,
          })
          return { testRunId, cycleNumber: finishedCycle, status: 'advice', acknowledgement: answered.body }
        }
        const started = await startNewTest(
          adminUid,
          true,
          amount,
          `Window opened: ${formatZar(amount)} to convert over 14 weekdays.`
        )
        return {
          testRunId: started.testRunId,
          cycleNumber: started.cycleNumber,
          status: 'advice',
          acknowledgement: `Next window opened at ${formatZar(amount)}. Day 1 is on the desk.`,
        }
      }
      const state = stateFromDoc(testData)
      const residual = residualToTarget(state)
      const body = [
        residual > 0
          ? `This 14-weekday window is closed with ${formatZar(residual)} still owed to the ZAR wallet.`
          : 'This 14-weekday window is closed. Residual to the ZAR wallet is R0.',
        'There is no next swipe or payout on this test.',
        `ZAR in the routing ledger: ${formatZar(state.availableCapital)} available` +
          (state.bufferUsed > 0 ? `, ${formatZar(state.bufferUsed)} waiting to restock.` : '.'),
        residual > 0
          ? 'Sell ZAR or add inventory to re-open the residual. Do not start a new window while U is still open.'
          : 'Say “start the window” if you want a new desk with no authorised U.',
      ].join(' ')
      const speaker = addressedDeskAgent(rawMessage)
      const walletZar = await zarWalletBalance(adminUid)
      const spoken = await voiceDeskCard({
        adminUid,
        testRunId,
        speaker,
        message: rawMessage,
        state,
        walletZar,
        fact: body,
      })
      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber: finishedCycle || state.config.cycleCount,
          feedbackId,
          now,
          title: spoken.title ? sideCardTitle('advice', spoken.title) : windowCardTitle('Closed'),
          body: spoken.body,
          userReply: rawMessage,
          routingAction: 'advice',
          startNextRun: residual <= 0,
          deskSpeaker: speaker,
          deskTable: spoken.table,
          deskChart: spoken.chart,
        })
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber: finishedCycle || state.config.cycleCount,
          rawMessage,
          replyBody: spoken.body,
          deskSpeaker: speaker,
          status: 'advice',
          createdAt: now,
        })
      })
      return {
        testRunId,
        cycleNumber: finishedCycle || state.config.cycleCount,
        status: 'advice',
        acknowledgement: spoken.body,
      }
    }

    const awaitingKind =
      typeof testData.awaitingKind === 'string' ? testData.awaitingKind : 'deploy'
    const cycleNumber = requestedCycle || num(testData.awaitingCycleNumber, 0)
    if (cycleNumber <= 0) {
      throw new functions.https.HttpsError('failed-precondition', 'No conversion routing cycle is in progress')
    }

    if (discardProposalId) {
      const proposalRef = testRef.collection('proposals').doc(discardProposalId)
      const proposalSnap = await proposalRef.get()
      if (!proposalSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'That proposal is no longer pending')
      }
      const now = admin.firestore.Timestamp.now()
      const eventRef = db
        .collection('users')
        .doc(adminUid)
        .collection('activityEvents')
        .doc(adviceEventId(testRunId, discardProposalId))
      await db.runTransaction(async (tx) => {
        tx.set(proposalRef, { status: 'discarded', updatedAt: now }, { merge: true })
        tx.set(
          eventRef,
          { status: 'cancelled', awaitingProposalAccept: false, updatedAt: now },
          { merge: true }
        )
      })
      return { testRunId, cycleNumber, status: 'discarded', acknowledgement: 'Discarded.' }
    }

    const state = stateFromDoc(testData)
    const nowMs = Date.now()
    const ledger = await loadDeskLedger()
    const constraints = expireConstraintsByTime(constraintsFromDoc(testData), nowMs)
    const cycleRef = testRef.collection('cycles').doc(String(cycleNumber))
    const cycleSnap = await cycleRef.get()
    const canReviseDeploy =
      awaitingKind === 'deploy' &&
      cycleSnap.exists &&
      cycleSnap.data()?.status === 'awaiting_execution' &&
      num(testData.awaitingCycleNumber, 0) === cycleNumber
    const stored = storedPlanFromCycle(cycleSnap.exists ? cycleSnap.data() || {} : {}, cycleNumber)
    const quotes = await applyLiveQuotes(state)
    let liveState = { ...state, config: { ...state.config, spread: quotes.state.config.spread } }
    const [recentCycles, recentFeedback] = await Promise.all([
      loadRecentCycleBriefs(testRunId),
      loadRecentFeedbackBriefs(testRunId),
    ])
    const issuedAtMs = firestoreTimestampMs(cycleSnap.data()?.createdAt)
    const historyBrief = buildRoutingLedgerBrief({
      ledger: ledgerFromRoutingState(liveState),
      constraints,
      recentCycles,
      recentFeedback,
      awaiting: {
        cycleNumber,
        kind: typeof testData.awaitingKind === 'string' ? testData.awaitingKind : 'deploy',
        issuedAtMs,
      },
      nowMs,
    })
    const interpretContext = {
      cycleNumber,
      assignments: stored.cardAssignments,
      state: liveState,
      constraints,
      nowMs,
      historyBrief,
      issuedAtMs,
    }

    let askMessage = rawMessage
    let interpreted: {
      intents: RoutingIntent[]
      clarification: string | null
      interpreter: 'llm' | 'fast_path'
    }
    const pendingKindForAsk =
      recentFeedback.find((row) => row.status === 'question' && row.questionKind)?.questionKind || null
    let classification: AskClassification
    let acceptedPathWrites: PathWrite[] = []
    if (acceptProposalId) {
      const proposalSnap = await testRef.collection('proposals').doc(acceptProposalId).get()
      if (!proposalSnap.exists || proposalSnap.data()?.status !== 'pending') {
        throw new functions.https.HttpsError('not-found', 'That proposal is no longer pending')
      }
      const proposal = proposalSnap.data() || {}
      askMessage = typeof proposal.rawMessage === 'string' && proposal.rawMessage.trim()
        ? proposal.rawMessage.trim()
        : rawMessage || 'Accept'
      interpreted = {
        intents: Array.isArray(proposal.intents)
          ? (proposal.intents as unknown[])
              .map((row) => sanitizeIntent(row))
              .filter((row): row is RoutingIntent => Boolean(row))
          : [],
        clarification: null,
        interpreter: 'fast_path',
      }
      acceptedPathWrites = Array.isArray(proposal.pathWrites)
        ? (proposal.pathWrites as unknown[]).flatMap((row) => {
            const parsed = parsePathWrite(row)
            return parsed ? [parsed] : []
          })
        : []
      classification = {
        intent: acceptedPathWrites.length ? 'path_write' : 'constraint_request',
        confidence: 1,
        source: 'fast_path',
        cardIds: [],
        machineIds: [],
        reason: 'accepted pending proposal',
      }
    } else {
      classification = await classifyAskIntent(askMessage, { pendingKind: pendingKindForAsk })
      if (
        classification.intent === 'next_window' ||
        isNextWindowAsk(askMessage) ||
        (windowIsFinished(liveState) && acceptsNextWindow(askMessage))
      ) {
        const answered = await publishNextWindowCard({
          adminUid,
          testRunId,
          state: liveState,
          message: askMessage,
          walletZar: await zarWalletBalance(adminUid),
        })
        return {
          testRunId,
          cycleNumber,
          status: 'advice',
          acknowledgement: answered.body,
        }
      }
      if (
        mayAmendSchedule(classification.intent) &&
        classification.confidence >= ASK_INTENT_MIN_CONFIDENCE
      ) {
        return applySalesScheduleAmendmentOnDesk({
          adminUid,
          testRunId,
          testRef,
          testData,
          cycleRef,
          cycleSnap,
          cycleNumber,
          askMessage,
          liveState,
          nowMs,
          awaitingKind,
        })
      }
      const allowConstraintIntents =
        mayMutateRoute(classification.intent) && classification.confidence >= ASK_INTENT_MIN_CONFIDENCE
      if (!allowConstraintIntents) {
        interpreted = {
          intents: [] as RoutingIntent[],
          clarification: null,
          interpreter: classification.source === 'llm' ? 'llm' : 'fast_path',
        }
      } else {
      const memoryAnswer = isMemoryOrHistoryQuestion(askMessage)
          ? answerMemoryQuestion({
              message: askMessage,
              nowMs,
              constraints,
              recentFeedback,
              recentCycles,
              ledger: ledgerFromRoutingState(liveState),
              awaiting: { cycleNumber },
            })
          : null
      const clientSentIntents = Array.isArray(data?.intents)
      const providedIntents = attachResolvedExpiry(
        clientSentIntents
          ? (data.intents as unknown[])
              .map((row) => sanitizeIntent(row))
              .filter((row): row is RoutingIntent => Boolean(row))
          : [],
        askMessage,
        nowMs
      )
      const clientClarification = usefulClarification(
        typeof data?.clarification === 'string' ? data.clarification : null
      )
      const recoveredFastPath = providedIntents.length ? null : parseFastPath(askMessage)
      const looksLikeHistoryQuestion = isMemoryOrHistoryQuestion(askMessage) || isBankerQuestion(askMessage)
      const missingResolvedTime =
        hasFutureTimeConstraint(askMessage) &&
        !providedIntents.some(
          (row) => row.scope === 'until_date' || (typeof row.expiresAt === 'number' && row.expiresAt > nowMs)
        )
      const shouldReinterpret =
        Boolean(llmApiKey()) &&
        ((providedIntents.length === 0 && looksLikeHistoryQuestion) || missingResolvedTime)
      interpreted = shouldNotApplyAskIntents(askMessage) || isDeskChoiceReply(askMessage, pendingKindForAsk)
        ? {
            intents: [] as RoutingIntent[],
            clarification: null,
            interpreter: 'fast_path' as const,
          }
        : memoryAnswer
        ? {
            intents: [] as RoutingIntent[],
            clarification: memoryAnswer,
            interpreter: 'fast_path' as const,
          }
        : providedIntents.length && !shouldReinterpret
        ? {
            intents: providedIntents,
            clarification: clientClarification,
            interpreter: 'llm' as const,
          }
        : recoveredFastPath?.intents.length
          ? {
              ...recoveredFastPath,
              intents: attachResolvedExpiry(recoveredFastPath.intents, askMessage, nowMs),
            }
          : shouldReinterpret || !clientSentIntents
            ? await interpretAdminFeedback(askMessage, interpretContext).then((result) => ({
                ...result,
                intents: attachResolvedExpiry(result.intents, askMessage, nowMs),
              }))
            : {
                intents: [] as RoutingIntent[],
                clarification: clientClarification || contextualClarify(stored.cardAssignments),
                interpreter: 'llm' as const,
              }
      }
    }

    const allowRouteMutation =
      mayMutateRoute(classification.intent) && classification.confidence >= ASK_INTENT_MIN_CONFIDENCE
    const validIntents: RoutingIntent[] = []
    if (allowRouteMutation) {
      for (const intent of interpreted.intents) {
        if (!validateIntent(intent, liveState)) validIntents.push(intent)
      }
    }

    const now = admin.firestore.Timestamp.now()
    const feedbackId = acceptProposalId || testRef.collection('feedback').doc().id
    const cycleData = cycleSnap.data() || {}
    const previousEventId = cycleSnap.exists
      ? currentRoutingEventId(testRunId, cycleNumber, cycleData)
      : ''
    const revisionCount = num(cycleData.revisionCount, 0)
    const currentPlan = canReviseDeploy ? stored : null
    const currentBook = pathBookFromDoc(testData, quotes.quote)
    const openRow = stored.cardAssignments[0]
    const previewPathWrite =
      acceptedPathWrites[0] ||
      (classification.intent === 'path_write'
        ? classifyPathWrite(askMessage, {
            cardIds: classification.cardIds,
            machineIds: classification.machineIds,
            amountZar: openRow?.amount ?? stored.deployedAmount,
            openCardId: openRow?.cardId ?? null,
            openMachineId: openRow?.machineId ?? null,
            economicPaymentId: openRow
              ? residualPaymentId(cycleNumber, openRow.cardId, openRow.machineId)
              : undefined,
          })?.write
        : undefined)

    if (acceptedPathWrites.length) {
      const nextBook = applyPathWrites(currentBook, acceptedPathWrites, {
        cycleNumber,
        nowIso: new Date(nowMs).toISOString(),
      })
      liveState = acceptedPathWrites.reduce((state, write) => applyWindowPathWrite(state, write), liveState)
      const acknowledgement = acceptedPathWrites.map((row) => row.summary).join(' ')
      const overlay = overlayFromConstraints(constraints)
      const preview = previewAskImpact(
        previewStateForAsk(liveState, awaitingKind),
        overlay,
        quotes.costRate,
        nextBook
      )
      const evidenceForFlow = await loadRecentRouteEvidence(80)
      const rawPlan = preview.nextPlan || planCycle(liveState, overlay, nextBook)
      const flowRankedAssignments =
        rawPlan.cardAssignments.length > 0
          ? rankAssignmentsByBelief(rawPlan.cardAssignments, evidenceForFlow, {
              pendingExposureZar: liveState.bufferUsed,
              sellRate: quotes.sellRate,
              baseCostRate: quotes.costRate,
              state: liveState,
              notes: nextBook.notes,
              residuals: nextBook.residuals,
            })
          : rawPlan.cardAssignments
      const plan: CyclePlan = { ...rawPlan, cardAssignments: flowRankedAssignments }
      const priorFingerprint = assignmentsFingerprint(stored.cardAssignments)
      const nextFingerprint = assignmentsFingerprint(plan.cardAssignments)
      const deskStepNow = num(testData.deskStep, stepForPhase(String(testData.cyclePhase || '')) || 1)
      const committedZar = num(testData.salesCommittedZar, 0)
      const replayDay = shouldReplayDayAfterFlowRevision({
        deskStep: deskStepNow,
        cyclePhase: typeof testData.cyclePhase === 'string' ? testData.cyclePhase : null,
        committedZar,
        assignmentsChanged: priorFingerprint !== nextFingerprint,
        awaitingKind,
      })
      await db.runTransaction(async (tx) => {
        if (canReviseDeploy && !replayDay) {
          const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
          const activity = buildAgentReplyCopy(plan, liveState.config.cycleCount, acknowledgement, blocked)
          const notification = blocked
            ? {
                title: stepCardTitle(4),
                body: 'Hold. No live legal pair under current residuals and freezes.',
              }
            : buildNotificationCopy(plan, liveState.config.cycleCount)
          const published = publishAgentRevision(tx, {
            adminUid,
            testRunId,
            cycleNumber,
            previousEventId,
            revisionCount,
            now,
            title: activity.title,
            body: activity.body,
            dropdownTitle: notification.title,
            dropdownBody: notification.body,
            amountValue: plan.deployedAmount,
            awaitingConfirm: !blocked,
            routingBlocked: blocked,
            userReply: askMessage,
          })
          tx.update(cycleRef, {
            cardAssignments: plan.cardAssignments,
            machineAssignments: plan.cardAssignments.map((row) => ({
              machineId: row.machineId,
              cardId: row.cardId,
              amount: row.amount,
            })),
            deployedAmount: plan.deployedAmount,
            idleCapital: plan.idleCapital,
            expectedProfit: plan.expectedProfit,
            restingCardIds: plan.restingCardIds,
            restingMachineIds: plan.restingMachineIds,
            selectionReason: plan.selectionReason,
            quote: nextBook.quote || quotes.quote,
            sellRate: quotes.sellRate,
            costRate: quotes.costRate,
            activityEventId: published.activityEventId,
            revisionCount: published.revisionCount,
            revisionReason: acknowledgement,
            updatedAt: now,
          })
        } else if (canReviseDeploy && replayDay) {
          tx.update(cycleRef, {
            cardAssignments: plan.cardAssignments,
            machineAssignments: plan.cardAssignments.map((row) => ({
              machineId: row.machineId,
              cardId: row.cardId,
              amount: row.amount,
            })),
            deployedAmount: plan.deployedAmount,
            idleCapital: plan.idleCapital,
            expectedProfit: plan.expectedProfit,
            restingCardIds: plan.restingCardIds,
            restingMachineIds: plan.restingMachineIds,
            selectionReason: plan.selectionReason,
            quote: nextBook.quote || quotes.quote,
            sellRate: quotes.sellRate,
            costRate: quotes.costRate,
            revisionReason: acknowledgement,
            flowRevisionReplay: true,
            updatedAt: now,
          })
          tx.set(
            testRef,
            {
              expectedOrderZar: plan.deployedAmount,
              expectedOrderMzn: expectedMznForOrder(plan.deployedAmount, quotes.sellRate),
              updatedAt: now,
            },
            { merge: true }
          )
        } else if (awaitingKind === 'replenish') {
          const restock = planReplenish(liveState, quotes.costRate, overlay, nextBook)
          if (restock) {
            const rankedRestock = {
              ...restock,
              cardAssignments: rankAssignmentsByBelief(restock.cardAssignments, evidenceForFlow, {
                pendingExposureZar: liveState.bufferUsed,
                sellRate: quotes.sellRate,
                baseCostRate: quotes.costRate,
                state: liveState,
                notes: nextBook.notes,
                residuals: nextBook.residuals,
              }),
            }
            writeIssuedReplenish(
              tx,
              adminUid,
              testRunId,
              liveState,
              rankedRestock,
              now,
              overlay,
              nextBook,
              scheduleTicketPath({ assignments: rankedRestock.cardAssignments }),
              parseOrderLedger(testData.orderLedger),
              deskPlanChipFromDoc(testData),
              plannedWriteFields(testData)
            )
          }
        }
        const impactBody = formatAskImpactBody({
          acknowledgement,
          currentPlan,
          preview: { ...preview, nextPlan: plan },
          proposal: false,
          state: liveState,
          overlay,
        })
        const adviceBody = replayDay
          ? `${impactBody}\n\nI’ve noted the route change and will replay today’s Order → Invoice → MZN → Send tickets with the revised pairs.`
          : impactBody
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title: replayDay ? 'Plan revised' : 'Outcome recorded',
          body: adviceBody,
          userReply: askMessage,
          routingAction: 'advice',
        })
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber,
          rawMessage: askMessage,
          askIntent: classification,
          interpretationSummary: acknowledgement,
          status: 'applied',
          dayTicketsReplayed: replayDay,
          createdAt: now,
        })
        tx.set(
          testRef.collection('proposals').doc(acceptProposalId),
          { status: 'accepted', updatedAt: now },
          { merge: true }
        )
        tx.set(
          db
            .collection('users')
            .doc(adminUid)
            .collection('activityEvents')
            .doc(adviceEventId(testRunId, acceptProposalId)),
          { status: 'accepted', awaitingProposalAccept: false, updatedAt: now },
          { merge: true }
        )
        tx.set(testRef, persistPathBook({ constraints, updatedAt: now }, nextBook), { merge: true })
      })
      if (replayDay && canReviseDeploy) {
        try {
          await replayDayTicketsAfterScheduleAmendment({
            adminUid,
            testRunId,
            testRef,
            cycleRef,
            cycleNumber,
            liveState,
            nextOrderZar: plan.deployedAmount,
            nextAssignments: plan.cardAssignments.map((row) => ({
              ...row,
              economicPaymentId: residualPaymentId(cycleNumber, row.cardId, row.machineId),
            })),
            sellRate: quotes.sellRate,
            previousDeskStep: deskStepNow,
            planVersion: num(testData.dayTicketRevision, 0) + 1,
            now,
          })
        } catch (error) {
          console.error('[flowRevision] day ticket replay failed', error)
        }
      }
      return {
        testRunId,
        cycleNumber,
        status: 'applied',
        acknowledgement: replayDay
          ? `${acknowledgement} Day tickets replayed through Step ${Math.min(deskStepNow, 4)}.`
          : acknowledgement,
        interpreter: interpreted.interpreter,
      }
    }

    if (!validIntents.length && isExecutionContinuityAsk(askMessage)) {
      const phase = typeof testData.cyclePhase === 'string' ? testData.cyclePhase : ''
      const deskStepNow = num(testData.deskStep, 0)
      const overrideEarliest = isAdminContinueOverrideAsk(askMessage)
      let title = 'Still waiting'
      let body = 'Nothing on the desk was ready to advance from that green light.'
      let advanced = false

      if (
        phase === 'order_open' ||
        phase === 'awaiting_invoice' ||
        phase === 'awaiting_day_close' ||
        deskStepNow === 6 ||
        (phase === 'awaiting_mzn' && deskStepNow >= 1 && deskStepNow < 4)
      ) {
        const stepped = await advanceSequentialStep(adminUid)
        title = stepped.title
        body = stepped.body
        advanced = stepped.advanced
      } else if (awaitingKind === 'replenish' || phase === 'awaiting_recycle') {
        const eventEarliest = earliestAttemptFromDoc(
          (
            await db
              .collection('users')
              .doc(adminUid)
              .collection('activityEvents')
              .doc(replenishEventId(testRunId, cycleNumber))
              .get()
          ).data()
        )
        if (!overrideEarliest && isBeforeEarliest(eventEarliest, nowMs)) {
          const label = formatDeskClock(Date.parse(eventEarliest!))
          title = 'Waiting on the clock'
          body = `First swipe is scheduled for ${label} SAST. The daily path is paused until then — tap Continue to override as admin and move to the next day.`
        } else {
          try {
            advanced =
              (await tryAutoConfirmOpenRestock(overrideEarliest)) ||
              (await tryConfirmRecycleOnProceed(overrideEarliest))
          } catch (error) {
            const blockedUntil = isConfirmTooEarlyError(error)
            if (blockedUntil) {
              title = 'Waiting on the clock'
              body = `First swipe is scheduled for ${formatDeskClock(Date.parse(blockedUntil))} SAST. Tap Continue to override as admin and move on.`
            } else {
              throw error
            }
          }
          if (advanced) {
            title = overrideEarliest ? 'Continue — next day' : 'Restock confirmed'
            body = overrideEarliest
              ? 'Clock gate overridden. Restock closed and the next scheduled day is opening.'
              : 'Restock closed and the book is continuing. The next scheduled day should be on the desk — Sam will brief the order, then Amina’s invoice.'
          } else if (title === 'Still waiting') {
            const expectedZar = num(testData.replenishAmountZar, 0)
            const expectedMzn = num(testData.replenishAmountMzn, 0)
            const bal = await mznWalletBalance(adminUid)
            title = 'Swipe to continue'
            body = [
              `Restock of ${formatZar(expectedZar)} is still open.`,
              `Amina needs Mozambican COST cover of about MZN ${roundMoney(expectedMzn).toLocaleString('en-ZA')} (wallet shows MZN ${roundMoney(bal).toLocaleString('en-ZA')}).`,
              'After the cards are swiped, say proceed again — or tap I’ve swiped / Continue on the restock card.',
            ].join(' ')
          }
        }
      } else if (phase === 'awaiting_continue') {
        const before = phase
        await tryAdvanceContinuousCycle()
        const afterPhase = String((await testRef.get()).data()?.cyclePhase || '')
        advanced = afterPhase !== before
        if (afterPhase === 'awaiting_send') {
          title = 'Leo can send'
          body = 'ZAR float now covers the send. Continue on Step 4 when ZAR has left.'
        } else if (!advanced) {
          title = 'Need ZAR to continue'
          body = 'Add ZAR (or tap $ within the daily ceiling), then Continue on Step 4.'
        }
      } else if (awaitingKind === 'deploy' || phase === 'awaiting_send') {
        try {
          await confirmOpenCycle(adminUid, { testRunId, cycleNumber, overrideEarliest })
          advanced = true
          title = overrideEarliest ? 'Continue — send closed' : 'Send confirmed'
          body = 'Sale recorded. Recycle restock is next so the book keeps turning.'
        } catch (error) {
          const blockedUntil = isConfirmTooEarlyError(error)
          if (blockedUntil) {
            title = 'Waiting on the clock'
            body = `Send is scheduled for ${formatDeskClock(Date.parse(blockedUntil))} SAST. Tap Continue to override as admin.`
          } else {
            title = 'Confirm the send'
            body =
              'Open Leo’s send card and confirm when ZAR has left, or say proceed again after it is done.'
          }
        }
      }

      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title,
          body,
          userReply: askMessage,
          routingAction: 'advice',
          deskSpeaker: addressedDeskAgent(askMessage),
        })
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber,
          rawMessage: askMessage,
          askIntent: classification,
          interpretationSummary: title,
          replyBody: body,
          deskSpeaker: addressedDeskAgent(askMessage),
          status: advanced ? 'applied' : 'advice',
          createdAt: now,
        })
        tx.set(testRef, { updatedAt: now }, { merge: true })
      })
      return {
        testRunId,
        cycleNumber,
        status: advanced ? 'applied' : 'advice',
        acknowledgement: body,
        interpreter: 'fast_path',
      }
    }

    if (!validIntents.length) {
      const friction = enrichFriction(frictionFromDoc(testData, nowMs), ledger, testRunId)
      const pendingKind = recentFeedback.find((row) => row.status === 'question' && row.questionKind)?.questionKind || null
      const parsedNote = parseFrictionNote(askMessage, {
        nowMs,
        swipes: friction.swipes,
        pendingKind,
      })
      const notes = parsedNote ? [...friction.notes, parsedNote].slice(-40) : friction.notes
      const reviews = parsedNote
        ? [...friction.reviews, ...reviewsFromNotes([parsedNote])]
        : friction.reviews
      const desk = adviseDesk({
        message: askMessage,
        state: liveState,
        constraints,
        current: currentDeskRoute(testData, stored, awaitingKind),
        recentCycles,
        recentRestocks: recentRestocksFromDoc(testData),
        recentFeedback,
        swipes: friction.swipes,
        notes,
        history: friction.history,
        reviews,
        classification,
        cycleNumber,
        costRate: quotes.costRate,
        nowMs,
      })
      const pursueLabel = deskPursueLabel(desk)
      const isProposal =
        allowRouteMutation && desk.kind === 'options' && Boolean(desk.options?.length)
      const recommended = desk.options?.find((row) => row.id === desk.recommendedOptionId) || desk.options?.[0]
      const speaker = addressedDeskAgent(askMessage)
      const [walletZar, operator] = await Promise.all([zarWalletBalance(adminUid), loadDeskOperator(adminUid)])
      const openRoute = currentDeskRoute(testData, stored, awaitingKind)
      const visuals = buildDeskVisuals({
        state: liveState,
        recentCycles,
        current: openRoute,
        awaitingKind,
        holdReason: stored.holdReason || null,
        routingBlocked: openRoute.amountZar <= 0 && awaitingKind === 'deploy',
        sellRate: quotes.sellRate,
        costRate: quotes.costRate,
        walletZar,
      })
      const spoken = isProposal
        ? { title: desk.title, body: desk.body }
        : await converseAtDesk({
            speaker,
            message: askMessage,
            brief: historyBrief,
            visuals,
            deskFact:
              isCannedDeskAdvice(desk.title, desk.body) || !desk.body.trim() ? undefined : desk.body,
            operator,
            thread: deskThread(recentFeedback, nowMs),
            moment: deskMoment({
              nowMs,
              recentCycles,
              awaiting: { kind: awaitingKind, issuedAtMs, amountZar: openRoute.amountZar },
            }),
          })
      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title: spoken.title || desk.title,
          body: spoken.body,
          userReply: askMessage,
          routingAction: isProposal ? 'proposal' : 'advice',
          deskSpeaker: speaker,
          deskTable: 'table' in spoken ? spoken.table : undefined,
          deskChart: 'chart' in spoken ? spoken.chart : undefined,
          proposalId: isProposal ? feedbackId : undefined,
          awaitingProposalAccept: isProposal,
          pursueLabel,
          optionCount: desk.options?.length || 0,
          recommendedOptionId: desk.recommendedOptionId || null,
          questionKind: desk.questionKind || null,
        })
        if (isProposal && recommended) {
          tx.set(testRef.collection('proposals').doc(feedbackId), {
            id: feedbackId,
            status: 'pending',
            rawMessage: askMessage,
            intents: recommended.intents,
            ...(previewPathWrite ? { pathWrites: [previewPathWrite] } : {}),
            options: desk.options,
            recommendedOptionId: desk.recommendedOptionId || recommended.id,
            cycleNumber,
            createdAt: now,
          })
        }
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber,
          rawMessage: askMessage,
          interpretedIntent: interpreted,
          askIntent: classification,
          interpretationSummary: desk.body.split('\n')[0] || desk.title,
          replyBody: spoken.body,
          deskSpeaker: speaker,
          status: desk.kind === 'question' ? 'question' : isProposal ? 'proposal' : 'advice',
          questionKind: desk.questionKind || null,
          createdAt: now,
        })
        tx.set(testRef, { constraints, frictionNotes: notes, updatedAt: now }, { merge: true })
        if (parsedNote) {
          const mapped = reviewsFromNotes([parsedNote])[0]
          if (mapped) persistDeskReview(tx, mapped, now)
        }
      })
      return {
        testRunId,
        cycleNumber,
        status: isProposal ? 'proposal' : desk.kind === 'question' ? 'question' : 'advice',
        acknowledgement: spoken.body,
        interpreter: interpreted.interpreter,
      }
    }

    const previewApplied = applyIntentsToState(
      liveState,
      constraints,
      validIntents,
      cycleNumber,
      feedbackId
    )
    const preview = previewAskImpact(
      previewStateForAsk(previewApplied.state, awaitingKind),
      overlayFromConstraints(previewApplied.constraints),
      quotes.costRate,
      currentBook
    )
    const acknowledgement = previewApplied.summaries.join(' ')
    const previewBody = formatAskImpactBody({
      acknowledgement,
      currentPlan,
      preview,
      proposal: true,
      state: previewApplied.state,
      overlay: overlayFromConstraints(previewApplied.constraints),
    })

    if (isWhatIfAsk(askMessage) && !acceptProposalId) {
      const blocked = !(preview.replenishFirst?.cardAssignments.length || (preview.nextPlan && preview.nextPlan.deployedAmount > 0))
      const title = shortConstraintTitle(acknowledgement, blocked, awaitingKind)
      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title,
          body: previewBody,
          userReply: askMessage,
          routingAction: 'proposal',
          proposalId: feedbackId,
          awaitingProposalAccept: true,
        })
        tx.set(testRef.collection('proposals').doc(feedbackId), {
          id: feedbackId,
          status: 'pending',
          rawMessage: askMessage,
          intents: validIntents,
          cycleNumber,
          createdAt: now,
        })
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber,
          rawMessage: askMessage,
          interpretedIntent: validIntents,
          interpreter: interpreted.interpreter,
          interpretationSummary: acknowledgement,
          status: 'proposal',
          createdAt: now,
        })
      })
      return {
        testRunId,
        cycleNumber,
        status: 'proposal',
        acknowledgement,
        interpreter: interpreted.interpreter,
      }
    }

    if (!canReviseDeploy) {
      const overlay = overlayFromConstraints(previewApplied.constraints)
      const restock =
        awaitingKind === 'replenish'
          ? planReplenish(previewApplied.state, quotes.costRate, overlay, currentBook)
          : null
      const restockReady = Boolean(restock?.cardAssignments.length)
      const blocked = !restockReady && !(preview.nextPlan && preview.nextPlan.deployedAmount > 0)
      await db.runTransaction(async (tx) => {
        if (restockReady && restock) {
          writeIssuedReplenish(
            tx,
            adminUid,
            testRunId,
            previewApplied.state,
            restock,
            now,
            overlay,
            currentBook,
            scheduleTicketPath({ assignments: restock.cardAssignments }),
            parseOrderLedger(testData.orderLedger),
            deskPlanChipFromDoc(testData),
            plannedWriteFields(testData)
          )
        }
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title: restockReady ? 'Restock updated' : shortConstraintTitle(acknowledgement, blocked, awaitingKind),
          body: restockReady
            ? `${acknowledgement}\n\nRestock instruction updated. Execute the swipe on that card.`
            : formatAskImpactBody({
                acknowledgement: `${acknowledgement} ${
                  blocked
                    ? 'No swipe can run until a card is restored.'
                    : 'Takes effect on the next conversion instruction.'
                }`,
                currentPlan: null,
                preview,
                proposal: false,
                state: previewApplied.state,
                overlay: overlayFromConstraints(previewApplied.constraints),
              }),
          userReply: askMessage,
          routingAction: 'advice',
        })
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber,
          rawMessage: askMessage,
          interpretedIntent: validIntents,
          interpreter: interpreted.interpreter,
          interpretationSummary: acknowledgement,
          status: 'applied',
          createdAt: now,
        })
        if (acceptProposalId) {
          tx.set(
            testRef.collection('proposals').doc(acceptProposalId),
            { status: 'accepted', updatedAt: now },
            { merge: true }
          )
          tx.set(
            db
              .collection('users')
              .doc(adminUid)
              .collection('activityEvents')
              .doc(adviceEventId(testRunId, acceptProposalId)),
            { status: 'accepted', awaitingProposalAccept: false, updatedAt: now },
            { merge: true }
          )
        }
        tx.set(
          testRef,
          {
            config: previewApplied.state.config,
            cards: previewApplied.state.cards,
            machines: previewApplied.state.machines,
            constraints: previewApplied.constraints,
            updatedAt: now,
          },
          { merge: true }
        )
      })
      return {
        testRunId,
        cycleNumber,
        status: 'applied',
        acknowledgement,
        interpreter: interpreted.interpreter,
      }
    }

    const applied = previewApplied
    const overlay = overlayFromConstraints(applied.constraints)
    const plan = planCycle(applied.state, overlay, currentBook)
    const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
    const activity = buildAgentReplyCopy(plan, applied.state.config.cycleCount, acknowledgement, blocked)
    const notification = blocked
      ? {
          title: `Conversion Cycle ${plan.cycleNumber}`,
          body: 'No valid route under current constraints\nReply to restore a card or machine',
        }
      : buildNotificationCopy(plan, applied.state.config.cycleCount)

    await db.runTransaction(async (tx) => {
      const freshTest = await tx.get(testRef)
      const freshCycle = await tx.get(cycleRef)
      if (!freshTest.exists || freshTest.data()?.awaitingCycleNumber !== cycleNumber) {
        throw new functions.https.HttpsError('aborted', 'Cycle changed while feedback was being interpreted')
      }
      if (!freshCycle.exists || freshCycle.data()?.status !== 'awaiting_execution') {
        throw new functions.https.HttpsError('aborted', 'Cycle is no longer awaiting execution')
      }
      const previousAssignments = freshCycle.data()?.cardAssignments || stored.cardAssignments
      const published = publishAgentRevision(tx, {
        adminUid,
        testRunId,
        cycleNumber,
        previousEventId,
        revisionCount: num(freshCycle.data()?.revisionCount, revisionCount),
        now,
        title: activity.title,
        body: activity.body,
        dropdownTitle: notification.title,
        dropdownBody: notification.body,
        amountValue: plan.deployedAmount,
        awaitingConfirm: !blocked,
        routingBlocked: blocked,
        userReply: askMessage,
      })
      tx.set(testRef.collection('feedback').doc(feedbackId), {
        id: feedbackId,
        adminUserId: adminUid,
        cycleNumber,
        rawMessage: askMessage,
        interpretedIntent: validIntents,
        interpreter: interpreted.interpreter,
        interpretationSummary: acknowledgement,
        status: 'applied',
        createdAt: now,
      })
      tx.set(cycleRef.collection('thread').doc(), { role: 'admin', text: askMessage, createdAt: now })
      tx.set(cycleRef.collection('thread').doc(), { role: 'system', text: acknowledgement, createdAt: now })
      tx.update(cycleRef, {
        previousAssignments,
        cardAssignments: plan.cardAssignments,
        machineAssignments: plan.cardAssignments.map((row) => ({
          machineId: row.machineId,
          cardId: row.cardId,
          amount: row.amount,
        })),
        deployedAmount: plan.deployedAmount,
        idleCapital: plan.idleCapital,
        expectedProfit: plan.expectedProfit,
        restingCardIds: plan.restingCardIds,
        restingMachineIds: plan.restingMachineIds,
        selectionReason: plan.selectionReason,
        revisionReason: acknowledgement,
        activityEventId: published.activityEventId,
        revisionCount: published.revisionCount,
        sellRate: quotes.sellRate,
        costRate: quotes.costRate,
        spreadRate: applied.state.config.spread,
        updatedAt: now,
      })
      tx.set(
        testRef,
        {
          config: applied.state.config,
          cards: applied.state.cards,
          machines: applied.state.machines,
          constraints: applied.constraints,
          updatedAt: now,
        },
        { merge: true }
      )
      if (acceptProposalId) {
        tx.set(
          testRef.collection('proposals').doc(acceptProposalId),
          { status: 'accepted', updatedAt: now },
          { merge: true }
        )
        tx.set(
          db
            .collection('users')
            .doc(adminUid)
            .collection('activityEvents')
            .doc(adviceEventId(testRunId, acceptProposalId)),
          { status: 'accepted', awaitingProposalAccept: false, updatedAt: now },
          { merge: true }
        )
      }
    })

    return {
      testRunId,
      cycleNumber,
      status: blocked ? 'blocked' : 'revised',
      acknowledgement,
      interpreter: interpreted.interpreter,
      deployedAmount: plan.deployedAmount,
      cardAssignments: plan.cardAssignments,
    }
  })

async function creditWallet(
  adminUid: string,
  walletId: 'cashMZN' | 'cashZAR',
  amount: number
): Promise<void> {
  if (!(amount > 0)) return
  const ref = db.collection('users').doc(adminUid).collection('wallets').doc(walletId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = Number(snap.exists ? snap.data()?.fiatBalance || 0 : 0)
    tx.set(
      ref,
      {
        fiatBalance: roundMoney(current + amount),
        updatedAt: new Date().toISOString(),
        plannedTopUp: true,
      },
      { merge: true }
    )
  })
}

async function ensureSimulatedMznCover(adminUid: string, need: number): Promise<void> {
  if (!(need > 0)) return
  const bal = await mznWalletBalance(adminUid)
  if (mznCoversRestock(need, bal, [])) return
  await creditWallet(adminUid, 'cashMZN', roundMoney(need - bal + 1))
}

async function ensureSimulatedZarCover(adminUid: string, need: number): Promise<void> {
  if (!(need > 0)) return
  const bal = await zarWalletBalance(adminUid)
  if (bal + 0.5 >= need) return
  await creditWallet(adminUid, 'cashZAR', roundMoney(need - bal + 1))
}

/** Remove Planned / Real time notice bubbles for this run (including legacy future-dated ids). */
async function clearPlanMarkers(adminUid: string, testRunId: string): Promise<void> {
  const col = db.collection('users').doc(adminUid).collection('activityEvents')
  await col.doc(`planned-day-${testRunId}`).delete().catch(() => undefined)
  const snap = await col.where('testRunId', '==', testRunId).where('routingAction', '==', 'advice').limit(80).get()
  await Promise.all(
    snap.docs
      .filter((doc) => {
        const title = String(doc.data()?.title || '')
        return (
          title === 'Ask · Planned day' ||
          title === 'Ask · Real time' ||
          doc.id.startsWith(`planned-day-${testRunId}`) ||
          doc.id.startsWith(`realtime-${testRunId}`)
        )
      })
      .map((doc) => doc.ref.delete())
  )
}

type LiveCheckpoint = {
  atMs: number
  test: Record<string, unknown>
  cycles: Record<string, Record<string, unknown>>
  eventIds: string[]
  events?: Record<string, Record<string, unknown>>
  cashZar: number
  cashMzn: number
  /** Full EN ROUTE wallet before Planned mode; null means it did not exist. */
  earningsWallet?: Record<string, unknown> | null
}

async function captureLiveCheckpoint(adminUid: string, testRunId: string): Promise<LiveCheckpoint> {
  const testRef = db.collection(TESTS).doc(testRunId)
  const [testSnap, cyclesSnap, eventsSnap, zarSnap, mznSnap, earningsSnap] = await Promise.all([
    testRef.get(),
    testRef.collection('cycles').get(),
    db.collection('users').doc(adminUid).collection('activityEvents').where('testRunId', '==', testRunId).get(),
    db.collection('users').doc(adminUid).collection('wallets').doc('cashZAR').get(),
    db.collection('users').doc(adminUid).collection('wallets').doc('cashMZN').get(),
    db.collection('users').doc(adminUid).collection('wallets').doc('earnings').get(),
  ])
  const test = { ...(testSnap.data() || {}) } as Record<string, unknown>
  delete test.liveCheckpoint
  delete test.deskMode
  delete test.plannedClockMs
  const cycles: Record<string, Record<string, unknown>> = {}
  cyclesSnap.docs.forEach((doc) => {
    cycles[doc.id] = { ...(doc.data() || {}) }
  })
  const events: Record<string, Record<string, unknown>> = {}
  eventsSnap.docs.forEach((doc) => {
    events[doc.id] = { ...(doc.data() || {}) }
  })
  return {
    atMs: Date.now(),
    test,
    cycles,
    eventIds: eventsSnap.docs.map((doc) => doc.id),
    events,
    cashZar: roundMoney(Number(zarSnap.exists ? zarSnap.data()?.fiatBalance || 0 : 0)),
    cashMzn: roundMoney(Number(mznSnap.exists ? mznSnap.data()?.fiatBalance || 0 : 0)),
    earningsWallet: earningsSnap.exists ? { ...(earningsSnap.data() || {}) } : null,
  }
}

async function restoreLiveCheckpoint(
  adminUid: string,
  testRunId: string,
  checkpoint: LiveCheckpoint
): Promise<void> {
  const testRef = db.collection(TESTS).doc(testRunId)
  const now = admin.firestore.Timestamp.now()
  const cyclesSnap = await testRef.collection('cycles').get()
  await Promise.all(
    cyclesSnap.docs.map(async (doc) => {
      if (checkpoint.cycles[doc.id]) return
      await doc.ref.delete()
    })
  )
  await Promise.all(
    Object.entries(checkpoint.cycles).map(([id, data]) =>
      testRef.collection('cycles').doc(id).set(data, { merge: false })
    )
  )

  const keep = new Set(checkpoint.eventIds)
  const eventsSnap = await db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .where('testRunId', '==', testRunId)
    .get()
  await Promise.all(
    eventsSnap.docs
      .filter((doc) => !keep.has(doc.id))
      .map((doc) => doc.ref.delete())
  )
  if (checkpoint.events) {
    await Promise.all(
      Object.entries(checkpoint.events).map(([id, data]) =>
        db
          .collection('users')
          .doc(adminUid)
          .collection('activityEvents')
          .doc(id)
          .set(data, { merge: false })
      )
    )
  }
  await clearPlanMarkers(adminUid, testRunId)

  await db.collection('users').doc(adminUid).collection('wallets').doc('cashZAR').set(
    { fiatBalance: checkpoint.cashZar, updatedAt: new Date().toISOString() },
    { merge: true }
  )
  await db.collection('users').doc(adminUid).collection('wallets').doc('cashMZN').set(
    { fiatBalance: checkpoint.cashMzn, updatedAt: new Date().toISOString() },
    { merge: true }
  )
  // Checkpoints created before this field existed are left unchanged. New
  // Planned runs restore EN ROUTE exactly, including settlement metadata.
  if (Object.prototype.hasOwnProperty.call(checkpoint, 'earningsWallet')) {
    const earningsRef = db
      .collection('users')
      .doc(adminUid)
      .collection('wallets')
      .doc('earnings')
    if (checkpoint.earningsWallet) {
      await earningsRef.set(checkpoint.earningsWallet, { merge: false })
    } else {
      await earningsRef.delete()
    }
  }

  const restored = {
    ...checkpoint.test,
    deskMode: 'live' as const,
    plannedClockMs: null,
    updatedAt: now,
  }
  delete (restored as { liveCheckpoint?: unknown }).liveCheckpoint
  delete (restored as { planRunId?: unknown }).planRunId
  delete (restored as { plannedHorizonHours?: unknown }).plannedHorizonHours
  delete (restored as { plannedAnchorCycle?: unknown }).plannedAnchorCycle
  await testRef.set(restored, { merge: false })
}

/**
 * Next 24h — auto-walk the open day (Continue + synthetic bank cover) in Planned mode.
 * Stops when the next operating day opens, the window closes, or a hard stop.
 */
function keypadGateFromDoc(data: admin.firestore.DocumentData): 'send' | 'restock' | null {
  const phase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
  const awaitingKind = typeof data.awaitingKind === 'string' ? data.awaitingKind : ''
  if (awaitingKind === 'replenish' || phase === 'awaiting_recycle') return 'restock'
  // Only when Leo’s send is actually unlocked — not merely deskStep >= 4.
  if (awaitingKind === 'deploy' || phase === 'awaiting_send') return 'send'
  return null
}

/**
 * Bump Planned desk clock once per completed sale cycle.
 * Idempotent on `completedCycle` so confirm + Next 24h cannot double-jump.
 */
async function bumpPlannedClockIfNeeded(
  testRef: FirebaseFirestore.DocumentReference,
  adminUid: string,
  testRunId: string,
  completedCycle?: number
): Promise<number | null> {
  const snap = await testRef.get()
  const data = snap.data() || {}
  if (data.deskMode !== 'planned') return null
  const prev = num(data.plannedClockMs, 0)
  const base = prev > 0 ? prev : Date.now()
  if (completedCycle && completedCycle > 0 && num(data.plannedClockBumpedForCycle, 0) === completedCycle) {
    return prev > 0 ? prev : base
  }
  const next = addOneSastCalendarDay(base)
  const now = admin.firestore.Timestamp.now()
  await testRef.set(
    {
      plannedClockMs: next,
      ...(completedCycle && completedCycle > 0 ? { plannedClockBumpedForCycle: completedCycle } : {}),
      updatedAt: now,
    },
    { merge: true }
  )
  await db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .doc(`planned-day-${testRunId}`)
    .set({ plannedClockMs: next, updatedAt: now }, { merge: true })
    .catch(() => undefined)
  return next
}

export async function simulateNextDeskDay(adminUid: string): Promise<Record<string, unknown>> {
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) {
    throw new functions.https.HttpsError('not-found', 'No conversion routing test is active')
  }
  const testRef = db.collection(TESTS).doc(testRunId)
  const startSnap = await testRef.get()
  if (!startSnap.exists || startSnap.data()?.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'Desk run is not active')
  }
  const start = startSnap.data() || {}
  const startCycle = num(start.awaitingCycleNumber, 0) || num(start.completedCycles, 0) + 1
  const prevClock = num(start.plannedClockMs, 0)
  // Do not jump the header clock until a day actually completes.
  const plannedClockMs = prevClock > 0 ? prevClock : Date.now()
  const now = admin.firestore.Timestamp.now()
  // First entry into Planned freezes live desk + wallets so Real time can rewind the sim.
  const alreadyPlanned = start.deskMode === 'planned' && start.liveCheckpoint
  const liveCheckpoint = alreadyPlanned
    ? (start.liveCheckpoint as LiveCheckpoint)
    : await captureLiveCheckpoint(adminUid, testRunId)

  // Next 24h always anchors a 24h horizon; Next 72h pre-stamps 72 before calling this.
  const plannedHorizonHours = num(start.plannedHorizonHours, 0) >= 72 ? 72 : 24
  const plannedAnchorCycle =
    alreadyPlanned && num(start.plannedAnchorCycle, 0) > 0
      ? num(start.plannedAnchorCycle, 0)
      : startCycle
  const planRunId =
    alreadyPlanned && typeof start.planRunId === 'string' && start.planRunId
      ? start.planRunId
      : `plan-${testRunId}-${now.toMillis()}`
  await testRef.set(
    {
      deskMode: 'planned',
      plannedClockMs,
      plannedHorizonHours,
      plannedAnchorCycle,
      planRunId,
      liveCheckpoint,
      updatedAt: now,
    },
    { merge: true }
  )
  await publishDueExpectedBankReplies({
    adminUid,
    testRunId,
    testData: {
      ...start,
      deskMode: 'planned',
      planRunId,
      plannedHorizonHours,
      plannedAnchorCycle,
    },
    plannedClockMs,
  })

  let startGate = keypadGateFromDoc(start)
  // Already on Send/Restock — do not bump the day clock or spam another Planned marker.
  if (startGate === 'send') {
    await ensureSimulatedZarCover(adminUid, num(start.expectedOrderZar, 0))
    await tryAdvanceContinuousCycle()
    startGate = keypadGateFromDoc((await testRef.get()).data() || {}) || startGate
  }
  if (startGate) {
    const fresh = (await testRef.get()).data() || {}
    const state = stateFromDoc(fresh)
    return publicSummary(state, {
      testRunId,
      status: fresh.status || 'active',
      cycleNumber: startCycle,
      deskMode: 'planned',
      plannedClockMs,
      simulatedFromCycle: startCycle,
      simulatedToCycle: startCycle,
      simulatedSteps: [`${startGate}-open:${startCycle}`],
      awaitingKeypad: startGate,
      keypadAmountZar:
        startGate === 'send'
          ? num(fresh.expectedOrderZar, num(start.expectedOrderZar, 0))
          : num(fresh.replenishAmountZar, num(start.replenishAmountZar, 0)),
      keypadAmountMzn:
        startGate === 'restock'
          ? num(fresh.replenishAmountMzn, num(start.replenishAmountMzn, 0))
          : num(fresh.expectedOrderMzn, num(start.expectedOrderMzn, 0)),
      acknowledgement:
        startGate === 'send'
          ? `Day ${startCycle}: Send ZAR is still open — use the keypad, then Next 24h can finish the day.`
          : `Day ${startCycle}: Restock is still open — use the keypad, then Next 24h can open the next day.`,
      completed: fresh.status === 'completed',
    })
  }

  // Pause on Step 6 · What happened so the day recap stays visible.
  {
    const closePhase = typeof start.cyclePhase === 'string' ? start.cyclePhase : ''
    const closeStep = num(start.deskStep, 0)
    if (closePhase === 'awaiting_day_close' || closeStep === 6) {
      const state = stateFromDoc(start)
      const eftZar = openEftZar(eftBookFromDoc(start))
      return publicSummary(state, {
        testRunId,
        status: start.status || 'active',
        cycleNumber: startCycle,
        deskMode: 'planned',
        plannedClockMs,
        simulatedFromCycle: startCycle,
        simulatedToCycle: startCycle,
        simulatedSteps: [`day-close-open:${startCycle}`],
        awaitingDayClose: true,
        openEftZar: eftZar,
        acknowledgement: `Day ${startCycle} recap is on the desk — Continue opens Day ${startCycle + 1}. EFT ${formatZar(eftZar)}.`,
        completed: start.status === 'completed',
      })
    }
  }

  const startEft = eftBookFromDoc(start)
  const startEftZar = openEftZar(startEft)
  // One notice bubble for the run — wall-clock createdAt so it sits in the log, not pinned by a future stamp.
  await clearPlanMarkers(adminUid, testRunId)
  const markerId = `planned-day-${testRunId}`
  const planTitle = plannedHorizonHours >= 72 ? 'Simulate · Next 72h' : 'Simulate · Next 24h'
  await db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .doc(markerId)
    .set({
      id: markerId,
      kind: CONVERSION_ROUTING_KIND,
      title: planTitle,
      body: [
        `Simulating the next 24 hours from Day ${startCycle}.`,
        `Card R${Math.round(num(start.expectedOrderZar, 0)).toLocaleString('en-ZA')} · EFT R${Math.round(startEftZar).toLocaleString('en-ZA')}.`,
        'Bank cover is assumed through Order → Invoice → MZN; Send ZAR and Restock open the keypad.',
        'EFT advances open→submitted→settled only in Planned (synthetic cover). Live waits for bank_transfer.',
        'The day clock advances only after that joint day finishes. Tap Real time to restore the live desk.',
      ].join(' '),
      dropdownTitle: planTitle,
      dropdownBody: `Planned · Day ${startCycle} · card + EFT`,
      actorType: 'ai_manager',
      avatarKind: 'convert_zar',
      amountCurrency: 'ZAR',
      amountValue: 0,
      amountSign: 'debit',
      txId: markerId,
      hasDownloadButton: false,
      awaitingConfirm: false,
      routingBlocked: false,
      status: 'recorded',
      routingAction: 'advice',
      deskSpeaker: 'sam',
      deskMode: 'planned',
      simulated: true,
      planRunId,
      deskPlanChip: plannedHorizonHours >= 72 ? `72h plan · day 1` : '24h plan',
      deskChannel: startEftZar > 0 ? 'mixed' : 'card',
      plannedClockMs,
      openEftZar: startEftZar,
      testRunId,
      cycleNumber: startCycle,
      createdAt: now,
      updatedAt: now,
      recordingSource: 'SYSTEM',
    })

  const steps: string[] = []
  // Planned EFT advance once per Next 24h (does not block card keypad gates).
  {
    const clockMs = plannedClockMs
    const advanced = advanceEftBookPlannedDay(startEft, clockMs)
    const overdue = markOverdueEftTickets(advanced.book, clockMs)
    steps.push(...advanced.steps)
    if (overdue.overdue.length) {
      steps.push(`eft-overdue:${overdue.overdue.length}`)
    }
    // Planned transitions are feed-only. Never persist synthetic settlement or
    // delay evidence into the shared routing-learning collection.
    await testRef.set(
      {
        eftBook: overdue.book,
        openEftZar: openEftZar(overdue.book),
        updatedAt: now,
      },
      { merge: true }
    )
  }
  let stopped = 'max_steps'
  for (let i = 0; i < 14; i++) {
    const snap = await testRef.get()
    const data = snap.data() || {}
    if (data.status !== 'active') {
      stopped = 'window_closed'
      break
    }
    const phase = typeof data.cyclePhase === 'string' ? data.cyclePhase : ''
    const awaitingKind = typeof data.awaitingKind === 'string' ? data.awaitingKind : ''
    const cycleNumber = num(data.awaitingCycleNumber, 0)
    const deskStep = num(data.deskStep, 0)

    if (cycleNumber > startCycle && (phase === 'order_open' || deskStep === 1)) {
      stopped = 'next_day'
      break
    }
    if (phase === 'awaiting_day_close' || deskStep === 6) {
      stopped = 'awaiting_day_close'
      steps.push(`day-close-open:${cycleNumber}`)
      break
    }
    if (!(cycleNumber > 0)) {
      stopped = 'no_day'
      break
    }

    try {
      // Cash moves stay on the desk for the conversion keypad — do not auto-confirm.
      if (awaitingKind === 'replenish' || phase === 'awaiting_recycle') {
        const need = num(data.replenishAmountMzn, num(data.expectedOrderMzn, 0))
        await ensureSimulatedMznCover(adminUid, need)
        stopped = 'awaiting_keypad_restock'
        steps.push(`restock-open:${cycleNumber}`)
        break
      }

      if (phase === 'awaiting_continue') {
        await ensureSimulatedZarCover(adminUid, num(data.expectedOrderZar, 0))
        await tryAdvanceContinuousCycle()
        steps.push(`fund-zar:${cycleNumber}`)
        continue
      }

      if (awaitingKind === 'deploy' || phase === 'awaiting_send') {
        await ensureSimulatedZarCover(adminUid, num(data.expectedOrderZar, 0))
        await tryAdvanceContinuousCycle()
        const unlocked = (await testRef.get()).data() || {}
        if (keypadGateFromDoc(unlocked) !== 'send') {
          stopped = 'blocked_send_unlock'
          steps.push(`send-unlock-blocked:${cycleNumber}`)
          break
        }
        stopped = 'awaiting_keypad_send'
        steps.push(`send-open:${cycleNumber}`)
        break
      }

      // Step 3 done but Leo not unlocked yet — fund + unlock, do not open keypad early.
      if (phase === 'awaiting_mzn' && deskStep >= 4) {
        await ensureSimulatedZarCover(adminUid, num(data.expectedOrderZar, 0))
        await tryAdvanceContinuousCycle()
        steps.push(`unlock-send:${cycleNumber}`)
        continue
      }

      if (phase === 'awaiting_mzn' || (deskStep === 3 && !phase)) {
        await ensureSimulatedMznCover(adminUid, num(data.expectedOrderMzn, 0))
        const stepped = await advanceSequentialStep(adminUid)
        steps.push(`mzn:${cycleNumber}:${stepped.advanced}`)
        if (!stepped.advanced) {
          // Retry once after funding Leo unlock path
          await tryAdvanceContinuousCycle()
          const again = await advanceSequentialStep(adminUid)
          steps.push(`mzn-retry:${again.advanced}`)
          if (!again.advanced && awaitingKind !== 'deploy') {
            stopped = 'blocked_mzn'
            break
          }
        }
        // Next loop iteration unlocks Send, then pauses for the keypad.
        continue
      }

      if (
        phase === 'order_open' ||
        phase === 'awaiting_invoice' ||
        deskStep === 1 ||
        deskStep === 2
      ) {
        const stepped = await advanceSequentialStep(adminUid)
        steps.push(`step:${deskStep || phase}:${stepped.advanced}`)
        if (!stepped.advanced) {
          stopped = 'blocked_step'
          break
        }
        continue
      }

      // Unknown open state — leave it for the desk rather than force-confirming a cash move.
      stopped = 'blocked_unknown'
      steps.push(`halt:${phase || awaitingKind || deskStep}:${cycleNumber}`)
      break
    } catch (error) {
      console.error('[simulateNextDeskDay] step failed', error)
      stopped = 'error'
      steps.push(`error:${error instanceof Error ? error.message : 'failed'}`)
      break
    }
  }

  const endSnap = await testRef.get()
  const end = endSnap.data() || {}
  const state = stateFromDoc(end)
  const endCycle = num(end.awaitingCycleNumber, state.completedCycles)
  const endGate = keypadGateFromDoc(end)
  const dayAdvanced = stopped === 'next_day' || endCycle > startCycle
  let outClock = plannedClockMs
  // Only bump here if confirm did not already (e.g. day rolled without keypad).
  // Idempotent on startCycle — never +48h for one completed day.
  if (dayAdvanced) {
    const bumped = await bumpPlannedClockIfNeeded(testRef, adminUid, testRunId, startCycle)
    if (bumped != null) outClock = bumped
  }
  const endEftZar = openEftZar(eftBookFromDoc(end))
  const endClose =
    String(end.cyclePhase || '') === 'awaiting_day_close' || num(end.deskStep, 0) === 6
  const keypadAck =
    endGate === 'send'
      ? `Day ${startCycle}: Send ZAR is open — keypad, then Next 24h can finish the day. EFT ${formatZar(endEftZar)} still pending.`
      : endGate === 'restock'
        ? `Day ${startCycle}: Restock is open — keypad, then Next 24h can open the next day. EFT ${formatZar(endEftZar)} still pending.`
        : null
  const dayCloseAck = endClose
    ? `Day ${startCycle} recap is on the desk — Continue opens the next day. EFT ${formatZar(endEftZar)}.`
    : null
  return publicSummary(state, {
    testRunId,
    status: end.status || 'active',
    cycleNumber: endCycle,
    deskMode: 'planned',
    plannedClockMs: outClock,
    plannedHorizonHours,
    plannedAnchorCycle,
    simulatedFromCycle: startCycle,
    simulatedToCycle: endCycle,
    simulatedSteps: steps,
    awaitingKeypad: endGate,
    awaitingDayClose: endClose || stopped === 'awaiting_day_close',
    openEftZar: endEftZar,
    channelMix: end.channelMix || (endEftZar > 0 ? 'mixed' : 'card'),
    keypadAmountZar:
      endGate === 'send'
        ? num(end.expectedOrderZar, 0)
        : endGate === 'restock'
          ? num(end.replenishAmountZar, num(end.expectedOrderZar, 0))
          : 0,
    keypadAmountMzn:
      endGate === 'restock'
        ? num(end.replenishAmountMzn, num(end.expectedOrderMzn, 0))
        : endGate === 'send'
          ? num(end.expectedOrderMzn, 0)
          : 0,
    acknowledgement:
      keypadAck ||
      dayCloseAck ||
      (dayAdvanced
        ? `Planned Day ${startCycle} complete (card + EFT). Day ${endCycle} · EFT ${formatZar(endEftZar)}.`
        : stopped === 'window_closed'
          ? 'Planned run reached the end of the window.'
          : `Planned advance paused (${stopped.replace(/_/g, ' ')}). EFT ${formatZar(endEftZar)}.`),
    completed: end.status === 'completed',
  })
}

/**
 * Next 72h — three Planned day walks so EFT opened on day 0 can hit soft T+1 / hard T+2
 * while cards keep cycling. Stops early on keypad gates (same honesty as Next 24h).
 */
export async function simulateNext72hDesk(adminUid: string): Promise<Record<string, unknown>> {
  const testRunId = await currentTestId(adminUid)
  if (testRunId) {
    const testRef = db.collection(TESTS).doc(testRunId)
    const snap = await testRef.get()
    const data = snap.data() || {}
    const startCycle = num(data.awaitingCycleNumber, 0) || num(data.completedCycles, 0) + 1
    await testRef.set(
      {
        plannedHorizonHours: 72,
        plannedAnchorCycle:
          num(data.plannedAnchorCycle, 0) > 0 ? num(data.plannedAnchorCycle, 0) : startCycle,
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    )
  }
  const allSteps: string[] = []
  let last: Record<string, unknown> | null = null
  let fromCycle: number | null = null
  for (let day = 0; day < 3; day++) {
    last = await simulateNextDeskDay(adminUid)
    if (fromCycle == null) fromCycle = num(last.simulatedFromCycle, num(last.cycleNumber, 0))
    const daySteps = Array.isArray(last.simulatedSteps) ? (last.simulatedSteps as string[]) : []
    allSteps.push(...daySteps, `horizon72-day:${day + 1}`)
    if (last.awaitingKeypad) {
      allSteps.push(`horizon72-paused-keypad:${last.awaitingKeypad}`)
      break
    }
    if (last.awaitingDayClose) {
      allSteps.push('horizon72-paused-day-close')
      break
    }
    if (last.completed === true || last.status === 'completed') {
      allSteps.push('horizon72-window-closed')
      break
    }
  }
  if (!last) {
    throw new functions.https.HttpsError('failed-precondition', 'Next 72h could not start')
  }
  const eftZar = num(last.openEftZar, 0)
  return {
    ...last,
    plannedHorizonHours: 72,
    simulatedHorizonHours: 72,
    simulatedFromCycle: fromCycle,
    simulatedSteps: allSteps,
    acknowledgement:
      last.awaitingKeypad
        ? `Next 72h paused for ${last.awaitingKeypad} keypad after walking ${allSteps.filter((s) => s.startsWith('horizon72-day')).length} day(s). EFT ${formatZar(eftZar)}.`
        : last.awaitingDayClose
          ? `Next 72h paused on Day recap — Continue opens the next day. EFT ${formatZar(eftZar)}.`
          : `Next 72h Planned walk finished · EFT ${formatZar(eftZar)}. ${String(last.acknowledgement || '')}`,
  }
}

async function purgeSimulatedDeskEvents(adminUid: string, planRunId?: string | null): Promise<void> {
  const col = db.collection('users').doc(adminUid).collection('activityEvents')
  const batches: FirebaseFirestore.QueryDocumentSnapshot[] = []
  const byFlag = await col.where('simulated', '==', true).limit(400).get()
  batches.push(...byFlag.docs)
  if (planRunId) {
    const byRun = await col.where('planRunId', '==', planRunId).limit(400).get()
    batches.push(...byRun.docs)
  }
  // Legacy clear-* siblings from the pre-update clear model.
  const clears = await col.where('routingAction', '==', 'en_route_clear').limit(200).get()
  for (const doc of clears.docs) {
    if (doc.id.startsWith('clear-') || doc.data()?.simulated === true) batches.push(doc)
  }
  const seen = new Set<string>()
  await Promise.all(
    batches
      .filter((doc) => {
        if (seen.has(doc.id)) return false
        seen.add(doc.id)
        return true
      })
      .map((doc) => doc.ref.delete().catch(() => undefined))
  )
}

export async function exitDeskPlan(adminUid: string): Promise<Record<string, unknown>> {
  const testRunId = await currentTestId(adminUid)
  if (!testRunId) {
    return { status: 'none', deskMode: 'live' }
  }
  const testRef = db.collection(TESTS).doc(testRunId)
  const snap = await testRef.get()
  if (!snap.exists) {
    return { status: 'none', deskMode: 'live' }
  }
  const data = snap.data() || {}
  const planRunId = typeof data.planRunId === 'string' ? data.planRunId : null
  const checkpoint = data.liveCheckpoint as LiveCheckpoint | undefined
  if (checkpoint && typeof checkpoint.atMs === 'number' && Array.isArray(checkpoint.eventIds)) {
    await restoreLiveCheckpoint(adminUid, testRunId, checkpoint)
  } else {
    await clearPlanMarkers(adminUid, testRunId)
    await testRef.set(
      {
        deskMode: 'live',
        plannedClockMs: null,
        planRunId: admin.firestore.FieldValue.delete(),
        plannedHorizonHours: admin.firestore.FieldValue.delete(),
        plannedAnchorCycle: admin.firestore.FieldValue.delete(),
        liveCheckpoint: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    )
  }
  await purgeSimulatedDeskEvents(adminUid, planRunId)
  const after = (await testRef.get()).data() || {}
  const state = stateFromDoc(after)
  return publicSummary(state, {
    testRunId,
    status: after.status || 'active',
    cycleNumber: after.awaitingCycleNumber || state.completedCycles,
    deskMode: 'live',
    plannedClockMs: null,
    acknowledgement: 'Live desk restored — Planned simulation removed.',
  })
}

export const admin_simulateNextDeskDay = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (_data, context) => {
    const adminUid = assertRoutingAdmin(context)
    const testRunId = await currentTestId(adminUid)
    if (testRunId) {
      await db.collection(TESTS).doc(testRunId).set(
        { plannedHorizonHours: 24, updatedAt: admin.firestore.Timestamp.now() },
        { merge: true }
      )
    }
    return simulateNextDeskDay(adminUid)
  })

export const admin_simulateNext72hDesk = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (_data, context) => simulateNext72hDesk(assertRoutingAdmin(context)))

export const admin_exitDeskPlan = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => exitDeskPlan(assertRoutingAdmin(context)))
