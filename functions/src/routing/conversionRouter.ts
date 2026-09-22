/**
 * Generalized conversion routing engine.
 *
 * Plans card/machine assignments for a conversion cycle. It does not execute
 * FX. Cycle timing is supplied by the caller — this module never advances
 * because a clock ticked.
 */

import { EMPTY_OVERLAY, type RoutingOverlay } from './constraints'
import {
  expectedSpreadMzn,
  fallbackQuote,
  legalPairs,
  openResiduals,
  parseFrozenQuote,
  pickQBestPair,
  zarProfitFromQuote,
  type FrozenQuote,
  type PathBook,
  type PathResidual,
  type TightnessRank,
} from './pathEngine'
import { assignmentsFromRoutes, markWindowRestocked, resolveWindow, shockWindowCapital } from './throughputPlan'
import type { ProspectiveBranch } from '../throughput/prospective/types'
import { cardShortName, DEFAULT_CARDS, isForbiddenPair, machineShortName } from './inventory'

/**
 * Desk configuration. Ticket sizes, card counts and capital come from the
 * Throughput kernel's absorbing book; only the spread fallback, the window
 * length and the rail inventory size live here.
 */
export type RoutingConfig = {
  machineCount: number
  spread: number
  recycleRate: number
  cycleCount: number
}

export const DEFAULT_TEST_CONFIG: RoutingConfig = {
  machineCount: 4,
  spread: 0.10,
  recycleRate: 1,
  cycleCount: 14,
}

export type CardState = {
  id: number
  activeCycles: number
  restCycles: number
  volume: number
  lastCycleUsed: number
  machineHistory: number[]
}

export type MachineState = {
  id: number
  activeCycles: number
  restCycles: number
  volume: number
  lastCycleUsed: number
}

export const ROUTING_DECISION_VERSION = 'routing_decision_v1'

export type RoutingDecision = {
  selectedCardId: number
  selectedMachineId: number
  selectedAt: number
  selectionReason: string
  eligibleAlternatives: Array<{ machineId: number; volume: number; pairUseCount: number }>
  excludedAlternatives: Array<{ machineId: number; reason: string }>
  relevantConstraints: string[]
  machineVolumesAtDecision: Record<string, number>
  pairUseCountsAtDecision: Record<string, number>
  cardRestStateAtDecision: {
    activeCycles: number
    restCycles: number
    lastCycleUsed: number
  }
  decisionVersion: string
  quote?: FrozenQuote
  residualsConsidered?: PathResidual[]
  tightnessRanks?: TightnessRank[]
}

export type CardAssignment = {
  cardId: number
  machineId: number
  amount: number
  posReason?: string
  routingDecision?: RoutingDecision
  economicPaymentId?: string
}

export type RoutingState = {
  config: RoutingConfig
  availableCapital: number
  bufferUsed: number
  completedCycles: number
  cumulativeDeployed: number
  cumulativeSpread: number
  cards: CardState[]
  machines: MachineState[]
  pairings: Record<string, number>
  authorisedZar: number
  cycledZar: number
  mznInventory: number
  window?: ProspectiveBranch
  windowNeedsAdvance?: boolean
}

export type CyclePlan = {
  cycleNumber: number
  availableCapital: number
  deployedAmount: number
  idleCapital: number
  expectedProfit: number
  cardCountUsed: number
  cardAssignments: CardAssignment[]
  restingCardIds: number[]
  restingMachineIds: number[]
  /** ZAR sold this window and not yet restocked. */
  bufferUsedBefore: number
  /** True when the sold tickets must be swiped back at COST before the next weekday. */
  bufferActionRequired: boolean
  selectionReason: string
  quote?: FrozenQuote
  holdReason?: string
  residualsConsidered?: PathResidual[]
  tightnessRanks?: TightnessRank[]
  expectedZarProfit?: number
  window?: ProspectiveBranch
}

export type CompletedCycle = CyclePlan & {
  actualProfit: number
  status: 'completed'
}

const VOLUME_BALANCE_BUCKET = 1_000

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function pairingKey(cardId: number, machineId: number): string {
  return `${cardId}:${machineId}`
}

export function formatZar(amount: number): string {
  const rounded = roundMoney(amount)
  const nearestInt = Math.round(rounded)
  const useInt = Math.abs(rounded - nearestInt) < 0.005
  const formatted = (useInt ? nearestInt : rounded).toLocaleString('en-US', {
    minimumFractionDigits: useInt ? 0 : 2,
    maximumFractionDigits: useInt ? 0 : 2,
  })
  return `R${formatted}`
}

export function formatSpreadPercent(spread: number): string {
  const pct = roundMoney(spread * 100)
  const nearestInt = Math.round(pct)
  const useInt = Math.abs(pct - nearestInt) < 0.05
  return `${useInt ? nearestInt : pct}%`
}

/** Cards on the desk are the kernel's Moz cards (see inventory); capital arrives with `$`. */
export function createInitialState(
  config: RoutingConfig = DEFAULT_TEST_CONFIG,
  capitalZar = 0
): RoutingState {
  return {
    config,
    availableCapital: roundMoney(capitalZar),
    bufferUsed: 0,
    completedCycles: 0,
    cumulativeDeployed: 0,
    cumulativeSpread: 0,
    cards: DEFAULT_CARDS.map((card) => ({
      id: card.id,
      activeCycles: 0,
      restCycles: 0,
      volume: 0,
      lastCycleUsed: 0,
      machineHistory: [],
    })),
    machines: Array.from({ length: config.machineCount }, (_, i) => ({
      id: i + 1,
      activeCycles: 0,
      restCycles: 0,
      volume: 0,
      lastCycleUsed: 0,
    })),
    pairings: {},
    authorisedZar: roundMoney(capitalZar),
    cycledZar: 0,
    mznInventory: 0,
  }
}

export type CapitalShock = {
  kind: 'sell_zar' | 'add_zar' | 'add_mzn'
  amountZar?: number
  amountMzn?: number
}

export function residualToTarget(state: RoutingState): number {
  const authorised = Number.isFinite(state.authorisedZar) ? state.authorisedZar : state.availableCapital
  const cycled = Number.isFinite(state.cycledZar) ? state.cycledZar : 0
  return roundMoney(Math.max(0, authorised - cycled))
}

export function applyCapitalShock(state: RoutingState, shock: CapitalShock): RoutingState {
  if (shock.kind === 'sell_zar') {
    const amount = roundMoney(shock.amountZar || 0)
    if (!(amount > 0)) return state
    return shockWindowCapital(state, amount)
  }
  if (shock.kind === 'add_zar') {
    const amount = roundMoney(shock.amountZar || 0)
    if (!(amount > 0)) return state
    return {
      ...state,
      availableCapital: roundMoney(state.availableCapital + amount),
    }
  }
  const mzn = roundMoney(shock.amountMzn || 0)
  if (!(mzn > 0)) return state
  return {
    ...state,
    mznInventory: roundMoney((state.mznInventory || 0) + mzn),
  }
}

export function applyRestockLanding(state: RoutingState, amountZar: number): RoutingState {
  const amount = roundMoney(amountZar)
  if (!(amount > 0)) return state
  return markWindowRestocked({
    ...state,
    cycledZar: roundMoney((state.cycledZar || 0) + amount),
  })
}

function mandateLine(state: RoutingState | undefined): string {
  const residual = state ? residualToTarget(state) : 0
  const authorised = state
    ? Number.isFinite(state.authorisedZar)
      ? state.authorisedZar
      : state.availableCapital
    : 0
  return `Still to convert ${formatZar(residual)} of ${formatZar(authorised)}.`
}

function residualLead(
  state: RoutingState | undefined,
  cycleNumber: number,
  cycleCount: number,
  shockLine?: string
): string[] {
  const lines = [`${mandateLine(state)} Weekday ${cycleNumber} of ${cycleCount}.`]
  if (shockLine) lines.push(shockLine)
  lines.push('')
  return lines
}

/** Restock card: the tickets being swiped back are the previous weekday's sale. */
function restockLead(state: RoutingState | undefined, nextCycle: number, cycleCount: number): string[] {
  const soldDay = Math.max(1, nextCycle - 1)
  return [
    `${mandateLine(state)} Restocking weekday ${soldDay}'s tickets before weekday ${nextCycle} of ${cycleCount}.`,
    '',
  ]
}

function onionLines(assignments: CardAssignment[], verb: 'send' | 'swipe'): string[] {
  if (!assignments.length) return []
  if (assignments.length === 1) {
    const row = assignments[0]
    return [
      verb === 'swipe'
        ? `This round: swipe ${swipeInstruction(row)}.`
        : `This round: ${swipeInstruction(row)}.`,
    ]
  }
  return [
    `This round — ${assignments.length} tickets:`,
    ...assignments.map((row) =>
      verb === 'swipe' ? `- Swipe ${swipeInstruction(row)}.` : `- ${swipeInstruction(row)}.`
    ),
  ]
}

function machineLoadTargets(
  state: RoutingState,
  cardCount: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY
): Map<number, number> {
  const loads = new Map<number, number>()
  const excluded = new Set(overlay.excludedMachineIds)
  const preferred = new Set(overlay.preferredMachineIds)
  const ranked = [...state.machines]
    .filter((machine) => !excluded.has(machine.id))
    .sort((a, b) => {
    const aPreferred = preferred.has(a.id) ? 0 : 1
    const bPreferred = preferred.has(b.id) ? 0 : 1
    if (aPreferred !== bPreferred) return aPreferred - bPreferred
    if (a.volume !== b.volume) return a.volume - b.volume
    if (a.activeCycles !== b.activeCycles) return a.activeCycles - b.activeCycles
    if (a.lastCycleUsed !== b.lastCycleUsed) return a.lastCycleUsed - b.lastCycleUsed
    return a.id - b.id
  })

  if (!ranked.length) return loads
  if (cardCount <= ranked.length) {
    ranked.forEach((machine) => loads.set(machine.id, 1))
    return loads
  }

  const base = Math.floor(cardCount / ranked.length)
  let extra = cardCount % ranked.length
  for (const machine of ranked) {
    const extraSlot = extra > 0 ? 1 : 0
    loads.set(machine.id, base + extraSlot)
    if (extra > 0) extra -= 1
  }
  return loads
}

function pairUseCount(state: RoutingState, cardId: number, machineId: number): number {
  return state.pairings[pairingKey(cardId, machineId)] || 0
}

function pairUsePhrase(count: number): string {
  if (count <= 0) return 'never'
  if (count === 1) return 'once'
  return `${count} times`
}

function comparePosCandidates(
  state: RoutingState,
  cardId: number,
  a: MachineState,
  b: MachineState,
  cycleNumber: number,
  preferred: Set<number>,
  assignedVolume: Map<number, number>
): number {
  const aPreferred = preferred.has(a.id) ? 0 : 1
  const bPreferred = preferred.has(b.id) ? 0 : 1
  if (aPreferred !== bPreferred) return aPreferred - bPreferred
  const aProjected = a.volume + (assignedVolume.get(a.id) || 0)
  const bProjected = b.volume + (assignedVolume.get(b.id) || 0)
  const aBucket = Math.floor(aProjected / VOLUME_BALANCE_BUCKET)
  const bBucket = Math.floor(bProjected / VOLUME_BALANCE_BUCKET)
  if (aBucket !== bBucket) return aBucket - bBucket
  const aPair = pairUseCount(state, cardId, a.id)
  const bPair = pairUseCount(state, cardId, b.id)
  if (aPair !== bPair) return aPair - bPair
  if (aProjected !== bProjected) return aProjected - bProjected
  const aJustUsed = a.lastCycleUsed === cycleNumber - 1
  const bJustUsed = b.lastCycleUsed === cycleNumber - 1
  if (aJustUsed !== bJustUsed) return aJustUsed ? 1 : -1
  if (a.lastCycleUsed !== b.lastCycleUsed) return a.lastCycleUsed - b.lastCycleUsed
  return a.id - b.id
}

function bannedPosNames(state: RoutingState, cardId: number): string[] {
  return state.machines.filter((machine) => isForbiddenPair(cardId, machine.id)).map((machine) => machineShortName(machine.id))
}

function sameIdentityReason(card: string, pos: string, banned: string[]): string | null {
  if (!banned.length) return null
  const listed = banned.join(' and ')
  const verb = banned.length === 1 ? 'is' : 'are'
  const noun = banned.length === 1 ? 'it is a same-identity pair' : 'they are same-identity pairs'
  return `${listed} ${verb} unavailable for ${card} because ${noun}, so ${pos} is the best eligible option.`
}

function describePosPick(params: {
  state: RoutingState
  cardId: number
  chosen: MachineState
  runnerUp: MachineState | undefined
  cycleNumber: number
  overlay: RoutingOverlay
  assignedVolume: Map<number, number>
  detail?: 'card' | 'ranking'
}): string {
  const { state, cardId, chosen, runnerUp, cycleNumber, overlay, assignedVolume } = params
  const detail = params.detail || 'card'
  const card = cardShortName(cardId)
  const pos = machineShortName(chosen.id)
  const prefix = `${card} → ${pos}`
  const preferred = new Set(overlay.preferredMachineIds)
  const banned = bannedPosNames(state, cardId)
  if (detail === 'card') {
    const identity = sameIdentityReason(card, pos, banned)
    if (identity) return `${prefix} — ${identity}`
    if (!runnerUp) return `${prefix} — ${pos} is the only eligible POS left for this card.`
    const other = machineShortName(runnerUp.id)
    if (preferred.has(chosen.id) && !preferred.has(runnerUp.id)) {
      return `${prefix} — ${pos} is the POS you asked to prefer for this restock.`
    }
    const chosenVol = chosen.volume + (assignedVolume.get(chosen.id) || 0)
    const otherVol = runnerUp.volume + (assignedVolume.get(runnerUp.id) || 0)
    const chosenBucket = Math.floor(chosenVol / VOLUME_BALANCE_BUCKET)
    const otherBucket = Math.floor(otherVol / VOLUME_BALANCE_BUCKET)
    const chosenPair = pairUseCount(state, cardId, chosen.id)
    const otherPair = pairUseCount(state, cardId, runnerUp.id)
    if (chosenBucket !== otherBucket || chosenVol !== otherVol && chosenPair === otherPair) {
      return `${prefix} — ${pos} has handled less recent restock volume than the alternatives, so this avoids concentrating more volume on the heavier POS.`
    }
    if (chosenPair !== otherPair) {
      return `${prefix} — this card/POS pair has been used less often than the alternatives, which keeps the restock load more balanced.`
    }
    if (
      runnerUp.lastCycleUsed === cycleNumber - 1 &&
      chosen.lastCycleUsed !== cycleNumber - 1
    ) {
      return `${prefix} — ${other} was used on the previous cycle, so this swipe uses ${pos} instead of repeating that POS immediately.`
    }
    if (chosen.lastCycleUsed !== runnerUp.lastCycleUsed) {
      return `${prefix} — ${pos} has been idle longer than the other eligible POS, so this swipe uses the quieter machine.`
    }
    return `${prefix} — the eligible POS options are even on recent restock volume and pairing history, so ${pos} stays on this instruction.`
  }

  const bits: string[] = []
  if (banned.length) {
    bits.push(
      `${card} cannot use ${banned.join(' or ')} (same-identity pair). Pair counts: ${card} on ${pos} ${pairUsePhrase(
        pairUseCount(state, cardId, chosen.id)
      )}.`
    )
  }
  if (!runnerUp) {
    bits.push(`${pos} is the only legal POS left for this card.`)
    return bits.join(' ')
  }
  const other = machineShortName(runnerUp.id)
  if (preferred.has(chosen.id) && !preferred.has(runnerUp.id)) {
    bits.push(`${pos} is the preferred machine for this restock, ahead of ${other}.`)
    return bits.join(' ')
  }
  const chosenVol = chosen.volume + (assignedVolume.get(chosen.id) || 0)
  const otherVol = runnerUp.volume + (assignedVolume.get(runnerUp.id) || 0)
  const chosenBucket = Math.floor(chosenVol / VOLUME_BALANCE_BUCKET)
  const otherBucket = Math.floor(otherVol / VOLUME_BALANCE_BUCKET)
  const chosenPair = pairUseCount(state, cardId, chosen.id)
  const otherPair = pairUseCount(state, cardId, runnerUp.id)
  if (chosenBucket !== otherBucket) {
    bits.push(
      `${pos} volume bucket ${chosenBucket} vs ${other} at ${otherBucket} (R${VOLUME_BALANCE_BUCKET.toLocaleString('en-ZA')} steps). ${card} on ${pos} ${pairUsePhrase(chosenPair)}, vs ${pairUsePhrase(otherPair)} on ${other}.`
    )
  } else if (chosenPair !== otherPair) {
    bits.push(
      `${card} has been on ${pos} ${pairUsePhrase(chosenPair)}, vs ${pairUsePhrase(otherPair)} on ${other}.`
    )
  } else if (chosenVol !== otherVol) {
    bits.push(`${pos} raw volume ${formatZar(chosenVol)} vs ${other} ${formatZar(otherVol)}.`)
  } else if (
    runnerUp.lastCycleUsed === cycleNumber - 1 &&
    chosen.lastCycleUsed !== cycleNumber - 1
  ) {
    bits.push(`${other} ran last cycle; ${pos} did not.`)
  } else if (chosen.lastCycleUsed !== runnerUp.lastCycleUsed) {
    bits.push(`${pos} lastCycleUsed ${chosen.lastCycleUsed} vs ${other} ${runnerUp.lastCycleUsed}.`)
  } else {
    bits.push(
      `${pos} tied with ${other} on volume, pair count, and idle time; the planner keeps ${pos} (lower POS id).`
    )
  }
  return bits.join(' ')
}

export function explainPosChoice(
  state: RoutingState,
  assignment: CardAssignment,
  cycleNumber: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY
): string {
  if (assignment.posReason) return assignment.posReason
  const excluded = new Set(overlay.excludedMachineIds)
  const preferred = new Set(overlay.preferredMachineIds)
  const assignedVolume = new Map<number, number>()
  const candidates = state.machines.filter(
    (machine) => !excluded.has(machine.id) && !isForbiddenPair(assignment.cardId, machine.id)
  )
  candidates.sort((a, b) =>
    comparePosCandidates(state, assignment.cardId, a, b, cycleNumber, preferred, assignedVolume)
  )
  const chosen =
    state.machines.find((machine) => machine.id === assignment.machineId) || candidates[0]
  if (!chosen) {
    return `${machineShortName(assignment.machineId)} is the POS named on this instruction.`
  }
  const rankedFirst = candidates[0]
  if (rankedFirst && rankedFirst.id !== chosen.id) {
    const card = cardShortName(assignment.cardId)
    const pos = machineShortName(chosen.id)
    const identity = sameIdentityReason(card, pos, bannedPosNames(state, assignment.cardId))
    if (identity) return `${card} → ${pos} — ${identity}`
    return `${card} → ${pos} — ${pos} is the POS on this instruction, so this swipe follows the named pair rather than switching to another eligible machine.`
  }
  const runnerUp = candidates.find((machine) => machine.id !== chosen.id)
  return describePosPick({
    state,
    cardId: assignment.cardId,
    chosen,
    runnerUp,
    cycleNumber,
    overlay,
    assignedVolume,
    detail: 'card',
  })
}

export function explainPosRanking(
  state: RoutingState,
  assignment: CardAssignment,
  cycleNumber: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY
): string {
  const excluded = new Set(overlay.excludedMachineIds)
  const preferred = new Set(overlay.preferredMachineIds)
  const assignedVolume = new Map<number, number>()
  const candidates = state.machines.filter(
    (machine) => !excluded.has(machine.id) && !isForbiddenPair(assignment.cardId, machine.id)
  )
  candidates.sort((a, b) =>
    comparePosCandidates(state, assignment.cardId, a, b, cycleNumber, preferred, assignedVolume)
  )
  const chosen =
    state.machines.find((machine) => machine.id === assignment.machineId) || candidates[0]
  if (!chosen) {
    return `${machineShortName(assignment.machineId)} is the POS named on this instruction.`
  }
  const runnerUp = candidates.find((machine) => machine.id !== chosen.id)
  return describePosPick({
    state,
    cardId: assignment.cardId,
    chosen,
    runnerUp,
    cycleNumber,
    overlay,
    assignedVolume,
    detail: 'ranking',
  })
}

export function parseRoutingDecision(raw: unknown): RoutingDecision | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Partial<RoutingDecision> & { selectionReason?: unknown }
  if (typeof row.selectedCardId !== 'number' || typeof row.selectedMachineId !== 'number') return undefined
  if (typeof row.selectionReason !== 'string' || !row.selectionReason.trim()) return undefined
  return {
    selectedCardId: row.selectedCardId,
    selectedMachineId: row.selectedMachineId,
    selectedAt: typeof row.selectedAt === 'number' ? row.selectedAt : 0,
    selectionReason: row.selectionReason,
    eligibleAlternatives: Array.isArray(row.eligibleAlternatives)
      ? row.eligibleAlternatives.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const alt = item as { machineId?: unknown; volume?: unknown; pairUseCount?: unknown }
          if (typeof alt.machineId !== 'number') return []
          return [
            {
              machineId: alt.machineId,
              volume: typeof alt.volume === 'number' ? alt.volume : 0,
              pairUseCount: typeof alt.pairUseCount === 'number' ? alt.pairUseCount : 0,
            },
          ]
        })
      : [],
    excludedAlternatives: Array.isArray(row.excludedAlternatives)
      ? row.excludedAlternatives.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const alt = item as { machineId?: unknown; reason?: unknown }
          if (typeof alt.machineId !== 'number' || typeof alt.reason !== 'string') return []
          return [{ machineId: alt.machineId, reason: alt.reason }]
        })
      : [],
    relevantConstraints: Array.isArray(row.relevantConstraints)
      ? row.relevantConstraints.filter((item): item is string => typeof item === 'string')
      : [],
    machineVolumesAtDecision:
      row.machineVolumesAtDecision && typeof row.machineVolumesAtDecision === 'object'
        ? (row.machineVolumesAtDecision as Record<string, number>)
        : {},
    pairUseCountsAtDecision:
      row.pairUseCountsAtDecision && typeof row.pairUseCountsAtDecision === 'object'
        ? (row.pairUseCountsAtDecision as Record<string, number>)
        : {},
    cardRestStateAtDecision: {
      activeCycles:
        typeof row.cardRestStateAtDecision?.activeCycles === 'number'
          ? row.cardRestStateAtDecision.activeCycles
          : 0,
      restCycles:
        typeof row.cardRestStateAtDecision?.restCycles === 'number'
          ? row.cardRestStateAtDecision.restCycles
          : 0,
      lastCycleUsed:
        typeof row.cardRestStateAtDecision?.lastCycleUsed === 'number'
          ? row.cardRestStateAtDecision.lastCycleUsed
          : 0,
    },
    decisionVersion:
      typeof row.decisionVersion === 'string' && row.decisionVersion
        ? row.decisionVersion
        : ROUTING_DECISION_VERSION,
    quote: parseFrozenQuote(row.quote),
    residualsConsidered: Array.isArray(row.residualsConsidered)
      ? (row.residualsConsidered as PathResidual[])
      : undefined,
    tightnessRanks: Array.isArray(row.tightnessRanks) ? (row.tightnessRanks as TightnessRank[]) : undefined,
  }
}

export function stampAssignmentDecisions(
  assignments: CardAssignment[],
  selectedAt: number
): CardAssignment[] {
  return assignments.map((row) =>
    row.routingDecision
      ? { ...row, routingDecision: { ...row.routingDecision, selectedAt } }
      : row
  )
}

function overlayConstraintNotes(overlay: RoutingOverlay): string[] {
  const notes: string[] = []
  if (overlay.excludedCardIds.length) {
    notes.push(`excluded cards: ${overlay.excludedCardIds.map((id) => cardShortName(id)).join(', ')}`)
  }
  if (overlay.excludedMachineIds.length) {
    notes.push(`excluded POS: ${overlay.excludedMachineIds.map((id) => machineShortName(id)).join(', ')}`)
  }
  if (overlay.preferredMachineIds.length) {
    notes.push(`preferred POS: ${overlay.preferredMachineIds.map((id) => machineShortName(id)).join(', ')}`)
  }
  const capped = Object.entries(overlay.cardMaxById)
  if (capped.length) {
    notes.push(`card caps: ${capped.map(([id, max]) => `${cardShortName(Number(id))} ${formatZar(max)}`).join(', ')}`)
  }
  return notes
}

function buildRoutingDecision(params: {
  state: RoutingState
  cardId: number
  chosen: MachineState
  candidates: MachineState[]
  overlay: RoutingOverlay
  assignedVolume: Map<number, number>
  remaining: Map<number, number>
  selectionReason: string
  selectedAt?: number
  book?: PathBook
  ranks?: TightnessRank[]
}): RoutingDecision {
  const excludedAlternatives: RoutingDecision['excludedAlternatives'] = []
  const excludedMachines = new Set(params.overlay.excludedMachineIds)
  const notes = params.book?.notes || []
  const residual = openResiduals(params.book)[0]
  for (const machine of params.state.machines) {
    if (machine.id === params.chosen.id) continue
    if (excludedMachines.has(machine.id)) {
      excludedAlternatives.push({ machineId: machine.id, reason: 'excluded by admin constraint' })
    } else if (isForbiddenPair(params.cardId, machine.id)) {
      excludedAlternatives.push({ machineId: machine.id, reason: 'banned identity' })
    } else if (
      !legalPairs(params.state, params.overlay, notes).some(
        (row) => row.cardId === params.cardId && row.machineId === machine.id
      )
    ) {
      excludedAlternatives.push({ machineId: machine.id, reason: 'frozen' })
    } else if (residual && machine.id === residual.machineId && params.chosen.id !== residual.machineId) {
      excludedAlternatives.push({ machineId: machine.id, reason: 'residual prefers other pair' })
    } else if ((params.remaining.get(machine.id) || 0) <= 0) {
      excludedAlternatives.push({ machineId: machine.id, reason: 'no remaining slot this restock' })
    }
  }
  const card = params.state.cards.find((row) => row.id === params.cardId)
  return {
    selectedCardId: params.cardId,
    selectedMachineId: params.chosen.id,
    selectedAt: params.selectedAt || 0,
    selectionReason: params.selectionReason,
    eligibleAlternatives: params.candidates
      .filter((machine) => machine.id !== params.chosen.id)
      .map((machine) => ({
        machineId: machine.id,
        volume: machine.volume + (params.assignedVolume.get(machine.id) || 0),
        pairUseCount: pairUseCount(params.state, params.cardId, machine.id),
      })),
    excludedAlternatives,
    relevantConstraints: overlayConstraintNotes(params.overlay),
    machineVolumesAtDecision: Object.fromEntries(
      params.state.machines.map((machine) => [
        String(machine.id),
        machine.volume + (params.assignedVolume.get(machine.id) || 0),
      ])
    ),
    pairUseCountsAtDecision: Object.fromEntries(
      params.state.machines.map((machine) => [
        pairingKey(params.cardId, machine.id),
        pairUseCount(params.state, params.cardId, machine.id),
      ])
    ),
    cardRestStateAtDecision: {
      activeCycles: card?.activeCycles || 0,
      restCycles: card?.restCycles || 0,
      lastCycleUsed: card?.lastCycleUsed || 0,
    },
    decisionVersion: ROUTING_DECISION_VERSION,
    ...(params.book?.quote ? { quote: params.book.quote } : {}),
    ...(params.book?.residuals ? { residualsConsidered: params.book.residuals } : {}),
    ...(params.ranks ? { tightnessRanks: params.ranks } : {}),
  }
}

function projectedState(state: RoutingState, assignedVolume: Map<number, number>): RoutingState {
  if (!assignedVolume.size) return state
  return {
    ...state,
    machines: state.machines.map((machine) => ({
      ...machine,
      volume: roundMoney(machine.volume + (assignedVolume.get(machine.id) || 0)),
    })),
  }
}

function identityPosReason(
  state: RoutingState,
  cardId: number,
  machineId: number,
  qBestReason: string,
  residual?: PathResidual | null
): string {
  if (residual) return qBestReason
  const card = cardShortName(cardId)
  const pos = machineShortName(machineId)
  const identity = sameIdentityReason(card, pos, bannedPosNames(state, cardId))
  if (identity) return `${card} → ${pos} — ${identity}`
  return qBestReason
}

export function assignMachines(
  state: RoutingState,
  selectedCardIds: number[],
  amounts: number[],
  cycleNumber: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY,
  book: PathBook = {}
): CardAssignment[] {
  const remaining = machineLoadTargets(state, selectedCardIds.length, overlay)
  const assignedVolume = new Map<number, number>()
  const assignments: CardAssignment[] = []
  const preferred = new Set(overlay.preferredMachineIds)

  const cardsWithAmounts = selectedCardIds.map((cardId, index) => ({
    cardId,
    amount: amounts[index],
  }))

  for (const item of cardsWithAmounts) {
    const working = projectedState(state, assignedVolume)
    const picked = pickQBestPair({
      state: working,
      overlay,
      cycleNumber,
      amountZar: item.amount,
      book,
      onlyCardId: item.cardId,
    })
    const openSlot = (machineId: number) => (remaining.get(machineId) || 0) > 0
    const rankedOpen = (picked.ranks || []).filter((row) => openSlot(row.machineId))
    let chosen =
      picked.assignment && openSlot(picked.assignment.machineId)
        ? state.machines.find((machine) => machine.id === picked.assignment!.machineId)
        : rankedOpen[0]
          ? state.machines.find((machine) => machine.id === rankedOpen[0].machineId)
          : undefined

    const candidates = state.machines.filter(
      (machine) => openSlot(machine.id) && !isForbiddenPair(item.cardId, machine.id)
    )
    candidates.sort((a, b) =>
      comparePosCandidates(state, item.cardId, a, b, cycleNumber, preferred, assignedVolume)
    )
    if (!chosen) chosen = candidates[0]
    if (!chosen) continue

    const fallbackReason = describePosPick({
      state,
      cardId: item.cardId,
      chosen,
      runnerUp: candidates.find((machine) => machine.id !== chosen!.id),
      cycleNumber,
      overlay,
      assignedVolume,
    })
    const posReason = identityPosReason(
      state,
      item.cardId,
      chosen.id,
      picked.assignment?.posReason || fallbackReason,
      openResiduals(book)[0]
    )
    assignments.push({
      cardId: item.cardId,
      machineId: chosen.id,
      amount: item.amount,
      posReason,
      routingDecision: buildRoutingDecision({
        state,
        cardId: item.cardId,
        chosen,
        candidates: candidates.length ? candidates : [chosen],
        overlay,
        assignedVolume,
        remaining,
        selectionReason: posReason,
        book,
        ranks: picked.ranks,
      }),
    })
    remaining.set(chosen.id, (remaining.get(chosen.id) || 0) - 1)
    assignedVolume.set(chosen.id, (assignedVolume.get(chosen.id) || 0) + item.amount)
  }

  return assignments
}

function stampQuoteOnAssignments(
  assignments: CardAssignment[],
  book: PathBook,
  ranks?: TightnessRank[]
): CardAssignment[] {
  if (!book.quote && !book.residuals?.length && !ranks?.length) return assignments
  return assignments.map((row) => {
    if (!row.routingDecision) return row
    const quote = row.routingDecision.quote || book.quote
    const residualsConsidered = row.routingDecision.residualsConsidered || book.residuals
    const tightnessRanks = row.routingDecision.tightnessRanks || ranks
    return {
      ...row,
      routingDecision: {
        ...row.routingDecision,
        ...(quote ? { quote } : {}),
        ...(residualsConsidered ? { residualsConsidered } : {}),
        ...(tightnessRanks ? { tightnessRanks } : {}),
      },
    }
  })
}

export function planCycle(
  state: RoutingState,
  overlay: RoutingOverlay = EMPTY_OVERLAY,
  book: PathBook = {}
): CyclePlan {
  const quote = book.quote
  if (!state.window && !(state.availableCapital > 0)) {
    // No `$` yet: there is no book to open. Hold without touching the kernel.
    return {
      cycleNumber: state.completedCycles + 1,
      availableCapital: state.availableCapital,
      deployedAmount: 0,
      idleCapital: 0,
      expectedProfit: 0,
      expectedZarProfit: 0,
      cardCountUsed: 0,
      cardAssignments: [],
      restingCardIds: state.cards.map((card) => card.id),
      restingMachineIds: state.machines.map((machine) => machine.id),
      bufferUsedBefore: state.bufferUsed,
      bufferActionRequired: false,
      selectionReason: 'No window capital. Tap $ and sell ZAR to open Day 1.',
      holdReason: 'No window capital. Tap $ and sell ZAR to open Day 1.',
      ...(quote ? { quote } : {}),
    }
  }
  const window = resolveWindow(state)
  const record = window.snapshot.days.at(-1)
  const routes = record?.routes ?? []
  const excludedCards = new Set(overlay.excludedCardIds)
  const excludedMachines = new Set(overlay.excludedMachineIds)
  const rawAssignments = assignmentsFromRoutes(routes).filter((row) => {
    if (excludedCards.has(row.cardId) || excludedMachines.has(row.machineId)) return false
    return legalPairs(state, overlay, book.notes).some(
      (pair) => pair.cardId === row.cardId && pair.machineId === row.machineId
    )
  })
  const cycleNumber = state.completedCycles + 1
  const remaining = machineLoadTargets(state, rawAssignments.length, overlay)
  const assignedVolume = new Map<number, number>()
  const cardAssignments: CardAssignment[] = rawAssignments.map((row) => {
    const chosen = state.machines.find((machine) => machine.id === row.machineId)
    const assignment: CardAssignment = {
      ...row,
      routingDecision: chosen
        ? buildRoutingDecision({
            state,
            cardId: row.cardId,
            chosen,
            candidates: state.machines.filter((machine) => machine.id === row.machineId),
            overlay,
            assignedVolume,
            remaining,
            selectionReason: row.posReason || '',
            book,
          })
        : undefined,
    }
    if (chosen) {
      remaining.set(chosen.id, (remaining.get(chosen.id) || 0) - 1)
      assignedVolume.set(chosen.id, (assignedVolume.get(chosen.id) || 0) + row.amount)
    }
    return assignment
  })
  const deployedForPlan = roundMoney(cardAssignments.reduce((sum, row) => sum + row.amount, 0))
  const idleCapital = roundMoney(Math.max(0, (record?.heldBackZar ?? 0) + ((record?.settledZar ?? 0) - deployedForPlan)))
  const weekend = record?.weekend === true
  const holdReason =
    deployedForPlan <= 0
      ? weekend
        ? 'Weekend. Rails rest; the book is empty today.'
        : excludedCards.size || excludedMachines.size || (book.notes?.length ?? 0)
          ? 'No valid route available under current overlay or freezes.'
          : record?.learningNote || 'No eligible whole payment today. The book is unchanged.'
      : undefined
  const usedCardIds = new Set(cardAssignments.map((row) => row.cardId))
  const usedMachineIds = new Set(cardAssignments.map((row) => row.machineId))
  const expectedProfit = quote
    ? expectedSpreadMzn(deployedForPlan, quote)
    : roundMoney(deployedForPlan * state.config.spread)
  const expectedZarProfit = quote
    ? zarProfitFromQuote(deployedForPlan, quote)
    : roundMoney(deployedForPlan * state.config.spread)
  return {
    cycleNumber,
    availableCapital: state.availableCapital,
    deployedAmount: deployedForPlan,
    idleCapital,
    expectedProfit,
    expectedZarProfit,
    cardCountUsed: cardAssignments.length,
    cardAssignments: stampQuoteOnAssignments(cardAssignments, book),
    restingCardIds: state.cards.map((card) => card.id).filter((id) => !usedCardIds.has(id)),
    restingMachineIds: state.machines.map((machine) => machine.id).filter((id) => !usedMachineIds.has(id)),
    bufferUsedBefore: state.bufferUsed,
    bufferActionRequired: state.bufferUsed > 0 && deployedForPlan > 0,
    selectionReason: [
      record
        ? `Day ${record.day} ${record.weekday}: ${cardAssignments.length} whole ticket${cardAssignments.length === 1 ? '' : 's'} ${formatZar(deployedForPlan)}.`
        : 'No day on the absorbing book.',
      idleCapital > 0 ? `${formatZar(idleCapital)} held back is normal.` : '',
      record?.learningNote || '',
    ]
      .filter(Boolean)
      .join(' '),
    ...(quote ? { quote } : {}),
    residualsConsidered: book.residuals,
    ...(holdReason ? { holdReason } : {}),
    window,
  }
}

export function applyCardPosContact(
  state: RoutingState,
  assignments: CardAssignment[],
  cycleNumber: number
): RoutingState {
  const pairings = { ...state.pairings }

  const cards = state.cards.map((card) => {
    const assignment = assignments.find((row) => row.cardId === card.id)
    if (!assignment) {
      return {
        ...card,
        restCycles: card.restCycles + 1,
      }
    }
    return {
      ...card,
      activeCycles: card.activeCycles + 1,
      volume: roundMoney(card.volume + assignment.amount),
      lastCycleUsed: cycleNumber,
      machineHistory: [...card.machineHistory, assignment.machineId],
    }
  })

  const machines = state.machines.map((machine) => {
    const assigned = assignments.filter((row) => row.machineId === machine.id)
    if (assigned.length === 0) {
      return {
        ...machine,
        restCycles: machine.restCycles + 1,
      }
    }
    const volume = assigned.reduce((sum, row) => sum + row.amount, 0)
    return {
      ...machine,
      activeCycles: machine.activeCycles + 1,
      volume: roundMoney(machine.volume + volume),
      lastCycleUsed: cycleNumber,
    }
  })

  for (const row of assignments) {
    const key = pairingKey(row.cardId, row.machineId)
    pairings[key] = (pairings[key] || 0) + 1
  }

  return {
    ...state,
    cards,
    machines,
    pairings,
  }
}

export function applySell(
  state: RoutingState,
  plan: CyclePlan,
  actualProfit?: number
): RoutingState {
  const profit = roundMoney(
    actualProfit ??
      plan.expectedZarProfit ??
      (plan.quote ? zarProfitFromQuote(plan.deployedAmount, plan.quote) : plan.deployedAmount * state.config.spread)
  )
  const bufferUsed = roundMoney(state.bufferUsed + plan.deployedAmount)
  return {
    ...state,
    availableCapital: roundMoney(state.availableCapital + profit * state.config.recycleRate),
    bufferUsed: roundMoney(bufferUsed),
    completedCycles: plan.cycleNumber,
    cumulativeDeployed: roundMoney(state.cumulativeDeployed + plan.deployedAmount),
    cumulativeSpread: roundMoney(state.cumulativeSpread + profit),
    window: plan.window ?? state.window,
    windowNeedsAdvance: false,
  }
}

export function completeCycle(
  state: RoutingState,
  plan: CyclePlan,
  actualProfit?: number
): RoutingState {
  return applyCardPosContact(applySell(state, plan, actualProfit), plan.cardAssignments, plan.cycleNumber)
}

export function simulateRun(config: RoutingConfig = DEFAULT_TEST_CONFIG, capitalZar = 100_000): {
  state: RoutingState
  cycles: CompletedCycle[]
} {
  let state = createInitialState(config, capitalZar)
  const cycles: CompletedCycle[] = []
  for (let i = 0; i < config.cycleCount; i++) {
    const plan = planCycle(state)
    const sold = completeCycle(state, plan)
    state = applyRestockLanding({ ...sold, bufferUsed: 0 }, plan.deployedAmount)
    cycles.push({
      ...plan,
      actualProfit: plan.expectedProfit,
      status: 'completed',
    })
  }
  return { state, cycles }
}

function swipeInstruction(row: CardAssignment): string {
  return `${cardShortName(row.cardId)} on ${machineShortName(row.machineId)} for ${formatZar(row.amount)}`
}

export function formatSwipeInstruction(row: CardAssignment): string {
  return swipeInstruction(row)
}

export function formatMznAmount(amount: number): string {
  const rounded = roundMoney(amount)
  const nearestInt = Math.round(rounded)
  const useInt = Math.abs(rounded - nearestInt) < 0.005
  const formatted = (useInt ? nearestInt : rounded).toLocaleString('en-US', {
    minimumFractionDigits: useInt ? 0 : 2,
    maximumFractionDigits: useInt ? 0 : 2,
  })
  return `${formatted} MZN`
}

export type ReplenishPlan = {
  cycleNumber: number
  amountZar: number
  amountMzn: number
  costRate: number
  cardAssignments: CardAssignment[]
  restingCardIds: number[]
  restingMachineIds: number[]
  quote?: FrozenQuote
}

export function planReplenish(
  state: RoutingState,
  costRate: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY,
  book: PathBook = {}
): ReplenishPlan | null {
  const liveBook: PathBook = { ...book }
  const nextSell = planCycle(state, overlay, liveBook)
  if (!nextSell.bufferActionRequired || state.bufferUsed <= 0 || !(costRate > 0)) return null
  const amountZar = nextSell.deployedAmount > 0 ? nextSell.deployedAmount : state.bufferUsed
  return {
    cycleNumber: nextSell.cycleNumber,
    amountZar,
    amountMzn: roundMoney(amountZar * costRate),
    costRate,
    cardAssignments: nextSell.cardAssignments,
    restingCardIds: nextSell.restingCardIds,
    restingMachineIds: nextSell.restingMachineIds,
    quote: {
      ...(liveBook.quote || fallbackQuote()),
      costRate,
    },
  }
}

export function previewAskImpact(
  state: RoutingState,
  overlay: RoutingOverlay,
  costRate: number,
  book: PathBook = {}
): { replenishFirst: ReplenishPlan | null; nextPlan: CyclePlan | null } {
  const liveBook: PathBook = {
    ...book,
    quote: book.quote || (costRate > 0 ? { ...fallbackQuote(), costRate, sellRate: costRate * 1.1 } : fallbackQuote()),
  }
  const replenishFirst = planReplenish(state, costRate, overlay, liveBook)
  if (replenishFirst) return { replenishFirst, nextPlan: null }
  return { replenishFirst: null, nextPlan: planCycle(state, overlay, liveBook) }
}

export function formatAskImpactBody(params: {
  acknowledgement: string
  currentPlan?: CyclePlan | null
  preview: { replenishFirst: ReplenishPlan | null; nextPlan: CyclePlan | null }
  proposal?: boolean
  state?: RoutingState
  overlay?: RoutingOverlay
}): string {
  const lines = [params.acknowledgement.trim(), '']
  const replenish = params.preview.replenishFirst
  const plan = params.preview.nextPlan
  if (replenish) {
    lines.push(`Restock ZAR @ COST still first: ${formatZar(replenish.amountZar)}`)
    if (replenish.cardAssignments.length) {
      if (replenish.cardAssignments.length === 1) {
        lines.push(`Swipe ${swipeInstruction(replenish.cardAssignments[0])}.`)
      } else {
        lines.push('Swipe:')
        for (const row of replenish.cardAssignments) {
          lines.push(swipeInstruction(row))
        }
      }
    }
    lines.push(`Then sell ZAR, Cycle ${replenish.cycleNumber}`)
  } else if (plan && plan.deployedAmount > 0) {
    lines.push(`Next: pay ${formatZar(plan.deployedAmount)} once the MZN has reflected.`)
    lines.push(`Expected gross spread this sale: ${formatMznAmount(plan.expectedProfit)}`)
    if (plan.bufferActionRequired) lines.push('Restock ZAR @ COST would follow this sale.')
  } else if (plan) {
    lines.push(plan.selectionReason || 'No valid restock route under that rule.')
  }
  if (params.proposal) {
    lines.push('')
    lines.push('Accept applies this rule. Execute still moves the money.')
  }
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim()
}

export function buildNotificationCopy(
  plan: CyclePlan,
  cycleCount: number
): { title: string; body: string } {
  void cycleCount
  const record = plan.window?.snapshot.days.at(-1)
  const when = record ? `${record.weekday} day ${record.day}` : `Cycle ${plan.cycleNumber}`
  return {
    title: `Sell ZAR · ${when}`,
    body: `${when}: pay ${formatZar(plan.deployedAmount)} once the MZN has reflected`,
  }
}

export function buildReplenishNotificationCopy(
  replenish: ReplenishPlan
): { title: string; body: string } {
  const rows = replenish.cardAssignments
  if (!rows.length) {
    return {
      title: 'Restock ZAR @ COST',
      body: `Restock ${formatZar(replenish.amountZar)} at COST`,
    }
  }
  if (rows.length === 1) {
    return {
      title: 'Restock ZAR @ COST',
      body: `Swipe ${swipeInstruction(rows[0])}`,
    }
  }
  return {
    title: 'Restock ZAR @ COST',
    body: rows.map((row) => `Swipe ${swipeInstruction(row)}`).join('\n'),
  }
}

export function buildAgentReplyCopy(
  plan: CyclePlan,
  cycleCount: number,
  acknowledgement: string,
  blocked: boolean
): { title: string; body: string } {
  const title = `Sell ZAR · Cycle ${plan.cycleNumber}/${cycleCount}`
  if (blocked) {
    return {
      title,
      body: [acknowledgement, '', plan.selectionReason || 'No valid route under current constraints.'].filter(Boolean).join('\n'),
    }
  }
  const lines = [acknowledgement, '', `Next: pay ${formatZar(plan.deployedAmount)} once the MZN has reflected.`]
  return { title, body: lines.join('\n') }
}

export function buildActivityCopy(
  plan: CyclePlan,
  cycleCount: number,
  status: 'awaiting_execution' | 'completed',
  spread: number,
  quotes?: { sellRate: number; costRate: number },
  extra?: {
    revisionReason?: string
    state?: RoutingState
    overlay?: RoutingOverlay
  }
): { title: string; body: string } {
  const statusLabel = status === 'completed' ? 'Executed' : 'Awaiting execution'
  if (plan.deployedAmount <= 0) {
    return {
      title: `Sell ZAR · Cycle ${plan.cycleNumber}/${cycleCount}`,
      body: [
        ...residualLead(extra?.state, plan.cycleNumber, cycleCount, extra?.revisionReason),
        plan.holdReason || plan.selectionReason || 'Hold: the corridor cannot take this residual.',
        '',
        'Ask Sam what changed on a card or POS. Do not invent a pair.',
        `Status: ${statusLabel}`,
      ].join('\n'),
    }
  }
  void spread
  // Kernel facts (tickets, mandate residual, weekday) plus the live-quote leg. Nothing else.
  const lines = [
    ...onionLines(plan.cardAssignments, 'send'),
    '',
    ...residualLead(extra?.state, plan.cycleNumber, cycleCount, extra?.revisionReason),
    `Pay ${formatZar(plan.deployedAmount)} once the MZN has reflected.`,
    '',
  ]
  if (quotes && quotes.sellRate > 0 && quotes.costRate > 0) {
    const profitPerZar = roundMoney(Math.max(0, quotes.sellRate - quotes.costRate))
    lines.push(`Receive ${formatMznAmount(roundMoney(plan.deployedAmount * quotes.sellRate))} at frozen SELL.`)
    lines.push(`SELL ${quotes.sellRate.toFixed(2)} Mt/R · COST ${quotes.costRate.toFixed(2)} Mt/R`)
    lines.push(`Live spread: ${profitPerZar.toFixed(2)} Mt/R`)
  }
  lines.push(`Expected gross spread: ${formatMznAmount(plan.expectedProfit)}`)
  if (plan.bufferActionRequired) {
    lines.push('Restock these tickets at COST before the next weekday.')
  }
  lines.push(`Status: ${statusLabel}`)
  return {
    title: `Sell ZAR · Cycle ${plan.cycleNumber}/${cycleCount}`,
    body: lines.join('\n'),
  }
}

export function buildReplenishActivityCopy(
  replenish: ReplenishPlan,
  cycleCount: number,
  status: 'awaiting_execution' | 'completed',
  state?: RoutingState
): { title: string; body: string } {
  void status
  // Kernel routes as issued (card → rail); no desk-side annotation or friction narrative.
  const rows = replenish.cardAssignments
  const lines: string[] = [
    ...restockLead(state, replenish.cycleNumber, cycleCount),
    ...onionLines(rows, 'swipe'),
    '',
  ]
  if (!rows.length) {
    lines.push(`Restock ${formatZar(replenish.amountZar)} in South Africa at COST.`)
    lines.push('')
  }
  if (replenish.costRate > 0) {
    lines.push(`COST ${replenish.costRate.toFixed(2)} Mt/R.`)
  }
  lines.push(`Then sell ZAR · Cycle ${replenish.cycleNumber} of ${cycleCount}.`)
  return {
    title: `Restock ZAR @ COST · before Cycle ${replenish.cycleNumber}/${cycleCount}`,
    body: lines.join('\n').trim(),
  }
}

export const CONVERSION_ROUTING_KIND = 'CONVERSION_ROUTING_INSTRUCTION'
export const ROUTING_ADMIN_UID = 'xHKmkizXhPOU25vwTIB6dxhMzSH2'
