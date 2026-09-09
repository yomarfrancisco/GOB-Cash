import * as functions from 'firebase-functions'
import {
  contextualClarify,
  parseFastPath,
  sanitizeIntent,
  usefulClarification,
  type InterpretResult,
  type RoutingIntent,
  type StoredConstraint,
} from './constraints'
import type { RoutingState } from './conversionRouter'
import { attachResolvedExpiry, buildRoutingLedgerBrief, ledgerFromRoutingState } from './interpretContext'

type InterpretContext = {
  cycleNumber: number
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  state: RoutingState
  constraints: StoredConstraint[]
  nowMs?: number
  historyBrief?: string
  issuedAtMs?: number | null
}

function llmApiKey(): string | null {
  let config: string | null = null
  try {
    config = functions.config()?.llm?.api_key || functions.config()?.openai?.key || null
  } catch {
    config = null
  }
  return process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || config || null
}

function llmModel(): string {
  return process.env.LLM_MODEL || 'gpt-4o-mini'
}

export function buildInterpretPrompt(message: string, context: InterpretContext): {
  system: string
  user: string
} {
  const nowMs = context.nowMs ?? Date.now()
  const historyBrief =
    context.historyBrief ||
    buildRoutingLedgerBrief({
      ledger: ledgerFromRoutingState(context.state),
      constraints: context.constraints,
      awaiting: {
        cycleNumber: context.cycleNumber,
        kind: 'deploy',
        issuedAtMs: context.issuedAtMs ?? null,
      },
      nowMs,
    })
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
If ambiguous, use this_cycle and say so in summary. Never silently choose permanent.
Never put placeholder text in clarification. Do not write "short question", "null", or a generic "I am not sure" message.
If the admin names a card or machine and a change (unavailable, down, restore, rest, cap, prefer), you MUST emit an intent.
clarification is either null or one specific sentence that names the missing fact.

Example:
Admin: "Card 5 is unavailable for this cycle."
{"intents":[{"action":"exclude_card","resourceType":"card","resourceId":5,"value":null,"scope":"this_cycle","nCycles":null,"expiresAt":null,"summary":"Card 5 excluded from this cycle only.","confidence":0.95}],"clarification":null}

Amounts are ZAR. "R12k" is 12000.
Cards are numbered 1..${context.state.cards.length}. Machines are numbered 1..${context.state.machines.length}.`

  const user = `${historyBrief}

Current awaiting cycle: ${context.cycleNumber}
Current route:
${context.assignments.map((row) => `Card ${row.cardId} → Machine ${row.machineId} — R${row.amount}`).join('\n') || '(none)'}

Admin message:
${message}`

  return { system, user }
}

async function interpretWithLlm(message: string, context: InterpretContext): Promise<InterpretResult> {
  const apiKey = llmApiKey()
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
      model: llmModel(),
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
    return {
      intents: [],
      clarification: contextualClarify(context.assignments),
      interpreter: 'llm',
    }
  }
  const intents = Array.isArray(parsed.intents)
    ? parsed.intents.map((row) => sanitizeIntent(row)).filter((row): row is RoutingIntent => Boolean(row))
    : []
  const rawClarification =
    typeof parsed.clarification === 'string' && parsed.clarification.trim()
      ? parsed.clarification.trim()
      : null
  return { intents, clarification: usefulClarification(rawClarification), interpreter: 'llm' }
}

export async function interpretAdminFeedback(
  message: string,
  context: InterpretContext
): Promise<InterpretResult> {
  const nowMs = context.nowMs ?? Date.now()
  const fast = parseFastPath(message)
  if (fast?.intents.length) {
    return { ...fast, intents: attachResolvedExpiry(fast.intents, message, nowMs) }
  }
  try {
    const llm = await interpretWithLlm(message, context)
    if (llm.intents.length) {
      return { ...llm, intents: attachResolvedExpiry(llm.intents, message, nowMs) }
    }
    const recovered = parseFastPath(message)
    if (recovered?.intents.length) {
      return { ...recovered, intents: attachResolvedExpiry(recovered.intents, message, nowMs) }
    }
    return {
      intents: [],
      clarification: usefulClarification(llm.clarification) || contextualClarify(context.assignments),
      interpreter: 'llm',
    }
  } catch (error) {
    const recovered = parseFastPath(message)
    if (recovered?.intents.length) {
      return { ...recovered, intents: attachResolvedExpiry(recovered.intents, message, nowMs) }
    }
    throw error
  }
}

export { llmApiKey }
