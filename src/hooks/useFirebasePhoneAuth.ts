/**
 * Hook for Firebase Phone Authentication
 */

'use client'

import { useState } from 'react'
import { 
  signInWithPhoneNumber, 
  type ConfirmationResult,
  type User 
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { getRecaptchaVerifier, resetRecaptchaVerifier } from '@/lib/recaptcha'
import { useAuthStore } from '@/store/auth'
import { useNotificationStore } from '@/store/notifications'

export function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/[^\d+]/g, '')
  
  if (!normalized.startsWith('+')) {
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1)
    }
    normalized = '+27' + normalized
  }
  
  return normalized
}

export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone)
  return /^\+[1-9]\d{1,14}$/.test(normalized)
}

export function useFirebasePhoneAuth() {
  const { closeAllAuth } = useAuthStore()
  const { pushNotification } = useNotificationStore()
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)

  const sendVerificationCode = async (
    phoneNumber: string
  ): Promise<ConfirmationResult> => {
    if (typeof window === 'undefined') {
      throw new Error('sendVerificationCode must be called client-side only')
    }

    setIsSendingCode(true)

    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber)
      
      if (!isValidPhoneNumber(normalizedPhone)) {
        throw new Error('Invalid phone number format. Please use international format (e.g., +27123456789)')
      }

      const recaptchaVerifier = await getRecaptchaVerifier()
      const auth = getFirebaseAuth()

      const confirmationResult = await signInWithPhoneNumber(
        auth,
        normalizedPhone,
        recaptchaVerifier
      )

      if (process.env.NODE_ENV !== 'production') {
        console.log('[FirebasePhoneAuth] SMS code sent successfully to', normalizedPhone)
      }

      setIsSendingCode(false)
      return confirmationResult
    } catch (error: any) {
      setIsSendingCode(false)
      resetRecaptchaVerifier()

      let errorMessage = 'Failed to send verification code. Please try again.'
      
      if (error?.code === 'auth/invalid-phone-number') {
        errorMessage = 'Invalid phone number. Please check and try again.'
      } else if (error?.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.'
      } else if (error?.code === 'auth/quota-exceeded') {
        errorMessage = 'SMS quota exceeded. Please try again later.'
      } else if (error?.message) {
        errorMessage = error.message
      }

      console.error('[FirebasePhoneAuth] Failed to send SMS code:', error)
      throw new Error(errorMessage)
    }
  }

  const verifyCode = async (
    confirmationResult: ConfirmationResult,
    code: string
  ): Promise<User> => {
    if (typeof window === 'undefined') {
      throw new Error('verifyCode must be called client-side only')
    }

    setIsVerifyingCode(true)

    try {
      const result = await confirmationResult.confirm(code)
      const user = result.user

      if (process.env.NODE_ENV !== 'production') {
        console.log('[FirebasePhoneAuth] Code verified successfully, user:', user.uid)
      }

      closeAllAuth()

      pushNotification({
        kind: 'payment_received',
        title: 'Signed in with phone',
        body: 'Welcome!',
        actor: { type: 'system' },
      })

      setIsVerifyingCode(false)
      return user
    } catch (error: any) {
      setIsVerifyingCode(false)

      let errorMessage = 'Invalid verification code. Please try again.'
      
      if (error?.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid code. Please check and try again.'
      } else if (error?.code === 'auth/code-expired') {
        errorMessage = 'Code expired. Please request a new code.'
      } else if (error?.code === 'auth/session-expired') {
        errorMessage = 'Session expired. Please start over.'
      } else if (error?.message) {
        errorMessage = error.message
      }

      console.error('[FirebasePhoneAuth] Failed to verify code:', error)
      throw new Error(errorMessage)
    }
  }

  return {
    sendVerificationCode,
    verifyCode,
    isSendingCode,
    isVerifyingCode,
    normalizePhoneNumber,
    isValidPhoneNumber,
  }
}

