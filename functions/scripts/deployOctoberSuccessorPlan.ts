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

  // Preview first future day routes to report Econometrica / Moza placements.
  const preview = runProspectiveDay({
    day: fromDay,
    availableZar: remainingZar,
    tickets: rebuiltBook[fromDay] || [],
    seed: window.seed || KERNEL_SEED,
    previousState: window.snapshot.endingState,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })

  const nextWindow: ProspectiveBranch = {
    ...window,
    availableZar: remainingZar,
    openingAmountZar: DESK_MONTH_TARGET_ZAR,
    snapshot: {
      ...window.snapshot,
      book: rebuiltBook,
      // Keep endingState / residuals / shocks / days history intact.
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

  const day1Routes = preview.record.routes || []
  const assignments = assignmentsFromRoutes(day1Routes as never)
  const firstEcm =
    assignments.find((a) => a.machineId === 5) ||
    day1Routes.find((r) => /Econometrica/i.test(String(r.railLabel || r.posName || '')))
  const firstWolfMoza = assignments.find((a) => a.cardId === 7)
  const firstGoblinMoza = assignments.find((a) => a.cardId === 8)

  // Walk subsequent days until Moza/ECM appear if not on fromDay.
  let walkEcm = firstEcm
    ? { day: fromDay, ...firstEcm }
    : null
  let walkWolfMoza = firstWolfMoza ? { day: fromDay, ...firstWolfMoza } : null
  let walkGoblinMoza = firstGoblinMoza ? { day: fromDay, ...firstGoblinMoza } : null
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
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    const assigns = assignmentsFromRoutes((ran.record.routes || []) as never)
    if (!walkEcm) {
      const hit = assigns.find((a) => a.machineId === 5)
      if (hit) walkEcm = { day: d, ...hit }
    }
    if (!walkWolfMoza) {
      const hit = assigns.find((a) => a.cardId === 7)
      if (hit) walkWolfMoza = { day: d, ...hit }
    }
    if (!walkGoblinMoza) {
      const hit = assigns.find((a) => a.cardId === 8)
      if (hit) walkGoblinMoza = { day: d, ...hit }
    }
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
