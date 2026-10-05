/**
 * Remaining-flow score: cold-start structural prior blended with learned
 * settlement probability and live bank COST / SELL economics.
 *
 * λ = 0 → pure tightness / cold prior (simulatable thin-data desk).
 * λ → 1 → belief + FX dominate; legal set still comes from Q-best / bank rules.
 */
import type { RouteBeliefSnapshot } from '../belief/types'
import { COST_MARKUP_BCI, costRateForBankMarkup } from '../fx/quotedMznZar'
import { costMarkupForDeskCardId } from '../settlement/register'

export type FlowScoreAssignment = {
  cardId: number
  machineId: number
  amount: number
}

export type FlowScoreBreakdown = {
  score: number
  lambda: number
  settleRate: number
  bankCostRate: number
  spreadPerZar: number
  expectedGrossMzn: number
  structural: number
  learned: number
  reviewPenalty: number
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** How far belief may override the structural prior for this pair. */
export function learningLambda(belief: RouteBeliefSnapshot | null | undefined): number {
  if (!belief) return 0
  const n = Math.max(0, belief.settlementEvidenceCount || 0)
  if (belief.settlementMaturity === 'cold' && n <= 0) return 0
  if (belief.settlementMaturity === 'established' || n >= 5) {
    return Math.min(0.85, 0.55 + 0.05 * Math.min(n, 6))
  }
  if (n <= 0) return 0.15
  return Math.min(0.55, 0.2 + 0.1 * n)
}

export function bankCostRateForCard(cardId: number, baseCostRate: number): number {
  if (!(baseCostRate > 0)) return 0
  const markup = costMarkupForDeskCardId(cardId)
  // baseCostRate is mid × BCI markup (1.05); scale to this card's bank.
  if (Math.abs(markup - COST_MARKUP_BCI) < 1e-9) return roundMoney(baseCostRate)
  return roundMoney(costRateForBankMarkup(baseCostRate, markup) || baseCostRate)
}

function interrupted(belief: RouteBeliefSnapshot | null | undefined): boolean {
  if (!belief) return false
  return (
    belief.reviewState === 'under_review' ||
    belief.reviewState === 'delayed' ||
    belief.reviewState === 'pending'
  )
}

/**
 * Score one remaining ticket. Higher is better.
 * `tightness` is the cold-start pairTightness (lower = quieter); omit when unknown.
 */
export function scoreFlowTicket(input: {
  amountZar: number
  cardId: number
  belief: RouteBeliefSnapshot | null
  sellRate: number
  baseCostRate: number
  pendingExposureZar?: number
  tightness?: number | null
}): FlowScoreBreakdown {
  const amount = Math.max(0, input.amountZar)
  const sell = input.sellRate > 0 ? input.sellRate : 0
  const bankCost = bankCostRateForCard(input.cardId, input.baseCostRate)
  const spreadPerZar = sell > 0 && bankCost > 0 ? roundMoney(Math.max(0, sell - bankCost)) : 0
  const expectedGrossMzn = roundMoney(amount * spreadPerZar)

  const coldSettle = 0.45
  const settleRate =
    input.belief &&
    input.belief.settlementEvidenceCount > 0 &&
    typeof input.belief.finalSettlementRate === 'number'
      ? Math.min(1, Math.max(0, input.belief.finalSettlementRate))
      : coldSettle

  let reviewPenalty = 0
  if (input.belief?.reviewState === 'under_review') reviewPenalty = 0.55
  else if (input.belief?.reviewState === 'delayed') reviewPenalty = 0.35
  else if (input.belief?.reviewState === 'pending') reviewPenalty = 0.2
  else if (input.belief?.reviewState === 'recovering') reviewPenalty = 0.15

  const ticketFit =
    input.belief?.largestRecentSuccessfulTicketZar != null
      ? amount <= input.belief.largestRecentSuccessfulTicketZar * 1.05
        ? 1
        : 0.65
      : 0.85

  const pending = Math.max(0, input.pendingExposureZar || 0)
  const pendingDrag = pending > 20_000 ? (pending / 40_000) * expectedGrossMzn * 0.1 : 0

  // Structural: prefer quieter pairs (low tightness). Scale so O(ticket margin).
  const tightness = typeof input.tightness === 'number' && Number.isFinite(input.tightness) ? input.tightness : 0
  const structural =
    expectedGrossMzn > 0
      ? expectedGrossMzn * (1 - Math.min(0.85, tightness / 12))
      : amount * 0.1 * (1 - Math.min(0.85, tightness / 12))

  const learned = expectedGrossMzn * settleRate * ticketFit - reviewPenalty * Math.max(expectedGrossMzn, amount * 0.05) - pendingDrag

  const lambda = learningLambda(input.belief)
  let score = (1 - lambda) * structural + lambda * learned

  if (interrupted(input.belief)) {
    // Still legal to rank, but strongly demote interrupted rails.
    score = -1_000 + Math.max(0, expectedGrossMzn) * 0.05 * Math.max(lambda, 0.15)
  }

  // Tiny bank COST preference when everything else ties (cheaper restock = better).
  if (bankCost > 0 && sell > 0) {
    score += (sell - bankCost) * 0.01 * amount * 0.001
  }

  return {
    score,
    lambda,
    settleRate,
    bankCostRate: bankCost,
    spreadPerZar,
    expectedGrossMzn,
    structural,
    learned,
    reviewPenalty,
  }
}

export function assignmentsFingerprint(
  rows: Array<{ cardId: number; machineId: number; amount: number }>
): string {
  return [...rows]
    .map((row) => `${row.cardId}:${row.machineId}:${Math.round(row.amount * 100) / 100}`)
    .sort()
    .join('|')
}

/**
 * When an outcome changes remaining pairs, replay Steps 1→N like a schedule amendment.
 * Never under awaiting_send (keypad may be open) or after committed ZAR.
 */
export function shouldReplayDayAfterFlowRevision(input: {
  deskStep: number
  cyclePhase?: string | null
  committedZar: number
  assignmentsChanged: boolean
  awaitingKind?: string | null
}): boolean {
  if (!input.assignmentsChanged) return false
  if (input.committedZar > 0) return false
  if (input.deskStep < 1 || input.deskStep > 4) return false
  if (input.cyclePhase === 'awaiting_send') return false
  if (input.awaitingKind === 'replenish') return false
  return true
}
