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
  scope: 'this_cycle' | 'n_cycles' | 'until_cleared' | 'permanent'
  nCycles: number | null
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

type InterpretContext = {
  cycleNumber: number
  cardCount: number
  machineCount: number
  assignments: Array<{ cardId: number; machineId: number; amount: number }>
  activeConstraints: string[]
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
      data.scope === 'n_cycles' || data.scope === 'until_cleared' || data.scope === 'permanent'
        ? data.scope
        : 'this_cycle',
    nCycles: typeof data.nCycles === 'number' ? data.nCycles : null,
    summary: typeof data.summary === 'string' ? data.summary : data.action,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
  }
}

export async function interpretRoutingFeedbackWithOpenAI(
  message: string,
  context: InterpretContext
): Promise<InterpretResult> {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured')
  }
  const system = `You convert an admin's natural-language routing feedback into JSON constraints.
The routing engine is deterministic. You only interpret intent. You never invent a route.
Return JSON only: {"intents":[...],"clarification":null}
Each intent needs action, resourceType, resourceId, value, scope (this_cycle|n_cycles|until_cleared|permanent), nCycles, summary, confidence.
If ambiguous, use this_cycle. Never silently choose permanent.
If unclear, return {"intents":[],"clarification":"short question"}.
Cards are 1..${context.cardCount}. Machines are 1..${context.machineCount}. Amounts are ZAR.`

  const user = `Current awaiting cycle: ${context.cycleNumber}
Current route:
${context.assignments.map((row) => `Card ${row.cardId} → Machine ${row.machineId} — R${row.amount}`).join('\n') || '(none)'}
Active constraints:
${context.activeConstraints.length ? context.activeConstraints.join('\n') : '(none)'}

Admin message:
${message}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
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
  return {
    intents,
    clarification:
      typeof parsed.clarification === 'string' && parsed.clarification.trim()
        ? parsed.clarification.trim()
        : null,
    interpreter: 'llm',
  }
}
