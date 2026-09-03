'use client'

import { getFirebaseAuth } from '@/lib/firebase'
import { useNotificationStore } from '@/store/notifications'

let inFlight: Promise<void> | null = null

export function prefetchDiditSdk() {
  void import('@didit-protocol/sdk-web')
}

export function startDiditVerification(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = run().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run() {
  const user = getFirebaseAuth().currentUser
  if (!user) {
    useNotificationStore.getState().pushNotification({
      kind: 'payment_failed',
      title: 'Sign in required',
      body: 'Sign in to complete identity verification.',
      actor: { type: 'system', name: 'MozPaga' },
    })
    return
  }

  try {
    const [token, { DiditSdk }] = await Promise.all([
      user.getIdToken(),
      import('@didit-protocol/sdk-web'),
    ])
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.url) {
      throw new Error(data?.message || data?.error || 'Unable to start verification')
    }

    DiditSdk.shared.onComplete = (result) => {
      if (result.type === 'completed') {
        useNotificationStore.getState().pushNotification({
          kind: 'proof_of_payment',
          title: 'Verification submitted',
          body: 'We’ll update Compliance when Didit returns a decision.',
          actor: { type: 'system', name: 'MozPaga' },
        })
      }
    }
    await DiditSdk.shared.startVerification({ url: data.url })
  } catch (error: any) {
    useNotificationStore.getState().pushNotification({
      kind: 'payment_failed',
      title: 'Verification unavailable',
      body: String(error?.message || 'Unable to start verification.'),
      actor: { type: 'system', name: 'MozPaga' },
    })
  }
}
