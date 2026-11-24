/**
 * Client helpers for Twilio Verify phone OTP (Cloud Functions).
 */

'use client'

import { getApp } from 'firebase/app'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseAuth } from '@/lib/firebase'
import { signInWithCustomToken, getAdditionalUserInfo } from 'firebase/auth'
import { pushWelcomeSignInNotification } from '@/lib/notifications/welcomeSignIn'
import { useAuthStore } from '@/store/auth'

function getFunctionsInstance() {
  const app = getApp()
  return getFunctions(app, 'us-central1')
}

export async function twilioSendOtp(phoneE164: string): Promise<{ ok: true; phoneE164: string }> {
  const fn = httpsCallable(getFunctionsInstance(), 'auth_twilioSendOtp')
  const res = await fn({ phoneE164 })
  const data = (res.data || {}) as { ok?: boolean; phoneE164?: string }
  if (!data.ok) {
    throw new Error('Failed to send verification code')
  }
  return { ok: true, phoneE164: data.phoneE164 || phoneE164 }
}

export async function twilioVerifyOtpAndSignIn(
  phoneE164: string,
  code: string
): Promise<{ uid: string }> {
  const fn = httpsCallable(getFunctionsInstance(), 'auth_twilioVerifyOtp')
  const res = await fn({ phoneE164, code })
  const data = (res.data || {}) as {
    ok?: boolean
    customToken?: string
    uid?: string
  }
  if (!data.ok || !data.customToken) {
    throw new Error('Verification failed')
  }

  const auth = getFirebaseAuth()
  const credential = await signInWithCustomToken(auth, data.customToken)
  useAuthStore.getState().closeAllAuth()

  void pushWelcomeSignInNotification({
    isNewUser: Boolean(getAdditionalUserInfo(credential)?.isNewUser),
  })

  return { uid: credential.user.uid }
}

export function mapTwilioCallableError(error: any): string {
  const code = String(error?.code || '')
  const message = String(error?.message || '')

  if (code.includes('resource-exhausted') || message.toLowerCase().includes('too many')) {
    return 'Too many requests. Please try again later.'
  }
  if (code.includes('invalid-argument')) {
    return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)\s*$/, '') || 'Invalid phone number'
  }
  if (code.includes('permission-denied')) {
    return 'Invalid or expired code'
  }
  if (message) {
    return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)\s*$/, '')
  }
  return 'Something went wrong. Please try again.'
}
