/**
 * Controlled comparison: legacy free-pack (~80 invoices) vs mature R8k–R15k
 * prospective book for the same authorised amount and October horizon.
 *
 * Modeled books only — does not mutate live receivables.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { OPERATING_POLICY_V1 } from '../src/operatingCalendar/operatingPolicyV1'
import { DESK_MONTH_HORIZON_DAYS, DESK_MONTH_TARGET_ZAR } from '../src/routing/deskMonth'
import { KERNEL_SEED } from '../src/routing/throughputPlan'
import {
  bookTotalZar,
  buildAbsorbingPaymentBook,
  buildLegacyAbsorbingPaymentBook,
  generateModeledInvoiceStream,
  allocateInvoicesToDays,
  type ProspectiveBook,
} from '../src/throughput/model/prospectiveBook'
import { prospectiveScenario, runProspectiveDay } from '../src/throughput/prospective/runDay'
import { advanceWindow, startWindow } from '../src/throughput/prospective/window'
import { roundMoney, sum } from '../src/throughput/model/math'
import type { SimState } from '../src/throughput/model/types'

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]!
}

function invoiceStats(amounts: number[]) {
  const sorted = [...amounts].sort((a, b) => a - b)
  const n = sorted.length
  const mean = n ? sum(sorted) / n : 0
  return {
    count: n,
    totalZar: roundMoney(sum(sorted)),
    min: sorted[0] ?? 0,
    median: n ? sorted[Math.floor((n - 1) / 2)]! : 0,
    mean: roundMoney(mean),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    max: sorted[n - 1] ?? 0,
  }
}

function paymentsPerDayHist(book: ProspectiveBook) {
  const hist: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  let operatingDays = 0
  let maxDayZar = 0
  for (const [k, tickets] of Object.entries(book)) {
    const n = tickets.length
    if (!n) continue
    operatingDays += 1
    hist[String(Math.min(n, 5))] = (hist[String(Math.min(n, 5))] ?? 0) + 1
    maxDayZar = Math.max(maxDayZar, roundMoney(sum(tickets.map((t) => t.amount))))
  }
  return { hist, operatingDays, maxDayZar, sundayEmpty: (book[7] ?? []).length === 0 }
}

function shareMap(rows: Array<{ key: string; value: number; count: number }>) {
  const totalV = sum(rows.map((r) => r.value)) || 1
  const totalC = sum(rows.map((r) => r.count)) || 1
  return Object.fromEntries(
    rows.map((r) => [
      r.key,
      {
        valueZar: roundMoney(r.value),
        count: r.count,
        valueShare: +(r.value / totalV).toFixed(4),
        countShare: +(r.count / totalC).toFixed(4),
      },
    ])
  )
}

function simulateBook(book: ProspectiveBook, availableZar: number, seed: number, horizonDays: number) {
  let state: SimState | null = null
  let available = availableZar
  const cardTotals = new Map<string, number>()
  const cardPos = new Map<string, number>()
  const cardPrincipal = new Map<string, number>()
  const posValue = new Map<string, { value: number; count: number }>()
  const principalValue = new Map<string, { value: number; count: number }>()
  const acquirerValue = new Map<string, { value: number; count: number }>()
  const cardDayTouches: Array<{ day: number; card: string; pos: string }> = []
  const failed: string[] = []
  let settled = 0
  let blocked = 0

  for (let day = 1; day <= horizonDays; day += 1) {
    const tickets = book[day] ?? []
    const result = runProspectiveDay({
      day,
      availableZar: available,
      tickets,
      seed,
      previousState: state,
      horizonDays,
    })
    state = result.endingState
    available = result.availableZar
    settled = roundMoney(settled + result.record.settledZar)
    blocked = roundMoney(blocked + result.record.blockedZar)
    for (const reason of result.record.blockedReasons) {
      if (!failed.includes(reason)) failed.push(reason)
    }
    if (result.record.concentrationReason && !failed.includes(result.record.concentrationReason)) {
      failed.push(result.record.concentrationReason)
    }
    for (const route of result.record.routes) {
      cardTotals.set(route.cardName, roundMoney((cardTotals.get(route.cardName) ?? 0) + route.amountZar))
      const cp = `${route.cardName}×${route.railLabel}`
      cardPos.set(cp, (cardPos.get(cp) ?? 0) + 1)
      const principal = route.railLabel.replace(/\s+(FNB|Capitec)$/i, '').trim() || route.railLabel
      const cpr = `${route.cardName}×${principal}`
      cardPrincipal.set(cpr, (cardPrincipal.get(cpr) ?? 0) + 1)
      const acq = /Capitec/i.test(route.railLabel)
        ? 'capitec'
        : /FNB/i.test(route.railLabel)
          ? 'fnb'
          : 'other'
      const bump = (m: Map<string, { value: number; count: number }>, key: string, v: number) => {
        const cur = m.get(key) ?? { value: 0, count: 0 }
        m.set(key, { value: roundMoney(cur.value + v), count: cur.count + 1 })
      }
      bump(posValue, route.railLabel, route.amountZar)
      bump(principalValue, principal, route.amountZar)
      bump(acquirerValue, acq, route.amountZar)
      cardDayTouches.push({ day, card: route.cardName, pos: route.railLabel })
    }
  }

  // Rolling-7 maxima on settled day totals from book packing (network value).
  const daySums: number[] = []
  for (let day = 1; day <= horizonDays; day += 1) {
    daySums.push(roundMoney(sum((book[day] ?? []).map((t) => t.amount))))
  }
  let rolling7Max = 0
  for (let i = 0; i < daySums.length; i += 1) {
    const window = daySums.slice(Math.max(0, i - 6), i + 1)
    rolling7Max = Math.max(rolling7Max, roundMoney(sum(window)))
  }

  const consecutiveCardPos = cardDayTouches.some((touch, i) => {
    if (i === 0) return false
    const prev = cardDayTouches[i - 1]!
    return (
      touch.card === prev.card &&
      touch.pos === prev.pos &&
      touch.day === prev.day + 1
    )
  })

  const cardPosMax = Math.max(0, ...cardPos.values())
  const cardPosOver4 = [...cardPos.entries()].filter(([, n]) => n > 4)

  return {
    settledZar: settled,
    blockedZar: blocked,
    availableAfterZar: available,
    unscheduledResidualZar: roundMoney(Math.max(0, availableZar - bookTotalZar(book))),
    cardTotals: Object.fromEntries([...cardTotals.entries()].sort()),
    cardPaymentCounts: Object.fromEntries(
      [...cardTotals.keys()].map((card) => [
        card,
        [...cardPos.entries()].filter(([k]) => k.startsWith(`${card}×`)).reduce((n, [, c]) => n + c, 0),
      ])
    ),
    cardPosRepetitions: Object.fromEntries([...cardPos.entries()].sort((a, b) => b[1] - a[1])),
    cardPosMaxMonthlyTouches: cardPosMax,
    cardPosOver4Touches: Object.fromEntries(cardPosOver4),
    cardPrincipalRepetitions: Object.fromEntries(
      [...cardPrincipal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    ),
    posShares: shareMap(
      [...posValue.entries()].map(([key, v]) => ({ key, value: v.value, count: v.count }))
    ),
    principalShares: shareMap(
      [...principalValue.entries()].map(([key, v]) => ({ key, value: v.value, count: v.count }))
    ),
    acquirerShares: shareMap(
      [...acquirerValue.entries()].map(([key, v]) => ({ key, value: v.value, count: v.count }))
    ),
    rolling7MaxZar: rolling7Max,
    consecutiveSameCardPosDay: consecutiveCardPos,
    failedOrBindingRules: failed,
  }
}

function summarizeLabel(label: string, book: ProspectiveBook, availableZar: number, seed: number) {
  const amounts = Object.values(book).flatMap((t) => t.map((x) => x.amount))
  const pack = paymentsPerDayHist(book)
  const routed = simulateBook(book, availableZar, seed, DESK_MONTH_HORIZON_DAYS)
  return {
    label,
    invoice: invoiceStats(amounts),
    paymentsPerDay: pack,
    routing: routed,
  }
}

async function main() {
  const authorised = DESK_MONTH_TARGET_ZAR
  const seed = KERNEL_SEED
  const matureScenario = prospectiveScenario({
    seed,
    availableZar: authorised,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })
  const legacyScenario = prospectiveScenario({
    seed,
    availableZar: authorised,
    horizonDays: 14,
  })
  legacyScenario.horizonDays = DESK_MONTH_HORIZON_DAYS
  legacyScenario.expectedTicketMinZar = 3_000
  legacyScenario.expectedTicketMaxZar = OPERATING_POLICY_V1.payment.maxAmountZar
  legacyScenario.avgTicketZar = 8_000

  const frozen80 = buildLegacyAbsorbingPaymentBook({
    scenario: legacyScenario,
    availableZar: authorised,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })
  const invoices = generateModeledInvoiceStream({
    scenario: matureScenario,
    authorisedZar: authorised,
  })
  const { book: matureBook, unscheduled } = allocateInvoicesToDays({
    invoices,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })
  // Sanity: startWindow uses the same mature path
  const livePath = startWindow({
    availableZar: authorised,
    seed,
    horizonDays: DESK_MONTH_HORIZON_DAYS,
  })
  let advanced = livePath
  while (advanced.completedThroughDay < DESK_MONTH_HORIZON_DAYS) {
    advanced = advanceWindow(advanced)
  }

  const report = {
    assumptions: {
      authorisedZar: authorised,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
      seed,
      matureBand: { min: 8_000, mode: 11_500, max: 15_000 },
      note:
        'Frozen-80 = prior free-pack prospective generator (synthetic). Mature = new triangular R8k–R15k book. Neither mutates live receivables.',
    },
    frozen80InvoiceBook: summarizeLabel('frozen_legacy_free_pack', frozen80, authorised, seed),
    matureProspectiveBook: {
      ...summarizeLabel('mature_triangular_r8k_r15k', matureBook, authorised, seed),
      unscheduledInvoices: unscheduled,
      unscheduledZar: roundMoney(sum(unscheduled)),
    },
    startWindowParity: {
      bookTotalZar: bookTotalZar(livePath.snapshot.book),
      invoiceCount: Object.values(livePath.snapshot.book).reduce((n, t) => n + t.length, 0),
      day1Payments: (livePath.snapshot.book[1] ?? []).length,
      finalSettledZar: advanced.snapshot.totals.settledZar,
      finalOutstandingZar: advanced.snapshot.totals.outstandingZar,
    },
    policyPreserved: {
      paymentMaxZar: OPERATING_POLICY_V1.payment.maxAmountZar,
      coldDailyCeilingZar: OPERATING_POLICY_V1.network.coldDailyCeilingZar,
      establishedDailyCeilingZar: OPERATING_POLICY_V1.network.establishedDailyCeilingZar,
      maxAttemptsPerOperatingDay: OPERATING_POLICY_V1.network.maxAttemptsPerOperatingDay,
      sundayNewIntake: OPERATING_POLICY_V1.network.sundayNewIntake,
      stageAMaxZar: OPERATING_POLICY_V1.newCard.stageA.maxAttemptZar,
      stageBMaxZar: OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar,
    },
  }

  const outJson = path.resolve(process.cwd(), '../tmp/october-2026-prospective-book-v6-comparison.json')
  const outMd = path.resolve(process.cwd(), '../tmp/october-2026-prospective-book-v6-comparison.md')
  fs.mkdirSync(path.dirname(outJson), { recursive: true })
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2))

  const a = report.frozen80InvoiceBook
  const b = report.matureProspectiveBook
  const md = `# Prospective book comparison — October ${authorised.toLocaleString('en-ZA')} ZAR

## Assumptions
- Authorised: R${authorised.toLocaleString('en-ZA')} · horizon ${DESK_MONTH_HORIZON_DAYS} days · seed ${seed}
- Mature band: triangular R8,000 / R11,500 / R15,000
- Frozen-80 book is the **prior synthetic free-pack** (not live receivables)

## Invoice stats

| Metric | Frozen ~80 book | Mature prospective |
|---|---:|---:|
| Total | R${a.invoice.totalZar.toLocaleString('en-ZA')} | R${b.invoice.totalZar.toLocaleString('en-ZA')} |
| Count | ${a.invoice.count} | ${b.invoice.count} |
| Min | ${a.invoice.min} | ${b.invoice.min} |
| Median | ${a.invoice.median} | ${b.invoice.median} |
| Mean | ${a.invoice.mean} | ${b.invoice.mean} |
| P75 | ${a.invoice.p75} | ${b.invoice.p75} |
| P90 | ${a.invoice.p90} | ${b.invoice.p90} |
| Max | ${a.invoice.max} | ${b.invoice.max} |

## Payments per day

| | Frozen | Mature |
|---|---|---|
| Operating days | ${a.paymentsPerDay.operatingDays} | ${b.paymentsPerDay.operatingDays} |
| Hist | ${JSON.stringify(a.paymentsPerDay.hist)} | ${JSON.stringify(b.paymentsPerDay.hist)} |
| Max day ZAR | ${a.paymentsPerDay.maxDayZar} | ${b.paymentsPerDay.maxDayZar} |

## Routing summary

| | Frozen | Mature |
|---|---:|---:|
| Settled | ${a.routing.settledZar} | ${b.routing.settledZar} |
| Blocked | ${a.routing.blockedZar} | ${b.routing.blockedZar} |
| Rolling-7 max | ${a.routing.rolling7MaxZar} | ${b.routing.rolling7MaxZar} |
| Card×POS max touches | ${a.routing.cardPosMaxMonthlyTouches} | ${b.routing.cardPosMaxMonthlyTouches} |
| Failed/binding | ${a.routing.failedOrBindingRules.join('; ') || 'none'} | ${b.routing.failedOrBindingRules.join('; ') || 'none'} |

Full JSON: \`${outJson}\`
`
  fs.writeFileSync(outMd, md)
  console.log(md)
  console.log('Wrote', outJson)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
