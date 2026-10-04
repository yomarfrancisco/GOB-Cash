import type { ActivityItem } from '@/store/activity'
import type { ConversionRoutingSummary } from '@/lib/transactions/clientFunctions'

export type DeskTone = 'default' | 'success' | 'held' | 'next'

export type DeskRichPart = {
  text: string
  bold?: boolean
  tone?: DeskTone
  href?: string
}

export type DeskFeedLine = {
  id: string
  atMs: number
  timeLabel: string
  source: string
  parts: DeskRichPart[]
  kind: 'replay' | 'live' | 'exception'
  exceptionTitle?: string
  exceptionFollowUp?: string
}

export type DeskTicketRow = {
  id: string
  timeLabel: string
  cardName: string
  merchantName: string
  amountLabel: string
  status: 'pending' | 'settled' | 'held' | 'next'
}

export type DeskStatusBadge = {
  label: string
  tone: 'ok' | 'held' | 'muted'
}

export type FxDeskView = {
  dayLabel: string
  badge: DeskStatusBadge
  windowPctLabel: string
  greeting: string
  replayLines: DeskFeedLine[]
  liveLines: DeskFeedLine[]
  stillIntro: string | null
  tickets: DeskTicketRow[]
  stillTotalLabel: string | null
  testRunId?: string
  cycleNumber?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function formatZar(value: number): string {
  return `R${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatClock(ms: number): string {
  const d = new Date(ms)
  // Prefer SAST-looking local clock for the desk (app users are ZA).
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function firstName(fullName?: string | null): string {
  const clean = (fullName || '').trim()
  if (!clean) return 'there'
  return clean.split(/\s+/)[0] || 'there'
}

function greetingForNow(name: string): string {
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${hello}, ${name}. Here's the last 24 hours.`
}

function inferSource(item: ActivityItem): string {
  const blob = `${item.title || ''} ${item.body || ''}`.toLowerCase()
  if (item.routingAction === 'invoice' || item.invoicePackId || item.hasDownloadButton) return 'Invoicing'
  if (blob.includes('mzn') && (blob.includes('wallet') || blob.includes('cover') || blob.includes('fund'))) {
    return 'MZN wallet'
  }
  if (blob.includes('settlement') || blob.includes('settled') || blob.includes('restock') || blob.includes('recycle')) {
    if (blob.includes('capitec') && blob.includes('fnb')) return 'FNB & Capitec settlement'
    if (blob.includes('capitec')) return 'Capitec settlement'
    if (blob.includes('fnb')) return 'FNB settlement'
    return 'Bank settlement'
  }
  if (blob.includes('sold') || blob.includes('send') || blob.includes('payment notification')) {
    return 'Payment notification'
  }
  if (item.routingAction === 'replenish') return 'Restock plan'
  if (item.routingAction === 'deploy' || item.routingAction === 'step') return 'Desk schedule'
  if (item.routingAction === 'advice') return 'Desk note'
  return 'Desk'
}

function isException(item: ActivityItem): boolean {
  const blob = `${item.title || ''} ${item.body || ''}`.toLowerCase()
  return (
    blob.includes('pending') ||
    blob.includes('on hold') ||
    blob.includes('held') ||
    blob.includes('declined') ||
    item.status === 'blocked'
  )
}

function stripStepPrefix(title: string): string {
  return title.replace(/^Step\s+\d+\s*[·.•-]\s*/i, '').trim()
}

function toParts(text: string): DeskRichPart[] {
  // Bold currency / MZN figures and key status words.
  const re =
    /(R[\d][\d\s,.]*|[\d][\d\s,.]*\s*MZN(?:\s+gross)?|\bpending\b|\bsettled\b|\bheld\b|\bOn track\b)/gi
  const parts: DeskRichPart[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    const token = match[0]
    const lower = token.toLowerCase()
    let tone: DeskTone = 'default'
    if (lower.includes('gross') || lower === 'settled' || lower === 'on track') tone = 'success'
    if (lower === 'pending' || lower === 'held') tone = 'held'
    parts.push({ text: token, bold: true, tone })
    last = match.index + token.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}

function firstPersonBody(item: ActivityItem): string {
  const raw = (item.body || item.title || '').trim()
  if (!raw) return stripStepPrefix(item.title || 'Update on the desk.')
  // Collapse multi-line swipe lists into a short desk sentence when possible.
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const swipeLines = lines.filter((line) => /^-?\s*\d{2}h\d{2}:?\s*Swipe\s+/i.test(line) || /^-?\s*Swipe\s+/i.test(line))
  if (swipeLines.length >= 2) {
    const total = lines.find((line) => /^Total\s+R/i.test(line))
    const lead = lines.find((line) => /swipe .+ back into the sa float/i.test(line) || /restock/i.test(line))
    if (lead && total) return `${lead.replace(/\.$/, '')}: ${total.replace(/^Total\s+/i, '')}.`
    if (lead) return lead
  }
  // Prefer the first two sentences for long step cards.
  const prose = lines.filter((line) => !/^-/.test(line) && !/^Status:/i.test(line) && !/^Next:/i.test(line))
  const joined = (prose.length ? prose : lines).join(' ')
  return joined.replace(/\s+/g, ' ').trim()
}

function parseTicketsFromBody(body: string, prefix: string): DeskTicketRow[] {
  const rows: DeskTicketRow[] = []
  const lines = body.split('\n')
  let index = 0
  for (const raw of lines) {
    const line = raw.trim()
    const match = line.match(
      /^-\s*(?:(\d{2}h\d{2}):\s*)?Swipe\s+([^(]+)\s*\([^)]+\)\s+on\s+(.+)\s+for\s+(R[\d][\d\s,.]*)$/i
    )
    if (!match) continue
    const timeRaw = match[1] || ''
    const timeLabel = timeRaw ? timeRaw.replace('h', ':') : '—'
    const cardName = match[2].trim()
    const merchantName = match[3].trim()
    const amountLabel = match[4].replace(/\s/g, ' ').trim()
    rows.push({
      id: `${prefix}-${index++}`,
      timeLabel,
      cardName,
      merchantName,
      amountLabel,
      status: 'pending',
    })
  }
  return rows
}

function markNextTicket(tickets: DeskTicketRow[]): DeskTicketRow[] {
  const nextIndex = tickets.findIndex((row) => row.status === 'pending')
  if (nextIndex < 0) return tickets
  return tickets.map((row, i) => (i === nextIndex ? { ...row, status: 'next' } : row))
}

export function buildFxDeskView(input: {
  items: ActivityItem[]
  summary?: ConversionRoutingSummary | null
  fullName?: string | null
  nowMs?: number
}): FxDeskView {
  const nowMs = input.nowMs ?? Date.now()
  const name = firstName(input.fullName)
  const routing = input.items
    .filter(
      (item) =>
        item.thinking !== true &&
        (item.kind === 'CONVERSION_ROUTING_INSTRUCTION' ||
          Boolean(item.testRunId) ||
          item.routingAction === 'invoice' ||
          item.routingAction === 'pop_pack')
    )
    .sort((a, b) => a.createdAt - b.createdAt)

  const day =
    input.summary?.cycleNumber ||
    routing.filter((item) => item.cycleNumber).slice(-1)[0]?.cycleNumber ||
    0
  const dayCount = input.summary?.cycleCount || 14
  const converted = Number(input.summary?.cumulativeDeployed || 0)
  const residual = Number(input.summary?.availableCapital || 0)
  const authorised = converted + residual > 0 ? converted + residual : 300_000
  const pct = authorised > 0 ? Math.min(100, (converted / authorised) * 100) : 0

  const heldCount = routing.filter(isException).filter((item) => item.createdAt >= nowMs - DAY_MS).length
  const badge: DeskStatusBadge =
    heldCount > 0
      ? { label: `${heldCount} card${heldCount === 1 ? '' : 's'} held`, tone: 'held' }
      : { label: 'On track', tone: 'ok' }

  const recent = routing.filter((item) => item.createdAt >= nowMs - DAY_MS)
  const replaySource = recent.length ? recent : routing.slice(-8)

  const replayLines: DeskFeedLine[] = []
  for (const item of replaySource) {
    if (isException(item)) continue
    const body = firstPersonBody(item)
    if (!body) continue
    // Skip pure advice echoes of user asks in the morning replay.
    if (item.routingAction === 'advice' && item.userReply) continue
    const parts = toParts(body)
    if (item.invoiceZipStoragePath || item.invoicePackId || item.routingAction === 'invoice') {
      parts.push({ text: ' View', href: 'invoices', bold: true })
    }
    replayLines.push({
      id: item.id,
      atMs: item.createdAt,
      timeLabel: formatClock(item.createdAt),
      source: inferSource(item),
      parts,
      kind: 'replay',
    })
  }

  // Window standing line from summary when we have capital progress.
  if (converted > 0) {
    const remaining = Math.max(0, authorised - converted)
    const daysLeft = Math.max(1, dayCount - Math.max(0, day))
    const perDay = remaining / daysLeft
    replayLines.push({
      id: 'window-standing',
      atMs: nowMs,
      timeLabel: 'Now',
      source: 'Window',
      parts: toParts(
        `${formatZar(converted)} of ${formatZar(authorised)} converted. The remaining ${formatZar(remaining)} needs about ${formatZar(perDay)} a day over ${daysLeft} day${daysLeft === 1 ? '' : 's'}, in line with today.`
      ),
      kind: 'replay',
    })
  }

  const liveLines: DeskFeedLine[] = []
  for (const item of recent) {
    if (!isException(item)) continue
    const body = firstPersonBody(item)
    const titleMatch = body.match(/^([^.]{3,80}\.)\s*(.*)$/)
    liveLines.push({
      id: item.id,
      atMs: item.createdAt,
      timeLabel: formatClock(item.createdAt),
      source: inferSource(item),
      parts: toParts(titleMatch?.[2] || body),
      kind: 'exception',
      exceptionTitle: titleMatch?.[1]?.replace(/\.$/, '') || stripStepPrefix(item.title || 'Card on hold'),
      exceptionFollowUp: undefined,
    })
  }

  // Still-to-run from the newest open replenish / deploy ticket list.
  const openPlan =
    [...routing]
      .reverse()
      .find(
        (item) =>
          (item.routingAction === 'replenish' || item.routingAction === 'deploy' || item.routingAction === 'step') &&
          item.status !== 'completed' &&
          item.status !== 'cancelled'
      ) || [...routing].reverse().find((item) => item.routingAction === 'replenish')

  let tickets: DeskTicketRow[] = []
  let stillIntro: string | null = null
  let stillTotalLabel: string | null = null
  if (openPlan?.body) {
    tickets = markNextTicket(parseTicketsFromBody(openPlan.body, openPlan.id))
    const totalLine = openPlan.body.split('\n').find((line) => /^Total\s+R/i.test(line.trim()))
    if (totalLine) {
      const amount = totalLine.match(/R[\d][\d\s,.]*/)?.[0]
      if (amount) stillTotalLabel = amount.replace(/\s/g, ' ')
    }
    if (openPlan.routingAction === 'replenish') {
      stillIntro =
        "Restock today's tickets at cost. I'll confirm each from the bank feed. Nothing needed from you unless I flag it."
    } else {
      stillIntro = "Here's what's still on today's path. Nothing needed from you unless I flag it."
    }
  }

  // If an exception held a card, reflect that on matching ticket rows.
  for (const line of liveLines) {
    const heldName = (line.exceptionTitle || '').split(/\s+/)[0]
    if (!heldName) continue
    tickets = tickets.map((row) =>
      row.cardName.toLowerCase().startsWith(heldName.toLowerCase()) ? { ...row, status: 'held' } : row
    )
    tickets = markNextTicket(tickets.map((row) => (row.status === 'next' ? { ...row, status: 'pending' } : row)))
  }

  return {
    dayLabel: day > 0 ? `Day ${day} of ${dayCount}` : `Day — of ${dayCount}`,
    badge,
    windowPctLabel: `${pct.toFixed(1)}% of window`,
    greeting: greetingForNow(name),
    replayLines,
    liveLines,
    stillIntro,
    tickets,
    stillTotalLabel,
    testRunId: input.summary?.testRunId || routing.slice(-1)[0]?.testRunId,
    cycleNumber: day || undefined,
  }
}
