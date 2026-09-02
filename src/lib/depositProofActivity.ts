'use client'

import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from './firebase'
import { useNotificationStore } from '@/store/notifications'
import { getDepositBankDetails, type CountryCode, type SelectedBank } from '@/config/depositBankAccounts'

export const DEPOSIT_PROOF_PENDING_KIND = 'DEPOSIT_PROOF_PENDING'
export const DEPOSIT_PROOF_FAILED_KIND = 'DEPOSIT_PROOF_FAILED'
export const DEPOSIT_CREDITED_KIND = 'DEPOSIT_CREDITED'

const DEPOSIT_AVATAR = '/assets/avatar - profile (4).png'

export function depositGroupId(country: 'MZ' | 'ZA', reference: string): string {
  return `deposit:${country}:${reference}`
}

function accountCurrency(country: 'MZ' | 'ZA'): 'MZN' | 'ZAR' {
  return country === 'ZA' ? 'ZAR' : 'MZN'
}

export function resolveDepositReference(country: CountryCode, bank?: SelectedBank): string {
  return getDepositBankDetails(country, bank).referencePrefix
}

export async function recordDepositProofPending(params: {
  outcome: 'uploaded' | 'failed'
  country: 'MZ' | 'ZA'
  bankId?: SelectedBank
  reference: string
  proofId?: string
}): Promise<void> {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return

  const currency = accountCurrency(params.country)
  const groupId = depositGroupId(params.country, params.reference)
  const eventId = `pending-${groupId}`
  const uploaded = params.outcome === 'uploaded'
  const title = uploaded ? 'Deposit proof uploaded' : 'Deposit proof not attached'
  const body = uploaded
    ? `A credit to your ${currency} account is pending verification.`
    : `Proof upload failed. A credit to your ${currency} account is still pending bank verification.`

  await setDoc(doc(getFirestoreDb(), 'users', user.uid, 'activityEvents', eventId), {
    id: eventId,
    kind: uploaded ? DEPOSIT_PROOF_PENDING_KIND : DEPOSIT_PROOF_FAILED_KIND,
    title,
    body,
    actorType: 'ai_manager',
    avatarKind: 'mzn_deposited',
    amountCurrency: currency,
    amountSign: 'credit',
    txId: groupId,
    depositReference: params.reference,
    bankId: params.bankId ?? null,
    bankCountry: params.country,
    proofId: params.proofId ?? null,
    createdAt: serverTimestamp(),
    recordingSource: 'USER_UI',
  })

  useNotificationStore.getState().pushNotification({
    id: eventId,
    kind: uploaded ? 'proof_of_payment' : 'payment_failed',
    title,
    body,
    direction: 'up',
    actor: {
      type: 'ai_manager',
      avatar: DEPOSIT_AVATAR,
      name: 'Ama',
    },
    routeOnTap: '/profile?activity=1',
  })
}
