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
  completeCycle,
  createInitialState,
  formatAskImpactBody,
  planCycle,
  planReplenish,
  previewAskImpact,
  roundMoney,
  type CyclePlan,
  type ReplenishPlan,
  type RoutingConfig,
  type RoutingState,
} from '../routing/conversionRouter'
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
import { interpretAdminFeedback, llmApiKey } from '../routing/interpretFeedback'
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
  hasFutureTimeConstraint,
  isBankerQuestion,
  isMemoryOrHistoryQuestion,
  isWhatIfAsk,
} from '../routing/routingTime'
import {
  costMznPerZarFromSell,
  fetchQuotedMznPerZar,
  liveGrossSpreadRate,
} from '../fx/quotedMznZar'

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
    cardCount: num(data.cardCount, DEFAULT_TEST_CONFIG.cardCount),
    machineCount: num(data.machineCount, DEFAULT_TEST_CONFIG.machineCount),
    minCardAmount: num(data.minCardAmount, DEFAULT_TEST_CONFIG.minCardAmount),
    maxCardAmount: num(data.maxCardAmount, DEFAULT_TEST_CONFIG.maxCardAmount),
    startingCapital: num(data.startingCapital, DEFAULT_TEST_CONFIG.startingCapital),
    spread: num(data.spread, DEFAULT_TEST_CONFIG.spread),
    recycleRate: num(data.recycleRate, DEFAULT_TEST_CONFIG.recycleRate),
    bufferAmount: num(data.bufferAmount, DEFAULT_TEST_CONFIG.bufferAmount),
    bufferTriggerRatio: num(data.bufferTriggerRatio, DEFAULT_TEST_CONFIG.bufferTriggerRatio),
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
    startingCapital: num(data.startingCapital, 0),
    availableCapital: num(data.availableCapital, 0),
    deployedAmount: num(data.deployedAmount, 0),
    idleCapital: num(data.idleCapital, 0),
    expectedProfit: num(data.expectedProfit, 0),
    cardCountUsed: assignments.length,
    cardAssignments: assignments,
    restingCardIds: Array.isArray(data.restingCardIds) ? data.restingCardIds : [],
    restingMachineIds: Array.isArray(data.restingMachineIds) ? data.restingMachineIds : [],
    bufferUsedBefore: num(data.bufferUsed, 0),
    bufferUsedProjected: num(data.bufferUsedProjected, 0),
    bufferTriggerAmount: 0,
    bufferActionRequired: data.bufferActionRequired === true,
    selectionReason: typeof data.selectionReason === 'string' ? data.selectionReason : '',
  }
}

function overlayForDoc(data: admin.firestore.DocumentData) {
  return overlayFromConstraints(constraintsFromDoc(data))
}

async function loadRecentCycleBriefs(testRunId: string): Promise<RecentCycleBrief[]> {
  const snap = await db
    .collection(TESTS)
    .doc(testRunId)
    .collection('cycles')
    .orderBy('cycleNumber', 'desc')
    .limit(6)
    .get()
  return snap.docs.map((docSnap) => {
    const data = docSnap.data()
    const assignments = Array.isArray(data.cardAssignments)
      ? data.cardAssignments
          .map((row: unknown) => {
            if (!row || typeof row !== 'object') return null
            const item = row as { cardId?: unknown; machineId?: unknown; amount?: unknown }
            if (typeof item.cardId !== 'number' || typeof item.machineId !== 'number') return null
            return {
              cardId: item.cardId,
              machineId: item.machineId,
              amount: typeof item.amount === 'number' ? item.amount : 0,
            }
          })
          .filter(
            (row: { cardId: number; machineId: number; amount: number } | null): row is {
              cardId: number
              machineId: number
              amount: number
            } => Boolean(row)
          )
      : []
    return {
      cycleNumber: num(data.cycleNumber, 0),
      status: typeof data.status === 'string' ? data.status : '',
      createdAtMs: firestoreTimestampMs(data.createdAt),
      completedAtMs: firestoreTimestampMs(data.completedAt),
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
      .limit(5)
      .get()
    return snap.docs.map((docSnap) => {
      const data = docSnap.data()
      return {
        rawMessage: typeof data.rawMessage === 'string' ? data.rawMessage : '',
        summary: typeof data.interpretationSummary === 'string' ? data.interpretationSummary : null,
        createdAtMs: firestoreTimestampMs(data.createdAt),
        status: typeof data.status === 'string' ? data.status : '',
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
    config: {
      ...base.config,
      cardCount: cards.length,
      machineCount: machines.length,
    },
  }
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

async function applyLiveQuotes(state: RoutingState): Promise<{
  state: RoutingState
  sellRate: number
  costRate: number
}> {
  const sellRate = await fetchQuotedMznPerZar()
  const costRate = costMznPerZarFromSell(sellRate)
  const spread = liveGrossSpreadRate(sellRate, costRate)
  return {
    state: {
      ...state,
      config: { ...state.config, spread },
    },
    sellRate,
    costRate,
  }
}

function writeIssuedReplenish(
  tx: admin.firestore.Transaction,
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  replenish: ReplenishPlan,
  now: admin.firestore.Timestamp
): { plan: CyclePlan; activityEventId: string; kind: 'replenish' } {
  const plan = planCycle(state)
  const notification = buildReplenishNotificationCopy(replenish)
  const activity = buildReplenishActivityCopy(replenish, state.config.cycleCount, 'awaiting_execution')
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
    {
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
      awaitingCycleNumber: replenish.cycleNumber,
      awaitingKind: 'replenish',
      replenishAmountMzn: replenish.amountMzn,
      replenishAmountZar: replenish.amountZar,
      replenishCostRate: replenish.costRate,
      updatedAt: now,
    },
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
  quotes: { sellRate: number; costRate: number },
  overlay = EMPTY_OVERLAY
): { plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' } {
  const replenish = planReplenish(state, quotes.costRate, overlay)
  if (replenish) {
    return writeIssuedReplenish(tx, adminUid, testRunId, state, replenish, now)
  }

  const plan = planCycle(state, overlay)
  const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
  const notification = blocked
    ? { title: `Conversion Cycle ${plan.cycleNumber}`, body: 'No valid route under current constraints\nReply to restore a card or machine' }
    : buildNotificationCopy(plan, state.config.cycleCount)
  const activity = buildActivityCopy(
    plan,
    state.config.cycleCount,
    'awaiting_execution',
    state.config.spread,
    quotes
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
  tx.set(cycleRef, {
    testRunId,
    cycleNumber: plan.cycleNumber,
    startingCapital: plan.startingCapital,
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
    bufferUsedProjected: plan.bufferUsedProjected,
    bufferActionRequired: plan.bufferActionRequired,
    sellRate: quotes.sellRate,
    costRate: quotes.costRate,
    spreadRate: state.config.spread,
    selectionReason: plan.selectionReason,
    status: 'awaiting_execution' as CycleStatus,
    createdAt: now,
    completedAt: null,
    activityEventId,
  })
  tx.set(
    testRef,
    {
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
      awaitingCycleNumber: plan.cycleNumber,
      awaitingKind: 'deploy',
      updatedAt: now,
    },
    { merge: true }
  )

  return { plan, activityEventId, kind: 'deploy' }
}

async function issueCycle(
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp
): Promise<{ plan: CyclePlan; activityEventId: string; kind: 'deploy' | 'replenish' }> {
  const quoted = await applyLiveQuotes(state)
  return db.runTransaction(async (tx) =>
    writeIssuedCycle(tx, adminUid, testRunId, quoted.state, now, quoted)
  )
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
}

async function startNewTest(adminUid: string, forceNew: boolean) {
  const now = admin.firestore.Timestamp.now()
  const existingId = await currentTestId(adminUid)
  if (existingId && !forceNew) {
    const existing = await db.collection(TESTS).doc(existingId).get()
    if (existing.exists) {
      const data = existing.data() || {}
      const state = stateFromDoc(data)
      return publicSummary(state, {
        testRunId: existingId,
        status: data.status || 'active',
        cycleNumber: data.awaitingCycleNumber || state.completedCycles,
        started: false,
      })
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
  }

  const testRunId = db.collection(TESTS).doc().id
  const state = createInitialState(DEFAULT_TEST_CONFIG)
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
    constraints: [],
    createdAt: now,
    updatedAt: now,
  })
  await db.collection(CURRENT).doc(adminUid).set({
    testRunId,
    adminUid,
    updatedAt: now,
  })
  const issued = await issueCycle(adminUid, testRunId, state, now)
  const notification =
    issued.kind === 'replenish'
      ? buildReplenishNotificationCopy({
          cycleNumber: issued.plan.cycleNumber,
          amountZar: state.bufferUsed,
          amountMzn: 0,
          costRate: 0,
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

    const testRunId = requestedRun || (await currentTestId(adminUid))
    if (!testRunId) {
      throw new functions.https.HttpsError('not-found', 'No conversion routing test is active')
    }

    const quotes = await applyLiveQuotes(createInitialState())
    const liveSpread = quotes.state.config.spread
    const testRef = db.collection(TESTS).doc(testRunId)

    const result = await db.runTransaction(async (tx) => {
      const testSnap = await tx.get(testRef)
      if (!testSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Conversion routing test not found')
      }
      const testData = testSnap.data() || {}
      if (testData.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'Conversion routing test is not active')
      }

      const cycleNumber = requestedCycle || num(testData.awaitingCycleNumber, 0)
      if (cycleNumber <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'No cycle is awaiting execution')
      }
      if (num(testData.awaitingCycleNumber, 0) !== cycleNumber) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Cycle ${cycleNumber} is not the current awaiting instruction`
        )
      }

      const state = stateFromDoc(testData)
      const awaitingKind = testData.awaitingKind === 'replenish' ? 'replenish' : 'deploy'

      if (awaitingKind === 'replenish') {
        const replenish = planReplenish(state, num(testData.replenishCostRate, quotes.costRate))
        if (!replenish) {
          throw new functions.https.HttpsError('failed-precondition', 'No liquidity replenishment is awaiting')
        }
        const completedCopy = buildReplenishActivityCopy(
          replenish,
          state.config.cycleCount,
          'completed'
        )
        const eventRef = db
          .collection('users')
          .doc(adminUid)
          .collection('activityEvents')
          .doc(replenishEventId(testRunId, cycleNumber))
        const eventSnap = await tx.get(eventRef)
        if (!eventSnap.exists || eventSnap.data()?.status !== 'awaiting_execution') {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Liquidity replenishment is not awaiting execution'
          )
        }
        const cleared: RoutingState = {
          ...state,
          bufferUsed: 0,
          config: { ...state.config, spread: liveSpread },
        }
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
        const next = writeIssuedCycle(tx, adminUid, testRunId, cleared, now, quotes, overlayForDoc(testData))
        return {
          nextState: cleared,
          nextCycle: next.plan,
          testComplete: false,
          cycleNumber,
          confirmedKind: 'replenish',
        }
      }

      const cycleRef = testRef.collection('cycles').doc(String(cycleNumber))
      const cycleSnap = await tx.get(cycleRef)
      if (!cycleSnap.exists) {
        throw new functions.https.HttpsError('not-found', `Cycle ${cycleNumber} was not issued`)
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

      const actualProfit = suppliedProfit ?? roundMoney(plan.deployedAmount * liveSpread)
      const nextState = completeCycle(state, plan, actualProfit)
      const remainingConstraints = expireConstraints(constraintsFromDoc(testData), cycleNumber)
      const completedCopy = buildActivityCopy(
        plan,
        state.config.cycleCount,
        'completed',
        liveSpread,
        { sellRate: quotes.sellRate, costRate: quotes.costRate }
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
            completedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      } else {
        nextCycle = writeIssuedCycle(
          tx,
          adminUid,
          testRunId,
          { ...nextState, config: { ...nextState.config, spread: liveSpread } },
          now,
          quotes,
          overlayFromConstraints(remainingConstraints)
        ).plan
        tx.set(testRef, { constraints: remainingConstraints, updatedAt: now }, { merge: true })
      }

      return {
        nextState,
        nextCycle,
        testComplete,
        cycleNumber,
        confirmedKind: 'deploy',
      }
    })

    return publicSummary(result.nextState, {
      testRunId,
      status: result.testComplete ? 'completed' : 'active',
      confirmedCycle: result.cycleNumber,
      cycleNumber: result.nextCycle?.cycleNumber ?? result.nextState.completedCycles,
      nextDeployedAmount: result.nextCycle?.deployedAmount ?? null,
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
      throw new functions.https.HttpsError('failed-precondition', 'Conversion routing test is not active')
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
    const liveState = { ...state, config: { ...state.config, spread: quotes.state.config.spread } }
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
      interpreted = memoryAnswer
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
      if (isBankerQuestion(askMessage)) {
        interpreted = { ...interpreted, intents: [] }
      }
    }

    const validIntents: RoutingIntent[] = []
    const intentErrors: string[] = []
    for (const intent of interpreted.intents) {
      const error = validateIntent(intent, liveState)
      if (error) intentErrors.push(error)
      else validIntents.push(intent)
    }

    const now = admin.firestore.Timestamp.now()
    const feedbackId = acceptProposalId || testRef.collection('feedback').doc().id
    const cycleData = cycleSnap.data() || {}
    const previousEventId = cycleSnap.exists
      ? currentRoutingEventId(testRunId, cycleNumber, cycleData)
      : ''
    const revisionCount = num(cycleData.revisionCount, 0)
    const currentPlan = canReviseDeploy ? stored : null

    if (!validIntents.length) {
      const clarification =
        usefulClarification(interpreted.clarification) ||
        intentErrors[0] ||
        (stored.cardAssignments.length
          ? `This cycle uses ${stored.cardAssignments
              .map((row) => `${row.cardId}`)
              .join(', ')}. Ask why, what happens next, or name a card to change.`
          : 'Ask why this instruction, what happens next, or name a card or machine to change.')
      const title =
        awaitingKind === 'replenish'
          ? `Before Cycle ${cycleNumber}/${liveState.config.cycleCount}`
          : `Cycle ${cycleNumber}/${liveState.config.cycleCount}`
      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title,
          body: clarification,
          userReply: askMessage,
          routingAction: 'advice',
        })
        tx.set(testRef.collection('feedback').doc(feedbackId), {
          id: feedbackId,
          adminUserId: adminUid,
          cycleNumber,
          rawMessage: askMessage,
          interpretedIntent: interpreted,
          status: 'clarification',
          createdAt: now,
        })
        tx.set(testRef, { constraints, updatedAt: now }, { merge: true })
      })
      return {
        testRunId,
        cycleNumber,
        status: 'clarification',
        acknowledgement: clarification,
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
      quotes.costRate
    )
    const acknowledgement = previewApplied.summaries.join(' ')
    const previewBody = formatAskImpactBody({
      acknowledgement,
      currentPlan,
      preview,
      proposal: true,
    })

    if (isWhatIfAsk(askMessage) && !acceptProposalId) {
      const title = acknowledgement.replace(/\.$/, '') || `If that rule · Cycle ${cycleNumber}`
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
      await db.runTransaction(async (tx) => {
        publishAdviceCard(tx, {
          adminUid,
          testRunId,
          cycleNumber,
          feedbackId,
          now,
          title: acknowledgement.replace(/\.$/, '') || `Cycle ${cycleNumber}`,
          body: formatAskImpactBody({
            acknowledgement: `${acknowledgement} Takes effect on the next conversion instruction.`,
            currentPlan: null,
            preview,
            proposal: false,
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
    const plan = planCycle(applied.state, overlay)
    const blocked = plan.deployedAmount <= 0 || plan.cardCountUsed <= 0
    const activity = buildAgentReplyCopy(
      plan,
      applied.state.config.cycleCount,
      acknowledgement,
      blocked
    )
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
