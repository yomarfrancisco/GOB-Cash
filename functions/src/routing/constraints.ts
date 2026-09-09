/**
 * Admin feedback overlay for conversion routing.
 * Constraints filter the deterministic planner; they do not replace it.
 */

import type { RoutingState } from './conversionRouter'
import { formatSast, hasCalendarTimeReference, parseExpiresAt } from './routingTime'
import { cardLabel, machineLabel, resolveNamedCardIds, resolveNamedMachineIds } from './inventory'

export type ConstraintAction =
  | 'exclude_card'
  | 'exclude_machine'
  | 'restore_card'
  | 'restore_machine'
  | 'set_card_max'
  | 'set_card_min'
  | 'rest_card'
  | 'prefer_machine'
  | 'add_machine'
  | 'add_card'
  | 'set_global_max'

export type ConstraintScopeKind =
  | 'this_cycle'
  | 'n_cycles'
  | 'until_cleared'
  | 'until_date'
  | 'permanent'

export type RoutingIntent = {
  action: ConstraintAction
  resourceType: 'card' | 'machine' | 'config' | null
  resourceId: number | null
  value: number | null
  scope: ConstraintScopeKind
  nCycles: number | null
  expiresAt?: number | null
  summary: string
  confidence: number
}

export type InterpretResult = {
  intents: RoutingIntent[]
  clarification: string | null
  interpreter: 'llm' | 'fast_path'
}

export type StoredConstraint = {
  id: string
  feedbackId: string
  action:
    | 'exclude_card'
    | 'exclude_machine'
    | 'set_card_max'
    | 'set_card_min'
    | 'rest_card'
    | 'prefer_machine'
  resourceId: number
  value: number | null
  scope: ConstraintScopeKind
  remainingCycles: number | null
  expiresAt: number | null
  status: 'active' | 'expired' | 'cleared'
  summary: string
  createdAtCycle: number
}

export type RoutingOverlay = {
  excludedCardIds: number[]
  excludedMachineIds: number[]
  cardMaxById: Record<number, number>
  cardMinById: Record<number, number>
  preferredMachineIds: number[]
}

export const EMPTY_OVERLAY: RoutingOverlay = {
  excludedCardIds: [],
  excludedMachineIds: [],
  cardMaxById: {},
  cardMinById: {},
  preferredMachineIds: [],
}

const ACTIONS: ConstraintAction[] = [
  'exclude_card',
  'exclude_machine',
  'restore_card',
  'restore_machine',
  'set_card_max',
  'set_card_min',
  'rest_card',
  'prefer_machine',
  'add_machine',
  'add_card',
  'set_global_max',
]

const SCOPES: ConstraintScopeKind[] = [
  'this_cycle',
  'n_cycles',
  'until_cleared',
  'until_date',
  'permanent',
]

export function overlayFromConstraints(
  constraints: StoredConstraint[],
  nowMs = Date.now()
): RoutingOverlay {
  const overlay: RoutingOverlay = {
    excludedCardIds: [],
    excludedMachineIds: [],
    cardMaxById: {},
    cardMinById: {},
    preferredMachineIds: [],
  }
  for (const row of constraints) {
    if (row.status !== 'active') continue
    if (typeof row.expiresAt === 'number' && row.expiresAt <= nowMs) continue
    if (row.action === 'exclude_card' || row.action === 'rest_card') {
      overlay.excludedCardIds.push(row.resourceId)
    } else if (row.action === 'exclude_machine') {
      overlay.excludedMachineIds.push(row.resourceId)
    } else if (row.action === 'set_card_max' && typeof row.value === 'number') {
      overlay.cardMaxById[row.resourceId] = row.value
    } else if (row.action === 'set_card_min' && typeof row.value === 'number') {
      overlay.cardMinById[row.resourceId] = row.value
    } else if (row.action === 'prefer_machine') {
      overlay.preferredMachineIds.push(row.resourceId)
    }
  }
  return overlay
}

export function expireConstraintsByTime(
  constraints: StoredConstraint[],
  nowMs: number
): StoredConstraint[] {
  return constraints.map((row) => {
    if (row.status !== 'active') return row
    if (typeof row.expiresAt === 'number' && row.expiresAt <= nowMs) {
      return { ...row, status: 'expired' as const }
    }
    return row
  })
}

export function expireConstraints(
  constraints: StoredConstraint[],
  completedCycleNumber: number,
  nowMs = Date.now()
): StoredConstraint[] {
  const afterCycles = constraints.map((row) => {
    if (row.status !== 'active') return row
    if (row.scope === 'until_date') return row
    if (row.scope === 'this_cycle' && row.createdAtCycle <= completedCycleNumber) {
      return { ...row, status: 'expired' as const, remainingCycles: 0 }
    }
    if (row.scope === 'n_cycles') {
      const remaining = Math.max(0, (row.remainingCycles ?? 1) - 1)
      return {
        ...row,
        remainingCycles: remaining,
        status: remaining <= 0 ? ('expired' as const) : row.status,
      }
    }
    return row
  })
  return expireConstraintsByTime(afterCycles, nowMs)
}

export function normalizeStoredConstraint(raw: unknown): StoredConstraint | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.action !== 'string' || typeof data.resourceId !== 'number') return null
  const action = data.action as StoredConstraint['action']
  if (
    action !== 'exclude_card' &&
    action !== 'exclude_machine' &&
    action !== 'set_card_max' &&
    action !== 'set_card_min' &&
    action !== 'rest_card' &&
    action !== 'prefer_machine'
  ) {
    return null
  }
  const scope = SCOPES.includes(data.scope as ConstraintScopeKind)
    ? (data.scope as ConstraintScopeKind)
    : 'this_cycle'
  const status =
    data.status === 'expired' || data.status === 'cleared' ? data.status : 'active'
  return {
    id: typeof data.id === 'string' ? data.id : `constraint-${data.resourceId}`,
    feedbackId: typeof data.feedbackId === 'string' ? data.feedbackId : '',
    action,
    resourceId: data.resourceId,
    value: typeof data.value === 'number' ? data.value : null,
    scope,
    remainingCycles: typeof data.remainingCycles === 'number' ? data.remainingCycles : null,
    expiresAt: parseExpiresAt(data.expiresAt),
    status,
    summary: typeof data.summary === 'string' ? data.summary : `${action} ${data.resourceId}`,
    createdAtCycle: typeof data.createdAtCycle === 'number' ? data.createdAtCycle : 0,
  }
}

export function validateIntent(intent: RoutingIntent, state: RoutingState): string | null {
  if (!ACTIONS.includes(intent.action)) return `Unknown action ${intent.action}`
  if (!SCOPES.includes(intent.scope)) return `Unknown scope ${intent.scope}`
  if (intent.scope === 'n_cycles' && !(intent.nCycles && intent.nCycles > 0)) {
    return 'n_cycles scope requires a positive nCycles'
  }
  if (intent.scope === 'until_date') {
    if (!(typeof intent.expiresAt === 'number' && intent.expiresAt > Date.now())) {
      return 'until_date scope requires a future expiresAt'
    }
  }
  const cardCount = state.cards.length
  const machineCount = state.machines.length
  if (intent.action === 'exclude_card' || intent.action === 'restore_card' || intent.action === 'set_card_max' || intent.action === 'set_card_min' || intent.action === 'rest_card') {
    if (!intent.resourceId || intent.resourceId < 1 || intent.resourceId > cardCount) {
      return `${cardLabel(intent.resourceId ?? 0)} is not in the current inventory`
    }
  }
  if (intent.action === 'exclude_machine' || intent.action === 'restore_machine' || intent.action === 'prefer_machine') {
    if (!intent.resourceId || intent.resourceId < 1 || intent.resourceId > machineCount) {
      return `${machineLabel(intent.resourceId ?? 0)} is not in the current inventory`
    }
  }
  if ((intent.action === 'set_card_max' || intent.action === 'set_card_min' || intent.action === 'set_global_max') && !(typeof intent.value === 'number' && intent.value > 0)) {
    return `${intent.action} requires a positive amount`
  }
  if (intent.action === 'rest_card' && intent.scope === 'n_cycles' && !(intent.nCycles && intent.nCycles > 0)) {
    return 'rest_card needs a cycle count'
  }
  return null
}

export function sanitizeIntent(raw: unknown): RoutingIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const action = data.action
  if (typeof action !== 'string' || !ACTIONS.includes(action as ConstraintAction)) return null
  const scope = SCOPES.includes(data.scope as ConstraintScopeKind)
    ? (data.scope as ConstraintScopeKind)
    : 'this_cycle'
  const resourceId =
    typeof data.resourceId === 'number' && Number.isFinite(data.resourceId)
      ? Math.round(data.resourceId)
      : null
  const value =
    typeof data.value === 'number' && Number.isFinite(data.value) ? data.value : null
  const nCycles =
    typeof data.nCycles === 'number' && Number.isFinite(data.nCycles)
      ? Math.max(1, Math.round(data.nCycles))
      : null
  const expiresAt = parseExpiresAt(data.expiresAt)
  const summary =
    typeof data.summary === 'string' && data.summary.trim()
      ? data.summary.trim()
      : defaultSummary(action as ConstraintAction, resourceId, value, scope, nCycles, expiresAt)
  return {
    action: action as ConstraintAction,
    resourceType:
      data.resourceType === 'card' || data.resourceType === 'machine' || data.resourceType === 'config'
        ? data.resourceType
        : inferResourceType(action as ConstraintAction),
    resourceId,
    value,
    scope,
    nCycles,
    expiresAt,
    summary,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
  }
}

function inferResourceType(action: ConstraintAction): RoutingIntent['resourceType'] {
  if (action.includes('machine')) return 'machine'
  if (action === 'set_global_max' || action === 'add_card' || action === 'add_machine') return 'config'
  if (action.includes('card')) return 'card'
  return null
}

function defaultSummary(
  action: ConstraintAction,
  resourceId: number | null,
  value: number | null,
  scope: ConstraintScopeKind,
  nCycles: number | null,
  expiresAt: number | null = null
): string {
  const scopeText =
    scope === 'this_cycle'
      ? 'this cycle only'
      : scope === 'n_cycles'
        ? `the next ${nCycles} cycle${nCycles === 1 ? '' : 's'}`
        : scope === 'until_date'
          ? `until ${expiresAt ? formatSast(expiresAt) : 'the stated time'}`
        : scope === 'until_cleared'
          ? 'until manually restored'
          : 'from now on'
  if (action === 'exclude_card') return `${cardLabel(resourceId ?? 0)} excluded for ${scopeText}.`
  if (action === 'exclude_machine') return `${machineLabel(resourceId ?? 0)} unavailable for ${scopeText}.`
  if (action === 'restore_card') return `${cardLabel(resourceId ?? 0)} restored.`
  if (action === 'restore_machine') return `${machineLabel(resourceId ?? 0)} restored.`
  if (action === 'set_card_max') return `${cardLabel(resourceId ?? 0)} max set to R${value} for ${scopeText}.`
  if (action === 'set_global_max') return `Default max card size set to R${value}.`
  if (action === 'rest_card') return `${cardLabel(resourceId ?? 0)} resting for ${scopeText}.`
  if (action === 'prefer_machine') return `Prefer ${machineLabel(resourceId ?? 0)} for ${scopeText}.`
  if (action === 'add_machine') return 'Added a new machine to inventory.'
  if (action === 'add_card') return 'Added a new card to inventory.'
  return `${action} recorded for ${scopeText}.`
}

function clearMatching(
  constraints: StoredConstraint[],
  predicate: (row: StoredConstraint) => boolean
): StoredConstraint[] {
  return constraints.map((row) =>
    row.status === 'active' && predicate(row) ? { ...row, status: 'cleared' as const } : row
  )
}

export function applyIntentsToState(
  state: RoutingState,
  constraints: StoredConstraint[],
  intents: RoutingIntent[],
  cycleNumber: number,
  feedbackId: string
): { state: RoutingState; constraints: StoredConstraint[]; summaries: string[] } {
  let nextState = state
  let nextConstraints = [...constraints]
  const summaries: string[] = []

  for (const intent of intents) {
    if (intent.action === 'restore_card' && intent.resourceId) {
      nextConstraints = clearMatching(
        nextConstraints,
        (row) =>
          row.resourceId === intent.resourceId &&
          (row.action === 'exclude_card' || row.action === 'rest_card' || row.action === 'set_card_max' || row.action === 'set_card_min')
      )
      summaries.push(intent.summary)
      continue
    }
    if (intent.action === 'restore_machine' && intent.resourceId) {
      nextConstraints = clearMatching(
        nextConstraints,
        (row) =>
          row.resourceId === intent.resourceId &&
          (row.action === 'exclude_machine' || row.action === 'prefer_machine')
      )
      summaries.push(intent.summary)
      continue
    }
    if (intent.action === 'add_machine') {
      const id = nextState.machines.length + 1
      nextState = {
        ...nextState,
        config: { ...nextState.config, machineCount: id },
        machines: [
          ...nextState.machines,
          { id, activeCycles: 0, restCycles: 0, volume: 0, lastCycleUsed: 0 },
        ],
      }
      summaries.push(intent.summary)
      continue
    }
    if (intent.action === 'add_card') {
      const id = nextState.cards.length + 1
      nextState = {
        ...nextState,
        config: { ...nextState.config, cardCount: id },
        cards: [
          ...nextState.cards,
          { id, activeCycles: 0, restCycles: 0, volume: 0, lastCycleUsed: 0, machineHistory: [] },
        ],
      }
      summaries.push(intent.summary)
      continue
    }
    if (intent.action === 'set_global_max' && intent.value) {
      nextState = {
        ...nextState,
        config: { ...nextState.config, maxCardAmount: intent.value },
      }
      summaries.push(intent.summary)
      continue
    }

    const storedAction =
      intent.action === 'exclude_card' ||
      intent.action === 'exclude_machine' ||
      intent.action === 'set_card_max' ||
      intent.action === 'set_card_min' ||
      intent.action === 'rest_card' ||
      intent.action === 'prefer_machine'
        ? intent.action
        : null
    if (!storedAction || !intent.resourceId) continue

    nextConstraints = clearMatching(
      nextConstraints,
      (row) => row.resourceId === intent.resourceId && row.action === storedAction
    )
    const scope = intent.scope === 'permanent' ? 'until_cleared' : intent.scope
    const remainingCycles =
      scope === 'n_cycles' ? intent.nCycles : scope === 'this_cycle' ? 1 : null
    nextConstraints.push({
      id: `${feedbackId}-${nextConstraints.length + 1}`,
      feedbackId,
      action: storedAction,
      resourceId: intent.resourceId,
      value: intent.value,
      scope,
      remainingCycles,
      expiresAt: intent.expiresAt ?? null,
      status: 'active',
      summary: intent.summary,
      createdAtCycle: cycleNumber,
    })
    summaries.push(intent.summary)
  }

  return { state: nextState, constraints: nextConstraints, summaries }
}

export function parseFastPath(message: string): InterpretResult | null {
  const text = message.trim()
  if (!text) return null
  if (hasCalendarTimeReference(text)) return null
  const lower = text.toLowerCase()
  const intents: RoutingIntent[] = []

  const scope: ConstraintScopeKind = /\buntil (i |you )?(say|tell|restore)|from now on|permanently|anymore\b/.test(lower)
    ? /from now on|permanently/.test(lower)
      ? 'permanent'
      : 'until_cleared'
    : /\b(\d+)\s+cycles?\b/.test(lower)
      ? 'n_cycles'
      : /\b(this|next) cycle\b/.test(lower)
        ? 'this_cycle'
        : 'this_cycle'
  const nMatch = lower.match(/\b(\d+)\s+cycles?\b/)
  const nCycles = nMatch ? Number(nMatch[1]) : scope === 'n_cycles' ? 1 : null

  const restore = /\b(back|available again|restore|is up|online again)\b/.test(lower)
  const exclude = /\b(unavailable|blocked|down|lost|don'?t use|do not use|off|out|exclude|skip|resting|rest)\b/.test(lower)
  const prefer = /\b(use|prefer|instead)\b/.test(lower) && /\b(machine|fnb|capitec|imani)\b|\bm\s*\d/.test(lower)

  const cardIds = resolveNamedCardIds(text)
  const machineIds = resolveNamedMachineIds(text)
  const amountMatch = text.match(/\bR?\s*([\d,]+(?:\.\d+)?)\s*(k)?\b/i)
  let amount: number | null = null
  if (amountMatch && /\bmax\b|\bcap\b|\bonly handle\b|\blimit\b/.test(lower)) {
    amount = Number(amountMatch[1].replace(/,/g, ''))
    if (amountMatch[2]) amount *= 1000
  }

  if (/\banother machine|new machine|we now have another machine/.test(lower)) {
    intents.push({
      action: 'add_machine',
      resourceType: 'config',
      resourceId: null,
      value: null,
      scope: 'permanent',
      nCycles: null,
      summary: 'Added a new machine to inventory.',
      confidence: 0.7,
    })
  }

  if (restore) {
    for (const id of cardIds) {
      intents.push({
        action: 'restore_card',
        resourceType: 'card',
        resourceId: id,
        value: null,
        scope: 'this_cycle',
        nCycles: null,
        summary: `${cardLabel(id)} restored.`,
        confidence: 0.75,
      })
    }
    for (const id of machineIds) {
      intents.push({
        action: 'restore_machine',
        resourceType: 'machine',
        resourceId: id,
        value: null,
        scope: 'this_cycle',
        nCycles: null,
        summary: `${machineLabel(id)} restored.`,
        confidence: 0.75,
      })
    }
  } else if (amount && cardIds.length) {
    for (const id of cardIds) {
      intents.push({
        action: 'set_card_max',
        resourceType: 'card',
        resourceId: id,
        value: amount,
        scope,
        nCycles,
        summary: defaultSummary('set_card_max', id, amount, scope, nCycles),
        confidence: 0.7,
      })
    }
  } else if (/\bmax card size\b|\bmax(?:imum)? (?:card )?size\b/.test(lower) && amount) {
    intents.push({
      action: 'set_global_max',
      resourceType: 'config',
      resourceId: null,
      value: amount,
      scope: 'permanent',
      nCycles: null,
      summary: defaultSummary('set_global_max', null, amount, 'permanent', null),
      confidence: 0.7,
    })
  } else if (exclude && cardIds.length) {
    const rest = /\brest\b/.test(lower)
    for (const id of cardIds) {
      const action = rest ? 'rest_card' : 'exclude_card'
      intents.push({
        action,
        resourceType: 'card',
        resourceId: id,
        value: null,
        scope: rest && nCycles ? 'n_cycles' : scope,
        nCycles: rest ? nCycles || 1 : nCycles,
        summary: defaultSummary(action, id, null, rest && nCycles ? 'n_cycles' : scope, rest ? nCycles || 1 : nCycles),
        confidence: 0.72,
      })
    }
  } else if (exclude && machineIds.length) {
    for (const id of machineIds) {
      intents.push({
        action: 'exclude_machine',
        resourceType: 'machine',
        resourceId: id,
        value: null,
        scope,
        nCycles,
        summary: defaultSummary('exclude_machine', id, null, scope, nCycles),
        confidence: 0.72,
      })
    }
  } else if (prefer && machineIds.length) {
    for (const id of machineIds) {
      intents.push({
        action: 'prefer_machine',
        resourceType: 'machine',
        resourceId: id,
        value: null,
        scope: 'this_cycle',
        nCycles: null,
        summary: defaultSummary('prefer_machine', id, null, 'this_cycle', null),
        confidence: 0.65,
      })
    }
  }

  if (!intents.length) return null
  return { intents, clarification: null, interpreter: 'fast_path' }
}

export function usefulClarification(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim().toLowerCase()
  if (!t || t === 'null' || t === 'none' || t === 'short question' || t === 'clarification') return null
  if (t.includes('i am not sure how to apply that')) return null
  if (t.includes('name a card or machine and whether')) return null
  if (t.length < 16) return null
  return text.trim()
}

export function contextualClarify(
  assignments: Array<{ cardId: number; machineId: number }>
): string {
  const named = assignments
    .map((row) => `${cardLabel(row.cardId)} on ${machineLabel(row.machineId)}`)
    .join(', ')
  if (named) {
    return `This cycle currently uses ${named}. Tell me which card or machine to change, and whether it is unavailable, restored, capped, or resting.`
  }
  return 'Tell me which card or machine to change, and whether it is unavailable, restored, capped, or resting.'
}
