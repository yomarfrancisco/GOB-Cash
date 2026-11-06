/**
 * Daily liquid ZAR → bank account.
 *
 * During a 09:00→09:00 SAST cycle, ZAR that becomes liquid (reserve instant
 * payouts, EN_ROUTE clears landing on cashZAR after reserve refill) accrues.
 * Shortly after the next 09:00 clear, that accrued liquid is withdrawn to the
 * linked bank account and posted on the desk.
 *
 * Larger ZAR reserve → more instant fills → more liquid accrued per cycle.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { sastParts } from '../routing/routingTime'
import { roundMajor } from './reserveBooks'

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

/** Wallet field: ZAR that became liquid in the current daily cycle. */
export const LIQUID_CYCLE_ACCRUED_FIELD = 'liquidCycleAccruedZar'
/** Wallet field: SAST calendar day (YYYY-MM-DD) of the cycle start (last 09:00). */
export const LIQUID_CYCLE_KEY_FIELD = 'liquidCycleKey'

/** SAST date key for the open daily cycle (last 09:00 at or before now). */
export function liquidCycleKeyAt(nowMs: number = Date.now()): string {
  const p = sastParts(nowMs)
  const todayNineUtc =
    Date.UTC(p.year, p.month - 1, p.day, 9, 0, 0) - 2 * 60 * 60 * 1000
  if (nowMs >= todayNineUtc) {
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  }
  // Before today's 09:00 → still in yesterday's cycle.
  const yest = sastParts(nowMs - 24 * 60 * 60 * 1000)
  return `${yest.year}-${String(yest.month).padStart(2, '0')}-${String(yest.day).padStart(2, '0')}`
}

function fmtZar(n: number): string {
  return `R${roundMajor(n).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Accrue liquid ZAR on cashZAR. Safe outside a transaction (merge write).
 * Call after a credit that makes ZAR spendable (reserve instant / clear surplus).
 */
export async function accrueLiquidZar(params: {
  userId: string
  amountMajor: number
  nowMs?: number
}): Promise<void> {
  const amount = roundMajor(params.amountMajor)
  if (!(amount > 0) || !params.userId) return

  const nowMs = params.nowMs ?? Date.now()
  const cycleKey = liquidCycleKeyAt(nowMs)
  const zarRef = db().collection('users').doc(params.userId).collection('wallets').doc('cashZAR')
  const now = admin.firestore.Timestamp.fromMillis(nowMs)

  await db().runTransaction(async (t) => {
    const snap = await t.get(zarRef)
    const data = snap.exists ? snap.data() || {} : {}
    // Never drop unpaid accrual on a cycle-key rollover — payout is what zeros it.
    const prevAccrued = roundMajor(Number(data[LIQUID_CYCLE_ACCRUED_FIELD] || 0))
    const next = roundMajor(prevAccrued + amount)
    const patch: Record<string, unknown> = {
      [LIQUID_CYCLE_ACCRUED_FIELD]: next,
      [LIQUID_CYCLE_KEY_FIELD]: cycleKey,
      updatedAt: now,
    }
    if (!snap.exists) {
      t.set(zarRef, {
        walletId: 'cashZAR',
        kind: 'cash',
        displayCurrency: 'ZAR',
        fiatBalance: 0,
        usdtBalance: 0,
        ...patch,
      })
    } else {
      t.update(zarRef, patch)
    }
  })
}

export type LiquidZarPayoutResult = {
  userId: string
  amountZar: number
  cycleKey: string
  txId: string | null
  skipped?: string
}

/**
 * Withdraw accrued liquid ZAR (capped by cashZAR balance) to the bank account
 * and post a desk notice. Idempotent per cycle key.
 */
export async function payoutLiquidZarForUser(params: {
  userId: string
  nowMs?: number
}): Promise<LiquidZarPayoutResult> {
  const userId = params.userId
  const nowMs = params.nowMs ?? Date.now()
  // Payout closes the cycle that just ended at the most recent 09:00.
  // At 09:15, liquidCycleKeyAt is today's date (= cycle that started today at 09:00).
  // Accrual from the prior 24h lived under yesterday's key until 09:00 clears
  // rolled into today's key — so we pay whatever is currently accrued, then
  // stamp paidCycleKey so we don't double-pay.
  const cycleKey = liquidCycleKeyAt(nowMs)
  const paidId = `liquid-zar-payout-${cycleKey}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const userRef = db().collection('users').doc(userId)
  const zarRef = userRef.collection('wallets').doc('cashZAR')
  const eventRef = userRef.collection('activityEvents').doc(paidId)
  const txRef = db().collection('transactions').doc(paidId)
  const now = admin.firestore.Timestamp.fromMillis(nowMs)

  const existing = await eventRef.get()
  if (existing.exists) {
    return {
      userId,
      amountZar: Number(existing.data()?.amountValue || 0),
      cycleKey,
      txId: paidId,
      skipped: 'already_paid',
    }
  }

  const result = await db().runTransaction(async (t): Promise<LiquidZarPayoutResult> => {
    const eventSnap = await t.get(eventRef)
    if (eventSnap.exists) {
      return {
        userId,
        amountZar: Number(eventSnap.data()?.amountValue || 0),
        cycleKey,
        txId: paidId,
        skipped: 'already_paid',
      }
    }

    const zarSnap = await t.get(zarRef)
    if (!zarSnap.exists) {
      return { userId, amountZar: 0, cycleKey, txId: null, skipped: 'no_wallet' }
    }
    const zarData = zarSnap.data() || {}
    const balance = roundMajor(Number(zarData.fiatBalance || 0))
    const accrued = roundMajor(Number(zarData[LIQUID_CYCLE_ACCRUED_FIELD] || 0))
    const amount = roundMajor(Math.min(balance, accrued))
    if (!(amount > 0.005)) {
      // Still clear accrual so a zero day doesn't block the next cycle's stamp.
      t.update(zarRef, {
        [LIQUID_CYCLE_ACCRUED_FIELD]: 0,
        [LIQUID_CYCLE_KEY_FIELD]: cycleKey,
        liquidCycleLastPayoutAt: now,
        liquidCycleLastPayoutZar: 0,
        updatedAt: now,
      })
      return { userId, amountZar: 0, cycleKey, txId: null, skipped: 'nothing_liquid' }
    }

    const amountMinor = Math.round(amount * 100)
    const balanceMinor = Math.round(balance * 100)
    const sentence = `${fmtZar(amount)} withdrawn to account · liquid from the prior 24h cycle.`

    t.update(zarRef, {
      fiatBalance: (balanceMinor - amountMinor) / 100,
      [LIQUID_CYCLE_ACCRUED_FIELD]: 0,
      [LIQUID_CYCLE_KEY_FIELD]: cycleKey,
      liquidCycleLastPayoutAt: now,
      liquidCycleLastPayoutZar: amount,
      updatedAt: now,
    })

    t.set(txRef, {
      id: paidId,
      userId,
      type: 'BANK_WITHDRAWAL',
      transactionType: 'BANK_WITHDRAWAL',
      uiAction: 'WITHDRAW',
      instructionSource: 'SYSTEM',
      recordingSource: 'SYSTEM',
      executionChannel: 'INTERNAL',
      status: 'SETTLED',
      instructionStatus: 'SETTLED',
      settlementPath: 'daily_liquid_zar',
      sourceCurrency: 'ZAR',
      destinationCurrency: 'ZAR',
      currency: 'ZAR',
      sourceAmountMinor: amountMinor,
      expectedDestinationAmountMinor: amountMinor,
      actualDestinationAmountMinor: amountMinor,
      amountZar: amount,
      liquidCycleKey: cycleKey,
      createdAt: now,
      settledAt: now,
      statusUpdatedAt: now,
      updatedAt: now,
    })

    t.set(eventRef, {
      id: paidId,
      kind: 'WITHDRAWAL_INSTRUCTED',
      title: 'Daily withdrawal to account',
      body: sentence,
      deskSentence: sentence,
      dropdownTitle: 'Withdrawn',
      dropdownBody: `${fmtZar(amount)} · prior 24h liquid`,
      deskStatusChip: 'Withdrawn',
      deskLedgerRows: [
        { label: 'Liquid (prior 24h)', value: fmtZar(amount) },
        { label: 'To account', value: fmtZar(amount) },
        { label: 'Cycle', value: cycleKey },
      ],
      deskStep: 5,
      actorType: 'ai_manager',
      avatarKind: 'zar_withdrawn',
      amountCurrency: 'ZAR',
      amountValue: amount,
      amountSign: 'debit',
      txId: paidId,
      groupId: paidId,
      hasDownloadButton: false,
      awaitingConfirm: false,
      routingBlocked: false,
      status: 'recorded',
      routingAction: 'daily_liquid_zar_payout',
      deskSpeaker: 'leo',
      liquidCycleKey: cycleKey,
      createdAt: now,
      recordingSource: 'SYSTEM',
    })

    return { userId, amountZar: amount, cycleKey, txId: paidId }
  })

  return result
}

/**
 * Sweep liquid ZAR payouts for users who accrued this cycle.
 * Always includes the desk admin; also scans wallets with accrued liquid.
 */
export async function payoutLiquidZarDaily(limit = 40): Promise<LiquidZarPayoutResult[]> {
  const { ROUTING_ADMIN_UID } = await import('../routing/conversionRouter')
  const nowMs = Date.now()
  const results: LiquidZarPayoutResult[] = []
  const seen = new Set<string>()

  const candidates = [ROUTING_ADMIN_UID]
  try {
    const snap = await db()
      .collectionGroup('wallets')
      .where(LIQUID_CYCLE_ACCRUED_FIELD, '>', 0)
      .limit(limit)
      .get()
    for (const doc of snap.docs) {
      if (doc.id !== 'cashZAR') continue
      const userId = doc.ref.parent.parent?.id
      if (userId) candidates.push(userId)
    }
  } catch (error) {
    console.warn('[payoutLiquidZarDaily] collectionGroup scan skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  for (const userId of candidates) {
    if (!userId || seen.has(userId)) continue
    seen.add(userId)
    try {
      const r = await payoutLiquidZarForUser({ userId, nowMs })
      results.push(r)
      if (r.amountZar > 0) {
        console.log('[payoutLiquidZarDaily] paid', r)
      }
    } catch (error) {
      console.error('[payoutLiquidZarDaily] user failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

/** 09:15 SAST — after the 09:00 EN_ROUTE clear window has had time to settle. */
export const tx_dailyLiquidZarPayout = functions
  .region('us-central1')
  .pubsub.schedule('15 9 * * *')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    // Ensure due EN_ROUTE lots land as liquid before we withdraw the cycle.
    try {
      const { settleDueEnRouteLots } = await import('../tx/enRouteSettle')
      const n = await settleDueEnRouteLots(40)
      if (n > 0) console.log(`[tx_dailyLiquidZarPayout] settled ${n} en-route lot(s) first`)
    } catch (error) {
      console.warn('[tx_dailyLiquidZarPayout] pre-settle skipped', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    const results = await payoutLiquidZarDaily(40)
    const paid = results.filter((r) => r.amountZar > 0)
    console.log(`[tx_dailyLiquidZarPayout] paid ${paid.length} user(s)`, {
      totalZar: roundMajor(paid.reduce((s, r) => s + r.amountZar, 0)),
    })
    return null
  })
