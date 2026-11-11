'use client'

import { useState } from 'react'
import { desk_savePayoutAccountAndPay } from '@/lib/transactions/clientFunctions'
import { getPayoutBanks } from '@/config/payoutBanks'
import styles from './DeskPayoutAccountForm.module.css'

import { formatDeskMajorZar } from '@/lib/desk/deskMoneyFormat'

function formatZar(n: number): string {
  return formatDeskMajorZar(n)
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
    const holder = accountHolderName.trim()
    const number = accountNumber.replace(/\s/g, '')
    if (!bankName.trim() || !holder || !/^\d{8,16}$/.test(number)) {
      setError('Check bank, account holder, and account number.')
      return
    }
    setSaving(true)
    try {
      const result = await desk_savePayoutAccountAndPay({
        bankName,
        accountHolderName: holder,
        accountNumber: number,
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
      const firebaseErr = err as { code?: string; message?: string; details?: unknown }
      const code = String(firebaseErr?.code || '')
      const raw = String(firebaseErr?.message || '').trim()
      const looksGeneric =
        !raw ||
        /^internal$/i.test(raw) ||
        /^functions\/internal$/i.test(raw) ||
        code === 'functions/internal'
      setError(
        looksGeneric
          ? 'Payout failed — try again in a moment.'
          : raw.replace(/^functions\//, '')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.card}>
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
              placeholder="1055972319"
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
