'use client'

import { doc, getDoc } from 'firebase/firestore'
import { DEFAULT_COMPLIANCE_PERCENT } from '@/lib/didit'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { GOB_ADMIN_AVATAR } from '@/lib/notifications/identityResolver'
import { useNotificationStore } from '@/store/notifications'

export const KYC_NUDGE_THRESHOLD = 30

export const WELCOME_BODY = 'Welcome.'
export const WELCOME_KYC_BODY =
  'Welcome. Update your compliance status by updating your required KYC documents.'

async function readKycPercent(uid: string): Promise<number> {
  try {
    const snap = await getDoc(doc(getFirestoreDb(), 'users', uid))
    const percent = snap.data()?.kycPercent
    if (typeof percent === 'number' && Number.isFinite(percent)) return percent
  } catch (error) {
    console.warn('[Welcome] Failed to read KYC percent', error)
  }
  return DEFAULT_COMPLIANCE_PERCENT
}

export async function pushWelcomeSignInNotification(title: string) {
  const uid = getFirebaseAuth().currentUser?.uid
  const percent = uid ? await readKycPercent(uid) : DEFAULT_COMPLIANCE_PERCENT
  const needsKyc = percent < KYC_NUDGE_THRESHOLD

  useNotificationStore.getState().pushNotification({
    kind: 'payment_received',
    title,
    body: needsKyc ? WELCOME_KYC_BODY : WELCOME_BODY,
    actor: { type: 'system', avatar: GOB_ADMIN_AVATAR, name: 'MozPaga' },
    routeOnTap: needsKyc ? '/profile' : undefined,
    hasKycLink: needsKyc,
  })
}
