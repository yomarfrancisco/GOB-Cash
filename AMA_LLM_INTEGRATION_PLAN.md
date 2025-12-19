# Ama LLM Integration Plan
## End-to-End Implementation Guide

---

## 📋 Current State Assessment

### Q: "Right now, is there any LLM connected?"
**Answer: NO** — Currently, Ama chat uses:
- In-memory Zustand store (`messagesByThreadId`)
- Global thread ID: `'portfolio-manager'`
- Stub AI responses: `"Got it – I'll help you with that. This will later come from the BabyCDO backend."`
- Scripted flows via `chatOrchestration.ts` (deposit confirmations, payment flows)
- **No LLM provider integration exists**

### Q: "When exactly will the first real LLM response appear in Ama?"
**Answer: Phase 2** — The first real LLM response will appear when:
1. Phase 1 is complete (server endpoint wired)
2. Phase 2 LLM client is implemented
3. Script router determines message cannot be handled by scripted flow
4. LLM is called and response is returned

**Timeline:** Phase 2 implementation (see below)

---

## 🎯 High-Level Phased Plan

### **Phase 0: Foundation (Storage + Threading)**
**Status:** ✅ Mostly Complete (duplicate thread fix done)
- [x] Fix duplicate Ama threads
- [ ] Add scenario state to Zustand (for Phase 1)
- [ ] Ensure single canonical Ama thread per session

**Storage:** Zustand in-memory only  
**Deliverable:** Stable thread structure ready for LLM integration

---

### **Phase 1: Server Endpoint + Script Router (No LLM Yet)**
**Timeline:** 1-2 days  
**Storage:** Zustand in-memory

**What Ships:**
- `POST /api/agent/respond` endpoint (returns scripted responses only)
- Script router that handles existing scenarios
- UI integration (Ama chat calls endpoint instead of stub)
- Scenario state tracking in Zustand

**LLM Status:** ❌ Not implemented (returns scripted responses only)

**Deliverable:** Ama chat responds intelligently to scripted scenarios, but no LLM yet

---

### **Phase 2: LLM Integration (First Real LLM Response)**
**Timeline:** 3-5 days  
**Storage:** Zustand in-memory (Firestore migration optional)

**What Ships:**
- Provider-agnostic LLM client (OpenAI-compatible)
- Hybrid router: Script-first → LLM fallback
- Prompt template system (scenario + variables + message history)
- Template-based LLM responses (maintains tone consistency)
- Safety guardrails (no money movement)

**LLM Status:** ✅ **First real LLM responses appear here**

**Deliverable:** Ama can handle freeform questions while preserving scripted flows

---

### **Phase 3: Firestore Migration (Optional, Future)**
**Timeline:** 2-3 days (when persistence needed)  
**Storage:** Firestore-backed threads + messages

**What Ships:**
- Firestore `conversations` collection
- User-specific thread IDs: `ama:{userId}`
- Message persistence across sessions
- Migration path from Zustand → Firestore

**LLM Status:** ✅ Continues working (now with persistence)

**Deliverable:** Ama conversations persist across page refreshes

---

## 📐 Phase 1: Implementation Plan (Script Router Only)

### 1.1 Data Model: Scenario State in Zustand

**File:** `src/state/financialInbox.ts`

Add to `FinancialInboxState`:
```typescript
type FinancialInboxState = {
  // ... existing fields ...
  
  // NEW: Ama conversation state
  amaConversationState: {
    mode: 'SCRIPTED' | 'LLM' | 'HYBRID'
    scenario: 'card_deposit' | 'cash_deposit' | 'cash_withdrawal' | 'payment_sent' | 'payment_request' | 'agent_request' | null
    scenarioVariables: {
      amountZAR?: number
      accountLabel?: string
      handle?: string
      locationId?: string
      paymentRef?: string
      [key: string]: any
    }
    lastHandledMessageId: string | null
  } | null
}
```

Add actions:
```typescript
setAmaConversationState: (state: AmaConversationState | null) => void
clearAmaConversationState: () => void
```

**Rationale:** Store scenario state in Zustand for Phase 1-2. Migrate to Firestore in Phase 3 if persistence needed.

---

### 1.2 Create Server Endpoint (Scripted Responses Only)

**File:** `src/app/api/agent/respond/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getFirebaseAuth } from '@/lib/firebase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AgentRespondRequest {
  threadId: string
  userId: string
  messageText: string
  context?: {
    scenario?: string | null
    scenarioVariables?: Record<string, any>
    mode?: 'SCRIPTED' | 'LLM' | 'HYBRID'
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AgentRespondRequest = await request.json()
    const { threadId, userId, messageText, context } = body

    // Validate authentication (optional, can verify userId matches auth token)
    // For now, trust userId from client (add auth check in production)

    // Phase 1: Script router only (no LLM)
    const response = await routeAmaMessage({
      threadId,
      userId,
      messageText,
      scenario: context?.scenario || null,
      scenarioVariables: context?.scenarioVariables || {},
      mode: context?.mode || 'SCRIPTED',
    })

    return NextResponse.json({
      assistantMessageText: response.text,
      mode: response.mode, // 'SCRIPTED' in Phase 1
      scenario: response.scenario || null,
      updatedVariables: response.updatedVariables || {},
    })
  } catch (error: any) {
    console.error('[Agent Respond] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process message' },
      { status: 500 }
    )
  }
}
```

---

### 1.3 Script Router Implementation

**File:** `src/lib/ama/router.ts` (NEW)

```typescript
/**
 * Ama Message Router
 * Phase 1: Script-only responses
 * Phase 2: Script-first, LLM-fallback
 */

export type AmaResponse = {
  text: string
  mode: 'SCRIPTED' | 'LLM'
  scenario?: string | null
  updatedVariables?: Record<string, any>
}

export type RouteAmaMessageParams = {
  threadId: string
  userId: string
  messageText: string
  scenario: string | null
  scenarioVariables: Record<string, any>
  mode: 'SCRIPTED' | 'LLM' | 'HYBRID'
}

export async function routeAmaMessage(
  params: RouteAmaMessageParams
): Promise<AmaResponse> {
  const { messageText, scenario, scenarioVariables } = params

  // Phase 1: Script router only
  if (scenario) {
    const scriptedResponse = getScriptedResponse(scenario, messageText, scenarioVariables)
    if (scriptedResponse) {
      return {
        text: scriptedResponse,
        mode: 'SCRIPTED',
        scenario,
        updatedVariables: scenarioVariables,
      }
    }
  }

  // Phase 1 fallback: Generic response (no LLM yet)
  return {
    text: "I'm here to help! You can ask me about deposits, payments, or connecting to agents.",
    mode: 'SCRIPTED',
    scenario: null,
  }
}

function getScriptedResponse(
  scenario: string,
  messageText: string,
  variables: Record<string, any>
): string | null {
  const lowerText = messageText.toLowerCase().trim()

  switch (scenario) {
    case 'card_deposit':
      if (lowerText.includes('status') || lowerText.includes('where') || lowerText.includes('when')) {
        return `Your card deposit of ${formatZAR(variables.amountZAR)} is being processed. The funds should appear in your ${variables.accountLabel} account shortly.`
      }
      if (lowerText.includes('cancel') || lowerText.includes('refund')) {
        return `I can't cancel a deposit that's already in progress. If you need help, please contact support.`
      }
      return null // Let fallback handle

    case 'payment_sent':
      if (lowerText.includes('proof') || lowerText.includes('receipt')) {
        return `I'll generate a proof of payment for your ${formatZAR(variables.amountZAR)} payment to ${variables.handle} here in a moment.`
      }
      return null

    case 'agent_request':
      if (lowerText.includes('when') || lowerText.includes('time')) {
        return `I'm checking for the nearest available agent now. I'll connect you as soon as one is available.`
      }
      return null

    default:
      return null
  }
}

function formatZAR(amount: number): string {
  return `R${amount.toFixed(2)}`
}
```

---

### 1.4 Wire UI to Endpoint

**File:** `src/components/Inbox/FinancialInboxSheet.tsx`

**Modify `handleSend` callback (around line 373):**

```typescript
const handleSend = useCallback(async () => {
  if (!inputText.trim()) return
  
  // ... existing transaction thread logic (keep as-is) ...
  
  // Portfolio-manager thread: Call agent endpoint
  if (activeThreadId === PORTFOLIO_MANAGER_THREAD_ID) {
    const userMessage = inputText.trim()
    setInputText('')
    
    // Optimistically add user message
    sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'user', userMessage)
    
    try {
      // Get current user
      const auth = getFirebaseAuth()
      const userId = auth.currentUser?.uid
      if (!userId) {
        throw new Error('User not authenticated')
      }
      
      // Get current scenario state from Zustand
      const store = useFinancialInboxStore.getState()
      const conversationState = store.amaConversationState
      
      // Call agent endpoint
      const response = await fetch('/api/agent/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: PORTFOLIO_MANAGER_THREAD_ID,
          userId,
          messageText: userMessage,
          context: {
            scenario: conversationState?.scenario || null,
            scenarioVariables: conversationState?.scenarioVariables || {},
            mode: conversationState?.mode || 'SCRIPTED',
          },
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to get response')
      }
      
      const data = await response.json()
      
      // Update scenario state if changed
      if (data.scenario !== conversationState?.scenario || data.updatedVariables) {
        store.setAmaConversationState({
          mode: data.mode,
          scenario: data.scenario,
          scenarioVariables: { ...conversationState?.scenarioVariables, ...data.updatedVariables },
          lastHandledMessageId: null, // Will be set when message is added
        })
      }
      
      // Add AI response
      sendMessage(PORTFOLIO_MANAGER_THREAD_ID, 'ai', data.assistantMessageText)
      
    } catch (error) {
      console.error('[Ama] Failed to get response:', error)
      // Fallback to generic response
      sendMessage(
        PORTFOLIO_MANAGER_THREAD_ID,
        'ai',
        "I'm having trouble processing that right now. Please try again."
      )
    }
    
    return
  }
  
  // ... rest of existing logic ...
}, [inputText, sendMessage, activeThreadId, threads, ...])
```

---

### 1.5 Update Scripted Flows to Set Scenario State

**File:** `src/lib/cashDeposit/chatOrchestration.ts`

**Modify `openAmaChatWithCardDepositScenario` (around line 93):**

```typescript
export function openAmaChatWithCardDepositScenario(
  amountZAR: number,
  accountLabel: string
): void {
  const store = useFinancialInboxStore.getState()
  
  // Set scenario state BEFORE sending messages
  store.setAmaConversationState({
    mode: 'SCRIPTED',
    scenario: 'card_deposit',
    scenarioVariables: {
      amountZAR,
      accountLabel,
    },
    lastHandledMessageId: null,
  })
  
  // ... existing message sending logic ...
}
```

**Apply same pattern to:**
- `openAmaChatWithPaymentScenario` → scenario: `'payment_sent'` or `'payment_request'`
- `openAmaChatWithLocationAgentRequest` → scenario: `'agent_request'`

---

## 📐 Phase 2: LLM Integration Plan (First Real LLM Response)

### 2.1 LLM Client (Provider-Agnostic)

**File:** `src/lib/ama/llmClient.ts` (NEW)

```typescript
/**
 * LLM Client - Provider-agnostic (OpenAI-compatible)
 * Supports: OpenAI, Anthropic, local models via OpenRouter, etc.
 */

export type LLMConfig = {
  provider: 'openai' | 'anthropic' | 'openrouter'
  apiKey: string
  model: string
  baseURL?: string // For OpenRouter or custom endpoints
}

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LLMResponse = {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

export async function callLLM(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  // Phase 2: Implement based on provider
  // For OpenAI:
  if (config.provider === 'openai') {
    return callOpenAI(messages, config)
  }
  
  // For Anthropic:
  if (config.provider === 'anthropic') {
    return callAnthropic(messages, config)
  }
  
  // For OpenRouter (supports multiple providers):
  if (config.provider === 'openrouter') {
    return callOpenRouter(messages, config)
  }
  
  throw new Error(`Unsupported provider: ${config.provider}`)
}

async function callOpenAI(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const response = await fetch(config.baseURL || 'https://api.openai.com/v1/chat/completions', {
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
    const error = await response.json()
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`)
  }
  
  const data = await response.json()
  return {
    text: data.choices[0]?.message?.content || '',
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
  }
}

// Similar implementations for Anthropic, OpenRouter...
```

---

### 2.2 Prompt Template System

**File:** `src/lib/ama/prompts.ts` (NEW)

```typescript
/**
 * Ama Prompt Templates
 * Ensures consistent tone and behavior
 */

export type PromptContext = {
  scenario: string | null
  scenarioVariables: Record<string, any>
  recentMessages: Array<{ role: 'user' | 'assistant', text: string }>
  availableTemplates: string[]
}

export function buildAmaPrompt(context: PromptContext): string {
  const { scenario, scenarioVariables, recentMessages, availableTemplates } = context
  
  let systemPrompt = `You are Ama, a friendly and helpful Portfolio Manager for GoBankless. You help users with:
- Deposits (card, cash, bank transfer)
- Payments and requests
- Connecting to agents
- General questions about the platform

Tone: Friendly, concise, professional. Use emojis sparingly (1-2 per message max).

Constraints:
- You CANNOT execute payments, credit wallets, or modify balances
- You CAN suggest next steps (e.g., "tap Cash in/out", "choose Card")
- You CAN answer questions about the platform
- You CAN guide users through flows

`

  // Add scenario context if active
  if (scenario) {
    systemPrompt += `Current Context:
- Scenario: ${scenario}
- Variables: ${JSON.stringify(scenarioVariables, null, 2)}

`
  }

  // Add available templates (scripted responses LLM can reuse)
  if (availableTemplates.length > 0) {
    systemPrompt += `Available Response Templates (you can use these verbatim or customize):
${availableTemplates.map((t, i) => `${i + 1}. ${t}`).join('\n')}

You can either:
1. Return a template verbatim (if it fits)
2. Customize a template (fill in variables, add clarifying sentence)
3. Write a new response (if no template fits)

`
  }

  systemPrompt += `Recent conversation:
${recentMessages.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Ama'}: ${m.text}`).join('\n')}

User's latest message: "${recentMessages[recentMessages.length - 1]?.text || ''}"

Respond as Ama:`

  return systemPrompt
}

export const AVAILABLE_TEMPLATES = [
  "I've started your card deposit.",
  "Your card deposit of {amount} into {account} has been initiated.",
  "The funds should appear in your account shortly.",
  "Payment sent",
  "Your payment of {amount} to {handle} has been sent successfully.",
  "I'll generate a proof of payment for you here in a moment.",
  "I'm checking for the nearest available agent now.",
  "I can only connect you to human agents when you're physically at a GoBankless location.",
]
```

---

### 2.3 Update Router to Call LLM

**File:** `src/lib/ama/router.ts` (UPDATE)

```typescript
import { callLLM, type LLMMessage } from './llmClient'
import { buildAmaPrompt, AVAILABLE_TEMPLATES } from './prompts'

export async function routeAmaMessage(
  params: RouteAmaMessageParams
): Promise<AmaResponse> {
  const { messageText, scenario, scenarioVariables, threadId, userId } = params

  // Step 1: Try script router first
  if (scenario) {
    const scriptedResponse = getScriptedResponse(scenario, messageText, scenarioVariables)
    if (scriptedResponse) {
      return {
        text: scriptedResponse,
        mode: 'SCRIPTED',
        scenario,
        updatedVariables: scenarioVariables,
      }
    }
  }

  // Step 2: Script router couldn't handle → Call LLM
  // TODO: Get recent messages from Zustand (Phase 2) or Firestore (Phase 3)
  const recentMessages = getRecentMessages(threadId, 10) // Last 10 messages
  
  const prompt = buildAmaPrompt({
    scenario,
    scenarioVariables,
    recentMessages,
    availableTemplates: AVAILABLE_TEMPLATES,
  })

  const llmConfig = getLLMConfig() // From env vars
  const llmResponse = await callLLM(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: messageText },
    ],
    llmConfig
  )

  return {
    text: llmResponse.text,
    mode: 'LLM',
    scenario, // Preserve scenario if still active
    updatedVariables: scenarioVariables,
  }
}

function getRecentMessages(threadId: string, limit: number): Array<{ role: 'user' | 'assistant', text: string }> {
  // Phase 2: Get from Zustand
  const store = useFinancialInboxStore.getState()
  const messages = store.messagesByThreadId[threadId] || []
  
  return messages
    .slice(-limit)
    .map(m => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      text: m.text,
    }))
}

function getLLMConfig() {
  return {
    provider: (process.env.LLM_PROVIDER || 'openai') as 'openai' | 'anthropic' | 'openrouter',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    baseURL: process.env.LLM_BASE_URL, // Optional, for OpenRouter
  }
}
```

---

### 2.4 Environment Variables

**File:** `.env.local` (add to example)

```bash
# LLM Configuration (Phase 2)
LLM_PROVIDER=openai  # or 'anthropic', 'openrouter'
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini  # or 'claude-3-haiku', etc.
LLM_BASE_URL=  # Optional, for OpenRouter or custom endpoints
LLM_ENABLED=true  # Feature flag
```

---

## 🛡️ Safety Guardrails

### 2.5 Action Whitelist System

**File:** `src/lib/ama/actions.ts` (NEW)

```typescript
/**
 * Whitelisted Actions
 * LLM can only suggest these actions, never execute them directly
 */

export type WhitelistedAction = 
  | { type: 'OPEN_DEPOSIT_FLOW' }
  | { type: 'OPEN_WITHDRAWAL_FLOW' }
  | { type: 'OPEN_PAYMENT_FLOW' }
  | { type: 'SHOW_BALANCE' }
  | { type: 'SHOW_TRANSACTIONS' }
  | { type: 'CONNECT_TO_AGENT', locationId?: string }

export function parseActionFromLLMResponse(text: string): WhitelistedAction | null {
  // Simple keyword matching (can be enhanced with structured output)
  const lower = text.toLowerCase()
  
  if (lower.includes('deposit') && (lower.includes('start') || lower.includes('make'))) {
    return { type: 'OPEN_DEPOSIT_FLOW' }
  }
  
  if (lower.includes('withdraw') || lower.includes('withdrawal')) {
    return { type: 'OPEN_WITHDRAWAL_FLOW' }
  }
  
  // ... more patterns ...
  
  return null
}

// In router.ts, after LLM response:
const suggestedAction = parseActionFromLLMResponse(llmResponse.text)
if (suggestedAction) {
  // Return action separately (client decides whether to execute)
  return {
    text: llmResponse.text,
    mode: 'LLM',
    suggestedAction, // Client can show UI hint or execute
  }
}
```

**Critical Rule:** LLM response text is NEVER executed as code. Only whitelisted actions parsed from text can trigger UI flows.

---

## 📊 Data Model: Scenario State Storage

### Current (Phase 1-2): Zustand In-Memory

```typescript
// src/state/financialInbox.ts
amaConversationState: {
  mode: 'SCRIPTED' | 'LLM' | 'HYBRID'
  scenario: string | null
  scenarioVariables: Record<string, any>
  lastHandledMessageId: string | null
} | null
```

**Pros:**
- Fast, no network calls
- Works immediately
- Simple to implement

**Cons:**
- Lost on page refresh
- Not shared across devices
- No conversation history persistence

---

### Future (Phase 3): Firestore Migration

**Collection:** `conversations/{conversationId}`

```typescript
// conversationId = `ama:${userId}`
{
  type: 'AMA',
  userId: string,
  mode: 'SCRIPTED' | 'LLM' | 'HYBRID',
  scenario: string | null,
  scenarioVariables: {
    amountZAR?: number,
    accountLabel?: string,
    // ... other variables
  },
  lastHandledMessageId: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
}

// Messages: conversations/{conversationId}/messages/{messageId}
{
  id: string,
  threadId: string, // 'ama:{userId}'
  from: 'user' | 'ai',
  text: string,
  createdAt: Timestamp,
  metadata?: {
    mode?: 'SCRIPTED' | 'LLM',
    scenario?: string,
  }
}
```

**Migration Path:**
1. Keep Zustand for UI reactivity
2. Sync Zustand → Firestore on message send
3. Subscribe to Firestore for cross-device sync
4. Gradually move all reads to Firestore

---

## ✅ Implementation Checklist

### Phase 1 (Script Router Only)
- [ ] Add `amaConversationState` to Zustand store
- [ ] Create `POST /api/agent/respond` endpoint
- [ ] Implement script router in `src/lib/ama/router.ts`
- [ ] Wire `FinancialInboxSheet.handleSend` to call endpoint
- [ ] Update `chatOrchestration.ts` to set scenario state
- [ ] Test: Card deposit flow → scenario state → scripted responses
- [ ] Test: Freeform message → generic fallback (no LLM yet)

### Phase 2 (LLM Integration)
- [ ] Create LLM client (`src/lib/ama/llmClient.ts`)
- [ ] Create prompt templates (`src/lib/ama/prompts.ts`)
- [ ] Update router to call LLM on script fallback
- [ ] Add environment variables for LLM config
- [ ] Implement action whitelist system
- [ ] Add feature flag `LLM_ENABLED`
- [ ] Test: Freeform question → LLM response appears
- [ ] Test: Scripted scenario → still uses script (no LLM)
- [ ] Test: Safety guardrails (no money movement)

### Phase 3 (Firestore Migration - Optional)
- [ ] Create `conversations` collection schema
- [ ] Implement `getOrCreateAmaThread(userId)` with Firestore
- [ ] Migrate messages to Firestore
- [ ] Update UI to subscribe to Firestore messages
- [ ] Handle Zustand → Firestore migration

---

## 🎯 Success Criteria

### Phase 1 Complete When:
- ✅ Ama chat calls `/api/agent/respond` instead of stub
- ✅ Scripted scenarios return appropriate responses
- ✅ Scenario state is tracked in Zustand
- ✅ No LLM calls made (scripted only)

### Phase 2 Complete When:
- ✅ First real LLM response appears in Ama chat
- ✅ Freeform questions get LLM responses
- ✅ Scripted flows still work (script-first)
- ✅ Safety guardrails prevent money movement
- ✅ Feature flag controls LLM enablement

### Phase 3 Complete When:
- ✅ Conversations persist across page refreshes
- ✅ Messages sync across devices
- ✅ Zustand → Firestore migration complete

---

## 📝 Notes

- **Storage Strategy:** Zustand-first for speed, Firestore-later for persistence
- **LLM Provider:** Start with OpenAI (easiest), add others as needed
- **Safety:** LLM never executes code, only suggests whitelisted actions
- **Templates:** LLM can reuse scripted templates to maintain consistency
- **Feature Flag:** `LLM_ENABLED` allows gradual rollout

---

**End of Plan**

