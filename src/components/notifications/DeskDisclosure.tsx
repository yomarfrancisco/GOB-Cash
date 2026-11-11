'use client'

import { useState, type ReactNode } from 'react'
import styles from './DeskDisclosure.module.css'

/** Text disclosure that expands in place under a desk message. */
export function DeskDisclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {label} <span className={styles.chev} aria-hidden>{open ? '⌃' : '⌄'}</span>
      </button>
      {open ? <div className={styles.panel}>{children}</div> : null}
    </div>
  )
}
