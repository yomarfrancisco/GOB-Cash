'use client'

import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import Image from 'next/image'
import { Check, Loader2 } from 'lucide-react'
import styles from './CashSafetyModal.module.css'

type CashSafetyModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  dealerHandle: string
  pinCode: string
  amount: number
}

export default function CashSafetyModal({
  open,
  onClose,
  onConfirm,
  dealerHandle,
  pinCode,
  amount,
}: CashSafetyModalProps) {
  const [step1Done, setStep1Done] = useState(false)
  const [step2Done, setStep2Done] = useState(false)
  const [step3Done, setStep3Done] = useState(false)

  // Reset and animate steps when modal opens
  useEffect(() => {
    if (!open) {
      // Reset when closing
      setStep1Done(false)
      setStep2Done(false)
      setStep3Done(false)
      return
    }

    // Step 1: immediately (dealer already arrived)
    setStep1Done(true)

    // Step 2: after 500ms
    const timer2 = setTimeout(() => {
      setStep2Done(true)
    }, 500)

    // Step 3: after another 500ms
    const timer3 = setTimeout(() => {
      setStep3Done(true)
    }, 1000)

    return () => {
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }, [open])

  const formatAmount = (amt: number) => {
    return `R${amt.toLocaleString('en-ZA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const canConfirm = step1Done && step2Done && step3Done

  if (!open) return null

  // Render as portal to ensure it's on top of everything
  if (typeof window === 'undefined') return null

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        {/* Close button */}
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <Image src="/assets/clear.svg" alt="" width={18} height={18} />
        </button>

        {/* Title */}
        <h2 className={styles.title}>
          Deposit cash safely with PIN {pinCode}
        </h2>

        {/* Steps */}
        <div className={styles.stepsContainer}>
          {/* Step 1 */}
          <div className={styles.step}>
            <div className={styles.stepIcon}>
              {step1Done ? (
                <Check className={styles.checkIcon} size={20} />
              ) : (
                <Loader2 className={styles.loaderIcon} size={20} />
              )}
            </div>
            <div className={styles.stepContent}>
              <div className={styles.stepTitle}>Meet with {dealerHandle}</div>
              <div className={styles.stepSubtext}>You&apos;ll be notified when they&apos;ve arrived</div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={styles.step}>
            <div className={styles.stepIcon}>
              {step2Done ? (
                <Check className={styles.checkIcon} size={20} />
              ) : (
                <Loader2 className={styles.loaderIcon} size={20} />
              )}
            </div>
            <div className={styles.stepContent}>
              <div className={styles.stepTitle}>Say &quot;{pinCode}&quot;</div>
              <div className={styles.stepSubtext}>To verify your deposit</div>
            </div>
          </div>

          {/* Step 3 */}
          <div className={styles.step}>
            <div className={styles.stepIcon}>
              {step3Done ? (
                <Check className={styles.checkIcon} size={20} />
              ) : (
                <Loader2 className={styles.loaderIcon} size={20} />
              )}
            </div>
            <div className={styles.stepContent}>
              <div className={styles.stepTitle}>Give {formatAmount(amount)} cash to your dealer</div>
              <div className={styles.stepSubtext}>Confirm you gave the full amount</div>
            </div>
          </div>
        </div>

        {/* Confirm button */}
        <button
          className={`${styles.confirmButton} ${canConfirm ? styles.confirmButtonEnabled : styles.confirmButtonDisabled}`}
          onClick={canConfirm ? onConfirm : undefined}
          disabled={!canConfirm}
          type="button"
        >
          Confirm cash was deposited
        </button>
      </div>
    </div>,
    document.body
  )
}

