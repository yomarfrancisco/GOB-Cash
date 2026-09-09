import * as functions from 'firebase-functions'
import {
  parseFastPath,
  sanitizeIntent,
  type InterpretResult,
  type RoutingIntent,
  type StoredConstraint,
} from './constraints'
import type { RoutingState } from './conversionRouter'

type InterpretContext = {
  cycleNumber: number
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  state: RoutingState
  constraints: StoredConstraint[]
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
  const active = context.constraints.filter((row) => row.status === 'active')
  const system = `You convert an admin's natural-language routing feedback into JSON constraints.
The routing engine is deterministic. You only interpret intent. You never invent a route.

Return JSON only:
{"intents":[...],"clarification":null}

Each intent:
{
  "action": "exclude_card" | "exclude_machine" | "restore_card" | "restore_machine" | "set_card_max" | "set_card_min" | "rest_card" | "prefer_machine" | "add_machine" | "add_card" | "set_global_max",
  "resourceType": "card" | "machine" | "config" | null,
  "resourceId": number | null,
  "value": number | null,
  "scope": "this_cycle" | "n_cycles" | "until_cleared" | "permanent",
  "nCycles": number | null,
  "summary": string,
  "confidence": number
}

Scope rules:
- "this cycle" / "next cycle" / unspecified short exclusion → this_cycle
- "for N cycles" / "rest N cycles" → n_cycles with nCycles
- "until I say" / "blocked" / "down" / "don't use anymore" → until_cleared
- "from now on" / "permanently" / "we now have another machine" → permanent
If ambiguous, use this_cycle and say so in summary. Never silently choose permanent.
If the message is unclear, return {"intents":[],"clarification":"short question"}.
Amounts are ZAR. "R12k" is 12000.
Cards are numbered 1..${context.state.cards.length}. Machines are numbered 1..${context.state.machines.length}.`

  const user = `Current awaiting cycle: ${context.cycleNumber}
Current route:
${context.assignments.map((row) => `Card ${row.cardId} → Machine ${row.machineId} — R${row.amount}`).join('\n') || '(none)'}
Active constraints:
${active.length ? active.map((row) => `${row.action} ${row.resourceId} ${row.scope}`).join('\n') : '(none)'}

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
      max_tokens: 700,
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
      clarification: 'I could not parse that. Try naming a card or machine and what to change.',
      interpreter: 'llm',
    }
  }
  const intents = Array.isArray(parsed.intents)
    ? parsed.intents.map((row) => sanitizeIntent(row)).filter((row): row is RoutingIntent => Boolean(row))
    : []
  const clarification =
    typeof parsed.clarification === 'string' && parsed.clarification.trim()
      ? parsed.clarification.trim()
      : null
  return { intents, clarification, interpreter: 'llm' }
}

export async function interpretAdminFeedback(
  message: string,
  context: InterpretContext
): Promise<InterpretResult> {
  const fast = parseFastPath(message)
  if (fast && fast.intents.length) return fast
  return interpretWithLlm(message, context)
}

export { llmApiKey }
