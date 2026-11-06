/**
 * Desk "Liquidity" → Liquidity report (pipe model).
 * Live report recomputes; older reports freeze with a "Changed since" diff.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { CONVERSION_ROUTING_KIND } from '../routing/conversionRouter'
import {
  computeLiquidity,
  diffLiquiditySnapshots,
  formatChipClock,
  formatLiquidityWhen,
  formatLiquidityZar,
  type LiquiditySnapshot,
  type LiquidityState,
} from './computeLiquidity'
import { roundMajor } from './reserveBooks'

const db = admin.firestore()

function money(n: number): number {
  return roundMajor(n)
}

/** Any signed-in client with MZN/ZAR/earnings on book (successfully funded). */
async function assertFundedCaller(uid: string): Promise<void> {
  const userRef = db.collection('users').doc(uid)
  const [mznSnap, zarSnap, earnSnap] = await Promise.all([
    userRef.collection('wallets').doc('cashMZN').get(),
    userRef.collection('wallets').doc('cashZAR').get(),
    userRef.collection('wallets').doc('earnings').get(),
  ])
  const cashMzn = money(Number(mznSnap.data()?.fiatBalance || 0))
  const cashZar = money(Number(zarSnap.data()?.fiatBalance || 0))
  const earnings = money(Number(earnSnap.data()?.fiatBalance || 0))
  if (cashMzn > 0.005 || cashZar > 0.005 || earnings > 0.005) return

  // Past successful MZN funding even if the wallet was later converted to zero.
  try {
    const fundedSnap = await db
      .collection('transactions')
      .where('userId', '==', uid)
      .where('destinationCurrency', '==', 'MZN')
      .where('status', '==', 'SETTLED')
      .limit(1)
      .get()
    if (!fundedSnap.empty) return
  } catch (error) {
    console.warn('[liquidity] funded history scan skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  throw new functions.https.HttpsError(
    'failed-precondition',
    'Liquidity report is available after your account is funded'
  )
}

function pctLiquid(liquid: number, funded: number): string {
  if (!(funded > 0)) return '0%'
  const p = (liquid / funded) * 100
  if (p < 0.05) return '0%'
  if (p < 10) return `${p.toFixed(1)}%`
  return `${Math.round(p)}%`
}

function groupTimeline(states: LiquidityState[], nowMs: number): Array<{
  kind: LiquidityState['kind']
  amountZar: number
  landsAt: number | null
  label: string
  whenLabel: string
  done: boolean
}> {
  // Collapse same landsAt + kind
  const map = new Map<string, { kind: LiquidityState['kind']; amountZar: number; landsAt: number | null; label: string }>()
  for (const s of states) {
    const key = `${s.kind}:${s.landsAt ?? 'now'}`
    const prev = map.get(key)
    if (prev) {
      prev.amountZar = money(prev.amountZar + s.amountZar)
    } else {
      map.set(key, { ...s })
    }
  }
  const rows = [...map.values()].sort((a, b) => {
    if (a.kind === 'liquid') return -1
    if (b.kind === 'liquid') return 1
    return (a.landsAt ?? 0) - (b.landsAt ?? 0)
  })
  return rows.map((r) => ({
    ...r,
    whenLabel: r.kind === 'liquid' ? 'Now' : formatLiquidityWhen(r.landsAt, nowMs),
    done: r.kind === 'liquid',
  }))
}

export type LiquidityStatusReport = {
  eventId: string
  fundedMzn: number
  liquidZar: number
  fundedZar: number
  fullLiquidityAt: number | null
  reconciled: boolean
  sentence: string
}

async function freezePriorLiveReports(
  adminUid: string,
  live: LiquiditySnapshot,
  now: admin.firestore.Timestamp
): Promise<void> {
  const events = db.collection('users').doc(adminUid).collection('activityEvents')
  // Single-field filter to avoid a composite index; narrow in memory.
  const snap = await events.where('liquidityLive', '==', true).limit(12).get()
  if (snap.empty) return

  const batch = db.batch()
  let writes = 0
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    if (data.routingAction !== 'liquidity_report' && data.routingAction !== 'liquidity_status') {
      continue
    }
    const prior = data.liquiditySnapshot as LiquiditySnapshot | undefined
    const asAtMs =
      typeof prior?.computedAt === 'number'
        ? prior.computedAt
        : data.createdAt?.toMillis?.() || live.computedAt
    const changes = prior ? diffLiquiditySnapshots(prior, live) : []
    batch.set(
      doc.ref,
      {
        liquidityLive: false,
        deskStatusChip: `Snapshot · as at ${formatChipClock(asAtMs)}`,
        liquidityChanges: changes,
        liquidityFrozenAt: now,
        updatedAt: now,
      },
      { merge: true }
    )
    writes += 1
  }
  if (writes > 0) await batch.commit()
}

/**
 * Publish a live Liquidity report at the bottom of the desk feed.
 */
export async function publishLiquidityStatus(adminUid: string): Promise<LiquidityStatusReport> {
  const nowMs = Date.now()
  const now = admin.firestore.Timestamp.fromMillis(nowMs)
  const pipe = await computeLiquidity(adminUid, nowMs)

  if (!pipe.reconciled) {
    console.error('[liquidity_report] not reconciled', {
      unaccountedZar: pipe.unaccountedZar,
      fundedZar: pipe.fundedZar,
      states: pipe.states.map((s) => ({ kind: s.kind, amountZar: s.amountZar })),
    })
  }

  await freezePriorLiveReports(adminUid, pipe, now)

  const timeline = groupTimeline(pipe.states, nowMs)
  const fullLabel =
    pipe.fullLiquidityAt == null && pipe.liquidZar >= pipe.fundedZar - 0.02
      ? 'Now'
      : formatLiquidityWhen(pipe.fullLiquidityAt, nowMs)
  const liquidPct = pctLiquid(pipe.liquidZar, pipe.fundedZar)
  const sentence = `${formatLiquidityZar(pipe.liquidZar)} of ${formatLiquidityZar(pipe.fundedZar)} liquid now · ${liquidPct}`

  const pipeSegments = pipe.states.map((s) => ({
    kind: s.kind,
    amountZar: s.amountZar,
  }))

  const dayKey = formatLiquidityWhen(nowMs, nowMs).replace(/[^\w.-]+/g, '-').slice(0, 24)
  const eventId = `liquidity-report-${dayKey}-${nowMs}`.replace(/[^\w.-]+/g, '-').slice(0, 180)
  const title = 'Liquidity report'

  const chips: string[] = [
    `Live · updated ${formatChipClock(nowMs)}`,
    pipe.reconciled
      ? 'All funds accounted for'
      : `Not reconciled · ${formatLiquidityZar(Math.abs(pipe.unaccountedZar))} unaccounted`,
  ]

  await db
    .collection('users')
    .doc(adminUid)
    .collection('activityEvents')
    .doc(eventId)
    .set(
      {
        id: eventId,
        kind: CONVERSION_ROUTING_KIND,
        title,
        body: sentence,
        deskSentence: sentence,
        deskStatusChip: chips[0],
        deskPendingChip: chips[1],
        dropdownTitle: title,
        dropdownBody: sentence,
        actorType: 'ai_manager',
        avatarKind: 'convert_zar',
        amountCurrency: 'ZAR',
        amountValue: pipe.liquidZar,
        amountSign: 'credit',
        txId: eventId,
        hasDownloadButton: false,
        awaitingConfirm: false,
        routingBlocked: false,
        status: 'recorded',
        routingAction: 'liquidity_report',
        deskSpeaker: 'sam',
        deskStep: 6,
        createdAt: now,
        updatedAt: now,
        recordingSource: 'SYSTEM',
        liquidityLive: true,
        liquiditySnapshot: pipe,
        liquidityReport: {
          live: true,
          chips,
          fullLiquidityLabel: fullLabel,
          fullLiquidityAt: pipe.fullLiquidityAt,
          liquidZar: pipe.liquidZar,
          fundedZar: pipe.fundedZar,
          fundedMzn: pipe.fundedMzn,
          rate: pipe.rate,
          liquidPct,
          pipeSegments,
          timeline,
          note: 'Times are estimates. New funding extends the job; held amounts roll to the next window.',
          withdrawZar: pipe.liquidZar > 0.005 ? pipe.liquidZar : 0,
          reconciled: pipe.reconciled,
          unaccountedZar: pipe.unaccountedZar,
        },
        // Back-compat for any older clients still reading liquidityStatus.
        liquidityStatus: {
          receivedMzn: pipe.fundedMzn,
          liquidZar: pipe.liquidZar,
          clearingZar: pipe.clearingZar,
          nextClearMs: pipe.fullLiquidityAt,
        },
      },
      { merge: true }
    )

  return {
    eventId,
    fundedMzn: pipe.fundedMzn,
    liquidZar: pipe.liquidZar,
    fundedZar: pipe.fundedZar,
    fullLiquidityAt: pipe.fullLiquidityAt,
    reconciled: pipe.reconciled,
    sentence,
  }
}

/** Lightweight strip payload (no activity write). */
export async function getLiquidityStrip(adminUid: string): Promise<{
  fullLiquidityLabel: string
  liquidZar: number
  fundedZar: number
  liquidPct: number
  rate: number
  computedAt: number
}> {
  const pipe = await computeLiquidity(adminUid, Date.now())
  const fullLiquidityLabel =
    pipe.fullLiquidityAt == null && pipe.liquidZar >= pipe.fundedZar - 0.02
      ? 'now'
      : formatLiquidityWhen(pipe.fullLiquidityAt, pipe.computedAt).split(' · ')[0] || '—'
  return {
    fullLiquidityLabel,
    liquidZar: pipe.liquidZar,
    fundedZar: pipe.fundedZar,
    liquidPct: pipe.fundedZar > 0 ? pipe.liquidZar / pipe.fundedZar : 0,
    rate: pipe.rate,
    computedAt: pipe.computedAt,
  }
}

export const admin_publishLiquidityStatus = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    await assertFundedCaller(context.auth.uid)
    return publishLiquidityStatus(context.auth.uid)
  })

export const admin_getLiquidityStrip = functions
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required')
    }
    await assertFundedCaller(context.auth.uid)
    return getLiquidityStrip(context.auth.uid)
  })
