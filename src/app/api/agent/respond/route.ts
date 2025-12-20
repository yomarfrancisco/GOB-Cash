import { NextRequest, NextResponse } from 'next/server'
import { routeAmaMessage } from '@/lib/ama/router'
import type { PromptContext } from '@/lib/ama/prompts'
import { getAdminAuth } from '@/lib/firebaseAdmin'

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
  try {
    const body: AgentRespondRequest = await request.json()
    const { threadId, userId, messageText, authToken } = body

    if (!threadId || !userId || !messageText) {
      return NextResponse.json(
        { error: 'Missing required fields: threadId, userId, messageText' },
        { status: 400 }
      )
    }

    // Verify token is actually being passed (diagnostic log)
    console.log('[Agent Respond] authToken present:', Boolean(authToken))
    if (authToken) {
      console.log('[Agent Respond] authToken length:', authToken.length)
    }

    // Verify token once and extract uid/admin status (for tool calls)
    let decodedUid: string | undefined
    let decodedIsAdmin: boolean | undefined

    if (authToken) {
      try {
        const auth = getAdminAuth()
        const decoded = await auth.verifyIdToken(authToken)
        decodedUid = decoded.uid

        // Check admin status
        const adminUids = (process.env.AMA_ADMIN_UIDS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        decodedIsAdmin = adminUids.includes(decodedUid)

        console.log('[Agent Respond] Token verified, uid:', decodedUid, 'isAdmin:', decodedIsAdmin)
      } catch (tokenError: any) {
        console.warn('[Agent Respond] Token verification failed:', tokenError.message)
        // Continue without decoded uid - router will try to verify again if needed
      }
    }

    // Route message (script-first, LLM-fallback with tool support)
    const response = await routeAmaMessage({
      threadId,
      userId,
      messageText,
      recentMessages: body.recentMessages || [],
      context: body.context,
      authToken, // Pass auth token (router will use decodedUid if available)
      decodedUid, // Pre-verified UID (avoids double verification)
      decodedIsAdmin, // Pre-verified admin status
    })

    return NextResponse.json({
      assistantMessageText: response.text,
      mode: response.mode,
    })
  } catch (error: any) {
    console.error('[Agent Respond] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process message' },
      { status: 500 }
    )
  }
}

