import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin'
import { extractBearerToken } from '@/lib/ama/auth'
import { AGENT_UID } from '@/types/transactions'
import { interpretRoutingFeedbackWithOpenAI } from '@/lib/routing/interpretAdminFeedback'
import {
  answerMemoryQuestion,
  buildRoutingLedgerBrief,
  type LedgerSnapshot,
  type RecentCycleBrief,
  type RecentFeedbackBrief,
} from '@/lib/routing/interpretContext'
import { firestoreTimestampMs, isMemoryOrHistoryQuestion } from '@/lib/routing/routingTime'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function ledgerFromTestDoc(data: Record<string, unknown>): LedgerSnapshot {
  const config =
    data.config && typeof data.config === 'object' ? (data.config as Record<string, unknown>) : {}
  return {
    availableCapital: num(data.availableCapital, 0),
    bufferUsed: num(data.bufferUsed, 0),
    completedCycles: num(data.completedCycles, 0),
    cycleCount: num(config.cycleCount, 20),
    bufferAmount: num(config.bufferAmount, 50_000),
    cards: Array.isArray(data.cards) ? data.cards : [],
    machines: Array.isArray(data.machines) ? data.machines : [],
    pairings:
      data.pairings && typeof data.pairings === 'object'
        ? (data.pairings as Record<string, number>)
        : {},
  }
}

function constraintLines(data: Record<string, unknown>) {
  if (!Array.isArray(data.constraints)) return []
  return data.constraints.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const row = raw as Record<string, unknown>
    return [
      {
        status: typeof row.status === 'string' ? row.status : 'active',
        action: typeof row.action === 'string' ? row.action : '',
        resourceId: num(row.resourceId, 0),
        scope: typeof row.scope === 'string' ? row.scope : 'this_cycle',
        remainingCycles: typeof row.remainingCycles === 'number' ? row.remainingCycles : null,
        expiresAt:
          firestoreTimestampMs(row.expiresAt) ??
          (typeof row.expiresAt === 'number' ? row.expiresAt : null),
        summary: typeof row.summary === 'string' ? row.summary : undefined,
        createdAtCycle: typeof row.createdAtCycle === 'number' ? row.createdAtCycle : undefined,
      },
    ]
  })
}

async function loadInterpretHistory(
  testRunId: string | undefined,
  cycleNumber: number
): Promise<{
  historyBrief: string
  nowMs: number
  ledger: LedgerSnapshot
  constraints: ReturnType<typeof constraintLines>
  recentCycles: RecentCycleBrief[]
  recentFeedback: RecentFeedbackBrief[]
} | null> {
  const nowMs = Date.now()
  try {
    const db = getAdminDb()
    let resolvedTestRunId = testRunId
    if (!resolvedTestRunId) {
      const current = await db.collection('adminConversionCurrent').doc(AGENT_UID).get()
      resolvedTestRunId =
        typeof current.data()?.testRunId === 'string' ? current.data()?.testRunId : undefined
    }
    if (!resolvedTestRunId) return null
    const testSnap = await db.collection('adminConversionTests').doc(resolvedTestRunId).get()
    if (!testSnap.exists) return null
    const data = (testSnap.data() || {}) as Record<string, unknown>
    const [cycleSnap, cyclesSnap, feedbackSnap] = await Promise.all([
      db.collection('adminConversionTests').doc(resolvedTestRunId).collection('cycles').doc(String(cycleNumber)).get(),
      db
        .collection('adminConversionTests')
        .doc(resolvedTestRunId)
        .collection('cycles')
        .orderBy('cycleNumber', 'desc')
        .limit(6)
        .get(),
      db
        .collection('adminConversionTests')
        .doc(resolvedTestRunId)
        .collection('feedback')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
        .catch(() => null),
    ])

    const recentCycles: RecentCycleBrief[] = cyclesSnap.docs.map((docSnap) => {
      const row = docSnap.data()
      const assignments = Array.isArray(row.cardAssignments)
        ? row.cardAssignments
            .map((item: unknown) => {
              if (!item || typeof item !== 'object') return null
              const assignment = item as { cardId?: unknown; machineId?: unknown; amount?: unknown }
              if (typeof assignment.cardId !== 'number' || typeof assignment.machineId !== 'number') return null
              return {
                cardId: assignment.cardId,
                machineId: assignment.machineId,
                amount: typeof assignment.amount === 'number' ? assignment.amount : 0,
              }
            })
            .filter(
              (
                item: { cardId: number; machineId: number; amount: number } | null
              ): item is { cardId: number; machineId: number; amount: number } => Boolean(item)
            )
        : []
      return {
        cycleNumber: num(row.cycleNumber, 0),
        status: typeof row.status === 'string' ? row.status : '',
        createdAtMs: firestoreTimestampMs(row.createdAt),
        completedAtMs: firestoreTimestampMs(row.completedAt),
        assignments,
      }
    })

    const recentFeedback: RecentFeedbackBrief[] = feedbackSnap
      ? feedbackSnap.docs.map((docSnap) => {
          const row = docSnap.data()
          return {
            rawMessage: typeof row.rawMessage === 'string' ? row.rawMessage : '',
            summary: typeof row.interpretationSummary === 'string' ? row.interpretationSummary : null,
            createdAtMs: firestoreTimestampMs(row.createdAt),
            status: typeof row.status === 'string' ? row.status : '',
          }
        })
      : []

    const ledger = ledgerFromTestDoc(data)
    const constraints = constraintLines(data)
    return {
      nowMs,
      ledger,
      constraints,
      recentCycles,
      recentFeedback,
      historyBrief: buildRoutingLedgerBrief({
        ledger,
        constraints,
        recentCycles,
        recentFeedback,
        awaiting: {
          cycleNumber,
          kind: typeof data.awaitingKind === 'string' ? data.awaitingKind : 'deploy',
          issuedAtMs: firestoreTimestampMs(cycleSnap.data()?.createdAt),
        },
        nowMs,
      }),
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const acceptProposalId = typeof body?.acceptProposalId === 'string' ? body.acceptProposalId.trim() : ''
    const discardProposalId = typeof body?.discardProposalId === 'string' ? body.discardProposalId.trim() : ''
    if (!message && !acceptProposalId && !discardProposalId) {
      return NextResponse.json({ error: 'Ask text is required' }, { status: 400 })
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

    const cycleNumber = typeof body?.cycleNumber === 'number' ? body.cycleNumber : 0
    const history = await loadInterpretHistory(
      typeof body?.testRunId === 'string' ? body.testRunId : undefined,
      cycleNumber
    )

    const skipInterpret = Boolean(acceptProposalId || discardProposalId)
    const memoryAnswer =
      !skipInterpret && history && isMemoryOrHistoryQuestion(message)
        ? answerMemoryQuestion({
            message,
            nowMs: history.nowMs,
            constraints: history.constraints,
            recentFeedback: history.recentFeedback,
            recentCycles: history.recentCycles,
            ledger: history.ledger,
            awaiting: { cycleNumber },
          })
        : null
    const interpreted = skipInterpret
      ? { intents: [], clarification: null, interpreter: 'fast_path' as const }
      : memoryAnswer
      ? { intents: [], clarification: memoryAnswer, interpreter: 'fast_path' as const }
      : await interpretRoutingFeedbackWithOpenAI(message, {
          cycleNumber,
          cardCount: typeof body?.cardCount === 'number' ? body.cardCount : 5,
          machineCount: typeof body?.machineCount === 'number' ? body.machineCount : 4,
          assignments,
          activeConstraints: Array.isArray(body?.activeConstraints)
            ? body.activeConstraints.filter((row: unknown) => typeof row === 'string')
            : [],
          nowMs: history?.nowMs,
          historyBrief: history?.historyBrief,
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
            acceptProposalId: acceptProposalId || undefined,
            discardProposalId: discardProposalId || undefined,
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
