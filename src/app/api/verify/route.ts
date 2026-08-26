import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth, getDb } from '@/lib/firebase-admin'
import { extractBearerToken } from '@/lib/ama/auth'
import { DIDIT_KYC_WORKFLOW_ID } from '@/lib/didit'

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
    return NextResponse.json({ error: 'session_create_failed' }, { status: 502 })
  }

  const session = await res.json()

  try {
    await getDb().collection('users').doc(uid).set(
      {
        kycSessionId: session.session_id ?? null,
        kycSessionStatus: typeof session.status === 'string' ? session.status : 'Not Started',
        kycStatus: 'in_progress',
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
