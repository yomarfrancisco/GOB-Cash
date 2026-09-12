/**
 * Explicit Ask intents. Classification happens before any proposal path.
 * Regex is a fast path only. LLM is the primary understanding layer.
 */

import { isFrictionNoteReply } from './friction'
import { llmApiKey, llmModel } from './interpretFeedback'
import { cardShortName, machineShortName, resolveNamedCardIds, resolveNamedMachineIds } from './inventory'
import {
  isDeskStrategyAsk,
  isFrictionAsk,
  isLedgerFactAsk,
  isPaceAsk,
  isPosRankingAsk,
  isSettlementAsk,
  namesConstraintChange,
  wantsNewRoutingRun,
} from './routingTime'

function namesObviousConstraint(message: string): boolean {
  if (namesConstraintChange(message)) return true
  const text = stem(message)
  const cards = resolveNamedCardIds(message)
  if (/\b(park|retire)\b/.test(text) && cards.length) return true
  if (/\buse\b/.test(text) && /\bnext(?: time)?\b/.test(text) && cards.length) return true
  if (/\b(none of them|none are|none is safe|new consortium|new card|park them|park everything|wait for a new card)\b/.test(text)) {
    return true
  }
  if (cards.length >= 2 && /\b(or|and)\b/.test(text) && !isInterrogativeAsk(message) && text.split(/\s+/).length <= 8) {
    return true
  }
  return false
}

export type AskIntent =
  | 'ledger_fact'
  | 'ledger_aggregate'
  | 'historical_explanation'
  | 'friction_question'
  | 'current_route_question'
  | 'constraint_request'
  | 'execution_status'
  | 'unrelated'
  | 'ambiguous'

export type AskClassification = {
  intent: AskIntent
  confidence: number
  source: 'fast_path' | 'llm'
  cardIds: number[]
  machineIds: number[]
  reason: string
}

export const ASK_INTENT_MIN_CONFIDENCE = 0.62

const INTENTS: AskIntent[] = [
  'ledger_fact',
  'ledger_aggregate',
  'historical_explanation',
  'friction_question',
  'current_route_question',
  'constraint_request',
  'execution_status',
  'unrelated',
  'ambiguous',
]

function stem(message: string): string {
  return message.trim().toLowerCase().replace(/^(?:ok|okay|alright)[,.]?\s+/, '')
}

function entities(message: string): { cardIds: number[]; machineIds: number[] } {
  return {
    cardIds: resolveNamedCardIds(message),
    machineIds: resolveNamedMachineIds(message),
  }
}

function classified(
  intent: AskIntent,
  message: string,
  confidence: number,
  reason: string,
  source: AskClassification['source'] = 'fast_path'
): AskClassification {
  return { intent, confidence, source, reason, ...entities(message) }
}

export function isInterrogativeAsk(message: string): boolean {
  const text = stem(message)
  if (!text) return false
  if (/\?/.test(message)) return true
  return /^(why|when|where|who|what|which|how|have|has|had|did|do|does|is|are|was|were|can|could|would|should)\b/.test(
    text
  )
}

export function guardConstraintOnQuestions(message: string, row: AskClassification): AskClassification {
  if (row.intent !== 'constraint_request') return row
  if (!isInterrogativeAsk(message)) return row
  if (namesObviousConstraint(message) || namesConstraintChange(message)) return row
  return classified(
    /\b(last time|previously|before|did we choose|did we pick|why did we)\b/.test(stem(message))
      ? 'historical_explanation'
      : 'ambiguous',
    message,
    Math.min(row.confidence, 0.55),
    'A question that names a card or POS is not a routing change unless it also names a constraint.',
    row.source
  )
}

export function classifyAskIntentFast(
  message: string,
  extra: { pendingKind?: string | null } = {}
): AskClassification | null {
  const text = stem(message)
  if (!text) return classified('ambiguous', message, 0.2, 'empty')
  const named = entities(message)
  const words = text.split(/\s+/).length

  if (isFrictionNoteReply(message)) {
    return classified('friction_question', message, 0.9, 'typed review note')
  }
  if (namesObviousConstraint(message) && !isInterrogativeAsk(message)) {
    return classified('constraint_request', message, 0.92, 'explicit constraint verb')
  }
  if (wantsNewRoutingRun(message)) {
    return classified('execution_status', message, 0.9, 'start next run')
  }
  if (extra.pendingKind === 'which_card_safe' && named.cardIds.length && words <= 6 && !isInterrogativeAsk(message)) {
    return classified('constraint_request', message, 0.9, 'card named to answer which-card-safe')
  }
  if (
    named.cardIds.length &&
    words <= 3 &&
    !isInterrogativeAsk(message) &&
    extra.pendingKind === 'which_card_safe'
  ) {
    return classified('constraint_request', message, 0.88, 'short card reply')
  }

  if (isFrictionAsk(message) && !/\b(last time|previously|did we choose)\b/.test(text)) {
    return classified('friction_question', message, 0.88, 'friction phrase')
  }
  if (isLedgerFactAsk(message)) {
    return classified('ledger_fact', message, 0.9, 'exact ledger lookup')
  }
  if (isPosRankingAsk(message) && !/\b(last time|previously|before)\b/.test(text)) {
    return classified('current_route_question', message, 0.86, 'why this open POS')
  }
  if (isDeskStrategyAsk(message) || isPaceAsk(message)) {
    return classified('current_route_question', message, 0.86, 'open-route / pace question')
  }
  if (isSettlementAsk(message)) {
    return classified('ledger_aggregate', message, 0.84, 'weekly settlement totals')
  }

  if (
    /\b(why|how come)\b/.test(text) &&
    /\b(last time|previously|before|did we (?:choose|pick|use|select)|the last (?:restock|swipe|pair))\b/.test(text)
  ) {
    return classified('historical_explanation', message, 0.86, 'why a past pair was chosen')
  }
  if (
    (/\b(today|tonight|this week)\b/.test(text) &&
      /\b(pos|merchant|volume|heavily|leaning|concentration|any one|too much)\b/.test(text) &&
      isInterrogativeAsk(message))
  ) {
    return classified('ledger_aggregate', message, 0.84, 'POS concentration in a window')
  }

  return null
}

async function classifyAskIntentLlm(message: string, extra: { pendingKind?: string | null }): Promise<AskClassification> {
  const apiKey = llmApiKey()
  if (!apiKey) {
    return classified('ambiguous', message, 0.3, 'LLM unavailable; no safe fast-path match')
  }
  const named = entities(message)
  const system = `You classify one FX Desk Ask message. Return JSON only:
{"intent":"...","confidence":0.0,"reason":"..."}

intent must be exactly one of:
ledger_fact — exact row lookup (last swipe, last use of a named card/POS, did we use X today)
ledger_aggregate — totals, shares, concentration across POS/cards in a window
historical_explanation — why a past route/pair was chosen; mentions last time / previously
friction_question — review risk, merchant age, BIM/Capitec cases, unusual vs baseline
current_route_question — explain the open restock or sale, or what's next on that instruction
constraint_request — the admin is changing inventory: rest, exclude, restore, cap, prefer, park, use X next
execution_status — start the next run, or whether a swipe/sale is awaiting
unrelated — not desk routing
ambiguous — cannot tell; needs a clarification

Rules:
- Naming a card or POS is not a constraint by itself.
- Questions (why/when/have/did/is) are never constraint_request unless they also command a change (park, rest, don't use, restore, cap, prefer).
- "Use Ginav next time" is constraint_request.
- "Why did we choose FNB IMANI for Ginav last time?" is historical_explanation.
- "Have we been leaning too heavily on any one POS today?" is ledger_aggregate.
- Pending question which_card_safe plus a bare card name is constraint_request.
- If unsure, use ambiguous and confidence below 0.6.`

  const user = `Pending desk question: ${extra.pendingKind || 'none'}
Named cards: ${named.cardIds.map((id) => cardShortName(id)).join(', ') || 'none'}
Named POS: ${named.machineIds.map((id) => machineShortName(id)).join(', ') || 'none'}

Admin:
${message}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llmModel(),
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!response.ok) {
    return classified('ambiguous', message, 0.3, 'LLM classify failed')
  }
  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  try {
    const parsed = JSON.parse(text) as { intent?: string; confidence?: number; reason?: string }
    const intent = INTENTS.includes(parsed.intent as AskIntent) ? (parsed.intent as AskIntent) : 'ambiguous'
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5
    return guardConstraintOnQuestions(
      message,
      classified(intent, message, confidence, parsed.reason || 'llm', 'llm')
    )
  } catch {
    return classified('ambiguous', message, 0.3, 'LLM returned invalid JSON', 'llm')
  }
}

export async function classifyAskIntent(
  message: string,
  extra: { pendingKind?: string | null } = {}
): Promise<AskClassification> {
  const fast = classifyAskIntentFast(message, extra)
  if (fast) return guardConstraintOnQuestions(message, fast)
  const llm = await classifyAskIntentLlm(message, extra)
  if (llm.confidence < ASK_INTENT_MIN_CONFIDENCE) {
    return classified('ambiguous', message, llm.confidence, llm.reason || 'low confidence', llm.source)
  }
  return llm
}

export function mayMutateRoute(intent: AskIntent): boolean {
  return intent === 'constraint_request'
}

export function enforceReadOnlyAdvice<T extends { kind: string; options?: unknown; recommendedOptionId?: unknown }>(
  intent: AskIntent,
  advice: T
): T {
  if (mayMutateRoute(intent)) return advice
  return {
    ...advice,
    kind: advice.kind === 'options' ? 'next_step' : advice.kind,
    options: undefined,
    recommendedOptionId: undefined,
  }
}
