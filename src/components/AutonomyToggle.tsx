'use client'

import { useCallback } from 'react'
import { useWalletMode } from '@/state/walletMode'

type Props = {
  className?: string
  onChange?: (mode: 'autonomous' | 'manual') => void // future-friendly
}

export default function AutonomyToggle({ className, onChange }: Props) {
  const { mode, setMode } = useWalletMode()

  const update = useCallback(
    (m: 'autonomous' | 'manual') => {
      setMode(m)
      onChange?.(m)

      if (process.env.NEXT_PUBLIC_DEV_PROFILE_TOGGLE_LOGS === '1') {
        console.log('[AutonomyToggle] mode:', m)
      }
    },
    [setMode, onChange]
  )

  // a11y: tablist + tabs, arrow keys + space/enter
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      update(mode === 'autonomous' ? 'manual' : 'autonomous')
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Wallet Control Mode"
      className={`autonomy-toggle ${className || ''}`}
      tabIndex={0}
      onKeyDown={onKey}
    >
      <button
        role="tab"
        aria-selected={mode === 'autonomous'}
        className={`seg ${mode === 'autonomous' ? 'seg--active' : ''}`}
        onClick={() => update('autonomous')}
      >
        Autonomous
      </button>
      <button
        role="tab"
        aria-selected={mode === 'manual'}
        className={`seg ${mode === 'manual' ? 'seg--active' : ''}`}
        onClick={() => update('manual')}
      >
        Manual
      </button>
    </div>
  )
}

