'use client'

/**
 * Client gate for /desk/e0.
 * Requires Firebase Auth + ROUTING_ADMIN_UID (AGENT_UID), then loads the
 * server-gated fixture over a Bearer-authenticated API. No Firestore evidence IO.
 */

import { useEffect, useState } from 'react'
import { getFirebaseAuth } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth'
import { AGENT_UID } from '@/types/transactions'
import { E0_ISOLATION } from '@/lib/belief/e0Isolation'
import type { E0Moment } from '@/lib/belief/e0Types'
import E0DeskThread from '@/components/belief/E0DeskThread'

type GateState =
  | { kind: 'loading' }
  | { kind: 'sign_in' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; moments: E0Moment[] }

export default function E0DeskGate() {
  const authReady = useAuthStore((s) => s.authReady)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const openAuthEntryLogin = useAuthStore((s) => s.openAuthEntryLogin)
  const [state, setState] = useState<GateState>({ kind: 'loading' })

  useEffect(() => {
    if (!authReady) return

    if (!isAuthed) {
      setState({ kind: 'sign_in' })
      openAuthEntryLogin()
      return
    }

    const uid = getFirebaseAuth().currentUser?.uid
    if (!uid || uid !== AGENT_UID) {
      setState({ kind: 'forbidden' })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const token = await getFirebaseAuth().currentUser!.getIdToken()
        const res = await fetch('/api/desk/e0', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (cancelled) return
        if (res.status === 401) {
          setState({ kind: 'sign_in' })
          openAuthEntryLogin()
          return
        }
        if (res.status === 403 || res.status === 404) {
          setState({ kind: 'forbidden' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error', message: `Fixture load failed (${res.status})` })
          return
        }
        const body = (await res.json()) as { moments?: E0Moment[]; isolation?: typeof E0_ISOLATION }
        if (!body.moments?.length) {
          setState({ kind: 'error', message: 'Fixture payload empty' })
          return
        }
        setState({ kind: 'ready', moments: body.moments })
      } catch (err: any) {
        if (!cancelled) {
          setState({ kind: 'error', message: err?.message || 'Fixture load failed' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authReady, isAuthed, openAuthEntryLogin])

  if (state.kind === 'loading') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }} data-e0-gate="loading">
        <p>Checking operator access…</p>
      </main>
    )
  }

  if (state.kind === 'sign_in') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }} data-e0-gate="sign_in">
        <h1>Sign in required</h1>
        <p>E0 production review is limited to the routing admin. Sign in to continue.</p>
        <button type="button" onClick={() => openAuthEntryLogin()}>
          Sign in
        </button>
      </main>
    )
  }

  if (state.kind === 'forbidden') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }} data-e0-gate="forbidden">
        <h1>403</h1>
        <p>This review route is only available to the authenticated routing admin.</p>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }} data-e0-gate="error">
        <h1>Unable to load E0</h1>
        <p>{state.message}</p>
      </main>
    )
  }

  return <E0DeskThread moments={state.moments} />
}
