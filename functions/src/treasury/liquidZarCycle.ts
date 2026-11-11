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
/** Top-level pointer so 09:15 sweep finds users without waiting on a collectionGroup index. */
export const LIQUID_ZAR_ACCRUAL_POINTERS = 'liquidZarCycleAccrued'

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
    if (data.firstPayoutHold === true) return
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

  // Pointer for the 09:15 sweep (works before / without the collectionGroup index).
  await db()
    .collection(LIQUID_ZAR_ACCRUAL_POINTERS)
    .doc(params.userId)
    .set(
      {
        uid: params.userId,
        accruedZar: admin.firestore.FieldValue.increment(amount),
        cycleKey,
        updatedAt: now,
      },
      { merge: true }
    )
}

export type LiquidZarPayoutResult = {
  userId: string
  amountZar: number
  cycleKey: string
  txId: string | null
  skipped?: string
}

/**
 * Withdraw liquid ZAR (cashZAR wallet) to the bank account and post a desk notice.
 * Idempotent per cycle key.
 *
 * cashZAR is the liquid book — the full balance is what became available to
 * withdraw (reserve fills, clears, EFTs, and any pre-cycle remainder). Accrual
 * is informational only; never leave un-accrued cashZAR stranded as "liquid"
 * on the card after the daily sweep.
 */
export async function payoutLiquidZarForUser(params: {
  userId: string
  nowMs?: number
}): Promise<LiquidZarPayoutResult> {
  const userId = params.userId
  const nowMs = params.nowMs ?? Date.now()
  // Payout closes at ~09:15: drain whatever is liquid now (prior cycle + any
  // 09:00 clear that just landed).
  const cycleKey = liquidCycleKeyAt(nowMs)
  const paidId = `liquid-zar-payout-${cycleKey}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const userRef = db().collection('users').doc(userId)
  const zarRef = userRef.collection('wallets').doc('cashZAR')
  const eventRef = userRef.collection('activityEvents').doc(paidId)
  const txRef = db().collection('transactions').doc(paidId)
  const now = admin.firestore.Timestamp.fromMillis(nowMs)

  const isAlreadyPaidEvent = (data: FirebaseFirestore.DocumentData | undefined) => {
    if (!data) return false
    if (data.payoutScheduled === true) return false
    const chip = String(data.deskStatusChip || data.deskPendingChip || '')
    if (/^scheduled$/i.test(chip)) return false
    return true
  }

  const existing = await eventRef.get()
  if (existing.exists && isAlreadyPaidEvent(existing.data())) {
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
    if (eventSnap.exists && isAlreadyPaidEvent(eventSnap.data())) {
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
    if (zarData.firstPayoutHold === true) {
      return { userId, amountZar: 0, cycleKey, txId: null, skipped: 'first_payout_hold' }
    }
    const balance = roundMajor(Number(zarData.fiatBalance || 0))
    const accrued = roundMajor(Number(zarData[LIQUID_CYCLE_ACCRUED_FIELD] || 0))
    // Drain the liquid wallet itself — not only the post-feature accrual counter.
    const amount = balance
    if (!(amount > 0.005)) {
      t.update(zarRef, {
        [LIQUID_CYCLE_ACCRUED_FIELD]: 0,
        [LIQUID_CYCLE_KEY_FIELD]: cycleKey,
        liquidCycleLastPayoutAt: now,
        liquidCycleLastPayoutZar: 0,
        updatedAt: now,
      })
      t.delete(db().collection(LIQUID_ZAR_ACCRUAL_POINTERS).doc(userId))
      return { userId, amountZar: 0, cycleKey, txId: null, skipped: 'nothing_liquid' }
    }

    const amountMinor = Math.round(amount * 100)
    const balanceMinor = Math.round(balance * 100)
    const details = (zarData.firstPayoutDetails || {}) as {
      bankName?: string
      accountNumber?: string
      accountHolderName?: string
    }
    const bankName = String(details.bankName || '').trim() || 'account'
    const digits = String(details.accountNumber || '').replace(/\s/g, '')
    const masked =
      digits.length > 4 ? `··${digits.slice(-4)}` : digits ? `··${digits}` : ''
    const bankTag = masked ? `${bankName} ${masked}` : bankName
    const scheduledBank = String(eventSnap.data()?.payoutBankTag || '').trim()
    const toTag = scheduledBank || bankTag
    const sentence = `${fmtZar(amount)} is in your account · paid from the 09:00 liquid window.`

    t.update(zarRef, {
      fiatBalance: (balanceMinor - amountMinor) / 100,
      [LIQUID_CYCLE_ACCRUED_FIELD]: 0,
      [LIQUID_CYCLE_KEY_FIELD]: cycleKey,
      liquidCycleLastPayoutAt: now,
      liquidCycleLastPayoutZar: amount,
      liquidCycleLastAccruedZar: accrued,
      updatedAt: now,
    })
    t.delete(db().collection(LIQUID_ZAR_ACCRUAL_POINTERS).doc(userId))

    t.set(
      txRef,
      {
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
      },
      { merge: true }
    )

    // Morph the 09:00 "Scheduled" notice into Paid out (no second message).
    t.set(
      eventRef,
      {
        id: paidId,
        kind: 'WITHDRAWAL_INSTRUCTED',
        title: 'Paid out',
        body: sentence,
        deskSentence: sentence,
        dropdownTitle: 'Paid out',
        dropdownBody: `${fmtZar(amount)} · ${toTag}`,
        deskStatusChip: 'Paid',
        deskPendingChip: admin.firestore.FieldValue.delete(),
        deskLedgerRows: [
          { label: 'Paid', value: fmtZar(amount), valueStrong: true },
          { label: 'To', value: toTag },
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
        hasDownloadButton: true,
        awaitingConfirm: false,
        routingBlocked: false,
        status: 'recorded',
        routingAction: 'daily_liquid_zar_payout',
        deskSpeaker: 'leo',
        liquidCycleKey: cycleKey,
        payoutScheduled: false,
        payoutPaidAtMs: nowMs,
        payoutBankTag: toTag,
        updatedAt: now,
        recordingSource: 'SYSTEM',
      },
      { merge: true }
    )

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

  // Pointer fallback — same pattern as liquidityQueueMzn (index-independent).
  try {
    const pointers = await db().collection(LIQUID_ZAR_ACCRUAL_POINTERS).limit(limit).get()
    for (const doc of pointers.docs) {
      const userId = String(doc.data()?.uid || doc.id || '')
      if (userId) candidates.push(userId)
    }
  } catch (error) {
    console.warn('[payoutLiquidZarDaily] accrual pointer scan skipped', {
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
