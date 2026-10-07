import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OPERATING_POLICY_V1 } from '../../operatingCalendar/operatingPolicyV1'
import { DESK_MONTH_HORIZON_DAYS, DESK_MONTH_TARGET_ZAR } from '../../routing/deskMonth'
import { prospectiveScenario } from '../prospective/runDay'
import {
  allocateInvoicesToDays,
  bookTotalZar,
  buildAbsorbingPaymentBook,
  buildLegacyAbsorbingPaymentBook,
  generateModeledInvoiceStream,
  MATURE_MODELED_INVOICE,
} from './prospectiveBook'
import { roundMoney, sum } from './math'

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]!
}

describe('prospective modeled invoice book (month)', () => {
  it('draws mature invoices in the R8k–R15k triangular band and covers the authorised amount', () => {
    const scenario = prospectiveScenario({
      seed: 21,
      availableZar: DESK_MONTH_TARGET_ZAR,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    const invoices = generateModeledInvoiceStream({
      scenario,
      authorisedZar: DESK_MONTH_TARGET_ZAR,
      includeColdRouteStages: true,
    })
    assert.ok(invoices.length > 0)
    assert.ok(invoices.length < 80, `expected materially fewer than 80 invoices, got ${invoices.length}`)
    assert.ok(Math.abs(roundMoney(sum(invoices)) - DESK_MONTH_TARGET_ZAR) < 0.02)

    const mature = invoices.slice(7) // after stage A/B ladder
    assert.ok(mature.length > 20)
    for (const amount of mature.slice(0, -1)) {
      assert.ok(amount >= MATURE_MODELED_INVOICE.minZar - 1e-9, String(amount))
      assert.ok(amount <= MATURE_MODELED_INVOICE.maxZar + 1e-9, String(amount))
    }
    const mean = sum(invoices) / invoices.length
    assert.ok(mean >= 10_500 && mean <= 12_500, `mean ${mean}`)
  })

  it('packs whole invoices under cold/established ceilings without a fixed payment-count target', () => {
    const scenario = prospectiveScenario({
      seed: 21,
      availableZar: DESK_MONTH_TARGET_ZAR,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    const invoices = generateModeledInvoiceStream({
      scenario,
      authorisedZar: DESK_MONTH_TARGET_ZAR,
    })
    const { book, unscheduled } = allocateInvoicesToDays({
      invoices,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    assert.equal(unscheduled.length, 0)
    assert.ok(Math.abs(bookTotalZar(book) - DESK_MONTH_TARGET_ZAR) < 0.02)

    const hist: Record<number, number> = {}
    let maxDay = 0
    for (let day = 1; day <= DESK_MONTH_HORIZON_DAYS; day += 1) {
      const tickets = book[day] ?? []
      if (!tickets.length) continue
      const daySum = roundMoney(sum(tickets.map((t) => t.amount)))
      const ceiling =
        day <= OPERATING_POLICY_V1.network.coldNetworkDays
          ? OPERATING_POLICY_V1.network.coldDailyCeilingZar
          : OPERATING_POLICY_V1.network.establishedDailyCeilingZar
      assert.ok(daySum <= ceiling + 1e-9, `day ${day} ${daySum} > ${ceiling}`)
      assert.ok(tickets.length <= OPERATING_POLICY_V1.network.maxAttemptsPerOperatingDay)
      hist[tickets.length] = (hist[tickets.length] ?? 0) + 1
      maxDay = Math.max(maxDay, daySum)
    }
    assert.ok((hist[2] ?? 0) >= (hist[3] ?? 0), `expected mostly two-payment days: ${JSON.stringify(hist)}`)
    assert.ok((hist[5] ?? 0) === 0, `should not pack five-payment days by default: ${JSON.stringify(hist)}`)
    assert.ok(maxDay <= OPERATING_POLICY_V1.network.establishedDailyCeilingZar + 1e-9)
    // Sundays empty
    for (let day = 7; day <= DESK_MONTH_HORIZON_DAYS; day += 7) {
      assert.equal((book[day] ?? []).length, 0)
    }
  })

  it('buildAbsorbingPaymentBook month path uses the mature generator; legacy remains denser', () => {
    const scenario = prospectiveScenario({
      seed: 21,
      availableZar: DESK_MONTH_TARGET_ZAR,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    // Legacy comparison uses the prior ticket band (not the mature month scenario).
    const legacyScenario = prospectiveScenario({
      seed: 21,
      availableZar: DESK_MONTH_TARGET_ZAR,
      horizonDays: 14,
    })
    legacyScenario.horizonDays = DESK_MONTH_HORIZON_DAYS
    const mature = buildAbsorbingPaymentBook({
      scenario,
      availableZar: DESK_MONTH_TARGET_ZAR,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    const legacy = buildLegacyAbsorbingPaymentBook({
      scenario: legacyScenario,
      availableZar: DESK_MONTH_TARGET_ZAR,
      horizonDays: DESK_MONTH_HORIZON_DAYS,
    })
    const matureN = Object.values(mature).reduce((n, t) => n + t.length, 0)
    const legacyN = Object.values(legacy).reduce((n, t) => n + t.length, 0)
    assert.ok(legacyN >= 70, `legacy expected ~80 invoices, got ${legacyN}`)
    assert.ok(matureN < legacyN - 10, `mature ${matureN} should be materially fewer than legacy ${legacyN}`)
    assert.ok(Math.abs(bookTotalZar(mature) - DESK_MONTH_TARGET_ZAR) < 0.02)

    const amounts = Object.values(mature)
      .flat()
      .map((t) => t.amount)
      .sort((a, b) => a - b)
    const mean = sum(amounts) / amounts.length
    assert.ok(mean >= 10_500 && mean <= 12_500, `mean ${mean}`)
    assert.ok(percentile(amounts, 0.9) <= MATURE_MODELED_INVOICE.maxZar + 1e-9)
    assert.ok(amounts[amounts.length - 1]! <= OPERATING_POLICY_V1.payment.maxAmountZar + 1e-9)
  })

  it('keeps 14-day golden book contract unchanged', () => {
    const scenario = prospectiveScenario({ seed: 21, availableZar: 100_000, horizonDays: 14 })
    const book = buildAbsorbingPaymentBook({
      scenario,
      availableZar: 100_000,
      horizonDays: 14,
    })
    const day2 = (book[2] ?? []).map((t) => t.amount)
    assert.deepEqual(day2, [7_486.73, 12_999.81])
  })
})
