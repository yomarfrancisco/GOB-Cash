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

You are in a live conversation with the operator of this book. Greetings, "are you there", and "who are you / who am I" are on-desk. Answer them as yourself. You know the operator runs this desk. You do not have their legal name unless the ledger states it.

If they wander off the book, answer in one short sentence, then steer them back: name the open action (Leo's sale or Amina's restock) or the residual still to convert.

You do not invent a rate, a ticket, a card, a rail, or a balance. Numbers and names come only from the ledger or the desk fact you are given. If a fact is not there, say you do not have it. You do not choose a rail and you do not compute a new book.`

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

function fallbackConversation(speaker: DeskVoice, snapshot: string): DeskConversation {
  const name = speaker === 'sam' ? 'Sam' : speaker === 'leo' ? 'Leo' : 'Amina'
  const role = SPEAKER_ROLE[speaker]
  return {
    title: `${name} is here`,
    body: `I'm here. I'm ${role}. ${snapshot} What do you need from the book?`,
  }
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
}): Promise<DeskConversation> {
  const snapshot = params.visuals.snapshot.trim()
  const fallback = fallbackConversation(params.speaker, snapshot)
  const facts = [params.brief, snapshot, params.deskFact || '', catalogText(params.visuals)]
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
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.35,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${DESK_SYSTEM_PROMPT}

You are speaking as ${SPEAKER_ROLE[params.speaker]}.
Reply to the operator. Two to six sentences. Professional, present, and useful.
If they greet you or ask who you are, introduce yourself and the open book.
If they wander, steer them back to the open sale, restock, or residual.
Attach at most one table and one chart from the catalog, by id. Use a table when a breakdown is clearer. Use a chart when they ask about profit, capital, residual, or a projection.
Return JSON only: {"title":"...","body":"...","tableId":null,"chartId":null}
tableId must be one of: ${tableIds}
chartId must be one of: ${chartIds}
Use null when a visual does not help.`,
          },
          {
            role: 'user',
            content: `Operator:\n${params.message.trim() || '(no message)'}

Ledger:\n${params.brief || '(none)'}

Book now:\n${snapshot}

${params.deskFact ? `Desk fact (repeat these figures if you use them; do not replace them):\n${params.deskFact}\n` : ''}
Visual catalog:\n${catalogText(params.visuals)}`,
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
    const table =
      pickDeskTable(params.visuals.tables, parsed.tableId) || suggested.table
    const chart =
      pickDeskChart(params.visuals.charts, parsed.chartId) || suggested.chart
    return {
      title: title && title.length <= 72 ? title : fallback.title,
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
