import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { ROUTING_ADMIN_UID } from '../routing/conversionRouter'
import {
  advanceAutonomousWeekendHold,
  advanceSequentialStep,
  confirmOpenCycle,
  ensureAutonomousRoutingWindow,
  tryAdvanceContinuousCycle,
  tryAutoConfirmOpenRestock,
} from '../tx/adminConversionRouting'
import { bookZarSaleToEnRoute } from '../tx/enRouteSettle'
import {
  fetchQuotedMznPerZar,
  MZN_ZAR_MARKUP,
  MZN_ZAR_MARKUP_RECEIVE_MZN,
} from '../fx/quotedMznZar'
import {
  canClaimAutonomousRun,
  decideAutonomousAction,
  autonomousTickRunId,
  normalizeExposure,
  type ExposureSnapshot,
} from './autonomousSettlementPolicy'

const RUNS = 'autonomousSettlementRuns'
const TESTS = 'adminConversionTests'
const CURRENT = 'adminConversionCurrent'
const CONFIG_REF = 'systemConfig/autonomousDailySettlement'
const LEASE_MS = 10 * 60 * 1000
const MAX_INTERNAL_STEPS = 8

type RunReason =
  | 'scheduled_tick'
  | 'bank_evidence'
  | 'settlement_evidence'
  | 'watchdog'

type RunRequest = {
  runId: string
  reason: RunReason
  evidenceId?: string
}

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function autonomousSettlementEnabled(): Promise<boolean> {
  if (process.env.AUTONOMOUS_DAILY_SETTLEMENT_ENABLED === 'false') return false
  if (process.env.AUTONOMOUS_DAILY_SETTLEMENT_KILL_SWITCH === 'true') return false
  const config = await db().doc(CONFIG_REF).get()
  return config.data()?.enabled !== false && config.data()?.killSwitch !== true
}

async function currentRun(): Promise<{
  testRunId: string
  ref: FirebaseFirestore.DocumentReference
  data: FirebaseFirestore.DocumentData
} | null> {
  const current = await db().collection(CURRENT).doc(ROUTING_ADMIN_UID).get()
  const testRunId = typeof current.data()?.testRunId === 'string' ? current.data()!.testRunId : ''
  if (!testRunId) return null
  const ref = db().collection(TESTS).doc(testRunId)
  const snap = await ref.get()
  return snap.exists ? { testRunId, ref, data: snap.data() || {} } : null
}

async function loadExposure(run: Awaited<ReturnType<typeof currentRun>>): Promise<
  ReturnType<typeof normalizeExposure>
> {
  const userRef = db().collection('users').doc(ROUTING_ADMIN_UID)
  const [zar, mzn, inTransit] = await Promise.all([
    userRef.collection('wallets').doc('cashZAR').get(),
    userRef.collection('wallets').doc('cashMZN').get(),
    db()
      .collection('transactions')
      .where('userId', '==', ROUTING_ADMIN_UID)
      .where('status', '==', 'EN_ROUTE')
      .limit(100)
      .get(),
  ])
  const input: ExposureSnapshot = {
    walletZar: number(zar.data()?.fiatBalance),
    walletMzn: number(mzn.data()?.fiatBalance),
    committedZar: number(run?.data.bufferUsed) + number(run?.data.openEftZar),
    inTransitZar: inTransit.docs.reduce(
      (sum, row) => sum + number(row.data().sourceAmountMinor) / 100,
      0
    ),
  }
  return normalizeExposure(input)
}

async function executeIntegratedSend(
  runId: string,
  run: NonNullable<Awaited<ReturnType<typeof currentRun>>>
): Promise<string> {
  if (run.data.deskMode === 'planned') return 'planned_mode_isolated'
  const cycleNumber = number(run.data.awaitingCycleNumber)
  const ledger =
    run.data.orderLedger && typeof run.data.orderLedger === 'object'
      ? (run.data.orderLedger as Record<string, unknown>)
      : {}
  const amountZar = number(ledger.zar) || number(run.data.expectedOrderZar)
  if (!(cycleNumber > 0) || !(amountZar > 0)) return 'send_missing_order'
  const [fallbackSell, fallbackCost] = await Promise.all([
    fetchQuotedMznPerZar(MZN_ZAR_MARKUP),
    fetchQuotedMznPerZar(MZN_ZAR_MARKUP_RECEIVE_MZN),
  ])
  const sellRate = number(ledger.sellRate) || fallbackSell
  const costRate = number(ledger.costRate) || fallbackCost
  const expectedMzn = number(ledger.mznAtSell) || amountZar * sellRate
  const transactionId = `auto-send-${run.testRunId}-c${cycleNumber}`
  const booked = await bookZarSaleToEnRoute({
    userId: ROUTING_ADMIN_UID,
    sourceAmountZar: amountZar,
    sellRate,
    costRate,
    rewardsMznMinor: Math.max(0, Math.round((expectedMzn - number(ledger.mznAtCost)) * 100)),
    expectedDestinationMzn: expectedMzn,
    transactionId,
    groupId: transactionId,
    autonomousRunId: runId,
  })
  await confirmOpenCycle(ROUTING_ADMIN_UID, {
    testRunId: run.testRunId,
    cycleNumber,
    conversionTxId: booked.txId,
    overrideEarliest: true,
  })
  return 'integrated_send_committed'
}

async function claimRun(ref: FirebaseFirestore.DocumentReference, request: RunRequest): Promise<boolean> {
  const now = admin.firestore.Timestamp.now()
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const prior = snap.data() || {}
    const heartbeatMs = prior.heartbeatAt?.toMillis?.() || prior.startedAt?.toMillis?.() || 0
    if (
      !canClaimAutonomousRun({
        status: prior.status,
        heartbeatMs,
        nowMs: now.toMillis(),
        leaseMs: LEASE_MS,
      })
    ) {
      return false
    }
    tx.set(
      ref,
      {
        runId: request.runId,
        reason: request.reason,
        evidenceId: request.evidenceId || null,
        status: 'running',
        attempt: number(prior.attempt) + 1,
        startedAt: prior.startedAt || now,
        heartbeatAt: now,
        updatedAt: now,
      },
      { merge: true }
    )
    return true
  })
}

/**
 * Idempotent coordinator for one settlement window/evidence item.
 * It advances only backend-owned steps; physical work never gets auto-confirmed.
 */
export async function runAutonomousDailySettlement(request: RunRequest): Promise<{
  status: 'disabled' | 'duplicate' | 'waiting' | 'completed' | 'failed'
  outcome?: string
}> {
  if (!(await autonomousSettlementEnabled())) return { status: 'disabled' }
  const safeRunId = request.runId.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 180)
  const runRef = db().collection(RUNS).doc(safeRunId)
  if (!(await claimRun(runRef, { ...request, runId: safeRunId }))) {
    return { status: 'duplicate' }
  }

  try {
    let outcome = 'idle'
    let testRunId: string | null = null
    let exposure = normalizeExposure({ walletZar: 0, walletMzn: 0, committedZar: 0, inTransitZar: 0 })

    for (let step = 0; step < MAX_INTERNAL_STEPS; step += 1) {
      let run = await currentRun()
      if (!run || run.data.status !== 'active') {
        const userRef = db().collection('users').doc(ROUTING_ADMIN_UID)
        const zar = await userRef.collection('wallets').doc('cashZAR').get()
        // A finished window can still have a cross-border EFT in flight. It was
        // not debited from cashZAR, so reserve it before sizing the next window.
        const spendableZar = Math.max(
          0,
          number(zar.data()?.fiatBalance) - number(run?.data.openEftZar)
        )
        await ensureAutonomousRoutingWindow(spendableZar)
        run = await currentRun()
      }
      if (!run) {
        outcome = 'no_active_desk'
        break
      }
      if (run.data.deskMode === 'planned') {
        outcome = 'planned_mode_isolated'
        break
      }
      testRunId = run.testRunId
      if (
        run.data.cyclePhase === 'hold' &&
        number(run.data.expectedOrderZar) <= 0 &&
        !run.data.orderLedger
      ) {
        const advanced = await advanceAutonomousWeekendHold()
        outcome = advanced ? 'weekend_hold_advanced' : 'idle'
        if (!advanced) break
        continue
      }
      exposure = await loadExposure(run)
      const decision = decideAutonomousAction({
        status: String(run.data.status || ''),
        cyclePhase: String(run.data.cyclePhase || ''),
        deskStep: number(run.data.deskStep),
        awaitingKind: String(run.data.awaitingKind || ''),
        expectedZar:
          number(run.data.expectedOrderZar) || number(run.data.orderLedger?.zar),
        expectedMzn:
          number(run.data.expectedOrderMzn) || number(run.data.orderLedger?.mznAtCost),
        spendableZar: exposure.spendableZar,
        spendableMzn: exposure.spendableMzn,
      })

      await runRef.set(
        {
          testRunId,
          decision,
          exposure,
          heartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      if (decision === 'confirm_from_bank_evidence') {
        const confirmed = await tryAutoConfirmOpenRestock(false)
        outcome = confirmed ? 'bank_evidence_applied' : 'pending_physical_evidence'
        if (!confirmed) break
        continue
      }
      if (decision === 'advance_internal') {
        if (
          (run.data.cyclePhase === 'awaiting_day_close' || number(run.data.deskStep) === 6) &&
          request.reason !== 'scheduled_tick'
        ) {
          outcome = 'waiting_next_scheduled_batch'
          break
        }
        const advanced = await advanceSequentialStep(ROUTING_ADMIN_UID)
        outcome = advanced.advanced ? `advanced_step_${advanced.deskStep}` : 'internal_step_waiting'
        if (!advanced.advanced) break
        await tryAdvanceContinuousCycle()
        continue
      }
      if (decision === 'execute_integrated_send') {
        outcome = await executeIntegratedSend(safeRunId, run)
        break
      }
      outcome = decision
      break
    }

    const waiting = [
      'no_active_desk',
      'planned_mode_isolated',
      'pending_funding',
      'pending_physical_evidence',
      'internal_step_waiting',
      'send_missing_order',
    ].includes(outcome)
    await runRef.set(
      {
        status: waiting ? 'waiting' : 'completed',
        outcome,
        testRunId,
        exposure,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    return { status: waiting ? 'waiting' : 'completed', outcome }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await runRef.set(
      {
        status: 'failed',
        error: message.slice(0, 500),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    console.error('[autonomousSettlement] run failed', { runId: safeRunId, error: message })
    return { status: 'failed', outcome: message }
  }
}

export async function resumeAutonomousSettlementFromSettlement(
  settlementId: string
): Promise<void> {
  if (!settlementId) return
  await runAutonomousDailySettlement({
    runId: `settlement:${settlementId}`,
    reason: 'settlement_evidence',
    evidenceId: settlementId,
  })
}

export async function resumeAutonomousSettlementFromBankEvidence(evidenceId: string): Promise<void> {
  if (!evidenceId) return
  const evidence = await db().collection('bankEvidence').doc(evidenceId).get()
  const data = evidence.data() || {}
  if (!evidence.exists || data.status !== 'authenticated' || data.parseStatus !== 'parsed') return
  await runAutonomousDailySettlement({
    runId: `evidence:${evidenceId}`,
    reason: 'bank_evidence',
    evidenceId,
  })
}

async function runScheduledTick(): Promise<null> {
  const nowMs = Date.now()
  const result = await runAutonomousDailySettlement({
    runId: autonomousTickRunId(nowMs),
    reason: 'scheduled_tick',
  })
  console.log('[autonomousSettlement] five-minute tick', {
    runId: autonomousTickRunId(nowMs),
    status: result.status,
    outcome: result.outcome || null,
  })
  return null
}

/** Daily 09:00 SAST settlement batch (legacy export name kept for Cloud Functions deploy). */
export const autonomousSettlementEvery5Minutes = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .pubsub.schedule('0 9 * * *')
  .timeZone('Africa/Johannesburg')
  .onRun(() => runScheduledTick())

export const autonomousSettlementWatchdog = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .pubsub.schedule('every 30 minutes')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    if (!(await autonomousSettlementEnabled())) return null
    const candidates = await db()
      .collection(RUNS)
      .where('status', 'in', ['failed', 'running', 'waiting'])
      .limit(50)
      .get()
    const staleBefore = Date.now() - LEASE_MS
    for (const row of candidates.docs) {
      const data = row.data()
      const heartbeatMs = data.heartbeatAt?.toMillis?.() || data.updatedAt?.toMillis?.() || 0
      if (
        data.status === 'failed' ||
        data.status === 'waiting' ||
        (data.status === 'running' && heartbeatMs < staleBefore)
      ) {
        await runAutonomousDailySettlement({ runId: row.id, reason: 'watchdog' })
      }
    }
    return null
  })
