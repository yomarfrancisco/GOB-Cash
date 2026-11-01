'use client'

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import { useActivityStore } from '@/store/activity'
import type { ActivityItem } from '@/store/activity'
import { useNotificationStore } from '@/store/notifications'

export const WELCOME_PAGA_EVENT_ID = 'welcome-paga-intro-v2'

/** Short dropdown copy — keep ≤2 lines in the top toast. */
export const WELCOME_PAGA_DROPDOWN_BODY =
  'Fund MZN at Moza Banco to buy dollars within 24 hours.'

function welcomeDoneStorageKey(uid: string): string {
  return `welcome-paga-done:${uid}`
}

function readWelcomeDone(uid: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(welcomeDoneStorageKey(uid)) === '1'
  } catch {
    return false
  }
}

function markWelcomeDone(uid: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(welcomeDoneStorageKey(uid), '1')
  } catch {
    // private mode
  }
}

/** True only for a brand-new account on this sign-in, not returning logins. */
export function isFirstSignupSession(
  user: Pick<User, 'metadata'>,
  opts?: { isNewUser?: boolean }
): boolean {
  if (opts?.isNewUser === true) return true
  const created = Date.parse(user.metadata.creationTime || '')
  const lastSignIn = Date.parse(user.metadata.lastSignInTime || '')
  if (!Number.isFinite(created) || !Number.isFinite(lastSignIn)) return false
  // creation ≈ last sign-in means this is the account's first auth session
  const sameSession = Math.abs(lastSignIn - created) < 90_000
  const recentlyCreated = Date.now() - created < 15 * 60_000
  return sameSession && recentlyCreated
}

/** Payment ref pattern: WOLFMOZA + YYYYMMDD + 3-digit sequence. */
export function buildWolfMozaPaymentReference(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const seq = String((Date.now() % 900) + 100)
  return `WOLFMOZA${y}${m}${d}${seq}`
}

export function buildWelcomePagaDeskPayload(params: {
  paymentReference: string
  userEmail?: string | null
}): {
  title: string
  deskSentence: string
  deskLedgerRows: NonNullable<ActivityItem['deskLedgerRows']>
  dropdownBody: string
} {
  const emailHint = params.userEmail?.trim() || '[user-email]'
  return {
    title: 'What is PAGA?',
    deskSentence:
      'PAGA is a liquidity-adaptive dollar for licensed FX operators in closed currency markets. Fund your MZN account to buy dollars. PAGA converts your MZN into ZAR or USD within 24 hours. Once your payment is received, the desk will update your available MZN balance immediately and begin routing FX.',
    deskLedgerRows: [
      {
        label: 'Recipient',
        value: 'WOLF DIGITAL, LDA.',
        valueStrong: true,
      },
      {
        label: 'Bank',
        value: 'Moza Banco',
      },
      {
        label: 'Account',
        value: '4841111710001',
        valueStrong: true,
      },
      {
        label: 'NIB',
        value: '003400004841111710132',
      },
      {
        label: 'SWIFT',
        value: 'MOZAMZMA',
        valueStrong: true,
      },
      {
        label: 'IBAN MZN',
        value: 'MZ59003400004841111710132',
        valueStrong: true,
      },
      {
        label: 'Reference',
        value: params.paymentReference,
        valueStrong: true,
      },
      {
        label: 'Payouts',
        value: 'payout@mozpaga.xyz',
        valueStrong: true,
        secondLine: `Email your payout account · title: ${emailHint}`,
      },
    ],
    dropdownBody: WELCOME_PAGA_DROPDOWN_BODY,
  }
}

/** @deprecated Prefer buildWelcomePagaDeskPayload — kept for older tests. */
export function buildWelcomePagaBody(params: {
  paymentReference: string
  userEmail?: string | null
}): string {
  const payload = buildWelcomePagaDeskPayload(params)
  return [
    payload.deskSentence,
    ...payload.deskLedgerRows.map((row) =>
      row.secondLine ? `${row.label}: ${row.value} (${row.secondLine})` : `${row.label}: ${row.value}`
    ),
  ].join('\n')
}

function pushLocalDeskIntro(params: {
  title: string
  deskSentence: string
  deskLedgerRows: NonNullable<ActivityItem['deskLedgerRows']>
  dropdownBody: string
}) {
  const createdAt = Date.now()
  useActivityStore.getState().add({
    id: WELCOME_PAGA_EVENT_ID,
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    title: params.title,
    body: params.deskSentence,
    deskSentence: params.deskSentence,
    deskLedgerRows: params.deskLedgerRows,
    actor: {
      type: 'ai',
      name: DESK_TEAM.sam.name,
      avatarUrl: DESK_TEAM.sam.avatar,
    },
    deskSpeaker: 'sam',
    createdAt,
  })

  // Dropdown only — desk stays closed until the user opens it.
  useNotificationStore.getState().pushNotification({
    id: `${WELCOME_PAGA_EVENT_ID}-toast`,
    kind: 'ai_trade',
    title: params.title,
    body: params.dropdownBody,
    actor: {
      type: 'ai_manager',
      avatar: DESK_TEAM.sam.avatar,
      name: DESK_TEAM.sam.name,
    },
    skipActivityStore: true,
  })
}

export type PushWelcomeOpts = {
  /** From Firebase additionalUserInfo.isNewUser when available. */
  isNewUser?: boolean
}

/**
 * First signup only: Routing Manager fund/payout intro on the desk + short toast.
 * Returning logins must never re-toast or re-seed.
 */
export async function pushWelcomeSignInNotification(
  _titleOrOpts?: string | PushWelcomeOpts,
  maybeOpts?: PushWelcomeOpts
) {
  const opts: PushWelcomeOpts =
    typeof _titleOrOpts === 'object' && _titleOrOpts
      ? _titleOrOpts
      : maybeOpts || {}

  const user = getFirebaseAuth().currentUser
  if (!user) return

  if (readWelcomeDone(user.uid)) return

  // Returning accounts: never seed. Remember locally so we skip next time too.
  if (!isFirstSignupSession(user, opts)) {
    markWelcomeDone(user.uid)
    return
  }

  const eventRef = doc(getFirestoreDb(), 'users', user.uid, 'activityEvents', WELCOME_PAGA_EVENT_ID)
  const userRef = doc(getFirestoreDb(), 'users', user.uid)

  try {
    const [existingEvent, userSnap] = await Promise.all([getDoc(eventRef), getDoc(userRef)])
    if (existingEvent.exists() || userSnap.data()?.welcomePagaIntroAt) {
      markWelcomeDone(user.uid)
      return
    }
  } catch (error) {
    // Fail closed — do not toast returning sessions when the check cannot run.
    console.warn('[Welcome] Failed to check welcome post', error)
    return
  }

  if (useActivityStore.getState().items.some((item) => item.id === WELCOME_PAGA_EVENT_ID)) {
    markWelcomeDone(user.uid)
    return
  }

  const paymentReference = buildWolfMozaPaymentReference()
  const payload = buildWelcomePagaDeskPayload({
    paymentReference,
    userEmail: user.email,
  })

  pushLocalDeskIntro({
    title: payload.title,
    deskSentence: payload.deskSentence,
    deskLedgerRows: payload.deskLedgerRows,
    dropdownBody: payload.dropdownBody,
  })
  markWelcomeDone(user.uid)

  try {
    await setDoc(eventRef, {
      id: WELCOME_PAGA_EVENT_ID,
      kind: 'CONVERSION_ROUTING_INSTRUCTION',
      title: payload.title,
      body: payload.deskSentence,
      dropdownTitle: payload.title,
      dropdownBody: payload.dropdownBody,
      deskSentence: payload.deskSentence,
      deskLedgerRows: payload.deskLedgerRows,
      actorType: 'ai_manager',
      deskSpeaker: 'sam',
      paymentReference,
      createdAt: serverTimestamp(),
      recordingSource: 'USER_UI',
    })
    await updateDoc(userRef, { welcomePagaIntroAt: serverTimestamp() }).catch(async () => {
      await setDoc(userRef, { welcomePagaIntroAt: serverTimestamp() }, { merge: true })
    })
  } catch (error) {
    console.warn('[Welcome] Failed to persist Routing Manager intro', error)
  }
}
