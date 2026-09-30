import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'
import { extractBearerToken } from '@/lib/ama/auth'
import { AGENT_UID } from '@/types/transactions'
import { E0_FIXTURE_MOMENTS, E0_ISOLATION, assertE0FixtureSafe } from '@/lib/belief/e0Fixture'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Auth-gated E0 fixture payload.
 * Server flag + ROUTING_ADMIN_UID (AGENT_UID) required.
 * In-memory fixture only — no Firestore / planner / LLM.
 */
export async function GET(req: NextRequest) {
  if (process.env.BELIEF_E0_PRODUCTION_REVIEW !== 'true') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    if (decoded.uid !== AGENT_UID) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  assertE0FixtureSafe()

  return NextResponse.json(
    {
      isolation: E0_ISOLATION,
      moments: E0_FIXTURE_MOMENTS,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
