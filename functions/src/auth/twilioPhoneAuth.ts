/**
 * Twilio Verify OTP for phone sign-in (MZ/ZA).
 * Unauthenticated callables → custom Firebase token after successful check.
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { defineSecret } from 'firebase-functions/params'
import { createHash } from 'crypto'

const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID')
const twilioApiKeySid = defineSecret('TWILIO_API_KEY_SID')
const twilioApiKeySecret = defineSecret('TWILIO_API_KEY_SECRET')
const twilioVerifyServiceSid = defineSecret('TWILIO_VERIFY_SERVICE_SID')

const ALLOWED_E164 = /^\+(258\d{8,9}|27\d{9})$/
const SEND_COOLDOWN_MS = 45_000
const MAX_SENDS_PER_PHONE_HOUR = 8
const MAX_SENDS_PER_IP_HOUR = 20

type TwilioVerifyResponse = {
  status?: string
  valid?: boolean
  sid?: string
  message?: string
  code?: number | string
}

function db() {
  return admin.firestore()
}

function normalizeE164(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Phone number required')
  }
  const phone = raw.replace(/[^\d+]/g, '')
  if (!ALLOWED_E164.test(phone)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Use a Mozambique (+258) or South Africa (+27) mobile number'
    )
  }
  return phone
}

function normalizeCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Code required')
  }
  const code = raw.replace(/\D/g, '')
  if (code.length < 4 || code.length > 10) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid verification code')
  }
  return code
}

function clientIp(context: functions.https.CallableContext): string {
  const raw =
    (context.rawRequest?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    context.rawRequest?.ip ||
    'unknown'
  return raw.slice(0, 64)
}

function phoneDocId(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 32)
}

async function assertSendAllowed(phone: string, ip: string): Promise<void> {
  const now = Date.now()
  const phoneRef = db().collection('otpRateLimits').doc(`phone_${phoneDocId(phone)}`)
  const ipRef = db().collection('otpRateLimits').doc(`ip_${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`)

  await db().runTransaction(async (tx) => {
    const [phoneSnap, ipSnap] = await Promise.all([tx.get(phoneRef), tx.get(ipRef)])
    const phoneData = phoneSnap.data() || {}
    const ipData = ipSnap.data() || {}

    const lastSendAt = typeof phoneData.lastSendAtMs === 'number' ? phoneData.lastSendAtMs : 0
    if (now - lastSendAt < SEND_COOLDOWN_MS) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Please wait a moment before requesting another code'
      )
    }

    const phoneWindowStart = typeof phoneData.windowStartMs === 'number' ? phoneData.windowStartMs : now
    let phoneCount = typeof phoneData.windowCount === 'number' ? phoneData.windowCount : 0
    let nextPhoneWindow = phoneWindowStart
    if (now - phoneWindowStart > 3_600_000) {
      phoneCount = 0
      nextPhoneWindow = now
    }
    if (phoneCount >= MAX_SENDS_PER_PHONE_HOUR) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many codes for this number. Try again later.'
      )
    }

    const ipWindowStart = typeof ipData.windowStartMs === 'number' ? ipData.windowStartMs : now
    let ipCount = typeof ipData.windowCount === 'number' ? ipData.windowCount : 0
    let nextIpWindow = ipWindowStart
    if (now - ipWindowStart > 3_600_000) {
      ipCount = 0
      nextIpWindow = now
    }
    if (ipCount >= MAX_SENDS_PER_IP_HOUR) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many requests. Please try again later.'
      )
    }

    tx.set(
      phoneRef,
      {
        lastSendAtMs: now,
        windowStartMs: nextPhoneWindow,
        windowCount: phoneCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    tx.set(
      ipRef,
      {
        windowStartMs: nextIpWindow,
        windowCount: ipCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  })
}

async function twilioVerifyRequest(
  path: string,
  body: Record<string, string>
): Promise<TwilioVerifyResponse> {
  const serviceSid = twilioVerifyServiceSid.value()
  const url = `https://verify.twilio.com/v2/Services/${serviceSid}/${path}`
  const auth = Buffer.from(
    `${twilioApiKeySid.value()}:${twilioApiKeySecret.value()}`
  ).toString('base64')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  })

  const json = (await res.json().catch(() => ({}))) as TwilioVerifyResponse
  if (!res.ok) {
    const message =
      typeof json.message === 'string' && json.message
        ? json.message
        : `Twilio Verify failed (${res.status})`
    console.error('[twilioPhoneAuth] Twilio error', {
      status: res.status,
      code: json.code ?? null,
      path,
    })
    if (res.status === 429) {
      throw new functions.https.HttpsError('resource-exhausted', 'Too many requests. Please try again later.')
    }
    throw new functions.https.HttpsError('internal', message)
  }
  return json
}

async function getOrCreateUserForPhone(phone: string): Promise<string> {
  try {
    const existing = await admin.auth().getUserByPhoneNumber(phone)
    return existing.uid
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found') throw error
  }

  const created = await admin.auth().createUser({
    phoneNumber: phone,
  })
  return created.uid
}

const secrets = [twilioAccountSid, twilioApiKeySid, twilioApiKeySecret, twilioVerifyServiceSid]

export const auth_twilioSendOtp = functions
  .region('us-central1')
  .runWith({ secrets, timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    // Account SID is reserved for future Messaging fallbacks; Verify uses API key auth.
    void twilioAccountSid.value()

    const phone = normalizeE164(data?.phoneE164 ?? data?.phone)
    const ip = clientIp(context)
    await assertSendAllowed(phone, ip)

    const result = await twilioVerifyRequest('Verifications', {
      To: phone,
      Channel: 'sms',
    })

    console.log('[twilioPhoneAuth] send ok', {
      status: result.status ?? null,
      phoneSuffix: phone.slice(-4),
    })

    return {
      ok: true,
      status: result.status ?? 'pending',
      phoneE164: phone,
    }
  })

export const auth_twilioVerifyOtp = functions
  .region('us-central1')
  .runWith({ secrets, timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    void twilioAccountSid.value()
    void context

    const phone = normalizeE164(data?.phoneE164 ?? data?.phone)
    const code = normalizeCode(data?.code)

    const check = await twilioVerifyRequest('VerificationCheck', {
      To: phone,
      Code: code,
    })

    const approved =
      check.status === 'approved' || check.valid === true

    if (!approved) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid or expired code')
    }

    const uid = await getOrCreateUserForPhone(phone)
    const customToken = await admin.auth().createCustomToken(uid, {
      phoneAuthProvider: 'twilio',
    })

    console.log('[twilioPhoneAuth] verify ok', {
      uid,
      phoneSuffix: phone.slice(-4),
    })

    return {
      ok: true,
      customToken,
      uid,
      phoneE164: phone,
    }
  })
