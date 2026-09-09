import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { extractBearerToken } from '@/lib/ama/auth'
import { AGENT_UID } from '@/types/transactions'
import { interpretRoutingFeedbackWithOpenAI } from '@/lib/routing/interpretAdminFeedback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return NextResponse.json({ error: 'Reply text is required' }, { status: 400 })
    }

    const token = extractBearerToken(request, body)
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const decoded = await getAdminAuth().verifyIdToken(token)
    if (decoded.uid !== AGENT_UID) {
      return NextResponse.json({ error: 'Conversion routing is limited to the designated admin' }, { status: 403 })
    }

    const assignments = Array.isArray(body?.assignments)
      ? body.assignments
          .map((row: unknown) => {
            if (!row || typeof row !== 'object') return null
            const data = row as { cardId?: unknown; machineId?: unknown; amount?: unknown }
            if (typeof data.cardId !== 'number' || typeof data.machineId !== 'number') return null
            return {
              cardId: data.cardId,
              machineId: data.machineId,
              amount: typeof data.amount === 'number' ? data.amount : 0,
            }
          })
          .filter(
            (row: { cardId: number; machineId: number; amount: number } | null): row is {
              cardId: number
              machineId: number
              amount: number
            } => Boolean(row)
          )
      : []

    const interpreted = await interpretRoutingFeedbackWithOpenAI(message, {
      cycleNumber: typeof body?.cycleNumber === 'number' ? body.cycleNumber : 0,
      cardCount: typeof body?.cardCount === 'number' ? body.cardCount : 5,
      machineCount: typeof body?.machineCount === 'number' ? body.machineCount : 3,
      assignments,
      activeConstraints: Array.isArray(body?.activeConstraints)
        ? body.activeConstraints.filter((row: unknown) => typeof row === 'string')
        : [],
    })

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'gobankless-dev'
    const response = await fetch(
      `https://us-central1-${projectId}.cloudfunctions.net/admin_submitConversionRoutingFeedback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            message,
            testRunId: body?.testRunId,
            cycleNumber: body?.cycleNumber,
            intents: interpreted.intents,
            clarification: interpreted.clarification,
          },
        }),
      }
    )
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.error) {
      const messageText =
        payload.error?.message || payload.error?.status || 'Failed to apply routing feedback'
      return NextResponse.json({ error: messageText }, { status: 400 })
    }
    return NextResponse.json(payload.result || payload)
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Failed to interpret routing feedback'
    return NextResponse.json({ error: text }, { status: 500 })
  }
}
