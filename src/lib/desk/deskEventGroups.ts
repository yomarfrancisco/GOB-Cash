/**
 * Client-side same-day desk event grouping.
 * Group key: (source, eventKind, arrival calendar day). Position = latest arrival.
 */
import type { ActivityItem } from '@/store/activity'
import { BANK_TILES } from '@/lib/activity/bankTiles'
import { displayDeskTitle } from '@/lib/desk/deskCopy'
import { formatMznMoney, formatZarMoney } from '@/lib/desk/routingStepMessage'
import { sastParts } from '@/lib/routing/routingTime'

export type DeskGroupKind =
  | 'zar_booked'
  | 'zar_cleared'
  | 'swipe_approved'
  | 'other_movements'
  | 'swipe_matched'

export type DeskGroupRow = {
  id: string
  atMs: number
  timeLabel: string
  counterparty: string
  meta: string
  amountZar: number
  amountMzn?: number
  lateChip?: string
  detailLines?: string[]
}

export type DeskEventGroup = {
  kind: DeskGroupKind
  source: string
  dayKey: string
  title: string
  speaker: string
  avatarSrc: string
  avatarKind: 'bank' | 'wallet' | 'digest'
  statusChip?: string
  createdAt: number
  rows: DeskGroupRow[]
  totalZar: number
  totalMzn?: number
  collapsedByDefault?: boolean
  memberIds: string[]
}

const OUR_MERCHANT_RE = /\b(BRICS(?:\s+AI)?|IMANI|ECONOMETRICA|LEMON|WOLF)\b/i
const OTHER_COUNTERPARTY_RE =
  /\b(Smartapp|Vercel|Woolworths|Real\s+Time\s+Cl|Takealot|Spotify|Apple|Google|Uber)\b/i

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function deskPairSwipesEnabled(): boolean {
  if (typeof process !== 'undefined') {
    if (process.env.NEXT_PUBLIC_DESK_PAIR_SWIPES === '0') return false
    if (process.env.NEXT_PUBLIC_DESK_PAIR_SWIPES === '1') return true
  }
  return process.env.NODE_ENV !== 'production'
}

export function stripDeskProvenance(body: string | undefined | null): string {
  if (!body) return ''
  return body
    .replace(/\s*This arrived directly from [^.]+?\.\s*/gi, ' ')
    .replace(/\s*This copy was forwarded from Gmail[^.]*\.\s*/gi, ' ')
    .replace(/\bMt\/R\b/gi, 'MZN/ZAR')
    .replace(/\bSAST\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function calendarDayKey(ms: number): string {
  const p = sastParts(ms)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function hhmm(ms: number): string {
  const p = sastParts(ms)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

function dayMonthLabel(ms: number): string {
  const p = sastParts(ms)
  return `${p.day} ${MONTHS_SHORT[p.month - 1]}`
}

function parseZarFromText(text: string): number | null {
  const m =
    text.match(/R\s*([\d\s]+[.,]\d{2})/i) ||
    text.match(/R\s*([\d\s]+)/i)
  if (!m) return null
  const raw = m[1].replace(/\s/g, '')
  const normalized = /,\d{2}$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseMznFromText(text: string): number | null {
  const m = text.match(/([\d\s]+[.,]\d{2})\s*MZN/i) || text.match(/≈\s*([\d\s]+[.,]\d{2})/)
  if (!m) return null
  const raw = m[1].replace(/\s/g, '')
  const normalized = /,\d{2}$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseRateFromText(text: string): number | null {
  const m = text.match(/@\s*([\d.]+)/) || text.match(/SELL\s+([\d.]+)/i) || text.match(/([\d.]+)\s*\(sell\)/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Parse transaction clock from notice bodies (26-10-2026 19:55:01, 26Oct 10:52, etc.). */
export function parseTxTimeMs(body: string, fallbackMs: number): number {
  const cleaned = stripDeskProvenance(body)
  const isoish = cleaned.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (isoish) {
    const day = Number(isoish[1])
    const month = Number(isoish[2])
    const year = Number(isoish[3])
    const hour = Number(isoish[4])
    const minute = Number(isoish[5])
    const second = Number(isoish[6] || 0)
    return Date.UTC(year, month - 1, day, hour - 2, minute, second)
  }
  const slash = cleaned.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    const year = Number(slash[3])
    const hour = Number(slash[4])
    const minute = Number(slash[5])
    const second = Number(slash[6] || 0)
    return Date.UTC(year, month - 1, day, hour - 2, minute, second)
  }
  const mon = cleaned.match(/(\d{1,2})([A-Za-z]{3})\s+(\d{1,2}):(\d{2})/)
  if (mon) {
    const day = Number(mon[1])
    const mi = MONTHS_SHORT.findIndex((x) => x.toLowerCase() === mon[2].toLowerCase())
    const hour = Number(mon[3])
    const minute = Number(mon[4])
    if (mi >= 0) {
      const year = sastParts(fallbackMs).year
      return Date.UTC(year, mi, day, hour - 2, minute, 0)
    }
  }
  return fallbackMs
}

function maskCard(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 4) return null
  return `··${digits.slice(-4)}`
}

function parseCardLast4(text: string): string | null {
  const m =
    text.match(/card\s*[·.•*]{0,4}\s*(\d{4})/i) ||
    text.match(/on\s+\*{0,4}(\d{4})/i) ||
    text.match(/ending\s+(\d{4})/i)
  return maskCard(m?.[1])
}

function parseAuthRrn(text: string): string[] {
  const lines: string[] = []
  const auth = text.match(/auth\s+(\w+)/i)
  if (auth) lines.push(`Auth ${auth[1]}`)
  const rrn = text.match(/RRN\s+(\S+)/i)
  if (rrn) lines.push(`RRN ${rrn[1]}`)
  const tx = text.match(/Transaction\s+(\d+)/i)
  if (tx) lines.push(`Transaction ${tx[1]}`)
  return lines
}

function parseMerchant(text: string, title: string): string {
  const at = text.match(/\bat\s+([A-Za-z0-9 .&'*()-]{2,40}?)(?:\s+on\s+card|\s*,|\s*\.|$)/i)
  if (at) return at[1].replace(/\s+/g, ' ').trim()
  const from = text.match(/\bfrom\s+([A-Za-z0-9 .&'-]{2,40}?)(?:\s*\.|$)/i)
  if (from) return from[1].trim()
  if (/Moza/i.test(title)) return 'Moza VISA'
  if (/approved/i.test(title)) return 'Swipe'
  if (/paid in/i.test(title)) return 'Paid in'
  if (/reserved/i.test(title)) return 'Reserved'
  return 'Movement'
}

type Classified = {
  kind: DeskGroupKind
  source: string
  dayKey: string
}

function isNeverGrouped(item: ActivityItem): boolean {
  const title = displayDeskTitle(item.title) || item.title || ''
  if (item.thinking) return true
  if (item.routingStepMessage || item.deskLedgerRows || item.deskSentence) {
    if (/^Step\s*\d/i.test(title)) return true
  }
  if (/^Step\s*\d/i.test(title)) return true
  if (/^Ask\b/i.test(title)) return true
  if (/^Window\b/i.test(title)) return true
  if (/^Friction\b/i.test(title)) return true
  if (/^EFT\b/i.test(title)) return true
  if (item.routingAction === 'proposal' || item.routingAction === 'advice') {
    if (!/^Bank\b/i.test(title)) return true
  }
  if (item.routingAction === 'deploy' || item.routingAction === 'replenish') return true
  if (item.routingAction === 'step' || item.routingAction === 'swipe_notice') return true
  if (typeof item.deskStep === 'number' && item.deskStep >= 1 && item.deskStep <= 6) return true
  return false
}

export function classifyDeskEvent(item: ActivityItem): Classified | null {
  if (isNeverGrouped(item)) return null
  const title = displayDeskTitle(item.title) || item.title || ''
  const body = item.body || ''
  const dayKey = calendarDayKey(item.createdAt)

  if (
    item.kind === 'EN_ROUTE_BOOKED' ||
    /^ZAR\s+(booked|en route)\b/i.test(title)
  ) {
    if (item.kind === 'EN_ROUTE_CLEARED' || /cleared/i.test(title)) {
      return { kind: 'zar_cleared', source: 'wallet', dayKey }
    }
    return { kind: 'zar_booked', source: 'wallet', dayKey }
  }
  if (item.kind === 'EN_ROUTE_CLEARED' || /^ZAR\s+cleared\b/i.test(title)) {
    return { kind: 'zar_cleared', source: 'wallet', dayKey }
  }

  if (/^Bank\s*[·.•]\s*Moza\b/i.test(title) && /VISA|purchase/i.test(title + body)) {
    return { kind: 'swipe_approved', source: 'Moza', dayKey }
  }

  if (/^Bank\s*[·.•]\s*FNB\b/i.test(title) && /approved/i.test(title)) {
    const merchant = parseMerchant(body, title)
    if (OTHER_COUNTERPARTY_RE.test(body) && !OUR_MERCHANT_RE.test(merchant)) {
      return { kind: 'other_movements', source: 'FNB', dayKey }
    }
    return { kind: 'swipe_approved', source: 'FNB', dayKey }
  }
  if (/^Bank\s*[·.•]\s*Capitec\b/i.test(title) && /approved/i.test(title)) {
    return { kind: 'swipe_approved', source: 'Capitec', dayKey }
  }

  if (
    /^Bank\s*[·.•]\s*FNB\b/i.test(title) &&
    (/POS paid in/i.test(title) || /reserved/i.test(title))
  ) {
    if (OUR_MERCHANT_RE.test(body) && /reserved/i.test(title)) {
      return { kind: 'swipe_approved', source: 'FNB', dayKey }
    }
    return { kind: 'other_movements', source: 'FNB', dayKey }
  }

  return null
}

function buildRow(item: ActivityItem, kind: DeskGroupKind): DeskGroupRow {
  const title = displayDeskTitle(item.title) || item.title || ''
  const body = stripDeskProvenance(item.body)
  const txMs = parseTxTimeMs(body, item.createdAt)
  const amountZar =
    typeof item.amount?.value === 'number'
      ? item.amount.sign === 'credit'
        ? Math.abs(item.amount.value)
        : -Math.abs(item.amount.value)
      : parseZarFromText(body) ?? 0
  const signedZar =
    kind === 'other_movements'
      ? /reserved|debit/i.test(title + body) && !/paid in|credited|approved/i.test(title)
        ? -Math.abs(amountZar)
        : /paid in|credited|approved/i.test(title)
          ? Math.abs(amountZar)
          : item.amount?.sign === 'debit'
            ? -Math.abs(amountZar)
            : Math.abs(amountZar)
      : Math.abs(amountZar)

  const amountMzn =
    typeof item.pairedAmountValue === 'number' && item.pairedAmountValue > 0
      ? item.pairedAmountValue
      : parseMznFromText(body) ?? undefined
  const rate = parseRateFromText(body)
  const card = parseCardLast4(body)
  const merchant = parseMerchant(body, title)
  const arrivalDiff = item.createdAt - txMs
  const late =
    Math.abs(arrivalDiff) > 2 * 60 * 60 * 1000 &&
    calendarDayKey(txMs) !== calendarDayKey(item.createdAt)
  const received =
    arrivalDiff > 2 * 60 * 60 * 1000
      ? `received ${hhmm(item.createdAt)}`
      : null

  let meta = ''
  let counterparty = merchant
  if (kind === 'zar_booked' || kind === 'zar_cleared') {
    counterparty =
      amountMzn != null && rate != null
        ? `≈ ${formatMznMoney(amountMzn).replace(/ MZN$/, '')} MZN @ ${rate.toFixed(4)} sell`
        : amountMzn != null
          ? formatMznMoney(amountMzn)
          : 'Booked at sell'
    meta =
      kind === 'zar_cleared'
        ? `booked ${dayMonthLabel(txMs)} ${hhmm(txMs)}`
        : `clears ~09:00 next window`
  } else if (kind === 'other_movements') {
    counterparty = merchant
    const verb = /reserved/i.test(title) ? 'reserved' : /paid in|credited/i.test(title) ? 'paid in' : 'movement'
    meta = `${verb}${card ? ` · acct ${card}` : ''}`
  } else {
    const bits = [card ? `card ${card}` : null, received].filter(Boolean)
    meta = bits.join(' · ')
    if (amountMzn != null && rate != null) {
      meta = [meta, `${formatMznMoney(amountMzn)} @ ${rate.toFixed(4)}`].filter(Boolean).join(' · ')
    }
  }

  return {
    id: item.id,
    atMs: txMs,
    timeLabel: hhmm(txMs),
    counterparty,
    meta,
    amountZar: signedZar,
    amountMzn: amountMzn && amountMzn > 0 ? amountMzn : undefined,
    lateChip: late ? `Late · ${dayMonthLabel(txMs)}` : undefined,
    detailLines: parseAuthRrn(body),
  }
}

function groupTitle(kind: DeskGroupKind, count: number): string {
  if (kind === 'zar_booked') return 'ZAR booked'
  if (kind === 'zar_cleared') return 'ZAR cleared'
  if (kind === 'swipe_matched') return 'Swipe matched'
  if (kind === 'other_movements') return 'Other movements'
  return count === 1 ? 'Card swipe approved' : 'Card swipes approved'
}

function groupSpeaker(source: string, kind: DeskGroupKind): string {
  if (kind === 'zar_booked' || kind === 'zar_cleared') return 'Wallet · Moz card'
  if (kind === 'swipe_matched') return 'Moza · Capitec'
  if (kind === 'other_movements') return `${source} · acct ··0649`
  return source
}

function groupAvatar(source: string, kind: DeskGroupKind): { src: string; avatarKind: DeskEventGroup['avatarKind'] } {
  if (kind === 'zar_booked' || kind === 'zar_cleared') {
    return { src: '/assets/ZAR_square.jpg', avatarKind: 'wallet' }
  }
  if (kind === 'swipe_matched' || source === 'Moza') {
    return { src: BANK_TILES.Moza, avatarKind: 'bank' }
  }
  if (source === 'Capitec') return { src: BANK_TILES.Capitec, avatarKind: 'bank' }
  if (kind === 'other_movements') return { src: BANK_TILES.FNB, avatarKind: 'digest' }
  return { src: BANK_TILES.FNB, avatarKind: 'bank' }
}

function statusChipFor(kind: DeskGroupKind, rows: DeskGroupRow[]): string | undefined {
  if (kind === 'zar_booked') return 'Clears ~09:00 next'
  if (kind === 'zar_cleared') return `${rows.length} cleared`
  if (kind === 'swipe_matched') return 'Both sides'
  return undefined
}

function toGroupItem(group: DeskEventGroup): ActivityItem {
  const totalLabel =
    group.kind === 'other_movements'
      ? `net ${group.totalZar >= 0 ? '+' : '−'}${formatZarMoney(Math.abs(group.totalZar)).replace(/^R/, 'R')}`
      : formatZarMoney(Math.abs(group.totalZar))
  return {
    id: `desk-group-${group.kind}-${group.source}-${group.dayKey}`,
    kind: 'DESK_EVENT_GROUP',
    actor: {
      type: 'ai',
      name: group.speaker,
      avatarUrl: group.avatarSrc,
    },
    title: group.title,
    body: `${group.rows.length} items · ${totalLabel}`,
    createdAt: group.createdAt,
    deskStatusChip: group.statusChip,
    amount: {
      currency: 'ZAR',
      value: Math.abs(group.totalZar),
      sign: group.totalZar < 0 ? 'debit' : 'credit',
    },
    deskEventGroup: group,
  }
}

type PairCandidate = {
  item: ActivityItem
  zar: number
  txMs: number
  merchant: string
  side: 'moza' | 'sa'
}

function tryPairSwipes(items: ActivityItem[]): {
  groups: DeskEventGroup[]
  used: Set<string>
} {
  const used = new Set<string>()
  const groups: DeskEventGroup[] = []
  if (!deskPairSwipesEnabled()) return { groups, used }

  const candidates: PairCandidate[] = []
  for (const item of items) {
    const title = displayDeskTitle(item.title) || item.title || ''
    const body = item.body || ''
    const zar = Math.abs(parseZarFromText(body) ?? item.amount?.value ?? 0)
    if (!(zar > 0)) continue
    const txMs = parseTxTimeMs(body, item.createdAt)
    if (/^Bank\s*[·.•]\s*Moza\b/i.test(title) && /purchase|VISA/i.test(title + body)) {
      candidates.push({ item, zar, txMs, merchant: parseMerchant(body, title), side: 'moza' })
    } else if (
      (/^Bank\s*[·.•]\s*(FNB|Capitec)\b/i.test(title) && /approved/i.test(title)) ||
      false
    ) {
      const merchant = parseMerchant(body, title)
      if (OUR_MERCHANT_RE.test(merchant) || OUR_MERCHANT_RE.test(body)) {
        candidates.push({ item, zar, txMs, merchant, side: 'sa' })
      }
    }
  }

  const moza = candidates.filter((c) => c.side === 'moza')
  const sa = candidates.filter((c) => c.side === 'sa')
  for (const m of moza) {
    if (used.has(m.item.id)) continue
    const match = sa.find(
      (s) =>
        !used.has(s.item.id) &&
        Math.abs(s.zar - m.zar) < 0.02 &&
        Math.abs(s.txMs - m.txMs) <= 60_000
    )
    if (!match) continue
    used.add(m.item.id)
    used.add(match.item.id)
    const body = stripDeskProvenance(m.item.body)
    const amountMzn = parseMznFromText(body) ?? undefined
    const rate = parseRateFromText(body) ?? undefined
    const card = parseCardLast4(body)
    const row: DeskGroupRow = {
      id: m.item.id,
      atMs: m.txMs,
      timeLabel: hhmm(m.txMs),
      counterparty: `${match.merchant} (${/Capitec/i.test(match.item.title || '') ? 'Capitec' : 'FNB'})`,
      meta: [
        card ? `Moza ${card}` : 'Moza',
        amountMzn != null && rate != null ? `${formatMznMoney(amountMzn)} @ ${rate.toFixed(4)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      amountZar: Math.abs(m.zar),
      amountMzn,
      detailLines: [
        `Moza purchase ${hhmm(m.txMs)}${card ? ` · card ${card}` : ''}`,
        ...parseAuthRrn(match.item.body || ''),
        `SA approved ${hhmm(match.txMs)}`,
      ],
    }
    const createdAt = Math.max(m.item.createdAt, match.item.createdAt)
    groups.push({
      kind: 'swipe_matched',
      source: 'Moza',
      dayKey: calendarDayKey(createdAt),
      title: 'Swipe matched',
      speaker: 'Moza · Capitec',
      avatarSrc: BANK_TILES.Moza,
      avatarKind: 'bank',
      statusChip: 'Both sides',
      createdAt,
      rows: [row],
      totalZar: Math.abs(m.zar),
      totalMzn: amountMzn,
      memberIds: [m.item.id, match.item.id],
    })
  }
  return { groups, used }
}

/** Collapse groupable events; pass-through everything else in chronological merge order. */
export function groupDeskEvents(items: ActivityItem[]): ActivityItem[] {
  const { groups: matched, used: pairedIds } = tryPairSwipes(items)
  const buckets = new Map<string, { classified: Classified; members: ActivityItem[] }>()

  for (const item of items) {
    if (pairedIds.has(item.id)) continue
    const classified = classifyDeskEvent(item)
    if (!classified) continue
    const key = `${classified.source}|${classified.kind}|${classified.dayKey}`
    const bucket = buckets.get(key)
    if (bucket) bucket.members.push(item)
    else buckets.set(key, { classified, members: [item] })
  }

  const builtGroups: DeskEventGroup[] = [...matched]
  const groupedIds = new Set<string>(pairedIds)

  for (const bucket of Array.from(buckets.values())) {
    const { classified, members } = bucket
    if (!members.length) continue
    members.sort((a: ActivityItem, b: ActivityItem) => a.createdAt - b.createdAt)
    const rows = members
      .map((m: ActivityItem) => buildRow(m, classified.kind))
      .sort((a: DeskGroupRow, b: DeskGroupRow) => a.atMs - b.atMs)
    const createdAt = Math.max(...members.map((m: ActivityItem) => m.createdAt))
    const totalZar = rows.reduce((s: number, r: DeskGroupRow) => s + r.amountZar, 0)
    const totalMzn = rows.some((r: DeskGroupRow) => r.amountMzn != null)
      ? rows.reduce((s: number, r: DeskGroupRow) => s + (r.amountMzn || 0), 0)
      : undefined
    const avatar = groupAvatar(classified.source, classified.kind)
    builtGroups.push({
      kind: classified.kind,
      source: classified.source,
      dayKey: classified.dayKey,
      title: groupTitle(classified.kind, rows.length),
      speaker: groupSpeaker(classified.source, classified.kind),
      avatarSrc: avatar.src,
      avatarKind: avatar.avatarKind,
      statusChip: statusChipFor(classified.kind, rows),
      createdAt,
      rows,
      totalZar,
      totalMzn,
      collapsedByDefault: classified.kind === 'other_movements',
      memberIds: members.map((m: ActivityItem) => m.id),
    })
    for (const m of members) groupedIds.add(m.id)
  }

  const out: ActivityItem[] = []
  for (const item of items) {
    if (groupedIds.has(item.id)) continue
    out.push(item)
  }
  for (const g of builtGroups) {
    out.push(toGroupItem(g))
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

export function formatGroupAmount(zar: number, kind: DeskGroupKind): string {
  if (kind === 'other_movements') {
    const sign = zar >= 0 ? '+' : '−'
    return `${sign}${formatZarMoney(Math.abs(zar))}`
  }
  return formatZarMoney(Math.abs(zar))
}
