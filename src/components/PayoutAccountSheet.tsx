'use client'

import { useEffect, useState } from 'react'
import ActionSheet from './ActionSheet'
import { usePayoutAccountSheet } from '@/store/usePayoutAccountSheet'
import { desk_savePayoutAccountAndPay } from '@/lib/transactions/clientFunctions'
import { getPayoutBanks } from '@/config/payoutBanks'
import styles from './PayoutAccountSheet.module.css'

function formatZar(n: number): string {
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PayoutAccountSheet() {
  const { isOpen, zarAmount, close } = usePayoutAccountSheet()
  const saBanks = getPayoutBanks('South Africa')
  const [bankName, setBankName] = useState(saBanks[0]?.name || 'Capitec Business')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountType, setAccountType] = useState('Business current')
  const [autoPayout, setAutoPayout] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSaving(false)
    setAutoPayout(true)
    setBankName(getPayoutBanks('South Africa')[0]?.name || 'Capitec Business')
    setAccountHolderName('')
    setAccountNumber('')
    setAccountType('Business current')
  }, [isOpen])

  const onSave = async () => {
    if (saving) return
    setError(null)
    setSaving(true)
    try {
      const result = await desk_savePayoutAccountAndPay({
        bankName,
        accountHolderName,
        accountNumber,
        accountType,
        autoPayout,
      })
      if (!result.ok) {
        setError(
          result.skipped === 'invalid_fields'
            ? 'Check bank, account holder, and account number.'
            : `Could not pay out (${result.skipped || 'retry'}).`
        )
        return
      }
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payout account.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ActionSheet open={isOpen} title="Your payout account" onClose={close} size="tall">
      <div className={styles.sheetContainer}>
        <div className={styles.scrollableContent}>
          <p className={styles.eyebrow}>Once only</p>
          <h2 className={styles.title}>Your payout account</h2>
          <p className={styles.subtitle}>Where your liquid ZAR goes. Must be in your company&apos;s name.</p>

          <div className={styles.form}>
            <label className={styles.fieldGroup}>
              <span className={styles.label}>Bank</span>
              <select
                className={styles.input}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              >
                {saBanks.map((bank) => (
                  <option key={bank.name} value={bank.name}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Account holder</span>
              <input
                className={styles.input}
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="ECONOMETRICA (PTY) LTD"
                autoComplete="organization"
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Account number</span>
              <input
                className={styles.input}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                inputMode="numeric"
                placeholder="1055902139"
                autoComplete="off"
              />
            </label>

            <label className={styles.fieldGroup}>
              <span className={styles.label}>Account type</span>
              <input
                className={styles.input}
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                placeholder="Business current"
              />
            </label>

            <div className={styles.autoCard}>
              <div className={styles.autoCopy}>
                <span className={styles.autoTitle}>Pay out automatically</span>
                <span className={styles.autoSub}>As soon as ZAR is liquid</span>
              </div>
              <button
                type="button"
                className={[styles.toggle, autoPayout ? styles.toggleOn : ''].filter(Boolean).join(' ')}
                aria-pressed={autoPayout}
                aria-label="Pay out automatically"
                onClick={() => setAutoPayout((v) => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.saveButton}
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : `Save and pay out ${formatZar(zarAmount)}`}
          </button>
        </div>
      </div>
    </ActionSheet>
  )
}
