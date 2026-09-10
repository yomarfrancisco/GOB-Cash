/**
 * Fact-based liquidity desk advice.
 * Offers one route when the ledger supports it, a question when a fact is missing,
 * and multiple options only when two recoveries score closely. Never pads to three.
 */

import {
  applyIntentsToState,
  overlayFromConstraints,
  type RoutingIntent,
  type StoredConstraint,
} from './constraints'
import {
  formatZar,
  pairingKey,
  planCycle,
  planReplenish,
  previewAskImpact,
  type CardAssignment,
  type RoutingState,
} from './conversionRouter'
import type { RecentCycleBrief, RecentFeedbackBrief } from './interpretContext'
import { cardLabel, machineLabel, resolveNamedCardIds } from './inventory'
import { formatSast, isWhatIfAsk, namesConstraintChange } from './routingTime'

export type DeskOption = {
  id: string
  title: string
  body: string
  intents: RoutingIntent[]
}

export type DeskAdvice = {
  kind: 'question' | 'options' | 'next_step'
  title: string
  body: string
  questionKind?: string
  options?: DeskOption[]
  recommendedOptionId?: string
}

export type DeskRouteSnapshot = {
  kind: 'replenish' | 'deploy'
  assignments: CardAssignment[]
  amountZar: number
}

type RankedRecovery = {
  cardId: number
  assignments: CardAssignment[]
  amountZar: number
  kind: 'replenish' | 'deploy'
  pairUses: number
  restCycles: number
  lastCycleUsed: number
  daysSinceSwipe: number | null
  score: number
}

function restoreIntent(cardId: number): RoutingIntent {
  return {
    action: 'restore_card',
    resourceType: 'card',
    resourceId: cardId,
    value: null,
    scope: 'this_cycle',
    nCycles: null,
    summary: `${cardLabel(cardId)} restored.`,
    confidence: 0.9,
  }
}

function restUntilClearedIntent(cardId: number): RoutingIntent {
  return {
    action: 'rest_card',
    resourceType: 'card',
    resourceId: cardId,
    value: null,
    scope: 'until_cleared',
    nCycles: null,
    summary: `${cardLabel(cardId)} parked until a new card is onboarded.`,
    confidence: 0.86,
  }
}

function lastSwipeFacts(
  cardId: number,
  recentCycles: RecentCycleBrief[],
  nowMs: number
): { atMs: number | null; days: number | null; cycleNumber: number | null } {
  const hit = recentCycles.find(
    (row) =>
      row.status === 'completed' &&
      row.assignments.some((assignment) => assignment.cardId === cardId) &&
      typeof row.completedAtMs === 'number'
  )
  if (!hit?.completedAtMs) return { atMs: null, days: null, cycleNumber: hit?.cycleNumber ?? null }
  const days = Math.max(0, Math.floor((nowMs - hit.completedAtMs) / 86_400_000))
  return { atMs: hit.completedAtMs, days, cycleNumber: hit.cycleNumber }
}

function activeCardHolds(constraints: StoredConstraint[]): StoredConstraint[] {
  return constraints.filter(
    (row) =>
      row.status === 'active' && (row.action === 'rest_card' || row.action === 'exclude_card')
  )
}

function pendingQuestion(recentFeedback: RecentFeedbackBrief[]): string | null {
  const row = recentFeedback.find((item) => item.status === 'question' && item.questionKind)
  return row?.questionKind || null
}

function wantsRetire(message: string): boolean {
  const text = message.trim().toLowerCase()
  return (
    /\b(none|no card|no cards|new card|new consortium|retire|park (?:them|everything|all)|wait for a new)\b/.test(
      text
    )
  )
}

function previewAfterRestoring(
  state: RoutingState,
  constraints: StoredConstraint[],
  cardIds: number[],
  costRate: number,
  cycleNumber: number
) {
  const applied = applyIntentsToState(
    state,
    constraints,
    cardIds.map(restoreIntent),
    cycleNumber,
    'desk-preview'
  )
  const overlay = overlayFromConstraints(applied.constraints)
  return previewAskImpact(state, overlay, costRate)
}

function routeFromPreview(
  preview: { replenishFirst: { cardAssignments: CardAssignment[]; amountZar: number } | null; nextPlan: { cardAssignments: CardAssignment[]; deployedAmount: number } | null }
): { kind: 'replenish' | 'deploy'; assignments: CardAssignment[]; amountZar: number } | null {
  const replenish = preview.replenishFirst
  if (replenish?.cardAssignments.length) {
    return { kind: 'replenish', assignments: replenish.cardAssignments, amountZar: replenish.amountZar }
  }
  const plan = preview.nextPlan
  if (plan?.cardAssignments.length && plan.deployedAmount > 0) {
    return { kind: 'deploy', assignments: plan.cardAssignments, amountZar: plan.deployedAmount }
  }
  return null
}

function assignmentLine(assignments: CardAssignment[]): string {
  return assignments
    .map((row) => `${cardLabel(row.cardId)} on ${machineLabel(row.machineId)} for ${formatZar(row.amount)}`)
    .join('; ')
}

function currentOpenRoute(
  state: RoutingState,
  constraints: StoredConstraint[],
  current: DeskRouteSnapshot | null,
  costRate: number
): { kind: 'replenish' | 'deploy'; assignments: CardAssignment[]; amountZar: number } | null {
  if (current?.assignments.length && current.amountZar > 0) {
    return current
  }
  const overlay = overlayFromConstraints(constraints)
  const replenish = planReplenish(state, costRate, overlay)
  if (replenish?.cardAssignments.length) {
    return { kind: 'replenish', assignments: replenish.cardAssignments, amountZar: replenish.amountZar }
  }
  const plan = planCycle(state, overlay)
  if (plan.cardAssignments.length && plan.deployedAmount > 0) {
    return { kind: 'deploy', assignments: plan.cardAssignments, amountZar: plan.deployedAmount }
  }
  return null
}

function rankRecovery(
  state: RoutingState,
  cardId: number,
  route: { kind: 'replenish' | 'deploy'; assignments: CardAssignment[]; amountZar: number },
  recentCycles: RecentCycleBrief[],
  nowMs: number
): RankedRecovery {
  const card = state.cards.find((row) => row.id === cardId)
  const pairUses = route.assignments.reduce(
    (sum, row) => sum + (state.pairings[pairingKey(row.cardId, row.machineId)] || 0),
    0
  )
  const swipe = lastSwipeFacts(cardId, recentCycles, nowMs)
  const restCycles = card?.restCycles ?? 0
  const lastCycleUsed = card?.lastCycleUsed ?? 0
  const daysSinceSwipe = swipe.days
  const recencyPenalty = daysSinceSwipe == null ? 8 : Math.max(0, 6 - daysSinceSwipe)
  const score = pairUses * 100 + recencyPenalty * 10 + lastCycleUsed - restCycles
  return {
    cardId,
    assignments: route.assignments,
    amountZar: route.amountZar,
    kind: route.kind,
    pairUses,
    restCycles,
    lastCycleUsed,
    daysSinceSwipe,
    score,
  }
}

function optionFromRecovery(recovery: RankedRecovery, index: number): DeskOption {
  const swipe = assignmentLine(recovery.assignments)
  const last =
    recovery.daysSinceSwipe == null
      ? 'No dated swipe in this test.'
      : recovery.daysSinceSwipe === 0
        ? 'Last swiped today.'
        : `Last swiped ${recovery.daysSinceSwipe} day${recovery.daysSinceSwipe === 1 ? '' : 's'} ago.`
  const heat =
    recovery.pairUses >= 3
      ? ` That card–POS pair has already been used ${recovery.pairUses} times.`
      : recovery.pairUses === 0
        ? ' That pair has not been used yet.'
        : ` Pair used ${recovery.pairUses} time${recovery.pairUses === 1 ? '' : 's'}.`
  const verb = recovery.kind === 'replenish' ? 'Swipe' : 'Then pay ZAR after MZN lands — first restock swipe'
  return {
    id: String(index + 1),
    title: `Use ${cardLabel(recovery.cardId).replace(/^[^ ]+ /, '')}`,
    body: `Restore ${cardLabel(recovery.cardId)} and ${verb.toLowerCase()} ${swipe}. ${last}${heat}`,
    intents: [restoreIntent(recovery.cardId)],
  }
}

function formatOptionsBody(lead: string, options: DeskOption[]): string {
  if (options.length === 1) {
    return [lead, '', options[0].body].filter(Boolean).join('\n').trim()
  }
  const lines = [lead, '']
  options.forEach((option, index) => {
    lines.push(`(${index + 1}) ${option.body}`)
  })
  lines.push('')
  lines.push(
    `Pursue Option 1 applies (${options[0].title}). Ask if you want option ${options
      .slice(1)
      .map((row) => row.id)
      .join(' or ')}.`
  )
  return lines.join('\n').trim()
}

function retireAdvice(state: RoutingState): DeskAdvice {
  const options: DeskOption[] = [
    {
      id: '1',
      title: 'Park all cards',
      body: 'Retire every Moz card until you Ask that a new consortium card is on inventory. No swipe until then.',
      intents: state.cards.map((card) => restUntilClearedIntent(card.id)),
    },
  ]
  return {
    kind: 'options',
    title: 'Park the desk',
    body: formatOptionsBody(
      'No current card is safe to swipe. The factual move is to stop restocking until a new card exists.',
      options
    ),
    options,
    recommendedOptionId: '1',
  }
}

function nextStepAdvice(route: {
  kind: 'replenish' | 'deploy'
  assignments: CardAssignment[]
  amountZar: number
}): DeskAdvice {
  const swipe = assignmentLine(route.assignments)
  if (route.kind === 'replenish') {
    return {
      kind: 'next_step',
      title: 'Next: restock ZAR',
      body: `The open route is one restock: swipe ${swipe}. Execute that. There is no second route to offer.`,
    }
  }
  return {
    kind: 'next_step',
    title: 'Next: sell ZAR',
    body: `The open route is one sale: receive MZN first, then pay ${formatZar(route.amountZar)}. ${swipe ? `Restock after that would use ${swipe}.` : ''} Execute only after the Moz credit is in. There is no second route to offer.`,
  }
}

function blockedQuestion(holds: StoredConstraint[], nowMs: number): DeskAdvice {
  const calendar = holds
    .filter((row) => typeof row.expiresAt === 'number' && (row.expiresAt as number) > nowMs)
    .sort((a, b) => (a.expiresAt as number) - (b.expiresAt as number))
  const soonest = calendar[0]
  const second = calendar[1]
  if (
    soonest?.expiresAt &&
    (!second?.expiresAt || (second.expiresAt as number) - soonest.expiresAt > 20 * 60 * 60 * 1000)
  ) {
    const when = formatSast(soonest.expiresAt)
    return {
      kind: 'next_step',
      title: 'Wait for a card',
      body: `${cardLabel(soonest.resourceId)} comes off rest ${when}. Nothing can be swiped before then — cycle-rest does not tick while the desk is jammed. If a different card is actually safe now, name it.`,
    }
  }

  const nCycleHolds = holds.filter((row) => row.scope === 'n_cycles' && (row.remainingCycles ?? 0) > 0)
  const parked = holds.length
    ? holds
        .map((row) => {
          const left =
            row.scope === 'n_cycles' && row.remainingCycles != null
              ? `${row.remainingCycles} cycles left`
              : row.scope === 'until_date' && row.expiresAt
                ? `until ${formatSast(row.expiresAt)}`
                : row.scope === 'until_cleared' || row.scope === 'permanent'
                  ? 'until restored'
                  : row.scope
          return `${cardLabel(row.resourceId)} (${left})`
        })
        .join('; ')
    : 'every Moz card'
  const cycleNote =
    nCycleHolds.length === holds.length && holds.length > 0
      ? ' Those cycle counts only drop after a conversion actually completes, so waiting does not unblock the desk.'
      : ''
  return {
    kind: 'question',
    title: 'Need a card to continue',
    body: `No swipe is possible: ${parked} are parked.${cycleNote}\n\nWhich card is actually safe to use this week? If none are, say that a new card is coming.`,
    questionKind: 'which_card_safe',
  }
}

function recoveriesForCards(
  state: RoutingState,
  constraints: StoredConstraint[],
  cardIds: number[],
  costRate: number,
  cycleNumber: number,
  recentCycles: RecentCycleBrief[],
  nowMs: number
): RankedRecovery[] {
  const unique = [...new Set(cardIds)]
  const ranked: RankedRecovery[] = []
  for (const cardId of unique) {
    const preview = previewAfterRestoring(state, constraints, [cardId], costRate, cycleNumber)
    const route = routeFromPreview(preview)
    if (!route) continue
    ranked.push(rankRecovery(state, cardId, route, recentCycles, nowMs))
  }
  return ranked.sort((a, b) => a.score - b.score || a.cardId - b.cardId)
}

function adviceFromRecoveries(lead: string, recoveries: RankedRecovery[]): DeskAdvice {
  if (!recoveries.length) {
    return {
      kind: 'question',
      title: 'Need a workable card',
      body: `${lead}\n\nRestoring the named card still does not produce a legal card–POS pair. Name another card, or say if a new consortium card is coming.`,
      questionKind: 'which_card_safe',
    }
  }
  const best = recoveries[0]
  const close = recoveries.filter((row, index) => index === 0 || row.score - best.score <= 25)
  const picked = close.slice(0, 3)
  const options = picked.map((row, index) => optionFromRecovery(row, index))
  const title =
    options.length === 1
      ? `Use ${cardLabel(best.cardId).replace(/^[^ ]+ /, '')}`
      : `${options.length} workable cards`
  return {
    kind: 'options',
    title,
    body: formatOptionsBody(lead, options),
    options,
    recommendedOptionId: options[0].id,
  }
}

export function isDeskChoiceReply(message: string): boolean {
  if (namesConstraintChange(message) || isWhatIfAsk(message)) return false
  if (wantsRetire(message)) return true
  const named = resolveNamedCardIds(message)
  if (!named.length) return false
  return message.trim().split(/\s+/).length <= 12
}

export function adviseDesk(params: {
  message: string
  state: RoutingState
  constraints: StoredConstraint[]
  current?: DeskRouteSnapshot | null
  recentCycles?: RecentCycleBrief[]
  recentFeedback?: RecentFeedbackBrief[]
  cycleNumber: number
  costRate: number
  nowMs: number
}): DeskAdvice {
  const {
    message,
    state,
    constraints,
    current = null,
    recentCycles = [],
    recentFeedback = [],
    cycleNumber,
    costRate,
    nowMs,
  } = params
  const holds = activeCardHolds(constraints)
  const namedCardIds = resolveNamedCardIds(message)
  const open = currentOpenRoute(state, constraints, current, costRate)
  const askedRetire = wantsRetire(message)
  const waitingOnCard = pendingQuestion(recentFeedback) === 'which_card_safe'

  if (askedRetire) return retireAdvice(state)

  if (namedCardIds.length) {
    const recoveries = recoveriesForCards(
      state,
      constraints,
      namedCardIds,
      costRate,
      cycleNumber,
      recentCycles,
      nowMs
    )
    const names = namedCardIds.map((id) => cardLabel(id)).join(', ')
    return adviceFromRecoveries(`You named ${names}. I only offer a route the planner can actually issue.`, recoveries)
  }

  if (waitingOnCard && !namedCardIds.length && !askedRetire) {
    if (holds.length) return blockedQuestion(holds, nowMs)
    return {
      kind: 'question',
      title: 'Need a card to continue',
      body: 'I still need a card name, or “none / new card” if the inventory should stay parked.',
      questionKind: 'which_card_safe',
    }
  }

  if (open) return nextStepAdvice(open)

  if (holds.length) {
    // Do not auto-pick a parked card. Cycle-rest cannot complete while jammed.
    // If a calendar lift is unique, say wait. Otherwise ask which card is safe.
    return blockedQuestion(holds, nowMs)
  }

  return {
    kind: 'question',
    title: 'Need a fact',
    body: 'I do not have an open restock or sale to recommend. Tell me which card or POS changed, or what you want to happen next.',
    questionKind: 'which_card_safe',
  }
}

export function deskPursueLabel(advice: DeskAdvice): string | null {
  if (advice.kind !== 'options' || !advice.options?.length) return null
  if (advice.options.length === 1) return 'Pursue'
  return 'Pursue Option 1'
}
