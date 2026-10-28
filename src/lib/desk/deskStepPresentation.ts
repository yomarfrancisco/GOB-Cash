/**
 * Client-side Part 1 presentation helpers.
 * Rebuilds ledger rows / status chips when Firestore events only kept thin body copy.
 */
import type { ActivityItem } from '@/store/activity'
import { displayDeskTitle } from '@/lib/desk/deskCopy'
import { formatMznMoney, formatRate4, formatZarMoney } from '@/lib/desk/routingStepMessage'

export function deskStepNumber(item: ActivityItem): number | null {
  if (typeof item.deskStep === 'number' && item.deskStep >= 1 && item.deskStep <= 6) {
    return item.deskStep
  }
  const title = displayDeskTitle(item.title) || item.title || ''
  const m = title.match(/^Step\s*(\d)\b/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 6 ? n : null
}

export function isDeskStepItem(item: ActivityItem): boolean {
  if (deskStepNumber(item) != null) return true
  return (
    item.routingAction === 'step' ||
    item.routingAction === 'deploy' ||
    item.routingAction === 'replenish'
  )
}

export function inferredDeskStatusChip(item: ActivityItem): string | null {
  if (item.deskStatusChip) return item.deskStatusChip
  const step = deskStepNumber(item)
  const status = String(item.status || '')
  if (status === 'completed' || status === 'recorded') {
    if (step === 5 || item.routingAction === 'replenish') return 'Swiped'
    if (step === 4 || item.routingAction === 'deploy') return 'Executed'
    if (step === 3) return 'Covered'
    if (step === 6) return 'Settled'
    return 'Done'
  }
  if (item.awaitingConfirm) {
    if (step === 3) return 'Waiting'
    if (step === 4 || item.routingAction === 'deploy') return 'Send'
    if (step === 5 || item.routingAction === 'replenish') return 'Restock'
    return 'Open'
  }
  return null
}

export function ledgerRowsFromOrderLedger(
  item: ActivityItem
): NonNullable<ActivityItem['deskLedgerRows']> | null {
  if (item.deskLedgerRows?.length) return item.deskLedgerRows
  const ledger = item.orderLedger
  if (!ledger || !(ledger.zar > 0)) return null
  const step = deskStepNumber(item)
  if (step === 3) {
    return [
      { label: 'Cover needed', value: formatMznMoney(ledger.mznAtSell), valueStrong: true },
      { label: 'For', value: formatZarMoney(ledger.zar) },
      { label: 'Sell rate', value: `${formatRate4(ledger.sellRate)} MZN/ZAR` },
    ]
  }
  if (step === 4 || item.routingAction === 'deploy') {
    return [
      { label: 'Sold', value: formatZarMoney(ledger.zar), valueStrong: true },
      { label: 'Received', value: formatMznMoney(ledger.mznAtSell) },
      { label: 'Sell rate', value: `${formatRate4(ledger.sellRate)} MZN/ZAR` },
      { label: 'Cost rate', value: `${formatRate4(ledger.costRate)} MZN/ZAR` },
      {
        label: 'Spread',
        value: `${formatMznMoney(ledger.spreadMzn)} gross`,
        valueStrong: true,
        secondLine: `${formatRate4(ledger.spreadPerZar ?? ledger.sellRate - ledger.costRate)} MZN/ZAR`,
      },
      {
        label: 'Window left',
        value: formatZarMoney(ledger.windowLeftZar),
        secondLine: `of ${formatZarMoney(ledger.windowZar)}`,
      },
    ]
  }
  if (step === 5 || item.routingAction === 'replenish') {
    return [
      { label: 'Swiped', value: formatZarMoney(ledger.zar), valueStrong: true },
      {
        label: 'MZN out',
        value: formatMznMoney(ledger.mznAtCost),
        secondLine: `at cost ${formatRate4(ledger.costRate)} MZN/ZAR`,
      },
    ]
  }
  return null
}

/** Prefer Part 1 desk sentence; fall back to body when sentence was never stamped. */
export function deskDisplaySentence(item: ActivityItem): string {
  const sentence = (item.deskSentence || item.routingStepMessage?.summary || '').trim()
  if (sentence) return sentence
  return (item.body || '').trim()
}
