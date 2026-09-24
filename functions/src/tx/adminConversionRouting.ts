/**
 * Test-only admin conversion routing assistant.
 * Issues instructions to one admin UID. Does not execute FX.
 * Advances only when that admin confirms the current cycle.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  CONVERSION_ROUTING_KIND,
  DEFAULT_TEST_CONFIG,
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
  type CyclePlan,
  type ReplenishPlan,
  type RoutingConfig,
  formatZar,
  parseRoutingDecision,
  stampAssignmentDecisions,
  type RoutingState,
} from '../routing/conversionRouter'
import { applyWindowPathWrite, hydrateWindow, persistWindow, ROUTING_ENGINE_ID } from '../routing/throughputPlan'
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
  mayMutateRoute,
  type AskClassification,
} from '../routing/askIntent'
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
  tx.set(eventRef, {
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title: params.title,
    body: params.body,
    dropdownTitle: params.title,
    dropdownBody: params.body.split('\n')[0] || params.title,
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

function pathBookFromDoc(data: admin.firestore.DocumentData | undefined, quote?: FrozenQuote): PathBook {
  const parsed = parsePathBook({
    residuals: data?.pathResiduals,
    notes: data?.exhaustionNotes,
    quote: data?.frozenQuote || data?.quote,
    lastShockLine: data?.lastShockLine,
  })
  return {
    residuals: parsed.residuals || [],
    notes: parsed.notes || [],
    quote: quote || parsed.quote,
    lastShockLine: parsed.lastShockLine,
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

function writeIssuedReplenish(
  tx: admin.firestore.Transaction,
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  replenish: ReplenishPlan,
  now: admin.firestore.Timestamp,
  overlay = EMPTY_OVERLAY,
  book: PathBook = {}
): { plan: CyclePlan; activityEventId: string; kind: 'replenish' } {
  const plan = planCycle(state, overlay, { ...book, residuals: [] })
  const proposedAt = now.toMillis()
  const issued = {
    ...replenish,
    cardAssignments: stampAssignmentDecisions(replenish.cardAssignments, proposedAt),
  }
  const notification = buildReplenishNotificationCopy(issued)
  const activity = buildReplenishActivityCopy(issued, state.config.cycleCount, 'awaiting_execution', state)
  const activityEventId = replenishEventId(testRunId, replenish.cycleNumber)
  const testRef = db.collection(TESTS).doc(testRunId)
  const eventRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(activityEventId)

  tx.set(eventRef, {
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title: activity.title,
    body: activity.body,
    dropdownTitle: notification.title,
    dropdownBody: notification.body,
    actorType: 'ai_manager',
    avatarKind: 'convert_mzn',
    amountCurrency: 'MZN',
    amountValue: replenish.amountMzn,
    amountSign: 'debit',
    pairedAmountValue: replenish.amountZar,
    pairedAmountCurrency: 'ZAR',
    txId: activityEventId,
    hasDownloadButton: false,
    awaitingConfirm: true,
    status: 'awaiting_execution',
    routingAction: 'replenish',
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
      replenishAmountMzn: replenish.amountMzn,
      replenishAmountZar: replenish.amountZar,
      replenishCostRate: replenish.costRate,
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

function writeIssuedCycle(
  tx: admin.firestore.Transaction,
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp,
  quotes: { sellRate: number; costRate: number; quote?: FrozenQuote },
  overlay = EMPTY_OVERLAY,
  book: PathBook = {}
): { plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' } {
  const liveBook: PathBook = {
    ...book,
    quote: quotes.quote || book.quote,
  }
  const replenish = planReplenish(state, quotes.costRate, overlay, liveBook)
  if (replenish) {
    return writeIssuedReplenish(tx, adminUid, testRunId, state, replenish, now, overlay, liveBook)
  }

  const planned = planCycle(state, overlay, liveBook)
  const shockLine = liveBook.lastShockLine
  const persistBook: PathBook = { ...liveBook, lastShockLine: undefined }
  const plan = {
    ...planned,
    cardAssignments: stampAssignmentDecisions(planned.cardAssignments, now.toMillis()),
  }
  const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
  const notification = blocked
    ? { title: `Sell ZAR · Cycle ${plan.cycleNumber}`, body: 'No valid route under current constraints\nAsk to restore a card or POS' }
    : buildNotificationCopy(plan, state.config.cycleCount)
  const activity = buildActivityCopy(
    plan,
    state.config.cycleCount,
    'awaiting_execution',
    state.config.spread,
    quotes,
    { state, overlay, revisionReason: shockLine }
  )
  const activityEventId = eventId(testRunId, plan.cycleNumber)
  const testRef = db.collection(TESTS).doc(testRunId)
  const cycleRef = testRef.collection('cycles').doc(String(plan.cycleNumber))
  const eventRef = db.collection('users').doc(adminUid).collection('activityEvents').doc(activityEventId)

  tx.set(eventRef, {
    id: activityEventId,
    kind: CONVERSION_ROUTING_KIND,
    title: activity.title,
    body: activity.body,
    dropdownTitle: notification.title,
    dropdownBody: notification.body,
    actorType: 'ai_manager',
    avatarKind: 'convert_zar',
    amountCurrency: 'ZAR',
    amountValue: plan.deployedAmount,
    amountSign: 'debit',
    txId: activityEventId,
    hasDownloadButton: false,
    awaitingConfirm: !blocked,
    routingBlocked: blocked,
    status: 'awaiting_execution',
    routingAction: 'deploy',
    testRunId,
    cycleNumber: plan.cycleNumber,
    createdAt: now,
    recordingSource: 'SYSTEM',
  })
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
    selectionReason: plan.selectionReason,
    status: 'awaiting_execution' as CycleStatus,
    createdAt: now,
    completedAt: null,
    activityEventId,
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
      awaitingCycleNumber: plan.cycleNumber,
      awaitingKind: 'deploy',
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

async function loadFnbDeskLines(): Promise<string> {
  try {
    const [events, floats] = await Promise.all([
      db.collection('bankFnbEvents').limit(20).get(),
      db.collection('fnbCardFloat').limit(20).get(),
    ])
    const lines: string[] = []
    for (const doc of floats.docs) {
      const row = doc.data() as { reservedZar?: number; receiptedZar?: number; availableZar?: number | null }
      const available = typeof row.availableZar === 'number' ? `R${row.availableZar.toFixed(2)} available` : 'available ZAR not set'
      lines.push(
        `FNB card ${doc.id}: reserved R${Number(row.reservedZar || 0).toFixed(2)}, receipted R${Number(row.receiptedZar || 0).toFixed(2)}, ${available}.`
      )
    }
    const notices = events.docs
      .map((doc) => doc.data() as {
        kind?: string
        amountZar?: number
        cardLast4?: string
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
      }
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
    weekend: parts.weekday === 0 || parts.weekday === 6,
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
    awaitingKind: params.awaitingKind,
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
        title: spoken.title || 'Add ZAR before the next window',
        body: spoken.body,
        canOpen: false,
        recommendedZar: offer.recommendedZar,
        cancelOpen: true,
        deskTable: spoken.table,
        deskChart: spoken.chart,
      })
      return { title: spoken.title || 'Add ZAR before the next window', body: spoken.body, recommendedZar: offer.recommendedZar, canOpen: false }
    }
    await startNewTest(
      params.adminUid,
      true,
      amount,
      `Window opened: ${formatZar(amount)} to convert over 14 weekdays.`
    )
    const body = `Next window opened at ${formatZar(amount)}. Day 1 is on the desk.`
    return { title: 'Next window opened', body, recommendedZar: amount, canOpen: true }
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
  const title = spoken.title || (finished ? offer.title : 'Window still open')
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
  now: admin.firestore.Timestamp
): Promise<{ plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' }> {
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
  const book = pathBookFromDoc(testSnap.data() || {}, quoted.quote)
  try {
    return await db.runTransaction(async (tx) =>
      writeIssuedCycle(tx, adminUid, testRunId, quoted.state, now, quoted, EMPTY_OVERLAY, book)
    )
  } catch (error) {
    console.error('[issueCycle] persist failed; writing instruction only', error)
    return writeInstructionOnly(adminUid, testRunId, quoted.state, now, quoted, book)
  }
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
      dropdownTitle: `Sell ZAR · Cycle ${plan.cycleNumber}`,
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
  lastShockLine?: string
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
  const state = createInitialState(
    DEFAULT_TEST_CONFIG,
    typeof startingCapital === 'number' && startingCapital > 0 ? startingCapital : 0
  )
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
    lastShockLine: lastShockLine || null,
    createdAt: now,
    updatedAt: now,
  })
  await db.collection(CURRENT).doc(adminUid).set({
    testRunId,
    adminUid,
    updatedAt: now,
  })
  const authorised =
    typeof startingCapital === 'number' && startingCapital > 0 ? startingCapital : 0
  if (!(authorised > 0)) {
    return publicSummary(state, {
      testRunId,
      status: 'active',
      cycleNumber: 0,
      started: false,
    })
  }
  const issued = await issueCycle(adminUid, testRunId, state, now)
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
  })
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
): Promise<{ expectedZar: number }> {
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
  if (awaitingCycle !== play.cycleNumber || awaitingKind !== play.action) {
    const step = awaitingKind === 'replenish' ? 'the restock' : 'the sale'
    throw new functions.https.HttpsError(
      'failed-precondition',
      awaitingCycle > 0
        ? `That card is no longer the current step. The desk is waiting on ${step} for cycle ${awaitingCycle}.`
        : 'That card is no longer the current step. Open the desk for the next instruction.'
    )
  }

  let expected = 0
  if (play.action === 'replenish') {
    expected = num(data.replenishAmountZar, 0)
  } else {
    const cycleSnap = await testRef.collection('cycles').doc(String(play.cycleNumber)).get()
    expected = num(cycleSnap.data()?.deployedAmount, 0)
    if (!(expected > 0)) expected = planCycle(stateFromDoc(data)).deployedAmount
  }
  const entered = roundMoney(amountZar)
  if (expected > 0 && Math.abs(expected - entered) > 0.005) {
    // A restock keypad types the card's MZN and converts it at the live COST
    // rate, which drifts from the frozen ticket ZAR. The card's MZN is the
    // tickets; record those rather than the repriced figure.
    if (play.action === 'replenish') {
      const ticketMzn = roundMoney(num(data.replenishAmountMzn, 0))
      const typedMzn = typeof amountMzn === 'number' ? roundMoney(amountMzn) : 0
      if (ticketMzn > 0 && typedMzn > 0 && Math.abs(ticketMzn - typedMzn) <= 0.02) {
        return { expectedZar: expected }
      }
    }
    const diff = roundMoney(expected - entered)
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Tickets total ${formatZar(expected)} but ${formatZar(entered)} was entered — ${formatZar(Math.abs(diff))} ${diff > 0 ? 'short' : 'over'}. Enter the ticket total exactly.`
    )
  }
  return { expectedZar: expected > 0 ? expected : entered }
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

  const shockLine =
    kind === 'sell_zar'
      ? `Window opened: ${formatZar(amount)} to convert over 14 weekdays.`
      : kind === 'add_zar'
        ? `${formatZar(amount)} added to the window. Book re-solved.`
        : `MZN added to the window. Book re-solved.`

  const existingId = await currentTestId(adminUid)
  const existing = existingId ? await db.collection(TESTS).doc(existingId).get() : null
  const status = existing?.data()?.status

  const completedCycles = num(existing?.data()?.completedCycles, 0)
  if (
    !existingId ||
    !existing?.exists ||
    status !== 'active' ||
    shouldStartFreshWindow(existing.data()) ||
    (kind === 'sell_zar' && completedCycles === 0)
  ) {
    if (kind === 'sell_zar' || kind === 'add_zar') {
      await startNewTest(adminUid, true, amount, shockLine)
    }
    return
  }

  const now = admin.firestore.Timestamp.now()
  const data = existing.data() || {}
  const state = applyCapitalShock(stateFromDoc(data), { kind, amountZar: amount, amountMzn: mzn })
  const awaiting = num(data.awaitingCycleNumber, 0)
  if (awaiting > 0) {
    await cancelAwaitingCycle(adminUid, existingId, awaiting, now)
  }
  await db.collection(TESTS).doc(existingId).set(
    {
      availableCapital: state.availableCapital,
      ...persistCapital(state),
      lastShockLine: shockLine,
      updatedAt: now,
    },
    { merge: true }
  )
  await issueCycle(adminUid, existingId, state, now)
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
    })
  })

export const admin_confirmConversionRoutingCycle = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const adminUid = assertRoutingAdmin(context)
    const now = admin.firestore.Timestamp.now()
    const requestedCycle =
      typeof data?.cycleNumber === 'number' ? data.cycleNumber : undefined
    const requestedRun = typeof data?.testRunId === 'string' ? data.testRunId : undefined
    const conversionTxId = typeof data?.conversionTxId === 'string' ? data.conversionTxId : undefined
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
          state
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
          status: 'completed',
          awaitingConfirm: false,
          completedAt: now,
          ...(conversionTxId
            ? { txId: conversionTxId, hasDownloadButton: true }
            : {}),
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
            ...(conversionTxId ? { txId: conversionTxId, hasDownloadButton: true } : {}),
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
        ...(conversionTxId
          ? { txId: conversionTxId, hasDownloadButton: true }
          : {}),
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
    if (result.issueNext && !result.testComplete) {
      try {
        const issued = await issueCycle(
          adminUid,
          testRunId,
          { ...result.nextState, config: { ...result.nextState.config, spread: liveSpread } },
          now
        )
        nextCycle = issued.plan
      } catch (error) {
        console.error('[confirm] next instruction failed after cycle completed', error)
      }
    }

    return publicSummary(result.nextState, {
      testRunId,
      status: result.testComplete ? 'completed' : 'active',
      confirmedCycle: result.cycleNumber,
      cycleNumber: nextCycle?.cycleNumber ?? result.nextState.completedCycles,
      nextDeployedAmount: nextCycle?.deployedAmount ?? null,
      completed: result.testComplete,
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
          title: spoken.title || (residual > 0 ? 'Window closed — residual open' : 'Window closed'),
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
      await db.runTransaction(async (tx) => {
        if (canReviseDeploy) {
          const plan = preview.nextPlan || planCycle(liveState, overlay, nextBook)
          const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
          const activity = buildAgentReplyCopy(plan, liveState.config.cycleCount, acknowledgement, blocked)
          const notification = blocked
            ? {
                title: `Sell ZAR · Cycle ${plan.cycleNumber}`,
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
        } else if (awaitingKind === 'replenish') {
          const restock = planReplenish(liveState, quotes.costRate, overlay, nextBook)
          if (restock) {
            writeIssuedReplenish(tx, adminUid, testRunId, liveState, restock, now, overlay, nextBook)
          }
        }
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title: 'Outcome recorded',
          body: formatAskImpactBody({
            acknowledgement,
            currentPlan,
            preview,
            proposal: false,
            state: liveState,
            overlay,
          }),
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
      return {
        testRunId,
        cycleNumber,
        status: 'applied',
        acknowledgement,
        interpreter: interpreted.interpreter,
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
            currentBook
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
