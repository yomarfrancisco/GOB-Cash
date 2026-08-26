import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth, getDb } from '@/lib/firebase-admin'
import { extractBearerToken } from '@/lib/ama/auth'
import { DIDIT_KYC_WORKFLOW_ID, computeCompliancePercent } from '@/lib/didit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DIDIT_SESSION_URL = 'https://verification.didit.me/v3/session/'

export async function POST(request: NextRequest) {
  const apiKey = process.env.DIDIT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'didit_not_configured' }, { status: 500 })
  }

  const token = extractBearerToken(request)
  if (!token) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let uid: string
  try {
    const decoded = await getAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gobankless.app'
  const res = await fetch(DIDIT_SESSION_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      workflow_id: DIDIT_KYC_WORKFLOW_ID,
      vendor_data: uid,
      callback: `${appUrl}/profile`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    console.error('[Didit] session create failed', res.status)
    const lower = detail.toLowerCase()
    if (res.status === 400 && lower.includes('enough credits')) {
      return NextResponse.json(
        {
          error: 'insufficient_credits',
          message: 'Didit needs a credit top-up before verification can start. Add credits at business.didit.me.',
        },
        { status: 402 },
      )
    }
    return NextResponse.json({ error: 'session_create_failed' }, { status: 502 })
  }

  const session = await res.json()

  try {
    const sessionStatus = typeof session.status === 'string' ? session.status : 'Not Started'
    await getDb().collection('users').doc(uid).set(
      {
        kycSessionId: session.session_id ?? null,
        kycSessionStatus: sessionStatus,
        kycStatus: 'in_progress',
        kycPercent: computeCompliancePercent({ sessionStatus }),
        kycUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  } catch (error) {
    console.error('[Didit] failed to persist session on user', error)
  }

  return NextResponse.json({
    url: session.url,
    session_id: session.session_id,
  })
}
