/**
 * Ama Message Router
 * Phase 2: Script-first, LLM-fallback with tool calling
 */

import { callLLM } from './llmClient'
import { buildAmaSystemPrompt, type PromptContext } from './prompts'
import { AMA_TOOLS } from './tools'
import { executeTool } from './toolsExecutor'
import { getAdminAuth } from '@/lib/firebaseAdmin'

export type AmaResponse = {
  text: string
  mode: 'SCRIPTED' | 'LLM'
  toolsInvoked?: boolean // Whether tools were invoked
}

export type RouteAmaMessageParams = {
  threadId: string
  userId: string
  messageText: string
  recentMessages?: Array<{ role: 'user' | 'assistant', text: string }>
  context?: PromptContext
  authToken?: string // For tool calls (used to verify and get uid)
  decodedUid?: string // Pre-verified UID (optional, for direct calls)
  decodedIsAdmin?: boolean // Pre-verified admin status (optional)
  requestId?: string // Request ID for error messages
}

/**
 * Handle balance intent (fast-path, NO LLM)
 * Detects balance queries and directly calls get_user_wallets
 */
async function handleBalanceIntent(
  params: RouteAmaMessageParams
): Promise<AmaResponse | null> {
  const { messageText, authToken, decodedUid, requestId } = params
  
  // Intent detection
  const t = messageText.toLowerCase()
  const isBalanceQuery =
    t.includes('balance') ||
    t.includes('zar balance') ||
    (t.includes('my zar') && t.includes('balance')) ||
    (t.includes('wallet') && (t.includes('zar') || t.includes('cashzar')))
  
  if (!isBalanceQuery) {
    return null // Not a balance query, continue normal flow
  }
  
  // Need auth token and uid to fetch wallets
  let uid = decodedUid
  
  if (!uid && authToken) {
    try {
      const auth = getAdminAuth()
      const decoded = await auth.verifyIdToken(authToken)
      uid = decoded.uid
    } catch (tokenError: any) {
      return {
        text: requestId
          ? `You're not signed in (requestId: ${requestId}). Please sign in and try again.`
          : "You're not signed in. Please sign in and try again.",
        mode: 'SCRIPTED',
      }
    }
  }
  
  if (!uid) {
    return {
      text: requestId
        ? `You're not signed in (requestId: ${requestId}). Please sign in and try again.`
        : "You're not signed in. Please sign in and try again.",
      mode: 'SCRIPTED',
    }
  }
  
  // Call tools executor directly (same internal path as LLM tool calls)
  try {
    const toolResult = await executeTool({
      uid,
      isAdmin: false, // Balance queries don't need admin
      toolName: 'get_user_wallets',
      args: {},
    })
    
    if (!toolResult.ok) {
      return {
        text: requestId
          ? `I couldn't fetch your wallets (requestId: ${requestId}). Please try again.`
          : "I couldn't fetch your wallets. Please try again.",
        mode: 'SCRIPTED',
      }
    }
    
    const wallets = toolResult.data as Record<string, any>
    
    // Find cashZAR wallet
    let cashZAR: any = null
    for (const [walletId, walletData] of Object.entries(wallets)) {
      if (walletId === 'cashZAR' || walletData?.displayCurrency === 'ZAR') {
        cashZAR = walletData
        break
      }
    }
    
    // If no cashZAR found, check all wallets for ZAR currency
    if (!cashZAR) {
      for (const [walletId, walletData] of Object.entries(wallets)) {
        if (walletData?.displayCurrency === 'ZAR' || walletId.toLowerCase().includes('zar')) {
          cashZAR = walletData
          break
        }
      }
    }
    
    if (!cashZAR) {
      return {
        text: "I couldn't find your ZAR wallet. Please make sure you have a ZAR wallet set up.",
        mode: 'SCRIPTED',
      }
    }
    
    const balance = cashZAR.fiatBalance || 0
    const locked = cashZAR.lockedBalance || 0
    
    // Format balance with thousands separator
    const formattedBalance = new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2,
    }).format(balance)
    
    const formattedLocked = locked > 0
      ? new Intl.NumberFormat('en-ZA', {
          style: 'currency',
          currency: 'ZAR',
          minimumFractionDigits: 2,
        }).format(locked)
      : null
    
    const responseText = formattedLocked
      ? `Your ZAR balance is ${formattedBalance}. Locked: ${formattedLocked}.`
      : `Your ZAR balance is ${formattedBalance}.`
    
    return {
      text: responseText,
      mode: 'SCRIPTED',
    }
  } catch (error: any) {
    console.error('[Ama Router] Balance intent failed:', error)
    return {
      text: requestId
        ? `I couldn't fetch your wallets (requestId: ${requestId}). Please try again.`
        : "I couldn't fetch your wallets. Please try again.",
      mode: 'SCRIPTED',
    }
  }
}

/**
 * Route Ama message: try scripted response first, fall back to LLM
 */
export async function routeAmaMessage(
  params: RouteAmaMessageParams
): Promise<AmaResponse> {
  const { messageText, recentMessages = [], context, requestId } = params

  // Step 0: Check for balance intent (fast-path, NO LLM)
  const balanceResponse = await handleBalanceIntent(params)
  if (balanceResponse) {
    return balanceResponse
  }

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
  let toolsInvoked = false
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
          toolsInvoked,
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

        // Execute tool directly (no HTTP call)
        // Verify token and get uid if not already provided
        let uid = params.decodedUid
        let isAdmin = params.decodedIsAdmin ?? false

        if (!uid && params.authToken) {
          try {
            const auth = getAdminAuth()
            const decoded = await auth.verifyIdToken(params.authToken)
            uid = decoded.uid
            
            // Check admin status
            const adminUids = (process.env.AMA_ADMIN_UIDS || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
            isAdmin = adminUids.includes(uid)
          } catch (tokenError: any) {
            console.error('[Ama Router] Token verification failed:', tokenError.message)
            return {
              text: process.env.NODE_ENV !== 'production' 
                ? `Tool error: verifyIdToken failed: ${tokenError.message}`
                : "I need to check that for you, but I'm missing authentication. Please try again.",
              mode: 'LLM',
            }
          }
        }

        if (!uid) {
          console.warn('[Ama Router] No uid available, cannot execute tool')
          return {
            text: "I need to check that for you, but I'm missing authentication. Please try again.",
            mode: 'LLM',
          }
        }

        try {
          // Execute tool directly (no HTTP)
          const toolResult = await executeTool({
            uid,
            isAdmin,
            toolName: llmResponse.toolCall.name as any,
            args: llmResponse.toolCall.arguments,
          })

          if (!toolResult.ok) {
            throw new Error(toolResult.error || 'Tool execution failed')
          }

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
            content: JSON.stringify(toolResult.data),
            tool_call_id: llmResponse.toolCall.id,
          } as any)
          
          // Mark that tools were invoked
          toolsInvoked = true

          // Continue loop to get final answer from LLM
        } catch (toolError: any) {
          const errorRequestId = params.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(7)}`
          console.error('[Ama Router] Tool execution failed:', {
            requestId: errorRequestId,
            tool: llmResponse.toolCall.name,
            error: toolError.message,
            status: toolError.status || 500,
          })
          
          // Check if it's an auth error (401)
          if (toolError.status === 401 || toolError.message?.includes('auth') || toolError.message?.includes('token')) {
            return {
              text: errorRequestId
                ? `Auth token missing/expired (requestId: ${errorRequestId}) — please sign in again.`
                : "Auth token missing/expired — please sign in again.",
              mode: 'LLM',
            }
          }
          
          // Surface tool error to user (truncated for safety)
          const errorMessage = toolError.message || 'Tool execution failed'
          const truncatedError = errorMessage.length > 200 
            ? errorMessage.substring(0, 200) + '...' 
            : errorMessage
          
          // Return user-friendly error message with requestId
          return {
            text: errorRequestId
              ? `Tool error (requestId: ${errorRequestId}): ${truncatedError}. I can't access data right now.`
              : `Tool error: ${truncatedError}. I can't access data right now.`,
            mode: 'LLM',
          }
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
        toolsInvoked,
      }
    }

    // Fallback
    return {
      text: params.requestId
        ? `I'm having trouble processing that right now (requestId: ${params.requestId}). Please try again.`
        : "I'm having trouble processing that right now. Please try again.",
      mode: 'SCRIPTED',
      toolsInvoked,
    }
  } catch (error: any) {
    console.error('[Ama Router] LLM call failed:', error)
    // Fallback to generic response on error
    return {
      text: params.requestId
        ? `I'm having trouble processing that right now (requestId: ${params.requestId}). Please try again.`
        : "I'm having trouble processing that right now. Please try again.",
      mode: 'SCRIPTED',
      toolsInvoked,
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


