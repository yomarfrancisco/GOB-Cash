/**
 * Friction facts for COST restock: dated swipes, typed notes, one sentence, one question.
 * Does not pick a different card to look safer.
 */

import { cardShortName, machineShortName, resolveNamedCardIds } from './inventory'

type Assignment = { cardId: number; machineId: number; amount: number }

function formatZar(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const nearestInt = Math.round(rounded)
  const useInt = Math.abs(rounded - nearestInt) < 0.005
  const formatted = (useInt ? nearestInt : rounded).toLocaleString('en-US', {
    minimumFractionDigits: useInt ? 0 : 2,
    maximumFractionDigits: useInt ? 0 : 2,
  })
  return `R${formatted}`
}

export type SwipeRecord = {
  id: string
  atMs: number
  cardId: number
  machineId: number
  amount: number
  cycleNumber: number
}

export type SwipeOutcome = 'cleared' | 'docs' | 'declined' | 'review_cleared'

export type FrictionNote = {
  id: string
  kind: 'outcome' | 'profile'
  atMs: number
  text: string
  cardId?: number
  machineId?: number
  swipeId?: string
  outcome?: SwipeOutcome
  declaredMonthlyZar?: number
}

const DAY = 86_400_000
const OUTCOME_ASK_AFTER_MS = 18 * 60 * 60 * 1000
const QUESTION_COOLDOWN_MS = 8 * 60 * 60 * 1000

export function swipeIdFor(cycleNumber: number, cardId: number, machineId: number): string {
  return `${cycleNumber}-${cardId}-${machineId}`
}

export function isFrictionNoteReply(message: string): boolean {
  const text = message.trim().toLowerCase()
  if (!text) return false
  return Boolean(
    parseOutcome(text) ||
      parseDeclaredMonthly(text) ||
      /\b(cleared after review|review then cleared|they asked for (?:docs|documents|an invoice)|invoice requested)\b/.test(
        text
      )
  )
}

function parseOutcome(text: string): SwipeOutcome | null {
  if (/\b(declined|issuer declined|blocked the (?:swipe|card)|did not go through)\b/.test(text)) {
    return 'declined'
  }
  if (/\b(docs? requested|asked for (?:docs|documents|an invoice|paperwork)|need(?:s|ed)? (?:an )?invoice)\b/.test(text)) {
    return 'docs'
  }
  if (/\b(cleared after review|after review|manual review then (?:cleared|ok))\b/.test(text)) {
    return 'review_cleared'
  }
  if (/\b(cleared|went through|no (?:issue|problem|friction)|clean)\b/.test(text) && text.split(/\s+/).length <= 16) {
    return 'cleared'
  }
  return null
}

function parseDeclaredMonthly(text: string): number | null {
  const match =
    text.match(/\b(?:declared|told the bank|bank expects?|monthly)\s*r?\s*([\d.,]+)\s*(k|m)?\b/i) ||
    text.match(/\br\s*([\d.,]+)\s*(k|m)?\s*(?:\/\s*month|a month|monthly)\b/i)
  if (!match) return null
  const raw = Number(String(match[1]).replace(/,/g, ''))
  if (!Number.isFinite(raw) || raw <= 0) return null
  const unit = (match[2] || '').toLowerCase()
  if (unit === 'm') return Math.round(raw * 1_000_000)
  if (unit === 'k') return Math.round(raw * 1_000)
  return Math.round(raw)
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function inWindow(swipes: SwipeRecord[], nowMs: number, days: number, pred: (row: SwipeRecord) => boolean) {
  const from = nowMs - days * DAY
  return swipes.filter((row) => row.atMs >= from && pred(row))
}

function unlabeledSwipes(swipes: SwipeRecord[], notes: FrictionNote[]): SwipeRecord[] {
  const labeled = new Set(notes.filter((row) => row.kind === 'outcome' && row.swipeId).map((row) => row.swipeId))
  const labeledCardDay = notes.filter((row) => row.kind === 'outcome' && row.cardId && !row.swipeId)
  return swipes.filter((swipe) => {
    if (labeled.has(swipe.id)) return false
    return !labeledCardDay.some(
      (note) => note.cardId === swipe.cardId && Math.abs((note.atMs || 0) - swipe.atMs) < 2 * DAY
    )
  })
}

function latestDecline(notes: FrictionNote[], nowMs: number, withinDays = 7): FrictionNote | null {
  const from = nowMs - withinDays * DAY
  return (
    [...notes]
      .filter((row) => row.kind === 'outcome' && row.outcome === 'declined' && row.atMs >= from)
      .sort((a, b) => b.atMs - a.atMs)[0] || null
  )
}

export function parseFrictionNote(
  message: string,
  params: {
    nowMs: number
    swipes: SwipeRecord[]
    pendingKind?: string | null
  }
): FrictionNote | null {
  const text = message.trim()
  const lower = text.toLowerCase()
  const outcome = parseOutcome(lower)
  const monthly = parseDeclaredMonthly(lower)
  const named = resolveNamedCardIds(text)
  const latest = [...params.swipes].sort((a, b) => b.atMs - a.atMs)[0]
  if (monthly && (params.pendingKind === 'declared_month' || /\b(month|declared|bank)\b/.test(lower))) {
    return {
      id: `profile-${params.nowMs}`,
      kind: 'profile',
      atMs: params.nowMs,
      declaredMonthlyZar: monthly,
      text: `Declared monthly ${formatZar(monthly)}.`,
    }
  }
  if (!outcome) return null
  const swipe =
    (named.length && params.swipes.filter((row) => row.cardId === named[0]).sort((a, b) => b.atMs - a.atMs)[0]) ||
    latest
  return {
    id: `outcome-${params.nowMs}`,
    kind: 'outcome',
    atMs: params.nowMs,
    outcome,
    cardId: named[0] || swipe?.cardId,
    machineId: swipe?.machineId,
    swipeId: swipe?.id,
    text: text.slice(0, 240),
  }
}

export function formatFrictionSentence(params: {
  assignments: Assignment[]
  swipes: SwipeRecord[]
  notes: FrictionNote[]
  nowMs: number
}): string | null {
  const proposed = params.assignments
  if (!proposed.length) return null
  const ids = new Set(proposed.map((row) => row.cardId))
  const decline = latestDecline(params.notes, params.nowMs)
  if (decline && (decline.cardId == null || ids.has(decline.cardId))) {
    const name = cardShortName(decline.cardId || proposed[0].cardId)
    return `${name} was declined this week. Do not swipe another card — Ask how to proceed.`
  }
  for (const row of proposed) {
    const pairWeek = inWindow(
      params.swipes,
      params.nowMs,
      7,
      (item) => item.cardId === row.cardId && item.machineId === row.machineId
    )
    if (pairWeek.length >= 3) {
      return `${cardShortName(row.cardId)} on ${machineShortName(row.machineId)} has run ${pairWeek.length} times in 7 days. Wait for those to settle, or have the invoice ready.`
    }
  }
  if (proposed.length !== 1) return null
  const only = proposed[0]
  const cardMonth = inWindow(params.swipes, params.nowMs, 30, (row) => row.cardId === only.cardId)
  const typical = median(cardMonth.map((row) => row.amount))
  if (typical && typical > 0 && (only.amount > Math.max(...cardMonth.map((row) => row.amount)) * 1.05 || only.amount >= typical * 1.5)) {
    return `${cardShortName(only.cardId)}'s last 30 days typical ${formatZar(typical)}; this swipe is ${formatZar(only.amount)}. Have the invoice ready.`
  }
  return null
}

export type NoteQuestion = {
  questionKind: 'swipe_outcome' | 'declared_month' | 'decline_followup'
  title: string
  body: string
}

export function nextNoteQuestion(params: {
  swipes: SwipeRecord[]
  notes: FrictionNote[]
  nowMs: number
  proposed?: Assignment[]
  pendingKind?: string | null
  lastQuestionAtMs?: number | null
}): NoteQuestion | null {
  if (params.pendingKind === 'swipe_outcome' || params.pendingKind === 'declared_month' || params.pendingKind === 'decline_followup') {
    return null
  }
  if (params.lastQuestionAtMs && params.nowMs - params.lastQuestionAtMs < QUESTION_COOLDOWN_MS) {
    return null
  }
  const decline = latestDecline(params.notes, params.nowMs)
  const proposedCard = params.proposed?.[0]?.cardId
  if (decline) {
    const declinedCard = decline.cardId
    if (proposedCard && declinedCard && proposedCard !== declinedCard) {
      return {
        questionKind: 'decline_followup',
        title: 'Do not switch cards',
        body: `${cardShortName(declinedCard)} was declined this week. Do not swipe ${cardShortName(proposedCard)} to work around that. Say how to proceed on ${cardShortName(declinedCard)}, or that the bank cleared it.`,
      }
    }
    return {
      questionKind: 'decline_followup',
      title: 'Decline on file',
      body: `${cardShortName(declinedCard || proposedCard || 0)} was declined this week. How do you want to proceed? Do not switch cards unless you say so.`,
    }
  }
  const open = unlabeledSwipes(params.swipes, params.notes)
    .filter((row) => params.nowMs - row.atMs >= OUTCOME_ASK_AFTER_MS)
    .sort((a, b) => b.atMs - a.atMs)
  const due = open[0]
  if (due) {
    const ageDays = Math.max(1, Math.round((params.nowMs - due.atMs) / DAY))
    return {
      questionKind: 'swipe_outcome',
      title: 'How did that swipe go?',
      body: `Did ${cardShortName(due.cardId)} on ${machineShortName(due.machineId)} (${formatZar(due.amount)}, ${ageDays} day${ageDays === 1 ? '' : 's'} ago) clear, get documents requested, or decline?`,
    }
  }
  const monthValue = inWindow(params.swipes, params.nowMs, 30, () => true).reduce((sum, row) => sum + row.amount, 0)
  const hasProfile = params.notes.some((row) => row.kind === 'profile' && (row.declaredMonthlyZar || 0) > 0)
  if (!hasProfile && monthValue >= 200_000) {
    return {
      questionKind: 'declared_month',
      title: 'Bank profile',
      body: `This month is already ${formatZar(monthValue)} through the POS. What monthly ZAR have you told the bank to expect?`,
    }
  }
  return null
}

export function declineBlocksOtherCard(notes: FrictionNote[], nowMs: number, namedCardId: number): boolean {
  const decline = latestDecline(notes, nowMs)
  if (!decline?.cardId) return false
  return decline.cardId !== namedCardId
}

