/**
 * Shared ZAR / MZN treasury reserves — fund instant conversion legs FCFS.
 * Invisible on Home; desk copy explains splits.
 */

import * as admin from 'firebase-admin'

export type ReserveCurrency = 'ZAR' | 'MZN'

export type ReserveBook = {
  currency: ReserveCurrency
  fiatBalance: number
  targetBalance: number
  updatedAt?: FirebaseFirestore.Timestamp | string | null
}

/** Bootstrap: R100k ZAR live; Mt 0 MZN until funded. */
export const RESERVE_DEFAULTS: Record<
  ReserveCurrency,
  { fiatBalance: number; targetBalance: number }
> = {
  ZAR: { fiatBalance: 100_000, targetBalance: 100_000 },
  MZN: { fiatBalance: 0, targetBalance: 0 },
}

export function reserveDocId(currency: ReserveCurrency): string {
  return currency === 'ZAR' ? 'zarReserve' : 'mznReserve'
}

export function roundMajor(value: number): number {
  return Math.round(value * 100) / 100
}

/** How much of `want` can be funded from available reserve. */
export function allocateFromAvailable(available: number, want: number): number {
  if (!(want > 0) || !(available > 0)) return 0
  return roundMajor(Math.min(available, want))
}

/** Split a conversion into instant (reserve) + routed remainder in dest terms. */
export function splitDestAgainstReserve(params: {
  wantDest: number
  reserveAvailable: number
  totalSource: number
}): {
  instantDest: number
  routedDest: number
  instantSource: number
  routedSource: number
} {
  const wantDest = roundMajor(Math.max(0, params.wantDest))
  const totalSource = roundMajor(Math.max(0, params.totalSource))
  const instantDest = allocateFromAvailable(params.reserveAvailable, wantDest)
  const routedDest = roundMajor(wantDest - instantDest)
  if (!(wantDest > 0) || !(totalSource > 0)) {
    return { instantDest: 0, routedDest: wantDest, instantSource: 0, routedSource: totalSource }
  }
  const instantSource = roundMajor((totalSource * instantDest) / wantDest)
  const routedSource = roundMajor(totalSource - instantSource)
  return { instantDest, routedDest, instantSource, routedSource }
}

/** Divert a credit toward reserve deficit; remainder is liquid surplus. */
export function refillTowardTarget(params: {
  balance: number
  targetBalance: number
  availableCredit: number
}): { toReserve: number; surplus: number } {
  const credit = roundMajor(Math.max(0, params.availableCredit))
  const deficit = roundMajor(Math.max(0, params.targetBalance - params.balance))
  const toReserve = roundMajor(Math.min(deficit, credit))
  return { toReserve, surplus: roundMajor(credit - toReserve) }
}

function db(): FirebaseFirestore.Firestore {
  return admin.firestore()
}

export function reserveRef(currency: ReserveCurrency): FirebaseFirestore.DocumentReference {
  return db().collection('treasury').doc(reserveDocId(currency))
}

export async function getOrInitReserve(
  currency: ReserveCurrency,
  t?: FirebaseFirestore.Transaction
): Promise<ReserveBook> {
  const ref = reserveRef(currency)
  const snap = t ? await t.get(ref) : await ref.get()
  if (snap.exists) {
    const data = snap.data() || {}
    return {
      currency,
      fiatBalance: roundMajor(Number(data.fiatBalance || 0)),
      targetBalance: roundMajor(
        Number(
          data.targetBalance != null ? data.targetBalance : RESERVE_DEFAULTS[currency].targetBalance
        )
      ),
      updatedAt: data.updatedAt ?? null,
    }
  }
  const seed = RESERVE_DEFAULTS[currency]
  const book: ReserveBook = {
    currency,
    fiatBalance: seed.fiatBalance,
    targetBalance: seed.targetBalance,
  }
  const now = admin.firestore.Timestamp.now()
  const payload = {
    currency,
    fiatBalance: book.fiatBalance,
    targetBalance: book.targetBalance,
    updatedAt: now,
    createdAt: now,
  }
  if (t) t.set(ref, payload)
  else await ref.set(payload)
  return book
}

/**
 * Debit reserve inside an open transaction. Returns funded major (may be 0).
 * Initializes the book on first touch.
 */
export async function allocateAndDebitReserve(
  t: FirebaseFirestore.Transaction,
  currency: ReserveCurrency,
  wantMajor: number
): Promise<number> {
  const want = roundMajor(Math.max(0, wantMajor))
  if (!(want > 0)) return 0
  const ref = reserveRef(currency)
  const snap = await t.get(ref)
  const defaults = RESERVE_DEFAULTS[currency]
  const balance = snap.exists
    ? roundMajor(Number(snap.data()?.fiatBalance || 0))
    : defaults.fiatBalance
  const targetBalance = snap.exists
    ? roundMajor(
        Number(
          snap.data()?.targetBalance != null ? snap.data()?.targetBalance : defaults.targetBalance
        )
      )
    : defaults.targetBalance
  const funded = allocateFromAvailable(balance, want)
  const now = admin.firestore.Timestamp.now()
  if (!snap.exists) {
    t.set(ref, {
      currency,
      fiatBalance: roundMajor(balance - funded),
      targetBalance,
      updatedAt: now,
      createdAt: now,
    })
  } else if (funded > 0) {
    t.update(ref, {
      fiatBalance: roundMajor(balance - funded),
      updatedAt: now,
    })
  }
  return funded
}

/**
 * Product promise: amounts ≤ target convert instantly. If the book is drained
 * below `minimumMajor`, top it back up (prefer refill to targetBalance).
 */
export async function ensureReserveAtLeast(
  currency: ReserveCurrency,
  minimumMajor: number
): Promise<{ toppedUp: number; balance: number }> {
  const minimum = roundMajor(Math.max(0, minimumMajor))
  const ref = reserveRef(currency)
  return db().runTransaction(async (t) => {
    const snap = await t.get(ref)
    const defaults = RESERVE_DEFAULTS[currency]
    const now = admin.firestore.Timestamp.now()
    if (!snap.exists) {
      const seedBal = roundMajor(Math.max(defaults.fiatBalance, minimum))
      t.set(ref, {
        currency,
        fiatBalance: seedBal,
        targetBalance: defaults.targetBalance,
        updatedAt: now,
        createdAt: now,
      })
      return { toppedUp: seedBal, balance: seedBal }
    }
    const data = snap.data() || {}
    const balance = roundMajor(Number(data.fiatBalance || 0))
    const targetBalance = roundMajor(
      Number(data.targetBalance != null ? data.targetBalance : defaults.targetBalance)
    )
    if (!(minimum > 0) || balance + 0.02 >= minimum) {
      return { toppedUp: 0, balance }
    }
    const desired = roundMajor(
      Math.max(minimum, targetBalance > 0 ? targetBalance : minimum)
    )
    const toppedUp = roundMajor(desired - balance)
    const newBal = roundMajor(balance + toppedUp)
    t.update(ref, { fiatBalance: newBal, updatedAt: now })
    return { toppedUp, balance: newBal }
  })
}

export async function creditReserve(
  t: FirebaseFirestore.Transaction,
  currency: ReserveCurrency,
  amountMajor: number
): Promise<void> {
  const amount = roundMajor(Math.max(0, amountMajor))
  if (!(amount > 0)) return
  const ref = reserveRef(currency)
  const snap = await t.get(ref)
  const defaults = RESERVE_DEFAULTS[currency]
  const balance = snap.exists
    ? roundMajor(Number(snap.data()?.fiatBalance || 0))
    : defaults.fiatBalance
  const targetBalance = snap.exists
    ? roundMajor(
        Number(
          snap.data()?.targetBalance != null ? snap.data()?.targetBalance : defaults.targetBalance
        )
      )
    : defaults.targetBalance
  const now = admin.firestore.Timestamp.now()
  if (!snap.exists) {
    t.set(ref, {
      currency,
      fiatBalance: roundMajor(balance + amount),
      targetBalance,
      updatedAt: now,
      createdAt: now,
    })
  } else {
    t.update(ref, {
      fiatBalance: roundMajor(balance + amount),
      updatedAt: now,
    })
  }
}

/**
 * Apply a land credit: fill reserve toward target first, return liquid surplus
 * that should hit the user/admin wallet.
 */
export async function divertLandCreditThroughReserve(
  t: FirebaseFirestore.Transaction,
  currency: ReserveCurrency,
  landCreditMajor: number
): Promise<{ toReserve: number; toWallet: number }> {
  const credit = roundMajor(Math.max(0, landCreditMajor))
  if (!(credit > 0)) return { toReserve: 0, toWallet: 0 }
  const book = await getOrInitReserve(currency, t)
  const { toReserve, surplus } = refillTowardTarget({
    balance: book.fiatBalance,
    targetBalance: book.targetBalance,
    availableCredit: credit,
  })
  if (toReserve > 0) await creditReserve(t, currency, toReserve)
  return { toReserve, toWallet: surplus }
}
