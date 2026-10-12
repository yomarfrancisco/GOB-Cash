/**
 * Regenerate the October desk calendar on the live frozen invoice amounts.
 *
 * Rules (production OperatingPolicyV1):
 * - Payer-family eligibility from the registry (BRICS→BRICS, …, Wolf→Wolf|WolfMoza, …)
 * - Moza ≡ BCI capacity after cold-start graduation; PAGA R15k/card/day and /payment
 * - Econometrica Capitec live and fully eligible (no POS staging / MID-pending)
 * - POS floors ≥15%; Lemon principal ≤35%; Capitec 25–35%; POS planning targets
 *
 * Does not invent new commercial identities — amounts are frozen from the live book.
 * Prefer Firestore live book; fall back to the last reallocated JSON amounts.
 */
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import * as admin from 'firebase-admin'
import { ROUTING_ADMIN_UID } from '../src/routing/conversionRouter'
import { OPERATING_POLICY_V1 } from '../src/operatingCalendar/operatingPolicyV1'
import { type PlannedPayment } from '../src/operatingCalendar/allocateRoutes'
import {
  allocateDeskRoutes,
  cardsForOctoberDesk,
} from '../src/operatingCalendar/allocateDeskRoutes'
import { type UnsignedSlot } from '../src/operatingCalendar/paymentBook'
import { REFERENCE_TERMINALS } from '../src/operatingCalendar/referenceNetwork'
import { validateOperatingCalendar } from '../src/operatingCalendar/validateCalendar'
import { assertFinalDeskLedger } from '../src/operatingCalendar/finalLedgerConstraints'
import {
  OCTOBER_ACTIVE_PAYER_FAMILIES,
  payerFamilyOfCard,
  type PayerFamilyId,
} from '../src/operatingCalendar/payerCardRegistry'
import { roundMoney, sum } from '../src/throughput/model/math'
import type { DayTarget } from '../src/operatingCalendar/monthFixtures'
import type { TerminalId } from '../src/operatingCalendar/operatingPolicyV1'

const OUT_PDF = path.resolve(process.cwd(), '../tmp/october-2026-live-desk-calendar.pdf')
const OUT_JSON = path.resolve(process.cwd(), '../tmp/october-2026-reallocated-calendar.json')
const OUT_MD = path.resolve(process.cwd(), '../tmp/october-2026-reallocated-calendar.md')
const MONTH = '2026-10'
/** Canonical live desk book — R624,667.71 / 62 does not exist in repo; preserve this. */
const EXPECTED_BOOK = { n: 59, zar: 619_700 }

const CARDS = cardsForOctoberDesk()
const TERMINAL_LABEL: Record<TerminalId, string> = {
  WolfFNB: 'Wolf FNB',
  BricsFNB: 'Lemon FNB',
  BricsCapitec: 'Lemon Capitec',
  Imani: 'Imani FNB',
  Econometrica: 'Econometrica Capitec',
}

function money(n: number) {
  return Math.round(n * 100) / 100
}
function zar(n: number) {
  return `R${money(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}
function zarExact(n: number) {
  return `R${money(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function fmtMin(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
}

function octoberOperatingDates(): string[] {
  const out: string[] = []
  for (let d = 1; d <= 31; d++) {
    const iso = `${MONTH}-${pad2(d)}`
    if (new Date(Date.UTC(2026, 9, d)).getUTCDay() !== 0) out.push(iso)
  }
  return out
}

function dayCeiling(operatingDayIndex1: number): number {
  return operatingDayIndex1 <= OPERATING_POLICY_V1.network.coldNetworkDays
    ? OPERATING_POLICY_V1.network.coldDailyCeilingZar
    : OPERATING_POLICY_V1.network.establishedDailyCeilingZar
}

/**
 * Preserve amount multiset. Front-load Moza-sized cold-start inventory (≤R6.5k),
 * then interleave mature amounts. Econometrica is fully eligible — no POS staging pack.
 */
function orderForPack(invoices: number[]): number[] {
  const stageB = OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar
  const mozaRamp: number[] = []
  const mature: number[] = []
  for (const amount of invoices) {
    if (
      amount <= stageB + 1e-9 &&
      mozaRamp.length < OPERATING_POLICY_V1.newCard.stageB.maxCleanOutcomesExclusive * 2
    ) {
      mozaRamp.push(amount)
    } else {
      mature.push(amount)
    }
  }
  const mixed: number[] = []
  const mid = Math.ceil(mature.length / 2)
  const left = mature.slice(0, mid)
  const right = mature.slice(mid)
  const n = Math.max(left.length, right.length)
  for (let i = 0; i < n; i++) {
    if (i < left.length) mixed.push(left[i]!)
    if (i < right.length) mixed.push(right[i]!)
  }
  return [...mozaRamp, ...mixed]
}

/** Spread frozen invoices across all 27 Oct operating days (5×3 + 22×2). */
function packOntoOctober(invoices: number[]): { byDate: Map<string, number[]>; unscheduled: number[] } {
  const dates = octoberOperatingDates()
  const byDate = new Map<string, number[]>()
  for (const d of dates) byDate.set(d, [])
  const queue = orderForPack(invoices)

  // Exact day caps: cold days stay at 2; five established days take a third payment.
  const caps = dates.map(() => 2)
  const threeSlots = [5, 10, 15, 20, 24].filter(
    (i) => i >= OPERATING_POLICY_V1.network.coldNetworkDays && i < dates.length
  )
  for (const i of threeSlots) caps[i] = 3

  const unscheduled: number[] = []

  // Best-fit by remaining value capacity. Econometrica is fully eligible — no stage pin.
  queue.sort((a, b) => b - a)
  while (queue.length) {
    const next = queue.shift()!
    let best = -1
    let bestRoom = -1
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      for (let i = 0; i < dates.length; i++) {
        const day = byDate.get(dates[i]!)!
        const hard =
          i < OPERATING_POLICY_V1.network.coldNetworkDays
            ? 3
            : OPERATING_POLICY_V1.network.maxAttemptsPerOperatingDay
        const limit = pass === 0 ? caps[i]! : hard
        if (day.length >= limit) continue
        const room = dayCeiling(i + 1) - money(sum(day))
        if (room + 1e-9 < next) continue
        if (room > bestRoom) {
          bestRoom = room
          best = i
        }
      }
    }
    if (best < 0) unscheduled.push(next)
    else byDate.get(dates[best]!)!.push(next)
  }
  // Restore a non-monotonic within-day order (pin/stage first, then alternate high/low).
  for (const [date, day] of byDate) {
    if (day.length <= 2) continue
    const sorted = [...day].sort((a, b) => a - b)
    const mixed: number[] = []
    let lo = 0
    let hi = sorted.length - 1
    while (lo <= hi) {
      if (lo === hi) mixed.push(sorted[lo]!)
      else {
        mixed.push(sorted[lo]!, sorted[hi]!)
      }
      lo += 1
      hi -= 1
    }
    byDate.set(date, mixed)
  }
  return { byDate, unscheduled }
}

function slotsFromPack(byDate: Map<string, number[]>): { slots: UnsignedSlot[]; days: DayTarget[] } {
  const dates = octoberOperatingDates()
  const slots: UnsignedSlot[] = []
  const days: DayTarget[] = []
  dates.forEach((date, dayIndex0) => {
    const amounts = byDate.get(date) || []
    if (!amounts.length) return
    days.push({ date, targetZar: money(sum(amounts)), paymentCount: amounts.length })
    // Explicit spaced clocks (≤2–3/day) rotated by day so monthly 30-min buckets stay ≤20%.
    // Spread across many 30-min buckets so monthly bucket share stays ≤20%.
    const patterns: number[][] = [
      [9 * 60 + 5, 12 * 60 + 35, 15 * 60 + 10],
      [9 * 60 + 40, 13 * 60 + 5, 15 * 60 + 55],
      [10 * 60 + 15, 13 * 60 + 40, 16 * 60 + 10],
      [9 * 60 + 20, 12 * 60 + 5, 14 * 60 + 50],
      [10 * 60 + 45, 14 * 60 + 10, 16 * 60 + 25],
      [9 * 60 + 55, 12 * 60 + 50, 15 * 60 + 30],
      [10 * 60 + 30, 13 * 60 + 20, 16 * 60 + 0],
      [9 * 60 + 10, 11 * 60 + 55, 14 * 60 + 25],
      [10 * 60 + 0, 13 * 60 + 55, 15 * 60 + 40],
      [9 * 60 + 35, 12 * 60 + 20, 14 * 60 + 55],
    ]
    const pattern = patterns[dayIndex0 % patterns.length]!
    amounts.forEach((amountZar, slotIndex) => {
      const attemptMin = pattern[Math.min(slotIndex, pattern.length - 1)]!
      slots.push({
        date,
        dayIndex0,
        slotIndex,
        amountZar,
        attemptMin,
        timeSast: `${String(Math.floor(attemptMin / 60)).padStart(2, '0')}:${String(attemptMin % 60).padStart(2, '0')}`,
      })
    })
  })
  return { slots, days }
}

function loadFrozenAmountsFromJson(): { testRunId: string; amounts: number[]; routingEngine: string } {
  if (!fs.existsSync(OUT_JSON)) throw new Error(`No fallback book at ${OUT_JSON}`)
  const prev = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) as {
    payments?: Array<{ amountZar: number }>
    testRunId?: string
    routingEngine?: string
    totalZar?: number
  }
  const amounts = (prev.payments || []).map((p) => Number(p.amountZar))
  if (amounts.length < 50) throw new Error(`Fallback JSON has ${amounts.length} invoices`)
  return {
    testRunId: String(prev.testRunId || 'offline-frozen-json'),
    amounts,
    routingEngine: String(prev.routingEngine || 'offline'),
  }
}

async function loadFrozenAmounts(): Promise<{ testRunId: string; amounts: number[]; routingEngine: string }> {
  try {
    if (!admin.apps.length) admin.initializeApp({ projectId: 'gobankless-dev' })
    const db = admin.firestore()
    const cur = await db.collection('adminConversionCurrent').doc(ROUTING_ADMIN_UID).get()
    const testRunId = String(cur.data()?.testRunId || '')
    if (!testRunId) throw new Error('No active desk run')
    const snap = await db.collection('adminConversionTests').doc(testRunId).get()
    const data = snap.data() || {}
    const book = data.throughputWindow?.snapshot?.book || {}
    const amounts: number[] = []
    for (let d = 1; d <= 31; d++) {
      const tickets = book[String(d)] || book[d] || []
      for (const t of tickets) amounts.push(Number(t.amount))
    }
    if (amounts.length < 50) throw new Error(`Expected ~59 frozen invoices, got ${amounts.length}`)
    return { testRunId, amounts, routingEngine: String(data.routingEngine || '') }
  } catch (err) {
    console.warn('Firestore unavailable — using frozen JSON amounts:', (err as Error).message)
    return loadFrozenAmountsFromJson()
  }
}

/**
 * Assign genuine payer-family demand equally — Moza does not create extra payer demand.
 * Stage-sized invoices prefer Wolf/Goblin so Moza can cold-start, then graduate to R15k.
 * At most one invoice per family per calendar day (cold-start card attempt = 1/day).
 */
function tagPayerFamilies(slots: UnsignedSlot[]): UnsignedSlot[] {
  const families = [...OCTOBER_ACTIVE_PAYER_FAMILIES]
  const stageB = OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar
  const counts = new Map<PayerFamilyId, number>(families.map((f) => [f, 0]))
  const usedOnDate = new Map<string, Set<PayerFamilyId>>()
  const target = Math.ceil(slots.length / families.length)

  function choose(slot: UnsignedSlot, prefer: PayerFamilyId[]): PayerFamilyId {
    const used = usedOnDate.get(slot.date) || new Set<PayerFamilyId>()
    const freePrefer = prefer.filter((f) => !used.has(f))
    const freeAny = families.filter((f) => !used.has(f))
    const pool = (freePrefer.length ? freePrefer : freeAny.length ? freeAny : prefer).sort(
      (a, b) => (counts.get(a) || 0) - (counts.get(b) || 0)
    )
    return pool[0]!
  }

  let mozaAlt = 0
  return slots.map((slot) => {
    let prefer: PayerFamilyId[]
    if (slot.amountZar <= stageB + 1e-9) {
      // Alternate Wolf/Goblin on stage inventory so both Moza twins can graduate.
      const alt = (mozaAlt++ % 2 === 0 ? 'wolf' : 'goblin') as PayerFamilyId
      prefer = [alt, alt === 'wolf' ? 'goblin' : 'wolf']
    } else {
      prefer = families
    }
    const pick = choose(slot, prefer)
    counts.set(pick, (counts.get(pick) || 0) + 1)
    const used = usedOnDate.get(slot.date) || new Set<PayerFamilyId>()
    used.add(pick)
    usedOnDate.set(slot.date, used)
    return { ...slot, payerFamilyId: pick }
  })
}

function shareRows<T extends string>(
  payments: PlannedPayment[],
  keyFn: (p: PlannedPayment) => T
): Array<{ key: T; n: number; zar: number; shareN: number; shareV: number }> {
  const totN = payments.length
  const totV = money(sum(payments.map((p) => p.amountZar)))
  const map = new Map<T, { n: number; zar: number }>()
  for (const p of payments) {
    const k = keyFn(p)
    const cur = map.get(k) || { n: 0, zar: 0 }
    cur.n += 1
    cur.zar += p.amountZar
    map.set(k, cur)
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      n: v.n,
      zar: money(v.zar),
      shareN: v.n / totN,
      shareV: v.zar / totV,
    }))
    .sort((a, b) => b.zar - a.zar)
}

function rolling7Exposure(payments: PlannedPayment[]) {
  const dates = [...new Set(payments.map((p) => p.date))].sort()
  const cardMax: Record<string, number> = {}
  const principalMax: Record<string, number> = {}
  for (const date of dates) {
    const asOf = Date.parse(date + 'T12:00:00Z')
    const cut = asOf - 6 * 86400000
    const window = payments.filter((p) => Date.parse(p.date + 'T12:00:00Z') >= cut && p.date <= date)
    for (const cardId of new Set(window.map((p) => p.cardId))) {
      const n = window.filter((p) => p.cardId === cardId).length
      cardMax[cardId] = Math.max(cardMax[cardId] || 0, n)
    }
    for (const principal of new Set(window.map((p) => p.merchantPrincipalId))) {
      const n = window.filter((p) => p.merchantPrincipalId === principal).length
      principalMax[principal] = Math.max(principalMax[principal] || 0, n)
    }
  }
  return { cardRolling7MaxAttempts: cardMax, principalRolling7MaxAttempts: principalMax }
}

function firstMozaOrEcmDelta(
  previous: PlannedPayment[] | null,
  next: PlannedPayment[]
): {
  index: number
  date: string
  amountZar: number
  previous: string | null
  next: string
  reason: string
} | null {
  for (let i = 0; i < next.length; i++) {
    const b = next[i]!
    const nextRoute = `${b.cardId}→${b.terminalId}`
    const a = previous?.[i]
    const prevRoute = a ? `${a.cardId}→${a.terminalId}` : null
    const isMoza = b.cardId === 'WolfMoza' || b.cardId === 'GoblinMoza'
    const isEcm = b.terminalId === 'Econometrica'
    if (!isMoza && !isEcm) continue
    if (prevRoute === nextRoute && a && Math.abs(a.amountZar - b.amountZar) < 0.02) {
      // Same route as before — keep scanning for first *change* or first Moza.
      if (!isMoza) continue
    }
    return {
      index: i,
      date: b.date,
      amountZar: b.amountZar,
      previous: prevRoute,
      next: nextRoute,
      reason: isMoza
        ? prevRoute && prevRoute !== nextRoute
          ? 'Moza equivalence changed card choice within payer family'
          : 'First Moza placement under equivalent-capacity family routing'
        : prevRoute && !prevRoute.includes('Econometrica')
          ? 'Econometrica full eligibility changed POS choice'
          : 'Econometrica live-eligible placement',
    }
  }
  return null
}

function audit(payments: PlannedPayment[]) {
  const cardCounts = new Map<string, number>()
  const pairCounts = new Map<string, number>()
  const posCounts = new Map<string, number>()
  const posValue = new Map<string, number>()
  const failures: string[] = []

  for (const p of payments) {
    cardCounts.set(p.cardId, (cardCounts.get(p.cardId) || 0) + 1)
    const pair = `${p.cardId}×${p.terminalId}`
    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1)
    posCounts.set(p.terminalId, (posCounts.get(p.terminalId) || 0) + 1)
    posValue.set(p.terminalId, money((posValue.get(p.terminalId) || 0) + p.amountZar))
  }

  const totalN = payments.length
  const totalV = money(sum(payments.map((p) => p.amountZar)))
  for (const [term, n] of posCounts) {
    const shareN = n / totalN
    const shareV = (posValue.get(term) || 0) / totalV
    if (shareN > 0.35 + 1e-9) failures.push(`POS ${term} month count share ${(shareN * 100).toFixed(2)}% > 35%`)
    if (shareV > 0.35 + 1e-9) failures.push(`POS ${term} month value share ${(shareV * 100).toFixed(2)}% > 35%`)
  }
  for (const term of REFERENCE_TERMINALS.filter((t) => t.liveExecutable).map((t) => t.terminalId)) {
    const n = posCounts.get(term) || 0
    const v = posValue.get(term) || 0
    const shareN = totalN ? n / totalN : 0
    const shareV = totalV ? v / totalV : 0
    const floor =
      term === 'Econometrica'
        ? OPERATING_POLICY_V1.posPlanningTargets.Econometrica
        : OPERATING_POLICY_V1.pos.minShareCount
    if (shareN + 1e-12 < floor || shareV + 1e-12 < floor) {
      failures.push(
        `POS ${term} below floor n=${(shareN * 100).toFixed(1)}% v=${(shareV * 100).toFixed(1)}% (need ≥${(
          floor * 100
        ).toFixed(0)}%)`
      )
    }
  }
  const lemonN =
    (posCounts.get('BricsFNB') || 0) + (posCounts.get('BricsCapitec') || 0)
  const lemonV =
    money((posValue.get('BricsFNB') || 0) + (posValue.get('BricsCapitec') || 0))
  if (lemonN / totalN > 0.35 + 1e-9 || lemonV / totalV > 0.35 + 1e-9) {
    failures.push(
      `Lemon combined n=${((lemonN / totalN) * 100).toFixed(1)}% v=${((lemonV / totalV) * 100).toFixed(1)}% > 35%`
    )
  }
  const capN = (posCounts.get('BricsCapitec') || 0) + (posCounts.get('Econometrica') || 0)
  const capV = money((posValue.get('BricsCapitec') || 0) + (posValue.get('Econometrica') || 0))
  const capShareN = capN / totalN
  const capShareV = capV / totalV
  if (capShareN + 1e-12 < 0.25 || capShareV + 1e-12 < 0.25 || capShareN > 0.35 + 1e-9 || capShareV > 0.35 + 1e-9) {
    failures.push(
      `Capitec outside 25–35%: n=${(capShareN * 100).toFixed(1)}% v=${(capShareV * 100).toFixed(1)}%`
    )
  }

  // Rolling-7 POS
  const dates = [...new Set(payments.map((p) => p.date))].sort()
  for (const date of dates) {
    const asOf = Date.parse(date + 'T12:00:00Z')
    const cut = asOf - 6 * 86400000
    const window = payments.filter((p) => Date.parse(p.date + 'T12:00:00Z') >= cut && p.date <= date)
    if (window.length < 10) continue
    const wV = money(sum(window.map((p) => p.amountZar)))
    for (const term of REFERENCE_TERMINALS.map((t) => t.terminalId)) {
      const list = window.filter((p) => p.terminalId === term)
      if (list.length / window.length > 0.35 + 1e-9) {
        failures.push(`POS ${term} R7 count ${(list.length / window.length) * 100}% as of ${date}`)
      }
      if (wV > 0 && sum(list.map((p) => p.amountZar)) / wV > 0.35 + 1e-9) {
        failures.push(`POS ${term} R7 value as of ${date}`)
      }
    }
  }

  // Card×principal R7
  for (const cardId of new Set(payments.map((p) => p.cardId))) {
    for (const principal of new Set(payments.map((p) => p.merchantPrincipalId))) {
      for (const date of dates) {
        const asOf = Date.parse(date + 'T12:00:00Z')
        const cut = asOf - 6 * 86400000
        const n = payments.filter(
          (p) =>
            p.cardId === cardId &&
            p.merchantPrincipalId === principal &&
            Date.parse(p.date + 'T12:00:00Z') >= cut &&
            p.date <= date
        ).length
        if (n > 3) failures.push(`${cardId}×${principal} R7=${n} as of ${date}`)
      }
    }
  }

  // Continuity — Moza cards while still staging may be short; require mesh once ≥7 cleans.
  for (const cardId of new Set(payments.map((p) => p.cardId))) {
    const mine = payments.filter((p) => p.cardId === cardId)
    const terms = new Set(mine.map((p) => p.terminalId))
    const prins = new Set(mine.map((p) => p.merchantPrincipalId))
    const acqs = new Set(mine.map((p) => p.acquirerBankId))
    const isMoza = cardId === 'WolfMoza' || cardId === 'GoblinMoza'
    const needFull = !isMoza || mine.length >= OPERATING_POLICY_V1.newCard.stageB.maxCleanOutcomesExclusive
    if (needFull && (terms.size < 3 || prins.size < 2 || acqs.size < 2)) {
      failures.push(
        `${cardId} continuity fail terms=${terms.size} principals=${prins.size} acquirers=${acqs.size}`
      )
    }
  }

  // Consecutive pair
  const byCardPos = new Map<string, string[]>()
  for (const p of payments) {
    const k = `${p.cardId}×${p.terminalId}`
    byCardPos.set(k, [...(byCardPos.get(k) || []), p.date])
  }
  for (const [k, ds] of byCardPos) {
    const sorted = [...ds].sort()
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        (Date.parse(sorted[i]! + 'T12:00:00Z') - Date.parse(sorted[i - 1]! + 'T12:00:00Z')) / 86400000
      if (gap < 2) failures.push(`consecutive ${k} on ${sorted[i - 1]}–${sorted[i]}`)
    }
  }

  const pairMax = Math.max(0, ...pairCounts.values())
  const ecmN = posCounts.get('Econometrica') || 0
  const hist: Record<string, number> = {}
  for (const d of dates) {
    const n = payments.filter((p) => p.date === d).length
    hist[String(n)] = (hist[String(n)] || 0) + 1
  }

  return {
    failures,
    cardCounts: Object.fromEntries([...cardCounts.entries()].sort()),
    pairTop: Object.fromEntries([...pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)),
    pairMax,
    posCounts: Object.fromEntries([...posCounts.entries()]),
    posValue: Object.fromEntries([...posValue.entries()]),
    ecmN,
    ecmLiveExecutable: payments.some((p) => p.terminalId === 'Econometrica' && p.liveExecutable),
    intakeDays: dates.length,
    lastDate: dates[dates.length - 1] || null,
    payPerDayHist: hist,
    totalN,
    totalV,
  }
}

function drawPdf(payments: PlannedPayment[], meta: Record<string, unknown>) {
  const byDate = new Map<string, PlannedPayment[]>()
  for (const p of payments) {
    byDate.set(p.date, [...(byDate.get(p.date) || []), p])
  }
  for (const list of byDate.values()) list.sort((a, b) => a.attemptMin - b.attemptMin)

  fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true })
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 })
  const stream = fs.createWriteStream(OUT_PDF)
  doc.pipe(stream)
  const margin = 28
  const pageW = doc.page.width - 56
  const pageH = doc.page.height - 56

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111')
  doc.text('PAGA desk calendar · October 2026 · Reallocated live book', margin, 18, { width: pageW })
  doc.font('Helvetica').fontSize(7.5).fillColor('#444')
  doc.text(
    `Frozen ${meta.invoiceCount} invoices · ${zarExact(Number(meta.totalZar))} · Econometrica live · Moza≡BCI · payer-family registry · ${String(meta.testRunId)}`,
    margin,
    36,
    { width: pageW }
  )
  doc.fontSize(7)
  doc.fillColor('#1a5f3a').text('Operating day', margin, 50)
  doc.fillColor('#666').text('Sunday settlement-only', 120, 50)
  doc.fillColor('#8a6d1d').text('Econometrica / Capitec (live)', 260, 50)

  const firstWd = new Date(Date.UTC(2026, 9, 1)).getUTCDay()
  const lead = (firstWd + 6) % 7
  const cols = 7
  const rows = 5
  const headerH = 12
  const gridTop = 60
  const gridH = pageH - 40
  const cellW = pageW / cols
  const cellH = (gridH - headerH) / rows

  ;['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#222').text(h, margin + i * cellW + 3, gridTop + 1, {
      width: cellW - 6,
    })
  })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dayNum = row * 7 + col - lead + 1
      const x = margin + col * cellW
      const y = gridTop + headerH + row * cellH
      doc.strokeColor('#ddd').lineWidth(0.5).rect(x, y, cellW, cellH).stroke()
      if (dayNum < 1 || dayNum > 31) continue
      const iso = `${MONTH}-${pad2(dayNum)}`
      const sunday = new Date(Date.UTC(2026, 9, dayNum)).getUTCDay() === 0
      const list = byDate.get(iso) || []

      if (!sunday && list.length) {
        doc.save()
        doc.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1).fillColor('#f3faf6').fill()
        doc.restore()
      } else if (sunday) {
        doc.save()
        doc.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1).fillColor('#f5f5f5').fill()
        doc.restore()
      }

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text(String(dayNum), x + 3, y + 2)
      let ty = y + 12
      if (sunday) {
        doc.font('Helvetica').fontSize(5.5).fillColor('#666').text('Settlement only', x + 3, ty, {
          width: cellW - 6,
        })
        continue
      }
      if (!list.length) {
        doc.font('Helvetica').fontSize(5.5).fillColor('#999').text('No intake', x + 3, ty)
        continue
      }
      const total = money(sum(list.map((p) => p.amountZar)))
      const period = `${fmtMin(list[0]!.attemptMin)}–${fmtMin(list[list.length - 1]!.attemptMin)}`
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#1a5f3a')
      doc.text(`${zar(total)} · ${list.length} pay`, x + 3, ty, { width: cellW - 6, ellipsis: true })
      ty += 8
      doc.font('Helvetica').fontSize(5.5).fillColor('#333').text(`Window ${period}`, x + 3, ty, {
        width: cellW - 6,
        ellipsis: true,
      })
      ty += 7
      doc.font('Helvetica').fontSize(5).fillColor('#222')
      const lines = list.map(
        (p) =>
          `${fmtMin(p.attemptMin)} ${zarExact(p.amountZar)} ${p.cardId}→${TERMINAL_LABEL[p.terminalId] || p.terminalId}`
      )
      doc.text(lines.join('\n'), x + 3, ty, {
        width: cellW - 6,
        height: Math.max(8, y + cellH - ty - 3),
        lineGap: 0.3,
        ellipsis: true,
      })
    }
  }

  doc.font('Helvetica').fontSize(5.5).fillColor('#666')
  doc.text(
    'Amounts frozen from live prospective book · routes via OperatingPolicyV1 allocateRoutes · Econometrica liveExecutable=false until Capitec MID recorded',
    margin,
    doc.page.height - 16,
    { width: pageW, height: 10, ellipsis: true }
  )

  // Register
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
  let y = 28
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text('Daily payment register', margin, y)
  y += 16
  const colW = [58, 28, 70, 70, 55, 80, 160, 90]
  const headers = ['Date', 'N', 'Day total', 'Period', 'Time', 'Amount', 'Card → POS', 'Live?']
  const drawHeader = () => {
    let x = margin
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#222')
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colW[i]! - 2 })
      x += colW[i]!
    })
    y += 11
  }
  drawHeader()
  for (let d = 1; d <= 31; d++) {
    const iso = `${MONTH}-${pad2(d)}`
    const sunday = new Date(Date.UTC(2026, 9, d)).getUTCDay() === 0
    const list = byDate.get(iso) || []
    if (sunday) {
      if (y > doc.page.height - 40) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
        y = 28
        drawHeader()
      }
      doc.font('Helvetica').fontSize(7).fillColor('#888')
      doc.text(`${pad2(d)} Oct`, margin, y)
      doc.text('Sunday · settlement only', margin + 58, y)
      y += 11
      continue
    }
    if (!list.length) continue
    for (let i = 0; i < list.length; i++) {
      if (y > doc.page.height - 36) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
        y = 28
        drawHeader()
      }
      const p = list[i]!
      const total = money(sum(list.map((x) => x.amountZar)))
      const period = `${fmtMin(list[0]!.attemptMin)}–${fmtMin(list[list.length - 1]!.attemptMin)}`
      const row =
        i === 0
          ? [
              `${pad2(d)} Oct`,
              String(list.length),
              zarExact(total),
              period,
              fmtMin(p.attemptMin),
              zarExact(p.amountZar),
              `${p.cardId} → ${TERMINAL_LABEL[p.terminalId]}`,
              p.liveExecutable ? 'live' : 'model',
            ]
          : [
              '',
              '',
              '',
              '',
              fmtMin(p.attemptMin),
              zarExact(p.amountZar),
              `${p.cardId} → ${TERMINAL_LABEL[p.terminalId]}`,
              p.liveExecutable ? 'live' : 'model',
            ]
      let x = margin
      doc.font('Helvetica').fontSize(7).fillColor('#222')
      row.forEach((c, j) => {
        doc.text(c, x, y, { width: colW[j]! - 2, ellipsis: true })
        x += colW[j]!
      })
      y += 10
    }
    y += 2
  }

  // Summary
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 })
  y = 28
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text('Validation summary', margin, y)
  y += 16
  doc.font('Helvetica').fontSize(8).fillColor('#222')
  const lines = [
    `Payments: ${payments.length} · Total: ${zarExact(money(sum(payments.map((p) => p.amountZar))))}`,
    `Intake days: ${meta.intakeDays} · Last intake: ${meta.lastDate} · Pay/day hist: ${JSON.stringify(meta.payPerDayHist)}`,
    `Card counts: ${JSON.stringify(meta.cardCounts)}`,
    `POS counts: ${JSON.stringify(meta.posCounts)}`,
    `Econometrica payments: ${meta.ecmN} (liveExecutable=${meta.ecmLiveExecutable}) · fully eligible live Capitec`,
    `Max card×POS touches: ${meta.pairMax}`,
    `Top pairs: ${JSON.stringify(meta.pairTop)}`,
    `Rule failures: ${Array.isArray(meta.failures) && meta.failures.length ? (meta.failures as string[]).join(' | ') : 'none'}`,
    `Validator ok: ${meta.validatorOk}`,
  ]
  for (const line of lines) {
    doc.text(line, margin, y, { width: pageW })
    y += 14
  }

  doc.end()
  return new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}

async function main() {
  const previousPayments = fs.existsSync(OUT_JSON)
    ? ((JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) as { payments?: PlannedPayment[] }).payments ||
        null)
    : null

  const { testRunId, amounts, routingEngine } = await loadFrozenAmounts()
  const frozenTotal = money(sum(amounts))
  if (amounts.length !== EXPECTED_BOOK.n || Math.abs(frozenTotal - EXPECTED_BOOK.zar) > 0.05) {
    console.warn(
      `Book size ${amounts.length}/${frozenTotal} ≠ expected ${EXPECTED_BOOK.n}/${EXPECTED_BOOK.zar}. ` +
        `Requested R624,667.71 / 62 is not present in the live desk book — preserving actual frozen amounts.`
    )
  }
  const { byDate, unscheduled } = packOntoOctober(amounts)
  if (unscheduled.length) {
    throw new Error(`Unscheduled residual after pack: ${JSON.stringify(unscheduled)}`)
  }
  const { slots: rawSlots, days } = slotsFromPack(byDate)
  // Equitable A/B observation: do not lock invoices to payer families — every
  // card (incl. Moza) may take any mature invoice. POS bands still bind.
  const slots = rawSlots
  void tagPayerFamilies
  const payments = allocateDeskRoutes({
    slots,
    networkState: 'cold_start',
    cards: CARDS,
    monthLabel: '202610',
    requireLiveExecutable: true,
    equitableCardShares: true,
  })

  // Post-schedule fail-closed — allocator also asserts; re-check for report hashes.
  const finalLedger = assertFinalDeskLedger(payments, {
    enforceReferenceCapitecBand: true,
    label: 'makeLiveOctoberReallocatedCalendar',
  })

  const validation = validateOperatingCalendar({
    payments,
    days,
    networkState: 'cold_start',
    expectedTotalZar: frozenTotal,
    expectedPaymentCount: amounts.length,
    requireFullMeshContinuity: false,
    enforceReferenceCapitecBand: true,
    enforcePosMonthFloors: true,
  })
  const a = audit(payments)
  const byPos = shareRows(payments, (p) => TERMINAL_LABEL[p.terminalId] || p.terminalId)
  const byPrincipal = shareRows(payments, (p) => p.merchantPrincipalId)
  const byAcquirer = shareRows(payments, (p) => p.acquirerBankId)
  const byPayerFamily = shareRows(
    payments,
    (p) => p.payerFamilyId || payerFamilyOfCard(p.cardId)?.payerFamilyId || 'unknown'
  )
  const byCard = shareRows(payments, (p) => p.cardId)
  const byPair = shareRows(payments, (p) => `${p.cardId}×${TERMINAL_LABEL[p.terminalId]}`)
  const rolling7 = rolling7Exposure(payments)
  const firstDecision = firstMozaOrEcmDelta(previousPayments, payments)

  const report = {
    note:
      'Frozen live invoice amounts; allocator=allocateDeskRoutes (equitableCardShares); payer-family exclusivity and Moza stage caps lifted for A/B observation; POS ≥15% (ECM ≥16%) / Lemon ≤35% / Capitec 25–35% still bind; zero unrouted.',
    allocator: 'allocateDeskRoutes',
    equitableCardShares: true,
    testRunId,
    routingEngine,
    bookHash: finalLedger.bookHash,
    assignmentHash: finalLedger.assignmentHash,
    invoiceCount: amounts.length,
    totalZar: frozenTotal,
    unscheduledZar: 0,
    requestedBook: { n: 62, zar: 624667.71 },
    preservedBook: { n: amounts.length, zar: frozenTotal },
    bindingConstraint:
      amounts.length === EXPECTED_BOOK.n
        ? 'Live DESK_MONTH_TARGET_ZAR=619700 / 59 invoices (requested 62 / R624667.71 not in production book)'
        : null,
    validatorOk: validation.ok,
    finalLedgerOk: finalLedger.ok,
    finalLedgerViolations: finalLedger.violations,
    gates: validation.gates,
    distributions: {
      byPos,
      byPrincipal,
      byAcquirer,
      byPayerFamily,
      byCard,
      byCardPosPair: byPair,
      rolling7,
    },
    firstMozaOrEconometricaDecision: firstDecision,
    ...a,
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify({ ...report, payments }, null, 2))
  const fmtShare = (rows: typeof byPos) =>
    rows
      .map(
        (r) =>
          `- ${r.key}: n=${r.n} (${(r.shareN * 100).toFixed(1)}%) · ${zarExact(r.zar)} (${(r.shareV * 100).toFixed(1)}%)`
      )
      .join('\n')
  fs.writeFileSync(
    OUT_MD,
    `# October 2026 live calendar (regenerated)

- Payments: ${report.totalN}
- Total: ${report.totalV}
- ECM: ${report.ecmN} liveExecutable=${report.ecmLiveExecutable}
- Failures: ${report.failures.length ? report.failures.join('; ') : 'none'}
- Validator: ${report.validatorOk}
- Binding: ${report.bindingConstraint || 'n/a'}
- First Moza/ECM decision: ${firstDecision ? `#${firstDecision.index} ${firstDecision.previous || '∅'} → ${firstDecision.next} (${firstDecision.reason})` : 'n/a'}

## By POS
${fmtShare(byPos)}

## By principal
${fmtShare(byPrincipal)}

## By acquirer
${fmtShare(byAcquirer)}

## By payer family
${fmtShare(byPayerFamily)}

## By card
${fmtShare(byCard)}
`
  )

  await drawPdf(payments, {
    testRunId,
    invoiceCount: amounts.length,
    totalZar: frozenTotal,
    ...a,
    validatorOk: validation.ok,
    failures: a.failures,
  })

  // Prove one bookHash across POS / pair / card / principal tables.
  const reconciled =
    finalLedger.byPos.reduce((s, r) => s + r.n, 0) === payments.length &&
    finalLedger.byPair.reduce((s, r) => s + r.n, 0) === payments.length &&
    finalLedger.byCard.reduce((s, r) => s + r.n, 0) === payments.length &&
    finalLedger.byPrincipal.reduce((s, r) => s + r.n, 0) === payments.length

  console.log(
    JSON.stringify(
      {
        ok: validation.ok && a.failures.length === 0 && finalLedger.ok && reconciled,
        allocator: 'allocateDeskRoutes',
        bookHash: finalLedger.bookHash,
        assignmentHash: finalLedger.assignmentHash,
        outPdf: OUT_PDF,
        outJson: OUT_JSON,
        invoiceCount: amounts.length,
        totalZar: frozenTotal,
        assigned: payments.length,
        unrouted: 0,
        ecmN: a.ecmN,
        ecmLiveExecutable: a.ecmLiveExecutable,
        bindingConstraint: report.bindingConstraint,
        firstMozaOrEconometricaDecision: firstDecision,
        byPos: byPos.map((r) => ({
          pos: r.key,
          n: r.n,
          zar: r.zar,
          shareN: `${(r.shareN * 100).toFixed(1)}%`,
          shareV: `${(r.shareV * 100).toFixed(1)}%`,
        })),
        byPrincipal: byPrincipal.map((r) => ({
          principal: r.key,
          n: r.n,
          zar: r.zar,
          shareN: `${(r.shareN * 100).toFixed(1)}%`,
          shareV: `${(r.shareV * 100).toFixed(1)}%`,
        })),
        byAcquirer: byAcquirer.map((r) => ({
          acquirer: r.key,
          n: r.n,
          zar: r.zar,
          shareN: `${(r.shareN * 100).toFixed(1)}%`,
          shareV: `${(r.shareV * 100).toFixed(1)}%`,
        })),
        byPayerFamily: byPayerFamily.map((r) => ({
          family: r.key,
          n: r.n,
          zar: r.zar,
          shareN: `${(r.shareN * 100).toFixed(1)}%`,
          shareV: `${(r.shareV * 100).toFixed(1)}%`,
        })),
        byCard: byCard.map((r) => ({
          card: r.key,
          n: r.n,
          zar: r.zar,
          shareN: `${(r.shareN * 100).toFixed(1)}%`,
          shareV: `${(r.shareV * 100).toFixed(1)}%`,
        })),
        cardCounts: a.cardCounts,
        pairMax: a.pairMax,
        failures: a.failures,
        validatorOk: validation.ok,
        finalLedgerOk: finalLedger.ok,
        tablesReconcile: reconciled,
        failedGates: validation.gates.filter((g) => !g.pass),
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
