/**
 * Ama Message Router
 * Phase 2: Script-first, LLM-fallback
 */

import { callLLM } from './llmClient'
import { buildAmaSystemPrompt, type PromptContext } from './prompts'

export type AmaResponse = {
  text: string
  mode: 'SCRIPTED' | 'LLM'
}

export type RouteAmaMessageParams = {
  threadId: string
  userId: string
  messageText: string
  recentMessages?: Array<{ role: 'user' | 'assistant', text: string }>
  context?: PromptContext
}

/**
 * Route Ama message: try scripted response first, fall back to LLM
 */
export async function routeAmaMessage(
  params: RouteAmaMessageParams
): Promise<AmaResponse> {
  const { messageText, recentMessages = [], context } = params

  // Step 1: Try scripted response (minimal for now - can be expanded)
  const scriptedResponse = getScriptedResponse(messageText)
  if (scriptedResponse) {
    return {
      text: scriptedResponse,
      mode: 'SCRIPTED',
    }
  }

  // Step 2: Check if LLM is enabled
  const llmEnabled = process.env.LLM_ENABLED === 'true'
  if (!llmEnabled) {
    // Fallback to generic response if LLM disabled
    return {
      text: "I'm here to help! You can ask me about deposits, payments, or connecting to agents.",
      mode: 'SCRIPTED',
    }
  }

  // Step 3: Get LLM config from env vars
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  
  if (!apiKey) {
    console.warn('[Ama Router] LLM_API_KEY not set, falling back to scripted response')
    return {
      text: "I'm here to help! You can ask me about deposits, payments, or connecting to agents.",
      mode: 'SCRIPTED',
    }
  }

  // Step 4: Build system prompt with context (location-aware, scenario-aware)
  const systemPrompt = buildAmaSystemPrompt(context)

  // Step 5: Build messages array (last 10 messages + current)
  const messageHistory = recentMessages
    .slice(-10)
    .map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }))

  // Step 6: Call LLM
  try {
    const llmResponse = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        ...messageHistory,
        { role: 'user', content: messageText },
      ],
      {
        provider: 'openai',
        apiKey,
        model,
      }
    )

    return {
      text: llmResponse.text,
      mode: 'LLM',
    }
  } catch (error: any) {
    console.error('[Ama Router] LLM call failed:', error)
    // Fallback to generic response on error
    return {
      text: "I'm having trouble processing that right now. Please try again.",
      mode: 'SCRIPTED',
    }
  }
}

/**
 * Get scripted response if message matches known patterns
 */
function getScriptedResponse(messageText: string): string | null {
  const lower = messageText.toLowerCase().trim()
  
  // Minimal scripted responses (can be expanded)
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return "Hi! I'm Ama, your Portfolio Manager. How can I help you today?"
  }
  
  if (lower.includes('bye') || lower.includes('goodbye') || lower.includes('thanks')) {
    return "You're welcome! Feel free to reach out anytime."
  }
  
  // No scripted response found
  return null
}


