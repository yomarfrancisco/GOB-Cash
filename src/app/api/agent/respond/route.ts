import { NextRequest, NextResponse } from 'next/server'
import { routeAmaMessage } from '@/lib/ama/router'
import type { PromptContext } from '@/lib/ama/prompts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AgentRespondRequest {
  threadId: string
  userId: string
  messageText: string
  recentMessages?: Array<{ role: 'user' | 'assistant', text: string }>
  context?: PromptContext
}

export async function POST(request: NextRequest) {
  try {
    const body: AgentRespondRequest = await request.json()
    const { threadId, userId, messageText } = body

    if (!threadId || !userId || !messageText) {
      return NextResponse.json(
        { error: 'Missing required fields: threadId, userId, messageText' },
        { status: 400 }
      )
    }

    // Route message (script-first, LLM-fallback)
    const response = await routeAmaMessage({
      threadId,
      userId,
      messageText,
      recentMessages: body.recentMessages || [],
      context: body.context,
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

