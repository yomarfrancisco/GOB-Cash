'use client'

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase'
import { DESK_TEAM } from '@/lib/desk/threadModel'
import { useActivityStore } from '@/store/activity'
import type { ActivityItem } from '@/store/activity'
import { useNotificationStore } from '@/store/notifications'

/** Bumped when the Day-1 fund card copy/layout changes. */
export const WELCOME_PAGA_EVENT_ID = 'welcome-fund-mzn-v3'

export const FUND_MZN_ACCOUNT_NUMBER = '4841111710001'
export const FUND_MZN_RECIPIENT = 'WOLF DIGITAL, LDA.'
export const FUND_MZN_BANK = 'Moza Banco'

/** Short dropdown copy — keep ≤2 lines in the top toast. */
export const WELCOME_PAGA_DROPDOWN_BODY =
  'Send MZN to Moza. Up to R100,000 liquid instantly.'

export function firstNameFromUser(params: {
  displayName?: string | null
  fullName?: string | null
  email?: string | null
  handle?: string | null
}): string {
  const fromName = String(params.fullName || params.displayName || '')
    .trim()
    .split(/\s+/)[0]
  if (fromName && !/^user$/i.test(fromName)) return fromName
  const handle = String(params.handle || '')
    .trim()
    .replace(/^@+/, '')
    .split(/[-_.]/)[0]
  if (handle && handle.length >= 2) {
    return handle.charAt(0).toUpperCase() + handle.slice(1).toLowerCase()
  }
  const emailLocal = String(params.email || '').split('@')[0]?.trim()
  if (emailLocal) {
    const token = emailLocal.split(/[._+-]/)[0] || emailLocal
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  }
  return 'there'
}

export function buildFundMznDeskSentence(firstName: string): string {
  const name = firstName.trim() || 'there'
  return (
    `Hi ${name}. PAGA helps you convert Metical to Rand instantly. ` +
    `Start by funding your conversion account; send meticais to this account. ` +
    `Up to R100,000 is liquid instantly, ready to pay. Anything above is liquid at 09:00 the next day.`
  )
}

/** @deprecated Prefer buildFundMznDeskSentence(firstName). */
export const FUND_MZN_DESK_SENTENCE = buildFundMznDeskSentence('there')

export const FUND_MZN_NOTE =
  'Most funds are liquid by 09:00 the next day. Some routes take up to 2 banking days.'

export const FUND_MZN_NOTE_PT =
  'A maior parte fica líquida até às 09:00 do dia seguinte; algumas rotas levam até 2 dias úteis.'

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

function clearWelcomeDone(uid: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(welcomeDoneStorageKey(uid))
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

export type WelcomeFundPayload = {
  title: string
  deskSentence: string
  deskLedgerRows: NonNullable<ActivityItem['deskLedgerRows']>
  deskNote: string
  deskNoteAlt: string
  dropdownBody: string
  fundAccountNumber: string
  paymentReference: string
}

export function buildWelcomePagaDeskPayload(params: {
  paymentReference: string
  userEmail?: string | null
  displayName?: string | null
  fullName?: string | null
  handle?: string | null
}): WelcomeFundPayload {
  const firstName = firstNameFromUser({
    displayName: params.displayName,
    fullName: params.fullName,
    email: params.userEmail,
    handle: params.handle,
  })
  return {
    title: 'Fund your MZN account',
    deskSentence: buildFundMznDeskSentence(firstName),
    deskLedgerRows: [
      {
        label: 'Recipient',
        value: FUND_MZN_RECIPIENT,
        valueStrong: true,
      },
      {
        label: 'Bank',
        value: FUND_MZN_BANK,
      },
      {
        label: 'Account',
        value: FUND_MZN_ACCOUNT_NUMBER,
        valueStrong: true,
        copyable: true,
      },
      {
        label: 'Reference',
        value: params.paymentReference,
        valueStrong: true,
        copyable: true,
      },
    ],
    deskNote: FUND_MZN_NOTE,
    deskNoteAlt: FUND_MZN_NOTE_PT,
    dropdownBody: WELCOME_PAGA_DROPDOWN_BODY,
    fundAccountNumber: FUND_MZN_ACCOUNT_NUMBER,
    paymentReference: params.paymentReference,
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

function pushLocalDeskIntro(payload: WelcomeFundPayload) {
  const createdAt = Date.now()
  useActivityStore.getState().add({
    id: WELCOME_PAGA_EVENT_ID,
    kind: 'CONVERSION_ROUTING_INSTRUCTION',
    title: payload.title,
    body: payload.deskSentence,
    deskSentence: payload.deskSentence,
    deskLedgerRows: payload.deskLedgerRows,
    deskNote: payload.deskNote,
    deskNoteAlt: payload.deskNoteAlt,
    routingAction: 'fund_intro',
    fundAccountNumber: payload.fundAccountNumber,
    paymentReference: payload.paymentReference,
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
    title: payload.title,
    body: payload.dropdownBody,
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

async function accountAlreadyHasWelcome(uid: string): Promise<boolean | null> {
  const eventRef = doc(getFirestoreDb(), 'users', uid, 'activityEvents', WELCOME_PAGA_EVENT_ID)
  try {
    const existingEvent = await getDoc(eventRef)
    return existingEvent.exists()
  } catch (error) {
    console.warn('[Welcome] Failed to check welcome post', error)
    return null
  }
}

/**
 * Once per account: Routing Manager fund intro on the desk + short toast.
 * Source of truth is Firestore for this uid (survives delete+recreate as a new uid).
 * Returning logins skip once the welcome event / flag exists — not via Auth age heuristics.
 */
export async function pushWelcomeSignInNotification(
  _titleOrOpts?: string | PushWelcomeOpts,
  maybeOpts?: PushWelcomeOpts
) {
  void _titleOrOpts
  void maybeOpts

  const user = getFirebaseAuth().currentUser
  if (!user) return

  if (useActivityStore.getState().items.some((item) => item.id === WELCOME_PAGA_EVENT_ID)) {
    markWelcomeDone(user.uid)
    return
  }

  let already = await accountAlreadyHasWelcome(user.uid)
  if (already === null) {
    // Auth/user doc can lag right after signup — retry once before giving up.
    await new Promise((resolve) => setTimeout(resolve, 600))
    already = await accountAlreadyHasWelcome(user.uid)
  }
  if (already === true) {
    markWelcomeDone(user.uid)
    return
  }
  if (already === null) {
    // Still can't read — do not mark done; auth listener may retry after ensureUserDocument.
    return
  }

  // Stale device flag after a wiped/recreated account or failed persist — allow seed.
  if (readWelcomeDone(user.uid)) {
    clearWelcomeDone(user.uid)
  }

  const paymentReference = buildWolfMozaPaymentReference()
  let fullName: string | null = null
  let handle: string | null = null
  try {
    const profileSnap = await getDoc(doc(getFirestoreDb(), 'users', user.uid))
    const profile = profileSnap.data() || {}
    fullName = typeof profile.fullName === 'string' ? profile.fullName : null
    handle =
      typeof profile.userHandle === 'string'
        ? profile.userHandle
        : typeof profile.handle === 'string'
          ? profile.handle
          : null
  } catch {
    // Greeting still works from Auth displayName / email.
  }
  const payload = buildWelcomePagaDeskPayload({
    paymentReference,
    userEmail: user.email,
    displayName: user.displayName,
    fullName,
    handle,
  })

  pushLocalDeskIntro(payload)
  markWelcomeDone(user.uid)

  const eventRef = doc(getFirestoreDb(), 'users', user.uid, 'activityEvents', WELCOME_PAGA_EVENT_ID)
  const userRef = doc(getFirestoreDb(), 'users', user.uid)

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
      deskNote: payload.deskNote,
      deskNoteAlt: payload.deskNoteAlt,
      fundAccountNumber: payload.fundAccountNumber,
      paymentReference: payload.paymentReference,
      actorType: 'ai_manager',
      deskSpeaker: 'sam',
      routingAction: 'fund_intro',
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
