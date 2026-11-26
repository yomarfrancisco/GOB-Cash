'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { useAiFabHighlightStore } from '@/state/aiFabHighlight'
import { useAuthStore } from '@/store/auth'
import { CHARACTERS } from '@/lib/demo/templates/characters'
import { prefetchAuthImages } from '@/lib/prefetchAuthImages'
import { useNotificationsStore } from '@/state/notifications'
import { useDeskChromeStore } from '@/store/deskChrome'
import '@/styles/bottom-glass.css'

interface BottomGlassBarProps {
  currentPath?: string
  /** Optional override. Default: open the routing desk. */
  onDollarClick?: () => void
  onRequestAgent?: () => void // Deprecated: no longer used, kept for backward compatibility
  conversionDestination?: 'ZAR' | 'MZN'
}

export default function BottomGlassBar({ currentPath = '/', onDollarClick }: BottomGlassBarProps) {
  const router = useRouter()
  const isHome = currentPath === '/'
  const { isAuthed, requireAuth } = useAuthStore()
  const openNotifications = useNotificationsStore((state) => state.openNotifications)
  const isHighlighted = useAiFabHighlightStore((state) => state.isHighlighted)
  const lastAvatar = useAiFabHighlightStore((state) => state.lastAvatar)

  const openRoutingDesk = () => {
    if (!isHome) {
      router.replace('/')
    }
    // $ always opens Desk mode (lamp selected).
    useDeskChromeStore.getState().resetToDesk()
    openNotifications()
  }

  const handleCenterButtonClick = () => {
    if (onDollarClick) {
      onDollarClick()
      return
    }

    // Auth only — never auto-open the desk after signup/sign-in.
    // Desk opens only from an intentional $ tap while already signed in.
    if (!isAuthed) {
      requireAuth(() => {})
      return
    }

    openRoutingDesk()
  }

  const fab = (
    <div className="dollar-sign-container" style={{ position: 'relative' }}>
      <button
        className={clsx('dollar-sign-contained', 'fab-dollar', {
          'is-manual': isAuthed,
          'is-autonomous': !isAuthed,
          'fab-highlighted': isHighlighted,
        })}
        aria-label="Open FX desk"
        onClick={handleCenterButtonClick}
        onMouseEnter={() => {
          if (!isAuthed) prefetchAuthImages()
        }}
        onTouchStart={() => {
          if (!isAuthed) prefetchAuthImages()
        }}
        type="button"
      >
        <div className="fab-content-base">
          <Image
            src="/assets/core/dollar-sign2.png"
            alt="FX desk"
            width={60}
            height={60}
            className="fab-dollar-icon"
            sizes="60px"
            quality={92}
            priority
          />
        </div>
        <div
          className={clsx('fab-content-overlay', {
            'fab-content-overlay--visible': isHighlighted,
          })}
        >
          <div className="fab-avatar-container">
            <Image
              src={lastAvatar || CHARACTERS.ama.avatar}
              alt="FAB avatar"
              width={72}
              height={72}
              className="fab-avatar-image"
              unoptimized
            />
          </div>
        </div>
      </button>
      <div className="nav-label" aria-hidden="true" />
    </div>
  )

  return (
    <div className="bottom-menu">
      <div className="bottomBarFrame">
        <div className="bottom-glass-wrapper bottom-glass-wrapper-mobile">
          <div className="bottom-glass-offset">
            <Image
              src="/assets/core/glass-bottom-2.png"
              alt=""
              className="bottom-glass-texture"
              width={700}
              height={600}
              unoptimized
            />
          </div>
        </div>
        <div className="nav-container nav-container-mobile">{fab}</div>
      </div>
      <div className="bottom-menu-container bottom-menu-container-desktop">
        <div className="bottom-glass-wrapper bottom-glass-wrapper-desktop">
          <Image
            src="/assets/core/glass-bottom-2.png"
            alt=""
            className="bottom-glass-texture"
            width={700}
            height={600}
            unoptimized
          />
        </div>
        <div className="nav-container nav-container-desktop">{fab}</div>
      </div>
    </div>
  )
}
