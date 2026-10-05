/**
 * Rank planned tickets using remaining-flow score (belief × live COST/SELL × structural prior).
 * Does not change Confirm UX — order / soft preference among legal tickets only.
 */
import { assembleDecisionState } from '../belief/decision'
import { resolveRouteBelief } from '../belief/fold'
import type { RouteBeliefSnapshot, RouteEvidence } from '../belief/types'
import { buyerByDeskCardId, railByMachineId } from '../settlement/register'
import { pairTightness } from './pathEngine'
import type { ExhaustionNote, PathResidual } from './pathEngine'
import type { RoutingState } from './conversionRouter'
import { scoreFlowTicket } from './flowScore'

export type RankableAssignment = {
  cardId: number
  machineId: number
  amount: number
}

export type FlowRankOptions = {
  sellRate?: number
  baseCostRate?: number
  pendingExposureZar?: number
  /** When set, structural tightness enters the cold-start side of λ. */
  state?: RoutingState | null
  notes?: ExhaustionNote[]
  residuals?: PathResidual[]
}

function routeKeys(row: RankableAssignment) {
  const buyer = buyerByDeskCardId(row.cardId)
  const rail = railByMachineId(row.machineId)
  const issuer = buyer?.issuingBank?.toLowerCase().includes('bim')
    ? 'bim'
    : buyer?.issuingBank?.toLowerCase().includes('bci')
      ? 'bci'
      : buyer?.issuingBank?.toLowerCase().includes('standard')
        ? 'standard'
        : buyer?.issuingBank?.toLowerCase().includes('fnb')
          ? 'fnb'
          : `card_${row.cardId}`
  const acquirer = rail?.acquirer || `pos_${row.machineId}`
  return {
    cardIssuerBankId: issuer,
    acquirerBankId: acquirer,
    pairId: `${issuer}__${acquirer}`,
    cardId: String(row.cardId),
    posTerminalId: String(row.machineId),
  }
}

function tightnessFor(
  row: RankableAssignment,
  options: FlowRankOptions
): number | null {
  if (!options.state) return null
  return pairTightness({
    state: options.state,
    cardId: row.cardId,
    machineId: row.machineId,
    notes: options.notes,
    residuals: options.residuals,
  }).tightness
}

/** Stable re-rank: higher flow score first; ties keep original order. */
export function rankAssignmentsByBelief<T extends RankableAssignment>(
  assignments: T[],
  evidence: RouteEvidence[],
  pendingExposureZarOrOptions: number | FlowRankOptions = 0
): T[] {
  if (!assignments.length) return assignments
  const options: FlowRankOptions =
    typeof pendingExposureZarOrOptions === 'number'
      ? { pendingExposureZar: pendingExposureZarOrOptions }
      : pendingExposureZarOrOptions || {}
  const pendingExposureZar = options.pendingExposureZar ?? 0
  const sellRate = options.sellRate && options.sellRate > 0 ? options.sellRate : 0
  const baseCostRate = options.baseCostRate && options.baseCostRate > 0 ? options.baseCostRate : 0

  const state = assembleDecisionState({
    evidence,
    usableZar: 1,
    authorisedResidualZar: 1,
    pendingExposureZar,
  })
  const scored = assignments.map((row, index) => {
    const belief = resolveRouteBelief(state.beliefs, routeKeys(row))
    const breakdown = scoreFlowTicket({
      amountZar: row.amount,
      cardId: row.cardId,
      belief,
      sellRate: sellRate || 4.62,
      baseCostRate: baseCostRate || 4.2,
      pendingExposureZar,
      tightness: tightnessFor(row, options),
    })
    return { row, index, score: breakdown.score }
  })
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })
  return scored.map((s) => s.row)
}

export function beliefHintForAssignments(
  assignments: RankableAssignment[],
  evidence: RouteEvidence[],
  pendingExposureZar = 0
): string | null {
  if (!assignments.length || !evidence.length) return null
  const state = assembleDecisionState({
    evidence,
    usableZar: 1,
    authorisedResidualZar: 1,
    pendingExposureZar,
  })
  const first = assignments[0]
  const belief = resolveRouteBelief(state.beliefs, routeKeys(first))
  if (!belief) return null
  if (belief.reviewState === 'under_review') {
    return 'This route recently entered bank review — prefer alternatives when the book allows.'
  }
  if (belief.reviewState === 'delayed') {
    return 'Settlement on this route has been delayed recently — keep the ticket sized to what has cleared.'
  }
  if (belief.settlementEvidenceCount > 0 && belief.largestRecentSuccessfulTicketZar != null) {
    return `This rail has settled usable ZAR recently (up to about R${Math.round(belief.largestRecentSuccessfulTicketZar).toLocaleString('en-ZA')}).`
  }
  if (belief.settlementMaturity === 'cold') {
    return 'Little settlement history on this rail yet — keeping tickets conservative.'
  }
  return null
}

export type { RouteBeliefSnapshot }
