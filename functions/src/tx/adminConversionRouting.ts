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
  buildNotificationCopy,
  completeCycle,
  createInitialState,
  planCycle,
  type CyclePlan,
  type RoutingConfig,
  type RoutingState,
} from '../routing/conversionRouter'

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

function stateFromDoc(data: admin.firestore.DocumentData): RoutingState {
  const base = createInitialState(parseConfig(data.config))
  return {
    ...base,
    availableCapital: num(data.availableCapital, base.availableCapital),
    bufferUsed: num(data.bufferUsed, 0),
    completedCycles: num(data.completedCycles, 0),
    cumulativeDeployed: num(data.cumulativeDeployed, 0),
    cumulativeSpread: num(data.cumulativeSpread, 0),
    cards: Array.isArray(data.cards) && data.cards.length ? data.cards : base.cards,
    machines: Array.isArray(data.machines) && data.machines.length ? data.machines : base.machines,
    pairings: data.pairings && typeof data.pairings === 'object' ? data.pairings : {},
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

function writeIssuedCycle(
  tx: admin.firestore.Transaction,
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp
): { plan: CyclePlan; activityEventId: string } {
  const plan = planCycle(state)
  if (plan.deployedAmount <= 0 || plan.cardCountUsed <= 0) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No valid card routing exists for the current available capital'
    )
  }

  const notification = buildNotificationCopy(plan, state.config.cycleCount)
  const activity = buildActivityCopy(
    plan,
    state.config.cycleCount,
    'awaiting_execution',
    state.config.spread
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
    awaitingConfirm: true,
    status: 'awaiting_execution',
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
      updatedAt: now,
    },
    { merge: true }
  )

  return { plan, activityEventId }
}

async function issueCycle(
  adminUid: string,
  testRunId: string,
  state: RoutingState,
  now: admin.firestore.Timestamp
): Promise<{ plan: CyclePlan; activityEventId: string }> {
  return db.runTransaction(async (tx) => writeIssuedCycle(tx, adminUid, testRunId, state, now))
}

async function cancelAwaitingCycle(
  adminUid: string,
  testRunId: string,
  cycleNumber: number,
  now: admin.firestore.Timestamp
): Promise<void> {
  const cycleRef = db.collection(TESTS).doc(testRunId).collection('cycles').doc(String(cycleNumber))
  const eventRef = db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .doc(eventId(testRunId, cycleNumber))
  const eventSnap = await eventRef.get()
  if (eventSnap.exists) {
    const prev = eventSnap.data() || {}
    await eventRef.update({
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
    createdAt: now,
    updatedAt: now,
  })
  await db.collection(CURRENT).doc(adminUid).set({
    testRunId,
    adminUid,
    updatedAt: now,
  })
  const issued = await issueCycle(adminUid, testRunId, state, now)
  const notification = buildNotificationCopy(issued.plan, state.config.cycleCount)
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
    const suppliedProfit =
      typeof data?.actualProfit === 'number' && Number.isFinite(data.actualProfit)
        ? data.actualProfit
        : undefined

    const testRunId = requestedRun || (await currentTestId(adminUid))
    if (!testRunId) {
      throw new functions.https.HttpsError('not-found', 'No conversion routing test is active')
    }

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

      const state = stateFromDoc(testData)
      const plan = planCycle(state)
      if (plan.cycleNumber !== cycleNumber) {
        throw new functions.https.HttpsError('internal', 'Stored cycle does not match routing engine state')
      }

      const actualProfit = suppliedProfit ?? plan.expectedProfit
      const nextState = completeCycle(state, plan, actualProfit)
      const completedCopy = buildActivityCopy(
        plan,
        state.config.cycleCount,
        'completed',
        state.config.spread
      )
      const eventRef = db
        .collection('users')
        .doc(adminUid)
        .collection('activityEvents')
        .doc(eventId(testRunId, cycleNumber))
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
            completedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      } else {
        nextCycle = writeIssuedCycle(tx, adminUid, testRunId, nextState, now).plan
      }

      return {
        nextState,
        nextCycle,
        testComplete,
        cycleNumber,
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
