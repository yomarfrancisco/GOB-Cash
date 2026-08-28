'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { useAuthStore } from '@/store/auth'
import { fetchCashPayee, type CashPayee } from '@/lib/cashPayee'
import { normalizeCashHandle, saveCashPayIntent } from '@/lib/agentCashQr'
import styles from './CashPayLanding.module.css'

export default function CashPayLanding({ handleParam }: { handleParam: string }) {
  const router = useRouter()
  const handle = normalizeCashHandle(handleParam)
  const authReady = useAuthStore((s) => s.authReady)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const openAuthEntryLogin = useAuthStore((s) => s.openAuthEntryLogin)
  const [payee, setPayee] = useState<CashPayee | null>(null)

  useEffect(() => {
    if (!handle) return
    let cancelled = false
    fetchCashPayee(handle)
      .then((result) => {
        if (!cancelled) setPayee(result)
      })
      .catch(() => {
        if (!cancelled) setPayee({ handle, displayName: null, avatarUrl: null })
      })
    return () => {
      cancelled = true
    }
  }, [handle])

  useEffect(() => {
    if (!authReady || !isAuthed || !handle) return
    saveCashPayIntent(handle)
    router.replace(`/?cash=${encodeURIComponent(handle)}`)
  }, [authReady, isAuthed, handle, router])

  const goToPay = () => {
    if (!handle) return
    saveCashPayIntent(handle)
    if (isAuthed) {
      router.replace(`/?cash=${encodeURIComponent(handle)}`)
      return
    }
    openAuthEntryLogin()
  }

  const titleHandle = handle ? `@${handle}` : 'Cash ID'
  const waitingForAuth = authReady && isAuthed

  return (
    <div className="app-shell">
      <div className="mobile-frame">
        <div className={styles.root}>
          <div className={styles.main}>
            <div className={styles.eyebrow}>Cash ID</div>
            <Avatar
              handle={titleHandle}
              name={payee?.displayName || undefined}
              avatarUrl={payee?.avatarUrl}
              size={96}
              rounded={48}
            />
            <h1 className={styles.handle}>{titleHandle}</h1>
            {payee?.displayName ? <p className={styles.name}>{payee.displayName}</p> : null}
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.continue}
              onClick={goToPay}
              disabled={!handle || !authReady || waitingForAuth}
            >
              {!authReady ? 'Loading…' : waitingForAuth ? 'Opening…' : `Pay ${titleHandle}`}
            </button>
            <p className={styles.hint}>
              {!authReady
                ? 'Checking your account…'
                : isAuthed
                  ? 'Continue to enter an amount.'
                  : 'Sign in or create an account to pay this Cash ID.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
