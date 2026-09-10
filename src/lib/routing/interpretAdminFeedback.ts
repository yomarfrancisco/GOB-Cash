import { attachResolvedExpiry } from './interpretContext'
import {
  cardLabel,
  inventoryPromptList,
  machineLabel,
  resolveNamedCardIds,
  resolveNamedMachineIds,
} from './inventory'
import { formatRoutingClock, hasCalendarTimeReference, namesConstraintChange, parseExpiresAt, shouldNotApplyAskIntents } from './routingTime'

type ConstraintAction =
  | 'exclude_card'
  | 'exclude_machine'
  | 'restore_card'
  | 'restore_machine'
  | 'set_card_max'
  | 'set_card_min'
  | 'rest_card'
  | 'prefer_machine'
  | 'add_machine'
  | 'add_card'
  | 'set_global_max'

export type RoutingIntent = {
  action: ConstraintAction
  resourceType: 'card' | 'machine' | 'config' | null
  resourceId: number | null
  value: number | null
  scope: 'this_cycle' | 'n_cycles' | 'until_cleared' | 'until_date' | 'permanent'
  nCycles: number | null
  expiresAt?: number | null
  summary: string
  confidence: number
}

export type InterpretResult = {
  intents: RoutingIntent[]
  clarification: string | null
  interpreter: 'llm' | 'fast_path'
}

const ACTIONS = new Set<string>([
  'exclude_card',
  'exclude_machine',
  'restore_card',
  'restore_machine',
  'set_card_max',
  'set_card_min',
  'rest_card',
  'prefer_machine',
  'add_machine',
  'add_card',
  'set_global_max',
])

export type InterpretContext = {
  cycleNumber: number
  cardCount: number
  machineCount: number
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  activeConstraints: string[]
  nowMs?: number
  historyBrief?: string
}

function sanitizeIntent(raw: unknown): RoutingIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.action !== 'string' || !ACTIONS.has(data.action)) return null
  return {
    action: data.action as RoutingIntent['action'],
    resourceType:
      data.resourceType === 'card' || data.resourceType === 'machine' || data.resourceType === 'config'
        ? data.resourceType
        : null,
    resourceId: typeof data.resourceId === 'number' ? data.resourceId : null,
    value: typeof data.value === 'number' ? data.value : null,
    scope:
      data.scope === 'n_cycles' ||
      data.scope === 'until_cleared' ||
      data.scope === 'until_date' ||
      data.scope === 'permanent'
        ? data.scope
        : 'this_cycle',
    nCycles: typeof data.nCycles === 'number' ? data.nCycles : null,
    expiresAt: parseExpiresAt(data.expiresAt),
    summary: typeof data.summary === 'string' ? data.summary : data.action,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
  }
}

export function usefulClarification(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim().toLowerCase()
  if (!t || t === 'null' || t === 'none' || t === 'short question' || t === 'clarification') return null
  if (t.includes('i am not sure how to apply that')) return null
  if (t.includes('name a card or machine and whether')) return null
  if (t.length < 16) return null
  return text.trim()
}

export function contextualClarify(
  assignments: Array<{ cardId: number; machineId: number }>
): string {
  const named = assignments
    .map((row) => `${cardLabel(row.cardId)} on ${machineLabel(row.machineId)}`)
    .join(', ')
  if (named) {
    return `This cycle currently uses ${named}. Tell me which card or machine to change, and whether it is unavailable, restored, capped, or resting.`
  }
  return 'Tell me which card or machine to change, and whether it is unavailable, restored, capped, or resting.'
}

export function parseRoutingAssignmentsFromBody(
  body?: string
): Array<{ cardId: number; machineId: number; amount: number }> {
  if (!body) return []
  const assignments: Array<{ cardId: number; machineId: number; amount: number }> = []
  const numbered = /Card\s+(\d+)\s*[·•]\s*Machine\s+(\d+)\s*[·•]\s*R([\d,]+(?:\.\d+)?)/gi
  let match: RegExpExecArray | null
  while ((match = numbered.exec(body))) {
    assignments.push({
      cardId: Number(match[1]),
      machineId: Number(match[2]),
      amount: Number(match[3].replace(/,/g, '')),
    })
  }
  if (assignments.length) return assignments
  const named = /^(.+?)\s*[·•]\s*(.+?)\s*[·•]\s*R([\d,]+(?:\.\d+)?)\s*$/gim
  while ((match = named.exec(body))) {
    const cardId = resolveNamedCardIds(match[1])[0]
    const machineId = resolveNamedMachineIds(match[2])[0]
    if (!cardId || !machineId) continue
    assignments.push({
      cardId,
      machineId,
      amount: Number(match[3].replace(/,/g, '')),
    })
  }
  return assignments
}

export function parseObviousFeedback(message: string): InterpretResult | null {
  const text = message.trim()
  if (!text) return null
  if (hasCalendarTimeReference(text)) return null
  const lower = text.toLowerCase()
  const intents: RoutingIntent[] = []
  const cardIds = resolveNamedCardIds(text)
  const machineIds = resolveNamedMachineIds(text)
  const scope: RoutingIntent['scope'] = /\buntil (i |you )?(say|tell|restore)|from now on|permanently|anymore\b/.test(
    lower
  )
    ? /from now on|permanently/.test(lower)
      ? 'permanent'
      : 'until_cleared'
    : /\b(\d+)\s+cycles?\b/.test(lower)
      ? 'n_cycles'
      : 'this_cycle'
  const nMatch = lower.match(/\b(\d+)\s+cycles?\b/)
  const nCycles = nMatch ? Number(nMatch[1]) : scope === 'n_cycles' ? 1 : null
  const restore = /\b(back|available again|restore|is up|online again)\b/.test(lower)
  const exclude = /\b(unavailable|blocked|down|lost|don'?t use|do not use|off|out|exclude|skip|resting|rest)\b/.test(
    lower
  )

  if (restore) {
    for (const id of cardIds) {
      intents.push({
        action: 'restore_card',
        resourceType: 'card',
        resourceId: id,
        value: null,
        scope: 'this_cycle',
        nCycles: null,
        summary: `${cardLabel(id)} restored.`,
        confidence: 0.75,
      })
    }
    for (const id of machineIds) {
      intents.push({
        action: 'restore_machine',
        resourceType: 'machine',
        resourceId: id,
        value: null,
        scope: 'this_cycle',
        nCycles: null,
        summary: `${machineLabel(id)} restored.`,
        confidence: 0.75,
      })
    }
  } else if (exclude && cardIds.length) {
    const rest = /\brest\b/.test(lower)
    for (const id of cardIds) {
      intents.push({
        action: rest ? 'rest_card' : 'exclude_card',
        resourceType: 'card',
        resourceId: id,
        value: null,
        scope: rest && nCycles ? 'n_cycles' : scope,
        nCycles: rest ? nCycles || 1 : nCycles,
        summary: rest
          ? `${cardLabel(id)} resting for the next ${nCycles || 1} cycle${(nCycles || 1) === 1 ? '' : 's'}.`
          : `${cardLabel(id)} excluded for ${scope === 'this_cycle' ? 'this cycle only' : 'the requested window'}.`,
        confidence: 0.72,
      })
    }
  } else if (exclude && machineIds.length) {
    for (const id of machineIds) {
      intents.push({
        action: 'exclude_machine',
        resourceType: 'machine',
        resourceId: id,
        value: null,
        scope,
        nCycles,
        summary: `${machineLabel(id)} unavailable for ${scope === 'this_cycle' ? 'this cycle only' : 'the requested window'}.`,
        confidence: 0.72,
      })
    }
  }

  if (!intents.length) return null
  return { intents, clarification: null, interpreter: 'fast_path' }
}

function buildInterpretPrompt(message: string, context: InterpretContext): { system: string; user: string } {
  const nowMs = context.nowMs ?? Date.now()
  const historyBrief = context.historyBrief || formatRoutingClock(nowMs).promptLine
  const system = `You convert an admin's natural-language routing feedback into JSON constraints.
The routing engine is deterministic. You only interpret intent. You never invent a route.
You are given the current clock in SAST and the planner ledger. Use them to resolve time phrases and to answer questions about when things happened or when they are due.

Return JSON only:
{"intents":[...],"clarification":null}

Each intent:
{
  "action": "exclude_card" | "exclude_machine" | "restore_card" | "restore_machine" | "set_card_max" | "set_card_min" | "rest_card" | "prefer_machine" | "add_machine" | "add_card" | "set_global_max",
  "resourceType": "card" | "machine" | "config" | null,
  "resourceId": number | null,
  "value": number | null,
  "scope": "this_cycle" | "n_cycles" | "until_cleared" | "until_date" | "permanent",
  "nCycles": number | null,
  "expiresAt": number | null,
  "summary": string,
  "confidence": number
}

Scope rules:
- "this cycle" / "next cycle" / unspecified short exclusion → this_cycle
- "for N cycles" / "rest N cycles" → n_cycles with nCycles
- "until I say" / "blocked" / "down" / "don't use anymore" → until_cleared
- "until Monday" / "until 17:00" / "for the rest of today" / "until lunch" → until_date with expiresAt
- "from now on" / "permanently" / "we now have another machine" → permanent
expiresAt is unix milliseconds for the SAST instant when the constraint should lift.
Resolve relative dates against Now in the ledger. Named weekdays without a time expire at 00:00 SAST on that day if it is still ahead, otherwise the next occurrence. "for the rest of today" expires at tomorrow 00:00 SAST.
Never invent expiresAt unless the admin gave a time or date phrase.
Past remarks ("yesterday we used card 5") are ledger context, not new intents, unless the admin also gives a change.
If the message only asks when something happened, whether you remember a prior change, or when something is expected, emit no intents and put one factual sentence in clarification that names the clock time from the ledger.
Example: Admin: "Do you remember that it was lost?"
{"intents":[],"clarification":"Yes. At Thursday 10 September 2026, 00:23 SAST you took Card 4 off Cycle 12 because it was lost."}
If the admin asks why this route, what happens next, what's next, what we should do, or any strategy question without naming a change, emit no intents and set clarification to null. The desk advisor will answer from the ledger, ask a question if a fact is missing, and must not invent cards, POS, or amounts.
If the admin asks "what if" or "what would happen if" AND names a change, emit the intents for that change. The server previews and does not apply until they Accept.
If ambiguous, use this_cycle and say so in summary. Never silently choose permanent.
Never put placeholder text in clarification. Do not write "short question", "null", or a generic "I am not sure" message.
If the admin names a card or machine and a change (unavailable, down, restore, rest, cap, prefer), you MUST emit an intent.
clarification is either null or one specific sentence that names the missing fact.

Example:
Admin: "Card 5 is unavailable for this cycle."
{"intents":[{"action":"exclude_card","resourceType":"card","resourceId":5,"value":null,"scope":"this_cycle","nCycles":null,"expiresAt":null,"summary":"Card 5 excluded from this cycle only.","confidence":0.95}],"clarification":null}

Amounts are ZAR. "R12k" is 12000.
${inventoryPromptList()}
You may still accept "card 5" or "machine 3", but prefer names in summaries.`

  const user = `${historyBrief}

Current awaiting cycle: ${context.cycleNumber}
Current route:
${context.assignments.map((row) => `${cardLabel(row.cardId)} → ${machineLabel(row.machineId)} — R${row.amount}`).join('\n') || '(none)'}
Active constraints:
${context.activeConstraints.length ? context.activeConstraints.join('\n') : '(none)'}

Admin message:
${message}`

  return { system, user }
}

function looksLikeDeskChoice(message: string): boolean {
  if (shouldNotApplyAskIntents(message)) return true
  const lower = message.trim().toLowerCase()
  if (/\b(none|no card|no cards|new card|new consortium|retire)\b/.test(lower)) {
    return !namesConstraintChange(message)
  }
  const named = resolveNamedCardIds(message)
  return named.length > 0 && message.trim().split(/\s+/).length <= 12 && !namesConstraintChange(message)
}

export async function interpretRoutingFeedbackWithOpenAI(
  message: string,
  context: InterpretContext
): Promise<InterpretResult> {
  const nowMs = context.nowMs ?? Date.now()
  if (shouldNotApplyAskIntents(message) || looksLikeDeskChoice(message)) {
    return { intents: [], clarification: null, interpreter: 'fast_path' }
  }
  const obvious = parseObviousFeedback(message)
  if (obvious?.intents.length) {
    return {
      ...obvious,
      intents: attachResolvedExpiry(obvious.intents, message, nowMs),
    }
  }

  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured')
  }
  const { system, user } = buildInterpretPrompt(message, context)
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`)
  }
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''

  let parsed: { intents?: unknown; clarification?: unknown }
  try {
    parsed = JSON.parse(text)
  } catch {
    const recovered = parseObviousFeedback(message)
    if (recovered?.intents.length) {
      return {
        ...recovered,
        intents: attachResolvedExpiry(recovered.intents, message, nowMs),
      }
    }
    return {
      intents: [],
      clarification: contextualClarify(context.assignments),
      interpreter: 'llm',
    }
  }
  const intents = Array.isArray(parsed.intents)
    ? parsed.intents.map((row) => sanitizeIntent(row)).filter((row): row is RoutingIntent => Boolean(row))
    : []
  if (intents.length) {
    return {
      intents: attachResolvedExpiry(intents, message, nowMs),
      clarification: null,
      interpreter: 'llm',
    }
  }
  const recovered = parseObviousFeedback(message)
  if (recovered?.intents.length) {
    return {
      ...recovered,
      intents: attachResolvedExpiry(recovered.intents, message, nowMs),
    }
  }
  return {
    intents: [],
    clarification: usefulClarification(
      typeof parsed.clarification === 'string' ? parsed.clarification : null
    ) || contextualClarify(context.assignments),
    interpreter: 'llm',
  }
}
