import type { PlannedPayment } from './allocateRoutes'
import {
  OPERATING_POLICY_V1,
  acquirerOfTerminal,
  merchantPrincipalOfTerminal,
  networkDailyCeilingZar,
  type NetworkColdState,
  type TerminalId,
} from './operatingPolicyV1'
import { REFERENCE_TERMINALS } from './referenceNetwork'
import type { DayTarget } from './monthFixtures'

export type GateResult = { id: string; pass: boolean; detail: string }

function money(n: number) {
  return Math.round(n * 100) / 100
}

export function validateOperatingCalendar(params: {
  payments: PlannedPayment[]
  days: DayTarget[]
  networkState: NetworkColdState
  expectedTotalZar: number
  expectedPaymentCount: number
  requireFullMeshContinuity: boolean
  enforceReferenceCapitecBand: boolean
}): { ok: boolean; gates: GateResult[] } {
  const { payments, days, networkState } = params
  const policy = OPERATING_POLICY_V1
  const gates: GateResult[] = []
  const push = (id: string, pass: boolean, detail: string) => gates.push({ id, pass, detail })

  // 1 identity
  const inv = new Set(payments.map((p) => p.invoiceId))
  const inst = new Set(payments.map((p) => p.instructionId))
  push('commercial_identity', inv.size === payments.length && inst.size === payments.length, `unique invoices=${inv.size}`)

  // 2 one invoice one amount
  push(
    'one_invoice_full_amount',
    payments.every((p) => p.amountZar > 0 && p.amountZar <= policy.payment.maxAmountZar),
    `maxAmount=${Math.max(...payments.map((p) => p.amountZar), 0)}`
  )

  // 3 sunday / operating days
  const sundayIntake = payments.filter((p) => new Date(p.date + 'T12:00:00Z').getUTCDay() === 0)
  push('sunday_intake_zero', sundayIntake.length === 0, `sunday=${sundayIntake.length}`)
  push('operating_day_count', days.length === new Set(payments.map((p) => p.date)).size, `days=${days.length}`)

  // 4 daily network
  let dailyOk = true
  for (let i = 0; i < days.length; i++) {
    const d = days[i]!
    const dayPays = payments.filter((p) => p.date === d.date)
    const sum = money(dayPays.reduce((s, p) => s + p.amountZar, 0))
    const ceiling = networkDailyCeilingZar(i + 1, networkState)
    if (Math.abs(sum - d.targetZar) > 0.05 || sum > ceiling + 0.05 || dayPays.length !== d.paymentCount) {
      dailyOk = false
    }
    if (dayPays.length > policy.network.maxAttemptsPerOperatingDay) dailyOk = false
  }
  push('daily_network_limits', dailyOk, 'targets+ceiling+attemptCap')

  // 5 card daily/rolling
  let cardOk = true
  const byDayCard = new Map<string, PlannedPayment[]>()
  for (const p of payments) {
    const k = `${p.date}|${p.cardId}`
    byDayCard.set(k, [...(byDayCard.get(k) || []), p])
  }
  for (const [k, list] of byDayCard) {
    const date = k.split('|')[0]!
    const dayIdx = days.findIndex((d) => d.date === date) + 1
    const maxAttempts =
      networkState === 'cold_start' && dayIdx <= policy.network.coldNetworkDays
        ? policy.card.coldAttemptsPerDay
        : policy.card.establishedAttemptsPerDay
    if (list.length > maxAttempts) cardOk = false
    if (money(list.reduce((s, p) => s + p.amountZar, 0)) > policy.card.maxValuePerDayZar + 0.05) cardOk = false
    const mins = list.map((p) => p.attemptMin).sort((a, b) => a - b)
    for (let i = 1; i < mins.length; i++) {
      if (mins[i]! - mins[i - 1]! < policy.card.sameCardSpacingMinutes) cardOk = false
    }
  }
  // rolling 7
  for (const cardId of new Set(payments.map((p) => p.cardId))) {
    for (const d of days) {
      const asOf = Date.parse(d.date + 'T12:00:00Z')
      const cut = asOf - 6 * 86400000
      const n = payments.filter(
        (p) => p.cardId === cardId && Date.parse(p.date + 'T12:00:00Z') >= cut && p.date <= d.date
      ).length
      if (n > policy.card.maxAttemptsRolling7Days) cardOk = false
    }
  }
  push('card_limits', cardOk, 'daily+rolling+spacing')

  // 6 card-principal
  let prinOk = true
  const dayPrin = new Map<string, number>()
  for (const p of payments) {
    const k = `${p.date}|${p.cardId}|${p.merchantPrincipalId}`
    dayPrin.set(k, (dayPrin.get(k) || 0) + 1)
  }
  for (const n of dayPrin.values()) if (n > policy.cardPrincipal.maxPerLocalDay) prinOk = false
  // Lemon collapse check: same card cannot use BricsFNB and BricsCapitec same day
  for (const d of days) {
    for (const cardId of new Set(payments.map((p) => p.cardId))) {
      const lemon = payments.filter(
        (p) => p.date === d.date && p.cardId === cardId && merchantPrincipalOfTerminal(p.terminalId) === 'lemon_economics'
      )
      if (lemon.length > 1) prinOk = false
    }
  }
  push('card_principal_limits', prinOk, 'incl Lemon FNB+Capitec collapse')

  // 7 POS
  let posOk = true
  for (const d of days) {
    const dayIdx = days.findIndex((x) => x.date === d.date) + 1
    const maxPos =
      networkState === 'cold_start' && dayIdx <= policy.pos.coldPosNetworkDays
        ? policy.pos.coldAttemptsPerDay
        : policy.pos.establishedAttemptsPerDay
    for (const term of REFERENCE_TERMINALS) {
      const list = payments.filter((p) => p.date === d.date && p.terminalId === term.terminalId)
      if (list.length > maxPos) posOk = false
      if (money(list.reduce((s, p) => s + p.amountZar, 0)) > policy.pos.maxValuePerDayZar + 0.05) posOk = false
      const mins = list.map((p) => p.attemptMin).sort((a, b) => a - b)
      for (let i = 1; i < mins.length; i++) {
        if (mins[i]! - mins[i - 1]! < policy.pos.samePosSpacingMinutes) posOk = false
      }
    }
  }
  const totalV = money(payments.reduce((s, p) => s + p.amountZar, 0))
  const totalN = payments.length
  for (const term of REFERENCE_TERMINALS) {
    const list = payments.filter((p) => p.terminalId === term.terminalId)
    const shareV = list.reduce((s, p) => s + p.amountZar, 0) / totalV
    const shareN = list.length / totalN
    if (shareV > policy.pos.maxShareValue + 1e-9 || shareN > policy.pos.maxShareCount + 1e-9) posOk = false
  }
  push('pos_limits', posOk, 'daily+spacing+35% share')

  // 8 acquirer — Capitec-only ceiling. FNB is residual majority; never apply maxShare to it.
  const minority = policy.acquirer.minorityAcquirerId
  const minorityRows = payments.filter((p) => p.acquirerBankId === minority)
  const minShareV = minorityRows.reduce((s, p) => s + p.amountZar, 0) / totalV
  const minShareN = minorityRows.length / totalN
  const acqOk = minShareV <= policy.acquirer.maxShare + 1e-9 && minShareN <= policy.acquirer.maxShare + 1e-9
  const bandOk =
    !params.enforceReferenceCapitecBand ||
    (minShareV >= policy.acquirer.referenceCapitecMinShare - 1e-9 &&
      minShareV <= policy.acquirer.referenceCapitecMaxShare + 1e-9 &&
      minShareN >= policy.acquirer.referenceCapitecMinShare - 1e-9 &&
      minShareN <= policy.acquirer.referenceCapitecMaxShare + 1e-9)
  push(
    'acquirer_concentration',
    acqOk && bandOk,
    `${minority}V=${(minShareV * 100).toFixed(1)}% N=${(minShareN * 100).toFixed(1)}% (FNB residual expected ${policy.acquirer.referenceFnbMinShare * 100}–${policy.acquirer.referenceFnbMaxShare * 100}%)`
  )

  // 9 time buckets monthly value
  const buckets = new Map<string, number>()
  for (const p of payments) {
    const b = Math.floor(p.attemptMin / 30) * 30
    buckets.set(String(b), (buckets.get(String(b)) || 0) + p.amountZar)
  }
  const maxBucket = Math.max(...buckets.values(), 0) / totalV
  push('time_bucket_month', maxBucket <= policy.timing.maxMonthBucketShareOfValue + 1e-9, `maxBucketShare=${(maxBucket * 100).toFixed(1)}%`)

  // 10 continuity
  let contOk = true
  const cards = [...new Set(payments.map((p) => p.cardId))]
  for (const cardId of cards) {
    const mine = payments.filter((p) => p.cardId === cardId)
    const terms = new Set(mine.map((p) => p.terminalId))
    const prins = new Set(mine.map((p) => p.merchantPrincipalId))
    const acqs = new Set(mine.map((p) => p.acquirerBankId))
    if (terms.size < policy.continuity.minTerminals) contOk = false
    if (prins.size < policy.continuity.minPrincipals) contOk = false
    if (acqs.size < policy.continuity.minAcquirers) contOk = false
    if (params.requireFullMeshContinuity) {
      if (terms.size < policy.continuity.referenceTerminals) contOk = false
      if (prins.size < policy.continuity.referencePrincipals) contOk = false
      for (const t of REFERENCE_TERMINALS.map((x) => x.terminalId as TerminalId)) {
        if (mine.filter((p) => p.terminalId === t).length < policy.continuity.minPaymentsPerCardTerminalMonth1) {
          contOk = false
        }
      }
    }
  }
  const ecmDates = payments.filter((p) => p.terminalId === 'Econometrica').map((p) => p.date)
  const segs = [false, false, false, false, false]
  for (const d of ecmDates) {
    const day = Number(d.slice(8, 10))
    if (day <= 7) segs[0] = true
    else if (day <= 14) segs[1] = true
    else if (day <= 21) segs[2] = true
    else if (day <= 28) segs[3] = true
    else segs[4] = true
  }
  if (params.requireFullMeshContinuity && segs.some((x) => !x)) contOk = false
  push('route_continuity', contOk, `cards=${cards.length} ecmSegs=${segs.filter(Boolean).length}`)

  // 11 lemon principal identity
  push(
    'lemon_principal_collapse',
    payments.every((p) => {
      if (p.terminalId !== 'BricsFNB' && p.terminalId !== 'BricsCapitec') return true
      return p.merchantPrincipalId === 'lemon_economics'
    }),
    'BricsFNB/BricsCapitec -> lemon_economics'
  )

  // Econometrica live ineligible
  const ecmLive = payments.filter((p) => p.terminalId === 'Econometrica' && p.liveExecutable)
  push('econometrica_not_live_without_mid', ecmLive.length === 0, 'modeled only until MID recorded')

  // totals
  push('month_total', Math.abs(totalV - params.expectedTotalZar) < 0.05, `total=${totalV}`)
  push('payment_count', totalN === params.expectedPaymentCount, `n=${totalN}`)

  const ok = gates.every((g) => g.pass)
  return { ok, gates }
}

export function computeLiquidity(payments: PlannedPayment[], bufferPct = OPERATING_POLICY_V1.liquidity.defaultOperatingBufferPct) {
  // Reference: assume settlement lag of 1 operating day for usable ZAR
  const byDate = new Map<string, number>()
  for (const p of payments) {
    byDate.set(p.date, (byDate.get(p.date) || 0) + p.amountZar)
  }
  let peak = 0
  let peakDate = ''
  for (const [date, v] of byDate) {
    if (v > peak) {
      peak = v
      peakDate = date
    }
  }
  // With 1-day lag, peak concurrent ≈ max daily issued (simplified orientation)
  const buffer = money(peak * bufferPct)
  return {
    peakUnsettledExposureZar: peak,
    peakAt: peakDate,
    assumedSettlementLatencyOperatingDays: 1,
    operatingBufferPct: bufferPct,
    operatingBufferZar: buffer,
    requiredWorkingLiquidityZar: money(peak + buffer),
  }
}
