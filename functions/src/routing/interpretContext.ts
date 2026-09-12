import { formatZar, type RoutingState } from './conversionRouter'
import type { RoutingIntent, StoredConstraint } from './constraints'
import { cardLabel, machineLabel, resolveNamedCardIds } from './inventory'
import { formatRoutingClock, formatSast, resolveExpiryFromMessage } from './routingTime'

export type RecentCycleBrief = {
  cycleNumber: number
  status: string
  createdAtMs: number | null
  completedAtMs: number | null
  assignments: Array<{ cardId: number; machineId: number; amount: number; posReason?: string }>
}

export type RecentFeedbackBrief = {
  rawMessage: string
  summary: string | null
  createdAtMs: number | null
  status: string
  questionKind?: string | null
}

export type LedgerSnapshot = {
  availableCapital: number
  bufferUsed: number
  completedCycles: number
  cycleCount: number
  bufferAmount: number
  cards: Array<{
    id: number
    activeCycles: number
    restCycles: number
    volume: number
    lastCycleUsed: number
    machineHistory?: number[]
  }>
  machines: Array<{
    id: number
    activeCycles: number
    restCycles: number
    volume: number
    lastCycleUsed: number
  }>
  pairings: Record<string, number>
}

export function ledgerFromRoutingState(state: RoutingState): LedgerSnapshot {
  return {
    availableCapital: state.availableCapital,
    bufferUsed: state.bufferUsed,
    completedCycles: state.completedCycles,
    cycleCount: state.config.cycleCount,
    bufferAmount: state.config.bufferAmount,
    cards: state.cards,
    machines: state.machines,
    pairings: state.pairings,
  }
}

function machineCounts(history: number[] | undefined): string {
  if (!history?.length) return 'none'
  const counts = new Map<number, number>()
  for (const id of history) counts.set(id, (counts.get(id) || 0) + 1)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id, count]) => `${machineLabel(id)}×${count}`)
    .join(', ')
}

function formatAssignments(
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
): string {
  if (!assignments.length) return '(none)'
  return assignments
    .map((row) => `${cardLabel(row.cardId)} · ${machineLabel(row.machineId)} · ${formatZar(row.amount)}`)
    .join('; ')
}

function lastUsedLabel(lastCycleUsed: number, currentCycle: number): string {
  if (!lastCycleUsed) return 'never used'
  const ago = currentCycle - lastCycleUsed
  if (ago <= 0) return `last used cycle ${lastCycleUsed}`
  return `last used cycle ${lastCycleUsed} (${ago} ago)`
}

function constraintLine(row: StoredConstraint, nowMs: number): string {
  const expiry =
    typeof row.expiresAt === 'number' ? `; expires ${formatSast(row.expiresAt)}` : ''
  const remaining =
    row.scope === 'n_cycles' && row.remainingCycles != null
      ? `; ${row.remainingCycles} cycle${row.remainingCycles === 1 ? '' : 's'} left`
      : ''
  const issued = row.createdAtCycle ? `; issued on cycle ${row.createdAtCycle}` : ''
  const stale =
    typeof row.expiresAt === 'number' && row.expiresAt <= nowMs ? ' [already past Now]' : ''
  return `- ${row.summary || `${row.action} ${row.resourceId} ${row.scope}`}${issued}${remaining}${expiry}${stale}`
}

export function buildRoutingLedgerBrief(params: {
  ledger: LedgerSnapshot
  constraints: StoredConstraint[]
  recentCycles?: RecentCycleBrief[]
  recentFeedback?: RecentFeedbackBrief[]
  awaiting: { cycleNumber: number; kind?: string; issuedAtMs: number | null }
  nowMs: number
}): string {
  const clock = formatRoutingClock(params.nowMs)
  const { ledger, awaiting } = params
  const active = params.constraints.filter((row) => row.status === 'active')
  const pairingEntries = Object.entries(ledger.pairings || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([key, count]) => `${key.replace(':', '-')}×${count}`)

  const cards = ledger.cards
    .map((card) => {
      return `${cardLabel(card.id)} ${lastUsedLabel(card.lastCycleUsed, awaiting.cycleNumber)} rest ${card.restCycles} active ${card.activeCycles} volume ${formatZar(card.volume)} machines ${machineCounts(card.machineHistory)}`
    })
    .join('\n')

  const machines = ledger.machines
    .map((machine) => {
      return `${machineLabel(machine.id)} ${lastUsedLabel(machine.lastCycleUsed, awaiting.cycleNumber)} rest ${machine.restCycles} volume ${formatZar(machine.volume)}`
    })
    .join('\n')

  const executed = (params.recentCycles || [])
    .filter((row) => row.status === 'completed')
    .slice(0, 5)
    .map((row) => {
      const when = row.completedAtMs ? formatSast(row.completedAtMs) : 'unknown time'
      return `C${row.cycleNumber} executed ${when} — ${formatAssignments(row.assignments)}`
    })

  const replies = (params.recentFeedback || []).slice(0, 5).map((row) => {
    const when = row.createdAtMs ? formatSast(row.createdAtMs) : 'unknown time'
    const summary = row.summary ? ` → ${row.summary}` : ''
    return `${when} [${row.status}] "${row.rawMessage}"${summary}`
  })

  const issued =
    awaiting.issuedAtMs != null
      ? ` since ${formatSast(awaiting.issuedAtMs)}`
      : ''
  const nextAction =
    awaiting.kind === 'replenish'
      ? 'Next action: Execute restock — swipe Moz cards on SA POS at COST. Repeat pairs burn throughput.'
      : `Next action: Execute the ZAR sale only after MZN has reflected, or Ask to revise it.`

  return [
    clock.promptLine,
    `Test progress: ${ledger.completedCycles} of ${ledger.cycleCount} cycles completed. Cycle ${awaiting.cycleNumber} is awaiting ${awaiting.kind === 'replenish' ? 'ZAR restock @ COST' : 'ZAR sale'}${issued}.`,
    `Capital: ${formatZar(ledger.availableCapital)} available. Buffer: ${formatZar(ledger.bufferUsed)} / ${formatZar(ledger.bufferAmount)}.`,
    nextAction,
    'Cards:',
    cards || '(none)',
    'Machines:',
    machines || '(none)',
    `Pairings (card-machine counts): ${pairingEntries.length ? pairingEntries.join(', ') : '(none)'}`,
    'Recent executed cycles:',
    executed.length ? executed.join('\n') : '(none yet)',
    'Recent admin replies:',
    replies.length ? replies.join('\n') : '(none)',
    'Active constraints:',
    active.length ? active.map((row) => constraintLine(row, params.nowMs)).join('\n') : '(none)',
  ].join('\n')
}

const CONFIG_ACTIONS = new Set(['restore_card', 'restore_machine', 'add_card', 'add_machine'])

export function attachResolvedExpiry(
  intents: RoutingIntent[],
  message: string,
  nowMs: number
): RoutingIntent[] {
  const resolved = resolveExpiryFromMessage(message, nowMs)
  if (!resolved) return intents
  return intents.map((intent) => {
    if (intent.expiresAt && intent.expiresAt > nowMs) return intent
    if (CONFIG_ACTIONS.has(intent.action)) return intent
    if (intent.scope === 'permanent' || intent.scope === 'until_cleared') return intent
    const labelled = formatSast(resolved)
    const summary =
      intent.summary && !/\buntil\b/i.test(intent.summary)
        ? `${intent.summary.replace(/\.$/, '')} until ${labelled}.`
        : intent.summary
    return {
      ...intent,
      scope: 'until_date',
      expiresAt: resolved,
      summary,
    }
  })
}

function mentionedCardId(message: string): number | null {
  return resolveNamedCardIds(message)[0] ?? null
}

export function answerMemoryQuestion(params: {
  message: string
  nowMs: number
  constraints: StoredConstraint[]
  recentFeedback?: RecentFeedbackBrief[]
  recentCycles?: RecentCycleBrief[]
  ledger: LedgerSnapshot
  awaiting: { cycleNumber: number }
}): string | null {
  const lower = params.message.trim().toLowerCase()
  if (!lower) return null
  const cardId = mentionedCardId(params.message)
  const feedback = (params.recentFeedback || []).find((row) => {
    const blob = `${row.rawMessage} ${row.summary || ''}`.toLowerCase()
    if (/\b(lost|exclud|unavailable|down)\b/.test(blob)) {
      if (cardId == null) return true
      return blob.includes(`card ${cardId}`)
    }
    return false
  })
  const excluded = params.constraints.filter(
    (row) =>
      row.status === 'active' &&
      (row.action === 'exclude_card' || row.action === 'rest_card') &&
      (cardId == null || row.resourceId === cardId)
  )

  if (/\b(remember|recall|lost|already|told you|was it)\b/.test(lower)) {
    const resourceId =
      cardId ||
      excluded[0]?.resourceId ||
      Number(feedback?.summary?.match(/card\s+(\d+)/i)?.[1] || feedback?.rawMessage.match(/card\s+(\d+)/i)?.[1] || 0)
    if (feedback?.createdAtMs && resourceId) {
      return `Yes. At ${formatSast(feedback.createdAtMs)} you took ${cardLabel(resourceId)} off Cycle ${params.awaiting.cycleNumber} because it was lost.`
    }
    if (excluded[0]) {
      const until =
        typeof excluded[0].expiresAt === 'number' ? ` until ${formatSast(excluded[0].expiresAt)}` : ''
      return `Yes. ${cardLabel(excluded[0].resourceId)} is off Cycle ${params.awaiting.cycleNumber}${until}.`
    }
  }

  if (cardId && /\b(last used|when|did we use)\b/.test(lower)) {
    const cycle = (params.recentCycles || []).find(
      (row) => row.status === 'completed' && row.assignments.some((assignment) => assignment.cardId === cardId)
    )
    if (cycle?.completedAtMs) {
      return `${cardLabel(cardId)} was last used on Cycle ${cycle.cycleNumber}, executed ${formatSast(cycle.completedAtMs)}.`
    }
    const card = params.ledger.cards.find((row) => row.id === cardId)
    if (card?.lastCycleUsed) {
      return `${cardLabel(cardId)} was last used on Cycle ${card.lastCycleUsed}.`
    }
    return `${cardLabel(cardId)} has not been used in this test yet.`
  }

  return null
}
