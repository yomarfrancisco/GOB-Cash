/**
 * Rank planned tickets using route beliefs (settlement history).
 * Does not change Confirm UX — only order / soft preference among legal tickets.
 */
import { assembleDecisionState } from '../belief/decision'
import { resolveRouteBelief } from '../belief/fold'
import type { RouteBeliefSnapshot, RouteEvidence } from '../belief/types'
import { buyerByDeskCardId, railByMachineId } from '../settlement/register'

export type RankableAssignment = {
  cardId: number
  machineId: number
  amount: number
}

function interrupted(belief: RouteBeliefSnapshot | null): boolean {
  if (!belief) return false
  return (
    belief.reviewState === 'under_review' ||
    belief.reviewState === 'delayed' ||
    belief.reviewState === 'pending'
  )
}

function scoreAssignment(
  row: RankableAssignment,
  belief: RouteBeliefSnapshot | null,
  pendingExposureZar: number
): number {
  const settle = belief?.finalSettlementRate ?? 0.45
  const margin = row.amount * 0.1
  let reviewPenalty = 0
  if (belief?.reviewState === 'under_review') reviewPenalty = 0.55
  else if (belief?.reviewState === 'delayed') reviewPenalty = 0.35
  else if (belief?.reviewState === 'pending') reviewPenalty = 0.2
  const ticketFit =
    belief?.largestRecentSuccessfulTicketZar != null
      ? row.amount <= belief.largestRecentSuccessfulTicketZar * 1.05
        ? 1
        : 0.65
      : 0.85
  const pendingDrag = pendingExposureZar > 20_000 ? (pendingExposureZar / 40_000) * margin * 0.1 : 0
  if (interrupted(belief)) return -1_000 + margin * 0.05
  return margin * settle * ticketFit - reviewPenalty * margin - pendingDrag
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

/** Stable re-rank: higher belief score first; ties keep original order. */
export function rankAssignmentsByBelief<T extends RankableAssignment>(
  assignments: T[],
  evidence: RouteEvidence[],
  pendingExposureZar = 0
): T[] {
  if (!assignments.length) return assignments
  const state = assembleDecisionState({
    evidence,
    usableZar: 1,
    authorisedResidualZar: 1,
    pendingExposureZar,
  })
  const scored = assignments.map((row, index) => {
    const belief = resolveRouteBelief(state.beliefs, routeKeys(row))
    return { row, index, score: scoreAssignment(row, belief, pendingExposureZar) }
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
