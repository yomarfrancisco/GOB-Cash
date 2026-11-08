'use client'

import { useState } from 'react'
import { desk_savePayoutAccountAndPay } from '@/lib/transactions/clientFunctions'
import { getPayoutBanks } from '@/config/payoutBanks'
import styles from './DeskPayoutAccountForm.module.css'

function formatZar(n: number): string {
  return `R${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DeskPayoutAccountForm({ zarAmount }: { zarAmount: number }) {
  const saBanks = getPayoutBanks('South Africa')
  const [bankName, setBankName] = useState(saBanks[0]?.name || 'Capitec')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountType, setAccountType] = useState('Business current')
  const [autoPayout, setAutoPayout] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payout account.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Once only</p>
        <h3 className={styles.title}>Your payout account</h3>
        <p className={styles.subtitle}>Where your liquid ZAR goes. Must be in your company&apos;s name.</p>

        <div className={styles.fields}>
          <label className={styles.field}>
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

          <label className={styles.field}>
            <span className={styles.label}>Account holder</span>
            <input
              className={styles.input}
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              placeholder="ECONOMETRICA (PTY) LTD"
              autoComplete="organization"
            />
          </label>

          <label className={styles.field}>
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

          <label className={styles.field}>
            <span className={styles.label}>Account type</span>
            <input
              className={styles.input}
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              placeholder="Business current"
            />
          </label>

          <div className={styles.autoRow}>
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

      <button
        type="button"
        className={styles.saveButton}
        disabled={saving}
        onClick={(event) => {
          event.stopPropagation()
          void onSave()
        }}
      >
        {saving ? 'Saving…' : `Save and pay out ${formatZar(zarAmount)}`}
      </button>
    </div>
  )
}
