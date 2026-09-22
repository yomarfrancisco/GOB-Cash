import type { ActivityItem } from '@/store/activity'

export type DeskSpeaker = 'you' | 'sam' | 'leo' | 'amina'
export type DeskAgent = Exclude<DeskSpeaker, 'you'>

/**
 * The desk is three people. Sam owns the relationship: asks, answers,
 * opening the window. Leo runs the ZAR leg: every Sell ZAR card is his.
 * Amina runs the MZN leg: every restock (Moz cards swiped at COST) is hers.
 */
export const DESK_TEAM = {
  sam: {
    id: 'sam' as const,
    name: 'Sam',
    role: 'Relationship manager',
    avatar: '/assets/avatar-ariel.png',
  },
  leo: {
    id: 'leo' as const,
    name: 'Leo',
    role: 'ZAR liquidity manager',
    avatar: '/assets/avatar_agent3.png',
  },
  amina: {
    id: 'amina' as const,
    name: 'Amina',
    role: 'MZN liquidity manager',
    avatar: '/assets/Brics-girl-blue.png',
  },
}

/** Ring order for the header stack; the active agent rotates to the top. */
export const DESK_RING: DeskAgent[] = ['sam', 'leo', 'amina']

/**
 * Who is speaking on a desk item. Works on the Firestore doc shape too, so
 * the list, the header and the thread all agree.
 */
export function deskAgentFor(item: {
  kind?: string
  title?: string
  routingAction?: string
  thinking?: boolean
}): DeskAgent {
  if (item.thinking) return 'sam'
  if (item.routingAction === 'deploy') return 'leo'
  if (item.routingAction === 'replenish') return 'amina'
  const title = item.title || ''
  if (/^Sell ZAR\b/i.test(title)) return 'leo'
  if (/^Restock\b/i.test(title)) return 'amina'
  return 'sam'
}

/** Items that count as the desk talking (routing cards, asks, window shocks). */
export function isDeskVoiceItem(item: { kind?: string; actor?: { type?: string } }): boolean {
  return item.kind === 'CONVERSION_ROUTING_INSTRUCTION' || item.kind === 'ai_trade'
}

/** The agent whose turn it is: the newest desk item, thinking dots included. */
export function activeDeskAgent(items: Array<{ kind?: string; routingAction?: string; thinking?: boolean; createdAt: number }>): DeskAgent {
  let latest: (typeof items)[number] | null = null
  for (const item of items) {
    if (!isDeskVoiceItem(item)) continue
    if (!latest || item.createdAt > latest.createdAt) latest = item
  }
  return latest ? deskAgentFor(latest) : 'sam'
}

export type DeskChatRow = {
  kind: 'chat'
  id: string
  speaker: DeskSpeaker
  text: string
  at: number
  pendingConfirm?: boolean
}

export type DeskDayRow = {
  kind: 'day'
  id: string
  title: string
  result: string
  recommendedZar: number | null
  heldZar: number | null
  pairs: string[]
  at: number
}

export type DeskThreadRow = DeskChatRow | DeskDayRow

export type DeskNextStep = {
  title: string
  body: string
  clock: 'sent' | 'swiped' | 'start' | 'kyc' | null
  clockLabel: string
  stillToDeliver: string | null
  startAgain: boolean
  item: ActivityItem | null
}

const YES_RE = /^(yes|yeah|yep|yup|ok|okay|save(?: that| it)?|do it|confirm|please do)\b/i
const NO_RE = /^(no|nope|discard|cancel|don'?t|do not)\b/i

export function isDeskYes(message: string): boolean {
  return YES_RE.test(message.trim())
}

export function isDeskNo(message: string): boolean {
  return NO_RE.test(message.trim())
}

export function weekdaySast(at: number): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long',
  }).format(new Date(at))
}

function money(value: number): string {
  return `R${Math.round(value).toLocaleString('en-ZA')}`
}

function parseZar(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

function humanizeDeskText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (/^status:/i.test(line)) return false
      if (/^(expected spread|expected gross|live spread|sell |cost |spreadrate)/i.test(line)) return false
      if (/[{}\[\]"]/.test(line) && /:/.test(line)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function firstSentence(text: string): string {
  const clean = humanizeDeskText(text)
  const line = clean.split('\n').find((row) => row.length > 8) || clean
  const cut = line.match(/^(.+?[.!?])(\s|$)/)
  return (cut?.[1] || line).trim()
}

function swipePairs(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^swipe\s+/i, '').trim())
    .filter((line) => /\bon\b.+\bfor\b\s*R/i.test(line))
}

function leftoverLine(text: string): string | null {
  const match = text.match(/leftover[^.\n]*|still to deliver[^.\n]*|still owed[^.\n]*/i)
  return match ? match[0].trim() : null
}

export function isRoutingItem(item: ActivityItem): boolean {
  return item.kind === 'CONVERSION_ROUTING_INSTRUCTION'
}

export function isAskItem(item: ActivityItem): boolean {
  return item.routingAction === 'advice' || item.routingAction === 'proposal'
}

export function isAwaitingClock(item: ActivityItem): boolean {
  return (
    isRoutingItem(item) &&
    !isAskItem(item) &&
    item.thinking !== true &&
    item.awaitingConfirm === true &&
    item.status !== 'completed' &&
    item.status !== 'superseded' &&
    item.status !== 'cancelled'
  )
}

export function speakerForItem(item: ActivityItem): DeskAgent {
  return deskAgentFor(item)
}

function samConfirmText(item: ActivityItem): string {
  const spoken = humanizeDeskText(item.body || item.title)
  const lead = spoken || 'I can save that into this window.'
  if (item.awaitingProposalAccept) {
    return `${lead}\n\nSave that into this window?`
  }
  return lead
}

export function buildDeskThread(items: ActivityItem[]): DeskThreadRow[] {
  const chronological = [...items]
    .filter((item) => item.thinking !== true)
    .sort((a, b) => a.createdAt - b.createdAt)
  const rows: DeskThreadRow[] = []

  for (const item of chronological) {
    if (item.userReply) {
      rows.push({
        kind: 'chat',
        id: `${item.id}-you`,
        speaker: 'you',
        text: item.userReply,
        at: item.userRepliedAt || item.createdAt,
      })
    }

    if (item.thinking) continue

    if (isRoutingItem(item) && item.status === 'completed' && !isAskItem(item)) {
      const body = item.body || ''
      rows.push({
        kind: 'day',
        id: `${item.id}-day`,
        title: `Cycle ${item.cycleNumber || ''} · ${weekdaySast(item.createdAt)}`.replace('Cycle  ·', 'Cycle'),
        result: firstSentence(
          body ||
            (item.routingAction === 'replenish'
              ? `I restocked ${item.pairedAmountValue ? money(item.pairedAmountValue) : 'ZAR'} at COST.`
              : `I sold ${item.amount?.value ? money(item.amount.value) : 'ZAR'}.`)
        ),
        recommendedZar:
          item.routingAction === 'replenish'
            ? item.pairedAmountValue || item.amount?.value || null
            : item.amount?.value || parseZar(body, /pay\s*R\s*([\d,]+)/i),
        heldZar: parseZar(body, /(?:idle|kept|held)\s*(?:capital\s*)?(?:in south africa after this payout:\s*)?R\s*([\d,]+)/i),
        pairs: swipePairs(body),
        at: item.createdAt,
      })
      continue
    }

    if (isAwaitingClock(item)) {
      const text = humanizeDeskText(item.body || item.title)
      if (text) {
        rows.push({
          kind: 'chat',
          id: item.id,
          speaker: speakerForItem(item),
          text,
          at: item.createdAt,
        })
      }
      continue
    }

    const text = isAskItem(item) ? samConfirmText(item) : humanizeDeskText(item.body || item.title)
    if (!text) continue
    rows.push({
      kind: 'chat',
      id: item.id,
      speaker: isAskItem(item) ? 'sam' : speakerForItem(item),
      text,
      at: item.createdAt,
      pendingConfirm: item.awaitingProposalAccept === true,
    })
  }

  return rows
}

export function latestPendingWrite(items: ActivityItem[]): ActivityItem | null {
  return (
    [...items]
      .filter((item) => item.awaitingProposalAccept === true && item.proposalId)
      .sort((a, b) => b.createdAt - a.createdAt)[0] || null
  )
}

export function buildNextStep(items: ActivityItem[], extra?: { kyc?: boolean; kycLabel?: string }): DeskNextStep {
  if (extra?.kyc) {
    return {
      title: 'Identity first',
      body: 'This desk will not move a card until KYC is complete.',
      clock: 'kyc',
      clockLabel: extra.kycLabel || 'Start KYC',
      stillToDeliver: null,
      startAgain: false,
      item: null,
    }
  }

  const awaiting = items.find(isAwaitingClock) || null
  if (awaiting) {
    const leftover = leftoverLine(awaiting.body || '')
    const sale = awaiting.routingAction !== 'replenish'
    return {
      title: sale
        ? `Cycle ${awaiting.cycleNumber || ''} · send ZAR`.replace('Cycle  ·', 'Cycle')
        : `Cycle ${awaiting.cycleNumber || ''} · restock`.replace('Cycle  ·', 'Cycle'),
      body: humanizeDeskText(awaiting.body || awaiting.title) || firstSentence(awaiting.body || awaiting.title),
      clock: awaiting.routingBlocked ? null : sale ? 'sent' : 'swiped',
      clockLabel: sale ? "I've sent ZAR" : "I've swiped",
      stillToDeliver: leftover,
      startAgain: false,
      item: awaiting,
    }
  }

  const finished = items.find((item) => item.startNextRun === true)
  const leftover = items.map((item) => leftoverLine(item.body || '')).find(Boolean) || null
  if (finished) {
    return {
      title: 'Window closed',
      body: firstSentence(finished.body || 'This 14-weekday window is done.'),
      clock: 'start',
      clockLabel: finished.cycleNumber ? 'Start the window' : 'Start the window',
      stillToDeliver: leftover,
      startAgain: true,
      item: finished,
    }
  }

  if (leftover) {
    return {
      title: 'Still to deliver',
      body: leftover,
      clock: null,
      clockLabel: '',
      stillToDeliver: leftover,
      startAgain: false,
      item: items[0] || null,
    }
  }

  return {
    title: 'Desk is quiet',
    body: 'Tell Sam what happened, or ask what is next.',
    clock: null,
    clockLabel: '',
    stillToDeliver: null,
    startAgain: false,
    item: items.find((item) => item.testRunId) || items[0] || null,
  }
}

export function hasLiveStep(next: DeskNextStep): boolean {
  return Boolean(next.clock || next.stillToDeliver || next.startAgain)
}
