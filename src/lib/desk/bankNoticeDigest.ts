import type { ActivityItem } from '@/store/activity'
import { formatZarMoney } from '@/lib/desk/routingStepMessage'

export type BankDigestGroup = {
  id: string
  kind: 'bank_digest'
  dayKey: string
  count: number
  netZar: number
  items: ActivityItem[]
  createdAt: number
}

function dayKeyOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isOtherBankNotice(item: ActivityItem): boolean {
  return item.routingAction === 'bank_notice' && item.bankNoticeClass !== 'routing'
}

/**
 * Collapse non-routing bank notices into one digest line per calendar day
 * when there are 2+ noise events that day. Routing notices pass through.
 */
export function collapseOtherBankNotices(
  items: ActivityItem[]
): Array<ActivityItem | BankDigestGroup> {
  const ordered = [...items].sort((a, b) => b.createdAt - a.createdAt)
  const otherByDay = new Map<string, ActivityItem[]>()
  for (const item of ordered) {
    if (!isOtherBankNotice(item)) continue
    const key = dayKeyOf(item.createdAt)
    const bucket = otherByDay.get(key) || []
    bucket.push(item)
    otherByDay.set(key, bucket)
  }

  const multiDays = new Set<string>()
  const digests = new Map<string, BankDigestGroup>()
  Array.from(otherByDay.entries()).forEach(([dayKey, group]) => {
    if (group.length < 2) return
    multiDays.add(dayKey)
    const netZar = group.reduce((sum, row) => {
      const v = row.amount?.value || 0
      return sum + (row.amount?.sign === 'credit' ? v : -v)
    }, 0)
    digests.set(dayKey, {
      id: `bank-digest-${dayKey}`,
      kind: 'bank_digest',
      dayKey,
      count: group.length,
      netZar: Math.round(netZar * 100) / 100,
      items: group,
      createdAt: Math.max(...group.map((g) => g.createdAt)),
    })
  })

  const result: Array<ActivityItem | BankDigestGroup> = []
  const emittedDigest = new Set<string>()
  for (const item of ordered) {
    if (!isOtherBankNotice(item)) {
      result.push(item)
      continue
    }
    const key = dayKeyOf(item.createdAt)
    if (!multiDays.has(key)) {
      result.push(item)
      continue
    }
    if (emittedDigest.has(key)) continue
    emittedDigest.add(key)
    const digest = digests.get(key)
    if (digest) result.push(digest)
  }
  return result
}

export function formatBankDigestTitle(group: BankDigestGroup): string {
  const net =
    group.netZar === 0
      ? 'net R0.00'
      : `net ${group.netZar < 0 ? '−' : ''}${formatZarMoney(Math.abs(group.netZar))}`
  return `${group.count} other account movements · ${net}`
}
