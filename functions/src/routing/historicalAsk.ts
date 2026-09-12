/**
 * Explain a past pair from stored records. Never re-runs the planner.
 */

import { formatZar } from './conversionRouter'
import type { DeskTx } from './frictionHistory'
import type { RecentCycleBrief } from './interpretContext'
import { cardShortName, machineShortName, resolveNamedCardIds, resolveNamedMachineIds } from './inventory'
import { formatSast } from './routingTime'

export type RecentRestockBrief = {
  cycleNumber: number
  confirmedAtMs: number
  assignments: Array<{ cardId: number; machineId: number; amount: number; posReason?: string }>
}

function atMs(row: DeskTx): number {
  return row.executedAt || row.occurredAt
}

export function answerHistoricalExplanation(params: {
  message: string
  history: DeskTx[]
  recentRestocks?: RecentRestockBrief[]
  recentCycles?: RecentCycleBrief[]
}): { title: string; body: string } {
  const cardId = resolveNamedCardIds(params.message)[0]
  const machineId = resolveNamedMachineIds(params.message)[0]
  const executed = params.history.filter((row) => row.status !== 'proposed')
  const matchTx = executed
    .filter((row) => {
      if (cardId && row.cardId !== cardId) return false
      if (machineId && row.machineId !== machineId) return false
      return Boolean(cardId || machineId)
    })
    .sort((a, b) => atMs(b) - atMs(a))

  const lastTx = matchTx[0]
  const restock =
    lastTx &&
    (params.recentRestocks || []).find(
      (row) =>
        (lastTx.cycleNumber && row.cycleNumber === lastTx.cycleNumber) ||
        row.assignments.some(
          (item) => item.cardId === lastTx.cardId && item.machineId === lastTx.machineId
        )
    )
  const storedReason =
    lastTx?.posReason ||
    restock?.assignments.find(
      (item) =>
        (!cardId || item.cardId === cardId) && (!machineId || item.machineId === machineId)
    )?.posReason ||
    (params.recentCycles || [])
      .flatMap((row) => row.assignments.map((item) => ({ ...item, cycleNumber: row.cycleNumber })))
      .reverse()
      .find(
        (item) =>
          (!cardId || item.cardId === cardId) &&
          (!machineId || item.machineId === machineId) &&
          item.posReason
      )?.posReason

  if (!cardId && !machineId) {
    return {
      title: 'Name the past pair',
      body: 'Say which card and POS you mean, for example “Why did we choose FNB IMANI for Ginav last time?”',
    }
  }

  if (!lastTx && !storedReason) {
    const who = [cardId ? cardShortName(cardId) : '', machineId ? machineShortName(machineId) : '']
      .filter(Boolean)
      .join(' on ')
    return {
      title: 'No stored pair',
      body: `There is no executed ${who} swipe on the desk ledger, and no stored restock reason for that pair. I will not re-plan a current route to guess.`,
    }
  }

  const pair = `${cardShortName(lastTx?.cardId || cardId || 0)} → ${machineShortName(
    lastTx?.machineId || machineId || 0
  )}`
  const when = lastTx ? formatSast(atMs(lastTx)) : restock ? formatSast(restock.confirmedAtMs) : 'an earlier restock'
  const amount = lastTx ? formatZar(lastTx.amountZar) : ''
  const group =
    lastTx?.restockGroupId && matchTx.filter((row) => row.restockGroupId === lastTx.restockGroupId).length > 1
      ? ' That swipe was part of a grouped restock; individual swipe order was not recorded.'
      : ''
  if (!storedReason) {
    return {
      title: `Last ${pair}`,
      body: `Last time this pair was used was ${when}${amount ? ` for ${amount}` : ''}. The planner reason for that decision was not stored on the ledger, so I will not re-run today’s planner to invent one.${group}`,
    }
  }
  return {
    title: `Why ${pair} last time`,
    body: `Last time: ${pair}${amount ? ` for ${amount}` : ''} at ${when}. Stored reason: ${storedReason}${group}`,
  }
}
