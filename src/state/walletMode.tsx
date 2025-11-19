'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useNotificationStore } from '@/store/notifications'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'

export type WalletMode = 'autonomous' | 'manual'

const STORAGE_KEY = 'gb.walletMode'

interface WalletModeContextType {
  mode: WalletMode
  setMode: (mode: WalletMode) => void
}

const WalletModeContext = createContext<WalletModeContextType | undefined>(undefined)

export function WalletModeProvider({ children }: { children: ReactNode }) {
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const triggerAiFabHighlight = useAiFabHighlightStore((state) => state.triggerAiFabHighlight)

  // Initialize from localStorage synchronously - default to 'manual'
  const [mode, setModeState] = useState<WalletMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'manual' || stored === 'autonomous') {
        return stored
      }
      // Default to 'manual' if no stored value
      localStorage.setItem(STORAGE_KEY, 'manual')
      return 'manual'
    }
    return 'manual'
  })

  // Update DOM dataset whenever mode changes (for CSS)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.dataset.walletMode = mode
    }
  }, [mode])

  // Persist to localStorage and update DOM dataset, trigger notification
  const setMode = useCallback(
    (newMode: WalletMode) => {
      const oldMode = mode
      setModeState(newMode)
      try {
        localStorage.setItem(STORAGE_KEY, newMode)
        if (typeof window !== 'undefined') {
          document.documentElement.dataset.walletMode = newMode
        }

        // Fire integrated notification when mode changes
        if (oldMode !== newMode) {
          pushNotification({
            kind: 'mode-change',
            title: newMode === 'manual' ? 'Manual mode enabled' : 'Autonomous mode enabled',
            body:
              newMode === 'manual'
                ? 'Cards will only animate when you interact.'
                : 'Cards may animate automatically.',
            actor: {
              type: 'user',
            },
          })

          // Trigger FAB highlight animation when switching to autonomous mode
          if (newMode === 'autonomous' && oldMode === 'manual') {
            triggerAiFabHighlight({
              reason: 'Community wallet enabled',
              amountZar: undefined,
            })
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    },
    [mode, pushNotification, triggerAiFabHighlight]
  )

  // Listen for storage events (cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (e.newValue === 'autonomous' || e.newValue === 'manual') {
          setModeState(e.newValue)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <WalletModeContext.Provider value={{ mode, setMode }}>
      {children}
    </WalletModeContext.Provider>
  )
}

export function useWalletMode() {
  const context = useContext(WalletModeContext)
  if (context === undefined) {
    throw new Error('useWalletMode must be used within WalletModeProvider')
  }
  return context
}

