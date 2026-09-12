/**
 * Deterministic answers from executed desk transactions. No LLM facts.
 */

import { formatZar } from './conversionRouter'
import { cardShortName, machineShortName, resolveNamedCardIds, resolveNamedMachineIds } from './inventory'
import type { DeskTx } from './frictionHistory'
import { formatSast, sastParts, sastToUtcMs } from './routingTime'

export function executedDeskTxs(history: DeskTx[]): DeskTx[] {
  return history.filter((row) => row.status !== 'proposed')
}

function atMs(row: DeskTx): number {
  return row.executedAt || row.occurredAt
}

function pairLabel(row: DeskTx): string {
  return `${cardShortName(row.cardId)} → ${machineShortName(row.machineId)}`
}

function startOfSastDay(nowMs: number): number {
  const p = sastParts(nowMs)
  return sastToUtcMs(p.year, p.month, p.day)
}

function windowFrom(message: string, nowMs: number): { from: number; label: string } {
  const text = message.toLowerCase()
  if (/\b(today|tonight)\b/.test(text)) return { from: startOfSastDay(nowMs), label: 'today' }
  return { from: nowMs - 7 * 86_400_000, label: 'this week' }
}

function lastCluster(rows: DeskTx[]): DeskTx[] {
  if (!rows.length) return []
  const latest = Math.max(...rows.map(atMs))
  const atLatest = rows.filter((row) => atMs(row) === latest)
  const groupId = atLatest.find((row) => row.restockGroupId)?.restockGroupId
  if (groupId) {
    const grouped = rows.filter((row) => row.restockGroupId === groupId)
    if (grouped.length) return grouped.sort((a, b) => (a.assignmentIndex ?? 0) - (b.assignmentIndex ?? 0))
  }
  return atLatest.sort((a, b) => (a.assignmentIndex ?? 0) - (b.assignmentIndex ?? 0) || a.id.localeCompare(b.id))
}

function tiedOrderNote(cluster: DeskTx[]): string {
  if (cluster.length <= 1) return ''
  const times = new Set(cluster.map(atMs))
  if (times.size === 1) {
    return ' Individual swipe order is unknown — these were confirmed together, so they share the same execution timestamp.'
  }
  return ''
}

export function answerLedgerFactAsk(params: {
  message: string
  history: DeskTx[]
  nowMs: number
}): { title: string; body: string } {
  const rows = executedDeskTxs(params.history)
  const text = params.message.trim().toLowerCase()
  if (!rows.length) {
    return {
      title: 'No executed swipes on the ledger',
      body: 'The executed desk log is empty. Restock confirmations and imported statements appear here after they are written.',
    }
  }

  if (/\b(last|most recently)\b/.test(text) && /\b(merchant|pos|machine)\b/.test(text)) {
    const cluster = lastCluster(rows)
    const merchants = [...new Set(cluster.map((row) => machineShortName(row.machineId)))]
    if (merchants.length === 1) {
      return {
        title: 'Last merchant',
        body: `Last executed swipe on the ledger is ${pairLabel(cluster[0])} at ${formatSast(atMs(cluster[0]))}.`,
      }
    }
    return {
      title: 'Last restock merchants',
      body: `The most recent executed restock used ${cluster
        .map(pairLabel)
        .join(', ')} at ${formatSast(atMs(cluster[0]))}.${tiedOrderNote(cluster)}`,
    }
  }

  if (/\b(last|most recently)\b/.test(text) && /\bcard\b/.test(text)) {
    const cluster = lastCluster(rows)
    const cards = [...new Set(cluster.map((row) => cardShortName(row.cardId)))]
    if (cards.length === 1) {
      return {
        title: 'Last card',
        body: `Last executed swipe on the ledger is ${pairLabel(cluster[0])} at ${formatSast(atMs(cluster[0]))}.`,
      }
    }
    return {
      title: 'Last restock cards',
      body: `The most recent executed restock used ${cluster
        .map(pairLabel)
        .join(', ')} at ${formatSast(atMs(cluster[0]))}.${tiedOrderNote(cluster)}`,
    }
  }

  if (/\bwhen did we last (?:use|swipe)\b/.test(text) || /\blast (?:use|used|swiped?) on\b/.test(text)) {
    const machineId = resolveNamedMachineIds(params.message)[0]
    const cardId = resolveNamedCardIds(params.message)[0]
    const match = rows.filter((row) => {
      if (machineId && row.machineId !== machineId) return false
      if (cardId && row.cardId !== cardId) return false
      return Boolean(machineId || cardId)
    })
    if (!machineId && !cardId) {
      return {
        title: 'Name a card or POS',
        body: 'Say which card or POS to look up, for example “when did we last use Capitec?”',
      }
    }
    if (!match.length) {
      const name = machineId ? machineShortName(machineId) : cardShortName(cardId)
      return { title: `No ${name} swipe on the ledger`, body: `${name} has no executed swipe on the dated desk log.` }
    }
    const latest = Math.max(...match.map(atMs))
    const cluster = match.filter((row) => atMs(row) === latest)
    const name = machineId ? machineShortName(machineId) : cardShortName(cardId)
    const group = cluster[0].restockGroupId
      ? lastCluster(rows.filter((row) => row.restockGroupId === cluster[0].restockGroupId))
      : cluster
    const extra =
      group.length > 1 && new Set(group.map(atMs)).size === 1
        ? ` That swipe was part of a grouped restock (${group.map(pairLabel).join(', ')}). Individual swipe order is unknown.`
        : ''
    return {
      title: `Last ${name} swipe`,
      body: `Last ${name} swipe on the ledger is ${pairLabel(cluster[0])} at ${formatSast(latest)}.${extra}`,
    }
  }

  if (/\bwhich pos\b/.test(text) && /\bmost\b/.test(text)) {
    const { from, label } = windowFrom(params.message, params.nowMs)
    const windowRows = rows.filter((row) => atMs(row) >= from)
    if (!windowRows.length) {
      return { title: `No POS volume ${label}`, body: `No executed swipes are on the ledger ${label}.` }
    }
    const byPos = new Map<number, number>()
    for (const row of windowRows) {
      byPos.set(row.machineId, (byPos.get(row.machineId) || 0) + row.amountZar)
    }
    const ranked = [...byPos.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    const [machineId, volume] = ranked[0]
    const tied = ranked.filter((row) => row[1] === volume)
    if (tied.length > 1) {
      return {
        title: `POS volume ${label}`,
        body: `Tied ${label}: ${tied
          .map(([id, amount]) => `${machineShortName(id)} ${formatZar(amount)}`)
          .join(', ')}.`,
      }
    }
    return {
      title: `POS volume ${label}`,
      body: `${machineShortName(machineId)} has taken the most ${label}: ${formatZar(volume)}.`,
    }
  }

  if (/\bhow much\b/.test(text)) {
    const { from, label } = windowFrom(params.message, params.nowMs)
    const machineId = resolveNamedMachineIds(params.message)[0]
    const cardId = resolveNamedCardIds(params.message)[0]
    const match = rows.filter((row) => {
      if (atMs(row) < from) return false
      if (machineId && row.machineId !== machineId) return false
      if (cardId && row.cardId !== cardId) return false
      return Boolean(machineId || cardId)
    })
    if (!machineId && !cardId) {
      return {
        title: 'Name a card or POS',
        body: 'Say which card or POS to total, for example “how much has FNB Wolf taken today?”',
      }
    }
    const name = machineId ? machineShortName(machineId) : cardShortName(cardId)
    const total = match.reduce((sum, row) => sum + row.amountZar, 0)
    return {
      title: `${name} ${label}`,
      body: `${name} has taken ${formatZar(total)} ${label} on the executed desk log (${match.length} swipe${
        match.length === 1 ? '' : 's'
      }).`,
    }
  }

  if (/\bdid we use\b/.test(text)) {
    const { from, label } = windowFrom(params.message, params.nowMs)
    const machineId = resolveNamedMachineIds(params.message)[0]
    const cardId = resolveNamedCardIds(params.message)[0]
    if (!machineId && !cardId) {
      return { title: 'Name a card or POS', body: 'Say which card or POS, for example “did we use Ginav today?”' }
    }
    const match = rows.filter((row) => {
      if (atMs(row) < from) return false
      if (machineId && row.machineId !== machineId) return false
      if (cardId && row.cardId !== cardId) return false
      return true
    })
    const name = cardId ? cardShortName(cardId) : machineShortName(machineId)
    if (!match.length) {
      return { title: `${name} ${label}`, body: `No. ${name} has no executed swipe on the ledger ${label}.` }
    }
    return {
      title: `${name} ${label}`,
      body: `Yes. ${name} was used ${label}: ${match.map(pairLabel).join(', ')}.`,
    }
  }

  return {
    title: 'Ledger question',
    body: 'I can answer last card or POS, when a named pair was last used, totals today or this week, and whether a card or POS was used today. Ask one of those from the executed desk log.',
  }
}
