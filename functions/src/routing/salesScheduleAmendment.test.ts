import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OPERATING_POLICY_V1 } from '../operatingCalendar/operatingPolicyV1'
import { MONTH1_OCTOBER_2026 } from '../operatingCalendar/monthFixtures'
import { planReferenceMonth } from '../operatingCalendar/monthPlanner'
import {
  applySalesScheduleAmendment,
  beliefFingerprint,
  committedFloorZar,
  dailyCapForDate,
  emptySalesSchedule,
  formatPlanRevisedBody,
  looksLikeSalesScheduleAmendment,
  parseSalesScheduleAmendment,
  plannedIntakeZar,
  projectCompletionDate,
  replanScopeForStep,
  sastIsoDate,
  addSastCalendarDays,
  type AmendContext,
  type SalesScheduleProposal,
} from './salesScheduleAmendment'
import { sastToUtcMs } from './routingTime'

/** Sunday 4 Oct 2026 12:00 SAST */
const SUN_2026_10_04 = sastToUtcMs(2026, 10, 4, 12, 0)
/** Monday 5 Oct 2026 09:00 SAST */
const MON_2026_10_05 = sastToUtcMs(2026, 10, 5, 9, 0)

function baseCtx(over: Partial<AmendContext> = {}): AmendContext {
  const plan = emptySalesSchedule(SUN_2026_10_04)
  return {
    nowMs: SUN_2026_10_04,
    plan,
    floor: {
      deskStep: 1,
      cyclePhase: 'order_open',
      expectedOrderZar: 25_000,
      deployedAmount: 25_000,
      committedZar: 0,
      cycleStatus: 'awaiting_execution',
    },
    previousDailyAmountZar: 25_000,
    safeDailyCeilingZar: 30_000,
    beliefFingerprintBefore: beliefFingerprint({ pairings: { '1-1': 2 } }),
    ...over,
  }
}

function parseOk(message: string, nowMs = SUN_2026_10_04, version = 1): SalesScheduleProposal {
  const parsed = parseSalesScheduleAmendment(message, { nowMs, expectedPlanVersion: version })
  assert.ok(!('clarification' in parsed), JSON.stringify(parsed))
  return parsed as SalesScheduleProposal
}

describe('sales schedule amendment — parse', () => {
  it('parses single-day and multi-date instructions', () => {
    const a = parseOk('Reduce today’s ZAR sale to R12,000.')
    assert.equal(a.action, 'revise_sales_schedule')
    assert.equal(a.effectiveDate, '2026-10-04')
    assert.equal(a.dateOverrides['2026-10-04'], 12_000)
    assert.equal(a.reasonClass, 'operator_supply_revision')

    const b = parseOk('I can only sell R10,000 tomorrow.')
    assert.equal(b.effectiveDate, '2026-10-05')
    assert.equal(b.dateOverrides['2026-10-05'], 10_000)

    const c = parseOk('Cap Thursday and Friday at R15,000 each.')
    assert.equal(c.dateOverrides['2026-10-08'], 15_000) // Thu
    assert.equal(c.dateOverrides['2026-10-09'], 15_000) // Fri

    const d = parseOk('From tomorrow, I can sell R20,000 per day.')
    assert.equal(d.defaultFrom?.date, '2026-10-05')
    assert.equal(d.defaultFrom?.dailyAmountZar, 20_000)
  })

  it('parses zero-intake Wednesday without deleting residual concept', () => {
    const p = parseOk('No ZAR sales on Wednesday. Carry everything forward.')
    assert.equal(p.dateOverrides['2026-10-07'], 0)
    assert.equal(p.dailyAmountZar, 0)
  })

  it('classifies Mahommed demand revisions separately', () => {
    const p = parseOk('Mahommed can only accept R12,000 today. Extend the schedule.')
    assert.equal(p.reasonClass, 'demand_revision')
    assert.equal(p.dateOverrides['2026-10-04'], 12_000)
  })

  it('asks for clarification when amount/day missing', () => {
    const p = parseSalesScheduleAmendment('Please revise the schedule.', {
      nowMs: SUN_2026_10_04,
      expectedPlanVersion: 1,
    })
    assert.ok('clarification' in p)
  })
})

describe('sales schedule amendment — steps 1–6', () => {
  it('Step 1 draft can be completely rebuilt', () => {
    const proposal = parseOk('Reduce today’s ZAR sale to R12,000.')
    const result = applySalesScheduleAmendment(proposal, baseCtx({ floor: {
      deskStep: 1, cyclePhase: 'order_open', expectedOrderZar: 25_000, deployedAmount: 25_000, committedZar: 0, cycleStatus: 'awaiting_execution',
    }}))
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.revisedDailyAmountZar, 12_000)
    assert.equal(result.committedFloorZar, 0)
    assert.equal(result.remainingToScheduleZar, 12_000)
    assert.equal(replanScopeForStep(1).mayRebuildFullDay, true)
  })

  it('revision during each of Steps 1–6 behaves correctly', () => {
    for (const step of [1, 2, 3, 4, 5, 6] as const) {
      const committed = step >= 4 ? 8_000 : 0
      const proposal = parseOk('Reduce today’s ZAR sale to R12,000.')
      const result = applySalesScheduleAmendment(
        proposal,
        baseCtx({
          floor: {
            deskStep: step,
            cyclePhase: step === 5 ? 'awaiting_recycle' : step === 4 ? 'awaiting_send' : 'order_open',
            expectedOrderZar: 25_000,
            deployedAmount: 25_000,
            committedZar: committed,
            cycleStatus: step >= 5 ? 'completed' : 'awaiting_execution',
          },
        })
      )
      assert.equal(result.ok, true, `step ${step}`)
      if (!result.ok) continue
      if (step <= 3) {
        assert.equal(result.committedFloorZar, 0)
        assert.equal(result.revisedDailyAmountZar, 12_000)
      } else {
        assert.equal(result.committedFloorZar, 8_000)
        assert.equal(result.revisedDailyAmountZar, 12_000)
        assert.equal(result.remainingToScheduleZar, 4_000)
      }
      if (step === 6) assert.equal(replanScopeForStep(6).applyFromNextDay, true)
    }
  })

  it('authorised/captured/settled floor is never undercut; closest valid plan + explanation', () => {
    const proposal = parseOk('Reduce today’s ZAR sale to R5,000.')
    const result = applySalesScheduleAmendment(
      proposal,
      baseCtx({
        floor: {
          deskStep: 4,
          cyclePhase: 'awaiting_send',
          expectedOrderZar: 25_000,
          deployedAmount: 25_000,
          committedZar: 8_000,
          cycleStatus: 'awaiting_execution',
        },
      })
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.revisedDailyAmountZar, 8_000)
    assert.equal(result.committedFloorZar, 8_000)
    assert.match(result.explanation, /already committed/i)
    assert.match(result.explanation, /minimum/i)
  })

  it('next-day Step 1 plan can be superseded', () => {
    const proposal = parseOk('I can only sell R10,000 tomorrow.')
    const result = applySalesScheduleAmendment(
      proposal,
      baseCtx({
        nowMs: SUN_2026_10_04,
        previousDailyAmountZar: 24_000,
        floor: {
          deskStep: 1,
          cyclePhase: 'order_open',
          expectedOrderZar: 24_000,
          deployedAmount: 0,
          committedZar: 0,
          cycleStatus: 'awaiting_execution',
        },
      })
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.effectiveDate, '2026-10-05')
    assert.equal(result.revisedDailyAmountZar, 10_000)
    assert.equal(result.nextPlan.dateOverrides['2026-10-05'], 10_000)
  })
})

describe('sales schedule amendment — residual and tomorrow', () => {
  it('zero Wednesday keeps residual open and does not delete it', () => {
    const plan = emptySalesSchedule(SUN_2026_10_04)
    plan.residualOpenZar = 13_000
    const proposal = parseOk('No ZAR sales on Wednesday. Carry everything forward.')
    const result = applySalesScheduleAmendment(
      proposal,
      baseCtx({
        plan,
        previousDailyAmountZar: 25_000,
      })
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.revisedDailyAmountZar, 0)
    assert.ok(result.residualAfterZar >= 13_000)
    assert.equal(result.nextPlan.dateOverrides['2026-10-07'], 0)
  })

  it('residual extends projected finish date', () => {
    const proposal = parseOk('Reduce today’s ZAR sale to R12,000.')
    const result = applySalesScheduleAmendment(
      proposal,
      baseCtx({
        plan: { ...emptySalesSchedule(), projectedCompletionDate: '2026-10-29', residualOpenZar: 0 },
        previousDailyAmountZar: 25_000,
      })
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.ok(result.residualAfterZar > 0)
    assert.ok(result.revisedProjectedCompletionDate)
    assert.ok(result.revisedProjectedCompletionDate! >= '2026-10-29')
  })

  it('tomorrow does not inherit today’s shortfall', () => {
    const proposal = parseOk('Reduce today’s ZAR sale to R12,000.')
    const result = applySalesScheduleAmendment(proposal, baseCtx({ previousDailyAmountZar: 25_000 }))
    assert.equal(result.ok, true)
    if (!result.ok) return
    const tomorrow = '2026-10-05'
    assert.equal(result.nextPlan.dateOverrides[tomorrow], undefined)
    assert.equal(dailyCapForDate(result.nextPlan, tomorrow, 25_000), 25_000)
    assert.match(result.explanation, /Tomorrow has not been increased/i)
    assert.equal(
      plannedIntakeZar({
        operatorConfirmedZar: 25_000,
        confirmedDemandZar: 25_000,
        safeNetworkCapacityZar: 30_000,
        workingLiquidityHeadroomZar: 30_000,
        eligibleRouteCapacityZar: 30_000,
      }),
      25_000
    )
  })
})

describe('sales schedule amendment — safety gates', () => {
  it('stale expectedPlanVersion is rejected', () => {
    const proposal = parseOk('Reduce today’s ZAR sale to R12,000.', SUN_2026_10_04, 7)
    const plan = emptySalesSchedule()
    plan.planVersion = 8
    const result = applySalesScheduleAmendment(proposal, baseCtx({ plan }))
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.status, 'stale_version')
    assert.equal(result.currentPlanVersion, 8)
  })

  it('duplicate submissions are idempotent by key', () => {
    const a = parseOk('Reduce today’s ZAR sale to R12,000.')
    const b = parseOk('Reduce today’s ZAR sale to R12,000.')
    assert.equal(a.idempotencyKey, b.idempotencyKey)
    const first = applySalesScheduleAmendment(a, baseCtx())
    assert.equal(first.ok, true)
    if (!first.ok) return
    // Second apply with bumped version must stale; same version+same key is caller's idempotent short-circuit.
    const second = applySalesScheduleAmendment(
      { ...b, expectedPlanVersion: first.nextPlan.planVersion },
      baseCtx({ plan: first.nextPlan, previousDailyAmountZar: 12_000 })
    )
    assert.equal(second.ok, true)
    if (!second.ok) return
    assert.equal(second.revisedDailyAmountZar, 12_000)
  })

  it('route beliefs are unchanged by operator supply or demand revisions', () => {
    const before = beliefFingerprint({ pairings: { '1-2': 4 }, routeEvidenceVersion: 3 })
    const proposal = parseOk('Mahommed can only accept R12,000 today. Extend the schedule.')
    const result = applySalesScheduleAmendment(proposal, baseCtx({ beliefFingerprintBefore: before }))
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.touchedBeliefs, false)
    assert.equal(result.beliefFingerprintAfter, before)
  })

  it('SAST date interpretation works across midnight and Sunday', () => {
    assert.equal(sastIsoDate(SUN_2026_10_04), '2026-10-04')
    const justAfterMidnightMon = sastToUtcMs(2026, 10, 5, 0, 15)
    assert.equal(sastIsoDate(justAfterMidnightMon), '2026-10-05')
    const p = parseOk('Increase today to R25,000 if the routes still allow it.', justAfterMidnightMon)
    assert.equal(p.effectiveDate, '2026-10-05')

    const sundayBump = applySalesScheduleAmendment(parseOk('Reduce today’s ZAR sale to R12,000.'), baseCtx())
    assert.equal(sundayBump.ok, true)

    // From Monday, an explicit future Sunday non-zero intake is rejected.
    const sundayNonZeroOnSundayNamed = parseSalesScheduleAmendment('Sell R12,000 on Sunday.', {
      nowMs: MON_2026_10_05,
      expectedPlanVersion: 1,
    })
    assert.ok(!('clarification' in sundayNonZeroOnSundayNamed))
    const applied = applySalesScheduleAmendment(
      sundayNonZeroOnSundayNamed as SalesScheduleProposal,
      baseCtx({ nowMs: MON_2026_10_05 })
    )
    assert.equal(applied.ok, false)
    if (applied.ok) return
    assert.match(applied.clarification, /Sunday has no new intake/i)
  })

  it('committed floor helper preserves irreversible amounts', () => {
    assert.equal(
      committedFloorZar({
        deskStep: 1,
        expectedOrderZar: 20_000,
        deployedAmount: 20_000,
        committedZar: 0,
        cycleStatus: 'awaiting_execution',
      }),
      0
    )
    assert.equal(
      committedFloorZar({
        deskStep: 4,
        expectedOrderZar: 20_000,
        deployedAmount: 20_000,
        committedZar: 8_000,
        cycleStatus: 'awaiting_execution',
      }),
      8_000
    )
  })

  it('Plan revised body is compact and refresh-readable', () => {
    const result = applySalesScheduleAmendment(parseOk('Reduce today’s ZAR sale to R12,000.'), baseCtx())
    assert.equal(result.ok, true)
    if (!result.ok) return
    const body = formatPlanRevisedBody(result)
    assert.match(body, /Previous daily/)
    assert.match(body, /Residual/)
    assert.match(body, /Tomorrow was not increased/)
  })
})

describe('sales schedule amendment — policy + goldens', () => {
  it('policy ceilings still bind planned intake after amendment', () => {
    const proposal = parseOk('Increase today to R40,000 if the routes still allow it.')
    const result = applySalesScheduleAmendment(
      proposal,
      baseCtx({ safeDailyCeilingZar: OPERATING_POLICY_V1.network.establishedDailyCeilingZar })
    )
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.ok(result.revisedDailyAmountZar <= 30_000)
  })

  it('operating-policy calendar goldens remain green', () => {
    const cal = planReferenceMonth(1)
    assert.equal(cal.gates.ok, true)
    assert.equal(cal.paymentCount, MONTH1_OCTOBER_2026.payments)
    assert.equal(cal.totalZar, 660_000)
  })

  it('looksLikeSalesScheduleAmendment detects operator phrases', () => {
    assert.equal(looksLikeSalesScheduleAmendment('Reduce today’s ZAR sale to R12,000.'), true)
    assert.equal(looksLikeSalesScheduleAmendment('ok i need to change this cycles ZAR sales to R20000'), true)
    assert.equal(looksLikeSalesScheduleAmendment('Park Ginav until cleared'), false)
  })

  it('projectCompletionDate skips Sundays', () => {
    const end = projectCompletionDate({
      fromDate: '2026-10-03', // Saturday
      residualZar: 30_000,
      dailyReferenceZar: 15_000,
      nowMs: SUN_2026_10_04,
    })
    // 2 operating days ahead from Sat → Mon then Tue
    assert.equal(end, '2026-10-06')
  })

  it('addSastCalendarDays is stable', () => {
    assert.equal(addSastCalendarDays('2026-10-04', 1), '2026-10-05')
    assert.equal(MON_2026_10_05 > SUN_2026_10_04, true)
  })
})
