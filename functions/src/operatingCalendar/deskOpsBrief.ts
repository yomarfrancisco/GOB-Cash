/**
 * Compact operational fields for the existing Sam → Leo → Amina desk.
 * Appended to newly issued instructions only — historical bodies are left alone.
 */
import { OPERATING_POLICY_V1, OPERATING_POLICY_VERSION, networkDailyCeilingZar } from './operatingPolicyV1'
import type { ContinuityStateV1 } from './continuityState'
import { pendingExposureZar } from './continuityState'

export type DeskOpsBrief = {
  policyVersion: typeof OPERATING_POLICY_VERSION
  monthLabel: string
  operatingDayIndex: number
  operatingDayCount: number
  rollingViewDays: number
  ceilingTodayZar: number
  monthPlannedZar: number
  monthCompletedZar: number
  monthRemainingZar: number
  peakUnsettledExposureZar: number
  operatingBufferZar: number
  requiredWorkingLiquidityZar: number
  availableWorkingLiquidityZar: number
  workingLiquidityHeadroomZar: number
  pendingExposureZar: number
  earliestAttemptAt: string | null
  attemptTimeLabel: string | null
  routeReason: string | null
  replanReason: string | null
  cardMaturityNote: string | null
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function formatZar(n: number): string {
  return `R${money(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}

export function buildDeskOpsBrief(params: {
  monthLabel: string
  operatingDayIndex: number
  operatingDayCount: number
  networkState: ContinuityStateV1['networkState']
  monthPlannedZar: number
  monthCompletedZar: number
  peakUnsettledExposureZar: number
  continuity: ContinuityStateV1
  availableWorkingLiquidityZar: number
  earliestAttemptAt?: string | null
  attemptTimeLabel?: string | null
  routeReason?: string | null
  replanReason?: string | null
  cardIdForMaturity?: string | null
}): DeskOpsBrief {
  const ceilingTodayZar = networkDailyCeilingZar(params.operatingDayIndex, params.networkState)
  const bufferZar = money(params.peakUnsettledExposureZar * params.continuity.operatingBufferPct)
  const required = money(params.peakUnsettledExposureZar + bufferZar)
  const pending = pendingExposureZar(params.continuity)
  const stage = params.cardIdForMaturity
    ? params.continuity.cardMaturityStage[params.cardIdForMaturity]
    : null
  const cardMaturityNote =
    stage === 'A' || stage === 'B'
      ? `Card ${params.cardIdForMaturity} is on cold-start stage ${stage}`
      : null

  return {
    policyVersion: OPERATING_POLICY_VERSION,
    monthLabel: params.monthLabel,
    operatingDayIndex: params.operatingDayIndex,
    operatingDayCount: params.operatingDayCount,
    rollingViewDays: 14,
    ceilingTodayZar,
    monthPlannedZar: params.monthPlannedZar,
    monthCompletedZar: params.monthCompletedZar,
    monthRemainingZar: money(Math.max(0, params.monthPlannedZar - params.monthCompletedZar)),
    peakUnsettledExposureZar: params.peakUnsettledExposureZar,
    operatingBufferZar: bufferZar,
    requiredWorkingLiquidityZar: required,
    availableWorkingLiquidityZar: params.availableWorkingLiquidityZar,
    workingLiquidityHeadroomZar: money(params.availableWorkingLiquidityZar - required),
    pendingExposureZar: pending,
    earliestAttemptAt: params.earliestAttemptAt ?? null,
    attemptTimeLabel: params.attemptTimeLabel ?? null,
    routeReason: params.routeReason ?? null,
    replanReason: params.replanReason ?? null,
    cardMaturityNote,
  }
}

/** One short paragraph for activity body — does not rewrite older events. */
export function formatDeskOpsLines(brief: DeskOpsBrief): string {
  const bits: string[] = []
  if (brief.attemptTimeLabel) {
    bits.push(`Attempt from ${brief.attemptTimeLabel} SAST`)
  }
  bits.push(
    `Day ${brief.operatingDayIndex}/${brief.operatingDayCount} · ceiling today ${formatZar(brief.ceilingTodayZar)}`
  )
  bits.push(
    `Month remaining ${formatZar(brief.monthRemainingZar)} of ${formatZar(brief.monthPlannedZar)}`
  )
  bits.push(
    `Liquidity need ${formatZar(brief.requiredWorkingLiquidityZar)} (peak unsettled ${formatZar(brief.peakUnsettledExposureZar)} + buffer ${formatZar(brief.operatingBufferZar)}); headroom ${formatZar(brief.workingLiquidityHeadroomZar)}`
  )
  if (brief.routeReason) bits.push(brief.routeReason)
  if (brief.replanReason) bits.push(brief.replanReason)
  if (brief.cardMaturityNote) bits.push(brief.cardMaturityNote)
  bits.push(`Policy ${OPERATING_POLICY_V1.version}`)
  return bits.join(' · ')
}
