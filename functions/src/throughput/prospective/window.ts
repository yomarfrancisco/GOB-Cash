import { bookTotalZar, buildAbsorbingPaymentBook } from '../model/prospectiveBook'
import { roundMoney } from '../model/math'
import { applyOutcome, mergeDayTickets, reconcileResiduals, residualTickets } from './outcomes'
import { prospectiveScenario, runProspectiveDay } from './runDay'
import { jsonClone } from './snapshot'
import { applyPendingToRun, withRebuiltRemaining } from './shocks'
import {
  nextDayAfter,
  phaseForCompletedDay,
  PROSPECTIVE_HORIZON_DAYS,
  PROSPECTIVE_QUOTE_MZN_PER_ZAR,
  PROSPECTIVE_SEED,
  type ProspectiveBranch,
  type ProspectiveDayRecord,
  type ProspectiveProposedAction,
  type ProspectiveShock,
  type ProspectiveSnapshot,
} from './types'

export { bookTotalZar }

export const WINDOW_SEED = PROSPECTIVE_SEED
export const WINDOW_HORIZON_DAYS = PROSPECTIVE_HORIZON_DAYS

function nowIso(): string {
  return new Date().toISOString()
}

function totalsFrom(offeredZar: number, days: ProspectiveDayRecord[]): ProspectiveSnapshot['totals'] {
  const settledZar = roundMoney(days.reduce((sum, day) => sum + day.settledZar, 0))
  return {
    offeredZar,
    settledZar,
    considerationMzn: roundMoney(settledZar * PROSPECTIVE_QUOTE_MZN_PER_ZAR),
    marginRetainedZar: roundMoney(settledZar * 0.1),
    outstandingZar: roundMoney(days.at(-1)?.availableAfterZar ?? offeredZar),
    reviews: [...new Set(days.flatMap((day) => day.reviews))],
  }
}

function emptySnapshot(amountZar: number): ProspectiveSnapshot {
  return {
    book: {},
    endingState: null,
    priorEndingState: null,
    days: [],
    totals: totalsFrom(amountZar, []),
    shocks: [],
    pendingShock: null,
    pendingConfirm: null,
    residuals: [],
    exhaustionNotes: [],
  }
}

export function startWindow(input: {
  availableZar: number
  seed?: number
  at?: string
}): ProspectiveBranch {
  const amountZar = roundMoney(input.availableZar)
  if (!(amountZar > 0)) throw new Error('opening amount must be a positive ZAR figure')
  const seed = input.seed ?? PROSPECTIVE_SEED
  const scenario = prospectiveScenario({ seed, availableZar: amountZar })
  const book = buildAbsorbingPaymentBook({
    scenario,
    availableZar: amountZar,
    horizonDays: PROSPECTIVE_HORIZON_DAYS,
  })
  const first = runProspectiveDay({
    day: 1,
    availableZar: amountZar,
    tickets: book[1] ?? [],
    seed,
    previousState: null,
  })
  const at = input.at ?? nowIso()
  return {
    branchId: `window:${seed}:${amountZar}`,
    cycleId: 'desk',
    operatorId: 'za',
    openingAmountZar: amountZar,
    quotedMznPerZar: PROSPECTIVE_QUOTE_MZN_PER_ZAR,
    seed,
    completedThroughDay: 1,
    phase: phaseForCompletedDay(1),
    availableZar: first.availableZar,
    snapshot: jsonClone({
      ...emptySnapshot(amountZar),
      book,
      endingState: first.endingState,
      priorEndingState: null,
      days: [first.record],
      totals: totalsFrom(amountZar, [first.record]),
    }),
    createdAt: at,
    updatedAt: at,
  }
}

export function advanceWindow(branch: ProspectiveBranch, at = nowIso()): ProspectiveBranch {
  if (branch.completedThroughDay <= 0) {
    throw new Error('start Day 1 before advancing')
  }
  const next = nextDayAfter(branch.completedThroughDay)
  if (next == null) return branch
  const pending = applyPendingToRun(branch, next)
  const day = runProspectiveDay({
    day: next,
    availableZar: pending.availableZar,
    tickets: pending.tickets,
    seed: branch.seed,
    previousState: branch.snapshot.endingState,
    maxPrintZar: pending.maxPrintZar,
  })
  const days = [...branch.snapshot.days, day.record]
  const residuals = reconcileResiduals(branch.snapshot.residuals ?? [], day.record.routes, next)
  const shock = branch.snapshot.pendingShock?.day === next ? branch.snapshot.pendingShock : null
  const book =
    shock?.kind === 'print'
      ? withRebuiltRemaining({ ...branch, snapshot: { ...branch.snapshot, days } }, next + 1, day.availableZar)
      : branch.snapshot.book
  return {
    ...branch,
    completedThroughDay: next,
    phase: phaseForCompletedDay(next),
    availableZar: day.availableZar,
    snapshot: jsonClone({
      ...branch.snapshot,
      book,
      endingState: day.endingState,
      priorEndingState: branch.snapshot.endingState,
      days,
      totals: totalsFrom(branch.openingAmountZar, days),
      pendingShock: null,
      pendingConfirm: null,
      residuals,
      shocks: shock ? [...(branch.snapshot.shocks ?? []), { ...shock, rewind: false }] : branch.snapshot.shocks,
    }),
    updatedAt: at,
  }
}

/** `$` / capitalShock: rebuild the remaining absorbing book. Does not replay completed days. */
export function setWindowCapital(
  branch: ProspectiveBranch,
  amountZar: number,
  at = nowIso()
): ProspectiveBranch {
  const nextAmount = roundMoney(amountZar)
  if (!(nextAmount > 0)) throw new Error('window capital must be a positive ZAR figure')
  const next = nextDayAfter(branch.completedThroughDay)
  if (next == null) {
    return { ...branch, availableZar: nextAmount, updatedAt: at }
  }
  const shock: ProspectiveShock = {
    kind: 'capital',
    day: next,
    amountZar: nextAmount,
    at,
    rewind: false,
  }
  return {
    ...branch,
    availableZar: nextAmount,
    snapshot: jsonClone({
      ...branch.snapshot,
      book: withRebuiltRemaining(branch, next, nextAmount),
      pendingShock: shock,
      pendingConfirm: null,
    }),
    updatedAt: at,
  }
}

export function reportWindowOutcome(
  branch: ProspectiveBranch,
  action: ProspectiveProposedAction,
  at = nowIso()
): ProspectiveBranch {
  return applyOutcome(branch, action, at)
}

export function dayRoutes(branch: ProspectiveBranch, day: number) {
  return branch.snapshot.days.find((row) => row.day === day)?.routes ?? []
}

export function mergeTicketsForDay(branch: ProspectiveBranch, day: number) {
  return mergeDayTickets(branch.snapshot.book[day] ?? [], residualTickets(branch))
}
