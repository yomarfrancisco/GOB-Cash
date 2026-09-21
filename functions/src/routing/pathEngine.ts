/**
 * Q-best pair kernel. assignMachines enumerates legal pairs and breaks tightness ties.
 * This module picks the winner from residuals, confirmed exhaustion, and concentration.
 */

import { MZN_ZAR_API_RATE_AT_CALIBRATION, MZN_ZAR_MARKUP_RECEIVE_MZN, MARGIN_ON_COST } from '../fx/quotedMznZar'
import type { RoutingOverlay } from './constraints'
import type { CardAssignment, RoutingState } from './conversionRouter'
import { cardShortName, isForbiddenPair, machineShortName } from './inventory'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function pairingKey(cardId: number, machineId: number): string {
  return `${cardId}:${machineId}`
}

function formatZar(amount: number): string {
  const rounded = roundMoney(amount)
  const nearestInt = Math.round(rounded)
  const useInt = Math.abs(rounded - nearestInt) < 0.005
  const formatted = (useInt ? nearestInt : rounded).toLocaleString('en-US', {
    minimumFractionDigits: useInt ? 0 : 2,
    maximumFractionDigits: useInt ? 0 : 2,
  })
  return `R${formatted}`
}

export type PathResidual = {
  economicPaymentId: string
  amountZar: number
  originCycle: number
  cardId: number | null
  machineId: number | null
  status: 'open' | 'settled' | 'rerouted' | 'expired'
}

export type ExhaustionKind = 'freeze' | 'decline' | 'delay' | 'unpaid' | 'rail_up'

export type ExhaustionNote = {
  cycle: number
  kind: ExhaustionKind
  cardId: number | null
  machineId: number | null
  amountZar: number | null
  at: string
  economicPaymentId?: string
}

export type FrozenQuote = {
  apiMid: number
  costRate: number
  sellRate: number
  quotedAt: number
}

export type PathBook = {
  residuals?: PathResidual[]
  notes?: ExhaustionNote[]
  quote?: FrozenQuote
}

export type PathWrite = {
  kind: ExhaustionKind
  cardId: number | null
  machineId: number | null
  amountZar: number | null
  economicPaymentId?: string
  summary: string
}

export type TightnessRank = {
  cardId: number
  machineId: number
  tightness: number
  residualFit: boolean
  reason: string
}

export function fallbackQuote(quotedAt = 0): FrozenQuote {
  const apiMid = MZN_ZAR_API_RATE_AT_CALIBRATION
  const costRate = apiMid * MZN_ZAR_MARKUP_RECEIVE_MZN
  return {
    apiMid,
    costRate,
    sellRate: costRate * (1 + MARGIN_ON_COST),
    quotedAt,
  }
}

export function expectedSpreadMzn(amountZar: number, quote: FrozenQuote): number {
  return roundMoney(amountZar * Math.max(0, quote.sellRate - quote.costRate))
}

export function openResiduals(book: PathBook = {}): PathResidual[] {
  return (book.residuals || []).filter((row) => row.status === 'open')
}

export function activeFreezes(notes: ExhaustionNote[] = []): ExhaustionNote[] {
  const frozen: ExhaustionNote[] = []
  for (const note of notes) {
    if (note.kind === 'freeze') frozen.push(note)
    if (note.kind === 'rail_up') {
      for (let i = frozen.length - 1; i >= 0; i--) {
        const row = frozen[i]
        const cardMatch = !note.cardId || !row.cardId || note.cardId === row.cardId
        const posMatch = !note.machineId || !row.machineId || note.machineId === row.machineId
        if (cardMatch && posMatch) frozen.splice(i, 1)
      }
    }
  }
  return frozen
}

function railFrozen(
  cardId: number,
  machineId: number,
  notes: ExhaustionNote[]
): boolean {
  return activeFreezes(notes).some((row) => {
    const cardHit = row.cardId != null && row.cardId === cardId
    const posHit = row.machineId != null && row.machineId === machineId
    if (row.cardId != null && row.machineId != null) return cardHit && posHit
    return cardHit || posHit
  })
}

export function declinedCardsForPayment(notes: ExhaustionNote[], paymentId: string | undefined): number[] {
  if (!paymentId) return []
  return notes
    .filter((row) => row.kind === 'decline' && row.economicPaymentId === paymentId && typeof row.cardId === 'number')
    .map((row) => row.cardId as number)
}

export function legalPairs(
  state: RoutingState,
  overlay: RoutingOverlay,
  notes: ExhaustionNote[] = []
): Array<{ cardId: number; machineId: number }> {
  const excludedCards = new Set(overlay.excludedCardIds)
  const excludedMachines = new Set(overlay.excludedMachineIds)
  const pairs: Array<{ cardId: number; machineId: number }> = []
  for (const card of state.cards) {
    if (excludedCards.has(card.id)) continue
    for (const machine of state.machines) {
      if (excludedMachines.has(machine.id)) continue
      if (isForbiddenPair(card.id, machine.id)) continue
      if (railFrozen(card.id, machine.id, notes)) continue
      pairs.push({ cardId: card.id, machineId: machine.id })
    }
  }
  return pairs
}

export function pairTightness(params: {
  state: RoutingState
  cardId: number
  machineId: number
  notes?: ExhaustionNote[]
  residuals?: PathResidual[]
}): { tightness: number; reason: string } {
  const notes = params.notes || []
  const residualOnLast = (params.residuals || []).some(
    (row) =>
      row.status === 'open' &&
      row.cardId === params.cardId &&
      row.machineId === params.machineId
  )
  let tightness = 0
  const bits: string[] = []
  const posDeclines = notes.filter((row) => row.kind === 'decline' && row.machineId === params.machineId).length
  const posUnpaid = notes.filter((row) => row.kind === 'unpaid' && row.machineId === params.machineId).length
  const delays = notes.filter(
    (row) => row.kind === 'delay' && (row.machineId === params.machineId || row.cardId === params.cardId)
  ).length
  if (posDeclines) {
    tightness += posDeclines * 3
    bits.push(`${machineShortName(params.machineId)} has ${posDeclines} confirmed decline${posDeclines === 1 ? '' : 's'}`)
  }
  if (posUnpaid) {
    tightness += posUnpaid * 3
    bits.push(`${machineShortName(params.machineId)} has unpaid leftovers`)
  }
  if (delays) {
    tightness += delays
    bits.push('confirmed delay on this rail')
  }
  if (residualOnLast) {
    tightness += 2
    bits.push('last pair on an open residual — unpin and reroute if another legal pair exists')
  }
  const machine = params.state.machines.find((row) => row.id === params.machineId)
  const card = params.state.cards.find((row) => row.id === params.cardId)
  const machineVol = machine?.volume || 0
  const cardVol = card?.volume || 0
  tightness += machineVol / 20_000 + cardVol / 20_000
  if (machineVol >= 30_000) bits.push(`${machineShortName(params.machineId)} already concentrated on the ledger`)
  return {
    tightness,
    reason: bits.join('; ') || 'no confirmed exhaustion on this pair',
  }
}

export function scoreLegalPair(params: {
  state: RoutingState
  overlay: RoutingOverlay
  cardId: number
  machineId: number
  notes?: ExhaustionNote[]
  residual?: PathResidual | null
  residuals?: PathResidual[]
}): TightnessRank {
  const residualFit = Boolean(
    params.residual &&
      !declinedCardsForPayment(params.notes || [], params.residual.economicPaymentId).includes(params.cardId)
  )
  const { tightness, reason } = pairTightness({
    state: params.state,
    cardId: params.cardId,
    machineId: params.machineId,
    notes: params.notes,
    residuals: params.residuals,
  })
  return {
    cardId: params.cardId,
    machineId: params.machineId,
    tightness,
    residualFit,
    reason,
  }
}

function compareScored(
  a: TightnessRank,
  b: TightnessRank,
  state: RoutingState,
  overlay: RoutingOverlay,
  cycleNumber: number
): number {
  if (a.residualFit !== b.residualFit) return a.residualFit ? -1 : 1
  if (Math.abs(a.tightness - b.tightness) > 0.05) return a.tightness - b.tightness
  const preferred = new Set(overlay.preferredMachineIds)
  const aPref = preferred.has(a.machineId) ? 0 : 1
  const bPref = preferred.has(b.machineId) ? 0 : 1
  if (aPref !== bPref) return aPref - bPref
  const aPair = state.pairings[pairingKey(a.cardId, a.machineId)] || 0
  const bPair = state.pairings[pairingKey(b.cardId, b.machineId)] || 0
  if (aPair !== bPair) return aPair - bPair
  const aIdle = state.machines.find((row) => row.id === a.machineId)?.lastCycleUsed || 0
  const bIdle = state.machines.find((row) => row.id === b.machineId)?.lastCycleUsed || 0
  if (aIdle !== bIdle) return aIdle - bIdle
  if (a.cardId !== b.cardId) {
    const aRest = state.cards.find((row) => row.id === a.cardId)
    const bRest = state.cards.find((row) => row.id === b.cardId)
    const aActive = aRest?.activeCycles || 0
    const bActive = bRest?.activeCycles || 0
    if (aActive !== bActive) return aActive - bActive
    const aJust = aRest?.lastCycleUsed === cycleNumber - 1
    const bJust = bRest?.lastCycleUsed === cycleNumber - 1
    if (aJust !== bJust) return aJust ? 1 : -1
  }
  return a.machineId - b.machineId || a.cardId - b.cardId
}

export function explainPathPick(rank: TightnessRank, residual?: PathResidual | null): string {
  const pair = `${cardShortName(rank.cardId)} → ${machineShortName(rank.machineId)}`
  if (residual && rank.residualFit) {
    return `${pair} — leftover ${formatZar(residual.amountZar)} (${residual.economicPaymentId}) still has to move, so this is the Q-best live legal pair rather than the last failed rail.`
  }
  if (rank.reason.includes('decline') || rank.reason.includes('unpaid') || rank.reason.includes('delay')) {
    return `${pair} — ${rank.reason}.`
  }
  if (rank.reason.includes('concentrated')) {
    return `${pair} — ${rank.reason}, so this pair is the least tight legal option.`
  }
  return `${pair} — legal pairs were even on residuals and confirmed exhaustion, so the quieter pair wins.`
}

export function pickQBestPair(params: {
  state: RoutingState
  overlay: RoutingOverlay
  cycleNumber: number
  amountZar: number
  book?: PathBook
  residual?: PathResidual | null
  blockedCardIds?: number[]
  onlyCardId?: number
}): { assignment: CardAssignment; ranks: TightnessRank[]; holdReason?: undefined } | { assignment?: undefined; ranks: TightnessRank[]; holdReason: string } {
  const notes = params.book?.notes || []
  const blocked = new Set(params.blockedCardIds || [])
  if (params.residual) {
    for (const id of declinedCardsForPayment(notes, params.residual.economicPaymentId)) blocked.add(id)
  }
  const pairs = legalPairs(params.state, params.overlay, notes).filter((row) => {
    if (blocked.has(row.cardId)) return false
    if (typeof params.onlyCardId === 'number' && row.cardId !== params.onlyCardId) return false
    return true
  })
  const ranks = pairs
    .map((row) =>
      scoreLegalPair({
        state: params.state,
        overlay: params.overlay,
        cardId: row.cardId,
        machineId: row.machineId,
        notes,
        residual: params.residual,
        residuals: params.book?.residuals,
      })
    )
    .sort((a, b) => compareScored(a, b, params.state, params.overlay, params.cycleNumber))
  if (!ranks.length) {
    return { ranks, holdReason: 'Hold: every legal pair is frozen or banned.' }
  }
  const min = params.state.config.minCardAmount
  const max = params.state.config.maxCardAmount
  if (params.amountZar + 0.005 < min || params.amountZar - 0.005 > max) {
    return {
      ranks,
      holdReason: `Hold: leftover ${formatZar(params.amountZar)} does not fit ${formatZar(min)}–${formatZar(max)}.`,
    }
  }
  const best = ranks[0]
  const posReason = explainPathPick(best, params.residual)
  return {
    ranks,
    assignment: {
      cardId: best.cardId,
      machineId: best.machineId,
      amount: params.amountZar,
      posReason,
    },
  }
}

export function applyPathWrites(
  book: PathBook,
  writes: PathWrite[],
  extra: { cycleNumber: number; nowIso: string }
): PathBook {
  const residuals = [...(book.residuals || [])]
  const notes = [...(book.notes || [])]
  for (const write of writes) {
    notes.push({
      cycle: extra.cycleNumber,
      kind: write.kind,
      cardId: write.cardId,
      machineId: write.machineId,
      amountZar: write.amountZar,
      at: extra.nowIso,
      economicPaymentId: write.economicPaymentId,
    })
    if (write.kind === 'decline' || write.kind === 'unpaid' || write.kind === 'delay') {
      const amount = write.amountZar || 0
      const existing = residuals.find(
        (row) =>
          row.status === 'open' &&
          ((write.economicPaymentId && row.economicPaymentId === write.economicPaymentId) ||
            (row.cardId === write.cardId && row.machineId === write.machineId && row.amountZar === amount))
      )
      if (!existing && amount > 0) {
        residuals.push({
          economicPaymentId:
            write.economicPaymentId ||
            `pay-c${extra.cycleNumber}-${write.cardId || 0}-${write.machineId || 0}`,
          amountZar: amount,
          originCycle: extra.cycleNumber,
          cardId: write.cardId,
          machineId: write.machineId,
          status: 'open',
        })
      }
    }
  }
  return { ...book, residuals, notes }
}

export function settleResidualOnConfirm(
  residuals: PathResidual[],
  assignment: { cardId: number; machineId: number; amount: number },
  paymentId?: string
): PathResidual[] {
  return residuals.map((row) => {
    if (row.status !== 'open') return row
    const samePayment = paymentId ? row.economicPaymentId === paymentId : Math.abs(row.amountZar - assignment.amount) < 0.01
    if (!samePayment) return row
    const rerouted = (row.cardId != null && row.cardId !== assignment.cardId) || (row.machineId != null && row.machineId !== assignment.machineId)
    return { ...row, status: rerouted ? 'rerouted' : 'settled', cardId: assignment.cardId, machineId: assignment.machineId }
  })
}

export function residualPaymentId(cycleNumber: number, cardId: number, machineId: number): string {
  return `pay-c${cycleNumber}-${cardId}-${machineId}`
}

export function frozenQuoteFromSell(sellRate: number, quotedAt = Date.now()): FrozenQuote {
  const costRate =
    Number.isFinite(sellRate) && sellRate > 0
      ? sellRate / (1 + MARGIN_ON_COST)
      : MZN_ZAR_API_RATE_AT_CALIBRATION * MZN_ZAR_MARKUP_RECEIVE_MZN
  const apiMid = costRate / MZN_ZAR_MARKUP_RECEIVE_MZN
  return {
    apiMid,
    costRate,
    sellRate: Number.isFinite(sellRate) && sellRate > 0 ? sellRate : costRate * (1 + MARGIN_ON_COST),
    quotedAt,
  }
}

export function zarProfitFromQuote(amountZar: number, quote: FrozenQuote): number {
  if (!(quote.costRate > 0)) return 0
  return roundMoney(amountZar * Math.max(0, quote.sellRate - quote.costRate) / quote.costRate)
}

function parseResidual(raw: unknown): PathResidual | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<PathResidual>
  if (typeof row.economicPaymentId !== 'string' || !row.economicPaymentId) return null
  if (typeof row.amountZar !== 'number' || !(row.amountZar > 0)) return null
  if (row.status !== 'open' && row.status !== 'settled' && row.status !== 'rerouted' && row.status !== 'expired') {
    return null
  }
  return {
    economicPaymentId: row.economicPaymentId,
    amountZar: row.amountZar,
    originCycle: typeof row.originCycle === 'number' ? row.originCycle : 0,
    cardId: typeof row.cardId === 'number' ? row.cardId : null,
    machineId: typeof row.machineId === 'number' ? row.machineId : null,
    status: row.status,
  }
}

function parseNote(raw: unknown): ExhaustionNote | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<ExhaustionNote>
  if (
    row.kind !== 'freeze' &&
    row.kind !== 'decline' &&
    row.kind !== 'delay' &&
    row.kind !== 'unpaid' &&
    row.kind !== 'rail_up'
  ) {
    return null
  }
  return {
    cycle: typeof row.cycle === 'number' ? row.cycle : 0,
    kind: row.kind,
    cardId: typeof row.cardId === 'number' ? row.cardId : null,
    machineId: typeof row.machineId === 'number' ? row.machineId : null,
    amountZar: typeof row.amountZar === 'number' ? row.amountZar : null,
    at: typeof row.at === 'string' ? row.at : '',
    economicPaymentId: typeof row.economicPaymentId === 'string' ? row.economicPaymentId : undefined,
  }
}

export function parseFrozenQuote(raw: unknown): FrozenQuote | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Partial<FrozenQuote>
  if (!(typeof row.sellRate === 'number' && row.sellRate > 0)) return undefined
  if (!(typeof row.costRate === 'number' && row.costRate > 0)) return undefined
  return {
    apiMid: typeof row.apiMid === 'number' && row.apiMid > 0 ? row.apiMid : row.costRate / MZN_ZAR_MARKUP_RECEIVE_MZN,
    costRate: row.costRate,
    sellRate: row.sellRate,
    quotedAt: typeof row.quotedAt === 'number' ? row.quotedAt : 0,
  }
}

export function parsePathBook(raw: unknown): PathBook {
  if (!raw || typeof raw !== 'object') return {}
  const row = raw as { residuals?: unknown; notes?: unknown; quote?: unknown; pathResiduals?: unknown; exhaustionNotes?: unknown }
  return {
    residuals: Array.isArray(row.residuals)
      ? row.residuals.flatMap((item) => {
          const parsed = parseResidual(item)
          return parsed ? [parsed] : []
        })
      : Array.isArray(row.pathResiduals)
        ? row.pathResiduals.flatMap((item) => {
            const parsed = parseResidual(item)
            return parsed ? [parsed] : []
          })
        : [],
    notes: Array.isArray(row.notes)
      ? row.notes.flatMap((item) => {
          const parsed = parseNote(item)
          return parsed ? [parsed] : []
        })
      : Array.isArray(row.exhaustionNotes)
        ? row.exhaustionNotes.flatMap((item) => {
            const parsed = parseNote(item)
            return parsed ? [parsed] : []
          })
        : [],
    quote: parseFrozenQuote(row.quote),
  }
}

export function parsePathWrite(raw: unknown): PathWrite | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<PathWrite>
  if (
    row.kind !== 'freeze' &&
    row.kind !== 'decline' &&
    row.kind !== 'delay' &&
    row.kind !== 'unpaid' &&
    row.kind !== 'rail_up'
  ) {
    return null
  }
  return {
    kind: row.kind,
    cardId: typeof row.cardId === 'number' ? row.cardId : null,
    machineId: typeof row.machineId === 'number' ? row.machineId : null,
    amountZar: typeof row.amountZar === 'number' ? row.amountZar : null,
    economicPaymentId: typeof row.economicPaymentId === 'string' ? row.economicPaymentId : undefined,
    summary: typeof row.summary === 'string' ? row.summary : row.kind,
  }
}

function amountFromMessage(message: string): number | null {
  const match =
    message.match(/\br\s*([0-9][0-9\s,]*(?:\.\d+)?)\s*k\b/i) ||
    message.match(/\br\s*([0-9][0-9\s,]*(?:\.\d+)?)\b/i)
  if (!match) return null
  const raw = match[1].replace(/[\s,]/g, '')
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  if (/k\b/i.test(match[0]) && value < 1_000) return value * 1_000
  return value
}

export function classifyPathWrite(
  message: string,
  extra: {
    cardIds?: number[]
    machineIds?: number[]
    amountZar?: number | null
    economicPaymentId?: string
    openCardId?: number | null
    openMachineId?: number | null
  } = {}
): { write?: PathWrite; ambiguous?: string } | null {
  const text = message.trim().toLowerCase()
  if (!text) return null
  let kind: ExhaustionKind | null = null
  if (/\b(rail[_\s-]?up|back up|unfrozen|unfreeze|is up again|came back up)\b/.test(text)) kind = 'rail_up'
  else if (/\b(froze|frozen|freeze)\b/.test(text)) kind = 'freeze'
  else if (/\b(declined|decline)\b/.test(text)) kind = 'decline'
  else if (/\b(unpaid|did not land|didn't land|has not landed|did not hit|didn't hit|never landed)\b/.test(text)) {
    kind = 'unpaid'
  } else if (/\b(delay|delayed|still pending|has not cleared)\b/.test(text)) kind = 'delay'
  if (!kind) return null

  const cardId = extra.cardIds?.[0] ?? extra.openCardId ?? null
  const machineId = extra.machineIds?.[0] ?? extra.openMachineId ?? null
  const amountZar = amountFromMessage(message) ?? extra.amountZar ?? null

  if ((kind === 'freeze' || kind === 'rail_up') && machineId == null && cardId == null) {
    return { ambiguous: 'Which rail froze or came back up — name the POS, and the card if that card is also down.' }
  }
  if ((kind === 'decline' || kind === 'unpaid' || kind === 'delay') && machineId == null && cardId == null && !extra.economicPaymentId) {
    return { ambiguous: 'Which ticket or rail — name the card or POS, or confirm it is the open instruction.' }
  }

  const rail = [cardId != null ? `card ${cardId}` : '', machineId != null ? `POS ${machineId}` : '']
    .filter(Boolean)
    .join(' × ')
  const amountBit = amountZar ? ` ${formatZar(amountZar)}` : ''
  const summary =
    kind === 'freeze'
      ? `${rail || 'Named rail'} is frozen until rail_up.`
      : kind === 'rail_up'
        ? `${rail || 'Named rail'} is up again.`
        : kind === 'decline'
          ? `${rail || 'Open ticket'}${amountBit} declined — leftover will reroute to the Q-best live legal pair.`
          : kind === 'unpaid'
            ? `${rail || 'Open ticket'}${amountBit} did not land — leftover stays open and unpins the last pair.`
            : `${rail || 'Open ticket'}${amountBit} delayed — leftover stays open.`

  return {
    write: {
      kind,
      cardId: typeof cardId === 'number' ? cardId : null,
      machineId: typeof machineId === 'number' ? machineId : null,
      amountZar: typeof amountZar === 'number' ? amountZar : null,
      economicPaymentId: extra.economicPaymentId,
      summary,
    },
  }
}
