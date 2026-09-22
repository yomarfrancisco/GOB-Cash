import { cardShortName, machineShortName } from './inventory'
import type { PathWrite } from './pathEngine'
import {
  advanceWindow,
  reportWindowOutcome,
  setWindowCapital,
  startWindow,
  WINDOW_SEED,
} from '../throughput/prospective/window'
import type { ProspectiveBranch, ProspectiveRoute } from '../throughput/prospective/types'

export const KERNEL_SEED = WINDOW_SEED
/** Persisted on each desk run. Ensure starts a new window when this does not match. */
export const ROUTING_ENGINE_ID = 'absorbing-tickets-v4'

type PersistedSnapshot = ProspectiveBranch['snapshot'] & {
  endingState?: unknown
  priorEndingState?: unknown
  endingStateJson?: string | null
  priorEndingStateJson?: string | null
}

/**
 * Firestore rejects arrays of arrays (learner.cov), but the learner state is what
 * picks tomorrow's rails. Carry it as a JSON string so the next advance sees the
 * same state the kernel would have in memory.
 */
export function persistWindow(window: ProspectiveBranch): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(window)) as ProspectiveBranch & { snapshot: PersistedSnapshot }
  if (raw.snapshot) {
    const { endingState, priorEndingState } = raw.snapshot
    raw.snapshot.endingStateJson = endingState == null ? null : JSON.stringify(endingState)
    raw.snapshot.priorEndingStateJson = priorEndingState == null ? null : JSON.stringify(priorEndingState)
    raw.snapshot.endingState = null
    raw.snapshot.priorEndingState = null
  }
  return nestArrayElements(raw) as Record<string, unknown>
}

export function hydrateWindow(raw: unknown): ProspectiveBranch | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const window = raw as ProspectiveBranch & { snapshot?: PersistedSnapshot }
  const snapshot = window.snapshot
  if (snapshot) {
    if (typeof snapshot.endingStateJson === 'string') {
      snapshot.endingState = JSON.parse(snapshot.endingStateJson)
    }
    if (typeof snapshot.priorEndingStateJson === 'string') {
      snapshot.priorEndingState = JSON.parse(snapshot.priorEndingStateJson)
    }
    delete snapshot.endingStateJson
    delete snapshot.priorEndingStateJson
  }
  return window as ProspectiveBranch
}

function nestArrayElements(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) =>
      Array.isArray(item)
        ? Object.fromEntries(item.map((entry, index) => [String(index), nestArrayElements(entry)]))
        : nestArrayElements(item)
    )
  }
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue
    out[key] = nestArrayElements(entry)
  }
  return out
}

export function kernelCardId(cardId: string): number {
  const n = Number(cardId.match(/(\d+)$/)?.[1])
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function kernelMachineId(posId: string): number {
  const n = Number(posId.match(/(\d+)$/)?.[1])
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function money(value: number): number {
  return Math.round(value * 100) / 100
}

export function assignmentsFromRoutes(routes: ProspectiveRoute[]) {
  return routes
    .map((route) => {
      const cardId = kernelCardId(route.cardId)
      const machineId = kernelMachineId(route.posId)
      if (!(cardId > 0) || !(machineId > 0)) return null
      return {
        cardId,
        machineId,
        amount: route.amountZar,
        economicPaymentId: route.economicPaymentId,
        posReason: `${route.cardName} → ${route.railLabel}`,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
}

function authorisedAmount(state: { authorisedZar?: number; availableCapital: number }): number {
  const authorised = Number.isFinite(state.authorisedZar) ? Number(state.authorisedZar) : state.availableCapital
  return money(Math.max(0, authorised))
}

function advanceToPrint(window: ProspectiveBranch): ProspectiveBranch {
  let next = advanceWindow(window)
  while (next.snapshot.days.at(-1)?.weekend && next.completedThroughDay < 14) {
    next = advanceWindow(next)
  }
  return next
}

export function resolveWindow(state: {
  window?: ProspectiveBranch
  windowNeedsAdvance?: boolean
  authorisedZar?: number
  availableCapital: number
  completedCycles?: number
  bufferUsed?: number
}): ProspectiveBranch {
  let window = state.window
  const amount = authorisedAmount(state)
  if (!window) {
    return startWindow({ availableZar: amount > 0 ? amount : state.availableCapital, seed: KERNEL_SEED })
  }
  const mondayStillOpen = (state.bufferUsed || 0) > 0
  const printAlreadySold = (state.completedCycles || 0) >= window.completedThroughDay
  if (window.snapshot.pendingShock || state.windowNeedsAdvance) return advanceToPrint(window)
  if (printAlreadySold && !mondayStillOpen) return advanceToPrint(window)
  return window
}

export function openWindowAtCapital<T extends {
  window?: ProspectiveBranch
  windowNeedsAdvance?: boolean
  authorisedZar: number
  availableCapital: number
}>(state: T, amountZar: number): T {
  const amount = money(amountZar)
  if (!(amount > 0)) return state
  const window = startWindow({ availableZar: amount, seed: KERNEL_SEED })
  return {
    ...state,
    authorisedZar: amount,
    availableCapital: window.availableZar,
    window,
    windowNeedsAdvance: false,
  }
}

export function shockWindowCapital<T extends {
  window?: ProspectiveBranch
  windowNeedsAdvance?: boolean
  authorisedZar: number
  availableCapital: number
  completedCycles?: number
}>(state: T, amountZar: number): T {
  const amount = money(amountZar)
  if (!(amount > 0)) return state
  if (!state.window || (state.completedCycles || 0) === 0) {
    return openWindowAtCapital(state, amount)
  }
  const window = setWindowCapital(state.window, amount)
  return {
    ...state,
    authorisedZar: amount,
    availableCapital: window.availableZar,
    window,
    windowNeedsAdvance: false,
  }
}

export function applyWindowPathWrite<T extends { window?: ProspectiveBranch }>(state: T, write: PathWrite): T {
  if (!state.window) return state
  const rail = write.machineId != null ? `rail ${write.machineId}` : undefined
  if (write.kind === 'rail_up' && !rail) return state
  if (write.kind !== 'rail_up' && !rail && write.kind !== 'unpaid') return state
  try {
    const window = reportWindowOutcome(state.window, {
      type: 'report_outcome',
      expectedDay: state.window.completedThroughDay,
      outcome: write.kind,
      rail,
      amountZar: write.amountZar ?? undefined,
    })
    return { ...state, window }
  } catch {
    return state
  }
}

export function markWindowRestocked<T extends { window?: ProspectiveBranch; availableCapital: number; windowNeedsAdvance?: boolean }>(
  state: T
): T {
  if (!state.window) return state
  return {
    ...state,
    windowNeedsAdvance: true,
    availableCapital: state.window.availableZar,
  }
}

export { cardShortName, machineShortName }
