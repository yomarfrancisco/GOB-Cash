/**
 * Client liquidity pipe: every funded metical is liquid / clearing / scheduled / held.
 * Reuses channelSplit + enRoute settle clocks — no new routing logic.
 */

import * as admin from 'firebase-admin'
import {
  bankingDeadlineIso,
  EFT_POLICY_V1,
  nextCardSettleByIso,
  openEftZar,
  splitReplacementChannels,
  type ChannelTicket,
  type EftDeskBook,
} from '../routing/channelSplit'
import {
  costMznPerZarFromSell,
  MZN_PER_ZAR_FALLBACK,
} from '../fx/quotedMznZar'

/** Same 09:00 SAST rule as enRouteSettle.nextSettleAt09hSast — local to avoid admin init. */
function nextClearMs(fromMs: number): number {
  return Date.parse(nextCardSettleByIso(fromMs))
}

function roundMajor(value: number): number {
  return Math.round(value * 100) / 100
}

const CURRENT = 'adminConversionCurrent'
const TESTS = 'adminConversionTests'

export type LiquidityStateKind = 'liquid' | 'clearing' | 'card' | 'eft' | 'held'

export type LiquidityState = {
  kind: LiquidityStateKind
  amountZar: number
  landsAt: number | null
  label: string
}

export type LiquiditySnapshot = {
  computedAt: number
  fundedMzn: number
  rate: number
  fundedZar: number
  liquidZar: number
  clearingZar: number
  states: LiquidityState[]
  fullLiquidityAt: number | null
  reconciled: boolean
  unaccountedZar: number
}

function tsMillis(raw: unknown): number | null {
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (raw as { toMillis: () => number }).toMillis()
    return Number.isFinite(ms) && ms > 0 ? ms : null
  }
  if (typeof raw === 'number' && raw > 0) return raw
  return null
}

function money(n: number): number {
  return roundMajor(n)
}

function eftBookFromDoc(data: admin.firestore.DocumentData | undefined): EftDeskBook | null {
  const raw = data?.eftBook
  if (!raw || typeof raw !== 'object') return null
  const tickets = Array.isArray((raw as EftDeskBook).tickets) ? (raw as EftDeskBook).tickets : []
  return {
    tickets,
    lastSplitSummary:
      typeof (raw as EftDeskBook).lastSplitSummary === 'string'
        ? (raw as EftDeskBook).lastSplitSummary
        : null,
    updatedAt:
      typeof (raw as EftDeskBook).updatedAt === 'string'
        ? (raw as EftDeskBook).updatedAt
        : new Date().toISOString(),
  }
}

/** Pick the desk cost rate: frozen quote → order sell → open EN_ROUTE weight. */
export function pickLiquidityRate(input: {
  frozenCostRate?: number
  orderSellRate?: number
  openWeightedCostRate?: number
}): number {
  if (input.frozenCostRate && input.frozenCostRate > 0) return input.frozenCostRate
  if (input.openWeightedCostRate && input.openWeightedCostRate > 0) {
    return input.openWeightedCostRate
  }
  if (input.orderSellRate && input.orderSellRate > 0) {
    return money(input.orderSellRate / 1.1)
  }
  return 0
}

function openEftStates(book: EftDeskBook | null | undefined, nowMs: number): LiquidityState[] {
  if (!book?.tickets?.length) return []
  const out: LiquidityState[] = []
  for (const t of book.tickets) {
    if (t.channel !== 'eft') continue
    if (t.status !== 'open' && t.status !== 'submitted' && t.status !== 'delayed') continue
    const amountZar = money(t.amountZar)
    if (!(amountZar > 0.005)) continue
    const due = Date.parse(t.expectedSettledBy)
    const landsAt = Number.isFinite(due) ? due : Date.parse(
      bankingDeadlineIso(nowMs, EFT_POLICY_V1.hardClearBankingDays, EFT_POLICY_V1.hardClearHourSast)
    )
    out.push({
      kind: 'eft',
      amountZar,
      landsAt,
      label: 'EFT · T+2 banking days',
    })
  }
  return out
}

function cardStatesFromTickets(tickets: ChannelTicket[]): LiquidityState[] {
  const byDay = new Map<number, number>()
  for (const t of tickets) {
    if (!(t.amountZar > 0.005)) continue
    const due = Date.parse(t.expectedSettledBy)
    if (!Number.isFinite(due)) continue
    byDay.set(due, money((byDay.get(due) || 0) + t.amountZar))
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([landsAt, amountZar]) => ({
      kind: 'card' as const,
      amountZar,
      landsAt,
      label: 'card window',
    }))
}

/**
 * Pure pipe math. `remainingToConvertZar` is MZN still on the wallet ÷ rate.
 * Open EFT tickets are preferred; the rest of the residual is scheduled via
 * existing splitReplacementChannels (card windows + any extra EFT).
 */
export function assembleLiquidityPipe(input: {
  atMs: number
  cashMzn: number
  liquidZar: number
  clearingZar: number
  rate: number
  eftBook?: EftDeskBook | null
  bufferUsedZar?: number
}): LiquiditySnapshot {
  const atMs = input.atMs
  const rate = input.rate > 0 ? input.rate : 0
  const liquidZar = money(Math.max(0, input.liquidZar))
  const clearingZar = money(Math.max(0, input.clearingZar))
  const cashMzn = money(Math.max(0, input.cashMzn))

  // Job size: already-converted ZAR + MZN still waiting to convert.
  const remainingToConvertZar = rate > 0 ? money(cashMzn / rate) : 0
  const fundedZar = money(liquidZar + clearingZar + remainingToConvertZar)
  const fundedMzn =
    rate > 0 ? money(fundedZar * rate) : cashMzn

  const states: LiquidityState[] = []
  if (liquidZar > 0.005) {
    states.push({
      kind: 'liquid',
      amountZar: liquidZar,
      landsAt: null,
      label: 'liquid on ZAR wallet',
    })
  }
  if (clearingZar > 0.005) {
    states.push({
      kind: 'clearing',
      amountZar: clearingZar,
      landsAt: nextClearMs(atMs),
      label: 'converted, clearing · card',
    })
  }

  const eftStates = openEftStates(input.eftBook, atMs)
  const openEft = money(eftStates.reduce((s, r) => s + r.amountZar, 0))
  for (const row of eftStates) states.push(row)

  // Residual still converting that is not already on the EFT book.
  let residual = money(Math.max(0, remainingToConvertZar - openEft))
  // Prefer live open EFT; if book overshoots residual, clip conceptually via held/unaccounted later.
  if (openEft > remainingToConvertZar + 0.02) {
    residual = 0
  }

  if (residual > 0.005) {
    const split = splitReplacementChannels({
      amountZar: residual,
      nowMs: atMs,
      shockId: `liq-${atMs}`,
    })
    // If we already counted live EFT, only take card tickets from this split.
    const cardOnly =
      openEft > 0.005
        ? split.cardTickets
        : [...split.cardTickets, ...split.eftTickets]
    if (openEft > 0.005) {
      for (const row of cardStatesFromTickets(split.cardTickets)) states.push(row)
      // Any EFT slice from the residual split that wasn't in the live book.
      for (const t of split.eftTickets) {
        const amountZar = money(t.amountZar)
        if (!(amountZar > 0.005)) continue
        const due = Date.parse(t.expectedSettledBy)
        states.push({
          kind: 'eft',
          amountZar,
          landsAt: Number.isFinite(due) ? due : null,
          label: 'EFT · T+2 banking days',
        })
      }
    } else {
      for (const row of cardStatesFromTickets(cardOnly.filter((t) => t.channel === 'card'))) {
        states.push(row)
      }
      for (const t of cardOnly.filter((t) => t.channel === 'eft')) {
        const amountZar = money(t.amountZar)
        if (!(amountZar > 0.005)) continue
        const due = Date.parse(t.expectedSettledBy)
        states.push({
          kind: 'eft',
          amountZar,
          landsAt: Number.isFinite(due) ? due : null,
          label: 'EFT · T+2 banking days',
        })
      }
    }
  }

  // Held: sold float awaiting a route (bufferUsed) that isn't covered by states above,
  // or any positive leftover after summing scheduled residual.
  const scheduled = money(
    states
      .filter((s) => s.kind !== 'liquid')
      .reduce((s, r) => s + r.amountZar, 0) + liquidZar
  )
  let heldZar = money(Math.max(0, fundedZar - scheduled))
  const bufferUsed = money(Math.max(0, input.bufferUsedZar || 0))
  // If buffer is waiting restock and we have no residual schedule covering it, surface as held.
  if (heldZar < 0.01 && bufferUsed > 0.005 && residual < 0.01 && openEft < 0.01 && clearingZar < 0.01) {
    // Buffer alone with nothing scheduled — only mark held when funded still expects it.
    heldZar = 0
  }
  if (heldZar > 0.005) {
    states.push({
      kind: 'held',
      amountZar: heldZar,
      landsAt: nextClearMs(atMs),
      label: 'held · next window',
    })
  }

  const sumStates = money(states.reduce((s, r) => s + r.amountZar, 0))
  const unaccountedZar = money(fundedZar - sumStates)
  const reconciled = Math.abs(unaccountedZar) < 0.02

  const lands = states
    .map((s) => s.landsAt)
    .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms > 0)
  const fullLiquidityAt =
    lands.length > 0 ? Math.max(...lands) : liquidZar > 0.005 && sumStates <= liquidZar + 0.02 ? null : null

  // When everything is already liquid, fullLiquidityAt is null → "now".
  const effectiveFull =
    lands.length > 0
      ? Math.max(...lands)
      : fundedZar <= liquidZar + 0.02
        ? null
        : nextClearMs(atMs)

  return {
    computedAt: atMs,
    fundedMzn,
    rate,
    fundedZar,
    liquidZar,
    clearingZar,
    states,
    fullLiquidityAt: effectiveFull,
    reconciled,
    unaccountedZar: reconciled ? 0 : unaccountedZar,
  }
}

/** Load wallets + desk books and assemble a live snapshot. */
export async function computeLiquidity(
  clientId: string,
  at: number = Date.now()
): Promise<LiquiditySnapshot> {
  const db = admin.firestore()
  const userRef = db.collection('users').doc(clientId)
  const [mznSnap, zarSnap, earnSnap, currentSnap] = await Promise.all([
    userRef.collection('wallets').doc('cashMZN').get(),
    userRef.collection('wallets').doc('cashZAR').get(),
    userRef.collection('wallets').doc('earnings').get(),
    db.collection(CURRENT).doc(clientId).get(),
  ])

  const cashMzn = money(Number(mznSnap.data()?.fiatBalance || 0))
  const liquidZar = money(Number(zarSnap.data()?.fiatBalance || 0))
  const earningsZar = money(Number(earnSnap.data()?.fiatBalance || 0))

  let clearingZar = earningsZar
  let openWeighted = 0
  let openWeight = 0
  try {
    const openSnap = await db
      .collection('transactions')
      .where('userId', '==', clientId)
      .where('status', '==', 'EN_ROUTE')
      .limit(80)
      .get()
    let openZar = 0
    for (const doc of openSnap.docs) {
      const tx = doc.data() || {}
      const dest = String(tx.destinationCurrency || '')
      const destMinor = Math.round(Number(tx.expectedDestinationAmountMinor || 0))
      const sourceMinor = Math.round(Number(tx.sourceAmountMinor || 0))
      const zarInLot =
        dest === 'ZAR'
          ? destMinor / 100
          : String(tx.sourceCurrency || '') === 'ZAR'
            ? sourceMinor / 100
            : 0
      if (zarInLot > 0) {
        openZar = money(openZar + zarInLot)
        const rate = Number(tx.costRateMZNperZAR || tx.sellRateMZNperZAR || tx.quotedRate || 0)
        if (rate > 0) {
          openWeighted += rate * zarInLot
          openWeight += zarInLot
        }
      }
    }
    if (openZar > clearingZar) clearingZar = openZar
  } catch (error) {
    console.warn('[computeLiquidity] EN_ROUTE scan skipped', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  let frozenCost = 0
  let orderSell = 0
  let eftBook: EftDeskBook | null = null
  let bufferUsedZar = 0
  const testRunId = typeof currentSnap.data()?.testRunId === 'string' ? currentSnap.data()!.testRunId : null
  if (testRunId) {
    const testSnap = await db.collection(TESTS).doc(testRunId).get()
    const data = testSnap.data() || {}
    const fq = data.frozenQuote as { costRate?: number; sellRate?: number } | undefined
    frozenCost = Number(fq?.costRate || 0)
    orderSell = Number(data.orderSellRate || fq?.sellRate || 0)
    eftBook = eftBookFromDoc(data)
    bufferUsedZar = money(Number(data.bufferUsed || 0))
  }

  const rate =
    pickLiquidityRate({
      frozenCostRate: frozenCost,
      orderSellRate: orderSell,
      openWeightedCostRate: openWeight > 0 ? openWeighted / openWeight : 0,
    }) || costMznPerZarFromSell(MZN_PER_ZAR_FALLBACK)

  return assembleLiquidityPipe({
    atMs: at,
    cashMzn,
    liquidZar,
    clearingZar,
    rate,
    eftBook,
    bufferUsedZar,
  })
}

export function formatLiquidityZar(n: number): string {
  return `R${money(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatLiquidityMzn(n: number): string {
  return `${money(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MZN`
}

export function formatLiquidityRate(n: number): string {
  if (!(n > 0)) return '—'
  return `${n.toFixed(4)} MZN/ZAR`
}

/** Compact SAST date for hero / rows: `Wed 11 Nov · ~09:00`. */
export function formatLiquidityWhen(ms: number | null, nowMs: number): string {
  if (ms == null) return 'Now'
  const SAST = 2 * 60 * 60 * 1000
  const d = new Date(ms + SAST)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dow = days[d.getUTCDay()]
  const day = d.getUTCDate()
  const mon = months[d.getUTCMonth()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const sameDay =
    new Date(nowMs + SAST).toISOString().slice(0, 10) === d.toISOString().slice(0, 10)
  if (sameDay && ms <= nowMs + 60_000) return 'Now'
  return `${dow} ${day} ${mon} · ~${hh}:${mm}`
}

export function formatChipClock(ms: number): string {
  const SAST = 2 * 60 * 60 * 1000
  const d = new Date(ms + SAST)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Diff two snapshots for the frozen "Changed since" box. */
export function diffLiquiditySnapshots(
  prior: LiquiditySnapshot,
  live: LiquiditySnapshot
): string[] {
  const lines: string[] = []
  const mznDelta = money(live.fundedMzn - prior.fundedMzn)
  if (Math.abs(mznDelta) > 0.005) {
    const sign = mznDelta > 0 ? '+' : ''
    lines.push(
      `${sign}${money(mznDelta).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} MZN funded at ${formatChipClock(live.computedAt)}`
    )
  }
  if (prior.rate > 0 && live.rate > 0 && Math.abs(live.rate - prior.rate) >= 0.00005) {
    lines.push(`Rate now ${formatLiquidityRate(live.rate)}`)
  }
  const priorFull = prior.fullLiquidityAt
  const liveFull = live.fullLiquidityAt
  if (priorFull !== liveFull) {
    if (liveFull == null) {
      lines.push('Full liquidity now')
    } else if (priorFull == null || liveFull !== priorFull) {
      lines.push(`Full liquidity moved to ${formatLiquidityWhen(liveFull, live.computedAt).split(' · ')[0]}`)
    }
  }
  const liqDelta = money(live.liquidZar - prior.liquidZar)
  if (Math.abs(liqDelta) > 0.005 && Math.abs(mznDelta) < 0.005) {
    const sign = liqDelta > 0 ? '+' : ''
    lines.push(`${sign}${formatLiquidityZar(liqDelta).slice(1)} liquid`)
  }
  return lines
}

/** Re-export openEft helper for callers that already hold a book. */
export { openEftZar }
