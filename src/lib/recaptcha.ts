/**
 * reCAPTCHA verifier utility for Firebase Phone Authentication on web
 */

'use client'

import { getFirebaseAuth } from './firebase'
import { RecaptchaVerifier } from 'firebase/auth'

let recaptchaVerifier: RecaptchaVerifier | null = null
let isInitializing = false
let initPromise: Promise<RecaptchaVerifier> | null = null

export async function getRecaptchaVerifier(
  containerId?: string
): Promise<RecaptchaVerifier> {
  if (typeof window === 'undefined') {
    throw new Error('reCAPTCHA verifier can only be initialized client-side')
  }

  if (recaptchaVerifier) {
    return recaptchaVerifier
  }

  if (isInitializing && initPromise) {
    return initPromise
  }

  isInitializing = true
  initPromise = (async () => {
    try {
      const auth = getFirebaseAuth()

      recaptchaVerifier = new RecaptchaVerifier(auth, containerId || 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[reCAPTCHA] Verification successful')
          }
        },
        'expired-callback': () => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[reCAPTCHA] Verification expired, resetting')
          }
          resetRecaptchaVerifier()
        },
      })

      await recaptchaVerifier.render()

      if (process.env.NODE_ENV !== 'production') {
        console.log('[reCAPTCHA] Verifier initialized successfully')
      }

      isInitializing = false
      return recaptchaVerifier
    } catch (error) {
      isInitializing = false
      initPromise = null
      console.error('[reCAPTCHA] Failed to initialize verifier:', error)
      throw error
    }
  })()

  return initPromise
}

export function resetRecaptchaVerifier(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear()
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[reCAPTCHA] Error clearing verifier:', error)
      }
    }
    recaptchaVerifier = null
  }
  isInitializing = false
  initPromise = null
}

export function isRecaptchaInitialized(): boolean {
  return recaptchaVerifier !== null
}

