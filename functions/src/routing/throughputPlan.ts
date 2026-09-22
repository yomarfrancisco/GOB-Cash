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
export const ROUTING_ENGINE_ID = 'absorbing-tickets-v1'

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
}): ProspectiveBranch {
  let window = state.window
  const amount = authorisedAmount(state)
  if (!window) {
    return startWindow({ availableZar: amount > 0 ? amount : state.availableCapital, seed: KERNEL_SEED })
  }
  if (window.snapshot.pendingShock) return advanceToPrint(window)
  if (state.windowNeedsAdvance) return advanceToPrint(window)
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
