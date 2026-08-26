'use client'

import { useState } from 'react'
import ActionSheet from './ActionSheet'
import { getFirebaseAuth } from '@/lib/firebase'
import { useNotificationStore } from '@/store/notifications'
import '@/styles/send-details-sheet.css'

type ComplianceVerifySheetProps = {
  open: boolean
  onClose: () => void
  kycStatus?: string | null
}

export default function ComplianceVerifySheet({ open, onClose, kycStatus }: ComplianceVerifySheetProps) {
  const [busy, setBusy] = useState(false)

  const startVerification = async () => {
    if (busy) return
    const user = getFirebaseAuth().currentUser
    if (!user) {
      useNotificationStore.getState().pushNotification({
        kind: 'payment_failed',
        title: 'Sign in required',
        body: 'Sign in to complete identity verification.',
        actor: { type: 'system', name: 'MozPay' },
      })
      return
    }

    setBusy(true)
    try {
      const token = await user.getIdToken()
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
        throw new Error(data?.error || 'Unable to start verification')
      }

      const { DiditSdk } = await import('@didit-protocol/sdk-web')
      DiditSdk.shared.onComplete = (result) => {
        // UI hint only — the signed webhook is the source of truth.
        if (result.type === 'completed') {
          useNotificationStore.getState().pushNotification({
            kind: 'proof_of_payment',
            title: 'Verification submitted',
            body: 'We’ll update Compliance when Didit returns a decision.',
            actor: { type: 'system', name: 'MozPay' },
          })
        }
      }
      onClose()
      DiditSdk.shared.startVerification({ url: data.url })
    } catch (error: any) {
      useNotificationStore.getState().pushNotification({
        kind: 'payment_failed',
        title: 'Verification unavailable',
        body: String(error?.message || 'Unable to start verification.'),
        actor: { type: 'system', name: 'MozPay' },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ActionSheet open={open} onClose={onClose} title="" className="send-details" size="tall">
      <div className="send-details-sheet">
        <div className="send-details-header" />
        <div style={{ padding: '0 24px 24px' }}>
          <div className="send-details-label" style={{ marginBottom: 12 }}>
            Identity verification
          </div>
          <p style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.4, color: '#0a0a0a', margin: '0 0 24px' }}>
            {kycStatus === 'approved'
              ? 'Your identity is already verified. You can run the check again if Didit asks you to refresh KYC.'
              : kycStatus === 'pending_review'
                ? 'Didit is reviewing your submission. You can start a new check if you were asked to resubmit.'
                : 'To complete compliance, we verify your identity with Didit. You’ll photograph an ID and complete a liveness check. The result is stored on your MozPay profile. Continue only if you agree to share those details with Didit for this check.'}
          </p>
          <button
            className="send-details-pay"
            type="button"
            onClick={startVerification}
            disabled={busy}
            style={{
              width: '100%',
              maxWidth: '382px',
              height: '56px',
              borderRadius: '56px',
              background: '#FF2D55',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 24px',
              fontSize: '16px',
              fontWeight: 500,
              letterSpacing: '-0.32px',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
              border: 0,
            }}
          >
            {busy ? 'Starting…' : kycStatus === 'approved' ? 'Verify again' : 'Continue'}
          </button>
        </div>
      </div>
    </ActionSheet>
  )
}
