/**
 * One-shot KYC invite SMS after the user's first MZN funding credit.
 * Creates a Didit session and texts the verification URL via Twilio Messaging.
 */

import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'

const diditApiKey = defineSecret('DIDIT_API_KEY')
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID')
const twilioApiKeySid = defineSecret('TWILIO_API_KEY_SID')
const twilioApiKeySecret = defineSecret('TWILIO_API_KEY_SECRET')
const twilioMessagingFrom = defineSecret('TWILIO_MESSAGING_FROM')
const appPublicUrl = defineSecret('APP_PUBLIC_URL')

/** Same workflow as Next.js /api/verify */
const DIDIT_KYC_WORKFLOW_ID = 'ddbab46a-d544-4907-9cfe-997a18245e6a'
const DIDIT_SESSION_URL = 'https://verification.didit.me/v3/session/'

const KYC_INVITE_FLAG = 'kycFundInviteSmsSentAt'
const APPROVED_STATUSES = new Set(['approved', 'Approved'])

function db() {
  return admin.firestore()
}

function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const phone = raw.replace(/[^\d+]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null
  return phone
}

async function resolveUserPhone(userId: string): Promise<string | null> {
  try {
    const authUser = await admin.auth().getUser(userId)
    const fromAuth = normalizePhone(authUser.phoneNumber)
    if (fromAuth) return fromAuth
  } catch {
    // fall through to Firestore
  }

  const snap = await db().collection('users').doc(userId).get()
  const data = snap.data() || {}
  return (
    normalizePhone(data.phoneE164) ||
    normalizePhone(data.phoneNumber) ||
    normalizePhone(data.phone) ||
    null
  )
}

async function createDiditSession(userId: string): Promise<{ url: string; sessionId: string | null }> {
  const callbackBase = (appPublicUrl.value() || 'https://gobankless.app').replace(/\/$/, '')
  const res = await fetch(DIDIT_SESSION_URL, {
    method: 'POST',
    headers: {
      'x-api-key': diditApiKey.value(),
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      workflow_id: DIDIT_KYC_WORKFLOW_ID,
      vendor_data: userId,
      callback: `${callbackBase}/`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[kycFundInvite] Didit session failed', {
      status: res.status,
      detail: detail.slice(0, 200),
    })
    throw new Error(`didit_session_failed_${res.status}`)
  }

  const session = (await res.json()) as {
    url?: string
    session_id?: string
    status?: string
  }
  if (!session.url) throw new Error('didit_session_missing_url')

  const sessionStatus = typeof session.status === 'string' ? session.status : 'Not Started'
  await db()
    .collection('users')
    .doc(userId)
    .set(
      {
        kycSessionId: session.session_id ?? null,
        kycSessionStatus: sessionStatus,
        kycStatus: 'in_progress',
        kycUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

  return { url: session.url, sessionId: session.session_id ?? null }
}

async function sendTwilioSms(to: string, body: string): Promise<void> {
  const accountSid = twilioAccountSid.value()
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const auth = Buffer.from(
    `${twilioApiKeySid.value()}:${twilioApiKeySecret.value()}`
  ).toString('base64')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: twilioMessagingFrom.value(),
      Body: body,
    }).toString(),
  })

  const json = (await res.json().catch(() => ({}))) as { message?: string; code?: number | string; sid?: string }
  if (!res.ok) {
    console.error('[kycFundInvite] Twilio SMS failed', {
      status: res.status,
      code: json.code ?? null,
      message: json.message ?? null,
    })
    throw new Error(json.message || `twilio_sms_failed_${res.status}`)
  }
  console.log('[kycFundInvite] SMS sent', { sid: json.sid ?? null, toSuffix: to.slice(-4) })
}

/**
 * Fire once when cashMZN first crosses above zero.
 * Safe to call on every credit — uses a transactional claim flag.
 */
export async function maybeSendFirstFundKycSms(params: {
  userId: string
  beforeBalanceMzn: number
  afterBalanceMzn: number
}): Promise<{ sent: boolean; skipped?: string }> {
  const { userId, beforeBalanceMzn, afterBalanceMzn } = params
  if (!(beforeBalanceMzn <= 0.005 && afterBalanceMzn > 0.005)) {
    return { sent: false, skipped: 'not_first_positive_crossing' }
  }

  const userRef = db().collection('users').doc(userId)
  const claimed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    const data = snap.data() || {}
    if (data[KYC_INVITE_FLAG]) return false

    const status = String(data.kycStatus || data.kycSessionStatus || '').toLowerCase()
    if (APPROVED_STATUSES.has(data.kycStatus) || APPROVED_STATUSES.has(data.kycSessionStatus) || status === 'approved') {
      tx.set(
        userRef,
        {
          [KYC_INVITE_FLAG]: admin.firestore.FieldValue.serverTimestamp(),
          kycFundInviteSmsSkipped: 'already_approved',
        },
        { merge: true }
      )
      return false
    }

    tx.set(
      userRef,
      {
        [KYC_INVITE_FLAG]: admin.firestore.FieldValue.serverTimestamp(),
        kycFundInviteSmsStatus: 'pending',
      },
      { merge: true }
    )
    return true
  })

  if (!claimed) {
    return { sent: false, skipped: 'already_sent_or_approved' }
  }

  try {
    const phone = await resolveUserPhone(userId)
    if (!phone) {
      await userRef.set(
        {
          kycFundInviteSmsStatus: 'skipped_no_phone',
          kycFundInviteSmsError: 'no_phone_on_account',
        },
        { merge: true }
      )
      return { sent: false, skipped: 'no_phone' }
    }

    const { url, sessionId } = await createDiditSession(userId)
    const body =
      `PAGA: Complete identity verification to unlock withdrawals and larger settlements. ` +
      `Open this secure KYC link: ${url}`

    await sendTwilioSms(phone, body)

    await userRef.set(
      {
        kycFundInviteSmsStatus: 'sent',
        kycFundInviteSmsTo: phone,
        kycFundInviteSessionId: sessionId,
        kycFundInviteSmsSentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await userRef.set(
      {
        kycFundInviteSmsStatus: 'failed',
        kycFundInviteSmsError: message.slice(0, 300),
        // Clear claim so a later credit / manual retry can try again if create failed early.
        // Only clear if we never successfully sent — keep flag if we want strict one-shot.
        // Keep flag set to avoid SMS storms; ops can clear kycFundInviteSmsSentAt to retry.
      },
      { merge: true }
    )
    console.error('[kycFundInvite] failed', { userId, message })
    return { sent: false, skipped: 'error' }
  }
}

export const firstFundKycSmsSecrets = [
  diditApiKey,
  twilioAccountSid,
  twilioApiKeySid,
  twilioApiKeySecret,
  twilioMessagingFrom,
  appPublicUrl,
]
