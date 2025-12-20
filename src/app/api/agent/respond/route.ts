import { NextRequest, NextResponse } from 'next/server'
import { routeAmaMessage } from '@/lib/ama/router'
import type { PromptContext } from '@/lib/ama/prompts'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { extractBearerToken } from '@/lib/ama/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AgentRespondRequest {
  threadId: string
  userId: string
  messageText: string
  recentMessages?: Array<{ role: 'user' | 'assistant', text: string }>
  context?: PromptContext
  authToken?: string // Firebase ID token for tool calls
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID()
  let toolsInvoked = false
  let verifiedUid: string | undefined
  
  try {
    // Parse body once
    const body: AgentRespondRequest = await request.json()
    const { threadId, userId, messageText } = body

    if (!threadId || !userId || !messageText) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: threadId, userId, messageText',
          requestId,
        },
        { status: 400 }
      )
    }

    // Extract token using shared helper (handles header casing + body fallback)
    const token = extractBearerToken(request, body)
    const hasAuthToken = Boolean(token)

    // Verify token once and extract uid/admin status (for tool calls)
    let decodedUid: string | undefined
    let decodedIsAdmin: boolean | undefined

    if (token) {
      try {
        const auth = getAdminAuth()
        const decoded = await auth.verifyIdToken(token)
        decodedUid = decoded.uid
        verifiedUid = decodedUid

        // Check admin status
        const adminUids = (process.env.AMA_ADMIN_UIDS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        decodedIsAdmin = adminUids.includes(decodedUid)
      } catch (tokenError: any) {
        console.warn('[Agent Respond] Token verification failed:', tokenError.message)
        // Continue without decoded uid - router will try to verify again if needed
      }
    }

    // Server log per request (no secrets)
    console.log('[Agent Respond]', {
      requestId,
      uid: verifiedUid || 'unverified',
      hasAuthToken,
      messageLength: messageText.length,
    })

    // Route message (script-first, LLM-fallback with tool support)
    const response = await routeAmaMessage({
      threadId,
      userId,
      messageText,
      recentMessages: body.recentMessages || [],
      context: body.context,
      authToken: token || undefined, // Pass extracted token
      decodedUid, // Pre-verified UID (avoids double verification)
      decodedIsAdmin, // Pre-verified admin status
      requestId, // Pass requestId for error messages
    })

    // Check if tools were invoked (response mode indicates this)
    toolsInvoked = response.mode === 'LLM' && response.toolsInvoked === true

    // Final log with tools status
    console.log('[Agent Respond]', {
      requestId,
      uid: verifiedUid || 'unverified',
      toolsInvoked,
      mode: response.mode,
    })

    return NextResponse.json({
      assistantMessageText: response.text,
      mode: response.mode,
      requestId,
    })
  } catch (error: any) {
    console.error('[Agent Respond] Error:', {
      requestId,
      uid: verifiedUid || 'unverified',
      error: error.message,
    })
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process message',
        requestId,
      },
      { status: 500 }
    )
  }
}

