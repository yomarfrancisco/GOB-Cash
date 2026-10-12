/**
 * Forward-only October successor plan on the live desk window.
 *
 * - Carries completed days / residuals / evidence unchanged
 * - Rebuilds only from the next unexecuted day
 * - Preserves DESK_MONTH_TARGET_ZAR (R619,700) as the book total
 * - Front-loads Moza cold-start ladders (2×7 cleans) in the remaining inventory
 * - Does not split invoices or fabricate historical payments
 *
 * Run (with ADC):
 *   cd functions && GOOGLE_APPLICATION_CREDENTIALS=... npx ts-node --transpile-only scripts/deployOctoberSuccessorPlan.ts
 */
import * as admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import { ROUTING_ADMIN_UID } from '../src/routing/conversionRouter'
import { DESK_MONTH_TARGET_ZAR, DESK_MONTH_HORIZON_DAYS } from '../src/routing/deskMonth'
import {
  hydrateWindow,
  persistWindow,
  ROUTING_ENGINE_ID,
  assignmentsFromRoutes,
  KERNEL_SEED,
} from '../src/routing/throughputPlan'
import { bookTotalZar, rebuildRemainingBook } from '../src/throughput/model/prospectiveBook'
import { prospectiveScenario, runProspectiveDay } from '../src/throughput/prospective/runDay'
import { nextDayAfter, horizonOf, type ProspectiveBranch } from '../src/throughput/prospective/types'
import { roundMoney, sum } from '../src/throughput/model/math'
import { OPERATING_POLICY_V1 } from '../src/operatingCalendar/operatingPolicyV1'
import { residualTickets, mergeDayTickets } from '../src/throughput/prospective/outcomes'
import type { SimState } from '../src/throughput/model/types'
import { emptyRolling } from '../src/throughput/model/rolling'

/** Expand carried evidence mesh with Moza cards + Econometrica POS without rewriting history. */
function ensureLiveMesh(state: SimState | null | undefined, installedOnDay: number): SimState | null {
  if (!state) return null
  const next = structuredClone(state)
  const addCard = (index: number, name: string) => {
    if (next.cards.some((c) => c.id === `card-${index}` || c.name === name)) return
    next.cards.push({
      id: `card-${index}`,
      name,
      kind: 'card',
      installedOnDay,
      daysActive: 0,
      lifetimeCount: 0,
      lifetimeVolume: 0,
      activeTradingDays: 0,
      cleanHistoryDays: 0,
      interruptionCount: 0,
      downUntilDay: null,
      frozenCapital: 0,
      coreVolume: 0,
      organicRevenueVolume: 0,
      organicExpenseVolume: 0,
      importedHistoryVolume: 0,
      coreTransactionCount: 0,
      organicTransactionCount: 0,
      importedHistoryCount: 0,
      rolling: emptyRolling(),
      consecutiveOperatingActiveDays: 0,
      cardOrigin: 'international',
    })
  }
  const addPos = (index: number, name: string) => {
    if (next.pos.some((p) => p.id === `pos-${index}`)) return
    next.pos.push({
      id: `pos-${index}`,
      name,
      kind: 'pos',
      installedOnDay,
      daysActive: 0,
      lifetimeCount: 0,
      lifetimeVolume: 0,
      activeTradingDays: 0,
      cleanHistoryDays: 0,
      interruptionCount: 0,
      downUntilDay: null,
      frozenCapital: 0,
      coreVolume: 0,
      organicRevenueVolume: 0,
      organicExpenseVolume: 0,
      importedHistoryVolume: 0,
      coreTransactionCount: 0,
      organicTransactionCount: 0,
      importedHistoryCount: 0,
      rolling: emptyRolling(),
      consecutiveOperatingActiveDays: 0,
      pinCapableFlow: true,
      cardPresentFlow: true,
    })
  }
  // Desk inventory: 7=WolfMoza, 8=GoblinMoza, machine 5=Econometrica.
  addCard(7, 'WolfMoza')
  addCard(8, 'GoblinMoza')
  addPos(5, 'Econometrica')
  return next
}

const PROJECT = 'gobankless-dev'
const OUT = path.resolve(process.cwd(), '../tmp/october-2026-successor-plan.json')

function money(n: number) {
  return Math.round(n * 100) / 100
}

function initAdmin() {
  if (admin.apps.length) return
  const adc =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(
      process.env.HOME || '',
      '.config/firebase/ygor_francisco_gmail.com_application_default_credentials.json'
    )
  if (fs.existsSync(adc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adc
  }
  admin.initializeApp({ projectId: PROJECT })
}

async function main() {
  initAdmin()
  const db = admin.firestore()
  const uid = ROUTING_ADMIN_UID
  const cur = await db.collection('adminConversionCurrent').doc(uid).get()
  const testRunId = String(cur.data()?.testRunId || '')
  if (!testRunId) throw new Error('No active desk run pointer')

  const ref = db.collection('adminConversionTests').doc(testRunId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`Missing test run ${testRunId}`)
  const data = snap.data() || {}
  const priorEngine = String(data.routingEngine || '')
  let window = hydrateWindow(data.throughputWindow) as ProspectiveBranch | undefined
  if (!window) throw new Error('Active run has no throughputWindow')

  const completedThroughDay = Number(window.completedThroughDay || 0)
  const fromDay = nextDayAfter(completedThroughDay, horizonOf(window)) ?? completedThroughDay + 1
  if (!(fromDay >= 1)) throw new Error(`No remaining days after completedThroughDay=${completedThroughDay}`)

  const existingBook = window.snapshot.book || {}
  const sealedZar = money(
    sum(
      Object.entries(existingBook)
        .filter(([d]) => Number(d) < fromDay)
        .flatMap(([, tickets]) => (tickets || []).map((t) => Number(t.amount) || 0))
    )
  )
  const remainingZar = money(DESK_MONTH_TARGET_ZAR - sealedZar)
  if (remainingZar < 0) {
    throw new Error(
      `Sealed ZAR ${sealedZar} already exceeds book total ${DESK_MONTH_TARGET_ZAR} — will not fabricate or rewrite history`
    )
  }

  const scenario = prospectiveScenario({
    seed: window.seed || KERNEL_SEED,
    availableZar: remainingZar > 0 ? remainingZar : DESK_MONTH_TARGET_ZAR,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })

  const rebuiltBook = rebuildRemainingBook({
    scenario,
    availableZar: remainingZar,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
    fromDay,
    existing: existingBook,
  })

  // Carry open residuals into the next operating day (no fabricated history).
  const residuals = residualTickets(window)
  if (residuals.length && rebuiltBook[fromDay]) {
    rebuiltBook[fromDay] = mergeDayTickets(rebuiltBook[fromDay]!, residuals)
  }

  // Re-pin Moza cold-start inventory onto the earliest future operating days
  // (does not touch sealed days; does not invent new ZAR — only reorders future tickets).
  {
    const stageB = OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar
    const rampNeed = OPERATING_POLICY_V1.newCard.stageB.maxCleanOutcomesExclusive * 2
    const futureDays = Array.from({ length: DESK_MONTH_HORIZON_DAYS }, (_, i) => i + 1).filter(
      (d) => d >= fromDay && ((d - 1) % 7) + 1 !== 7 // not Sunday in day-index model: day%7===0
    )
    // Prospective book uses calendar day numbers with weekends empty already.
    const operatingFuture = Array.from({ length: DESK_MONTH_HORIZON_DAYS }, (_, i) => i + 1).filter(
      (d) => d >= fromDay && (rebuiltBook[d]?.length || 0) >= 0 && d % 7 !== 0
    )
    const pool: Array<{ amount: number; timeMinutes: number; economicPaymentId: string; supportingInvoicePresent: boolean }> =
      []
    for (const d of operatingFuture) {
      const keep: typeof pool = []
      for (const t of rebuiltBook[d] || []) {
        if (t.amount <= stageB + 1e-9 && pool.length < rampNeed) pool.push({ ...t })
        else keep.push({ ...t })
      }
      rebuiltBook[d] = keep as never
    }
    // Place one stage ticket per early day (spread across both Moza ladders).
    let pi = 0
    for (const d of operatingFuture) {
      if (pi >= pool.length) break
      const dayTickets = [...(rebuiltBook[d] || [])]
      const ceiling =
        d <= OPERATING_POLICY_V1.network.coldNetworkDays
          ? OPERATING_POLICY_V1.network.coldDailyCeilingZar
          : OPERATING_POLICY_V1.network.establishedDailyCeilingZar
      const daySum = money(sum(dayTickets.map((t) => t.amount)))
      const next = pool[pi]!
      if (
        dayTickets.length < OPERATING_POLICY_V1.network.maxAttemptsPerOperatingDay &&
        daySum + next.amount <= ceiling + 0.05
      ) {
        dayTickets.unshift({
          ...next,
          timeMinutes: 9 * 60 + 20,
          economicPaymentId: `pro:${d}:moza-ramp-${pi + 1}`,
        })
        rebuiltBook[d] = dayTickets as never
        pi += 1
      }
    }
    // Any unused ramp tickets return to the first future day with room.
    while (pi < pool.length) {
      const next = pool[pi]!
      let placed = false
      for (const d of operatingFuture) {
        const dayTickets = [...(rebuiltBook[d] || [])]
        const ceiling =
          d <= OPERATING_POLICY_V1.network.coldNetworkDays
            ? OPERATING_POLICY_V1.network.coldDailyCeilingZar
            : OPERATING_POLICY_V1.network.establishedDailyCeilingZar
        const daySum = money(sum(dayTickets.map((t) => t.amount)))
        if (
          dayTickets.length < OPERATING_POLICY_V1.network.maxAttemptsPerOperatingDay &&
          daySum + next.amount <= ceiling + 0.05
        ) {
          dayTickets.push({
            ...next,
            timeMinutes: 15 * 60 + 5,
            economicPaymentId: `pro:${d}:moza-ramp-${pi + 1}`,
          })
          rebuiltBook[d] = dayTickets as never
          placed = true
          break
        }
      }
      if (!placed) break
      pi += 1
    }
    void futureDays
  }

  const total = bookTotalZar(rebuiltBook)
  // Trim/pad only future days to hit R619,700 exactly without touching sealed days.
  let drift = money(DESK_MONTH_TARGET_ZAR - total)
  if (Math.abs(drift) > 0.05) {
    const futureDays = Object.keys(rebuiltBook)
      .map(Number)
      .filter((d) => d >= fromDay)
      .sort((a, b) => a - b)
    if (drift > 0 && futureDays.length) {
      // Add a genuine residual invoice on the last future day with room (≤ R15k).
      const last = futureDays[futureDays.length - 1]!
      const dayTickets = rebuiltBook[last] || []
      const daySum = money(sum(dayTickets.map((t) => t.amount)))
      const room = Math.min(
        OPERATING_POLICY_V1.payment.maxAmountZar,
        OPERATING_POLICY_V1.network.establishedDailyCeilingZar - daySum
      )
      const add = money(Math.min(drift, room))
      if (add >= 1) {
        dayTickets.push({
          amount: add,
          timeMinutes: 15 * 60 + 10,
          economicPaymentId: `pro:${last}:successor-trim`,
          supportingInvoicePresent: true,
        })
        rebuiltBook[last] = dayTickets
        drift = money(drift - add)
      }
    } else if (drift < 0 && futureDays.length) {
      // Shrink the last future invoice only (never split / never touch sealed).
      for (let i = futureDays.length - 1; i >= 0 && drift < -0.05; i--) {
        const d = futureDays[i]!
        const dayTickets = [...(rebuiltBook[d] || [])]
        if (!dayTickets.length) continue
        const last = dayTickets[dayTickets.length - 1]!
        const reducible = money(last.amount - 1)
        const cut = money(Math.min(reducible, -drift))
        if (cut >= 0.01) {
          last.amount = money(last.amount - cut)
          dayTickets[dayTickets.length - 1] = last
          rebuiltBook[d] = dayTickets
          drift = money(drift + cut)
        }
      }
    }
  }

  const finalTotal = bookTotalZar(rebuiltBook)
  if (Math.abs(finalTotal - DESK_MONTH_TARGET_ZAR) > 0.05) {
    throw new Error(
      `Could not preserve R${DESK_MONTH_TARGET_ZAR} (got ${finalTotal}, sealed=${sealedZar}, remaining target=${remainingZar})`
    )
  }

  const expandedState = ensureLiveMesh(window.snapshot.endingState, fromDay)

  // Preview first future day routes to report Econometrica / Moza placements.
  const preview = runProspectiveDay({
    day: fromDay,
    availableZar: remainingZar,
    tickets: rebuiltBook[fromDay] || [],
    seed: window.seed || KERNEL_SEED,
    previousState: expandedState,
    initialCards: 8,
    initialPos: 5,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })

  const nextWindow: ProspectiveBranch = {
    ...window,
    availableZar: remainingZar,
    openingAmountZar: DESK_MONTH_TARGET_ZAR,
    snapshot: {
      ...window.snapshot,
      book: rebuiltBook,
      endingState: expandedState,
      // Keep residuals / shocks / days history intact — do not fabricate sealed days.
      residuals: (window.snapshot.residuals || []).map((r) =>
        r.status === 'open' ? { ...r, status: 'rerouted' as const } : r
      ),
      shocks: [
        ...(window.snapshot.shocks || []),
        {
          kind: 'capital',
          day: fromDay,
          amountZar: remainingZar,
          at: new Date().toISOString(),
          rewind: false,
        },
      ],
    },
  }

  const now = admin.firestore.Timestamp.now()
  await ref.set(
    {
      throughputWindow: persistWindow(nextWindow),
      authorisedZar: DESK_MONTH_TARGET_ZAR,
      availableCapital: remainingZar,
      routingEngine: ROUTING_ENGINE_ID,
      successorPlan: {
        fromDay,
        completedThroughDay,
        sealedZar,
        remainingZar,
        bookTotalZar: finalTotal,
        mozaColdStartLadders: 2,
        priorEngine,
        at: now,
        note: 'Forward-only successor · Moza 2×7 cold-start inventory · Econometrica live · R619700 preserved',
      },
      updatedAt: now,
    },
    { merge: true }
  )

  // Scan rebuilt future tickets + first-day routes for reporting.
  const futureTickets: Array<{ day: number; amount: number; economicPaymentId?: string }> = []
  for (let d = fromDay; d <= DESK_MONTH_HORIZON_DAYS; d++) {
    for (const t of rebuiltBook[d] || []) {
      futureTickets.push({ day: d, amount: t.amount, economicPaymentId: t.economicPaymentId })
    }
  }
  const stageB = OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar
  const smallFuture = futureTickets.filter((t) => t.amount <= stageB + 1e-9)

  type Hit = {
    day: number
    cardId: number
    machineId: number
    amount: number
    cardName?: string
    railLabel?: string
    economicPaymentId?: string
  }
  const asHit = (day: number, a: ReturnType<typeof assignmentsFromRoutes>[number]): Hit => ({
    day,
    cardId: a.cardId,
    machineId: a.machineId,
    amount: a.amount,
    cardName: a.cardName,
    railLabel: a.railLabel,
    economicPaymentId: a.economicPaymentId,
  })

  const pickEcm = (day: number, assigns: ReturnType<typeof assignmentsFromRoutes>) => {
    const hit = assigns.find(
      (a) => a.machineId === 5 || /econometrica/i.test(String(a.railLabel || ''))
    )
    return hit ? asHit(day, hit) : null
  }
  const pickMoza = (day: number, assigns: ReturnType<typeof assignmentsFromRoutes>, which: 'WolfMoza' | 'GoblinMoza') => {
    const id = which === 'WolfMoza' ? 7 : 8
    const hit = assigns.find(
      (a) => a.cardId === id || String(a.cardName || '').toLowerCase() === which.toLowerCase()
    )
    return hit ? asHit(day, hit) : null
  }

  let walkEcm = pickEcm(fromDay, assignmentsFromRoutes((preview.record.routes || []) as never))
  let walkWolfMoza = pickMoza(
    fromDay,
    assignmentsFromRoutes((preview.record.routes || []) as never),
    'WolfMoza'
  )
  let walkGoblinMoza = pickMoza(
    fromDay,
    assignmentsFromRoutes((preview.record.routes || []) as never),
    'GoblinMoza'
  )
  let state = preview.endingState
  let avail = preview.availableZar
  for (let d = fromDay + 1; d <= DESK_MONTH_HORIZON_DAYS && (!walkEcm || !walkWolfMoza || !walkGoblinMoza); d++) {
    const tickets = rebuiltBook[d] || []
    if (!tickets.length) continue
    const ran = runProspectiveDay({
      day: d,
      availableZar: avail,
      tickets,
      seed: window.seed || KERNEL_SEED,
      previousState: state,
      initialCards: 8,
      initialPos: 5,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    const assigns = assignmentsFromRoutes((ran.record.routes || []) as never)
    if (!walkEcm) walkEcm = pickEcm(d, assigns)
    if (!walkWolfMoza) walkWolfMoza = pickMoza(d, assigns, 'WolfMoza')
    if (!walkGoblinMoza) walkGoblinMoza = pickMoza(d, assigns, 'GoblinMoza')
    state = ran.endingState
    avail = ran.availableZar
  }

  const report = {
    testRunId,
    routingEngine: ROUTING_ENGINE_ID,
    completedThroughDay,
    fromDay,
    sealedZar,
    remainingZar,
    bookTotalZar: finalTotal,
    futureInvoiceCount: futureTickets.length,
    mozaEligibleSmallInvoicesInFuture: smallFuture.length,
    mozaColdStartLadders: 2,
    firstFutureEconometrica: walkEcm,
    firstFutureWolfMoza: walkWolfMoza,
    firstFutureGoblinMoza: walkGoblinMoza,
    note: 'Forward-only successor persisted to adminConversionTests.throughputWindow',
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
