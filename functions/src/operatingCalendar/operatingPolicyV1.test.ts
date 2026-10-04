import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OPERATING_POLICY_V1,
  OPERATING_POLICY_VERSION,
  merchantPrincipalOfTerminal,
  networkDailyCeilingZar,
} from './operatingPolicyV1'
import { REFERENCE_TERMINALS, assertLiveExecutable, modeledEligiblePairs } from './referenceNetwork'
import { MONTH1_OCTOBER_2026, MONTH2_NOVEMBER_2026 } from './monthFixtures'
import { allocateRoutes, cardsForMonth } from './allocateRoutes'
import { buildUnsignedMonthBook } from './paymentBook'
import {
  emptyContinuityState,
  freezeCard,
  hashPayload,
  markOverdueFromExpectedBy,
  pendingExposureZar,
  recordIssuedAttempt,
  recordLifecycleProgress,
  recordUsableZar,
  rollingCount,
  rolloverMonth,
} from './continuityState'
import {
  month2VolumeWithGrowthAuthority,
  month2VolumeWithoutGrowthAuthority,
  planReferenceMonth,
  replanAfterInterruption,
  rollingDeskSlice,
} from './monthPlanner'
import { evaluateConfirmGate, type ConfirmInstruction } from './confirmGate'
import { CROSS_ACQUIRER_GAP_MS, SAME_ACQUIRER_GAP_MS } from '../routing/attemptSchedule'
import { planCycle, createInitialState, DEFAULT_TEST_CONFIG } from '../routing/conversionRouter'

function baseInstruction(over: Partial<ConfirmInstruction> = {}): ConfirmInstruction {
  return {
    instructionId: 'INST-1',
    invoiceId: 'INV-1',
    mozambiqueDebtor: 'debtor',
    cardId: 'BRICS',
    issuerBankId: 'FNB Mozambique',
    merchantPrincipalId: 'lemon_economics',
    invoiceIssuerId: 'lemon_economics',
    terminalId: 'BricsFNB',
    acquirerBankId: 'fnb',
    zarRecipientId: 'lemon_economics',
    amountZar: 5_000,
    legalEligibilityRef: 'REF-ELIG-BRICS-BricsFNB',
    earliestAt: '2026-10-08T08:00:00.000Z',
    planHash: 'abc',
    liveExecutable: true,
    ...over,
  }
}

describe('OperatingPolicyV1 reference months', () => {
  it('reproduces Month 1 October 2026 fixture', () => {
    const cal = planReferenceMonth(1)
    assert.equal(cal.gates.ok, true, cal.gates.gates.filter((g) => !g.pass).map((g) => g.id).join(','))
    assert.equal(cal.paymentCount, 129)
    assert.equal(cal.totalZar, 660_000)
    assert.equal(cal.operatingDayCount, 27)
    assert.equal(new Set(cal.payments.map((p) => p.cardId)).size, 6)
    assert.equal(new Set(cal.payments.map((p) => p.terminalId)).size, 5)
    assert.equal(new Set(cal.payments.map((p) => p.merchantPrincipalId)).size, 4)
    assert.equal(new Set(cal.payments.map((p) => p.acquirerBankId)).size, 2)
    assert.ok(cal.payments.every((p) => p.amountZar <= 8_000))
    assert.ok(cal.payments.every((p) => p.terminalId !== 'Econometrica' || p.liveExecutable === false))
    // deterministic replay
    const again = planReferenceMonth(1)
    assert.equal(again.outputHash, cal.outputHash)
    assert.equal(again.inputHash, cal.inputHash)
  })

  it('reproduces Month 2 November 2026 with growth authority and new-card ramp', () => {
    const m1 = planReferenceMonth(1)
    const m2 = planReferenceMonth(2, m1.continuity)
    assert.equal(m2.gates.ok, true, m2.gates.gates.filter((g) => !g.pass).map((g) => g.id).join(','))
    assert.equal(m2.paymentCount, 125)
    assert.equal(m2.totalZar, 726_000)
    assert.equal(m2.operatingDayCount, 25)
    assert.ok(m2.payments.some((p) => p.cardId === 'NEW_CARD_M2'))
    // Existing cards retain maturity from Month 1 carry
    for (const card of cardsForMonth(1)) {
      assert.ok((m2.continuity.cardCleanUsableCount[card.cardId] || 0) >= 7)
    }
    // New card does not inherit network maturity counts
    assert.ok((m2.continuity.cardCleanUsableCount['NEW_CARD_M2'] || 0) < 7)
  })

  it('without growth authority Month 2 volume stays at prior ceiling', () => {
    assert.equal(month2VolumeWithoutGrowthAuthority(660_000), 660_000)
    assert.equal(month2VolumeWithGrowthAuthority(660_000, 0.1), 726_000)
  })
})

describe('OperatingPolicyV1 constraints', () => {
  it('collapses Lemon FNB and Capitec to one merchant principal', () => {
    assert.equal(merchantPrincipalOfTerminal('BricsFNB'), 'lemon_economics')
    assert.equal(merchantPrincipalOfTerminal('BricsCapitec'), 'lemon_economics')
    const cal = planReferenceMonth(1)
    for (const day of MONTH1_OCTOBER_2026.days) {
      for (const cardId of new Set(cal.payments.map((p) => p.cardId))) {
        const lemon = cal.payments.filter(
          (p) =>
            p.date === day.date &&
            p.cardId === cardId &&
            (p.terminalId === 'BricsFNB' || p.terminalId === 'BricsCapitec')
        )
        assert.ok(lemon.length <= 1, `${cardId} ${day.date} lemon double`)
      }
    }
  })

  it('marks Econometrica modeled-eligible but live-ineligible without MID', () => {
    const ecm = REFERENCE_TERMINALS.find((t) => t.terminalId === 'Econometrica')!
    assert.equal(ecm.modeledEligible, true)
    assert.equal(ecm.liveExecutable, false)
    assert.equal(ecm.liveMerchantId, null)
    assert.throws(() => assertLiveExecutable('Econometrica'))
    assert.ok(modeledEligiblePairs().some((p) => p.terminalId === 'Econometrica' && !p.liveExecutable))
  })

  it('enforces card and POS spacing of at least 120 minutes in attempt schedule', () => {
    assert.equal(OPERATING_POLICY_V1.card.sameCardSpacingMinutes, 120)
    assert.equal(OPERATING_POLICY_V1.pos.samePosSpacingMinutes, 120)
    assert.equal(CROSS_ACQUIRER_GAP_MS, 120 * 60 * 1000)
    assert.equal(SAME_ACQUIRER_GAP_MS, 120 * 60 * 1000)
  })

  it('enforces network cold then established ceilings', () => {
    assert.equal(networkDailyCeilingZar(1, 'cold_start'), 25_000)
    assert.equal(networkDailyCeilingZar(3, 'cold_start'), 25_000)
    assert.equal(networkDailyCeilingZar(4, 'cold_start'), 30_000)
    assert.equal(networkDailyCeilingZar(1, 'established'), 30_000)
  })

  it('rejects early Confirm and stale Confirm after replan', () => {
    const continuity = emptyContinuityState({ workingLiquidityZar: 100_000 })
    const early = evaluateConfirmGate({
      instruction: baseInstruction({ earliestAt: '2026-10-08T12:00:00.000Z' }),
      nowIso: '2026-10-08T10:00:00.000Z',
      currentPlanHash: 'abc',
      continuity,
      requiredWorkingLiquidityZar: 30_000,
      availableWorkingLiquidityZar: 100_000,
    })
    assert.equal(early.ok, false)
    if (!early.ok) assert.equal(early.code, 'early')

    const stale = evaluateConfirmGate({
      instruction: baseInstruction({ planHash: 'old' }),
      nowIso: '2026-10-08T13:00:00.000Z',
      currentPlanHash: 'new',
      continuity,
      requiredWorkingLiquidityZar: 30_000,
      availableWorkingLiquidityZar: 100_000,
      updatedInstruction: baseInstruction({ planHash: 'new' }),
    })
    assert.equal(stale.ok, false)
    if (!stale.ok) assert.equal(stale.code, 'stale')
  })

  it('interruption freezes card and replans remaining day', () => {
    const cal = planReferenceMonth(1)
    const target = cal.payments.find((p) => p.date === '2026-10-08' && p.slotIndex === 0)!
    const sealed = [target.instructionId]
    const next = replanAfterInterruption({
      calendar: { ...cal, sealedInstructionIds: sealed },
      frozenCardId: target.cardId,
      asOfDate: target.date,
      asOfAttemptMin: target.attemptMin,
    })
    assert.ok(next.continuity.frozenCardIds.includes(target.cardId))
    assert.ok(next.payments.some((p) => p.instructionId === target.instructionId))
    const futureSameCard = next.payments.filter(
      (p) =>
        p.cardId === target.cardId &&
        !sealed.includes(p.instructionId) &&
        (p.date > target.date || (p.date === target.date && p.attemptMin > target.attemptMin))
    )
    // Frozen card excluded from reallocated future slots
    assert.equal(futureSameCard.length, 0)
  })

  it('silence does not create evidence; usable ZAR advances maturity; auth/capture do not', () => {
    let state = emptyContinuityState()
    state = recordIssuedAttempt(state, {
      cardId: 'BRICS',
      terminalId: 'BricsFNB',
      merchantPrincipalId: 'lemon_economics',
      amountZar: 5_000,
      date: '2026-10-01',
      instructionId: 'INST-1',
      expectedBy: '2026-10-02T16:00:00.000Z',
    })
    assert.equal(state.routeProofs.length, 0)
    assert.equal(state.cardCleanUsableCount['BRICS'] || 0, 0)

    state = recordLifecycleProgress(state, 'INST-1', 'authorised')
    state = recordLifecycleProgress(state, 'INST-1', 'captured')
    assert.equal(state.routeProofs.length, 0)
    assert.equal(state.cardCleanUsableCount['BRICS'] || 0, 0)

    state = recordUsableZar(state, {
      cardId: 'BRICS',
      terminalId: 'BricsFNB',
      merchantPrincipalId: 'lemon_economics',
      acquirerBankId: 'fnb',
      usableZarAt: '2026-10-02T10:00:00.000Z',
      amountZar: 5_000,
      instructionId: 'INST-1',
    })
    assert.equal(state.routeProofs.length, 1)
    assert.equal(state.cardCleanUsableCount['BRICS'], 1)
  })

  it('pending exposure and liquidity block Confirm', () => {
    let continuity = emptyContinuityState({ workingLiquidityZar: 10_000 })
    continuity = recordIssuedAttempt(continuity, {
      cardId: 'BRICS',
      terminalId: 'BricsFNB',
      merchantPrincipalId: 'lemon_economics',
      amountZar: 9_000,
      date: '2026-10-01',
      instructionId: 'INST-P',
    })
    assert.equal(pendingExposureZar(continuity), 9_000)
    const gate = evaluateConfirmGate({
      instruction: baseInstruction({ amountZar: 5_000, earliestAt: '2026-10-01T07:00:00.000Z' }),
      nowIso: '2026-10-01T08:00:00.000Z',
      currentPlanHash: 'abc',
      continuity,
      requiredWorkingLiquidityZar: 20_000,
      availableWorkingLiquidityZar: 10_000,
    })
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.code, 'liquidity')
  })

  it('passing expectedBy marks overdue and freezes card without fabricating outcome', () => {
    let state = emptyContinuityState()
    state = recordIssuedAttempt(state, {
      cardId: 'Wolf',
      terminalId: 'WolfFNB',
      merchantPrincipalId: 'wolf_and_sons',
      amountZar: 4_000,
      date: '2026-10-01',
      instructionId: 'INST-O',
      expectedBy: '2026-10-01T12:00:00.000Z',
    })
    state = markOverdueFromExpectedBy(state, '2026-10-01T13:00:00.000Z')
    assert.equal(state.pendingExposure[0]?.overdue, true)
    assert.ok(state.frozenCardIds.includes('Wolf'))
    assert.equal(state.routeProofs.length, 0)
  })

  it('rolling windows carry across month end', () => {
    let state = emptyContinuityState()
    state = recordIssuedAttempt(state, {
      cardId: 'Ginav',
      terminalId: 'Imani',
      merchantPrincipalId: 'imani',
      amountZar: 3_000,
      date: '2026-10-30',
      instructionId: 'A',
    })
    state = rolloverMonth(state, 0.1)
    state = recordIssuedAttempt(state, {
      cardId: 'Ginav',
      terminalId: 'Imani',
      merchantPrincipalId: 'imani',
      amountZar: 3_000,
      date: '2026-11-02',
      instructionId: 'B',
    })
    assert.equal(rollingCount(state.cardAttemptDates['Ginav'], '2026-11-02', 7), 2)
    assert.equal(state.authorisedGrowthRate, 0.1)
  })

  it('new card does not inherit network maturity', () => {
    const m1 = planReferenceMonth(1)
    const m2 = planReferenceMonth(2, m1.continuity)
    assert.notEqual(m2.continuity.cardMaturityStage['NEW_CARD_M2'], 'established')
    const slots = buildUnsignedMonthBook(MONTH2_NOVEMBER_2026.days.slice(0, 3), 2)
    const early = allocateRoutes({
      slots,
      networkState: 'established',
      cards: cardsForMonth(2),
      monthLabel: '2026-11',
      includeNewCardRamp: true,
    }).filter((p) => p.cardId === 'NEW_CARD_M2')
    for (const p of early) {
      assert.ok(p.amountZar <= OPERATING_POLICY_V1.newCard.stageA.maxAttemptZar + 0.05 || p.amountZar <= OPERATING_POLICY_V1.newCard.stageB.maxAttemptZar + 0.05)
    }
  })

  it('adding a card without ceiling authority does not increase volume', () => {
    assert.equal(month2VolumeWithoutGrowthAuthority(MONTH1_OCTOBER_2026.plannedValueZar), 660_000)
  })

  it('desk slice is a rolling 14-day view of continuous month state', () => {
    const cal = planReferenceMonth(1)
    const slice = rollingDeskSlice({ calendar: cal, asOfDate: '2026-10-08', viewDays: 14 })
    assert.equal(slice.viewDays, 14)
    assert.ok(slice.payments.length > 0)
    assert.ok(slice.payments.length < cal.paymentCount)
    assert.equal(slice.monthPaymentCount, 129)
  })

  it('acquirer ceiling applies only to Capitec; FNB is residual majority', () => {
    assert.equal(OPERATING_POLICY_V1.acquirer.minorityAcquirerId, 'capitec')
    assert.equal(OPERATING_POLICY_V1.acquirer.maxShare, 0.35)
    assert.equal(OPERATING_POLICY_V1.acquirer.referenceCapitecMinShare, 0.25)
    assert.equal(OPERATING_POLICY_V1.acquirer.referenceCapitecMaxShare, 0.35)
    assert.equal(OPERATING_POLICY_V1.acquirer.referenceFnbMinShare, 0.65)
    assert.equal(OPERATING_POLICY_V1.acquirer.referenceFnbMaxShare, 0.75)
    assert.deepEqual(OPERATING_POLICY_V1.pos.shareMeasurementWindows, ['rolling_7d', 'calendar_month'])
  })

  it('legacy Day-1 golden planner regression remains intact', () => {
    // Full ~R10,192.70 / 2-card golden lives in conversionRouter.test.ts.
    // Here we only assert the 14-day desk surface stays and policy goldens are separate.
    assert.equal(DEFAULT_TEST_CONFIG.cycleCount, 14)
    const idle = planCycle(createInitialState())
    assert.equal(idle.deployedAmount, 0)
    assert.equal(OPERATING_POLICY_VERSION, 'OperatingPolicyV1')
  })

  it('hashes are stable for identical inputs', () => {
    const a = hashPayload({ x: 1, y: [2, 3] })
    const b = hashPayload({ x: 1, y: [2, 3] })
    assert.equal(a, b)
    assert.notEqual(a, hashPayload({ x: 1, y: [2, 4] }))
  })

  it('freezeCard blocks Confirm', () => {
    const continuity = freezeCard(emptyContinuityState({ workingLiquidityZar: 100_000 }), 'BRICS')
    const gate = evaluateConfirmGate({
      instruction: baseInstruction({ earliestAt: '2026-10-01T07:00:00.000Z' }),
      nowIso: '2026-10-01T09:00:00.000Z',
      currentPlanHash: 'abc',
      continuity,
      requiredWorkingLiquidityZar: 10_000,
      availableWorkingLiquidityZar: 100_000,
    })
    assert.equal(gate.ok, false)
    if (!gate.ok) assert.equal(gate.code, 'frozen_card')
  })
})
