/**
 * LLM Client - Minimal OpenAI-compatible implementation
 * Phase 2: First real LLM responses
 */

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LLMResponse = {
  text: string
}

export type LLMConfig = {
  provider: 'openai'
  apiKey: string
  model: string
}

/**
 * Call LLM with messages array
 * Returns assistant response text
 */
export async function callLLM(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.7,
      max_tokens: 500,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const text = data.choices[0]?.message?.content || ''
  
  if (!text) {
    throw new Error('Empty response from LLM')
  }

  return { text }
}

