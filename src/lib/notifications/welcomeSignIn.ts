'use client'

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import { useActivityStore } from '@/store/activity'
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

function pushLocalDeskIntro(params: {
  title: string
  body: string
  paymentReference: string
}) {
  const createdAt = Date.now()
  useActivityStore.getState().add({
    id: WELCOME_PAGA_EVENT_ID,
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    title: params.title,
    body: params.body,
    actor: {
      type: 'ai',
      name: DESK_TEAM.sam.name,
      avatarUrl: DESK_TEAM.sam.avatar,
    },
    deskSpeaker: 'sam',
    createdAt,
  })

  useNotificationStore.getState().pushNotification({
    id: `${WELCOME_PAGA_EVENT_ID}-toast`,
    kind: 'ai_trade',
    title: params.title,
    body: 'Fund MZN · Moza Banco details below.',
    actor: {
      type: 'ai_manager',
      avatar: DESK_TEAM.sam.avatar,
      name: DESK_TEAM.sam.name,
    },
    routeOnTap: '/?desk=1',
    skipActivityStore: true,
  })
}

/**
 * After auth: first session without a welcome desk post gets the Routing Manager
 * fund/payout intro. Later sign-ins stay quiet (no KYC nudge).
 */
export async function pushWelcomeSignInNotification(_title: string) {
  const user = getFirebaseAuth().currentUser
  if (!user) return

  const eventRef = doc(getFirestoreDb(), 'users', user.uid, 'activityEvents', WELCOME_PAGA_EVENT_ID)

  try {
    const existing = await getDoc(eventRef)
    if (existing.exists()) return
  } catch (error) {
    console.warn('[Welcome] Failed to check welcome post', error)
  }

  // Already seeded locally this session (e.g. double auth callback).
  const local = useActivityStore.getState().items.find((item) => item.id === WELCOME_PAGA_EVENT_ID)
  if (local) {
    useNotificationsStore.getState().openNotifications()
    return
  }

  const paymentReference = buildWolfMozaPaymentReference()
  const body = buildWelcomePagaBody({
    paymentReference,
    userEmail: user.email,
  })
  const postTitle = 'What is PAGA?'

  // Seed the desk immediately so the user never only sees a bare "Welcome."
  pushLocalDeskIntro({ title: postTitle, body, paymentReference })
  useNotificationsStore.getState().openNotifications()

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
    console.warn('[Welcome] Failed to persist Routing Manager intro', error)
  }
}
