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
  toolCall?: {
    name: string
    arguments: Record<string, any>
    id: string
  }
}

export type LLMConfig = {
  provider: 'openai'
  apiKey: string
  model: string
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, any>
    }
  }>
}

/**
 * Call LLM with messages array
 * Returns assistant response text
 */
export async function callLLM(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const requestBody: any = {
    model: config.model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 500,
  }
  
  // Add tools if provided
  if (config.tools && config.tools.length > 0) {
    requestBody.tools = config.tools
    requestBody.tool_choice = 'auto' // Let model decide when to use tools
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const message = data.choices[0]?.message || {}
  const text = message.content || ''
  
  // Check for tool calls (OpenAI format)
  const toolCalls = message.tool_calls
  if (toolCalls && toolCalls.length > 0) {
    const toolCall = toolCalls[0] // Use first tool call
    try {
      const args = JSON.parse(toolCall.function.arguments || '{}')
      return {
        text: '', // No text when tool is called
        toolCall: {
          name: toolCall.function.name,
          arguments: args,
          id: toolCall.id, // Include tool call ID for conversation tracking
        },
      }
    } catch (error) {
      // If parsing fails, return text response
      return { text: text || 'I need to check that for you, but encountered an error.' }
    }
  }
  
  if (!text) {
    throw new Error('Empty response from LLM')
  }

  return { text }
}

