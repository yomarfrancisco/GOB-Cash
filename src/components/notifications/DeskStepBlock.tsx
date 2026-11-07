'use client'

import { useState } from 'react'
import styles from './DeskStepBlock.module.css'

export type DeskLedgerRow = {
  label: string
  value: string
  valueStrong?: boolean
  secondLine?: string
  copyable?: boolean
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function DeskStepBlock({ rows }: { rows: DeskLedgerRow[] }) {
  const list = (rows || []).slice(0, 8)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  if (!list.length) return null

  return (
    <div className={styles.card}>
      {list.map((row, index) => {
        const key = `${row.label}-${row.value}-${index}`
        return (
          <div
            key={key}
            className={[styles.row, index === list.length - 1 ? styles.rowLast : '']
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.label}>{row.label}</span>
            <div className={styles.valueCol}>
              <span className={row.valueStrong ? styles.valueStrong : styles.value}>
                {row.value}
                {row.copyable ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className={styles.copyInline}
                      onClick={(event) => {
                        event.stopPropagation()
                        void copyText(row.value).then((ok) => {
                          if (!ok) return
                          setCopiedKey(key)
                          window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500)
                        })
                      }}
                    >
                      {copiedKey === key ? 'Copied' : 'Copy'}
                    </button>
                  </>
                ) : null}
              </span>
              {row.secondLine ? <span className={styles.second}>{row.secondLine}</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DeskFundExtras({
  steps,
  note,
  noteAlt,
}: {
  steps?: string[]
  note?: string
  noteAlt?: string
}) {
  if (!steps?.length && !note && !noteAlt) return null
  return (
    <div className={styles.fundExtras}>
      {steps?.length ? (
        <ol className={styles.fundSteps}>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {note ? <p className={styles.fundNote}>{note}</p> : null}
      {noteAlt ? <p className={styles.fundNoteAlt}>{noteAlt}</p> : null}
    </div>
  )
}
