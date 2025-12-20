/**
 * Ama Message Router
 * Phase 2: Script-first, LLM-fallback with tool calling
 */

import { callLLM } from './llmClient'
import { buildAmaSystemPrompt, type PromptContext } from './prompts'
import { AMA_TOOLS } from './tools'

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
  authToken?: string // For tool calls
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

  // Step 4: Build system prompt with context (location-aware, scenario-aware) + tool instructions
  const baseSystemPrompt = buildAmaSystemPrompt(context)
  const systemPrompt = `${baseSystemPrompt}

---

## Tool Access

You have access to tools that let you query Firestore data safely. You may request tools by returning a tool call.

Available tools:
- get_user_wallets: Get user's wallet balances
- get_user_profile: Get user's profile information
- get_payment_by_ref: Get payment details by reference
- list_recent_payments: List recent payments
- search_transactions: Search transactions by status/type
- admin_get_user_by_handle: [ADMIN ONLY] Get user by handle
- admin_search_payments: [ADMIN ONLY] Search payments

Rules:
- When asked about balances, account status, or payments, use tools instead of guessing
- You must NOT access other users' data unless you are in admin mode
- If a tool call is needed, return a tool call (the system will execute it and give you the result)
- After receiving tool results, provide a clear answer to the user
- Maximum 2 tool calls per user message`

  // Step 5: Build messages array (last 10 messages + current)
  const messageHistory = recentMessages
    .slice(-10)
    .map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }))

  // Step 6: Call LLM with tool support (max 2 tool calls)
  let toolCallCount = 0
  const maxToolCalls = 2
  let conversationMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messageHistory,
    { role: 'user' as const, content: messageText },
  ]

  try {
    while (toolCallCount < maxToolCalls) {
      const llmResponse = await callLLM(
        conversationMessages,
        {
          provider: 'openai',
          apiKey,
          model,
          tools: AMA_TOOLS,
        }
      )

      // If LLM returned text (no tool call), we're done
      if (llmResponse.text) {
        return {
          text: llmResponse.text,
          mode: 'LLM',
        }
      }

      // If LLM requested a tool call
      if (llmResponse.toolCall) {
        toolCallCount++
        console.log('[Ama Router] Tool call requested', {
          tool: llmResponse.toolCall.name,
          args: llmResponse.toolCall.arguments,
          count: toolCallCount,
        })

        // Execute tool via API endpoint
        if (!params.authToken) {
          console.warn('[Ama Router] No auth token provided, cannot execute tool')
          return {
            text: "I need to check that for you, but I'm missing authentication. Please try again.",
            mode: 'LLM',
          }
        }

        try {
          // For server-side requests, use NEXT_PUBLIC_APP_URL or construct from request
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const toolResponse = await fetch(`${baseUrl}/api/ama/tools`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${params.authToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tool: llmResponse.toolCall.name,
              args: llmResponse.toolCall.arguments,
            }),
          })

          if (!toolResponse.ok) {
            const error = await toolResponse.json().catch(() => ({ error: 'Tool execution failed' }))
            throw new Error(error.error || 'Tool execution failed')
          }

          const toolData = await toolResponse.json()
          
          // Add assistant message with tool call (OpenAI format)
          conversationMessages.push({
            role: 'assistant',
            content: null, // null when tool is called
            tool_calls: [
              {
                id: llmResponse.toolCall.id,
                type: 'function',
                function: {
                  name: llmResponse.toolCall.name,
                  arguments: JSON.stringify(llmResponse.toolCall.arguments),
                },
              },
            ],
          } as any)
          
          // Add tool result message
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(toolData.data),
            tool_call_id: llmResponse.toolCall.id,
          } as any)

          // Continue loop to get final answer from LLM
        } catch (toolError: any) {
          console.error('[Ama Router] Tool execution failed:', toolError)
          // Add error to conversation and let LLM handle it
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify({ error: toolError.message || 'Tool execution failed' }),
            tool_call_id: `tool_${toolCallCount}`,
          } as any)
        }
      } else {
        // No tool call and no text - unexpected state
        break
      }
    }

    // If we exhausted tool calls, get final response
    if (toolCallCount >= maxToolCalls) {
      const finalResponse = await callLLM(
        conversationMessages,
        {
          provider: 'openai',
          apiKey,
          model,
          tools: [], // No more tools allowed
        }
      )
      return {
        text: finalResponse.text || "I've checked the information, but I'm having trouble formulating a response. Please try rephrasing your question.",
        mode: 'LLM',
      }
    }

    // Fallback
    return {
      text: "I'm having trouble processing that right now. Please try again.",
      mode: 'SCRIPTED',
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


