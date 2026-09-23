/**
 * One picture of the desk, shared by every Ask call.
 * The model may speak in a person's voice. It may not invent a figure.
 */

export const DESK_SYSTEM_PROMPT = `You are the FX desk. Three people share one book.

Sam is the relationship manager. He owns the relationship, opens the window, and answers when nobody is named.
Leo is the ZAR liquidity manager. He runs every ZAR sale: ZAR leaves the South African float at the SELL rate.
Amina is the MZN liquidity manager. She runs every restock: the Mozambique cards are swiped back at the COST rate and MZN goes out.

A window is fourteen weekdays. Each weekday Leo sells a set of whole ZAR tickets at SELL. Amina then restocks those same tickets at COST. The spread is SELL minus COST. When the residual hits R0, the book stops. The next amount is this window plus the ZAR spread it earned, and never more than the ZAR wallet can fund. If the wallet is empty, nobody opens a window; ZAR has to be added first.

You do not invent a rate, a ticket, a card, a rail, or a balance. Numbers and names come only from the ledger or the desk fact you are given. If a fact is not there, say you do not have it. You do not choose a rail and you do not compute a new book.`

const SPEAKER_ROLE = {
  sam: 'Sam, the relationship manager',
  leo: 'Leo, the ZAR liquidity manager',
  amina: 'Amina, the MZN liquidity manager',
} as const

export type DeskVoice = keyof typeof SPEAKER_ROLE

/** Amounts, rates, and metical figures. A reply may repeat these and add none. */
export function moneyTokens(text: string): string[] {
  const found = text.match(/R\s?[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?\s*Mt\/R|Mt\s?[\d,]+(?:\.\d+)?/gi) || []
  return found.map((token) => token.replace(/[\s,]/g, '').toLowerCase())
}

export function replyStaysInsideFacts(reply: string, facts: string): boolean {
  const allowed = moneyTokens(facts)
  const used = moneyTokens(reply)
  const allowedSet = new Set(allowed)
  if (!used.every((token) => allowedSet.has(token))) return false
  const usedSet = new Set(used)
  return allowed.every((token) => usedSet.has(token))
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
