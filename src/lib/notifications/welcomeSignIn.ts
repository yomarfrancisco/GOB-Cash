'use client'

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import { useNotificationStore } from '@/store/notifications'
import { useNotificationsStore } from '@/state/notifications'

export const WELCOME_PAGA_EVENT_ID = 'welcome-paga-intro'

/** Payment ref pattern: WOLFMOZA + YYYYMMDD + 3-digit sequence. */
export function buildWolfMozaPaymentReference(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const seq = String((Date.now() % 900) + 100)
  return `WOLFMOZA${y}${m}${d}${seq}`
}

export function buildWelcomePagaBody(params: {
  paymentReference: string
  userEmail?: string | null
}): string {
  const emailHint = params.userEmail?.trim() || '[user-email]'
  // Single newlines only — desk copy collapses double whitespace.
  // Prefer single newlines — desk copy collapses runs of whitespace.
  return [
    'PAGA is a liquidity-adaptive dollar for closed currency markets. Fund your MZN account to buy dollars. PAGA converts your MZN into ZAR or USD within 24 hours. Once your payment is received, the desk will update your available MZN balance immediately and begin routing FX.',
    'WOLF DIGITAL, LDA.',
    'Moza Banco',
    'Account: 4841111710001',
    'NIB: 003400004841111710132',
    `Payment reference: ${params.paymentReference}`,
    `Email your payout account to payout@mozpaga.xyz, title: ${emailHint}. We'll use this account for all your payouts going forward.`,
  ].join('\n')
}

function isLikelyNewUser(): boolean {
  const user = getFirebaseAuth().currentUser
  if (!user?.metadata?.creationTime || !user.metadata.lastSignInTime) return false
  const created = Date.parse(user.metadata.creationTime)
  const last = Date.parse(user.metadata.lastSignInTime)
  if (!Number.isFinite(created) || !Number.isFinite(last)) return false
  // New accounts have creation ≈ first sign-in (within 2 minutes).
  return Math.abs(last - created) < 120_000
}

/**
 * After auth: new sign-ups get a Routing Manager desk post (fund / payout intro).
 * Returning sessions get a short welcome toast only — no KYC nudge.
 */
export async function pushWelcomeSignInNotification(title: string) {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return

  if (!isLikelyNewUser()) {
    useNotificationStore.getState().pushNotification({
      kind: 'payment_received',
      title,
      body: 'Welcome.',
      actor: {
        type: 'ai_manager',
        avatar: DESK_TEAM.sam.avatar,
        name: DESK_TEAM.sam.name,
      },
    })
    return
  }

  const eventRef = doc(getFirestoreDb(), 'users', user.uid, 'activityEvents', WELCOME_PAGA_EVENT_ID)
  try {
    const existing = await getDoc(eventRef)
    if (existing.exists()) {
      useNotificationsStore.getState().openNotifications()
      return
    }
  } catch (error) {
    console.warn('[Welcome] Failed to check welcome post', error)
  }

  const paymentReference = buildWolfMozaPaymentReference()
  const body = buildWelcomePagaBody({
    paymentReference,
    userEmail: user.email,
  })
  const postTitle = 'What is PAGA?'

  try {
    await setDoc(eventRef, {
      id: WELCOME_PAGA_EVENT_ID,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      title: postTitle,
      body,
      actorType: 'ai_manager',
      deskSpeaker: 'sam',
      paymentReference,
      createdAt: serverTimestamp(),
      recordingSource: 'USER_UI',
    })
  } catch (error) {
    console.warn('[Welcome] Failed to write Routing Manager intro', error)
  }

  useNotificationStore.getState().pushNotification({
    id: WELCOME_PAGA_EVENT_ID,
    kind: 'ai_trade',
    title: postTitle,
    body: 'Fund MZN · Moza Banco details on the desk.',
    actor: {
      type: 'ai_manager',
      avatar: DESK_TEAM.sam.avatar,
      name: DESK_TEAM.sam.name,
    },
    routeOnTap: '/?desk=1',
    skipActivityStore: true,
  })

  // Surface the desk so the Routing Manager post is visible immediately.
  useNotificationsStore.getState().openNotifications()
}
