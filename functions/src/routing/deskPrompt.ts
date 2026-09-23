/**
 * One picture of the desk, shared by every Ask call.
 * The model may speak in a person's voice. It may not invent a figure.
 */

import type { DeskChart, DeskTable, DeskVisuals } from './deskVisuals'
import { catalogText, pickDeskChart, pickDeskTable, suggestVisuals } from './deskVisuals'

export const DESK_SYSTEM_PROMPT = `You are the FX desk. Three people share one book.

Sam is the relationship manager. He owns the relationship, opens the window, and answers when nobody is named.
Leo is the ZAR liquidity manager. He runs every ZAR sale: ZAR leaves the South African float at the SELL rate.
Amina is the MZN liquidity manager. She runs every restock: the Mozambique cards are swiped back at the COST rate and MZN goes out.

A window is fourteen weekdays. Each weekday Leo sells a set of whole ZAR tickets at SELL. Amina then restocks those same tickets at COST. The spread is SELL minus COST. When the residual hits R0, the book stops. The next amount is this window plus the ZAR spread it earned, and never more than the ZAR wallet can fund. If the wallet is empty, nobody opens a window; ZAR has to be added first.

You are in a live conversation with the operator of this book. You are a colleague at the desk, not a status page.

How you talk:
- Answer the actual question first, in plain words. "Are you there?" gets "Yes, here." "Do you know my name?" gets their name if you have it, or an honest no.
- You know who the operator is when their profile is attached. Use their first name naturally, the way a colleague would — not on every line.
- You know the SAST clock. Greet by the time of day. You know how long the open sale or restock has been waiting, and when the last day landed.
- You remember this thread. If you already introduced yourself, do not do it again. If you already gave a figure a moment ago, do not recite it again unless they ask or it changed.
- Do not open with the book status. Bring a figure in when it answers the question, or as one short steer.
- Steer once, lightly. If they wander, one sentence back to the open action or the residual. Do not end every message with "would you like to proceed".
- Vary your phrasing. Short sentences. Contractions are fine. No bullet lists in a chat reply.
- Tables and charts are for when they ask for one, or when the question is about numbers over days. Never on a greeting or small talk.

You do not invent a rate, a ticket, a card, a rail, or a balance. Numbers and names come only from the ledger, the profile, or the desk fact you are given. If a fact is not there, say you do not have it. You do not choose a rail and you do not compute a new book.`

const SPEAKER_ROLE = {
  sam: 'Sam, the relationship manager',
  leo: 'Leo, the ZAR liquidity manager',
  amina: 'Amina, the MZN liquidity manager',
} as const

export type DeskVoice = keyof typeof SPEAKER_ROLE

export function isCannedDeskAdvice(title: string, body = ''): boolean {
  const text = `${title}\n${body}`
  return /need a clearer ask|not a desk ask/i.test(text)
}

/** Amounts, rates, and metical figures. A reply may repeat these and add none. */
export function moneyTokens(text: string): string[] {
  const found = text.match(/R\s?[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?\s*Mt\/R|Mt\s?[\d,]+(?:\.\d+)?/gi) || []
  return found.map((token) => token.replace(/[\s,]/g, '').toLowerCase())
}

export function replyAddsNoNewMoney(reply: string, facts: string): boolean {
  const allowed = new Set(moneyTokens(facts))
  return moneyTokens(reply).every((token) => allowed.has(token))
}

export function replyStaysInsideFacts(reply: string, facts: string): boolean {
  const allowed = moneyTokens(facts)
  const used = moneyTokens(reply)
  const allowedSet = new Set(allowed)
  if (!used.every((token) => allowedSet.has(token))) return false
  const usedSet = new Set(used)
  return allowed.every((token) => usedSet.has(token))
}

export type DeskConversation = {
  title: string
  body: string
  table?: DeskTable
  chart?: DeskChart
}

export type DeskOperator = {
  firstName?: string
  fullName?: string
  handle?: string
}

export type DeskExchange = {
  atLabel: string
  you: string
  speaker: DeskVoice
  desk: string
}

export type DeskMoment = {
  /** "Wednesday 23 September 2026, 11:45 SAST" */
  clockLine: string
  /** morning | afternoon | evening | night */
  partOfDay: string
  weekend: boolean
  /** Timestamped desk events, oldest first. */
  activity: string[]
}

function speakerName(speaker: DeskVoice): string {
  return speaker === 'sam' ? 'Sam' : speaker === 'leo' ? 'Leo' : 'Amina'
}

function fallbackConversation(
  speaker: DeskVoice,
  snapshot: string,
  operator?: DeskOperator,
  thread?: DeskExchange[]
): DeskConversation {
  const name = speakerName(speaker)
  const introduced = (thread || []).some((row) => row.speaker === speaker)
  const who = operator?.firstName ? `, ${operator.firstName}` : ''
  const opener = introduced ? `Here${who}.` : `Here${who} — ${name}, ${SPEAKER_ROLE[speaker].split(', ')[1]}.`
  return {
    title: `${name} is here`,
    body: `${opener} ${snapshot.split('. ').slice(0, 2).join('. ')}.`,
  }
}

function threadText(thread: DeskExchange[] | undefined): string {
  if (!thread?.length) return '(nothing yet — this is the first message)'
  return thread
    .map((row) => `[${row.atLabel}] Operator: ${row.you}\n[${row.atLabel}] ${speakerName(row.speaker)}: ${row.desk}`)
    .join('\n')
}

/**
 * Answer the operator in the agent's voice, using only the attached book.
 * Tables and charts are picked from the catalog — never invented.
 */
export async function converseAtDesk(params: {
  speaker: DeskVoice
  message: string
  brief: string
  visuals: DeskVisuals
  deskFact?: string
  operator?: DeskOperator
  thread?: DeskExchange[]
  moment?: DeskMoment
}): Promise<DeskConversation> {
  const snapshot = params.visuals.snapshot.trim()
  const fallback = fallbackConversation(params.speaker, snapshot, params.operator, params.thread)
  const facts = [
    params.brief,
    snapshot,
    params.deskFact || '',
    catalogText(params.visuals),
    threadText(params.thread),
    (params.moment?.activity || []).join('\n'),
  ]
    .filter(Boolean)
    .join('\n')
  const suggested = suggestVisuals(params.message, params.visuals)
  const { llmApiKey, llmModel } = await import('./interpretFeedback')
  const apiKey = llmApiKey()
  if (!apiKey) {
    return { ...fallback, table: suggested.table, chart: suggested.chart }
  }
  const tableIds = params.visuals.tables.map((row) => row.id).join(', ') || 'none'
  const chartIds = params.visuals.charts.map((row) => row.id).join(', ') || 'none'
  const operatorLine = params.operator?.fullName
    ? `${params.operator.fullName}${params.operator.handle ? ` (${params.operator.handle})` : ''}. First name: ${params.operator.firstName || params.operator.fullName.split(' ')[0]}.`
    : params.operator?.handle
      ? `Handle ${params.operator.handle}. No full name on file.`
      : 'No name on file. If asked, say so plainly.'
  const momentLines = params.moment
    ? [
        `Now: ${params.moment.clockLine}. It is ${params.moment.partOfDay}${params.moment.weekend ? ', a weekend — rails rest' : ''}.`,
        params.moment.activity.length ? `Recent desk activity:\n${params.moment.activity.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${DESK_SYSTEM_PROMPT}

You are speaking as ${SPEAKER_ROLE[params.speaker]}.
Reply to the operator's latest message. One to four sentences for chat; up to six when they ask for detail.
Read the thread first. Do not repeat an introduction or a figure that is already there unless asked.
The title is a short chat subject of two to five words in your own voice — never "Status", never a headline.
Attach a table or chart by id ONLY when the operator asks for a graph, chart, table, breakdown, or projection, or asks how something moved across days. Otherwise both must be null.
Return JSON only: {"title":"...","body":"...","tableId":null,"chartId":null}
tableId must be null or one of: ${tableIds}
chartId must be null or one of: ${chartIds}`,
          },
          {
            role: 'user',
            content: `Operator profile:\n${operatorLine}

${momentLines ? `${momentLines}\n\n` : ''}Thread so far (oldest first):\n${threadText(params.thread)}

Operator now says:\n${params.message.trim() || '(no message — you are speaking first)'}

Book now:\n${snapshot}

Ledger:\n${params.brief || '(none)'}

${params.deskFact ? `Desk fact (if you use these figures, repeat them exactly):\n${params.deskFact}\n\n` : ''}Visual catalog:\n${catalogText(params.visuals)}`,
          },
        ],
      }),
    })
    if (!response.ok) return { ...fallback, table: suggested.table, chart: suggested.chart }
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(text) as {
      title?: string
      body?: string
      tableId?: string | null
      chartId?: string | null
    }
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    if (!body || body.length > 1200 || !replyAddsNoNewMoney(body, facts)) {
      return { ...fallback, table: suggested.table, chart: suggested.chart }
    }
    const asked = Boolean(suggested.table || suggested.chart)
    const table = pickDeskTable(params.visuals.tables, parsed.tableId) || (asked ? suggested.table : undefined)
    const chart = pickDeskChart(params.visuals.charts, parsed.chartId) || (asked ? suggested.chart : undefined)
    return {
      title: title && title.length <= 48 ? title : fallback.title,
      body,
      table,
      chart,
    }
  } catch {
    return { ...fallback, table: suggested.table, chart: suggested.chart }
  }
}

/**
 * Say the desk fact in the agent's voice. If the model adds a figure that was
 * not in the fact, or the key is missing, the fact is returned unchanged.
 */
export async function speakDeskReply(params: {
  speaker: DeskVoice
  fact: string
  message?: string
}): Promise<string> {
  const fact = params.fact.trim()
  if (!fact) return fact
  const { llmApiKey, llmModel } = await import('./interpretFeedback')
  const apiKey = llmApiKey()
  if (!apiKey) return fact
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${DESK_SYSTEM_PROMPT}

You are speaking as ${SPEAKER_ROLE[params.speaker]}.
Rewrite the desk fact as this person's reply to the operator. Two to four sentences. Keep every figure that is in the fact. Add none.
Return JSON only: {"body":"..."}`,
          },
          {
            role: 'user',
            content: `Operator:\n${params.message?.trim() || '(no message — this is the desk speaking first)'}\n\nDesk fact:\n${fact}`,
          },
        ],
      }),
    })
    if (!response.ok) return fact
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(text) as { body?: string }
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
    if (!body || body.length > 900 || !replyStaysInsideFacts(body, fact)) return fact
    return body
  } catch {
    return fact
  }
}
