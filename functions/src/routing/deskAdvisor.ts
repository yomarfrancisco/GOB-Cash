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
  explainPosChoice,
  formatSwipeInstruction,
  formatZar,
  pairingKey,
  planCycle,
  planReplenish,
  previewAskImpact,
  receiveChoiceForSale,
  type CardAssignment,
  type RoutingState,
} from './conversionRouter'
import { parseReceiveHint } from './mozReceive'
import type { RecentCycleBrief, RecentFeedbackBrief } from './interpretContext'
import { cardLabel, cardShortName, formatReceiveAccount, resolveNamedCardIds } from './inventory'
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
    /\b(none of them|none are|none is safe|new consortium|new card is coming|retire|park (?:them|everything|all)|wait for a new card)\b/.test(
      text
    ) || /^\s*none\s*[.,!]?\s*$/.test(text)
  )
}

function mustSwipeAnyway(message: string): boolean {
  const text = message.trim().toLowerCase()
  return (
    /\b(have to swipe|must swipe|need to swipe|i have to swipe|assume i (?:have to|must)|just (?:pick|choose|use) (?:a |one )?card|use the safest|i have to use)\b/.test(
      text
    )
  )
}

function parseFreezeHorizonMs(message: string): number | null {
  const text = message.trim().toLowerCase()
  const months = text.match(/\b(\d+)\s*months?\b/)
  if (months) return Number(months[1]) * 30 * 86_400_000
  if (/\b(two months|a couple of months)\b/.test(text)) return 60 * 86_400_000
  const weeks = text.match(/\b(\d+)\s*weeks?\b/)
  if (weeks) return Number(weeks[1]) * 7 * 86_400_000
  const days = text.match(/\b(\d+)\s*days?\b/)
  if (days) return Number(days[1]) * 86_400_000
  return null
}

function isFreezeOutlookAsk(message: string): boolean {
  const text = message.trim().toLowerCase()
  if (!parseFreezeHorizonMs(message)) return false
  return (
    /\bwhat happens\b/.test(text) ||
    /\bif no cards?\b/.test(text) ||
    /\bnothing is coming\b/.test(text) ||
    /\bno cards? (?:are|is) possible\b/.test(text)
  )
}

function holdLabel(row: StoredConstraint, nowMs: number): string {
  if (row.scope === 'n_cycles' && row.remainingCycles != null) {
    return `${row.remainingCycles} conversion${row.remainingCycles === 1 ? '' : 's'} left`
  }
  if (row.scope === 'until_date' && typeof row.expiresAt === 'number' && row.expiresAt > nowMs) {
    return `until ${formatSast(row.expiresAt)}`
  }
  if (row.scope === 'this_cycle') return 'held off this restock'
  if (row.scope === 'until_cleared' || row.scope === 'permanent') return 'until you restore it'
  return 'parked'
}

function parkedSummary(holds: StoredConstraint[], nowMs: number): string {
  if (!holds.length) return 'every Moz card is parked'
  const scopes = new Set(holds.map((row) => row.scope))
  if (scopes.size === 1 && (holds[0].scope === 'this_cycle' || holds[0].scope === 'until_cleared')) {
    return `All ${holds.length} Moz cards are parked`
  }
  if (scopes.size === 1 && holds[0].scope === 'n_cycles') {
    return `All ${holds.length} Moz cards are parked, and those holds only lift after a conversion actually completes`
  }
  return holds.map((row) => `${cardLabel(row.resourceId)} (${holdLabel(row, nowMs)})`).join('; ')
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
  return assignments.map((row) => formatSwipeInstruction(row)).join('; ')
}

function posWhy(
  assignments: CardAssignment[],
  state: RoutingState,
  cycleNumber: number
): string {
  return assignments
    .map((row) => row.posReason || explainPosChoice(state, row, cycleNumber))
    .filter(Boolean)
    .join(' ')
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

function optionFromRecovery(
  recovery: RankedRecovery,
  index: number,
  state: RoutingState,
  cycleNumber: number
): DeskOption {
  const swipe = assignmentLine(recovery.assignments)
  const why = posWhy(recovery.assignments, state, cycleNumber)
  const last =
    recovery.daysSinceSwipe == null
      ? 'No dated swipe in this test.'
      : recovery.daysSinceSwipe === 0
        ? 'Last swiped today.'
        : `Last swiped ${recovery.daysSinceSwipe} day${recovery.daysSinceSwipe === 1 ? '' : 's'} ago.`
  const verb = recovery.kind === 'replenish' ? 'swipe' : 'then pay ZAR after MZN lands — first restock swipe'
  return {
    id: String(index + 1),
    title: `Use ${cardShortName(recovery.cardId)}`,
    body: `Restore ${cardShortName(recovery.cardId)} and ${verb} ${swipe}. ${why} ${last}`.trim(),
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

function freezeOutlookAdvice(state: RoutingState, message: string, nowMs: number): DeskAdvice {
  const horizonMs = parseFreezeHorizonMs(message) || 60 * 86_400_000
  const days = Math.max(1, Math.round(horizonMs / 86_400_000))
  const horizon =
    days >= 28
      ? `about ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}`
      : `${days} day${days === 1 ? '' : 's'}`
  const float = formatZar(state.availableCapital)
  const waiting = formatZar(state.bufferUsed)
  return {
    kind: 'next_step',
    title: `No swipe for ${horizon}`,
    body: [
      `If no Moz card can be swiped for ${horizon}, COST restock stops.`,
      `You can still sell ZAR after MZN lands, but only until the South African float is gone.`,
      `Right now that is ${float} available` +
        (state.bufferUsed > 0 ? `, with ${waiting} already waiting to be restocked.` : '.'),
      `After the float is gone you cannot pay the next operator at COST. This is not a card–POS list — it is a cash-position limit.`,
      `Name a card if a swipe still has to happen. Say “park them” if you want the desk locked until a new card exists.`,
    ].join(' '),
  }
}

function safestSwipeAdvice(
  state: RoutingState,
  constraints: StoredConstraint[],
  costRate: number,
  cycleNumber: number,
  recentCycles: RecentCycleBrief[],
  nowMs: number
): DeskAdvice {
  const restorableIds = [...new Set(activeCardHolds(constraints).map((row) => row.resourceId))]
  const cardIds = restorableIds.length ? restorableIds : state.cards.map((card) => card.id)
  const recoveries = recoveriesForCards(
    state,
    constraints,
    cardIds,
    costRate,
    cycleNumber,
    recentCycles,
    nowMs
  )
  if (!recoveries.length) {
    return {
      kind: 'question',
      title: 'Need a workable card',
      body: 'A swipe still cannot be issued: no parked card produces a legal card–POS pair. Name a card that is actually usable, or say if a new card is coming.',
      questionKind: 'which_card_safe',
    }
  }
  return adviceFromRecoveries(
    'You said a swipe still has to happen. This is the single safest pair the ledger can issue right now.',
    [recoveries[0]],
    state,
    cycleNumber
  )
}

function nextStepAdvice(
  route: {
    kind: 'replenish' | 'deploy'
    assignments: CardAssignment[]
    amountZar: number
  },
  state: RoutingState,
  cycleNumber: number,
  message: string
): DeskAdvice {
  const swipe = assignmentLine(route.assignments)
  if (route.kind === 'replenish') {
    const why = posWhy(route.assignments, state, cycleNumber)
    return {
      kind: 'next_step',
      title: 'Next: restock ZAR',
      body: `The open restock is one swipe: ${swipe}. ${why} Execute that. There is no second route to offer.`,
    }
  }
  const sell = planCycle(state)
  const receive =
    sell.deployedAmount > 0
      ? receiveChoiceForSale(state, sell, undefined, parseReceiveHint(message))
      : null
  const named = receive
    ? `receive MZN into ${formatReceiveAccount(receive.cardId)}`
    : 'receive MZN first'
  return {
    kind: 'next_step',
    title: 'Next: sell ZAR',
    body: [
      `The open route is one sale: ${named}, then pay ${formatZar(route.amountZar)}.`,
      receive?.reason,
      'Execute only after that Moz credit is in. There is no second route to offer.',
    ]
      .filter(Boolean)
      .join(' '),
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

  const parked = parkedSummary(holds, nowMs)
  return {
    kind: 'question',
    title: 'Need a card to continue',
    body: `${parked}. Which card is actually safe to swipe now? If none are, say a new card is coming.`,
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

function adviceFromRecoveries(
  lead: string,
  recoveries: RankedRecovery[],
  state: RoutingState,
  cycleNumber: number
): DeskAdvice {
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
  const options = picked.map((row, index) => optionFromRecovery(row, index, state, cycleNumber))
  const title =
    options.length === 1
      ? `Use ${cardShortName(best.cardId)}`
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
  if (wantsRetire(message) || mustSwipeAnyway(message) || isFreezeOutlookAsk(message)) return true
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

  if (isFreezeOutlookAsk(message)) return freezeOutlookAdvice(state, message, nowMs)
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
    return adviceFromRecoveries(`You named ${names}. I only offer a route the planner can actually issue.`, recoveries, state, cycleNumber)
  }

  if (mustSwipeAnyway(message) && !open) {
    return safestSwipeAdvice(state, constraints, costRate, cycleNumber, recentCycles, nowMs)
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

  if (open) return nextStepAdvice(open, state, cycleNumber, message)

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
