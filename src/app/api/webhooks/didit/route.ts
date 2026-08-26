import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase-admin'
import type { DiditSessionStatus } from '@/lib/didit'
import { computeCompliancePercent, nextCompliancePercent } from '@/lib/didit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)]),
    )
  }
  if (typeof v === 'number' && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v)
  return v
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k])
        return acc
      }, {})
  }
  return v
}

function mapKycStatus(status: DiditSessionStatus | string): string {
  switch (status) {
    case 'Approved':
      return 'approved'
    case 'Declined':
      return 'declined'
    case 'In Review':
      return 'pending_review'
    case 'Resubmitted':
      return 'resubmitted'
    case 'Kyc Expired':
      return 'expired'
    case 'In Progress':
    case 'Awaiting User':
    case 'Not Started':
      return 'in_progress'
    case 'Abandoned':
      return 'abandoned'
    case 'Expired':
      return 'session_expired'
    default:
      return 'unknown'
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET
  if (!secret) {
    return new Response('not configured', { status: 500 })
  }

  const raw = await req.text()
  const sig = req.headers.get('x-signature-v2') ?? ''
  const ts = Number(req.headers.get('x-timestamp'))

  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return new Response('stale', { status: 401 })
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)))
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
  if (
    !sig ||
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return new Response('bad sig', { status: 401 })
  }

  const eventId = typeof parsed.event_id === 'string' ? parsed.event_id : ''
  const vendorData = typeof parsed.vendor_data === 'string' ? parsed.vendor_data : ''
  const status = typeof parsed.status === 'string' ? parsed.status : ''
  const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id : ''
  const webhookType = typeof parsed.webhook_type === 'string' ? parsed.webhook_type : ''

  if (!eventId) {
    return new Response('ok')
  }

  const db = getDb()
  const eventRef = db.collection('diditWebhookEvents').doc(eventId)
  const userRef = vendorData ? db.collection('users').doc(vendorData) : null

  await db.runTransaction(async (tx) => {
    const already = await tx.get(eventRef)
    if (already.exists) return

    const userSnap = userRef ? await tx.get(userRef) : null

    tx.set(eventRef, {
      eventId,
      sessionId,
      status,
      vendorData,
      webhookType,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (!userRef) return

    const computed = computeCompliancePercent({
      sessionStatus: status,
      decision: parsed.decision,
    })
    const kycPercent = nextCompliancePercent(userSnap?.data()?.kycPercent, computed, status)

    const updates: Record<string, unknown> = {
      kycStatus: mapKycStatus(status),
      kycSessionStatus: status,
      kycSessionId: sessionId || null,
      kycPercent,
      kycUpdatedAt: FieldValue.serverTimestamp(),
    }
    if (status === 'Approved') {
      updates.kycVerifiedAt = FieldValue.serverTimestamp()
      updates.verificationStatus = 'full-verified'
    }
    if (status === 'Kyc Expired') {
      updates.kycVerifiedAt = FieldValue.delete()
    }
    tx.set(userRef, updates, { merge: true })
  })

  return new Response('ok')
}
