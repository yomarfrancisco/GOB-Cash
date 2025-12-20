/**
 * Ama Message Router
 * Phase 2: Script-first, LLM-fallback with tool calling
 */

import { callLLM } from './llmClient'
import { buildAmaSystemPrompt, type PromptContext } from './prompts'
import { AMA_TOOLS } from './tools'
import { executeTool } from './toolsExecutor'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { classifyIntent, extractCurrency, type AmaIntent } from './intents'
import { routeIntent } from './intentRouter'
import { renderWallets, renderProfile, renderPayments, renderPayment } from './renderers'

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
 * Validate LLM response and auto-retry if needed
 */
async function validateAndRetryIfNeeded(
  messageText: string,
  toolName: string,
  toolData: any,
  params: RouteAmaMessageParams
): Promise<{ shouldRetry: boolean; reason?: string; correctedData?: any }> {
  const lower = messageText.toLowerCase()
  
  // Check if user asked for BTC/ETH but response contains ZAR or omits BTC/ETH
  if (toolName === 'get_user_wallets' && (lower.includes('btc') || lower.includes('eth'))) {
    const walletsArray = Array.isArray(toolData) ? toolData : Object.values(toolData)
    const hasBtc = walletsArray.some((w: any) => 
      (w.displayCurrency === 'BTC' || w.walletId?.toLowerCase() === 'btc')
    )
    const hasEth = walletsArray.some((w: any) => 
      (w.displayCurrency === 'ETH' || w.walletId?.toLowerCase() === 'eth')
    )
    const hasZar = walletsArray.some((w: any) => 
      (w.displayCurrency === 'ZAR' || w.walletId?.toLowerCase().includes('zar'))
    )
    
    // If asking for BTC/ETH but response has ZAR or missing BTC/ETH, filter to only requested currencies
    if ((lower.includes('btc') && !hasBtc) || (lower.includes('eth') && !hasEth) || (hasZar && (lower.includes('btc') || lower.includes('eth')))) {
      const requestedCurrencies: string[] = []
      if (lower.includes('btc') || lower.includes('bitcoin')) requestedCurrencies.push('BTC')
      if (lower.includes('eth') || lower.includes('ethereum')) requestedCurrencies.push('ETH')
      
      const filtered = walletsArray.filter((w: any) => 
        requestedCurrencies.includes(w.displayCurrency) || 
        requestedCurrencies.some(c => w.walletId?.toLowerCase() === c.toLowerCase())
      )
      
      return {
        shouldRetry: true,
        reason: 'Response contained ZAR or missing requested crypto currencies',
        correctedData: filtered,
      }
    }
  }
  
  // Check if user asked for "wallets and balances" but response only has ZAR
  if (toolName === 'get_user_wallets' && (lower.includes('wallets') && lower.includes('balances'))) {
    const walletsArray = Array.isArray(toolData) ? toolData : Object.values(toolData)
    const nonZarWallets = walletsArray.filter((w: any) => 
      w.displayCurrency !== 'ZAR' && !w.walletId?.toLowerCase().includes('zar')
    )
    
    // If only ZAR wallets present, ensure we include all wallets (even zeros)
    if (nonZarWallets.length === 0 && walletsArray.length === 1) {
      // This is fine - user might only have ZAR wallet
      return { shouldRetry: false }
    }
    
    // If we have multiple wallets but response only shows ZAR, return all
    if (walletsArray.length > 1 && walletsArray.every((w: any) => w.displayCurrency === 'ZAR' || w.walletId?.toLowerCase().includes('zar'))) {
      // This shouldn't happen if we're returning all wallets, but just in case
      return { shouldRetry: false }
    }
  }
  
  return { shouldRetry: false }
}

/**
 * Get uid from params (verify token if needed)
 */
async function getUidFromParams(params: RouteAmaMessageParams): Promise<string | null> {
  let uid = params.decodedUid
  
  if (!uid && params.authToken) {
    try {
      const auth = getAdminAuth()
      const decoded = await auth.verifyIdToken(params.authToken)
      uid = decoded.uid
    } catch (tokenError: any) {
      return null
    }
  }
  
  return uid || null
}

/**
 * Format timestamp to human-readable or ISO
 */
function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Unknown'
  
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Unknown'
    
    // Human-readable format: "Dec 20, 2025 at 10:30 AM"
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return timestamp // Fallback to ISO string
  }
}

/**
 * Handle deterministic intents (bypass LLM)
 */
async function handleDeterministicIntent(
  intent: AmaIntent,
  params: RouteAmaMessageParams
): Promise<AmaResponse | null> {
  if (intent === 'UNKNOWN') {
    return null // Fall through to LLM
  }

  const uid = await getUidFromParams(params)
  if (!uid) {
    return {
      text: params.requestId
        ? `You're not signed in (requestId: ${params.requestId}). Please sign in and try again.`
        : "You're not signed in. Please sign in and try again.",
      mode: 'SCRIPTED',
    }
  }

  try {
    // PROFILE_HANDLE_EMAIL
    if (intent === 'PROFILE_HANDLE_EMAIL') {
      const toolResult = await executeTool({
        uid,
        isAdmin: false,
        toolName: 'get_user_profile',
        args: {},
      })

      if (!toolResult.ok) {
        return {
          text: params.requestId
            ? `I couldn't fetch your profile (requestId: ${params.requestId}). Please try again.`
            : "I couldn't fetch your profile. Please try again.",
          mode: 'SCRIPTED',
        }
      }

      const profile = toolResult.data as Record<string, any>
      const handle = profile.handle || 'Not set'
      const email = profile.email || 'Not set'

      return {
        text: `Handle: ${handle}\nEmail: ${email}`,
        mode: 'SCRIPTED',
      }
    }

    // USER_SNAPSHOT
    if (intent === 'USER_SNAPSHOT') {
      const toolResult = await executeTool({
        uid,
        isAdmin: false,
        toolName: 'get_user_snapshot',
        args: {},
      })

      if (!toolResult.ok) {
        return {
          text: params.requestId
            ? `I couldn't fetch your snapshot (requestId: ${params.requestId}). Please try again.`
            : "I couldn't fetch your snapshot. Please try again.",
          mode: 'SCRIPTED',
        }
      }

      const snapshot = toolResult.data as { profile: any; wallets: any[]; recentPayments: any[] }
      
      // Format snapshot
      const profileLines = snapshot.profile
        ? [`Handle: ${snapshot.profile.handle || 'Not set'}`, `Email: ${snapshot.profile.email || 'Not set'}`]
        : []
      
      const walletLines = snapshot.wallets.map(w => {
        const currency = w.displayCurrency || w.walletId
        const balance = currency === 'ZAR'
          ? new Intl.NumberFormat('en-ZA', {
              style: 'currency',
              currency: 'ZAR',
              minimumFractionDigits: 2,
            }).format(w.fiatBalance || 0)
          : `${w.usdtBalance || 0} ${currency}`
        return `${currency}: ${balance}`
      })
      
      const paymentLines = snapshot.recentPayments.length > 0
        ? [`\nRecent payments: ${snapshot.recentPayments.length} payment(s)`]
        : []
      
      return {
        text: `Portfolio Snapshot:\n${profileLines.join('\n')}\n\nWallets:\n${walletLines.join('\n')}${paymentLines.join('\n')}`,
        mode: 'SCRIPTED',
      }
    }

    // All wallet-related intents need get_user_wallets
    if (['WALLET_BALANCE_SINGLE', 'WALLETS_LIST', 'CRYPTO_BALANCE_PAIR', 'WALLET_APYS'].includes(intent)) {
      const toolResult = await executeTool({
        uid,
        isAdmin: false,
        toolName: 'get_user_wallets',
        args: {},
      })

      if (!toolResult.ok) {
        return {
          text: params.requestId
            ? `I couldn't fetch your wallets (requestId: ${params.requestId}). Please try again.`
            : "I couldn't fetch your wallets. Please try again.",
          mode: 'SCRIPTED',
        }
      }

      const wallets = toolResult.data as Record<string, any>
      const walletsArray = Object.entries(wallets).map(([walletId, data]) => ({
        walletId,
        ...data,
      }))

      // WALLET_BALANCE_SINGLE
      if (intent === 'WALLET_BALANCE_SINGLE') {
        const currency = extractCurrency(params.messageText) || 'ZAR'
        
        // Find wallet matching currency
        let wallet = walletsArray.find(
          w => w.displayCurrency === currency || w.walletId.toLowerCase().includes(currency.toLowerCase())
        )

        // Default to ZAR if not found
        if (!wallet && currency === 'ZAR') {
          wallet = walletsArray.find(
            w => w.walletId === 'cashZAR' || w.displayCurrency === 'ZAR'
          )
        }

        if (!wallet) {
          return {
            text: `I couldn't find your ${currency} wallet. Please make sure you have a ${currency} wallet set up.`,
            mode: 'SCRIPTED',
          }
        }

        const balance = wallet.displayCurrency === 'ZAR' 
          ? (wallet.fiatBalance || 0)
          : (wallet.usdtBalance || 0)
        
        const formattedBalance = wallet.displayCurrency === 'ZAR'
          ? new Intl.NumberFormat('en-ZA', {
              style: 'currency',
              currency: 'ZAR',
              minimumFractionDigits: 2,
            }).format(balance)
          : `${balance} ${wallet.displayCurrency}`
        
        const updatedAt = formatTimestamp(wallet.updatedAt)
        
        return {
          text: `Your ${wallet.displayCurrency} balance is ${formattedBalance}. Last updated: ${updatedAt}.`,
          mode: 'SCRIPTED',
        }
      }

      // WALLETS_LIST
      if (intent === 'WALLETS_LIST') {
        if (walletsArray.length === 0) {
          return {
            text: "You don't have any wallets set up yet.",
            mode: 'SCRIPTED',
          }
        }

        const lines = walletsArray.map(w => {
          const currency = w.displayCurrency || w.walletId
          const fiatBalance = w.fiatBalance || 0
          const usdtBalance = w.usdtBalance || 0
          const apy = w.apy ? `${w.apy}%` : 'N/A'
          const updatedAt = formatTimestamp(w.updatedAt)
          
          const balance = currency === 'ZAR' 
            ? new Intl.NumberFormat('en-ZA', {
                style: 'currency',
                currency: 'ZAR',
                minimumFractionDigits: 2,
              }).format(fiatBalance)
            : `${usdtBalance} ${currency}`
          
          return `${currency}: ${balance} | APY: ${apy} | Updated: ${updatedAt}`
        })

        return {
          text: `Your wallets:\n${lines.join('\n')}`,
          mode: 'SCRIPTED',
        }
      }

      // CRYPTO_BALANCE_PAIR
      if (intent === 'CRYPTO_BALANCE_PAIR') {
        const btcWallet = walletsArray.find(w => 
          w.displayCurrency === 'BTC' || w.walletId.toLowerCase() === 'btc'
        )
        const ethWallet = walletsArray.find(w => 
          w.displayCurrency === 'ETH' || w.walletId.toLowerCase() === 'eth'
        )

        const btcBalance = btcWallet?.usdtBalance || 0
        const ethBalance = ethWallet?.usdtBalance || 0
        const btcUpdated = formatTimestamp(btcWallet?.updatedAt)
        const ethUpdated = formatTimestamp(ethWallet?.updatedAt)

        return {
          text: `BTC: ${btcBalance} BTC (updated: ${btcUpdated})\nETH: ${ethBalance} ETH (updated: ${ethUpdated})`,
          mode: 'SCRIPTED',
        }
      }

      // WALLET_APYS
      if (intent === 'WALLET_APYS') {
        if (walletsArray.length === 0) {
          return {
            text: "You don't have any wallets set up yet.",
            mode: 'SCRIPTED',
          }
        }

        const lines = walletsArray.map(w => {
          const currency = w.displayCurrency || w.walletId
          const apy = w.apy ? `${w.apy}%` : '0%'
          return `${currency}: ${apy}`
        })

        return {
          text: `Your wallet APYs:\n${lines.join('\n')}`,
          mode: 'SCRIPTED',
        }
      }
    }

    return null // Should not reach here
  } catch (error: any) {
    console.error('[Ama Router] Deterministic intent failed:', error)
    return {
      text: params.requestId
        ? `I encountered an error (requestId: ${params.requestId}). Please try again.`
        : "I encountered an error. Please try again.",
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

  // Step 0: Try scripted response first (fixes "hi/hello" before intent routing)
  const scriptedResponse = getScriptedResponse(messageText)
  if (scriptedResponse) {
    return {
      text: scriptedResponse,
      mode: 'SCRIPTED',
    }
  }

  // Step 1: Strict intent router (new deterministic path)
  const intentResult = routeIntent(messageText)
  
  // Log intent routing for debugging (with requestId)
  console.log('[Ama Router] routeIntent result', {
    requestId,
    message: messageText,
    intent: intentResult.intent,
    tool: intentResult.tool,
    filters: intentResult.filters,
  })

  // Handle ambiguous queries (only for actual snapshot/portfolio queries)
  if (intentResult.intent === 'ambiguous' && intentResult.clarification) {
    return {
      text: intentResult.clarification,
      mode: 'SCRIPTED',
    }
  }

  // Execute tool if specified
  if (intentResult.tool) {
    const uid = await getUidFromParams(params)
    if (!uid) {
      return {
        text: params.requestId
          ? `You're not signed in (requestId: ${params.requestId}). Please sign in and try again.`
          : "You're not signed in. Please sign in and try again.",
        mode: 'SCRIPTED',
      }
    }

    try {
      let toolResult: any
      
      // Execute the tool
      if (intentResult.tool === 'get_payment_by_ref' && intentResult.filters?.paymentRef) {
        toolResult = await executeTool({
          uid,
          isAdmin: false,
          toolName: 'get_payment_by_ref',
          args: { ref: intentResult.filters.paymentRef },
        })
        
        // Diagnostic log for tool result
        console.log('[Ama Router] toolResult summary', {
          requestId,
          tool: intentResult.tool,
          ok: toolResult?.ok,
          hasError: Boolean(toolResult?.error),
          error: toolResult?.error,
          status: toolResult?.status,
          errorType: (toolResult as any)?.errorType,
        })
        
        if (toolResult.ok) {
          return {
            text: renderPayment(toolResult.data),
            mode: 'SCRIPTED',
          }
        }
      } else if (intentResult.tool === 'list_recent_payments') {
        toolResult = await executeTool({
          uid,
          isAdmin: false,
          toolName: 'list_recent_payments',
          args: { limit: intentResult.filters?.limit || 20 },
        })
        
        if (toolResult.ok) {
          return {
            text: renderPayments(toolResult.data, intentResult.filters),
            mode: 'SCRIPTED',
          }
        }
      } else if (intentResult.tool === 'get_user_profile') {
        toolResult = await executeTool({
          uid,
          isAdmin: false,
          toolName: 'get_user_profile',
          args: {},
        })
        
        if (toolResult.ok) {
          return {
            text: renderProfile(toolResult.data),
            mode: 'SCRIPTED',
          }
        }
      } else if (intentResult.tool === 'get_user_wallets') {
        toolResult = await executeTool({
          uid,
          isAdmin: false,
          toolName: 'get_user_wallets',
          args: {},
        })
        
        if (toolResult.ok) {
          return {
            text: renderWallets(toolResult.data, intentResult.intent as 'wallets_all' | 'wallets_crypto' | 'wallets_apy', intentResult.filters),
            mode: 'SCRIPTED',
          }
        }
      }

      // Tool execution failed
      if (toolResult && !toolResult.ok) {
        // Map structured errors (no raw Firestore errors exposed)
        const errorMessage = toolResult.error || 'Unknown error'
        
        // Check for Firestore index error (only show URL in admin/dev mode)
        if (errorMessage.includes('index') || errorMessage.includes('FAILED_PRECONDITION')) {
          const isAdmin = params.decodedIsAdmin === true
          const isDev = process.env.NODE_ENV !== 'production'
          
          if (isAdmin || isDev) {
            const indexUrlMatch = errorMessage.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)
            const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null
            
            return {
              text: indexUrl
                ? `I need a Firestore index to access that data. Please create the index: ${indexUrl}`
                : `I need a Firestore index to access that data. Please contact support.`,
              mode: 'SCRIPTED',
            }
          } else {
            // User-facing message (no index URL)
            return {
              text: "I'm having trouble accessing that data right now. Please try again later or contact support if the issue persists.",
              mode: 'SCRIPTED',
            }
          }
        }
        
        // Check for permission errors
        if (errorMessage.includes('permission') || errorMessage.includes('PERMISSION_DENIED')) {
          return {
            text: "You don't have permission to access this data.",
            mode: 'SCRIPTED',
          }
        }
        
        // Check for not found errors
        if (errorMessage.includes('not found') || errorMessage.includes('NOT_FOUND')) {
          return {
            text: "I couldn't find that data.",
            mode: 'SCRIPTED',
          }
        }
        
        // Generic error (don't expose raw Firestore errors)
        return {
          text: params.requestId
            ? `I couldn't fetch that data (requestId: ${params.requestId}). Please try again.`
            : "I couldn't fetch that data. Please try again.",
          mode: 'SCRIPTED',
        }
      }
    } catch (error: any) {
      console.error('[Ama Router] Tool execution failed:', error)
      
      // Map structured errors (no raw Firestore errors exposed)
      const errorMessage = error.message || 'Unknown error'
      const errorType = error.errorType
      
      // Handle NOT_SYNCED error type (payments not synced to subcollection)
      if (errorType === 'NOT_SYNCED' || errorMessage === 'PAYMENTS_NOT_SYNCED') {
        return {
          text: "I don't see any payments in your recent history view. This could mean:\n• Your payment history hasn't synced yet\n• You haven't made any payments recently\n\nYou can check your account directly or try again in a moment.",
          mode: 'SCRIPTED',
        }
      }
      
      // Check for Firestore index error (only show URL in admin/dev mode)
      if (errorMessage.includes('index') || errorMessage.includes('FAILED_PRECONDITION')) {
        const isAdmin = params.decodedIsAdmin === true
        const isDev = process.env.NODE_ENV !== 'production'
        
        if (isAdmin || isDev) {
          const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'gobankless-dev'
          const indexUrl = `https://console.firebase.google.com/project/${projectId}/firestore/indexes`
          
          return {
            text: `I need a Firestore index to access that data. Please create the index: ${indexUrl}`,
            mode: 'SCRIPTED',
          }
        } else {
          // User-facing message (no index URL)
          return {
            text: "I'm having trouble accessing that data right now. Please try again later or contact support if the issue persists.",
            mode: 'SCRIPTED',
          }
        }
      }
      
      // Check for permission errors
      if (errorMessage.includes('permission') || errorMessage.includes('PERMISSION_DENIED')) {
        return {
          text: "You don't have permission to access this data.",
          mode: 'SCRIPTED',
        }
      }
      
      // Generic error (don't expose raw Firestore errors)
      return {
        text: params.requestId
          ? `I encountered an error (requestId: ${params.requestId}). Please try again.`
          : "I encountered an error. Please try again.",
        mode: 'SCRIPTED',
      }
    }
  }

  // Step 1: Fallback to old deterministic intent classifier (for backward compatibility)
  const intent = classifyIntent(messageText)
  const deterministicResponse = await handleDeterministicIntent(intent, params)
  if (deterministicResponse) {
    return deterministicResponse
  }

  // Step 3: Check if LLM is enabled
  // Note: scriptedResponse was already checked at Step 0, no need to check again
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
          
          // Post-process tool data for better LLM understanding
          let processedData = toolResult.data
          
          // Normalize wallet payload: convert object map to sorted array with consistent fields
          if (llmResponse.toolCall.name === 'get_user_wallets' || llmResponse.toolCall.name === 'get_user_snapshot') {
            let walletsMap: Record<string, any>
            
            if (llmResponse.toolCall.name === 'get_user_snapshot') {
              // Snapshot returns { profile, wallets[], recentPayments[] }
              const snapshot = toolResult.data as { profile: any; wallets: any[]; recentPayments: any[] }
              walletsMap = snapshot.wallets.reduce((acc, w) => {
                acc[w.walletId] = w
                return acc
              }, {} as Record<string, any>)
            } else {
              walletsMap = toolResult.data as Record<string, any>
            }
            
            // Normalize to sorted array with consistent fields
            const walletsArray = Object.entries(walletsMap)
              .map(([walletId, walletData]) => ({
                walletId,
                displayCurrency: walletData.displayCurrency || walletId,
                fiatBalance: walletData.fiatBalance || 0,
                usdtBalance: walletData.usdtBalance || 0,
                apy: walletData.apy || null,
                updatedAt: walletData.updatedAt || null,
                kind: walletData.kind || null,
              }))
              .sort((a, b) => a.walletId.localeCompare(b.walletId)) // Sort by walletId for consistency
            
            if (llmResponse.toolCall.name === 'get_user_snapshot') {
              // Keep snapshot structure but normalize wallets
              processedData = {
                ...toolResult.data,
                wallets: walletsArray,
              }
            } else {
              processedData = walletsArray
            }
          }
          
          // Response validation and auto-retry for common failures
          const validationResult = await validateAndRetryIfNeeded(
            params.messageText,
            llmResponse.toolCall.name,
            processedData,
            params
          )
          
          if (validationResult.shouldRetry) {
            console.log('[Ama Router] Response validation failed, auto-retrying:', validationResult.reason)
            // Replace processedData with corrected data
            processedData = validationResult.correctedData || processedData
          }
          
          // Add tool result message
          conversationMessages.push({
            role: 'tool',
            content: JSON.stringify(processedData),
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
          
          // Check if it's a Firestore index error (only show URL in admin/dev mode)
          if (toolError.message?.includes('index') || toolError.message?.includes('FAILED_PRECONDITION')) {
            const isAdmin = params.decodedIsAdmin === true
            const isDev = process.env.NODE_ENV !== 'production'
            
            if (isAdmin || isDev) {
              // Extract index URL if present in error message
              const indexUrlMatch = toolError.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)
              const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null
              
              return {
                text: indexUrl
                  ? `I need a Firestore index to access that data. Please create the index: ${indexUrl}`
                  : `I need a Firestore index to access that data. Please contact support.`,
                mode: 'LLM',
              }
            } else {
              // User-facing message (no index URL)
              return {
                text: "I'm having trouble accessing that data right now. Please try again later or contact support if the issue persists.",
                mode: 'LLM',
              }
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


