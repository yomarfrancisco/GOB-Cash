/**
 * Generalized conversion routing engine.
 *
 * Plans card/machine assignments for a conversion cycle. It does not execute
 * FX. Cycle timing is supplied by the caller — this module never advances
 * because a clock ticked.
 */

import { EMPTY_OVERLAY, type RoutingOverlay } from './constraints'
import { cardLabel, cardShortName, isForbiddenPair, machineLabel, machineShortName } from './inventory'

export type RoutingConfig = {
  cardCount: number
  machineCount: number
  minCardAmount: number
  maxCardAmount: number
  startingCapital: number
  spread: number
  recycleRate: number
  bufferAmount: number
  bufferTriggerRatio: number
  cycleCount: number
}

export const DEFAULT_TEST_CONFIG: RoutingConfig = {
  cardCount: 5,
  machineCount: 4,
  minCardAmount: 10_000,
  maxCardAmount: 15_000,
  startingCapital: 10_000,
  spread: 0.10,
  recycleRate: 1,
  bufferAmount: 50_000,
  bufferTriggerRatio: 0.9,
  cycleCount: 20,
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

export type CardAssignment = {
  cardId: number
  machineId: number
  amount: number
  posReason?: string
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
}

export type CyclePlan = {
  cycleNumber: number
  startingCapital: number
  availableCapital: number
  deployedAmount: number
  idleCapital: number
  expectedProfit: number
  cardCountUsed: number
  cardAssignments: CardAssignment[]
  restingCardIds: number[]
  restingMachineIds: number[]
  bufferUsedBefore: number
  bufferUsedProjected: number
  bufferTriggerAmount: number
  bufferActionRequired: boolean
  selectionReason: string
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

export function createInitialState(config: RoutingConfig = DEFAULT_TEST_CONFIG): RoutingState {
  return {
    config,
    availableCapital: roundMoney(config.startingCapital),
    bufferUsed: 0,
    completedCycles: 0,
    cumulativeDeployed: 0,
    cumulativeSpread: 0,
    cards: Array.from({ length: config.cardCount }, (_, i) => ({
      id: i + 1,
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
  }
}

/**
 * Largest amount that can be distributed across the fewest cards, each
 * inside [min, max]. Amounts in a capacity gap (e.g. R17k) deploy the
 * next-lower valid total and leave the remainder idle.
 */
export function largestValidDeployment(
  availableCapital: number,
  config: Pick<RoutingConfig, 'cardCount' | 'minCardAmount' | 'maxCardAmount'>
): { deployedAmount: number; cardCount: number } {
  const available = roundMoney(availableCapital)
  let best = { deployedAmount: 0, cardCount: 0 }

  for (let n = 1; n <= config.cardCount; n++) {
    const minTotal = roundMoney(n * config.minCardAmount)
    const maxTotal = roundMoney(n * config.maxCardAmount)
    if (available < minTotal) continue
    const deployedAmount = Math.min(available, maxTotal)
    if (
      deployedAmount > best.deployedAmount ||
      (deployedAmount === best.deployedAmount && (best.cardCount === 0 || n < best.cardCount))
    ) {
      best = { deployedAmount: roundMoney(deployedAmount), cardCount: n }
    }
  }

  return best
}

export function splitAcrossCards(
  total: number,
  cardCount: number,
  minCardAmount: number,
  maxCardAmount: number
): number[] {
  if (cardCount <= 0) return []
  const totalCents = Math.round(total * 100)
  const minCents = Math.round(minCardAmount * 100)
  const maxCents = Math.round(maxCardAmount * 100)
  const base = Math.floor(totalCents / cardCount)
  const remainder = totalCents - base * cardCount
  const parts = Array.from({ length: cardCount }, (_, i) => base + (i < remainder ? 1 : 0))

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] < minCents) {
      for (let j = 0; j < parts.length && parts[i] < minCents; j++) {
        if (j === i) continue
        const spare = parts[j] - minCents
        if (spare <= 0) continue
        const take = Math.min(spare, minCents - parts[i])
        parts[j] -= take
        parts[i] += take
      }
    }
    if (parts[i] > maxCents) {
      for (let j = 0; j < parts.length && parts[i] > maxCents; j++) {
        if (j === i) continue
        const room = maxCents - parts[j]
        if (room <= 0) continue
        const give = Math.min(room, parts[i] - maxCents)
        parts[j] += give
        parts[i] -= give
      }
      if (parts[i] > maxCents) {
        throw new Error(`Cannot split ${total} across ${cardCount} cards within card limits`)
      }
    }
    if (parts[i] < minCents) {
      throw new Error(`Cannot split ${total} across ${cardCount} cards within card limits`)
    }
  }

  if (excessUnused(parts, totalCents)) {
    throw new Error(`Split of ${total} across ${cardCount} cards does not sum`)
  }

  return parts.map((cents) => cents / 100)
}

export function splitAcrossCardsWithCaps(total: number, mins: number[], maxes: number[]): number[] {
  if (mins.length === 0 || mins.length !== maxes.length) return []
  const minCents = mins.map((value) => Math.round(value * 100))
  const maxCents = maxes.map((value) => Math.round(value * 100))
  const totalCents = Math.round(total * 100)
  const minSum = minCents.reduce((sum, value) => sum + value, 0)
  const maxSum = maxCents.reduce((sum, value) => sum + value, 0)
  if (totalCents < minSum || totalCents > maxSum) {
    throw new Error(`Cannot split ${total} within mixed card limits`)
  }
  const parts = [...minCents]
  let remaining = totalCents - minSum
  while (remaining > 0) {
    const rooms = parts.map((part, index) => maxCents[index] - part)
    const open = rooms
      .map((room, index) => (room > 0 ? index : -1))
      .filter((index) => index >= 0)
    if (!open.length) {
      throw new Error(`Cannot split ${total} within mixed card limits`)
    }
    const share = Math.max(1, Math.floor(remaining / open.length))
    for (const index of open) {
      if (remaining <= 0) break
      const take = Math.min(rooms[index], share, remaining)
      parts[index] += take
      remaining -= take
    }
  }
  return parts.map((cents) => cents / 100)
}

function excessUnused(parts: number[], totalCents: number): boolean {
  return parts.reduce((sum, value) => sum + value, 0) !== totalCents
}

export function selectCards(
  state: RoutingState,
  cardCount: number,
  cycleNumber: number,
  eligibleIds?: Set<number>
): number[] {
  const ranked = [...state.cards]
    .filter((card) => !eligibleIds || eligibleIds.has(card.id))
    .sort((a, b) => {
    if (a.activeCycles !== b.activeCycles) return a.activeCycles - b.activeCycles
    const aJustUsed = a.lastCycleUsed === cycleNumber - 1
    const bJustUsed = b.lastCycleUsed === cycleNumber - 1
    if (aJustUsed !== bJustUsed) return aJustUsed ? 1 : -1
    if (a.restCycles !== b.restCycles) return b.restCycles - a.restCycles
    if (a.lastCycleUsed !== b.lastCycleUsed) return a.lastCycleUsed - b.lastCycleUsed
    return a.id - b.id
  })
  return ranked.slice(0, cardCount).map((card) => card.id)
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

function describePosPick(params: {
  state: RoutingState
  cardId: number
  chosen: MachineState
  runnerUp: MachineState | undefined
  cycleNumber: number
  overlay: RoutingOverlay
  assignedVolume: Map<number, number>
}): string {
  const { state, cardId, chosen, runnerUp, cycleNumber, overlay, assignedVolume } = params
  const card = cardShortName(cardId)
  const pos = machineShortName(chosen.id)
  const preferred = new Set(overlay.preferredMachineIds)
  const bits: string[] = []
  const banned = state.machines.filter((machine) => isForbiddenPair(cardId, machine.id))
  if (banned.length) {
    bits.push(
      `${card} cannot use ${banned.map((machine) => machineShortName(machine.id)).join(' or ')} (same-identity pair).`
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
      `${pos} has taken less rand than ${other}, so this swipe does not pile onto the heavier machine.`
    )
  } else if (chosenPair !== otherPair) {
    bits.push(
      `${card} has been on ${pos} ${pairUsePhrase(chosenPair)}, vs ${pairUsePhrase(otherPair)} on ${other}. The cooler pair keeps restock capacity open.`
    )
  } else if (chosenVol !== otherVol) {
    bits.push(`${pos} volume is lower than ${other}.`)
  } else if (
    runnerUp.lastCycleUsed === cycleNumber - 1 &&
    chosen.lastCycleUsed !== cycleNumber - 1
  ) {
    bits.push(`${other} ran last cycle; ${pos} did not.`)
  } else if (chosen.lastCycleUsed !== runnerUp.lastCycleUsed) {
    bits.push(`${pos} has sat idle longer than ${other}.`)
  } else {
    bits.push(
      `${pos} tied with ${other} on volume, pair heat, and idle time, so the planner keeps ${pos}.`
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
    const bits: string[] = []
    const banned = state.machines.filter((machine) => isForbiddenPair(assignment.cardId, machine.id))
    if (banned.length) {
      bits.push(
        `${cardShortName(assignment.cardId)} cannot use ${banned
          .map((machine) => machineShortName(machine.id))
          .join(' or ')} (same-identity pair).`
      )
    }
    bits.push(
      `${machineShortName(chosen.id)} is the POS on this instruction. ${cardShortName(assignment.cardId)} has been on it ${pairUsePhrase(
        pairUseCount(state, assignment.cardId, chosen.id)
      )}.`
    )
    return bits.join(' ')
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
  })
}

export function annotatePosReasons(
  state: RoutingState,
  assignments: CardAssignment[],
  cycleNumber: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY
): CardAssignment[] {
  const planned = assignMachines(
    state,
    assignments.map((row) => row.cardId),
    assignments.map((row) => row.amount),
    cycleNumber,
    overlay
  )
  return assignments.map((row) => {
    if (row.posReason) return row
    const match = planned.find(
      (item) => item.cardId === row.cardId && item.machineId === row.machineId
    )
    return {
      ...row,
      posReason: match?.posReason || explainPosChoice(state, row, cycleNumber, overlay),
    }
  })
}

export function assignMachines(
  state: RoutingState,
  selectedCardIds: number[],
  amounts: number[],
  cycleNumber: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY
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
    const candidates = state.machines.filter(
      (machine) =>
        (remaining.get(machine.id) || 0) > 0 && !isForbiddenPair(item.cardId, machine.id)
    )
    candidates.sort((a, b) =>
      comparePosCandidates(state, item.cardId, a, b, cycleNumber, preferred, assignedVolume)
    )

    const chosen = candidates[0]
    if (!chosen) continue
    assignments.push({
      cardId: item.cardId,
      machineId: chosen.id,
      amount: item.amount,
      posReason: describePosPick({
        state,
        cardId: item.cardId,
        chosen,
        runnerUp: candidates[1],
        cycleNumber,
        overlay,
        assignedVolume,
      }),
    })
    remaining.set(chosen.id, (remaining.get(chosen.id) || 0) - 1)
    assignedVolume.set(chosen.id, (assignedVolume.get(chosen.id) || 0) + item.amount)
  }

  return assignments
}

function cardHasLegalMachine(
  state: RoutingState,
  cardId: number,
  overlay: RoutingOverlay
): boolean {
  const excluded = new Set(overlay.excludedMachineIds)
  return state.machines.some(
    (machine) => !excluded.has(machine.id) && !isForbiddenPair(cardId, machine.id)
  )
}

export function planCycle(state: RoutingState, overlay: RoutingOverlay = EMPTY_OVERLAY): CyclePlan {
  const { config } = state
  const cycleNumber = state.completedCycles + 1
  const excludedCards = new Set(overlay.excludedCardIds)
  const excludedMachines = new Set(overlay.excludedMachineIds)
  const eligibleCards = state.cards.filter((card) => {
    if (excludedCards.has(card.id)) return false
    const max = overlay.cardMaxById[card.id] ?? config.maxCardAmount
    const min = overlay.cardMinById[card.id] ?? config.minCardAmount
    return max >= min
  })
  const eligibleMachines = state.machines.filter((machine) => !excludedMachines.has(machine.id))
  const eligibleIds = new Set(eligibleCards.map((card) => card.id))

  const blocked = (reason: string): CyclePlan => ({
    cycleNumber,
    startingCapital: config.startingCapital,
    availableCapital: state.availableCapital,
    deployedAmount: 0,
    idleCapital: roundMoney(state.availableCapital),
    expectedProfit: 0,
    cardCountUsed: 0,
    cardAssignments: [],
    restingCardIds: state.cards.map((card) => card.id),
    restingMachineIds: state.machines.map((machine) => machine.id),
    bufferUsedBefore: state.bufferUsed,
    bufferUsedProjected: state.bufferUsed,
    bufferTriggerAmount: roundMoney(config.bufferAmount * config.bufferTriggerRatio),
    bufferActionRequired: false,
    selectionReason: reason,
  })

  if (eligibleCards.length === 0) {
    return blocked('No valid route available. No eligible cards remain under current admin constraints.')
  }
  if (eligibleMachines.length === 0) {
    return blocked('No valid route available. No eligible machines remain under current admin constraints.')
  }

  const { deployedAmount, cardCount } = largestValidDeployment(state.availableCapital, {
    ...config,
    cardCount: eligibleCards.length,
  })
  if (deployedAmount <= 0 || cardCount <= 0) {
    return blocked(
      `No valid route available. ${formatZar(state.availableCapital)} cannot be split across ${eligibleCards.length} eligible card${eligibleCards.length === 1 ? '' : 's'} within ${formatZar(config.minCardAmount)}–${formatZar(config.maxCardAmount)}.`
    )
  }

  const rankedCardIds = selectCards(state, eligibleIds.size, cycleNumber, eligibleIds).filter((id) =>
    cardHasLegalMachine(state, id, overlay)
  )
  if (!rankedCardIds.length) {
    return blocked('No valid route available. No eligible card has a legal machine under current pairing bans.')
  }

  let selectedCardIds: number[] = []
  let cardAssignments: CardAssignment[] = []
  let usedDeployed = 0
  for (let n = Math.min(cardCount, rankedCardIds.length); n >= 1; n--) {
    const candidateIds = rankedCardIds.slice(0, n)
    const sized = largestValidDeployment(state.availableCapital, {
      ...config,
      cardCount: candidateIds.length,
    })
    if (sized.deployedAmount <= 0 || sized.cardCount <= 0) continue
    const pickCount = Math.min(sized.cardCount, candidateIds.length)
    const picked = candidateIds.slice(0, pickCount)
    const mins = picked.map((id) => overlay.cardMinById[id] ?? config.minCardAmount)
    const maxes = picked.map((id) => overlay.cardMaxById[id] ?? config.maxCardAmount)
    let nextAmounts: number[]
    try {
      nextAmounts = splitAcrossCardsWithCaps(sized.deployedAmount, mins, maxes)
    } catch {
      try {
        nextAmounts = splitAcrossCards(
          sized.deployedAmount,
          pickCount,
          config.minCardAmount,
          config.maxCardAmount
        )
      } catch {
        continue
      }
    }
    const assigned = assignMachines(state, picked, nextAmounts, cycleNumber, overlay)
    if (!assigned.length) continue
    if (assigned.length !== picked.length) {
      n = assigned.length + 1
      continue
    }
    selectedCardIds = picked
    cardAssignments = assigned
    usedDeployed = sized.deployedAmount
    break
  }
  if (!cardAssignments.length) {
    return blocked('No valid route available under current machine pairing bans.')
  }
  const deployedForPlan = usedDeployed
  const idleCapital = roundMoney(Math.max(0, state.availableCapital - deployedForPlan))
  const expectedProfit = roundMoney(deployedForPlan * config.spread)
  const usedCardIds = new Set(cardAssignments.map((row) => row.cardId))
  const usedMachineIds = new Set(cardAssignments.map((row) => row.machineId))
  const restingCardIds = state.cards.map((card) => card.id).filter((id) => !usedCardIds.has(id))
  const restingMachineIds = state.machines
    .map((machine) => machine.id)
    .filter((id) => !usedMachineIds.has(id))
  const bufferTriggerAmount = roundMoney(config.bufferAmount * config.bufferTriggerRatio)
  const bufferUsedProjected = roundMoney(state.bufferUsed + deployedForPlan)
  const bufferActionRequired = state.bufferUsed > 0 && bufferUsedProjected > bufferTriggerAmount
  const overlayNotes = [
    overlay.excludedCardIds.length
      ? `${overlay.excludedCardIds.map((id) => cardLabel(id)).join(', ')} excluded by admin feedback.`
      : '',
    overlay.excludedMachineIds.length
      ? `${overlay.excludedMachineIds.map((id) => machineLabel(id)).join(', ')} unavailable by admin feedback.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const selectionReason = [
    `Need ${cardAssignments.length} card${cardAssignments.length === 1 ? '' : 's'} for ${formatZar(deployedForPlan)} within ${formatZar(config.minCardAmount)}–${formatZar(config.maxCardAmount)}.`,
    idleCapital > 0
      ? `${formatZar(idleCapital)} idle: available capital sits in a capacity gap.`
      : 'Full available capital is routable.',
    `${selectedCardIds.map((id) => cardLabel(id)).join(', ')} chosen for fewest active cycles, then longest rest.`,
    cardAssignments.map((row) => row.posReason).filter(Boolean).join(' ') ||
      `${cardAssignments.map((row) => machineLabel(row.machineId)).join(', ')} assigned for volume balance, then least-used pairings. Same-name pairs are never used.`,
    overlayNotes,
    bufferActionRequired
      ? `Projected buffer ${formatZar(bufferUsedProjected)} exceeds ${formatZar(bufferTriggerAmount)} working threshold.`
      : `Projected buffer ${formatZar(bufferUsedProjected)} within ${formatZar(bufferTriggerAmount)} working threshold.`,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    cycleNumber,
    startingCapital: config.startingCapital,
    availableCapital: state.availableCapital,
    deployedAmount: deployedForPlan,
    idleCapital,
    expectedProfit,
    cardCountUsed: cardAssignments.length,
    cardAssignments,
    restingCardIds,
    restingMachineIds,
    bufferUsedBefore: state.bufferUsed,
    bufferUsedProjected,
    bufferTriggerAmount,
    bufferActionRequired,
    selectionReason,
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
  const profit = roundMoney(actualProfit ?? plan.expectedProfit)
  const bufferUsed = roundMoney(state.bufferUsed + plan.deployedAmount)
  return {
    ...state,
    availableCapital: roundMoney(state.availableCapital + profit * state.config.recycleRate),
    bufferUsed: roundMoney(bufferUsed),
    completedCycles: plan.cycleNumber,
    cumulativeDeployed: roundMoney(state.cumulativeDeployed + plan.deployedAmount),
    cumulativeSpread: roundMoney(state.cumulativeSpread + profit),
  }
}

export function completeCycle(
  state: RoutingState,
  plan: CyclePlan,
  actualProfit?: number
): RoutingState {
  return applyCardPosContact(applySell(state, plan, actualProfit), plan.cardAssignments, plan.cycleNumber)
}

export function simulateRun(config: RoutingConfig = DEFAULT_TEST_CONFIG): {
  state: RoutingState
  cycles: CompletedCycle[]
} {
  let state = createInitialState(config)
  const cycles: CompletedCycle[] = []
  for (let i = 0; i < config.cycleCount; i++) {
    const plan = planCycle(state)
    state = completeCycle(state, plan)
    cycles.push({
      ...plan,
      actualProfit: plan.expectedProfit,
      status: 'completed',
    })
  }
  return { state, cycles }
}

const MOZ_RECEIVE_ACCOUNTS =
  'BCI, FNB Mozambique, BIM, Moza Banco, or Vista Mozambique'

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
}

export function planReplenish(
  state: RoutingState,
  costRate: number,
  overlay: RoutingOverlay = EMPTY_OVERLAY
): ReplenishPlan | null {
  const nextSell = planCycle(state, overlay)
  if (!nextSell.bufferActionRequired || state.bufferUsed <= 0 || !(costRate > 0)) return null
  const restockState: RoutingState = {
    ...state,
    availableCapital: state.bufferUsed,
    bufferUsed: 0,
  }
  const swipe = planCycle(restockState, overlay)
  return {
    cycleNumber: nextSell.cycleNumber,
    amountZar: state.bufferUsed,
    amountMzn: roundMoney(state.bufferUsed * costRate),
    costRate,
    cardAssignments: swipe.cardAssignments,
    restingCardIds: swipe.restingCardIds,
    restingMachineIds: swipe.restingMachineIds,
  }
}

export function previewAskImpact(
  state: RoutingState,
  overlay: RoutingOverlay,
  costRate: number
): { replenishFirst: ReplenishPlan | null; nextPlan: CyclePlan | null } {
  const replenishFirst = planReplenish(state, costRate, overlay)
  if (replenishFirst) return { replenishFirst, nextPlan: null }
  return { replenishFirst: null, nextPlan: planCycle(state, overlay) }
}

export function formatAskImpactBody(params: {
  acknowledgement: string
  currentPlan?: CyclePlan | null
  preview: { replenishFirst: ReplenishPlan | null; nextPlan: CyclePlan | null }
  proposal?: boolean
}): string {
  const lines = [params.acknowledgement.trim(), '']
  const replenish = params.preview.replenishFirst
  const plan = params.preview.nextPlan
  if (replenish) {
    lines.push(`Restock ZAR @ COST still first: ${formatZar(replenish.amountZar)}`)
    if (replenish.cardAssignments.length) {
      if (replenish.cardAssignments.length === 1) {
        lines.push(`Swipe ${swipeInstruction(replenish.cardAssignments[0])}.`)
        if (replenish.cardAssignments[0].posReason) {
          lines.push(replenish.cardAssignments[0].posReason)
        }
      } else {
        lines.push('Swipe:')
        for (const row of replenish.cardAssignments) {
          lines.push(swipeInstruction(row))
          if (row.posReason) lines.push(row.posReason)
        }
      }
    }
    lines.push(`Then sell ZAR, Cycle ${replenish.cycleNumber}`)
  } else if (plan && plan.deployedAmount > 0) {
    lines.push(`Next: receive MZN, then pay ${formatZar(plan.deployedAmount)}.`)
    lines.push(`Expected spread this sale: ${formatZar(plan.expectedProfit)}`)
    lines.push(
      plan.bufferActionRequired
        ? 'Restock ZAR @ COST would follow this sale.'
        : 'ZAR buffer still covers the next order after this sale.'
    )
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
  return {
    title: `Sell ZAR · Cycle ${plan.cycleNumber}`,
    body: `Pay ${formatZar(plan.deployedAmount)} after MZN reflects`,
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
  const lines = [
    acknowledgement,
    '',
    `Next: receive MZN, then pay ${formatZar(plan.deployedAmount)}.`,
  ]
  return { title, body: lines.join('\n') }
}

export function buildActivityCopy(
  plan: CyclePlan,
  cycleCount: number,
  status: 'awaiting_execution' | 'completed',
  spread: number,
  quotes?: { sellRate: number; costRate: number },
  extra?: { revisionReason?: string }
): { title: string; body: string } {
  const statusLabel = status === 'completed' ? 'Executed' : 'Awaiting execution'
  if (plan.deployedAmount <= 0) {
    return {
      title: `Sell ZAR · Cycle ${plan.cycleNumber}/${cycleCount}`,
      body: [
        extra?.revisionReason || 'Routing adjustment recorded',
        '',
        plan.selectionReason || 'No valid route available under current constraints.',
        '',
        'Modify a constraint or restore a card/POS, then Ask again.',
        `Status: ${statusLabel}`,
      ].join('\n'),
    }
  }
  const bufferAmount = plan.bufferTriggerAmount > 0 ? roundMoney(plan.bufferTriggerAmount / 0.9) : 50_000
  const bufferKept = roundMoney(Math.max(0, bufferAmount - plan.bufferUsedProjected))
  const lines = [
    `Pay ${formatZar(plan.deployedAmount)} after MZN has reflected.`,
    '',
    `1. Receive MZN into a Moz account (${MOZ_RECEIVE_ACCOUNTS}).`,
    '2. Wait for proof of payment and the credit.',
    '3. Only then send ZAR to the operator’s South African account.',
    '',
  ]
  if (extra?.revisionReason) {
    lines.push(`Reason for revision: ${extra.revisionReason}`)
    lines.push('')
  }
  lines.push('Rand carries the premium. Do not pay ZAR first.')
  lines.push(`Expected spread: ${formatSpreadPercent(spread)}`)
  lines.push(`Expected gross spread: ${formatZar(plan.expectedProfit)}`)
  if (quotes && quotes.sellRate > 0 && quotes.costRate > 0) {
    const profitPerZar = roundMoney(Math.max(0, quotes.sellRate - quotes.costRate))
    lines.push(`SELL ${quotes.sellRate.toFixed(2)} Mt/R · COST ${quotes.costRate.toFixed(2)} Mt/R`)
    lines.push(`Live spread: ${profitPerZar.toFixed(2)} Mt/R`)
  }
  lines.push(`ZAR kept in South Africa after this payout: ${formatZar(bufferKept)} of ${formatZar(bufferAmount)}.`)
  if (plan.bufferActionRequired) {
    lines.push('Restock ZAR @ COST before the next sale so the buffer is not emptied.')
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
  state?: RoutingState,
  overlay: RoutingOverlay = EMPTY_OVERLAY
): { title: string; body: string } {
  void status
  const rows = state
    ? annotatePosReasons(state, replenish.cardAssignments, replenish.cycleNumber, overlay)
    : replenish.cardAssignments
  const lines: string[] = []
  if (rows.length === 1) {
    lines.push(`Swipe ${swipeInstruction(rows[0])}.`)
    if (rows[0].posReason) {
      lines.push('')
      lines.push(rows[0].posReason)
    }
  } else if (rows.length > 1) {
    lines.push(`Swipe these ${rows.length} pairs:`)
    lines.push('')
    for (const row of rows) {
      lines.push(`Swipe ${swipeInstruction(row)}.`)
      if (row.posReason) lines.push(row.posReason)
      lines.push('')
    }
  } else {
    lines.push(`Restock ${formatZar(replenish.amountZar)} in South Africa at COST.`)
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
